export type ArTrackingState =
  | "initializing"
  | "ready"
  | "limited"
  | "unavailable";

export type ArTrackingEvent = {
  state: ArTrackingState;
  message?: string;
};

export type ArSessionStatus = {
  tracking: ArTrackingState;
  planeCount: number;
  modelReady: boolean;
  placed: boolean;
};

const STATES: readonly ArTrackingState[] = [
  "initializing",
  "ready",
  "limited",
  "unavailable",
];

export function asTrackingState(raw: unknown): ArTrackingState {
  return STATES.includes(raw as ArTrackingState)
    ? (raw as ArTrackingState)
    : "initializing";
}

/** Map ARCore / ARKit camera flags + plane presence to the shared status. */
export function mapCameraTracking(
  camera: "tracking" | "paused" | "stopped" | "normal" | "limited" | "notAvailable",
  hasSurface: boolean,
): ArTrackingState {
  if (camera === "stopped" || camera === "notAvailable") return "unavailable";
  if (camera === "paused" || camera === "limited") return "limited";
  return hasSurface ? "ready" : "initializing";
}

export function coachForTracking(
  state: ArTrackingState,
  opts?: { placed?: boolean; message?: string; imageMode?: boolean },
): string | null {
  if (opts?.placed) return null;
  if (opts?.message && (state === "limited" || state === "unavailable")) {
    return opts.message;
  }
  if (opts?.imageMode) {
    switch (state) {
      case "initializing":
        return "Hold the marker in view";
      case "ready":
        return "Marker in view — hold steady";
      case "limited":
        return "More light or a steadier hold helps";
      case "unavailable":
        return "Camera tracking paused. Try again.";
    }
  }
  switch (state) {
    case "initializing":
      return "Move your phone to find a surface";
    case "ready":
      return "Tap to place a cube";
    case "limited":
      return "Slow down — more light or texture helps";
    case "unavailable":
      return "Camera tracking paused. Try again.";
  }
}
