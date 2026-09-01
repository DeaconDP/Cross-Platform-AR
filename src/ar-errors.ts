function errorText(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

/** Map native plugin rejection messages to actionable user guidance. */
export function nativeARErrorMessage(err: unknown): string {
  const msg = errorText(err);

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

/** Map WebXR request/session failures to visitor-facing copy. */
export function webXRErrorMessage(err: unknown): string {
  const msg = errorText(err);
  if (/NotAllowedError|permission|denied/i.test(msg)) {
    return "Couldn't start WebXR. Allow camera access and try again.";
  }
  if (/NotSupportedError|not supported|immersive-ar/i.test(msg)) {
    return "WebXR AR isn't available in this browser. Try Chrome on an ARCore phone.";
  }
  if (/hit test/i.test(msg)) {
    return "This device can't track surfaces in WebXR. Try Native AR if it's listed.";
  }
  if (/secure|https/i.test(msg)) {
    return "WebXR needs a secure HTTPS page. Accept the certificate warning and reload.";
  }
  return "Couldn't start WebXR. Allow camera access and try again.";
}
