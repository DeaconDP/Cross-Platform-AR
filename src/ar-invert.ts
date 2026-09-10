/** Smart Invert / grayscale steward — a11y color filters that break see-through AR. */

export type ArInvertKind = "ok" | "invert" | "gray";
export type ArInvertProduct = "place" | "scan" | "emily" | "cubes";

export const AR_INVERT_HOLD_MS = 400;
export const AR_INVERT_RELEASE_MS = 800;

export type ArInvertHold = {
  kind: ArInvertKind;
  raw: ArInvertKind;
  since: number;
};

export type ArInvertState = {
  kind: ArInvertKind;
  invert: boolean;
  gray: boolean;
  valid: boolean;
};

export function arInvertKindFromFlags(invert: boolean, gray: boolean): ArInvertKind {
  if (invert) return "invert";
  if (gray) return "gray";
  return "ok";
}

/** CSS inverted-colors only. Grayscale has no standard media query. */
export function arInvertReadWeb(): { invert: boolean; gray: boolean; valid: boolean } {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return { invert: false, gray: false, valid: false };
  }
  try {
    const invert = window.matchMedia("(inverted-colors: inverted)").matches;
    return { invert, gray: false, valid: true };
  } catch {
    return { invert: false, gray: false, valid: false };
  }
}

/** 400 ms into a warning; 800 ms back to ok. First sample stays ok. */
export function arInvertStep(
  prev: ArInvertHold | null,
  raw: ArInvertKind,
  now: number,
): ArInvertHold {
  if (!prev) return { kind: "ok", raw, since: now };
  if (raw === prev.raw) {
    if (raw !== prev.kind) {
      const need = raw === "ok" ? AR_INVERT_RELEASE_MS : AR_INVERT_HOLD_MS;
      if (now - prev.since >= need) return { kind: raw, raw, since: now };
    }
    return prev;
  }
  return { kind: prev.kind, raw, since: now };
}

export function arInvertCoach(
  kind: ArInvertKind,
  product: ArInvertProduct,
): string | null {
  if (kind === "ok") return null;
  if (kind === "invert") {
    if (product === "scan") {
      return "Color invert is on — the plaque may look odd.";
    }
    if (product === "emily") {
      return "Color invert is on — I may look strange.";
    }
    if (product === "cubes") {
      return "Color invert is on — cube colors may look wrong.";
    }
    return "Color invert is on — fossils may look wrong. I’ll keep the camera true-color.";
  }
  if (product === "scan") {
    return "A color filter is on — the plaque colors may look off.";
  }
  if (product === "emily") {
    return "Grayscale is on — my colors won’t show.";
  }
  if (product === "cubes") {
    return "A color filter is on — cube colors may look off.";
  }
  return "Grayscale or a color filter is on — species colors may look wrong.";
}

/** Invert never blocks a tap — the camera can still find a table. */
export function arInvertBlocksPlace(
  _kind: ArInvertKind,
  _product: ArInvertProduct,
): boolean {
  return false;
}

export function arInvertApplyClass(el: Element | null, kind: ArInvertKind): void {
  if (!el) return;
  el.classList.toggle("is-ar-invert", kind === "invert");
  el.classList.toggle("is-ar-gray", kind === "gray");
}

export function arInvertParseNative(data: {
  kind?: string;
  invert?: boolean;
  gray?: boolean;
  valid?: boolean;
}): ArInvertState {
  const invert = data.invert === true;
  const gray = data.gray === true;
  const kind: ArInvertKind =
    data.kind === "invert" || data.kind === "gray" || data.kind === "ok"
      ? data.kind
      : arInvertKindFromFlags(invert, gray);
  return { kind, invert, gray, valid: data.valid === true };
}

export type ArInvertArm = { dispose: () => void };

export function arInvertArm(opts: {
  product: ArInvertProduct;
  getNative?: () => Promise<ArInvertState | null>;
  onKind: (kind: ArInvertKind, coach: string | null) => void;
  root?: Element | null;
  intervalMs?: number;
  now?: () => number;
}): ArInvertArm {
  const nowFn = opts.now ?? Date.now;
  let hold: ArInvertHold | null = null;
  let alive = true;
  const apply = (raw: ArInvertKind) => {
    hold = arInvertStep(hold, raw, nowFn());
    arInvertApplyClass(opts.root ?? null, hold.kind);
    opts.onKind(hold.kind, arInvertCoach(hold.kind, opts.product));
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
        /* fall through to CSS */
      }
    }
    const web = arInvertReadWeb();
    apply(web.valid ? arInvertKindFromFlags(web.invert, web.gray) : (hold?.raw ?? "ok"));
  };
  const onScheme = () => {
    void tick();
  };
  let mq: MediaQueryList | null = null;
  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    try {
      mq = window.matchMedia("(inverted-colors: inverted)");
      mq.addEventListener("change", onScheme);
    } catch {
      mq = null;
    }
  }
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
      mq?.removeEventListener("change", onScheme);
      arInvertApplyClass(opts.root ?? null, "ok");
    },
  };
}
