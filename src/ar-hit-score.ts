/** Rank WebXR hits so a mid-range surface wins over a far floor. */

export function scoreXrHitDistance(distanceM: number): number {
  if (distanceM >= 0.35 && distanceM <= 2.4) return 3 - Math.abs(distanceM - 0.95);
  if (distanceM < 0.35) return distanceM;
  return Math.max(0, 2.5 - (distanceM - 2.4) * 0.4);
}

export function pickNearestXrHit(
  hits: XRHitTestResult[],
  space: XRSpace,
): XRHitTestResult | null {
  let best: XRHitTestResult | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const hit of hits) {
    const pose = hit.getPose(space);
    if (!pose) continue;
    const p = pose.transform.position;
    const dist = Math.hypot(p.x, p.y, p.z);
    const score = scoreXrHitDistance(dist);
    if (score > bestScore) {
      bestScore = score;
      best = hit;
    }
  }
  return best;
}
