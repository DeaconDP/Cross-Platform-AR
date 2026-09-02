/** Shared place-hit tiers for native AR + WebXR. */

export const HIT_MIN_M = 0.25;
export const HIT_MAX_M = 2.5;

export type HitTier = "polygon" | "extents" | "infinite";

/**
 * Geometry (in-polygon) first, then the plane's grown AABB, then a
 * comfort-clamped infinite-plane hit. Estimated callers apply this after
 * those two misses.
 */
export function pickHitTier(input: {
  horizontal: boolean;
  inPolygon: boolean;
  inExtents: boolean;
  distanceM: number;
}): HitTier | null {
  if (!input.horizontal) return null;
  if (input.inPolygon) return "polygon";
  if (input.inExtents) return "extents";
  if (inComfortRange(input.distanceM)) return "infinite";
  return null;
}

export function inComfortRange(distanceM: number): boolean {
  return (
    Number.isFinite(distanceM) &&
    distanceM >= HIT_MIN_M &&
    distanceM <= HIT_MAX_M
  );
}

export function distance3(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  return Math.hypot(dx, dy, dz);
}
