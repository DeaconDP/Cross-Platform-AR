/** Readable AR chrome when contrast, transparency, or forced-colors change. */

export type ArContrastKind = "ok" | "boost" | "opaque";

export type ArDisplayPrefs = {
  contrast: "no-preference" | "more" | "less";
  reduceTransparency: boolean;
  differentiateWithoutColor: boolean;
  forcedColors: boolean;
};

export type ArNativeDisplayPrefs = {
  highContrast?: boolean;
  reduceTransparency?: boolean;
  differentiateWithoutColor?: boolean;
};

export type ArClassList = {
  add: (name: string) => void;
  remove: (name: string) => void;
};

const CONTRAST_CLASSES = [
  "is-ar-contrast-ok",
  "is-ar-contrast-boost",
  "is-ar-contrast-opaque",
  "is-ar-contrast",
] as const;

export function arCssMatches(
  query: string,
  matches?: (query: string) => boolean,
): boolean {
  if (matches) return matches(query);
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  try {
    return window.matchMedia(query).matches;
  } catch {
    return false;
  }
}

export function arReadCssDisplayPrefs(
  matches?: (query: string) => boolean,
): ArDisplayPrefs {
  const more = arCssMatches("(prefers-contrast: more)", matches);
  const less = !more && arCssMatches("(prefers-contrast: less)", matches);
  return {
    contrast: more ? "more" : less ? "less" : "no-preference",
    reduceTransparency: arCssMatches(
      "(prefers-reduced-transparency: reduce)",
      matches,
    ),
    differentiateWithoutColor: false,
    forcedColors: arCssMatches("(forced-colors: active)", matches),
  };
}

export function arMergeDisplayPrefs(
  css: ArDisplayPrefs,
  native?: ArNativeDisplayPrefs | null,
): ArDisplayPrefs {
  const high = Boolean(native?.highContrast);
  const reduce = Boolean(native?.reduceTransparency);
  const diff = Boolean(native?.differentiateWithoutColor);
  return {
    contrast: css.contrast === "more" || high ? "more" : css.contrast,
    reduceTransparency: css.reduceTransparency || reduce,
    differentiateWithoutColor: css.differentiateWithoutColor || diff,
    forcedColors: css.forcedColors,
  };
}

export function arContrastKind(prefs: ArDisplayPrefs): ArContrastKind {
  if (prefs.forcedColors || prefs.reduceTransparency) return "opaque";
  if (prefs.contrast === "more" || prefs.differentiateWithoutColor) {
    return "boost";
  }
  return "ok";
}

export function arContrastClass(kind: ArContrastKind): string {
  return `is-ar-contrast-${kind}`;
}

export function arContrastCoach(kind: ArContrastKind): string | null {
  if (kind === "opaque") {
    return "Labels stay solid so they stay readable over the camera.";
  }
  if (kind === "boost") {
    return "High contrast is on — labels stay readable over the camera.";
  }
  return null;
}

export function arApplyContrastClass(
  root: { classList: ArClassList },
  kind: ArContrastKind,
): void {
  for (const name of CONTRAST_CLASSES) root.classList.remove(name);
  root.classList.add(arContrastClass(kind));
  if (kind !== "ok") root.classList.add("is-ar-contrast");
}

export function arClearContrastClass(root: { classList: ArClassList }): void {
  for (const name of CONTRAST_CLASSES) root.classList.remove(name);
}

export function arArmContrast(opts?: {
  root?: { classList: ArClassList };
  getNative?: () => Promise<ArNativeDisplayPrefs | null>;
  matches?: (query: string) => boolean;
  onChange?: (kind: ArContrastKind, prefs: ArDisplayPrefs) => void;
}): () => void {
  const root = opts?.root ?? document.documentElement;
  let disposed = false;

  const apply = (native?: ArNativeDisplayPrefs | null) => {
    if (disposed) return;
    const prefs = arMergeDisplayPrefs(
      arReadCssDisplayPrefs(opts?.matches),
      native,
    );
    const kind = arContrastKind(prefs);
    arApplyContrastClass(root, kind);
    opts?.onChange?.(kind, prefs);
  };

  apply(null);
  void opts?.getNative?.().then((native) => apply(native));

  const queries = [
    "(prefers-contrast: more)",
    "(prefers-contrast: less)",
    "(prefers-reduced-transparency: reduce)",
    "(forced-colors: active)",
  ];
  const media =
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? queries.map((q) => {
          try {
            return window.matchMedia(q);
          } catch {
            return null;
          }
        })
      : [];
  const onMedia = () => {
    void (async () => {
      const native = opts?.getNative ? await opts.getNative() : null;
      apply(native);
    })();
  };
  for (const mql of media) {
    if (!mql) continue;
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", onMedia);
    } else {
      mql.addListener?.(onMedia);
    }
  }

  return () => {
    disposed = true;
    for (const mql of media) {
      if (!mql) continue;
      if (typeof mql.removeEventListener === "function") {
        mql.removeEventListener("change", onMedia);
      } else {
        mql.removeListener?.(onMedia);
      }
    }
    arClearContrastClass(root);
  };
}
