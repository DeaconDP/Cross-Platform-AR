/** Appearance steward — Dark Mode / Force-dark still places, never blocks. */

export type ArSkinKind = "ok" | "dark" | "force";
export type ArSkinProduct = "place" | "scan" | "emily" | "cubes";

export const AR_SKIN_HOLD_MS = 400;
export const AR_SKIN_RELEASE_MS = 800;

export type ArSkinHold = {
  kind: ArSkinKind;
  raw: ArSkinKind;
  since: number;
};

export type ArSkinState = {
  kind: ArSkinKind;
  forceOn: boolean;
  darkOn: boolean;
  valid: boolean;
};

export type ArSkinSignals = {
  forceDark?: boolean;
  nightMode?: boolean;
  prefersDark?: boolean;
};

export function arSkinKindFromFlags(flags: {
  forceOn: boolean;
  darkOn: boolean;
}): ArSkinKind {
  if (flags.forceOn) return "force";
  if (flags.darkOn) return "dark";
  return "ok";
}

/** Native + web signals → force (WebView remaps chrome) > dark (user theme) > ok. */
export function arSkinKindFromSignals(s: ArSkinSignals): ArSkinKind {
  if (s.forceDark) return "force";
  if (s.nightMode || s.prefersDark) return "dark";
  return "ok";
}

/** Web: prefers-color-scheme. Node is invalid. No Force-dark API on the page. */
export function arSkinReadWeb(): {
  forceOn: boolean;
  darkOn: boolean;
  valid: boolean;
} {
  if (typeof window === "undefined" || typeof matchMedia !== "function") {
    return { forceOn: false, darkOn: false, valid: false };
  }
  const darkOn = matchMedia("(prefers-color-scheme: dark)").matches;
  return { forceOn: false, darkOn, valid: true };
}

/** 400 ms into a warning; 800 ms back to ok. First sample stays ok. */
export function arSkinStep(
  prev: ArSkinHold | null,
  raw: ArSkinKind,
  now: number,
): ArSkinHold {
  if (!prev) return { kind: "ok", raw, since: now };
  if (raw === prev.raw) {
    if (raw !== prev.kind) {
      const need = raw === "ok" ? AR_SKIN_RELEASE_MS : AR_SKIN_HOLD_MS;
      if (now - prev.since >= need) return { kind: raw, raw, since: now };
    }
    return prev;
  }
  return { kind: prev.kind, raw, since: now };
}

export function arSkinCoach(
  kind: ArSkinKind,
  product: ArSkinProduct,
): string | null {
  if (kind === "ok") return null;
  if (kind === "force") {
    if (product === "scan") {
      return "Force dark is remapping the camera chrome — turn it off so taps land on the plaque.";
    }
    if (product === "emily") {
      return "Force dark is remapping the camera chrome — turn it off so taps land on me.";
    }
    if (product === "cubes") {
      return "Force dark is remapping the camera chrome — turn it off so taps land on a cube.";
    }
    return "Force dark is remapping the camera chrome — turn it off so taps land on the fossil.";
  }
  if (product === "scan") {
    return "Dark appearance can hide the plaque outline — look for the highlight, then tap.";
  }
  if (product === "emily") {
    return "Dark appearance can hide the floor outline — look for the highlight, then tap.";
  }
  if (product === "cubes") {
    return "Dark appearance can hide the table outline — look for the highlight, then tap.";
  }
  return "Dark appearance can hide the table outline — look for the highlight, then tap.";
}

/** A dark theme never remaps taps. Scan still hunts. */
export function arSkinBlocksPlace(
  _kind: ArSkinKind,
  _product: ArSkinProduct,
): boolean {
  return false;
}

/** Hosts can prefer cream/outline marks when the theme remaps color. */
export function arSkinPrefersMarks(kind: ArSkinKind): boolean {
  return kind === "force" || kind === "dark";
}

export function arSkinApplyClass(el: Element | null, kind: ArSkinKind): void {
  if (!el) return;
  el.classList.toggle("is-ar-skin-force", kind === "force");
  el.classList.toggle("is-ar-skin-dark", kind === "dark");
}

export function arSkinParseNative(data: {
  kind?: string;
  forceOn?: boolean;
  darkOn?: boolean;
  valid?: boolean;
}): ArSkinState {
  const forceOn = data.forceOn === true;
  const darkOn = data.darkOn === true;
  const kind: ArSkinKind =
    data.kind === "force" || data.kind === "dark" || data.kind === "ok"
      ? data.kind
      : arSkinKindFromFlags({ forceOn, darkOn });
  return {
    kind,
    forceOn,
    darkOn,
    valid: data.valid === true,
  };
}

export type ArSkinArm = { dispose: () => void };

export function arSkinArm(opts: {
  product: ArSkinProduct;
  getNative?: () => Promise<ArSkinState | null>;
  onKind: (kind: ArSkinKind, coach: string | null) => void;
  root?: Element | null;
  intervalMs?: number;
  now?: () => number;
}): ArSkinArm {
  const nowFn = opts.now ?? Date.now;
  let hold: ArSkinHold | null = null;
  let alive = true;
  const apply = (raw: ArSkinKind) => {
    hold = arSkinStep(hold, raw, nowFn());
    arSkinApplyClass(opts.root ?? null, hold.kind);
    opts.onKind(hold.kind, arSkinCoach(hold.kind, opts.product));
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
    const web = arSkinReadWeb();
    apply(web.valid ? arSkinKindFromFlags(web) : (hold?.raw ?? "ok"));
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
      arSkinApplyClass(opts.root ?? null, "ok");
    },
  };
}
