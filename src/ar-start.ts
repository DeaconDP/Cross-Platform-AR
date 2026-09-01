/** Classified native AR start failures — retry only busy/timeout camera races. */

export type ArStartCode =
  | "camera_denied"
  | "needs_install"
  | "unsupported"
  | "camera_busy"
  | "timeout"
  | "cancelled"
  | "failed";

export type ArAvailReason =
  | "supported"
  | "needs_install"
  | "unsupported"
  | "checking"
  | "unknown";

export type ArAvailability = {
  available: boolean;
  reason: ArAvailReason;
};

const CODES: readonly ArStartCode[] = [
  "camera_denied",
  "needs_install",
  "unsupported",
  "camera_busy",
  "timeout",
  "cancelled",
  "failed",
];

const REASONS: readonly ArAvailReason[] = [
  "supported",
  "needs_install",
  "unsupported",
  "checking",
  "unknown",
];

export function isArStartCode(value: string): value is ArStartCode {
  return (CODES as readonly string[]).includes(value);
}

export function isArAvailReason(value: string): value is ArAvailReason {
  return (REASONS as readonly string[]).includes(value);
}

function errParts(err: unknown): { code: string; message: string } {
  if (err && typeof err === "object") {
    const rec = err as { code?: unknown; message?: unknown; errorMessage?: unknown };
    const code = typeof rec.code === "string" ? rec.code : "";
    const message = [rec.message, rec.errorMessage]
      .filter((v) => typeof v === "string")
      .join(" ");
    return { code, message };
  }
  return { code: "", message: err instanceof Error ? err.message : String(err ?? "") };
}

export function classifyArStartError(err: unknown): ArStartCode {
  const { code, message } = errParts(err);
  if (isArStartCode(code)) return code;
  const lower = `${code} ${message}`.toLowerCase();
  if (lower.includes("declined")) return "needs_install";
  if (lower.includes("permission") || lower.includes("camera access")) return "camera_denied";
  if (lower.includes("install") || lower.includes("play services")) return "needs_install";
  if (lower.includes("timed out") || lower.includes("timeout")) return "timeout";
  if (
    lower.includes("busy") ||
    lower.includes("not available") ||
    lower.includes("session paused") ||
    lower.includes("cameranotavailable")
  ) {
    return "camera_busy";
  }
  if (lower.includes("unsupported") || lower.includes("not supported")) return "unsupported";
  return "failed";
}

export function isTransientArStart(code: ArStartCode): boolean {
  return code === "camera_busy" || code === "timeout";
}

export function normalizeArAvailability(raw: {
  available?: boolean;
  supported?: boolean;
  reason?: string;
}): ArAvailability {
  const available = Boolean(raw.available ?? raw.supported);
  const reason = raw.reason && isArAvailReason(raw.reason) ? raw.reason : undefined;
  if (reason) {
    return { available: available || reason === "checking", reason };
  }
  return { available, reason: available ? "supported" : "unsupported" };
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function probeArAvailability(
  probe: () => Promise<{ available?: boolean; supported?: boolean; reason?: string }>,
  opts?: { attempts?: number; delayMs?: number },
): Promise<ArAvailability> {
  const attempts = opts?.attempts ?? 6;
  const delayMs = opts?.delayMs ?? 200;
  let last: ArAvailability = { available: false, reason: "unknown" };
  for (let i = 0; i < attempts; i++) {
    last = normalizeArAvailability(await probe());
    if (last.reason !== "checking" && last.reason !== "unknown") return last;
    if (i < attempts - 1) await sleepMs(delayMs);
  }
  return { available: true, reason: last.reason };
}

export async function withArStartRetry<T>(
  start: () => Promise<T>,
  opts?: { attempts?: number; delayMs?: number },
): Promise<T> {
  const attempts = opts?.attempts ?? 2;
  const delayMs = opts?.delayMs ?? 400;
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await start();
    } catch (err) {
      last = err;
      if (!isTransientArStart(classifyArStartError(err)) || i === attempts - 1) throw err;
      await sleepMs(delayMs * (i + 1));
    }
  }
  throw last;
}
