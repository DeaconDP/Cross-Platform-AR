/** HDR / peak-brightness steward — tone-mapped chrome still places, never blocks. */

export type ArRangeKind = "ok" | "peak" | "hdr";
export type ArRangeProduct = "place" | "scan" | "emily" | "cubes";

export const AR_RANGE_HOLD_MS = 400;
export const AR_RANGE_RELEASE_MS = 800;

export type ArRangeHold = {
  kind: ArRangeKind;
  raw: ArRangeKind;
  since: number;
};

export type ArRangeState = {
  kind: ArRangeKind;
  hdrOn: boolean;
  peakOn: boolean;
  valid: boolean;
};

export type ArRangeSignals = {
  hdr?: boolean;
  peak?: boolean;
  dynamicRangeHigh?: boolean;
};

export function arRangeKindFromFlags(flags: {
  hdrOn: boolean;
  peakOn: boolean;
}): ArRangeKind {
  if (flags.hdrOn) return "hdr";
  if (flags.peakOn) return "peak";
  return "ok";
}

/** Native + web signals → hdr (tone-map) > peak (full brightness) > ok. */
export function arRangeKindFromSignals(s: ArRangeSignals): ArRangeKind {
  if (s.hdr || s.dynamicRangeHigh) return "hdr";
  if (s.peak) return "peak";
  return "ok";
}

/** Web: dynamic-range media query. Node is invalid. No brightness API. */
export function arRangeReadWeb(): {
  hdrOn: boolean;
  peakOn: boolean;
  valid: boolean;
} {
  if (typeof window === "undefined" || typeof matchMedia !== "function") {
    return { hdrOn: false, peakOn: false, valid: false };
  }
  const hdrOn =
    matchMedia("(dynamic-range: high)").matches ||
    matchMedia("(dynamic-range: more)").matches;
  return { hdrOn, peakOn: false, valid: true };
}

/** 400 ms into a warning; 800 ms back to ok. First sample stays ok. */
export function arRangeStep(
  prev: ArRangeHold | null,
  raw: ArRangeKind,
  now: number,
): ArRangeHold {
  if (!prev) return { kind: "ok", raw, since: now };
  if (raw === prev.raw) {
    if (raw !== prev.kind) {
      const need = raw === "ok" ? AR_RANGE_RELEASE_MS : AR_RANGE_HOLD_MS;
      if (now - prev.since >= need) return { kind: raw, raw, since: now };
    }
    return prev;
  }
  return { kind: prev.kind, raw, since: now };
}

export function arRangeCoach(
  kind: ArRangeKind,
  product: ArRangeProduct,
): string | null {
  if (kind === "ok") return null;
  if (kind === "hdr") {
    if (product === "scan") {
      return "HDR is remapping the camera chrome — look for the plaque highlight, then tap.";
    }
    if (product === "emily") {
      return "HDR is remapping the camera chrome — look for the floor highlight, then tap.";
    }
    if (product === "cubes") {
      return "HDR is remapping the camera chrome — look for the table highlight, then tap.";
    }
    return "HDR is remapping the camera chrome — look for the table highlight, then tap.";
  }
  if (product === "scan") {
    return "The screen is at full brightness — chrome stays high-contrast so taps land on the plaque.";
  }
  if (product === "emily") {
    return "The screen is at full brightness — chrome stays high-contrast so taps land on me.";
  }
  if (product === "cubes") {
    return "The screen is at full brightness — chrome stays high-contrast so taps land on a cube.";
  }
  return "The screen is at full brightness — chrome stays high-contrast so taps land on the fossil.";
}

/** HDR or peak brightness never remaps taps. Scan still hunts. */
export function arRangeBlocksPlace(
  _kind: ArRangeKind,
  _product: ArRangeProduct,
): boolean {
  return false;
}

/** Hosts can prefer cream/outline marks when tone-mapping washes color. */
export function arRangePrefersMarks(kind: ArRangeKind): boolean {
  return kind === "hdr" || kind === "peak";
}

export function arRangeApplyClass(el: Element | null, kind: ArRangeKind): void {
  if (!el) return;
  el.classList.toggle("is-ar-range-hdr", kind === "hdr");
  el.classList.toggle("is-ar-range-peak", kind === "peak");
}

export function arRangeParseNative(data: {
  kind?: string;
  hdrOn?: boolean;
  peakOn?: boolean;
  valid?: boolean;
}): ArRangeState {
  const hdrOn = data.hdrOn === true;
  const peakOn = data.peakOn === true;
  const kind: ArRangeKind =
    data.kind === "hdr" || data.kind === "peak" || data.kind === "ok"
      ? data.kind
      : arRangeKindFromFlags({ hdrOn, peakOn });
  return {
    kind,
    hdrOn,
    peakOn,
    valid: data.valid === true,
  };
}

export type ArRangeArm = { dispose: () => void };

export function arRangeArm(opts: {
  product: ArRangeProduct;
  getNative?: () => Promise<ArRangeState | null>;
  onKind: (kind: ArRangeKind, coach: string | null) => void;
  root?: Element | null;
  intervalMs?: number;
  now?: () => number;
}): ArRangeArm {
  const nowFn = opts.now ?? Date.now;
  let hold: ArRangeHold | null = null;
  let alive = true;
  const apply = (raw: ArRangeKind) => {
    hold = arRangeStep(hold, raw, nowFn());
    arRangeApplyClass(opts.root ?? null, hold.kind);
    opts.onKind(hold.kind, arRangeCoach(hold.kind, opts.product));
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
    const web = arRangeReadWeb();
    apply(web.valid ? arRangeKindFromFlags(web) : (hold?.raw ?? "ok"));
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
      arRangeApplyClass(opts.root ?? null, "ok");
    },
  };
}
