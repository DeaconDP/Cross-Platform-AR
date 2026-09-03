/** Permission + availability + context checks before the camera chrome opens. */

export type ArPermission = "granted" | "prompt" | "denied" | "unknown";

export type ArPreflightInput = {
  permission?: ArPermission;
  available?: boolean;
  installNeeded?: boolean;
  insecure?: boolean;
  cameraBusy?: boolean;
  viewW?: number;
  viewH?: number;
};

export type ArPreflightReason =
  | "denied"
  | "unavailable"
  | "install"
  | "insecure"
  | "busy"
  | "tiny";

export type ArPreflightVerdict =
  | { ok: true; reveal: true }
  | { ok: true; reveal: false; reason: "install" | "prompt"; coach: string }
  | { ok: false; reason: ArPreflightReason; coach: string };

export const AR_PREFLIGHT_COACH: Record<ArPreflightReason | "prompt", string> = {
  denied: "Camera access is needed for AR. Turn it on in Settings.",
  unavailable: "This device can’t run AR.",
  install: "AR needs the free Google Play Services for AR app.",
  insecure: "AR needs a secure page (https or this computer).",
  busy: "The camera is busy. Close the other app and try again.",
  tiny: "AR needs a larger view. Open the app full screen.",
  prompt: "Allow the camera to place in AR.",
};

const TINY = 200;
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export function arIsSecureContext(
  isSecureContext?: boolean,
  protocol?: string,
  hostname?: string,
): boolean {
  if (isSecureContext === true) return true;
  const proto = (protocol ?? "").toLowerCase();
  if (
    proto === "https:" ||
    proto === "capacitor:" ||
    proto === "ionic:" ||
    proto === "file:"
  ) {
    return true;
  }
  const host = (hostname ?? "").toLowerCase();
  if (LOOPBACK.has(host)) return true;
  if (proto === "http:") return false;
  if (isSecureContext === false) return false;
  return true;
}

export function arBrowserFlags(env: {
  isSecureContext?: boolean;
  protocol?: string;
  hostname?: string;
  innerWidth?: number;
  innerHeight?: number;
}): Pick<ArPreflightInput, "insecure" | "viewW" | "viewH"> {
  return {
    insecure: !arIsSecureContext(env.isSecureContext, env.protocol, env.hostname),
    viewW: env.innerWidth,
    viewH: env.innerHeight,
  };
}

export function arJudgePreflight(input: ArPreflightInput): ArPreflightVerdict {
  if (input.insecure) {
    return { ok: false, reason: "insecure", coach: AR_PREFLIGHT_COACH.insecure };
  }
  if (input.cameraBusy) {
    return { ok: false, reason: "busy", coach: AR_PREFLIGHT_COACH.busy };
  }
  if (input.permission === "denied") {
    return { ok: false, reason: "denied", coach: AR_PREFLIGHT_COACH.denied };
  }
  const w = input.viewW ?? 0;
  const h = input.viewH ?? 0;
  if (w > 0 && h > 0 && (w < TINY || h < TINY)) {
    return { ok: false, reason: "tiny", coach: AR_PREFLIGHT_COACH.tiny };
  }
  if (input.available === false && !input.installNeeded) {
    return { ok: false, reason: "unavailable", coach: AR_PREFLIGHT_COACH.unavailable };
  }
  if (input.installNeeded) {
    return { ok: true, reveal: false, reason: "install", coach: AR_PREFLIGHT_COACH.install };
  }
  if (input.permission === "prompt") {
    return { ok: true, reveal: false, reason: "prompt", coach: AR_PREFLIGHT_COACH.prompt };
  }
  return { ok: true, reveal: true };
}

export function arMayRevealCamera(verdict: ArPreflightVerdict): boolean {
  return verdict.ok && verdict.reveal;
}

export function arDeniedCoach(app: "coh" | "origins" | "emily" | "cube"): string {
  if (app === "coh") return "Camera access is needed to place fossils on a table.";
  if (app === "origins") return "Camera access is needed for AR exhibits.";
  if (app === "emily") return "Camera is off for Emily. Open Settings → Emily GPT → Camera.";
  return "Camera access is required for AR. Open Settings → Apps → Cube AR → Permissions and allow Camera.";
}
