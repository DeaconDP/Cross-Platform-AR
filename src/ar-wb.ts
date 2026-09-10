/** Color-temperature steward — gallery tungsten vs cool daylight. */

export type ArWbKind = "ok" | "warm" | "cold";
export type ArWbProduct = "place" | "scan" | "emily" | "cubes";

export const AR_WB_WARM_K = 3400;
export const AR_WB_COLD_K = 7000;
export const AR_WB_HOLD_MS = 400;
export const AR_WB_RELEASE_MS = 800;

export type ArWbHold = {
  kind: ArWbKind;
  raw: ArWbKind;
  since: number;
};

export type ArWbState = {
  kind: ArWbKind;
  cct: number;
  valid: boolean;
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function lin(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** CIE xy from sRGB 0–1. */
export function arWbXyFromRgb(
  r: number,
  g: number,
  b: number,
): { x: number; y: number } | null {
  const R = lin(clamp01(r));
  const G = lin(clamp01(g));
  const B = lin(clamp01(b));
  const X = 0.4124564 * R + 0.3575761 * G + 0.1804375 * B;
  const Y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B;
  const Z = 0.0193339 * R + 0.119192 * G + 0.9503041 * B;
  const s = X + Y + Z;
  if (s < 1e-6) return null;
  return { x: X / s, y: Y / s };
}

/** McCamy correlated colour temperature from CIE xy. */
export function arWbCctFromXy(x: number, y: number): number {
  const n = (x - 0.332) / (0.1858 - y);
  return 449 * n * n * n + 3525 * n * n + 6823.3 * n + 5520.33;
}

export function arWbCctFromRgb(r: number, g: number, b: number): number | null {
  const xy = arWbXyFromRgb(r, g, b);
  if (!xy) return null;
  const cct = arWbCctFromXy(xy.x, xy.y);
  if (!Number.isFinite(cct) || cct < 1000 || cct > 20000) return null;
  return cct;
}

export function arWbKindFromCct(cct: number | null | undefined): ArWbKind {
  if (cct == null || !Number.isFinite(cct)) return "ok";
  if (cct < AR_WB_WARM_K) return "warm";
  if (cct > AR_WB_COLD_K) return "cold";
  return "ok";
}

/** 400 ms into a warning; 800 ms back to ok. First sample stays ok. */
export function arWbStep(
  prev: ArWbHold | null,
  raw: ArWbKind,
  now: number,
): ArWbHold {
  if (!prev) return { kind: "ok", raw, since: now };
  if (raw === prev.raw) {
    if (raw !== prev.kind) {
      const need = raw === "ok" ? AR_WB_RELEASE_MS : AR_WB_HOLD_MS;
      if (now - prev.since >= need) return { kind: raw, raw, since: now };
    }
    return prev;
  }
  return { kind: prev.kind, raw, since: now };
}

export function arWbCoach(
  kind: ArWbKind,
  product: ArWbProduct,
): string | null {
  if (kind === "ok") return null;
  if (kind === "warm") {
    if (product === "scan") {
      return "Gallery lights are warm — marker colours look orange.";
    }
    if (product === "emily") return "Warm lamps — my fur colour is approximate.";
    if (product === "cubes") return "Warm lights — cube colour is approximate.";
    return "Gallery lights are warm — fossil colour is approximate.";
  }
  if (product === "scan") {
    return "Cool daylight — marker colours look blue.";
  }
  if (product === "emily") return "Cool light — my fur colour is approximate.";
  if (product === "cubes") return "Cool light — cube colour is approximate.";
  return "Cool daylight — fossil colour is approximate.";
}

/** Colour is advisory — never block a tap. */
export function arWbBlocksPlace(_kind: ArWbKind): false {
  return false;
}

export function arWbApplyClass(el: Element | null, kind: ArWbKind): void {
  if (!el) return;
  el.classList.toggle("is-ar-wb-warm", kind === "warm");
  el.classList.toggle("is-ar-wb-cold", kind === "cold");
}

let sampleCanvas: HTMLCanvasElement | null = null;

function sampleCtx(): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") return null;
  if (!sampleCanvas) sampleCanvas = document.createElement("canvas");
  sampleCanvas.width = 16;
  sampleCanvas.height = 16;
  return sampleCanvas.getContext("2d", { willReadFrequently: true });
}

/** Average CCT from a live camera video (not an orbit canvas). */
export function arWbCctFromVideo(
  el: HTMLVideoElement | null | undefined,
): number | null {
  if (!el || el.readyState < 2 || el.videoWidth < 2) return null;
  const ctx = sampleCtx();
  if (!ctx) return null;
  try {
    ctx.drawImage(el, 0, 0, 16, 16);
    const data = ctx.getImageData(0, 0, 16, 16).data;
    let r = 0;
    let g = 0;
    let b = 0;
    const n = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i]!;
      g += data[i + 1]!;
      b += data[i + 2]!;
    }
    return arWbCctFromRgb(r / n / 255, g / n / 255, b / n / 255);
  } catch {
    return null;
  }
}

export type ArWbArm = { dispose: () => void };

export function arWbArm(opts: {
  product: ArWbProduct;
  getCct: () => number | null | Promise<number | null>;
  onKind: (kind: ArWbKind, coach: string | null) => void;
  intervalMs?: number;
  now?: () => number;
}): ArWbArm {
  let hold: ArWbHold | null = null;
  let alive = true;
  const tick = async () => {
    if (!alive) return;
    const cct = await opts.getCct();
    hold = arWbStep(hold, arWbKindFromCct(cct), (opts.now ?? Date.now)());
    opts.onKind(hold.kind, arWbCoach(hold.kind, opts.product));
  };
  const id =
    typeof window !== "undefined"
      ? window.setInterval(() => {
          void tick();
        }, opts.intervalMs ?? 400)
      : 0;
  void tick();
  return {
    dispose() {
      alive = false;
      if (typeof window !== "undefined") window.clearInterval(id);
    },
  };
}

export function arWbParseNative(data: {
  kind?: string;
  cct?: number;
  valid?: boolean;
}): ArWbState {
  const kind: ArWbKind =
    data.kind === "warm" || data.kind === "cold" || data.kind === "ok"
      ? data.kind
      : "ok";
  const cct = Number(data.cct);
  return {
    kind,
    cct: Number.isFinite(cct) ? cct : 0,
    valid: data.valid === true,
  };
}
