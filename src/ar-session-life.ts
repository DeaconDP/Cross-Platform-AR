/** Pause WebXR work when the tab hides; refresh wake lock on return. */

export type ArSessionLifeHandlers = {
  onHidden?: () => void;
  onVisible?: () => void;
};

export function isDocumentHidden(
  visibilityState: Document["visibilityState"] | undefined = "visible",
): boolean {
  return visibilityState === "hidden";
}

export function bindArSessionLife(handlers: ArSessionLifeHandlers): () => void {
  const onChange = () => {
    if (isDocumentHidden(document.visibilityState)) handlers.onHidden?.();
    else handlers.onVisible?.();
  };
  document.addEventListener("visibilitychange", onChange);
  window.addEventListener("pagehide", onChange);
  window.addEventListener("pageshow", onChange);
  return () => {
    document.removeEventListener("visibilitychange", onChange);
    window.removeEventListener("pagehide", onChange);
    window.removeEventListener("pageshow", onChange);
  };
}

export async function requestScreenWakeLock(): Promise<void> {
  const wakeLock = (
    navigator as Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> };
    }
  ).wakeLock;
  if (!wakeLock || document.visibilityState !== "visible") return;
  try {
    await wakeLock.request("screen");
  } catch {
    /* battery saver / policy */
  }
}
