export type ArLuxLevel = "ok" | "bright" | "glare";
export type ArLuxPlatform = "ios" | "android" | "web";
export type ArLuxProduct = "place" | "scan" | "emily" | "cubes";

export type ArLuxSample = {
  /** Android TYPE_LIGHT lux, iOS ARKit ambientIntensity, web AmbientLightSensor. -1 unknown. */
  lux: number;
  platform: ArLuxPlatform;
};

export type ArLuxNative = {
  lux: number;
  level?: string;
  opaque?: boolean;
};

export type ArLuxJudge = {
  level: ArLuxLevel;
  opaque: boolean;
  contrast: boolean;
  coach: string;
};

export const AR_LUX_HOLD_UP_MS = 400;
export const AR_LUX_HOLD_DOWN_MS = 800;
export const AR_LUX_POLL_MS = 1000;

/** Direct sun / beach / outdoor Cradle terrace. */
export const AR_LUX_ANDROID_BRIGHT = 8000;
export const AR_LUX_ANDROID_GLARE = 25000;
/** ARKit ambientIntensity: 1000 = neutral indoor. */
export const AR_LUX_IOS_BRIGHT = 1600;
export const AR_LUX_IOS_GLARE = 2200;

const RANK: Record<ArLuxLevel, number> = {
  ok: 0,
  bright: 1,
  glare: 2,
};

export function arLuxRank(level: ArLuxLevel): number {
  return RANK[level] ?? 0;
}

export function arLevelFromAndroidLux(lux: number): ArLuxLevel {
  if (lux < 0) return "ok";
  if (lux < AR_LUX_ANDROID_BRIGHT) return "ok";
  if (lux < AR_LUX_ANDROID_GLARE) return "bright";
  return "glare";
}

export function arLevelFromIosIntensity(lux: number): ArLuxLevel {
  if (lux < 0) return "ok";
  if (lux < AR_LUX_IOS_BRIGHT) return "ok";
  if (lux < AR_LUX_IOS_GLARE) return "bright";
  return "glare";
}

export function arJudgeLuxLevel(sample: ArLuxSample): ArLuxLevel {
  if (sample.lux < 0) return "ok";
  if (sample.platform === "ios") return arLevelFromIosIntensity(sample.lux);
  return arLevelFromAndroidLux(sample.lux);
}

export function arLuxCoach(level: ArLuxLevel, product: ArLuxProduct): string {
  if (level === "ok") return "";
  if (level === "bright") {
    if (product === "emily") return "Bright sun — I made my words a bit stronger.";
    if (product === "scan") return "Bright sun — plaque copy is stronger so you can read it.";
    return "Bright sun — chrome is a bit stronger so you can read it.";
  }
  if (product === "emily") return "Bright sun — solid labels so you can still read Close.";
  if (product === "scan") {
    return "Bright sun — solid chrome so the hunt copy stays readable.";
  }
  if (product === "cubes") {
    return "Bright sun — solid chrome so Exit stays readable.";
  }
  return "Bright sun — solid chrome so you can still read Close.";
}

export function arLuxProfile(
  level: ArLuxLevel,
  product: ArLuxProduct,
): ArLuxJudge {
  const coach = arLuxCoach(level, product);
  if (level === "ok") {
    return { level, opaque: false, contrast: false, coach };
  }
  if (level === "bright") {
    return { level, opaque: false, contrast: true, coach };
  }
  return { level, opaque: true, contrast: true, coach };
}

export function arHoldLux(args: {
  shown: ArLuxLevel;
  raw: ArLuxLevel;
  heldMs: number;
}): ArLuxLevel {
  if (args.raw === args.shown) return args.shown;
  const up = arLuxRank(args.raw) > arLuxRank(args.shown);
  const need = up ? AR_LUX_HOLD_UP_MS : AR_LUX_HOLD_DOWN_MS;
  return args.heldMs >= need ? args.raw : args.shown;
}

export function arParseLuxEvent(
  data: ArLuxNative | null | undefined,
  platform: ArLuxPlatform,
): ArLuxSample {
  const lux =
    typeof data?.lux === "number" && Number.isFinite(data.lux) ? data.lux : -1;
  return { lux, platform };
}

