/** VIEW_NORMALIZED (0–1) hit mapping shared by native AR and the overlay. */

export type ArHitMiss =
  | "notReady"
  | "notTracking"
  | "noSurface"
  | "loading"
  | "alreadyPlaced";

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}

/** True when both values are already 0–1 view-normalized (not CSS/device pixels). */
export function isViewNorm(x: number, y: number): boolean {
  return Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= 1 && y >= 0 && y <= 1;
}

export function clientToViewNorm(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
): { x: number; y: number } {
  const w = rect.width > 0 ? rect.width : 1;
  const h = rect.height > 0 ? rect.height : 1;
  return {
    x: clamp01((clientX - rect.left) / w),
    y: clamp01((clientY - rect.top) / h),
  };
}

/** Fallback VIEW_NORMALIZED → VIEW pixels when ARCore transformCoordinates2d is unavailable. */
export function viewNormToPx(
  nx: number,
  ny: number,
  width: number,
  height: number,
  lastWidth = 0,
  lastHeight = 0,
): { x: number; y: number } | null {
  const w = width > 0 ? width : lastWidth;
  const h = height > 0 ? height : lastHeight;
  if (w <= 0 || h <= 0) return null;
  return { x: clamp01(nx) * w, y: clamp01(ny) * h };
}

/** OpenGL NDC: x right, y up. VIEW_NORMALIZED y is down. */
export function viewNormToNdc(nx: number, ny: number): { x: number; y: number } {
  return { x: clamp01(nx) * 2 - 1, y: (1 - clamp01(ny)) * 2 - 1 };
}

/** Column-major 4×4 × vec4. */
export function mulMv(m: readonly number[], v: readonly number[]): number[] {
  return [
    m[0]! * v[0]! + m[4]! * v[1]! + m[8]! * v[2]! + m[12]! * v[3]!,
    m[1]! * v[0]! + m[5]! * v[1]! + m[9]! * v[2]! + m[13]! * v[3]!,
    m[2]! * v[0]! + m[6]! * v[1]! + m[10]! * v[2]! + m[14]! * v[3]!,
    m[3]! * v[0]! + m[7]! * v[1]! + m[11]! * v[2]! + m[15]! * v[3]!,
  ];
}

export function unprojectViewNorm(
  invViewProj: readonly number[],
  nx: number,
  ny: number,
): { origin: [number, number, number]; direction: [number, number, number] } | null {
  if (invViewProj.length !== 16) return null;
  const ndc = viewNormToNdc(nx, ny);
  const near = mulMv(invViewProj, [ndc.x, ndc.y, -1, 1]);
  const far = mulMv(invViewProj, [ndc.x, ndc.y, 1, 1]);
  if (Math.abs(near[3]!) < 1e-6 || Math.abs(far[3]!) < 1e-6) return null;
  const ox = near[0]! / near[3]!;
  const oy = near[1]! / near[3]!;
  const oz = near[2]! / near[3]!;
  const dx = far[0]! / far[3]! - ox;
  const dy = far[1]! / far[3]! - oy;
  const dz = far[2]! / far[3]! - oz;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return null;
  return {
    origin: [ox, oy, oz],
    direction: [dx / len, dy / len, dz / len],
  };
}

export function missHint(reason: string | undefined): string {
  switch (reason) {
    case "notTracking":
      return "Hold still — the camera is still locking on.";
    case "loading":
      return "Still loading this model…";
    case "notReady":
      return "Camera is starting — try again in a moment.";
    case "alreadyPlaced":
      return "";
    case "noSurface":
    default:
      return "Scan a flat surface, then tap the highlighted area.";
  }
}
