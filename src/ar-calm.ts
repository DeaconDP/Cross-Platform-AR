/** Reduce Motion / vestibular steward — keep fossils still when motion is off. */

export type ArCalmKind = "ok" | "fade" | "reduce";
export type ArCalmProduct = "place" | "scan" | "emily" | "cubes";

export const AR_CALM_HOLD_MS = 400;
export const AR_CALM_RELEASE_MS = 800;

export type ArCalmHold = {
  kind: ArCalmKind;
  raw: ArCalmKind;
  since: number;
};

export type ArCalmState = {
  kind: ArCalmKind;
  reduce: boolean;
  fade: boolean;
  valid: boolean;
};

export function arCalmKindFromFlags(flags: {
  reduce: boolean;
  fade: boolean;
}): ArCalmKind {
  if (flags.reduce) return "reduce";
  if (flags.fade) return "fade";
  return "ok";
}

export function arCalmReadWeb(): {
  reduce: boolean;
  fade: boolean;
  valid: boolean;
} {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return { reduce: false, fade: false, valid: false };
  }
  try {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    return { reduce, fade: false, valid: true };
  } catch {
    return { reduce: false, fade: false, valid: false };
  }
}

/** 400 ms into a warning; 800 ms back to ok. First sample stays ok. */
export function arCalmStep(
  prev: ArCalmHold | null,
  raw: ArCalmKind,
  now: number,
): ArCalmHold {
  if (!prev) return { kind: "ok", raw, since: now };
  if (raw === prev.raw) {
    if (raw !== prev.kind) {
      const need = raw === "ok" ? AR_CALM_RELEASE_MS : AR_CALM_HOLD_MS;
      if (now - prev.since >= need) return { kind: raw, raw, since: now };
    }
    return prev;
  }
  return { kind: prev.kind, raw, since: now };
}

export function arCalmCoach(
  kind: ArCalmKind,
  product: ArCalmProduct,
): string | null {
  if (kind === "ok") return null;
  if (kind === "reduce") {
    if (product === "scan") {
      return "Motion is reduced — the find will sit still. Keep hunting.";
    }
    if (product === "emily") {
      return "Motion is reduced — I will sit still. Tap the floor when ready.";
    }
    if (product === "cubes") {
      return "Motion is reduced — the cube sits still. Tap a surface.";
    }
    return "Motion is reduced — the fossil sits still. Tap the table when ready.";
  }
  if (product === "scan") {
    return "Transitions are faded — the plaque find stays put.";
  }
  if (product === "emily") {
    return "Transitions are faded — I will stay put on the floor.";
  }
  if (product === "cubes") {
    return "Transitions are faded — the cube stays put.";
  }
  return "Transitions are faded — the fossil stays put.";
}

/** Reduce Motion never remaps taps. Scan still hunts. */
export function arCalmBlocksPlace(
  _kind: ArCalmKind,
  _product: ArCalmProduct,
): boolean {
  return false;
}

export function arCalmPrefersReduce(kind: ArCalmKind): boolean {
  return kind === "reduce";
}

export function arCalmApplyClass(
  el: Element | null,
  kind: ArCalmKind,
): void {
  if (!el) return;
  el.classList.toggle("is-ar-calm-reduce", kind === "reduce");
  el.classList.toggle("is-ar-calm-fade", kind === "fade");
}

export function arCalmParseNative(data: {
  kind?: string;
  reduce?: boolean;
  fade?: boolean;
  valid?: boolean;
}): ArCalmState {
  const reduce = data.reduce === true;
  const fade = data.fade === true;
  const kind: ArCalmKind =
    data.kind === "fade" || data.kind === "reduce" || data.kind === "ok"
      ? data.kind
      : arCalmKindFromFlags({ reduce, fade });
  return {
    kind,
    reduce,
    fade,
    valid: data.valid === true,
  };
}

export type ArCalmArm = { dispose: () => void };

export function arCalmArm(opts: {
  product: ArCalmProduct;
  getNative?: () => Promise<ArCalmState | null>;
  onKind: (kind: ArCalmKind, coach: string | null) => void;
  root?: Element | null;
  intervalMs?: number;
  now?: () => number;
}): ArCalmArm {
  const nowFn = opts.now ?? Date.now;
  let hold: ArCalmHold | null = null;
  let alive = true;
  const apply = (raw: ArCalmKind) => {
    hold = arCalmStep(hold, raw, nowFn());
    arCalmApplyClass(opts.root ?? null, hold.kind);
    opts.onKind(hold.kind, arCalmCoach(hold.kind, opts.product));
  };
  const tick = async () => {
    if (!alive) return;
    if (opts.getNative) {
      try {
        const native = await opts.getNative();
        if (!alive) return;
        if (native?.valid) {
          apply(native.kind);
          return;
        }
      } catch {
        /* fall through to web */
      }
    }
    const web = arCalmReadWeb();
    apply(web.valid ? arCalmKindFromFlags(web) : (hold?.raw ?? "ok"));
  };
  const id =
    typeof window !== "undefined"
      ? window.setInterval(() => {
          void tick();
        }, opts.intervalMs ?? 800)
      : 0;
  void tick();
  return {
    dispose() {
      alive = false;
      if (typeof window !== "undefined") window.clearInterval(id);
      arCalmApplyClass(opts.root ?? null, "ok");
    },
  };
}
