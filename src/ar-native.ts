import { Capacitor } from "@capacitor/core";
import { CubeAR, type CubeARTechnique } from "cube-ar";
import { CUBE_COLOR_HEX, CUBE_SIZE, startPreview, stopPreview } from "./scene";
import {
  type CompatSnapshot,
  DebugCollector,
  resetDebugOverlay,
  wireDebugToggle,
} from "./ar-debug";
import {
  bindArGestures,
  type ArGestureController,
  type OverlayChrome,
} from "./ar-gestures";

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
  if (/depth is not supported/i.test(msg)) {
    return "Depth is not supported on this device.";
  }
  if (/missing image target asset/i.test(msg)) {
    return "The bundled image marker is missing from the app build.";
  }
  if (/no front-facing camera config/i.test(msg)) {
    return "This device has no front camera config for Augmented Faces.";
  }
  if (/android-only \(arcore\)/i.test(msg)) {
    return msg;
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
    const result = await CubeAR.isSupported();
    return { supported: result.supported, backend: result.backend };
  } catch {
    return { supported: false, backend: "none" };
  }
}

function setNativeActive(active: boolean): void {
  document.documentElement.classList.toggle("is-ar-native", active);
  document.body.classList.toggle("is-ar-native", active);
  document.body.classList.toggle("ar-native-active", active);
}

/**
 * Capacitor shell path: ARKit (iOS) or ARCore (Android) below a transparent WebView.
 * Gestures on the web overlay forward to native place / rotate / scale / move.
 */
export async function startNativeAR(
  chrome: OverlayChrome,
  snapshot: CompatSnapshot,
  technique: CubeARTechnique = "place",
): Promise<void> {
  const debug = new DebugCollector(chrome.debugPanel, {
    ...snapshot,
    arPath: "native",
  });
  debug.setSessionMeta({
    domOverlayActive: true,
    hitTestActive: true,
    referenceSpaceType: "native",
  });
  debug.logEvent("native session start");

  resetDebugOverlay(chrome.debugToggle, chrome.debugPanel);
  const unwireDebug = wireDebugToggle(chrome.debugToggle, chrome.debugPanel, debug);

  let placed = false;
  let surfaceReady = false;
  let scale = 1;
  let spawning = false;
  let spawnTimer = 0;
  let gestures: ArGestureController | null = null;

  const trackingListener = await CubeAR.addListener("trackingChanged", (event) => {
    debug.logEvent(`tracking → ${event.state}`);
    if (event.state === "ready") {
      surfaceReady = true;
      if (!placed) {
        gestures?.setHint("TAP A FLAT SURFACE");
      }
    }
    if (event.message && !placed) {
      gestures?.setHint(event.message);
    }
    if (debug.isEnabled()) {
      debug.tickNative({
        tracking: event.state,
        message: event.message ?? "—",
        placed: placed ? 1 : 0,
        backend: snapshot.platform === "ios" ? "arkit" : "arcore",
      });
    }
  });

  const placedListener = await CubeAR.addListener("placed", () => {
    placed = true;
    spawning = true;
    gestures?.setPlacedUi(true);
    debug.logEvent("cube placed");
    window.clearTimeout(spawnTimer);
    spawnTimer = window.setTimeout(() => {
      spawning = false;
    }, 900);
  });

  const sessionEnded = new Promise<void>((resolve) => {
    void CubeAR.addListener("sessionEnded", () => resolve());
  });

  gestures = bindArGestures(chrome, {
    cameraMode: true,
    isPlaced: () => placed,
    isSurfaceReady: () => surfaceReady,
    isSpawning: () => spawning,
    getScale: () => scale,
    setScaleState: (f) => {
      scale = f;
    },
    onTapPlace: async (clientX, clientY) => {
      const dpr = window.devicePixelRatio || 1;
      const isAndroid = Capacitor.getPlatform() === "android";
      try {
        const result = await CubeAR.onScreenTap({
          x: isAndroid ? clientX * dpr : clientX,
          y: isAndroid ? clientY * dpr : clientY,
        });
        if (result.placed) {
          placed = true;
          spawning = true;
          window.clearTimeout(spawnTimer);
          spawnTimer = window.setTimeout(() => {
            spawning = false;
          }, 900);
          debug.logEvent("cube placed");
        }
        return result.placed;
      } catch {
        debug.logEvent("tap failed");
        return false;
      }
    },
    onRotate: (dx, dy) => {
      void CubeAR.rotate({ dx, dy });
    },
    onScale: (factor) => {
      void CubeAR.setScale({ factor });
    },
    onMoveScreen: (clientX, clientY) => {
      const dpr = window.devicePixelRatio || 1;
      const isAndroid = Capacitor.getPlatform() === "android";
      void CubeAR.moveScreen({
        x: isAndroid ? clientX * dpr : clientX,
        y: isAndroid ? clientY * dpr : clientY,
      });
    },
    onReposition: async () => {
      await CubeAR.reposition();
      placed = false;
      scale = 1;
      gestures?.setHint("TAP A FLAT SURFACE");
      debug.logEvent("reposition");
    },
    onRecenter: async () => {
      await CubeAR.recenter();
      debug.logEvent("recenter");
    },
    onExit: async () => {
      try {
        await CubeAR.stopSession();
      } catch {
        // session may already be torn down
      }
    },
  });

  try {
    stopPreview();
    await CubeAR.startSession({
      cubeSizeM: CUBE_SIZE,
      colorHex: CUBE_COLOR_HEX,
      ...(technique !== "place" ? { technique } : {}),
    });
    setNativeActive(true);
    chrome.root.hidden = false;
    await sessionEnded;
  } finally {
    window.clearTimeout(spawnTimer);
    gestures.destroy();
    trackingListener.remove();
    placedListener.remove();
    await CubeAR.removeAllListeners();
    setNativeActive(false);
    unwireDebug();
    resetDebugOverlay(chrome.debugToggle, chrome.debugPanel);
    debug.logEvent("native session end");
    const previewHost = document.getElementById("preview");
    if (previewHost) {
      startPreview(previewHost);
    }
  }
}
