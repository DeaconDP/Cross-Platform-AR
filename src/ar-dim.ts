/** Extra Dim / Night Light / Reduce White Point steward — OS display tint that hides see-through AR. */

export type ArDimKind = "ok" | "dim" | "night";
export type ArDimProduct = "place" | "scan" | "emily" | "cubes";

export const AR_DIM_HOLD_MS = 400;
export const AR_DIM_RELEASE_MS = 800;
export const AR_DIM_BRIGHT_FLOOR = 0.12;

export type ArDimHold = {
  kind: ArDimKind;
  raw: ArDimKind;
  since: number;
};

export type ArDimState = {
  kind: ArDimKind;
  night: boolean;
  extraDim: boolean;
  reduceWhite: boolean;
  brightness: number;
  valid: boolean;
};

export function arDimKindFromFlags(flags: {
  night: boolean;
  extraDim: boolean;
  reduceWhite: boolean;
  brightness: number;
}): ArDimKind {
  if (flags.night) return "night";
  if (
    flags.extraDim ||
    flags.reduceWhite ||
    flags.brightness < AR_DIM_BRIGHT_FLOOR
  ) {
    return "dim";
  }
  return "ok";
}

/** Non-standard Screen.brightness only. Night Light has no CSS media query. */
export function arDimReadWeb(): {
  night: boolean;
  extraDim: boolean;
  reduceWhite: boolean;
  brightness: number;
  valid: boolean;
} {
  if (typeof window === "undefined" || typeof window.screen === "undefined") {
    return {
      night: false,
      extraDim: false,
      reduceWhite: false,
      brightness: 1,
      valid: false,
    };
  }
  const raw = (window.screen as unknown as { brightness?: number }).brightness;
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0 && raw <= 1) {
    return {
      night: false,
      extraDim: false,
      reduceWhite: false,
      brightness: raw,
      valid: true,
    };
  }
  return {
    night: false,
    extraDim: false,
    reduceWhite: false,
    brightness: 1,
    valid: false,
  };
}

/** 400 ms into a warning; 800 ms back to ok. First sample stays ok. */
export function arDimStep(
  prev: ArDimHold | null,
  raw: ArDimKind,
  now: number,
): ArDimHold {
  if (!prev) return { kind: "ok", raw, since: now };
  if (raw === prev.raw) {
    if (raw !== prev.kind) {
      const need = raw === "ok" ? AR_DIM_RELEASE_MS : AR_DIM_HOLD_MS;
      if (now - prev.since >= need) return { kind: raw, raw, since: now };
    }
    return prev;
  }
  return { kind: prev.kind, raw, since: now };
}

export function arDimCoach(kind: ArDimKind, product: ArDimProduct): string | null {
  if (kind === "ok") return null;
  if (kind === "night") {
    if (product === "scan") {
      return "Night Light is on — plaque colors may look warmer.";
    }
    if (product === "emily") {
      return "Night Light is on — I may look warmer than usual.";
    }
    if (product === "cubes") {
      return "Night Light is on — cube colors may look warmer.";
    }
    return "Night Light is on — the live camera may look warmer than the room.";
  }
  if (product === "scan") {
    return "Screen is extra-dim — raise brightness so the plaque stays visible.";
  }
  if (product === "emily") {
    return "Screen is extra-dim — raise brightness so you can still see me.";
  }
  if (product === "cubes") {
    return "Screen is extra-dim — raise brightness so the cubes stay visible.";
  }
  return "Screen is extra-dim — raise brightness so the fossil stays visible.";
}

/** Dim never blocks a tap — the camera can still find a table. */
export function arDimBlocksPlace(
  _kind: ArDimKind,
  _product: ArDimProduct,
): boolean {
  return false;
}

export function arDimApplyClass(el: Element | null, kind: ArDimKind): void {
  if (!el) return;
  el.classList.toggle("is-ar-dim", kind === "dim");
  el.classList.toggle("is-ar-night", kind === "night");
}

export function arDimParseNative(data: {
  kind?: string;
  night?: boolean;
  extraDim?: boolean;
  reduceWhite?: boolean;
  brightness?: number;
  valid?: boolean;
}): ArDimState {
  const night = data.night === true;
  const extraDim = data.extraDim === true;
  const reduceWhite = data.reduceWhite === true;
  const brightness =
    typeof data.brightness === "number" && Number.isFinite(data.brightness)
      ? data.brightness
      : 1;
  const kind: ArDimKind =
    data.kind === "dim" || data.kind === "night" || data.kind === "ok"
      ? data.kind
      : arDimKindFromFlags({ night, extraDim, reduceWhite, brightness });
  return {
    kind,
    night,
    extraDim,
    reduceWhite,
    brightness,
    valid: data.valid === true,
  };
}

export type ArDimArm = { dispose: () => void };

export function arDimArm(opts: {
  product: ArDimProduct;
  getNative?: () => Promise<ArDimState | null>;
  onKind: (kind: ArDimKind, coach: string | null) => void;
  root?: Element | null;
  intervalMs?: number;
  now?: () => number;
}): ArDimArm {
  const nowFn = opts.now ?? Date.now;
  let hold: ArDimHold | null = null;
  let alive = true;
  const apply = (raw: ArDimKind) => {
    hold = arDimStep(hold, raw, nowFn());
    arDimApplyClass(opts.root ?? null, hold.kind);
    opts.onKind(hold.kind, arDimCoach(hold.kind, opts.product));
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
    const web = arDimReadWeb();
    apply(web.valid ? arDimKindFromFlags(web) : (hold?.raw ?? "ok"));
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
      arDimApplyClass(opts.root ?? null, "ok");
    },
  };
}
