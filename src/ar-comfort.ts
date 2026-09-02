/** Comfortable camera-to-hit distance (meters) for a glanceable cube. */
export const COMFORT_TARGET_M = 0.85;
export const COMFORT_MIN_DIST_M = 0.25;
export const COMFORT_SCALE_MIN = 0.5;
export const COMFORT_SCALE_MAX = 2.2;

/**
 * Scale so a hit at `distanceM` looks about as big as one at `COMFORT_TARGET_M`.
 * Far taps grow; close taps shrink.
 */
export function comfortScale(distanceM: number): number {
  const d = Number.isFinite(distanceM)
    ? Math.max(COMFORT_MIN_DIST_M, distanceM)
    : COMFORT_TARGET_M;
  const s = COMFORT_TARGET_M / d;
  return Math.min(COMFORT_SCALE_MAX, Math.max(COMFORT_SCALE_MIN, s));
}
