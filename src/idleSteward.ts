/** Foreground idle pause — distinct from OS background pause. */

export const AR_IDLE_MS = 40_000;

export type ArIdleSteward = {
  noteActivity: () => void;
  dispose: () => void;
  isIdle: () => boolean;
};

export function createArIdleSteward(opts: {
  idleMs?: number;
  onIdle: () => void;
  now?: () => number;
  setTimeoutFn?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeoutFn?: (id: ReturnType<typeof setTimeout>) => void;
}): ArIdleSteward {
  const idleMs = opts.idleMs ?? AR_IDLE_MS;
  const setT = opts.setTimeoutFn ?? setTimeout;
  const clearT = opts.clearTimeoutFn ?? clearTimeout;
  let timer: ReturnType<typeof setTimeout> | 0 = 0;
  let idle = false;
  let disposed = false;

  const arm = () => {
    if (disposed) return;
    if (timer) clearT(timer);
    timer = setT(() => {
      timer = 0;
      if (disposed || idle) return;
      idle = true;
      opts.onIdle();
    }, idleMs);
  };

  arm();

  return {
    noteActivity: () => {
      if (disposed) return;
      idle = false;
      arm();
    },
    dispose: () => {
      disposed = true;
      if (timer) clearT(timer);
      timer = 0;
    },
    isIdle: () => idle,
  };
}
