/** Color-correction / Differentiate Without Color steward — prefer marks over hue, never block place. */

export type ArTintKind = "ok" | "diff" | "filter";
export type ArTintProduct = "place" | "scan" | "emily" | "cubes";

export const AR_TINT_HOLD_MS = 400;
export const AR_TINT_RELEASE_MS = 800;

export type ArTintHold = {
  kind: ArTintKind;
  raw: ArTintKind;
  since: number;
};

export type ArTintState = {
  kind: ArTintKind;
  filter: boolean;
  diff: boolean;
  valid: boolean;
};

export function arTintKindFromFlags(flags: {
  filter: boolean;
  diff: boolean;
}): ArTintKind {
  if (flags.filter) return "filter";
  if (flags.diff) return "diff";
  return "ok";
}

/** Browsers have no daltonizer / Differentiate Without Color API — web is always ok when a window exists. */
export function arTintReadWeb(): {
  filter: boolean;
  diff: boolean;
  valid: boolean;
} {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return { filter: false, diff: false, valid: false };
  }
  return { filter: false, diff: false, valid: true };
}

/** 400 ms into a warning; 800 ms back to ok. First sample stays ok. */
export function arTintStep(
  prev: ArTintHold | null,
  raw: ArTintKind,
  now: number,
): ArTintHold {
  if (!prev) return { kind: "ok", raw, since: now };
  if (raw === prev.raw) {
    if (raw !== prev.kind) {
      const need = raw === "ok" ? AR_TINT_RELEASE_MS : AR_TINT_HOLD_MS;
      if (now - prev.since >= need) return { kind: raw, raw, since: now };
    }
    return prev;
  }
  return { kind: prev.kind, raw, since: now };
}

export function arTintCoach(
  kind: ArTintKind,
  product: ArTintProduct,
): string | null {
  if (kind === "ok") return null;
  if (kind === "filter") {
    if (product === "scan") {
      return "Color correction is on — keep hunting; follow the words, not the tint.";
    }
    if (product === "emily") {
      return "Color correction is on — watch me, then tap.";
    }
    if (product === "cubes") {
      return "Color correction is on — watch the surface, then tap.";
    }
    return "Color correction is on — follow the words, not the tint.";
  }
  if (product === "scan") {
    return "Marks without color — keep hunting for the plaque.";
  }
  if (product === "emily") {
    return "Marks without color — watch me, then tap.";
  }
  if (product === "cubes") {
    return "Marks without color — watch the outlined surface, then tap.";
  }
  return "Marks without color — tap the outlined surface.";
}

/** Color filters never remap taps. Scan still hunts. */
export function arTintBlocksPlace(
  _kind: ArTintKind,
  _product: ArTintProduct,
): boolean {
  return false;
}

/** Hue remaps make color-only chrome unreadable — prefer outlines / words. */
export function arTintPrefersMarks(kind: ArTintKind): boolean {
  return kind === "filter" || kind === "diff";
}

export function arTintApplyClass(el: Element | null, kind: ArTintKind): void {
  if (!el) return;
  el.classList.toggle("is-ar-tint-filter", kind === "filter");
  el.classList.toggle("is-ar-tint-diff", kind === "diff");
}

export function arTintParseNative(data: {
  kind?: string;
  filter?: boolean;
  diff?: boolean;
  valid?: boolean;
}): ArTintState {
  const filter = data.filter === true;
  const diff = data.diff === true;
  const kind: ArTintKind =
    data.kind === "filter" || data.kind === "diff" || data.kind === "ok"
      ? data.kind
      : arTintKindFromFlags({ filter, diff });
  return {
    kind,
    filter,
    diff,
    valid: data.valid === true,
  };
}

export type ArTintArm = { dispose: () => void };

export function arTintArm(opts: {
  product: ArTintProduct;
  getNative?: () => Promise<ArTintState | null>;
  onKind: (kind: ArTintKind, coach: string | null) => void;
  root?: Element | null;
  intervalMs?: number;
  now?: () => number;
}): ArTintArm {
  const nowFn = opts.now ?? Date.now;
  let hold: ArTintHold | null = null;
  let alive = true;
  const apply = (raw: ArTintKind) => {
    hold = arTintStep(hold, raw, nowFn());
    arTintApplyClass(opts.root ?? null, hold.kind);
    opts.onKind(hold.kind, arTintCoach(hold.kind, opts.product));
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
    const web = arTintReadWeb();
    apply(web.valid ? arTintKindFromFlags(web) : (hold?.raw ?? "ok"));
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
      arTintApplyClass(opts.root ?? null, "ok");
    },
  };
}
