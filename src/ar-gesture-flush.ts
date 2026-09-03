/** One rAF of rotate/scale/move so the Capacitor bridge is not flooded. */

export type ArNorm = { x: number; y: number };

export type ArGestureSink = {
  rotate?: (dx: number, dy: number) => void;
  scale?: (factor: number) => void;
  move?: (x: number, y: number) => void;
};

export type ArRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  return Math.min(1, Math.max(0, n));
}

/** Overlay-local 0–1 hit. Empty/zero rect falls back to the view center. */
export function arPointerNorm(
  clientX: number,
  clientY: number,
  rect: ArRect | null | undefined,
): ArNorm {
  const w = rect?.width ?? 0;
  const h = rect?.height ?? 0;
  if (w < 1 || h < 1) return { x: 0.5, y: 0.5 };
  return {
    x: clamp01((clientX - rect!.left) / w),
    y: clamp01((clientY - rect!.top) / h),
  };
}

/** View pixels from an overlay rect (Cube ARCore path). */
export function arViewPx(
  clientX: number,
  clientY: number,
  rect: Pick<ArRect, "left" | "top"> | null | undefined,
  dpr = 1,
): ArNorm {
  const left = rect?.left ?? 0;
  const top = rect?.top ?? 0;
  const scale = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  return {
    x: (clientX - left) * scale,
    y: (clientY - top) * scale,
  };
}

export async function arTapCatch(
  tap: (x: number, y: number) => Promise<{ placed: boolean }>,
  x: number,
  y: number,
): Promise<{ placed: boolean }> {
  try {
    return await tap(x, y);
  } catch {
    return { placed: false };
  }
}

function defaultRaf(cb: () => void): number {
  if (typeof requestAnimationFrame === "function") return requestAnimationFrame(cb);
  return setTimeout(cb, 16) as unknown as number;
}

function defaultCancel(id: number): void {
  if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(id);
  else clearTimeout(id);
}

export function createArGestureFlush(
  sink: ArGestureSink,
  raf: (cb: () => void) => number = defaultRaf,
  cancel: (id: number) => void = defaultCancel,
) {
  let rot = { dx: 0, dy: 0 };
  let scale: number | null = null;
  let move: ArNorm | null = null;
  let rafId = 0;
  let blocked = false;

  const flush = () => {
    rafId = 0;
    if (blocked) {
      rot = { dx: 0, dy: 0 };
      scale = null;
      move = null;
      return;
    }
    if (rot.dx !== 0 || rot.dy !== 0) {
      const dx = rot.dx;
      const dy = rot.dy;
      rot = { dx: 0, dy: 0 };
      sink.rotate?.(dx, dy);
    }
    if (scale != null) {
      const next = scale;
      scale = null;
      sink.scale?.(next);
    }
    if (move) {
      const next = move;
      move = null;
      sink.move?.(next.x, next.y);
    }
  };

  const schedule = () => {
    if (rafId) return;
    rafId = raf(flush);
  };

  return {
    setBlocked(next: boolean) {
      blocked = next;
      if (next) {
        rot = { dx: 0, dy: 0 };
        scale = null;
        move = null;
      }
    },
    queueRotate(dx: number, dy: number) {
      if (blocked || !Number.isFinite(dx) || !Number.isFinite(dy)) return;
      rot.dx += dx;
      rot.dy += dy;
      schedule();
    },
    queueScale(factor: number) {
      if (blocked || !Number.isFinite(factor)) return;
      scale = factor;
      schedule();
    },
    queueMove(x: number, y: number) {
      if (blocked || !Number.isFinite(x) || !Number.isFinite(y)) return;
      move = { x, y };
      schedule();
    },
    pending() {
      return { rotate: { ...rot }, scale, move };
    },
    flushNow() {
      if (rafId) {
        cancel(rafId);
        rafId = 0;
      }
      flush();
    },
    dispose() {
      if (rafId) cancel(rafId);
      rafId = 0;
      rot = { dx: 0, dy: 0 };
      scale = null;
      move = null;
    },
  };
}

export type ArGestureFlush = ReturnType<typeof createArGestureFlush>;
