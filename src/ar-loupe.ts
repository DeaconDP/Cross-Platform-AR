/** OS magnification / AssistiveTouch / one-handed steward — remapped taps and floating chrome. */

export type ArLoupeKind = "ok" | "assist" | "zoom";
export type ArLoupeProduct = "place" | "scan" | "emily" | "cubes";

export const AR_LOUPE_HOLD_MS = 400;
export const AR_LOUPE_RELEASE_MS = 800;

export type ArLoupeHold = {
  kind: ArLoupeKind;
  raw: ArLoupeKind;
  since: number;
};

export type ArLoupeState = {
  kind: ArLoupeKind;
  assist: boolean;
  zoom: boolean;
  valid: boolean;
};

export function arLoupeKindFromFlags(flags: {
  assist: boolean;
  zoom: boolean;
}): ArLoupeKind {
  if (flags.zoom) return "zoom";
  if (flags.assist) return "assist";
  return "ok";
}

/** Browser page-zoom is a different lock. OS Zoom / AssistiveTouch is native-only. */
export function arLoupeReadWeb(): {
  assist: boolean;
  zoom: boolean;
  valid: boolean;
} {
  return { assist: false, zoom: false, valid: false };
}

/** 400 ms into a warning; 800 ms back to ok. First sample stays ok. */
export function arLoupeStep(
  prev: ArLoupeHold | null,
  raw: ArLoupeKind,
  now: number,
): ArLoupeHold {
  if (!prev) return { kind: "ok", raw, since: now };
  if (raw === prev.raw) {
    if (raw !== prev.kind) {
      const need = raw === "ok" ? AR_LOUPE_RELEASE_MS : AR_LOUPE_HOLD_MS;
      if (now - prev.since >= need) return { kind: raw, raw, since: now };
    }
    return prev;
  }
  return { kind: prev.kind, raw, since: now };
}

export function arLoupeCoach(
  kind: ArLoupeKind,
  product: ArLoupeProduct,
): string | null {
  if (kind === "ok") return null;
  if (kind === "zoom") {
    if (product === "scan") {
      return "Turn off Magnification — then hold still on the plaque.";
    }
    if (product === "emily") {
      return "Turn off Magnification so I can sit where you tap.";
    }
    if (product === "cubes") {
      return "Turn off Magnification so the tap hits the table.";
    }
    return "Turn off Magnification so your tap hits the table.";
  }
  if (product === "scan") {
    return "Move the accessibility button so it doesn't cover Back.";
  }
  if (product === "emily") {
    return "Move the AssistiveTouch button off the Place controls.";
  }
  if (product === "cubes") {
    return "Move the AssistiveTouch button so it doesn't cover Exit.";
  }
  return "Move the AssistiveTouch button so it doesn't cover Back.";
}

/** Magnification remaps touches. AssistiveTouch only covers chrome. Scan still hunts. */
export function arLoupeBlocksPlace(
  kind: ArLoupeKind,
  product: ArLoupeProduct,
): boolean {
  return kind === "zoom" && product !== "scan";
}

export function arLoupeApplyClass(el: Element | null, kind: ArLoupeKind): void {
  if (!el) return;
  el.classList.toggle("is-ar-loupe-zoom", kind === "zoom");
  el.classList.toggle("is-ar-loupe-assist", kind === "assist");
}

export function arLoupeParseNative(data: {
  kind?: string;
  assist?: boolean;
  zoom?: boolean;
  valid?: boolean;
}): ArLoupeState {
  const assist = data.assist === true;
  const zoom = data.zoom === true;
  const kind: ArLoupeKind =
    data.kind === "assist" || data.kind === "zoom" || data.kind === "ok"
      ? data.kind
      : arLoupeKindFromFlags({ assist, zoom });
  return {
    kind,
    assist,
    zoom,
    valid: data.valid === true,
  };
}

export type ArLoupeArm = { dispose: () => void };

export function arLoupeArm(opts: {
  product: ArLoupeProduct;
  getNative?: () => Promise<ArLoupeState | null>;
  onKind: (kind: ArLoupeKind, coach: string | null) => void;
  root?: Element | null;
  intervalMs?: number;
  now?: () => number;
}): ArLoupeArm {
  const nowFn = opts.now ?? Date.now;
  let hold: ArLoupeHold | null = null;
  let alive = true;
  const apply = (raw: ArLoupeKind) => {
    hold = arLoupeStep(hold, raw, nowFn());
    arLoupeApplyClass(opts.root ?? null, hold.kind);
    opts.onKind(hold.kind, arLoupeCoach(hold.kind, opts.product));
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
    const web = arLoupeReadWeb();
    apply(web.valid ? arLoupeKindFromFlags(web) : (hold?.raw ?? "ok"));
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
      arLoupeApplyClass(opts.root ?? null, "ok");
    },
  };
}
