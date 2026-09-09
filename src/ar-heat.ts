export type ArHeatLevel = "ok" | "warm" | "hot" | "critical";
export type ArHeatPlatform = "ios" | "android" | "web";
export type ArHeatProduct = "place" | "scan" | "emily" | "cubes";

export type ArHeatSample = {
  /** iOS 0–3, Android 0–6, unknown -1 */
  thermal: number;
  platform: ArHeatPlatform;
  /** rAF frame cost ms; -1 unknown */
  frameMs: number;
};

export type ArHeatNative = {
  thermal: number;
  level?: string;
  lowFx?: boolean;
};

export type ArHeatJudge = {
  level: ArHeatLevel;
  lowFx: boolean;
  pixelRatio: number;
  antialias: boolean;
  enableFx: boolean;
  featurePoints: boolean;
  coach: string;
};

export const AR_HEAT_HOLD_UP_MS = 400;
export const AR_HEAT_HOLD_DOWN_MS = 800;
export const AR_HEAT_POLL_MS = 1000;

const RANK: Record<ArHeatLevel, number> = {
  ok: 0,
  warm: 1,
  hot: 2,
  critical: 3,
};

export function arHeatRank(level: ArHeatLevel): number {
  return RANK[level] ?? 0;
}

export function arLevelFromIos(thermal: number): ArHeatLevel {
  if (thermal <= 0) return "ok";
  if (thermal === 1) return "warm";
  if (thermal === 2) return "hot";
  return "critical";
}

export function arLevelFromAndroid(thermal: number): ArHeatLevel {
  if (thermal < 0) return "ok";
  if (thermal <= 1) return "ok";
  if (thermal === 2) return "warm";
  if (thermal === 3) return "hot";
  return "critical";
}

export function arLevelFromFrame(frameMs: number): ArHeatLevel {
  if (frameMs < 0 || frameMs < 22) return "ok";
  if (frameMs < 36) return "warm";
  if (frameMs < 55) return "hot";
  return "critical";
}

export function arLevelFromThermal(
  thermal: number,
  platform: ArHeatPlatform,
): ArHeatLevel {
  if (thermal < 0 || platform === "web") return "ok";
  if (platform === "ios") return arLevelFromIos(thermal);
  return arLevelFromAndroid(thermal);
}

export function arJudgeHeatLevel(sample: ArHeatSample): ArHeatLevel {
  if (sample.thermal >= 0 && sample.platform !== "web") {
    return arLevelFromThermal(sample.thermal, sample.platform);
  }
  return arLevelFromFrame(sample.frameMs);
}

export function arHeatCoach(
  level: ArHeatLevel,
  product: ArHeatProduct,
): string {
  if (level === "ok") return "";
  if (level === "warm") {
    if (product === "emily") return "I'm warming up — keeping the camera light.";
    if (product === "scan") return "Phone is warming up — hold the plaque steady.";
    return "Phone is warming up — keep the session short.";
  }
  if (level === "hot") {
    if (product === "emily") {
      return "Phone is hot — I dropped sparkles so tracking stays up.";
    }
    if (product === "cubes") {
      return "Phone is hot — cubes stay simple so tracking stays up.";
    }
    if (product === "scan") {
      return "Phone is hot — visuals eased so the marker stays locked.";
    }
    return "Phone is hot — visuals eased so tracking stays up.";
  }
  if (product === "emily") return "Phone is too hot — leave Place and let it cool.";
  if (product === "scan") {
    return "Phone is too hot — close the camera and let it cool.";
  }
  return "Phone is too hot — close AR and let it cool.";
}

export function arHeatProfile(
  level: ArHeatLevel,
  product: ArHeatProduct,
): ArHeatJudge {
  const coach = arHeatCoach(level, product);
  if (level === "ok") {
    return {
      level,
      lowFx: false,
      pixelRatio: 2,
      antialias: true,
      enableFx: true,
      featurePoints: true,
      coach,
    };
  }
  if (level === "warm") {
    return {
      level,
      lowFx: false,
      pixelRatio: 1.5,
      antialias: true,
      enableFx: true,
      featurePoints: false,
      coach,
    };
  }
  if (level === "hot") {
    return {
      level,
      lowFx: true,
      pixelRatio: 1.25,
      antialias: false,
      enableFx: false,
      featurePoints: false,
      coach,
    };
  }
  return {
    level,
    lowFx: true,
    pixelRatio: 1,
    antialias: false,
    enableFx: false,
    featurePoints: false,
    coach,
  };
}