export function arApplyLuxClass(
  el: HTMLElement | null | undefined,
  level: ArLuxLevel,
): void {
  if (!el) return;
  el.classList.toggle("is-ar-lux", level !== "ok");
  el.classList.toggle("is-ar-lux-bright", level === "bright");
  el.classList.toggle("is-ar-lux-glare", level === "glare");
}

export function arClearLuxClass(el: HTMLElement | null | undefined): void {
  if (!el) return;
  el.classList.remove("is-ar-lux", "is-ar-lux-bright", "is-ar-lux-glare");
}

export function arLuxPlatformFromCap(platform: string): ArLuxPlatform {
  if (platform === "ios") return "ios";
  if (platform === "android") return "android";
  return "web";
}

type AmbientLightSensorLike = {
  illuminance: number;
  start: () => void;
  stop: () => void;
  onreading: (() => void) | null;
  onerror: (() => void) | null;
};

type SensorCtor = new () => AmbientLightSensorLike;

export type ArLuxArmOpts = {
  product: ArLuxProduct;
  getNative?: () => Promise<ArLuxNative | null>;
  platform?: ArLuxPlatform;
  onChange?: (judge: ArLuxJudge) => void;
  pollMs?: number;
  root?: HTMLElement | null;
};

export type ArLuxHandle = {
  dispose: () => void;
  snapshot: () => ArLuxJudge;
  pushNative: (data: ArLuxNative | null) => void;
};

export function arArmLux(opts: ArLuxArmOpts): ArLuxHandle {
  const product = opts.product;
  const platform = opts.platform ?? "web";
  const pollMs = opts.pollMs ?? AR_LUX_POLL_MS;
  const root =
    opts.root ??
    (typeof document !== "undefined" ? document.documentElement : null);

  let disposed = false;
  let nativeLux = -1;
  let webLux = -1;
  let shown: ArLuxLevel = "ok";
  let pending: ArLuxLevel = "ok";
  let pendingSince = 0;
  let judge = arLuxProfile("ok", product);
  let poll = 0;
  let sensor: AmbientLightSensorLike | null = null;

  const nowMs = () =>
    typeof performance !== "undefined" ? performance.now() : Date.now();

  const publish = (now: number) => {
    const lux = nativeLux >= 0 ? nativeLux : webLux;
    const raw = arJudgeLuxLevel({
      lux,
      platform: nativeLux >= 0 ? platform : "web",
    });
    if (raw !== pending) {
      pending = raw;
      pendingSince = now;
    }
    const next = arHoldLux({
      shown,
      raw,
      heldMs: now - pendingSince,
    });
    if (next === shown && next === judge.level) return;
    shown = next;
    judge = arLuxProfile(shown, product);
    arApplyLuxClass(root, shown);
    opts.onChange?.(judge);
  };

  const pull = () => {
    if (disposed || !opts.getNative) return;
    void opts
      .getNative()
      .then((data) => {
        if (disposed || !data) return;
        if (typeof data.lux === "number") nativeLux = data.lux;
        publish(nowMs());
      })
      .catch(() => undefined);
  };

  const SensorCtor = (
    typeof globalThis !== "undefined"
      ? (globalThis as { AmbientLightSensor?: SensorCtor }).AmbientLightSensor
      : undefined
  );
  if (SensorCtor && platform === "web") {
    try {
      sensor = new SensorCtor();
      sensor.onreading = () => {
        if (disposed || !sensor) return;
        if (typeof sensor.illuminance === "number") webLux = sensor.illuminance;
        publish(nowMs());
      };
      sensor.onerror = () => undefined;
      sensor.start();
    } catch {
      sensor = null;
    }
  }

  pull();
  if (typeof window !== "undefined") {
    poll = window.setInterval(pull, pollMs);
  }

  return {
    dispose() {
      disposed = true;
      if (poll && typeof window !== "undefined") {
        window.clearInterval(poll);
      }
      if (sensor) {
        try {
          sensor.stop();
        } catch {
          /* already stopped */
        }
        sensor = null;
      }
      arClearLuxClass(root);
    },
    snapshot: () => judge,
    pushNative(data) {
      if (disposed || !data) return;
      if (typeof data.lux === "number") nativeLux = data.lux;
      publish(nowMs());
    },
  };
}
