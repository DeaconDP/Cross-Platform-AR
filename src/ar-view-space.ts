/** Map overlay pointers to camera rays across WebView, PWA, and pinch-zoom. */

export type ArOverlayRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type ArVisualViewport = {
  offsetLeft: number;
  offsetTop: number;
  scale: number;
  width: number;
  height: number;
};

export type ArViewMetrics = {
  width: number;
  height: number;
  ready: boolean;
};

export type ArPointerHit = {
  nx: number;
  ny: number;
  viewX: number;
  viewY: number;
};

export const AR_TAP_SLOP_PX = 12;

let cachedMetrics: ArViewMetrics | null = null;

export function rememberViewMetrics(metrics: ArViewMetrics | null): void {
  cachedMetrics =
    metrics && metrics.ready && metrics.width > 0 && metrics.height > 0
      ? metrics
      : null;
}

export function lastViewMetrics(): ArViewMetrics | null {
  return cachedMetrics;
}

export function readVisualViewport(
  vp: Partial<ArVisualViewport> | null | undefined,
): ArVisualViewport {
  const scale = vp && Number.isFinite(vp.scale) && (vp.scale ?? 0) > 0 ? vp.scale! : 1;
  return {
    offsetLeft: vp?.offsetLeft ?? 0,
    offsetTop: vp?.offsetTop ?? 0,
    scale,
    width: vp?.width ?? 0,
    height: vp?.height ?? 0,
  };
}

export function readDomVisualViewport(): ArVisualViewport | null {
  const vp = globalThis.visualViewport;
  if (!vp) return null;
  return {
    offsetLeft: vp.offsetLeft || 0,
    offsetTop: vp.offsetTop || 0,
    scale: vp.scale > 0 ? vp.scale : 1,
    width: vp.width || 0,
    height: vp.height || 0,
  };
}

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  return Math.min(1, Math.max(0, n));
}

export function arOverlayNorm(
  clientX: number,
  clientY: number,
  overlay: ArOverlayRect,
): { nx: number; ny: number } {
  const w = Math.max(overlay.width, 1);
  const h = Math.max(overlay.height, 1);
  return {
    nx: clamp01((clientX - overlay.left) / w),
    ny: clamp01((clientY - overlay.top) / h),
  };
}

export function arScreenNorm(
  clientX: number,
  clientY: number,
  viewport: ArVisualViewport | null | undefined,
  fallback: { width: number; height: number },
): { nx: number; ny: number } {
  const vv = readVisualViewport(viewport);
  const w = vv.width > 0 ? vv.width : Math.max(fallback.width, 1);
  const h = vv.height > 0 ? vv.height : Math.max(fallback.height, 1);
  return {
    nx: clamp01((clientX - vv.offsetLeft) / w),
    ny: clamp01((clientY - vv.offsetTop) / h),
  };
}

/** Prefer screen space when the visual viewport is zoomed or panned off layout. */
export function arUseScreenSpace(
  viewport: ArVisualViewport | null | undefined,
): boolean {
  const vv = readVisualViewport(viewport);
  return (
    Math.abs(vv.scale - 1) > 0.02 ||
    Math.abs(vv.offsetLeft) > 0.5 ||
    Math.abs(vv.offsetTop) > 0.5
  );
}

export function arPointerHit(
  clientX: number,
  clientY: number,
  overlay: ArOverlayRect,
  viewport?: ArVisualViewport | null,
  metrics?: ArViewMetrics | null,
): ArPointerHit {
  const overlayN = arOverlayNorm(clientX, clientY, overlay);
  const screenN = arScreenNorm(clientX, clientY, viewport, overlay);
  const n = arUseScreenSpace(viewport) ? screenN : overlayN;
  const view = metrics?.ready ? metrics : lastViewMetrics();
  const vw = view && view.width > 0 ? view.width : Math.max(overlay.width, 1);
  const vh = view && view.height > 0 ? view.height : Math.max(overlay.height, 1);
  return {
    nx: n.nx,
    ny: n.ny,
    viewX: n.nx * vw,
    viewY: n.ny * vh,
  };
}

export function arIsTap(
  travelPx: number,
  slopPx: number = AR_TAP_SLOP_PX,
): boolean {
  return Number.isFinite(travelPx) && travelPx <= slopPx;
}

export async function refreshArViewMetrics(
  fetchMetrics: () => Promise<ArViewMetrics>,
): Promise<ArViewMetrics> {
  try {
    const metrics = await fetchMetrics();
    rememberViewMetrics(metrics);
    return lastViewMetrics() ?? { width: 0, height: 0, ready: false };
  } catch {
    rememberViewMetrics(null);
    return { width: 0, height: 0, ready: false };
  }
}
