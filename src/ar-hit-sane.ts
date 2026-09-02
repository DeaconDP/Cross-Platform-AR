/** Shared AR hit sanity: live tracking + in-front of camera. Native plugins mirror this. */

export type Vec3 = { x: number; y: number; z: number };

export const IN_FRONT_MIN_DOT = 0.02;

export function isInFrontHit(
  cam: Vec3,
  forward: Vec3,
  hit: Vec3,
  minDot = IN_FRONT_MIN_DOT,
): boolean {
  return (
    (hit.x - cam.x) * forward.x +
      (hit.y - cam.y) * forward.y +
      (hit.z - cam.z) * forward.z >
    minDot
  );
}

/**
 * Column-major 4×4 camera matrix (ARCore / ARKit / WebXR).
 * Camera looks along local −Z, so world forward is −column Z.
 */
export function isInFrontFromMatrix(
  camMatrix: ArrayLike<number>,
  hit: Vec3,
  minDot = IN_FRONT_MIN_DOT,
): boolean {
  return isInFrontHit(
    { x: camMatrix[12], y: camMatrix[13], z: camMatrix[14] },
    { x: -camMatrix[8], y: -camMatrix[9], z: -camMatrix[10] },
    hit,
    minDot,
  );
}

export function isLivePlaneHit(opts: {
  cameraTracking: boolean;
  planeTracking: boolean;
  inFront: boolean;
  inPolygon: boolean;
}): boolean {
  return (
    opts.cameraTracking &&
    opts.planeTracking &&
    opts.inFront &&
    opts.inPolygon
  );
}
