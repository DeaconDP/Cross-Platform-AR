/** Analytic camera-ray ∩ plane. Used when ARCore/ARKit hitTest returns nothing. */

export type Vec3 = { x: number; y: number; z: number };

export const RAY_MIN_M = 0.12;
export const RAY_MAX_M = 8;
/** Loose (outside extents) hits stay nearer than a far infinite miss. */
export const LOOSE_MIN_M = 0.2;
export const LOOSE_MAX_M = 6;
export const LOOSE_CENTER_M = 2;

export function intersectRayPlane(
  origin: Vec3,
  dir: Vec3,
  planePoint: Vec3,
  planeNormal: Vec3,
): { point: Vec3; t: number } | null {
  const denom =
    planeNormal.x * dir.x + planeNormal.y * dir.y + planeNormal.z * dir.z;
  if (Math.abs(denom) < 1e-5) return null;
  const t =
    ((planePoint.x - origin.x) * planeNormal.x +
      (planePoint.y - origin.y) * planeNormal.y +
      (planePoint.z - origin.z) * planeNormal.z) /
    denom;
  if (t < RAY_MIN_M || t > RAY_MAX_M) return null;
  return {
    t,
    point: {
      x: origin.x + dir.x * t,
      y: origin.y + dir.y * t,
      z: origin.z + dir.z * t,
    },
  };
}

export type AnalyticCandidate = {
  t: number;
  inPolygon: boolean;
  inExtents: boolean;
  centerDist: number;
};

export function rankAnalyticHit(c: AnalyticCandidate): number {
  if (c.inPolygon) return 0;
  if (c.inExtents) return 1;
  return 2;
}

export function pickAnalyticHit(
  candidates: AnalyticCandidate[],
): AnalyticCandidate | null {
  let best: AnalyticCandidate | null = null;
  let bestRank = 99;
  for (const c of candidates) {
    const rank = rankAnalyticHit(c);
    if (rank === 2) {
      if (c.t < LOOSE_MIN_M || c.t > LOOSE_MAX_M) continue;
      if (c.centerDist > LOOSE_CENTER_M) continue;
    }
    if (!best || rank < bestRank || (rank === bestRank && c.t < best.t)) {
      best = c;
      bestRank = rank;
    }
  }
  return best;
}
