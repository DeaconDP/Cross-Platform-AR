/** Writing-direction steward — keep overlay chrome on the thumb side in RTL. */

export type ArDirKind = "ok" | "rtl" | "mix";
export type ArDirProduct = "place" | "scan" | "emily" | "cubes";

export const AR_DIR_HOLD_MS = 400;
export const AR_DIR_RELEASE_MS = 800;

const RTL_LANG = /^(ar|he|fa|ur|yi|ps|ckb|dv|ug|sd)([-_]|$)/i;

export type ArDirHold = {
  kind: ArDirKind;
  raw: ArDirKind;
  since: number;
};

export type ArDirState = {
  kind: ArDirKind;
  rtl: boolean;
  mix: boolean;
  valid: boolean;
};

export function arDirKindFromFlags(flags: {
  rtl: boolean;
  mix: boolean;
}): ArDirKind {
  if (flags.mix) return "mix";
  if (flags.rtl) return "rtl";
  return "ok";
}

/** Locale BCP-47 → writing direction. Empty when the tag is missing. */
export function arDirLocaleDirection(tag: string): "ltr" | "rtl" | "" {
  const raw = tag.trim();
  if (!raw) return "";
  try {
    const loc = new Intl.Locale(raw);
    const info = (loc as { textInfo?: { direction?: string } }).textInfo;
    if (info?.direction === "rtl" || info?.direction === "ltr") {
      return info.direction;
    }
  } catch {
    /* older Intl */
  }
  return RTL_LANG.test(raw) ? "rtl" : "ltr";
}

function pageDirection(): "ltr" | "rtl" | "" {
  if (typeof document === "undefined") return "";
  try {
    const el = document.documentElement;
    const attr = (el.getAttribute("dir") || "").toLowerCase();
    if (attr === "rtl" || attr === "ltr") return attr;
    const computed = getComputedStyle(el).direction.toLowerCase();
    if (computed === "rtl" || computed === "ltr") return computed;
  } catch {
    /* ignore */
  }
  return "";
}

export function arDirReadWeb(): {
  rtl: boolean;
  mix: boolean;
  valid: boolean;
} {
  if (typeof document === "undefined") {
    return { rtl: false, mix: false, valid: false };
  }
  try {
    const page = pageDirection();
    const locale = arDirLocaleDirection(
      typeof navigator !== "undefined" ? navigator.language || "" : "",
    );
    const mix = page !== "" && locale !== "" && page !== locale;
    const rtl = page === "rtl" || locale === "rtl";
    return { rtl, mix, valid: true };
  } catch {
    return { rtl: false, mix: false, valid: false };
  }
}

/** 400 ms into a warning; 800 ms back to ok. First sample stays ok. */
export function arDirStep(
  prev: ArDirHold | null,
  raw: ArDirKind,
  now: number,
): ArDirHold {
  if (!prev) return { kind: "ok", raw, since: now };
  if (raw === prev.raw) {
    if (raw !== prev.kind) {
      const need = raw === "ok" ? AR_DIR_RELEASE_MS : AR_DIR_HOLD_MS;
      if (now - prev.since >= need) return { kind: raw, raw, since: now };
    }
    return prev;
  }
  return { kind: prev.kind, raw, since: now };
}

export function arDirCoach(
  kind: ArDirKind,
  product: ArDirProduct,
): string | null {
  if (kind === "ok") return null;
  if (kind === "mix") {
    if (product === "scan") {
      return "Text direction is mixed — keep hunting; the plaque find stays put.";
    }
    if (product === "emily") {
      return "Text direction is mixed — I will still sit on the floor. Tap when ready.";
    }
    if (product === "cubes") {
      return "Text direction is mixed — the cube tap still works. Tap a surface.";
    }
    return "Text direction is mixed — Close may look flipped. Tap the table when ready.";
  }
  if (product === "scan") {
    return "Your phone reads right to left — keep hunting.";
  }
  if (product === "emily") {
    return "Your phone reads right to left — I stay on this side. Tap the floor when ready.";
  }
  if (product === "cubes") {
    return "Your phone reads right to left — tap a surface.";
  }
  return "Your phone reads right to left — Close stays on this side. Tap the table when ready.";
}

/** Direction never remaps taps. Scan still hunts. */
export function arDirBlocksPlace(
  _kind: ArDirKind,
  _product: ArDirProduct,
): boolean {
  return false;
}

export function arDirPrefersRtl(kind: ArDirKind): boolean {
  return kind === "rtl";
}

export function arDirApplyClass(
  el: Element | null,
  kind: ArDirKind,
): void {
  if (!el) return;
  el.classList.toggle("is-ar-dir-rtl", kind === "rtl");
  el.classList.toggle("is-ar-dir-mix", kind === "mix");
}

export function arDirParseNative(data: {
  kind?: string;
  rtl?: boolean;
  mix?: boolean;
  valid?: boolean;
}): ArDirState {
  const rtl = data.rtl === true;
  const mix = data.mix === true;
  const kind: ArDirKind =
    data.kind === "mix" || data.kind === "rtl" || data.kind === "ok"
      ? data.kind
      : arDirKindFromFlags({ rtl, mix });
  return {
    kind,
    rtl,
    mix,
    valid: data.valid === true,
  };
}

export type ArDirArm = { dispose: () => void };

export function arDirArm(opts: {
  product: ArDirProduct;
  getNative?: () => Promise<ArDirState | null>;
  onKind: (kind: ArDirKind, coach: string | null) => void;
  root?: Element | null;
  intervalMs?: number;
  now?: () => number;
}): ArDirArm {
  const nowFn = opts.now ?? Date.now;
  let hold: ArDirHold | null = null;
  let alive = true;
  const apply = (raw: ArDirKind) => {
    hold = arDirStep(hold, raw, nowFn());
    arDirApplyClass(opts.root ?? null, hold.kind);
    opts.onKind(hold.kind, arDirCoach(hold.kind, opts.product));
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
    const web = arDirReadWeb();
    apply(web.valid ? arDirKindFromFlags(web) : (hold?.raw ?? "ok"));
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
      arDirApplyClass(opts.root ?? null, "ok");
    },
  };
}
