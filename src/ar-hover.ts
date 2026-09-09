/** Fine pointer / hover steward — desktop, DeX, ChromeOS, S-Pen.
 *  Does not treat hover as a tap. Precise pointers skip fat-finger slop.
 */

export type ArPointerKind = "touch" | "pen" | "mouse" | "unknown";
export type ArHoverMode = "place" | "scan" | "cubes";

export type ArHoverSnapshot = {
  kind: ArPointerKind;
  hovering: boolean;
  x: number;
  y: number;
  viewX: number;
  viewY: number;
  precise: boolean;
};

export type ArHoverRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

const emptySnap = (): ArHoverSnapshot => ({
  kind: "unknown",
  hovering: false,
  x: 0.5,
  y: 0.5,
  viewX: 0,
  viewY: 0,
  precise: false,
});

export function arClassifyPointer(type: string | undefined | null): ArPointerKind {
  const t = (type ?? "").toLowerCase();
  if (t === "pen") return "pen";
  if (t === "mouse") return "mouse";
  if (t === "touch") return "touch";
  return "unknown";
}

export function arPointerIsPrecise(kind: ArPointerKind): boolean {
  return kind === "pen" || kind === "mouse";
}

export function arHoverCoach(opts: {
  kind: ArPointerKind;
  hovering: boolean;
  placed: boolean;
  mode: ArHoverMode;
}): string | null {
  if (opts.placed) return null;
  if (!arPointerIsPrecise(opts.kind)) return null;
  if (opts.mode === "scan") {
    return opts.hovering
      ? "Keep the plaque in view — the camera finds it."
      : null;
  }
  if (opts.mode === "cubes") {
    return "Point at a surface, then click to place a cube.";
  }
  return "Point at a surface, then click to place.";
}

export function arNormFromClient(
  clientX: number,
  clientY: number,
  rect: ArHoverRect,
): { x: number; y: number } {
  const w = rect.width || 1;
  const h = rect.height || 1;
  return {
    x: Math.min(1, Math.max(0, (clientX - rect.left) / w)),
    y: Math.min(1, Math.max(0, (clientY - rect.top) / h)),
  };
}

/** Left-button mouse, pen tip, or any touch. Hover-only / right-click never place. */
export function arHoverShouldPlace(
  type: string | undefined | null,
  buttons: number,
): boolean {
  const kind = arClassifyPointer(type);
  if (kind === "mouse") return buttons === 0 || buttons === 1;
  if (kind === "pen") return buttons === 0 || buttons === 1;
  return true;
}

export function createArHover(opts?: {
  onChange?: (snap: ArHoverSnapshot) => void;
  schedule?: (cb: () => void) => number;
  cancel?: (id: number) => void;
}) {
  let armed = false;
  let snap = emptySnap();
  let raf = 0;
  let pending: {
    clientX: number;
    clientY: number;
    type: string;
    rect: ArHoverRect;
  } | null = null;
  const schedule = opts?.schedule ?? ((cb) => requestAnimationFrame(cb));
  const cancel = opts?.cancel ?? ((id) => cancelAnimationFrame(id));

  const emit = (next: ArHoverSnapshot) => {
    snap = next;
    opts?.onChange?.(snap);
  };

  const flush = () => {
    raf = 0;
    if (!armed || !pending) return;
    const p = pending;
    pending = null;
    const kind = arClassifyPointer(p.type);
    if (!arPointerIsPrecise(kind)) return;
    const n = arNormFromClient(p.clientX, p.clientY, p.rect);
    emit({
      kind,
      hovering: true,
      x: n.x,
      y: n.y,
      viewX: p.clientX - p.rect.left,
      viewY: p.clientY - p.rect.top,
      precise: true,
    });
  };

  return {
    arm() {
      armed = true;
    },
    dispose() {
      armed = false;
      if (raf) cancel(raf);
      raf = 0;
      pending = null;
      emit({ ...snap, hovering: false });
    },
    snapshot() {
      return snap;
    },
    move(
      clientX: number,
      clientY: number,
      type: string | undefined | null,
      rect: ArHoverRect,
    ) {
      if (!armed) return;
      if (!arPointerIsPrecise(arClassifyPointer(type))) return;
      pending = { clientX, clientY, type: type ?? "", rect };
      if (!raf) raf = schedule(flush);
    },
    leave() {
      pending = null;
      if (raf) cancel(raf);
      raf = 0;
      emit({ ...snap, hovering: false });
    },
  };
}

/** Latest-wins native hover probe so the Capacitor bridge is not flooded. */
export function createArHoverProbe(
  hit: (x: number, y: number) => Promise<boolean>,
) {
  let gen = 0;
  return {
    reset() {
      gen += 1;
    },
    async probe(x: number, y: number): Promise<boolean | null> {
      const g = ++gen;
      try {
        const ok = await hit(x, y);
        return g === gen ? ok : null;
      } catch {
        return g === gen ? false : null;
      }
    },
  };
}
