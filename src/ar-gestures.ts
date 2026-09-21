/** Shared AR overlay gesture controller (CoH ArSession, vanilla). */

export const TAP_SLOP = 12;
export const SCALE_MIN = 0.35;
export const SCALE_MAX = 2.4;

export function clampScale(n: number): number {
  return Math.max(SCALE_MIN, Math.min(SCALE_MAX, n));
}

export interface OverlayChrome {
  root: HTMLElement;
  status: HTMLElement;
  hint: HTMLElement;
  exit: HTMLButtonElement;
  reposition: HTMLButtonElement;
  recenter: HTMLButtonElement;
  toolbar: HTMLElement;
  debugToggle: HTMLButtonElement;
  debugPanel: HTMLElement;
  stage: HTMLElement;
}

type Ptr = { x: number; y: number; startX: number; startY: number };

export interface ArGestureHandlers {
  /** Camera AR (native / WebXR) — place on tap when not yet placed. */
  onTapPlace?: (clientX: number, clientY: number) => Promise<boolean> | boolean;
  onRotate: (dx: number, dy: number) => void;
  onScale: (factor: number) => void;
  onMoveScreen?: (clientX: number, clientY: number) => void;
  onReposition: () => Promise<void> | void;
  onRecenter: () => Promise<void> | void;
  onExit: () => Promise<void> | void;
  /** When true, two-finger drag moves on plane; otherwise ignored. */
  cameraMode: boolean;
  isPlaced: () => boolean;
  isSurfaceReady: () => boolean;
  isSpawning?: () => boolean;
  getScale: () => number;
  setScaleState?: (factor: number) => void;
}

export interface ArGestureController {
  destroy: () => void;
  setBusy: (busy: boolean) => void;
  setPlacedUi: (placed: boolean) => void;
  setHint: (text: string, hidden?: boolean) => void;
}

