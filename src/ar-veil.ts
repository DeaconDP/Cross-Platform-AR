/** System-veil steward — shade / Control Center / banner still places, never blocks. */

export type ArVeilKind = "ok" | "peek" | "cover";
export type ArVeilProduct = "place" | "scan" | "emily" | "cubes";

export const AR_VEIL_HOLD_MS = 400;
export const AR_VEIL_RELEASE_MS = 800;

export type ArVeilHold = {
  kind: ArVeilKind;
  raw: ArVeilKind;
  since: number;
};

export type ArVeilState = {
  kind: ArVeilKind;
  coverOn: boolean;
  peekOn: boolean;
  valid: boolean;
};

export type ArVeilSignals = {
  cover?: boolean;
  peek?: boolean;
  unfocusedVisible?: boolean;
};

export function arVeilKindFromFlags(flags: {
  coverOn: boolean;
  peekOn: boolean;
}): ArVeilKind {
  if (flags.coverOn) return "cover";
  if (flags.peekOn) return "peek";
  return "ok";
}

/** Native + web signals → cover (shade / Control Center) > peek (banner) > ok. */
export function arVeilKindFromSignals(s: ArVeilSignals): ArVeilKind {
  if (s.cover) return "cover";
  if (s.peek || s.unfocusedVisible) return "peek";
  return "ok";
}

/** Web: visible but unfocused → peek (banner / other chrome). Node is invalid. */
export function arVeilReadWeb(): {
  coverOn: boolean;
  peekOn: boolean;
  valid: boolean;
} {
  if (typeof document === "undefined") {
    return { coverOn: false, peekOn: false, valid: false };
  }
  const visible =
    typeof document.visibilityState === "string"
      ? document.visibilityState === "visible"
      : true;
  if (!visible) {
    return { coverOn: false, peekOn: false, valid: true };
  }
  const focused =
    typeof document.hasFocus === "function" ? document.hasFocus() : true;
  return { coverOn: false, peekOn: !focused, valid: true };
}

/** 400 ms into a warning; 800 ms back to ok. First sample stays ok. */
export function arVeilStep(
  prev: ArVeilHold | null,
  raw: ArVeilKind,
  now: number,
): ArVeilHold {
  if (!prev) return { kind: "ok", raw, since: now };
  if (raw === prev.raw) {
    if (raw !== prev.kind) {
      const need = raw === "ok" ? AR_VEIL_RELEASE_MS : AR_VEIL_HOLD_MS;
      if (now - prev.since >= need) return { kind: raw, raw, since: now };
    }
    return prev;
  }
  return { kind: prev.kind, raw, since: now };
}

export function arVeilCoach(
  kind: ArVeilKind,
  product: ArVeilProduct,
): string | null {
  if (kind === "ok") return null;
  if (kind === "cover") {
    if (product === "scan") {
      return "A system panel is covering the camera — dismiss it, then point at the plaque.";
    }
    if (product === "emily") {
      return "A system panel is covering the camera — dismiss it, then tap the floor.";
    }
    if (product === "cubes") {
      return "A system panel is covering the camera — dismiss it, then tap the table.";
    }
    return "A system panel is covering the camera — dismiss it, then tap the table.";
  }
  if (product === "scan") {
    return "A banner is covering the top of the camera — hunt the plaque below it.";
  }
  if (product === "emily") {
    return "A banner is covering the top of the camera — tap the floor below it.";
  }
  if (product === "cubes") {
    return "A banner is covering the top of the camera — tap a cube spot below it.";
  }
  return "A banner is covering the top of the camera — tap the fossil below it.";
}

/** A veil never remaps taps. Scan still hunts. */
export function arVeilBlocksPlace(
  _kind: ArVeilKind,
  _product: ArVeilProduct,
): boolean {
  return false;
}

/** Hosts can prefer outline marks when a panel washes the camera. */
export function arVeilPrefersMarks(kind: ArVeilKind): boolean {
  return kind === "cover" || kind === "peek";
}

export function arVeilApplyClass(el: Element | null, kind: ArVeilKind): void {
  if (!el) return;
  el.classList.toggle("is-ar-veil-cover", kind === "cover");
  el.classList.toggle("is-ar-veil-peek", kind === "peek");
}

export function arVeilParseNative(data: {
  kind?: string;
  coverOn?: boolean;
  peekOn?: boolean;
  valid?: boolean;
}): ArVeilState {
  const coverOn = data.coverOn === true;
  const peekOn = data.peekOn === true;
  const kind: ArVeilKind =
    data.kind === "cover" || data.kind === "peek" || data.kind === "ok"
      ? data.kind
      : arVeilKindFromFlags({ coverOn, peekOn });
  return {
    kind,
    coverOn,
    peekOn,
    valid: data.valid === true,
  };
}

export type ArVeilArm = { dispose: () => void };

export function arVeilArm(opts: {
  product: ArVeilProduct;
  getNative?: () => Promise<ArVeilState | null>;
  onKind: (kind: ArVeilKind, coach: string | null) => void;
  root?: Element | null;
  intervalMs?: number;
  now?: () => number;
}): ArVeilArm {
  const nowFn = opts.now ?? Date.now;
  let hold: ArVeilHold | null = null;
  let alive = true;
  const apply = (raw: ArVeilKind) => {
    hold = arVeilStep(hold, raw, nowFn());
    arVeilApplyClass(opts.root ?? null, hold.kind);
    opts.onKind(hold.kind, arVeilCoach(hold.kind, opts.product));
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
    const web = arVeilReadWeb();
    apply(web.valid ? arVeilKindFromFlags(web) : (hold?.raw ?? "ok"));
  };
  const onFocus = () => {
    void tick();
  };
  if (typeof window !== "undefined") {
    window.addEventListener("blur", onFocus);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
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
      if (typeof window !== "undefined") {
        window.clearInterval(id);
        window.removeEventListener("blur", onFocus);
        window.removeEventListener("focus", onFocus);
        document.removeEventListener("visibilitychange", onFocus);
      }
      arVeilApplyClass(opts.root ?? null, "ok");
    },
  };
}
