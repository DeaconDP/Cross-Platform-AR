/** PWM / fluorescent flicker steward — museum lights that strobe the camera. */

export type ArFlickerKind = "ok" | "flicker" | "strobe";
export type ArFlickerProduct = "place" | "scan" | "emily" | "cubes";

export const AR_FLICKER_WARMUP_MS = 800;
export const AR_FLICKER_HOLD_MS = 400;
export const AR_FLICKER_RELEASE_MS = 800;
export const AR_FLICKER_P2P = 0.06;
export const AR_FLICKER_STROBE_P2P = 0.18;
export const AR_FLICKER_CV = 0.1;
export const AR_FLICKER_STROBE_CV = 0.22;
export const AR_FLICKER_FLIPS = 3;
export const AR_FLICKER_STROBE_FLIPS = 4;
export const AR_FLICKER_BAND = 0.16;
export const AR_FLICKER_WINDOW = 12;

export type ArFlickerHold = {
  kind: ArFlickerKind;
  raw: ArFlickerKind;
  since: number;
};

export type ArFlickerState = {
  kind: ArFlickerKind;
  p2p: number;
  valid: boolean;
};

export type ArFlickerBuf = {
  lumas: number[];
  lastBandSign: number;
  started: number;
};

export function arFlickerBuf(now: number): ArFlickerBuf {
  return { lumas: [], lastBandSign: 0, started: now };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/** iOS ambientIntensity (lm) → 0–1-ish luma. */
export function arFlickerLumaFromLux(intensity: number): number {
  if (!Number.isFinite(intensity) || intensity <= 0) return 0;
  return clamp01(intensity / 1000);
}

export function arFlickerStats(lumas: number[]): {
  p2p: number;
  cv: number;
  flips: number;
} {
  if (lumas.length < 2) return { p2p: 0, cv: 0, flips: 0 };
  let min = lumas[0]!;
  let max = lumas[0]!;
  let sum = 0;
  let flips = 0;
  let prevDelta = 0;
  for (let i = 0; i < lumas.length; i++) {
    const v = lumas[i]!;
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
    if (i > 0) {
      const d = v - lumas[i - 1]!;
      if (prevDelta !== 0 && d !== 0 && Math.sign(d) !== Math.sign(prevDelta)) {
        flips += 1;
      }
      if (d !== 0) prevDelta = d;
    }
  }
  const mean = sum / lumas.length;
  let varSum = 0;
  for (const v of lumas) varSum += (v - mean) * (v - mean);
  const std = Math.sqrt(varSum / lumas.length);
  const cv = mean < 1e-4 ? 0 : std / mean;
  return { p2p: max - min, cv, flips };
}

export function arFlickerKindFromSamples(
  lumas: number[],
  bandFlip = false,
): ArFlickerKind {
  if (lumas.length < 4) return "ok";
  const { p2p, cv, flips } = arFlickerStats(lumas);
  if (
    bandFlip ||
    p2p >= AR_FLICKER_STROBE_P2P ||
    (cv >= AR_FLICKER_STROBE_CV && flips >= AR_FLICKER_STROBE_FLIPS)
  ) {
    return "strobe";
  }
  if (
    p2p >= AR_FLICKER_P2P ||
    (cv >= AR_FLICKER_CV && flips >= AR_FLICKER_FLIPS)
  ) {
    return "flicker";
  }
  return "ok";
}

export function arFlickerPush(
  buf: ArFlickerBuf,
  luma: number,
  now: number,
  band?: { top: number; bot: number },
): ArFlickerKind {
  if (Number.isFinite(luma)) {
    buf.lumas.push(clamp01(luma));
    if (buf.lumas.length > AR_FLICKER_WINDOW) buf.lumas.shift();
  }
  let bandFlip = false;
  if (band) {
    const d = clamp01(band.top) - clamp01(band.bot);
    const sign = d > AR_FLICKER_BAND ? 1 : d < -AR_FLICKER_BAND ? -1 : 0;
    if (sign !== 0 && buf.lastBandSign !== 0 && sign !== buf.lastBandSign) {
      bandFlip = true;
    }
    if (sign !== 0) buf.lastBandSign = sign;
  }
  if (now - buf.started < AR_FLICKER_WARMUP_MS) return "ok";
  return arFlickerKindFromSamples(buf.lumas, bandFlip);
}

/** 400 ms into a warning; 800 ms back to ok. First sample stays ok. */
export function arFlickerStep(
  prev: ArFlickerHold | null,
  raw: ArFlickerKind,
  now: number,
): ArFlickerHold {
  if (!prev) return { kind: "ok", raw, since: now };
  if (raw === prev.raw) {
    if (raw !== prev.kind) {
      const need = raw === "ok" ? AR_FLICKER_RELEASE_MS : AR_FLICKER_HOLD_MS;
      if (now - prev.since >= need) return { kind: raw, raw, since: now };
    }
    return prev;
  }
  return { kind: prev.kind, raw, since: now };
}

export function arFlickerCoach(
  kind: ArFlickerKind,
  product: ArFlickerProduct,
): string | null {
  if (kind === "ok") return null;
  if (kind === "flicker") {
    if (product === "scan") {
      return "Flickering lights — hold the marker in even light.";
    }
    if (product === "emily") {
      return "Flickering lights — I'll sit once the picture steadies.";
    }
    if (product === "cubes") {
      return "Flickering lights — find even light, then tap.";
    }
    return "Lights are flickering — tilt a little or step to even light.";
  }
  if (product === "scan") return "Strobe lights — wait for the picture to steady.";
  if (product === "emily") return "Strobe lights — hold still, then tap a table.";
  if (product === "cubes") return "Strobe lights — wait a beat, then tap.";
  return "Strobe lights — hold still, then tap when the picture steadies.";
}

/** Strobe blocks place (not scan — the camera still hunts the plaque). */
export function arFlickerBlocksPlace(
  kind: ArFlickerKind,
  product: ArFlickerProduct,
): boolean {
  return kind === "strobe" && product !== "scan";
}

export function arFlickerApplyClass(
  el: Element | null,
  kind: ArFlickerKind,
): void {
  if (!el) return;
  el.classList.toggle("is-ar-flicker", kind === "flicker");
  el.classList.toggle("is-ar-strobe", kind === "strobe");
}

let sampleCanvas: HTMLCanvasElement | null = null;

function sampleCtx(): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") return null;
  if (!sampleCanvas) sampleCanvas = document.createElement("canvas");
  sampleCanvas.width = 16;
  sampleCanvas.height = 16;
  return sampleCanvas.getContext("2d", { willReadFrequently: true });
}

