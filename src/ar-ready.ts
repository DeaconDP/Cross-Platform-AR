/**
 * Session-ready gate: swallow post-permission ghost taps, skip native
 * hit-tests during the quiet window, and speak coach copy once.
 *
 * Not start-preflight, not queued-early-tap replay, not visual tracking
 * events, not Dynamic Type insets.
 */

export const AR_READY_QUIET_MS = 480;
export const AR_READY_POINTER_PAD_MS = 160;
export const AR_READY_VOICE_GAP_MS = 1200;

export type ArReadyKind =
  | "quiet"
  | "scan"
  | "plane"
  | "placed"
  | "miss"
  | "lost"
  | "error";

export type ArReadyProduct = "coh" | "origins" | "emily" | "cube";

export type ArReadyState = {
  until: number;
  pointers: number;
  pointerUntil: number;
  lastKind: ArReadyKind | null;
  lastVoice: string;
  lastVoiceAt: number;
};

export function arReadyCreate(
  now: number,
  quietMs = AR_READY_QUIET_MS,
): ArReadyState {
  return {
    until: now + Math.max(0, quietMs),
    pointers: 0,
    pointerUntil: 0,
    lastKind: null,
    lastVoice: "",
    lastVoiceAt: 0,
  };
}

export function arReadyNotePointer(
  state: ArReadyState,
  down: boolean,
  now: number,
): void {
  if (down) {
    state.pointers += 1;
    return;
  }
  state.pointers = Math.max(0, state.pointers - 1);
  if (state.pointers === 0) {
    state.pointerUntil = now + AR_READY_POINTER_PAD_MS;
  }
}

export function arReadyOpen(
  state: ArReadyState | null | undefined,
  now: number,
): boolean {
  return arReadyBlockReason(state, now) === null;
}

export function arReadyBlockReason(
  state: ArReadyState | null | undefined,
  now: number,
): "quiet" | "pointer" | null {
  if (!state) return null;
  if (now < state.until) return "quiet";
  if (state.pointers > 0) return "pointer";
  if (now < state.pointerUntil) return "pointer";
  return null;
}

export function arReadyCopy(
  product: ArReadyProduct,
  kind: ArReadyKind,
): string {
  if (kind === "quiet") return "One moment — camera is waking up.";
  if (kind === "lost") return "Tracking paused. Move the phone slowly.";
  if (kind === "error") return "Could not start the camera on this device.";

  if (product === "coh") {
    if (kind === "plane") return "Surface found. Tap to place the fossil.";
    if (kind === "placed") return "Placed. Swipe to rotate, pinch to resize.";
    if (kind === "miss") {
      return "Scan a flat surface, then tap the highlighted area.";
    }
    return "Scan a flat surface, then tap inside the highlighted area.";
  }

  if (product === "origins") {
    if (kind === "plane") return "Surface found. Tap to place the exhibit.";
    if (kind === "placed") return "Placed. Look around, or tap Reposition.";
    if (kind === "miss") return "Hold on the highlighted surface, then tap.";
    return "Tap to place the artwork in the highlighted area.";
  }

  if (product === "emily") {
    if (kind === "plane") return "Found a spot. Tap the floor to place me.";
    if (kind === "placed") return "I’m on the floor. Tap again to move me.";
    if (kind === "miss") return "Hmm, try a flatter spot?";
    return "Looking for a flat spot…";
  }

  if (kind === "plane") return "Surface found. Tap to place a cube.";
  if (kind === "placed") return "Cube placed.";
  if (kind === "miss") return "Move your phone to find a surface, then tap.";
  return "Move your phone to find a surface.";
}

export function arReadyCoach(
  state: ArReadyState | null | undefined,
  now: number,
  product: ArReadyProduct,
  placed: boolean,
): string {
  if (placed) return arReadyCopy(product, "placed");
  if (!arReadyOpen(state, now)) return arReadyCopy(product, "quiet");
  return arReadyCopy(product, "scan");
}

export function arReadyShouldSpeak(
  state: ArReadyState,
  kind: ArReadyKind,
  text: string,
  now: number,
): boolean {
  if (!text) return false;
  const gap = now - state.lastVoiceAt;
  if (state.lastVoice === text && gap < AR_READY_VOICE_GAP_MS) return false;
  if (state.lastKind === kind && gap < AR_READY_VOICE_GAP_MS) return false;
  return true;
}

export function arReadySpeak(
  state: ArReadyState,
  kind: ArReadyKind,
  product: ArReadyProduct,
  now: number,
): string | null {
  const text = arReadyCopy(product, kind);
  if (!arReadyShouldSpeak(state, kind, text, now)) return null;
  state.lastKind = kind;
  state.lastVoice = text;
  state.lastVoiceAt = now;
  return text;
}
