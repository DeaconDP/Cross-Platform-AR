import { Capacitor } from "@capacitor/core";
import { CubeAR } from "cube-ar";
import { CUBE_COLOR_HEX, CUBE_SIZE, startPreview, stopPreview } from "./scene";
import { platformFromCapacitor, screenToNativeTap } from "./ar-coords";
import {
  type CompatSnapshot,
  DebugCollector,
  resetDebugOverlay,
  wireDebugToggle,
} from "./ar-debug";
import type { OverlayElements } from "./ar-webxr";

export { nativeARErrorMessage } from "./ar-errors";

export async function isNativeARSupported(): Promise<{
  supported: boolean;
  backend: "arkit" | "arcore" | "none";
}> {
  if (!Capacitor.isNativePlatform()) {
    return { supported: false, backend: "none" };
  }
  try {
    const result = await CubeAR.isSupported();
    return { supported: result.supported, backend: result.backend };
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

  let lastTrackingKey = "";
  let lastTrackingAt = 0;
  const trackingListener = await CubeAR.addListener("trackingChanged", (event) => {
    const now = performance.now();
    const key = `${event.state}:${event.message ?? ""}`;
    if (key === lastTrackingKey && now - lastTrackingAt < 250) return;
    lastTrackingKey = key;
    lastTrackingAt = now;
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

  let sessionEndedResolve: (() => void) | undefined;
  const sessionEnded = new Promise<void>((resolve) => {
    sessionEndedResolve = resolve;
  });
  const endedHandle = await CubeAR.addListener("sessionEnded", () => {
    sessionEndedResolve?.();
  });

  const tapPlatform = platformFromCapacitor(Capacitor.getPlatform());
  const onTap = async (event: PointerEvent) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest(".ar-exit, .ar-debug-toggle, .ar-debug-col, .ar-debug-rail")) return;

    const coords = screenToNativeTap({
      clientX: event.clientX,
      clientY: event.clientY,
      platform: tapPlatform,
      devicePixelRatio: window.devicePixelRatio || 1,
    });
    try {
      const result = await CubeAR.onScreenTap(coords);
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
    await CubeAR.startSession({
      cubeSizeM: CUBE_SIZE,
      colorHex: CUBE_COLOR_HEX,
    });
    document.body.classList.add("ar-native-active");
    overlay.root.hidden = false;
    await sessionEnded;
  } finally {
    document.removeEventListener("pointerdown", onTap);
    overlay.exit.removeEventListener("click", onExit);
    overlay.exit.disabled = false;
    trackingListener.remove();
    endedHandle.remove();
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
