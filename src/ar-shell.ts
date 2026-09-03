/** Isolate the AR overlay from browser/OS chrome. */

export const AR_TAP_SLOP_PX = 12;
export const AR_SHELL_STATE_KEY = "__arSession";

export type PointerEndKind = "commit" | "cancel";
export type BackDecision = "close-session" | "propagate";

export type ArShellState = { readonly [AR_SHELL_STATE_KEY]: true };

export type ShellStyle = {
  overflow: string;
  overscrollBehavior: string;
};

export type ArShellWindow = {
  history: {
    readonly state: unknown;
    pushState(data: unknown, unused: string, url?: string | null): void;
    back(): void;
  };
  document: { documentElement: { style: ShellStyle } };
  addEventListener(
    type: "popstate" | "keydown",
    listener: (ev: { key?: string; preventDefault(): void }) => void,
  ): void;
  removeEventListener(
    type: "popstate" | "keydown",
    listener: (ev: { key?: string; preventDefault(): void }) => void,
  ): void;
};

export function pointerEndKind(type: string): PointerEndKind {
  const t = type.toLowerCase();
  if (
    t === "pointercancel" ||
    t === "lostpointercapture" ||
    t === "touchcancel"
  ) {
    return "cancel";
  }
  return "commit";
}

export function gestureTravelPx(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): number {
  const dx = endX - startX;
  const dy = endY - startY;
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return Number.POSITIVE_INFINITY;
  return Math.hypot(dx, dy);
}

export function isPlacementTap(opts: {
  kind: PointerEndKind;
  remainingPointers: number;
  travelPx: number;
  slopPx?: number;
}): boolean {
  if (opts.kind !== "commit") return false;
  if (opts.remainingPointers > 0) return false;
  if (!Number.isFinite(opts.travelPx) || opts.travelPx < 0) return false;
  return opts.travelPx <= (opts.slopPx ?? AR_TAP_SLOP_PX);
}

export function isExitKey(key: string): boolean {
  return key === "Escape";
}

export function onSessionBack(sessionOpen: boolean): BackDecision {
  return sessionOpen ? "close-session" : "propagate";
}

export function isArShellState(state: unknown): boolean {
  return (
    !!state &&
    typeof state === "object" &&
    (state as { [AR_SHELL_STATE_KEY]?: unknown })[AR_SHELL_STATE_KEY] === true
  );
}

export function arShellState(): ArShellState {
  return { [AR_SHELL_STATE_KEY]: true };
}

export function shouldPushHistoryTrap(state: unknown): boolean {
  return !isArShellState(state);
}

export function arShellCssLock(): ShellStyle {
  return { overflow: "hidden", overscrollBehavior: "none" };
}

/**
 * Lock page scroll, trap the first Back/Escape into `onExit`, and restore on release.
 * Skip `historyTrap` when a router already owns the stack (Origins exhibit routes).
 */
export function attachArShell(opts: {
  onExit: () => void;
  historyTrap: boolean;
  win?: ArShellWindow;
}): () => void {
  const win = opts.win ?? (globalThis as unknown as ArShellWindow);
  const style = win.document.documentElement.style;
  const prev: ShellStyle = {
    overflow: style.overflow,
    overscrollBehavior: style.overscrollBehavior,
  };
  const lock = arShellCssLock();
  style.overflow = lock.overflow;
  style.overscrollBehavior = lock.overscrollBehavior;

  let trapArmed = false;
  if (opts.historyTrap && shouldPushHistoryTrap(win.history.state)) {
    win.history.pushState(arShellState(), "");
    trapArmed = true;
  }

  let closed = false;
  const exit = () => {
    if (closed) return;
    closed = true;
    opts.onExit();
  };

  const onPop = () => {
    if (!trapArmed) return;
    trapArmed = false;
    exit();
  };

  const onKey = (ev: { key?: string; preventDefault(): void }) => {
    if (!isExitKey(ev.key ?? "")) return;
    ev.preventDefault();
    exit();
  };

  win.addEventListener("popstate", onPop);
  win.addEventListener("keydown", onKey);

  let released = false;
  return () => {
    if (released) return;
    released = true;
    win.removeEventListener("popstate", onPop);
    win.removeEventListener("keydown", onKey);
    style.overflow = prev.overflow;
    style.overscrollBehavior = prev.overscrollBehavior;
    if (trapArmed && isArShellState(win.history.state)) {
      trapArmed = false;
      win.history.back();
    }
  };
}
