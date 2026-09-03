export type ArCallKind = "hit" | "tap" | "move" | "stop";

export const AR_CALL_DEADLINE_MS = {
  hit: 1800,
  tap: 1800,
  move: 1800,
  stop: 2500,
} as const;

export type ArCallClock = {
  delay: (ms: number) => Promise<void>;
};

export class ArCallTimeoutError extends Error {
  readonly kind: ArCallKind;
  readonly ms: number;

  constructor(kind: ArCallKind, ms: number) {
    super(`AR ${kind} timed out after ${ms}ms`);
    this.name = "ArCallTimeoutError";
    this.kind = kind;
    this.ms = ms;
  }
}

const defaultClock: ArCallClock = {
  delay: (ms) =>
    new Promise((resolve) => {
      setTimeout(resolve, ms);
    }),
};

export function arCallDeadlineMs(kind: ArCallKind): number {
  return AR_CALL_DEADLINE_MS[kind];
}

export function isArCallTimeout(err: unknown): boolean {
  return (
    err instanceof ArCallTimeoutError ||
    (typeof err === "object" &&
      err !== null &&
      "name" in err &&
      (err as { name: string }).name === "ArCallTimeoutError")
  );
}

export function arCallTimeoutMessage(kind: ArCallKind): string {
  if (kind === "stop") return "";
  return "That tap didn’t register. Try again.";
}

export async function raceArCall<T>(opts: {
  kind: ArCallKind;
  run: () => Promise<T>;
  fallback: T;
  ms?: number;
  clock?: ArCallClock;
}): Promise<{ value: T; timedOut: boolean }> {
  const ms = opts.ms ?? arCallDeadlineMs(opts.kind);
  const clock = opts.clock ?? defaultClock;
  let finished = false;
  try {
    const value = await Promise.race([
      opts.run().then((next) => {
        finished = true;
        return next;
      }),
      clock.delay(ms).then(() => {
        if (finished) return undefined as T;
        throw new ArCallTimeoutError(opts.kind, ms);
      }),
    ]);
    return { value: value as T, timedOut: false };
  } catch (err) {
    if (isArCallTimeout(err)) {
      return { value: opts.fallback, timedOut: true };
    }
    throw err;
  }
}
