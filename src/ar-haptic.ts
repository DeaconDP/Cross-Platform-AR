export type ArHapticKind = "surface" | "place" | "miss" | "error" | "lift";
export type ArHapticProduct = "place" | "scan" | "cubes" | "emily";

export type ArHapticPrefs = {
  /** System haptic setting. Missing means assume on. */
  enabled?: boolean;
  /** Silent switch / ringer off / output volume ~0. */
  muted?: boolean;
  /** Web Vibration API present. Missing means try anyway. */
  vibrate?: boolean;
};

export const AR_HAPTIC_GAP_MS = 90;

const PATTERNS: Record<ArHapticKind, number[]> = {
  surface: [12],
  place: [22],
  miss: [8, 36, 10],
  error: [28, 48, 28],
  lift: [16],
};

export function arHapticPattern(kind: ArHapticKind): number[] {
  return PATTERNS[kind] ?? PATTERNS.place;
}

export function arHapticEnabled(prefs: ArHapticPrefs = {}): boolean {
  return prefs.enabled !== false;
}

export function arHapticCanVibrate(prefs: ArHapticPrefs = {}): boolean {
  return arHapticEnabled(prefs) && prefs.vibrate !== false;
}

export function arHapticCoach(
  kind: ArHapticKind,
  product: ArHapticProduct,
  prefs: ArHapticPrefs = {},
): string {
  if (kind === "miss") {
    if (product === "emily") return "Hmm, try a flatter spot?";
    if (product === "cubes") return "No surface under that tap.";
    if (product === "scan") return "Still looking for the plaque — hold steady.";
    return "Scan a flat surface, then tap the highlighted area.";
  }
  if (kind === "error") {
    if (product === "emily") return "I couldn’t start AR.";
    if (product === "cubes") return "Native AR failed to start.";
    if (product === "scan") return "Could not start the camera for this exhibit.";
    return "Could not start the camera on this device.";
  }
  if (kind === "place" && prefs.muted) {
    if (product === "emily") return "Placed — sound is off, so I tapped instead.";
    if (product === "scan") return "Found it — sound is off.";
    if (product === "cubes") return "Placed — ringer is silent.";
    return "Placed — sound is off, so the buzz is the cue.";
  }
  return "";
}

export function arHapticShouldPlay(
  kind: ArHapticKind,
  prefs: ArHapticPrefs,
  lastAt: number,
  now: number,
  lastKind?: ArHapticKind,
): boolean {
  if (!arHapticEnabled(prefs)) return false;
  if (now - lastAt < AR_HAPTIC_GAP_MS && lastKind === kind) return false;
  return true;
}

export type ArHapticArm = {
  play: (kind: ArHapticKind) => boolean;
  dispose: () => void;
};

export function arArmHaptic(opts: {
  product: ArHapticProduct;
  playNative?: (kind: ArHapticKind) => Promise<void> | void;
  vibrate?: (pattern: number[]) => void;
  prefs?: () => ArHapticPrefs;
  now?: () => number;
  onCoach?: (coach: string, kind: ArHapticKind) => void;
}): ArHapticArm {
  let lastAt = 0;
  let lastKind: ArHapticKind | undefined;
  let disposed = false;

  const webVibrate = (pattern: number[]) => {
    if (opts.vibrate) {
      opts.vibrate(pattern);
      return;
    }
    try {
      navigator.vibrate?.(pattern);
    } catch {
      /* unsupported */
    }
  };

  return {
    play: (kind) => {
      if (disposed) return false;
      const prefs = opts.prefs?.() ?? {};
      const now = (opts.now ?? Date.now)();
      if (!arHapticShouldPlay(kind, prefs, lastAt, now, lastKind)) return false;
      lastAt = now;
      lastKind = kind;
      const coach = arHapticCoach(kind, opts.product, prefs);
      if (coach) opts.onCoach?.(coach, kind);
      const pattern = arHapticPattern(kind);
      if (opts.playNative) {
        try {
          void Promise.resolve(opts.playNative(kind)).catch(() => {
            if (arHapticCanVibrate(prefs)) webVibrate(pattern);
          });
        } catch {
          if (arHapticCanVibrate(prefs)) webVibrate(pattern);
        }
      } else if (arHapticCanVibrate(prefs)) {
        webVibrate(pattern);
      }
      return true;
    },
    dispose: () => {
      disposed = true;
    },
  };
}
