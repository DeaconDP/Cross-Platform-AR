/** Overlay chrome insets so notch / cutout / IME cannot cover Close. Shared math for CoH / Origins / Emily / Cube. */

export const AR_SAFE = {
  ceil: 96,
  debounceMs: 160,
  baseFontPx: 16,
  minCoachPx: 14,
  maxCoachPx: 28,
} as const;

export type ArInsets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type ArSafeChrome = {
  insets: ArInsets;
  coachPx: number;
};

export type ArSafeVars = {
  "--ar-safe-top": string;
  "--ar-safe-right": string;
  "--ar-safe-bottom": string;
  "--ar-safe-left": string;
  "--ar-coach-px": string;
};

export function arZeroInsets(): ArInsets {
  return { top: 0, right: 0, bottom: 0, left: 0 };
}

export function arParsePx(raw: string | number | null | undefined): number {
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? raw : 0;
  }
  if (raw == null || raw === "") return 0;
  const n = parseFloat(String(raw));
  return Number.isFinite(n) ? n : 0;
}

export function arClampInset(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(AR_SAFE.ceil, n);
}

export function arMergeInsets(
  ...sources: Array<ArInsets | null | undefined>
): ArInsets {
  const out = arZeroInsets();
  for (const s of sources) {
    if (!s) continue;
    out.top = Math.max(out.top, arClampInset(s.top));
    out.right = Math.max(out.right, arClampInset(s.right));
    out.bottom = Math.max(out.bottom, arClampInset(s.bottom));
    out.left = Math.max(out.left, arClampInset(s.left));
  }
  return out;
}

export function arParseNativeInsets(data: unknown): ArInsets | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (typeof d.top !== "number" || !Number.isFinite(d.top)) return null;
  return {
    top: arClampInset(d.top),
    right: arClampInset(typeof d.right === "number" ? d.right : 0),
    bottom: arClampInset(typeof d.bottom === "number" ? d.bottom : 0),
    left: arClampInset(typeof d.left === "number" ? d.left : 0),
  };
}

export function arReadFontScale(rootPx?: number): number {
  const px =
    rootPx ??
    (typeof document !== "undefined"
      ? arParsePx(getComputedStyle(document.documentElement).fontSize)
      : AR_SAFE.baseFontPx);
  const scale = px / AR_SAFE.baseFontPx;
  if (!Number.isFinite(scale) || scale <= 0) return 1;
  return Math.max(0.85, Math.min(2, scale));
}

export function arCoachPx(fontScale: number): number {
  const n = AR_SAFE.baseFontPx * (Number.isFinite(fontScale) ? fontScale : 1);
  return Math.max(AR_SAFE.minCoachPx, Math.min(AR_SAFE.maxCoachPx, n));
}

export function arSafeChrome(input: {
  css?: ArInsets | null;
  native?: ArInsets | null;
  fontScale?: number;
}): ArSafeChrome {
  return {
    insets: arMergeInsets(input.css, input.native),
    coachPx: arCoachPx(input.fontScale ?? 1),
  };
}

export function arSafeVars(chrome: ArSafeChrome): ArSafeVars {
  return {
    "--ar-safe-top": `${chrome.insets.top}px`,
    "--ar-safe-right": `${chrome.insets.right}px`,
    "--ar-safe-bottom": `${chrome.insets.bottom}px`,
    "--ar-safe-left": `${chrome.insets.left}px`,
    "--ar-coach-px": `${chrome.coachPx}px`,
  };
}

export function arApplySafeVars(
  el: { style: { setProperty: (k: string, v: string) => void } } | null,
  chrome: ArSafeChrome,
): void {
  if (!el) return;
  const vars = arSafeVars(chrome);
  (Object.entries(vars) as Array<[keyof ArSafeVars, string]>).forEach(
    ([k, v]) => {
      el.style.setProperty(k, v);
    },
  );
}

export type ArSafeStyle = {
  getPropertyValue: (name: string) => string;
  paddingTop: string;
  paddingRight: string;
  paddingBottom: string;
  paddingLeft: string;
};

export function arReadHostInsets(
  el: Element | null,
  compute?: (el: Element) => ArSafeStyle,
): ArInsets {
  if (!el) return arZeroInsets();
  const style =
    compute?.(el) ??
    (typeof getComputedStyle === "function"
      ? (getComputedStyle(el) as unknown as ArSafeStyle)
      : null);
  if (!style) return arZeroInsets();
  const token = (name: string) => arParsePx(style.getPropertyValue(name));
  return {
    top:
      token("--safe-top") ||
      token("--ar-safe-top") ||
      arParsePx(style.paddingTop),
    right:
      token("--safe-right") ||
      token("--ar-safe-right") ||
      arParsePx(style.paddingRight),
    bottom:
      token("--safe-bottom") ||
      token("--ar-safe-bottom") ||
      arParsePx(style.paddingBottom),
    left:
      token("--safe-left") ||
      token("--ar-safe-left") ||
      arParsePx(style.paddingLeft),
  };
}

export type ArSafeClock = {
  every: (fn: () => void, ms: number) => () => void;
};

export function arArmSafe(
  opts: {
    readCss: () => ArInsets;
    readNative?: () => Promise<ArInsets | null>;
    fontScale?: () => number;
    apply: (chrome: ArSafeChrome) => void;
  },
  clock?: Partial<ArSafeClock>,
): { note: () => void; dispose: () => void } {
  const every =
    clock?.every ??
    ((fn, ms) => {
      const id = setInterval(fn, ms);
      return () => clearInterval(id);
    });

  let disposed = false;
  let lastKey = "";
  let lastNative: ArInsets | null = null;
  let nativeGen = 0;

  const publish = () => {
    if (disposed) return;
    const chrome = arSafeChrome({
      css: opts.readCss(),
      native: lastNative,
      fontScale: opts.fontScale?.() ?? arReadFontScale(),
    });
    const key = `${chrome.insets.top}:${chrome.insets.right}:${chrome.insets.bottom}:${chrome.insets.left}:${chrome.coachPx}`;
    if (key === lastKey) return;
    lastKey = key;
    opts.apply(chrome);
  };

  const pullNative = () => {
    if (!opts.readNative || disposed) return;
    const gen = ++nativeGen;
    void opts.readNative().then((next) => {
      if (disposed || gen !== nativeGen) return;
      lastNative = next;
      publish();
    });
  };

  const tick = () => {
    if (disposed) return;
    publish();
    pullNative();
  };

  const stopTick = every(tick, AR_SAFE.debounceMs);
  const onResize = () => tick();
  if (typeof window !== "undefined") {
    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("scroll", onResize);
  }
  tick();

  return {
    note: tick,
    dispose: () => {
      disposed = true;
      stopTick();
      if (typeof window !== "undefined") {
        window.removeEventListener("resize", onResize);
        window.visualViewport?.removeEventListener("resize", onResize);
        window.visualViewport?.removeEventListener("scroll", onResize);
      }
    },
  };
}
