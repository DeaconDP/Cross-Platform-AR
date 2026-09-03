/** Phase-aware AR start watchdog — stall on camera/model, wait on permission/install. */

export const START_PHASES = [
  "probe",
  "permission",
  "installing",
  "camera",
  "ready",
] as const;

export type ArStartPhase = (typeof START_PHASES)[number];

export const PHASE_STALL_MS: Record<ArStartPhase, number> = {
  probe: 1_500,
  permission: 120_000,
  installing: 180_000,
  camera: 8_000,
  ready: Number.POSITIVE_INFINITY,
};

export const START_CAP_MS = 180_000;
export const STICKY_SKIP_MS = 45_000;
export const STALL_MESSAGE = "AR start stalled.";
export const STICKY_MESSAGE = "AR start skipped after a recent stall.";
export const PROBE_BUDGET_MS = 1_500;
export const PROBE_MESSAGE = "AR availability check stalled.";

export function parseStartPhase(data: unknown): ArStartPhase | null {
  const raw =
    data && typeof data === "object" && "phase" in data
      ? (data as { phase: unknown }).phase
      : data;
  if (typeof raw !== "string") return null;
  return (START_PHASES as readonly string[]).includes(raw)
    ? (raw as ArStartPhase)
    : null;
}

export function shouldAbortStart(input: {
  phase: ArStartPhase;
  phaseAgeMs: number;
  totalAgeMs: number;
  capMs?: number;
}): { abort: boolean; reason: "stall" | "cap" | null } {
  const cap = input.capMs ?? START_CAP_MS;
  if (input.totalAgeMs >= cap) return { abort: true, reason: "cap" };
  const stall = PHASE_STALL_MS[input.phase];
  if (Number.isFinite(stall) && input.phaseAgeMs >= stall) {
    return { abort: true, reason: "stall" };
  }
  return { abort: false, reason: null };
}

export function nextWatchDelayMs(input: {
  phase: ArStartPhase;
  phaseAgeMs: number;
  totalAgeMs: number;
  capMs?: number;
}): number {
  const cap = input.capMs ?? START_CAP_MS;
  const stall = PHASE_STALL_MS[input.phase];
  const untilCap = Math.max(0, cap - input.totalAgeMs);
  const untilStall = Number.isFinite(stall)
    ? Math.max(0, stall - input.phaseAgeMs)
    : untilCap;
  return Math.max(25, Math.min(untilCap, untilStall));
}

export function isStartStall(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  const lower = msg.toLowerCase();
  return (
    lower.includes("stalled") ||
    lower.includes("skipped after a recent stall")
  );
}

/** Soft = fall through to orbit/WebXR. Hard = surface the error (camera deny). */
export function fallbackAfterStartError(error: unknown): "soft" | "hard" {
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
  if (
    msg.includes("permission") ||
    msg.includes("denied") ||
    msg.includes("camera access")
  ) {
    return "hard";
  }
  if (isStartStall(error) || msg.includes("cancelled")) return "soft";
  return "hard";
}

export class ArStartWatch {
  phase: ArStartPhase = "permission";
  readonly startedAt: number;
  phaseAt: number;

  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
    this.startedAt = this.now();
    this.phaseAt = this.startedAt;
  }

  setPhase(phase: ArStartPhase): void {
    if (phase === this.phase) return;
    this.phase = phase;
    this.phaseAt = this.now();
  }

  snapshot(): {
    phase: ArStartPhase;
    phaseAgeMs: number;
    totalAgeMs: number;
  } {
    const t = this.now();
    return {
      phase: this.phase,
      phaseAgeMs: t - this.phaseAt,
      totalAgeMs: t - this.startedAt,
    };
  }

  verdict(capMs?: number): { abort: boolean; reason: "stall" | "cap" | null } {
    return shouldAbortStart({ ...this.snapshot(), capMs });
  }
}

export class ArNativeSticky {
  failedAtMs: number | null = null;

  private readonly windowMs: number;

  constructor(windowMs = STICKY_SKIP_MS) {
    this.windowMs = windowMs;
  }

  remember(nowMs: number): void {
    this.failedAtMs = nowMs;
  }

  clear(): void {
    this.failedAtMs = null;
  }

  shouldSkip(nowMs: number): boolean {
    if (this.failedAtMs == null) return false;
    return nowMs - this.failedAtMs < this.windowMs;
  }
}

export const nativeSticky = new ArNativeSticky();

function defaultWait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(), ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("aborted"));
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export async function withBudget<T>(
  work: Promise<T>,
  ms: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function runStartWatch<T>(opts: {
  start: () => Promise<T>;
  stop: () => Promise<void>;
  onPhase?: (
    cb: (phase: ArStartPhase) => void,
  ) => Promise<() => void | Promise<void>>;
  sticky?: ArNativeSticky;
  now?: () => number;
  wait?: (ms: number, signal: AbortSignal) => Promise<void>;
}): Promise<T> {
  const now = opts.now ?? Date.now;
  const wait = opts.wait ?? defaultWait;
  const sticky = opts.sticky;
  if (sticky?.shouldSkip(now())) {
    throw new Error(STICKY_MESSAGE);
  }

  const watch = new ArStartWatch(now);
  const ac = new AbortController();
  let unlisten: () => void | Promise<void> = () => undefined;
  if (opts.onPhase) {
    unlisten = await opts.onPhase((phase) => watch.setPhase(phase));
  }

  const stalled = (async () => {
    while (!ac.signal.aborted) {
      const snap = watch.snapshot();
      const verdict = shouldAbortStart(snap);
      if (verdict.abort) throw new Error(STALL_MESSAGE);
      await wait(nextWatchDelayMs(snap), ac.signal);
    }
    throw new Error("aborted");
  })();

  try {
    const result = await Promise.race([opts.start(), stalled]);
    sticky?.clear();
    return result;
  } catch (err) {
    try {
      await opts.stop();
    } catch {
      /* already torn down */
    }
    if (isStartStall(err)) sticky?.remember(now());
    throw err;
  } finally {
    ac.abort();
    try {
      await unlisten();
    } catch {
      /* ignore */
    }
  }
}
