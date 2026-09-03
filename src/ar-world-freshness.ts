/** Pause longer than this means the AR world map is untrustworthy. */
export const AR_STALE_PAUSE_MS = 20_000;

/** Host-side start lease — permission + install + first camera/model ready. */
export const AR_START_LEASE_MS = 14_000;

export const AR_START_LEASE_EXPIRED = "AR start lease expired.";

export type ArWorldClock = { now: () => number };

export function isStalePause(
  pausedAt: number | null | undefined,
  now: number,
  thresholdMs: number = AR_STALE_PAUSE_MS,
): boolean {
  if (pausedAt == null) return false;
  return now - pausedAt >= thresholdMs;
}

export type ArWorldLease = {
  generation: () => number;
  begin: () => number;
  isCurrent: (gen: number) => boolean;
  end: () => void;
  notePaused: (at?: number) => void;
  resumeNeedsReset: (at?: number) => boolean;
  noteResumed: (at?: number) => { reset: boolean };
  runExclusive: <T>(fn: () => Promise<T>) => Promise<T>;
  withLease: <T>(work: Promise<T>, ms?: number) => Promise<T>;
};

export function createArWorldLease(opts?: {
  startLeaseMs?: number;
  stalePauseMs?: number;
  clock?: ArWorldClock;
}): ArWorldLease {
  const clock = opts?.clock ?? { now: () => Date.now() };
  const startLeaseMs = opts?.startLeaseMs ?? AR_START_LEASE_MS;
  const stalePauseMs = opts?.stalePauseMs ?? AR_STALE_PAUSE_MS;

  let gen = 0;
  let live = false;
  let pausedAt: number | null = null;
  let tail: Promise<void> = Promise.resolve();

  return {
    generation: () => gen,
    begin: () => {
      gen += 1;
      live = true;
      pausedAt = null;
      return gen;
    },
    isCurrent: (g: number) => live && g === gen,
    end: () => {
      live = false;
      pausedAt = null;
      gen += 1;
    },
    notePaused: (at?: number) => {
      if (!live) return;
      pausedAt = at ?? clock.now();
    },
    resumeNeedsReset: (at?: number) =>
      live && isStalePause(pausedAt, at ?? clock.now(), stalePauseMs),
    noteResumed: (at?: number) => {
      const reset = live && isStalePause(pausedAt, at ?? clock.now(), stalePauseMs);
      pausedAt = null;
      return { reset };
    },
    runExclusive: <T>(fn: () => Promise<T>) => {
      const prev = tail;
      let release = () => {};
      tail = new Promise<void>((resolve) => {
        release = resolve;
      });
      return prev.catch(() => undefined).then(fn).finally(() => {
        release();
      });
    },
    withLease: <T>(work: Promise<T>, ms = startLeaseMs) =>
      new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(AR_START_LEASE_EXPIRED));
        }, ms);
        work.then(
          (value) => {
            clearTimeout(timer);
            resolve(value);
          },
          (err: unknown) => {
            clearTimeout(timer);
            reject(err);
          },
        );
      }),
  };
}