/** Mean luma + optional top/bottom band from a live camera video. */
export function arFlickerSampleVideo(
  el: HTMLVideoElement | null | undefined,
): { luma: number; top: number; bot: number } | null {
  if (!el || el.readyState < 2 || el.videoWidth < 2) return null;
  const ctx = sampleCtx();
  if (!ctx) return null;
  try {
    ctx.drawImage(el, 0, 0, 16, 16);
    const data = ctx.getImageData(0, 0, 16, 16).data;
    let sum = 0;
    let top = 0;
    let bot = 0;
    const n = data.length / 4;
    const row = 16;
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      const y =
        (0.2126 * data[o]! + 0.7152 * data[o + 1]! + 0.0722 * data[o + 2]!) /
        255;
      sum += y;
      if (i < row * 5) top += y;
      if (i >= row * 11) bot += y;
    }
    return { luma: sum / n, top: top / (row * 5), bot: bot / (row * 5) };
  } catch {
    return null;
  }
}

export type ArFlickerArm = { dispose: () => void };

export function arFlickerArm(opts: {
  product: ArFlickerProduct;
  getSample: () =>
    | { luma: number; top?: number; bot?: number }
    | null
    | Promise<{ luma: number; top?: number; bot?: number } | null>;
  onKind: (kind: ArFlickerKind, coach: string | null) => void;
  intervalMs?: number;
  now?: () => number;
}): ArFlickerArm {
  const nowFn = opts.now ?? Date.now;
  let hold: ArFlickerHold | null = null;
  let buf = arFlickerBuf(nowFn());
  let alive = true;
  const tick = async () => {
    if (!alive) return;
    const now = nowFn();
    const sample = await opts.getSample();
    const raw = sample
      ? arFlickerPush(
          buf,
          sample.luma,
          now,
          sample.top != null && sample.bot != null
            ? { top: sample.top, bot: sample.bot }
            : undefined,
        )
      : hold?.raw ?? "ok";
    hold = arFlickerStep(hold, raw, now);
    opts.onKind(hold.kind, arFlickerCoach(hold.kind, opts.product));
  };
  const id =
    typeof window !== "undefined"
      ? window.setInterval(() => {
          void tick();
        }, opts.intervalMs ?? 250)
      : 0;
  void tick();
  return {
    dispose() {
      alive = false;
      if (typeof window !== "undefined") window.clearInterval(id);
    },
  };
}

export function arFlickerParseNative(data: {
  kind?: string;
  p2p?: number;
  valid?: boolean;
}): ArFlickerState {
  const kind: ArFlickerKind =
    data.kind === "flicker" || data.kind === "strobe" || data.kind === "ok"
      ? data.kind
      : "ok";
  const p2p = Number(data.p2p);
  return {
    kind,
    p2p: Number.isFinite(p2p) ? p2p : 0,
    valid: data.valid === true,
  };
}
