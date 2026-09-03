export type HostSize = { width: number; height: number };

export type HostReadyOptions = {
  minSize?: number;
  timeoutMs?: number;
  isHidden?: () => boolean;
  nowMs?: () => number;
  waitFrame?: () => Promise<void>;
};

export function hostHasSize(size: HostSize, minSize = 8): boolean {
  return size.width >= minSize && size.height >= minSize;
}

function defaultWaitFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 16);
    }
  });
}

/**
 * Wait until the AR host has a real layout and the page is visible.
 * Returns false on timeout so Place can still start (native has its own gate).
 */
export async function whenArHostReady(
  measure: () => HostSize,
  opts: HostReadyOptions = {},
): Promise<boolean> {
  const minSize = opts.minSize ?? 8;
  const timeoutMs = opts.timeoutMs ?? 1200;
  const isHidden = opts.isHidden ?? (() => false);
  const nowMs = opts.nowMs ?? (() => Date.now());
  const waitFrame = opts.waitFrame ?? defaultWaitFrame;

  const deadline = nowMs() + timeoutMs;
  for (;;) {
    if (!isHidden() && hostHasSize(measure(), minSize)) return true;
    if (nowMs() >= deadline) {
      return !isHidden() && hostHasSize(measure(), minSize);
    }
    await waitFrame();
  }
}

export function isDocumentHidden(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}
