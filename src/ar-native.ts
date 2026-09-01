import { Capacitor } from "@capacitor/core";
import { CubeAR } from "cube-ar";
import { CUBE_COLOR_HEX, CUBE_SIZE, startPreview, stopPreview } from "./scene";
import {
  type CompatSnapshot,
  DebugCollector,
  resetDebugOverlay,
  wireDebugToggle,
} from "./ar-debug";
import { probeArAvailability, withArStartRetry } from "./ar-start";
import type { OverlayElements } from "./ar-webxr";

/** Map native plugin rejection messages to actionable user guidance. */
export function nativeARErrorMessage(err: unknown): string {
  console.error("[CubeAR]", err);

  const msg =
    err instanceof Error
      ? err.message
      : typeof err === "object" && err !== null && "message" in err
        ? String((err as { message: unknown }).message)
        : String(err);

  if (/camera permission denied/i.test(msg)) {
    return "Camera access is required for AR. Open Settings → Apps → Cube AR → Permissions and allow Camera.";
  }
  if (/arcore install declined/i.test(msg)) {
    return "ARCore is required. Install it from the Play Store and try again.";
  }
  if (/arcore is not supported/i.test(msg)) {
    return "ARCore is not supported on this device.";
  }
  if (/register before|LifecycleOwner|attempting to register while current state is RESUMED/i.test(msg)) {
    return "Native AR couldn't initialize the camera session. Force-stop the app and try again.";
  }
  if (/FatalException|SessionPausedException|session is paused/i.test(msg)) {
    return "Native AR couldn't start the camera session. Force-stop the app and try again.";
  }
  if (/camera session timed out/i.test(msg)) {
    return "Native AR couldn't start the camera. Force-stop the app and try again.";
  }
  if (/^Failed to start native AR:/i.test(msg) || /^Failed to prepare ARCore:/i.test(msg)) {
    const detail = msg.replace(/^Failed to (start native AR|prepare ARCore):\s*/i, "").trim();
    if (detail && detail.toLowerCase() !== "null") return detail;
    return "Native AR failed to start. Force-stop the app and try again.";
  }
  if (!msg || msg.toLowerCase() === "null") {
    return "Native AR failed to start. Force-stop the app and try again.";
  }
  return "Native AR failed to start. Try again once; if it persists, reinstall the app.";
}

export async function isNativeARSupported(): Promise<{
  supported: boolean;
  backend: "arkit" | "arcore" | "none";
}> {
  if (!Capacitor.isNativePlatform()) {
    return { supported: false, backend: "none" };
  }
  try {
    let last: { supported: boolean; backend: "arkit" | "arcore" | "none" } = {
      supported: false,
      backend: "none",
    };
    const avail = await probeArAvailability(async () => {
      last = await CubeAR.isSupported();
      return last;
    });
    return { supported: avail.available, backend: last.backend };
  } catch {
    return { supported: false, backend: "none" };
  }
}

/**
 * Capacitor shell path: ARKit (iOS) or ARCore (Android) below a transparent WebView.
 * Screen taps are forwarded from the web overlay to native raycasts.
 */
export async function startNativeAR(
  overlay: OverlayElements,
  snapshot: CompatSnapshot,
): Promise<void> {
  const debug = new DebugCollector(overlay.debugPanel, {
    ...snapshot,
    arPath: "native",
  });
  debug.setSessionMeta({
    domOverlayActive: true,
    hitTestActive: true,
    referenceSpaceType: "native",
  });
  debug.logEvent("native session start");

  resetDebugOverlay(overlay.debugToggle, overlay.debugPanel);
  const unwireDebug = wireDebugToggle(overlay.debugToggle, overlay.debugPanel, debug);

  let placed = 0;
  overlay.count.textContent = "0";
  overlay.hint.hidden = false;
  overlay.hint.textContent = "Move your phone to find a surface";

  const trackingListener = await CubeAR.addListener("trackingChanged", (event) => {
    debug.logEvent(`tracking → ${event.state}`);
    if (event.message && placed === 0) {
      overlay.hint.textContent = event.message;
    }
    if (debug.isEnabled()) {
      debug.tickNative({
        tracking: event.state,
        message: event.message ?? "—",
        placed,
        backend: snapshot.platform === "ios" ? "arkit" : "arcore",
      });
    }
  });

  const sessionEnded = new Promise<void>((resolve) => {
    void CubeAR.addListener("sessionEnded", () => resolve());
  });

  const onTap = async (event: PointerEvent) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest(".ar-exit, .ar-debug-toggle, .ar-debug-col, .ar-debug-rail")) return;

    // ARCore hit-test expects view pixels; CSS client coords need devicePixelRatio.
    const dpr = window.devicePixelRatio || 1;
    try {
      const result = await CubeAR.onScreenTap({
        x: event.clientX * dpr,
        y: event.clientY * dpr,
      });
      if (result.placed) {
        placed = result.count;
        overlay.count.textContent = String(placed);
        overlay.hint.hidden = true;
        debug.logEvent(`cube placed (#${placed})`);
      }
    } catch {
      debug.logEvent("tap failed");
    }
  };

  document.addEventListener("pointerdown", onTap);

  const onExit = async () => {
    overlay.exit.disabled = true;
    try {
      await CubeAR.stopSession();
    } catch {
      // session may already be torn down
    }
  };
  overlay.exit.addEventListener("click", onExit);

  try {
    stopPreview();
    await withArStartRetry(() =>
      CubeAR.startSession({
        cubeSizeM: CUBE_SIZE,
        colorHex: CUBE_COLOR_HEX,
      }),
    );
    document.body.classList.add("ar-native-active");
    overlay.root.hidden = false;
    await sessionEnded;
  } finally {
    document.removeEventListener("pointerdown", onTap);
    overlay.exit.removeEventListener("click", onExit);
    overlay.exit.disabled = false;
    trackingListener.remove();
    await CubeAR.removeAllListeners();
    document.body.classList.remove("ar-native-active");
    unwireDebug();
    resetDebugOverlay(overlay.debugToggle, overlay.debugPanel);
    debug.logEvent("native session end");
    const previewHost = document.getElementById("preview");
    if (previewHost) {
      startPreview(previewHost);
    }
  }
}
