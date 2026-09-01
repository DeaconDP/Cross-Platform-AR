/** Prefer a recent finger/transient WebXR hit; fall back to the gaze reticle. */

export const XR_TRANSIENT_HIT_MS = 250;

export type CubeXrHitSource = "transient" | "reticle";

export function pickCubeXrHit(opts: {
  transientVisible: boolean;
  reticleVisible: boolean;
  transientAgeMs?: number;
  maxTransientAgeMs?: number;
}): CubeXrHitSource | null {
  const maxAge = opts.maxTransientAgeMs ?? XR_TRANSIENT_HIT_MS;
  const age = opts.transientAgeMs ?? Number.POSITIVE_INFINITY;
  if (opts.transientVisible && age <= maxAge) return "transient";
  if (opts.reticleVisible) return "reticle";
  return null;
}
