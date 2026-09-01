/** Shared AR place / recover policy — no DOM required except WebGL restore. */

export const PLANE_MIN_EXTENT_M = 0.18;
export const LAST_PLANE_MAX_AGE_MS = 2500;
export const TAP_RETRY_MS = 80;

export function isUsablePlaneExtent(extentX: number, extentZ: number): boolean {
  return (
    Number.isFinite(extentX) &&
    Number.isFinite(extentZ) &&
    Math.min(extentX, extentZ) >= PLANE_MIN_EXTENT_M
  );
}

export function canSnapToLastPlane(
  nowMs: number,
  lastMs: number | null,
  tracking: boolean,
): boolean {
  return tracking && lastMs != null && nowMs - lastMs <= LAST_PLANE_MAX_AGE_MS;
}

export type PlaceAttempt = { placed: boolean; count?: number };

export async function tapWithRetry(
  tap: (x: number, y: number) => Promise<PlaceAttempt>,
  x: number,
  y: number,
  wait: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => {
      setTimeout(resolve, ms);
    }),
): Promise<PlaceAttempt> {
  const first = await tap(x, y);
  if (first.placed) return first;
  await wait(TAP_RETRY_MS);
  return tap(x, y);
}

export function bindWebGlRestore(
  canvas: HTMLCanvasElement,
  onLost: () => void,
  onRestored: () => void,
): () => void {
  const lost = (event: Event) => {
    event.preventDefault();
    onLost();
  };
  const restored = () => {
    onRestored();
  };
  canvas.addEventListener("webglcontextlost", lost, false);
  canvas.addEventListener("webglcontextrestored", restored, false);
  return () => {
    canvas.removeEventListener("webglcontextlost", lost);
    canvas.removeEventListener("webglcontextrestored", restored);
  };
}