export function arHoldHeat(args: {
  shown: ArHeatLevel;
  raw: ArHeatLevel;
  heldMs: number;
}): ArHeatLevel {
  if (args.raw === args.shown) return args.shown;
  const up = arHeatRank(args.raw) > arHeatRank(args.shown);
  const need = up ? AR_HEAT_HOLD_UP_MS : AR_HEAT_HOLD_DOWN_MS;
  return args.heldMs >= need ? args.raw : args.shown;
}

export function arParseHeatEvent(
  data: ArHeatNative | null | undefined,
  platform: ArHeatPlatform,
): ArHeatSample {
  const thermal =
    typeof data?.thermal === "number" && Number.isFinite(data.thermal)
      ? data.thermal
      : -1;
  return { thermal, platform, frameMs: -1 };
}

export function arApplyHeatClass(
  el: HTMLElement | null | undefined,
  level: ArHeatLevel,
): void {
  if (!el) return;
  el.classList.toggle("is-ar-heat", level !== "ok");
  el.classList.toggle("is-ar-heat-warm", level === "warm");
  el.classList.toggle("is-ar-heat-hot", level === "hot");
  el.classList.toggle("is-ar-heat-critical", level === "critical");
}

export function arClearHeatClass(el: HTMLElement | null | undefined): void {
  if (!el) return;
  el.classList.remove(
    "is-ar-heat",
    "is-ar-heat-warm",
    "is-ar-heat-hot",
    "is-ar-heat-critical",
  );
}

export function arHeatPlatformFromCap(platform: string): ArHeatPlatform {
  if (platform === "ios") return "ios";
  if (platform === "android") return "android";
  return "web";
}

export type ArHeatArmOpts = {
  product: ArHeatProduct;
  getNative?: () => Promise<ArHeatNative | null>;
  platform?: ArHeatPlatform;
  onChange?: (judge: ArHeatJudge) => void;
  pollMs?: number;
  root?: HTMLElement | null;
};

export type ArHeatHandle = {
  dispose: () => void;
  snapshot: () => ArHeatJudge;
  pushNative: (data: ArHeatNative | null) => void;
};

export function arArmHeat(opts: ArHeatArmOpts): ArHeatHandle {
  const product = opts.product;
  const platform = opts.platform ?? "web";
  const pollMs = opts.pollMs ?? AR_HEAT_POLL_MS;
  const root =
    opts.root ??
    (typeof document !== "undefined" ? document.documentElement : null);

  let disposed = false;
  let thermal = -1;
  let frameMs = -1;
  let ema = -1;
  let lastTs = 0;
  let shown: ArHeatLevel = "ok";
  let pending: ArHeatLevel = "ok";
  let pendingSince = 0;
  let judge = arHeatProfile("ok", product);
  let raf = 0;
  let poll = 0;

  const nowMs = () =>
    typeof performance !== "undefined" ? performance.now() : Date.now();

  const publish = (now: number) => {
    const raw = arJudgeHeatLevel({
      thermal,
      platform: thermal >= 0 ? platform : "web",
      frameMs,
    });
    if (raw !== pending) {
      pending = raw;
      pendingSince = now;
    }
    const next = arHoldHeat({
      shown,
      raw,
      heldMs: now - pendingSince,
    });
    if (next === shown && next === judge.level) return;
    shown = next;
    judge = arHeatProfile(shown, product);
    arApplyHeatClass(root, shown);
    opts.onChange?.(judge);
  };

  const onFrame = (ts: number) => {
    if (disposed) return;
    if (lastTs > 0) {
      const dt = ts - lastTs;
      if (dt > 0 && dt < 250) {
        ema = ema < 0 ? dt : ema * 0.85 + dt * 0.15;
        frameMs = ema;
      }
    }
    lastTs = ts;
    publish(ts);
    if (typeof requestAnimationFrame === "function") {
      raf = requestAnimationFrame(onFrame);
    }
  };

  const pull = () => {
    if (disposed || !opts.getNative) return;
    void opts.getNative()
      .then((data) => {
        if (disposed || !data) return;
        if (typeof data.thermal === "number") thermal = data.thermal;
        publish(nowMs());
      })
      .catch(() => undefined);
  };

  if (typeof requestAnimationFrame === "function") {
    raf = requestAnimationFrame(onFrame);
  }
  pull();
  if (typeof window !== "undefined") {
    poll = window.setInterval(pull, pollMs);
  }

  return {
    dispose() {
      disposed = true;
      if (raf && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(raf);
      }
      if (poll && typeof window !== "undefined") {
        window.clearInterval(poll);
      }
      arClearHeatClass(root);
    },
    snapshot: () => judge,
    pushNative(data) {
      if (disposed || !data) return;
      if (typeof data.thermal === "number") thermal = data.thermal;
      publish(nowMs());
    },
  };
}