export function bindArGestures(
  chrome: OverlayChrome,
  handlers: ArGestureHandlers,
): ArGestureController {
  const pointers = new Map<number, Ptr>();
  let pinch: { startDist: number; startScale: number } | null = null;
  let lastCentroid: { x: number; y: number } | null = null;
  let velocity = { vx: 0, vy: 0 };
  let momentumRaf = 0;
  let flushRaf = 0;
  let pendingRotate = { dx: 0, dy: 0 };
  let pendingScale: number | null = null;
  let busy = false;
  let placedUi = false;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const listPointers = () => [...pointers.values()];

  const centroidOf = (pts: Ptr[]) => {
    const n = pts.length || 1;
    return {
      x: pts.reduce((s, p) => s + p.x, 0) / n,
      y: pts.reduce((s, p) => s + p.y, 0) / n,
    };
  };

  const distOf = (pts: Ptr[]) => {
    if (pts.length < 2) return 0;
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  };

  const spawning = () => handlers.isSpawning?.() ?? false;

  const flushPending = () => {
    flushRaf = 0;
    if (spawning()) {
      pendingRotate = { dx: 0, dy: 0 };
      pendingScale = null;
      return;
    }
    if (pendingRotate.dx !== 0 || pendingRotate.dy !== 0) {
      handlers.onRotate(pendingRotate.dx, pendingRotate.dy);
      pendingRotate = { dx: 0, dy: 0 };
    }
    if (pendingScale != null) {
      const next = clampScale(pendingScale);
      handlers.setScaleState?.(next);
      handlers.onScale(next);
      pendingScale = null;
    }
  };

  const scheduleFlush = () => {
    if (flushRaf) return;
    flushRaf = requestAnimationFrame(flushPending);
  };

  const pumpMomentum = () => {
    if (reduceMotion || spawning()) return;
    if (Math.abs(velocity.vx) < 0.2 && Math.abs(velocity.vy) < 0.2) return;
    handlers.onRotate(velocity.vx, velocity.vy);
    velocity.vx *= 0.94;
    velocity.vy *= 0.94;
    momentumRaf = requestAnimationFrame(pumpMomentum);
  };

  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("button")) return;
    chrome.stage.setPointerCapture(e.pointerId);
    cancelAnimationFrame(momentumRaf);
    velocity = { vx: 0, vy: 0 };
    pointers.set(e.pointerId, {
      x: e.clientX,
      y: e.clientY,
      startX: e.clientX,
      startY: e.clientY,
    });
    const pts = listPointers();
    if (pts.length === 2 && handlers.isPlaced() && !spawning()) {
      pinch = {
        startDist: distOf(pts) || 1,
        startScale: handlers.getScale(),
      };
      lastCentroid = centroidOf(pts);
    } else {
      pinch = null;
      lastCentroid = null;
    }
  };

  const onPointerMove = (e: PointerEvent) => {
    const ptr = pointers.get(e.pointerId);
    if (!ptr) return;
    if (e.cancelable) e.preventDefault();
    const prevX = ptr.x;
    const prevY = ptr.y;
    ptr.x = e.clientX;
    ptr.y = e.clientY;
    if (!handlers.isPlaced() || spawning()) return;

    const pts = listPointers();
    if (pts.length >= 2) {
      const dist = distOf(pts);
      if (pinch && dist > 0) {
        pendingScale = clampScale(pinch.startScale * (dist / (pinch.startDist || dist)));
        scheduleFlush();
      }
      const c = centroidOf(pts);
      if (lastCentroid && handlers.cameraMode) {
        handlers.onMoveScreen?.(c.x, c.y);
      }
      lastCentroid = c;
      return;
    }

    const dx = e.clientX - prevX;
    const dy = e.clientY - prevY;
    velocity.vx = velocity.vx * 0.6 + dx * 0.4;
    velocity.vy = velocity.vy * 0.6 + dy * 0.4;
    pendingRotate.dx += dx;
    pendingRotate.dy += dy;
    scheduleFlush();
  };

  const onPointerUp = (e: PointerEvent) => {
    const ptr = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    try {
      chrome.stage.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }

    const remaining = listPointers();
    if (remaining.length < 2) {
      pinch = null;
      lastCentroid = null;
    } else if (remaining.length === 2 && handlers.isPlaced() && !spawning()) {
      pinch = {
        startDist: distOf(remaining) || 1,
        startScale: handlers.getScale(),
      };
      lastCentroid = centroidOf(remaining);
    }

    if (!ptr) return;

    if (!handlers.isPlaced() && handlers.cameraMode && handlers.onTapPlace) {
      const travel = Math.hypot(ptr.x - ptr.startX, ptr.y - ptr.startY);
      if (travel <= TAP_SLOP && handlers.isSurfaceReady() && !busy) {
        void (async () => {
          busy = true;
          chrome.reposition.disabled = true;
          chrome.recenter.disabled = true;
          try {
            const ok = await handlers.onTapPlace!(ptr.x, ptr.y);
            if (ok) setPlacedUi(true);
          } finally {
            busy = false;
            chrome.reposition.disabled = !placedUi;
            chrome.recenter.disabled = !placedUi;
          }
        })();
        return;
      }
    }

    if (handlers.isPlaced() && !spawning() && !reduceMotion) {
      cancelAnimationFrame(momentumRaf);
      momentumRaf = requestAnimationFrame(pumpMomentum);
    }
  };

  const runToolbar = async (fn: () => Promise<void> | void) => {
    if (busy) return;
    busy = true;
    chrome.reposition.disabled = true;
    chrome.recenter.disabled = true;
    chrome.reposition.setAttribute("aria-busy", "true");
    chrome.recenter.setAttribute("aria-busy", "true");
    try {
      await fn();
    } finally {
      busy = false;
      chrome.reposition.removeAttribute("aria-busy");
      chrome.recenter.removeAttribute("aria-busy");
      chrome.reposition.disabled = !placedUi;
      chrome.recenter.disabled = !placedUi;
    }
  };

  const onReposition = () => {
    void runToolbar(async () => {
      await handlers.onReposition();
      setPlacedUi(false);
    });
  };

  const onRecenter = () => {
    void runToolbar(async () => {
      await handlers.onRecenter();
    });
  };

  const onExit = () => {
    void (async () => {
      chrome.exit.disabled = true;
      chrome.exit.setAttribute("aria-busy", "true");
      try {
        await handlers.onExit();
      } finally {
        chrome.exit.disabled = false;
        chrome.exit.removeAttribute("aria-busy");
      }
    })();
  };

  const setPlacedUi = (placed: boolean) => {
    placedUi = placed;
    chrome.toolbar.hidden = !placed;
    chrome.reposition.disabled = !placed || busy;
    chrome.recenter.disabled = !placed || busy;
    chrome.status.textContent = placed ? "Placed" : "Scanning";
    if (placed) {
      chrome.hint.textContent = "SWIPE TO ROTATE";
      chrome.hint.hidden = false;
    }
  };

  const setHint = (text: string, hidden = false) => {
    chrome.hint.textContent = text;
    chrome.hint.hidden = hidden;
  };

  const setBusy = (next: boolean) => {
    busy = next;
    chrome.reposition.disabled = !placedUi || busy;
    chrome.recenter.disabled = !placedUi || busy;
  };

  chrome.stage.addEventListener("pointerdown", onPointerDown);
  chrome.stage.addEventListener("pointermove", onPointerMove);
  chrome.stage.addEventListener("pointerup", onPointerUp);
  chrome.stage.addEventListener("pointercancel", onPointerUp);
  chrome.reposition.addEventListener("click", onReposition);
  chrome.recenter.addEventListener("click", onRecenter);
  chrome.exit.addEventListener("click", onExit);

  setPlacedUi(false);
  setHint("MOVE THE PHONE TO FIND A SURFACE");

  return {
    destroy: () => {
      cancelAnimationFrame(momentumRaf);
      cancelAnimationFrame(flushRaf);
      chrome.stage.removeEventListener("pointerdown", onPointerDown);
      chrome.stage.removeEventListener("pointermove", onPointerMove);
      chrome.stage.removeEventListener("pointerup", onPointerUp);
      chrome.stage.removeEventListener("pointercancel", onPointerUp);
      chrome.reposition.removeEventListener("click", onReposition);
      chrome.recenter.removeEventListener("click", onRecenter);
      chrome.exit.removeEventListener("click", onExit);
    },
    setBusy,
    setPlacedUi,
    setHint,
  };
}

export function readOverlayChrome(): OverlayChrome {
  const $ = <T extends HTMLElement>(id: string): T =>
    document.getElementById(id) as T;
  return {
    root: $("ar-overlay"),
    status: $("ar-status"),
    hint: $("ar-hint"),
    exit: $<HTMLButtonElement>("exit-ar"),
    reposition: $<HTMLButtonElement>("ar-reposition"),
    recenter: $<HTMLButtonElement>("ar-recenter"),
    toolbar: $("ar-toolbar"),
    debugToggle: $<HTMLButtonElement>("debug-toggle"),
    debugPanel: $("debug-panel"),
    stage: $("ar-stage"),
  };
}
