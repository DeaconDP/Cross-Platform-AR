/**
 * Page-zoom lock: pinch-to-scale the model cannot also zoom the WebView.
 *
 * Not shell Back/Escape, not visualViewport tap mapping, not gesture flush,
 * not Dynamic Type insets.
 */

export const AR_ZOOM_LOCK_CLASS = "is-ar-zoom-lock";
export const AR_ZOOM_SCALE_EPS = 0.02;

export type ArZoomProduct = "coh" | "origins" | "emily" | "cube";

export type ArZoomState = {
  armed: boolean;
  viewportPrev: string | null;
  scale: number;
};

export function arZoomCreate(scale = 1): ArZoomState {
  return {
    armed: false,
    viewportPrev: null,
    scale: arZoomNormScale(scale),
  };
}

export function arZoomNormScale(scale: number): number {
  if (!Number.isFinite(scale) || scale <= 0) return 1;
  return scale;
}

export function arZoomIsPageZoomed(
  scale: number,
  eps = AR_ZOOM_SCALE_EPS,
): boolean {
  return Math.abs(arZoomNormScale(scale) - 1) >= eps;
}

export function arZoomNoteScale(state: ArZoomState, scale: number): void {
  state.scale = arZoomNormScale(scale);
}

/** Force a 1× viewport so Safari / Chrome cannot pinch-zoom the overlay. */
export function arZoomLockViewport(existing?: string | null): string {
  void existing;
  return "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover";
}

export function arZoomShouldPreventPageGesture(
  armed: boolean,
  ctrlWheel = false,
): boolean {
  return armed || ctrlWheel;
}

export function arZoomCopy(product: ArZoomProduct): string {
  if (product === "coh") return "Pinch the fossil, not the page.";
  if (product === "origins") return "Pinch the exhibit, not the page.";
  if (product === "emily") return "Pinch me, not the page.";
  return "Pinch the cube, not the page.";
}

export function arZoomCoach(
  product: ArZoomProduct,
  scale: number,
): string | null {
  return arZoomIsPageZoomed(scale) ? arZoomCopy(product) : null;
}

export function arZoomArm(
  state: ArZoomState,
  doc: Document = document,
): () => void {
  if (state.armed) {
    return () => {
      arZoomDispose(state, doc);
    };
  }
  state.armed = true;
  doc.documentElement.classList.add(AR_ZOOM_LOCK_CLASS);

  const meta = doc.querySelector('meta[name="viewport"]');
  if (meta) {
    state.viewportPrev = meta.getAttribute("content");
    meta.setAttribute("content", arZoomLockViewport(state.viewportPrev));
  }

  const block = (event: Event) => {
    if (event.cancelable) event.preventDefault();
  };
  const onWheel = (event: WheelEvent) => {
    if (event.ctrlKey && event.cancelable) event.preventDefault();
  };
  const onContext = (event: Event) => {
    event.preventDefault();
  };
  const onViewport = () => {
    arZoomNoteScale(state, window.visualViewport?.scale ?? 1);
  };

  doc.addEventListener("gesturestart", block, {
    capture: true,
    passive: false,
  });
  doc.addEventListener("gesturechange", block, {
    capture: true,
    passive: false,
  });
  doc.addEventListener("gestureend", block, { capture: true, passive: false });
  doc.addEventListener("wheel", onWheel, { capture: true, passive: false });
  doc.addEventListener("contextmenu", onContext, { capture: true });
  window.visualViewport?.addEventListener("resize", onViewport);
  window.visualViewport?.addEventListener("scroll", onViewport);
  onViewport();

  return () => {
    doc.removeEventListener("gesturestart", block, true);
    doc.removeEventListener("gesturechange", block, true);
    doc.removeEventListener("gestureend", block, true);
    doc.removeEventListener("wheel", onWheel, true);
    doc.removeEventListener("contextmenu", onContext, true);
    window.visualViewport?.removeEventListener("resize", onViewport);
    window.visualViewport?.removeEventListener("scroll", onViewport);
    arZoomDispose(state, doc);
  };
}

export function arZoomDispose(
  state: ArZoomState,
  doc: Document = document,
): void {
  doc.documentElement.classList.remove(AR_ZOOM_LOCK_CLASS);
  const meta = doc.querySelector('meta[name="viewport"]');
  if (meta && state.viewportPrev != null) {
    meta.setAttribute("content", state.viewportPrev);
  }
  state.viewportPrev = null;
  state.armed = false;
  state.scale = 1;
}
