/** Gravity-true facing: yaw on the table plane, never pitch/roll. */

export function canFaceTarget(
  camX: number,
  camZ: number,
  posX: number,
  posZ: number,
  minSep = 0.001,
): boolean {
  const dx = camX - posX;
  const dz = camZ - posZ;
  return dx * dx + dz * dz >= minSep * minSep;
}

/** Radians around +Y so −Z faces the camera on XZ. */
export function faceYawRad(
  camX: number,
  camZ: number,
  posX: number,
  posZ: number,
): number {
  return Math.atan2(camX - posX, camZ - posZ);
}

export function faceYawDeg(
  camX: number,
  camZ: number,
  posX: number,
  posZ: number,
): number {
  return (faceYawRad(camX, camZ, posX, posZ) * 180) / Math.PI;
}
