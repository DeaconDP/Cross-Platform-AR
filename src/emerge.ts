/** Shared emerge timing (matches CoH / native cube plugins). */
export const EMERGE_RISE_MS = 520;
export const EMERGE_JIGGLE_MS = 380;
export const EMERGE_TOTAL_MS = EMERGE_RISE_MS + EMERGE_JIGGLE_MS;
export const EMERGE_FLOOR = 0.08;
export const EMERGE_OVERSHOOT = 1.18;
export const EMERGE_START_Y = 0.08;

function easeOutBack(t: number): number {
  const c1 = 2.2;
  const c3 = c1 + 1;
  const u = t - 1;
  return 1 + c3 * u * u * u + c1 * u * u;
}

function easeOutCubic(t: number): number {
  const u = 1 - t;
  return 1 - u * u * u;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function jiggleIntro(t: number): number {
  const u = Math.min(1, Math.max(0, t));
  const ts = [0, 0.35, 0.7, 1];
  const vs = [EMERGE_OVERSHOOT, 0.94, 1.06, 1];
  for (let i = 0; i < ts.length - 1; i++) {
    if (u <= ts[i + 1]) {
      const local = (u - ts[i]) / Math.max(0.0001, ts[i + 1] - ts[i]);
      return lerp(vs[i], vs[i + 1], easeOutCubic(local));
    }
  }
  return 1;
}

export function emergeIntroAt(elapsedMs: number): number {
  if (elapsedMs <= 0) return EMERGE_FLOOR;
  if (elapsedMs < EMERGE_RISE_MS) {
    const t = elapsedMs / EMERGE_RISE_MS;
    return Math.max(EMERGE_FLOOR, EMERGE_OVERSHOOT * easeOutBack(t));
  }
  const jiggleT = Math.min(1, (elapsedMs - EMERGE_RISE_MS) / EMERGE_JIGGLE_MS);
  return jiggleIntro(jiggleT);
}

export function emergeRiseY(elapsedMs: number, floor = 0): number {
  if (elapsedMs >= EMERGE_RISE_MS) return floor;
  const t = Math.min(1, Math.max(0, elapsedMs / EMERGE_RISE_MS));
  return floor + EMERGE_START_Y * (1 - easeOutBack(t));
}
