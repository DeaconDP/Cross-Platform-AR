export type ArLensLevel = "ok" | "covered";
export type ArLensProduct = "place" | "scan" | "emily" | "cubes";

export type ArLensSample = {
  /** Mean luma 0–1. -1 unknown. */
  mean: number;
  /** Luma variance 0–1. -1 unknown. */
  variance: number;
};

export type ArLensNative = {
  mean: number;
  variance: number;
  level?: string;
  blocked?: boolean;
};

export type ArLensJudge = {
  level: ArLensLevel;
  blocked: boolean;
  coach: string;
};

export const AR_LENS_HOLD_UP_MS = 400;
export const AR_LENS_HOLD_DOWN_MS = 800;
export const AR_LENS_POLL_MS = 700;
/** Uniform dark = finger / case / table covering the rear lens. */
export const AR_LENS_MEAN_MAX = 0.1;
export const AR_LENS_VAR_MAX = 0.0028;

export function arJudgeLens(sample: ArLensSample): ArLensLevel {
  if (sample.mean < 0 || sample.variance < 0) return "ok";
  if (sample.mean <= AR_LENS_MEAN_MAX && sample.variance <= AR_LENS_VAR_MAX) {
    return "covered";
  }
  return "ok";
}

export function arSampleLumaBytes(values: Iterable<number>): ArLensSample {
  let n = 0;
  let sum = 0;
  let sum2 = 0;
  for (const raw of values) {
    if (!Number.isFinite(raw)) continue;
    const v = raw > 1 ? raw / 255 : raw;
    const clamped = Math.min(1, Math.max(0, v));
    sum += clamped;
    sum2 += clamped * clamped;
    n += 1;
  }
  if (n < 4) return { mean: -1, variance: -1 };
  const mean = sum / n;
  return { mean, variance: Math.max(0, sum2 / n - mean * mean) };
}

export function arSampleRgba(data: ArrayLike<number>): ArLensSample {
  const luma: number[] = [];
  for (let i = 0; i + 3 < data.length; i += 4) {
    luma.push((0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!) / 255);
  }
  return arSampleLumaBytes(luma);
}

let scratch: HTMLCanvasElement | null = null;

export function arSampleVideoLuma(
  video: HTMLVideoElement | null | undefined,
): ArLensSample | null {
  if (!video || video.readyState < 2 || video.videoWidth < 8) return null;
  if (typeof document === "undefined") return null;
  if (!scratch) scratch = document.createElement("canvas");
  scratch.width = 8;
  scratch.height = 8;
  const ctx = scratch.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  try {
    ctx.drawImage(video, 0, 0, 8, 8);
    return arSampleRgba(ctx.getImageData(0, 0, 8, 8).data);
  } catch {
    return null;
  }
}

export function arLensCoach(level: ArLensLevel, product: ArLensProduct): string {
  if (level === "ok") return "";
  if (product === "emily") return "I can’t see — move your finger off the camera.";
  if (product === "scan") {
    return "The camera is covered — uncover the lens to find the plaque.";
  }
  if (product === "cubes") {
    return "Camera is covered — uncover the lens to find a table.";
  }
  return "The camera is covered — move your finger off the lens.";
}

export function arLensProfile(
  level: ArLensLevel,
  product: ArLensProduct,
): ArLensJudge {
  return {
    level,
    blocked: level === "covered",
    coach: arLensCoach(level, product),
  };
}

export function arHoldLens(args: {
  shown: ArLensLevel;
  raw: ArLensLevel;
  heldMs: number;
}): ArLensLevel {
  if (args.raw === args.shown) return args.shown;
  const up = args.raw === "covered";
  const need = up ? AR_LENS_HOLD_UP_MS : AR_LENS_HOLD_DOWN_MS;
  return args.heldMs >= need ? args.raw : args.shown;
}

export function arParseLensEvent(
  data: ArLensNative | null | undefined,
): ArLensSample {
  const mean =
    typeof data?.mean === "number" && Number.isFinite(data.mean) ? data.mean : -1;
  const variance =
    typeof data?.variance === "number" && Number.isFinite(data.variance)
      ? data.variance
      : -1;
  return { mean, variance };
}

export function arLensShouldPlace(judge: ArLensJudge): boolean {
  return !judge.blocked;
}

export function arApplyLensClass(
  el: HTMLElement | null | undefined,
  level: ArLensLevel,
): void {
  if (!el) return;
  el.classList.toggle("is-ar-lens", level === "covered");
}

export function arClearLensClass(el: HTMLElement | null | undefined): void {
  if (!el) return;
  el.classList.remove("is-ar-lens");
}

export type ArLensArmOpts = {
  product: ArLensProduct;
  getNative?: () => Promise<ArLensNative | null>;
  getVideo?: () => HTMLVideoElement | null;
  onChange?: (judge: ArLensJudge) => void;
  pollMs?: number;
  root?: HTMLElement | null;
};

export type ArLensHandle = {
  dispose: () => void;
  snapshot: () => ArLensJudge;
  pushNative: (data: ArLensNative | null) => void;
};

export function arArmLens(opts: ArLensArmOpts): ArLensHandle {
  const product = opts.product;
  const pollMs = opts.pollMs ?? AR_LENS_POLL_MS;
  const root =
    opts.root ??
    (typeof document !== "undefined" ? document.documentElement : null);

  let disposed = false;
  let nativeSample: ArLensSample = { mean: -1, variance: -1 };
  let webSample: ArLensSample = { mean: -1, variance: -1 };
  let shown: ArLensLevel = "ok";
  let pending: ArLensLevel = "ok";
  let pendingSince = 0;
  let judge = arLensProfile("ok", product);
  let poll = 0;

  const nowMs = () =>
    typeof performance !== "undefined" ? performance.now() : Date.now();

  const publish = (now: number) => {
    const sample = nativeSample.mean >= 0 ? nativeSample : webSample;
    const raw = arJudgeLens(sample);
    if (raw !== pending) {
      pending = raw;
      pendingSince = now;
    }
    const next = arHoldLens({
      shown,
      raw,
      heldMs: now - pendingSince,
    });
    if (next === shown && next === judge.level) return;
    shown = next;
    judge = arLensProfile(shown, product);
    arApplyLensClass(root, shown);
    opts.onChange?.(judge);
  };

  const pull = () => {
    if (disposed) return;
    if (opts.getVideo) {
      const sampled = arSampleVideoLuma(opts.getVideo());
      if (sampled) webSample = sampled;
    }
    if (!opts.getNative) {
      publish(nowMs());
      return;
    }
    void opts
      .getNative()
      .then((data) => {
        if (disposed || !data) return;
        nativeSample = arParseLensEvent(data);
        publish(nowMs());
      })
      .catch(() => undefined);
    publish(nowMs());
  };

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
      arClearLensClass(root);
    },
    snapshot: () => judge,
    pushNative(data) {
      if (disposed || !data) return;
      nativeSample = arParseLensEvent(data);
      publish(nowMs());
    },
  };
}
