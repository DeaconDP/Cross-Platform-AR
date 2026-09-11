/** Doze / App Standby / battery-restrict steward — keep the session hot, never block place. */

export type ArDozeKind = "ok" | "optimize" | "restrict";
export type ArDozeProduct = "place" | "scan" | "emily" | "cubes";

export const AR_DOZE_HOLD_MS = 400;
export const AR_DOZE_RELEASE_MS = 800;

export type ArDozeHold = {
  kind: ArDozeKind;
  raw: ArDozeKind;
  since: number;
};

export type ArDozeState = {
  kind: ArDozeKind;
  restrict: boolean;
  optimize: boolean;
  valid: boolean;
};

export function arDozeKindFromFlags(flags: {
  restrict: boolean;
  optimize: boolean;
}): ArDozeKind {
  if (flags.restrict) return "restrict";
  if (flags.optimize) return "optimize";
  return "ok";
}

/** Browsers have no App Standby / Doze API — web is always ok when a window exists. */
export function arDozeReadWeb(): {
  restrict: boolean;
  optimize: boolean;
  valid: boolean;
} {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return { restrict: false, optimize: false, valid: false };
  }
  return { restrict: false, optimize: false, valid: true };
}

/** 400 ms into a warning; 800 ms back to ok. First sample stays ok. */
export function arDozeStep(
  prev: ArDozeHold | null,
  raw: ArDozeKind,
  now: number,
): ArDozeHold {
  if (!prev) return { kind: "ok", raw, since: now };
  if (raw === prev.raw) {
    if (raw !== prev.kind) {
      const need = raw === "ok" ? AR_DOZE_RELEASE_MS : AR_DOZE_HOLD_MS;
      if (now - prev.since >= need) return { kind: raw, raw, since: now };
    }
    return prev;
  }
  return { kind: prev.kind, raw, since: now };
}

export function arDozeCoach(
  kind: ArDozeKind,
  product: ArDozeProduct,
): string | null {
  if (kind === "ok") return null;
  if (kind === "restrict") {
    if (product === "scan") {
      return "This phone is limiting the camera — keep the app open. Keep hunting; the find still stamps.";
    }
    if (product === "emily") {
      return "This phone is limiting the camera — keep me on screen. Watch the floor, then tap.";
    }
    if (product === "cubes") {
      return "This phone is limiting the camera — keep the app open. Watch the surface, then tap.";
    }
    return "This phone is limiting the camera — keep the app open. The fossil still places.";
  }
  if (product === "scan") {
    return "Power limits are on — leave this screen up. Keep hunting for the plaque.";
  }
  if (product === "emily") {
    return "Power limits are on — leave me in front so the floor stays live.";
  }
  if (product === "cubes") {
    return "Power limits are on — leave this screen up so the reticle stays live.";
  }
  return "Power limits are on — leave this screen up so tracking stays live.";
}

/** Standby / restrict never remaps taps. Scan still hunts. */
export function arDozeBlocksPlace(
  _kind: ArDozeKind,
  _product: ArDozeProduct,
): boolean {
  return false;
}

/** Keep the session in front when the OS is about to freeze sensors. */
export function arDozePrefersStayHot(kind: ArDozeKind): boolean {
  return kind === "restrict" || kind === "optimize";
}

export function arDozeApplyClass(el: Element | null, kind: ArDozeKind): void {
  if (!el) return;
  el.classList.toggle("is-ar-doze-restrict", kind === "restrict");
  el.classList.toggle("is-ar-doze-optimize", kind === "optimize");
}

export function arDozeParseNative(data: {
  kind?: string;
  restrict?: boolean;
  optimize?: boolean;
  valid?: boolean;
}): ArDozeState {
  const restrict = data.restrict === true;
  const optimize = data.optimize === true;
  const kind: ArDozeKind =
    data.kind === "restrict" || data.kind === "optimize" || data.kind === "ok"
      ? data.kind
      : arDozeKindFromFlags({ restrict, optimize });
  return {
    kind,
    restrict,
    optimize,
    valid: data.valid === true,
  };
}

export type ArDozeArm = { dispose: () => void };

export function arDozeArm(opts: {
  product: ArDozeProduct;
  getNative?: () => Promise<ArDozeState | null>;
  onKind: (kind: ArDozeKind, coach: string | null) => void;
  root?: Element | null;
  intervalMs?: number;
  now?: () => number;
}): ArDozeArm {
  const nowFn = opts.now ?? Date.now;
  let hold: ArDozeHold | null = null;
  let alive = true;
  const apply = (raw: ArDozeKind) => {
    hold = arDozeStep(hold, raw, nowFn());
    arDozeApplyClass(opts.root ?? null, hold.kind);
    opts.onKind(hold.kind, arDozeCoach(hold.kind, opts.product));
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
    const web = arDozeReadWeb();
    apply(web.valid ? arDozeKindFromFlags(web) : (hold?.raw ?? "ok"));
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
      arDozeApplyClass(opts.root ?? null, "ok");
    },
  };
}
