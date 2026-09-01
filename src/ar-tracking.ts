export type TrackingState =
  | "tracking"
  | "limited"
  | "paused"
  | "stopped";

/** Map CubeAR plugin states onto a small visitor-facing state. */
export function normalizeTrackingState(
  raw: string | undefined | null,
): TrackingState {
  const s = (raw ?? "").toLowerCase();
  if (s === "initializing") return "limited";
  if (s === "tracking" || s === "normal" || s === "ready") {
    return "tracking";
  }
  if (
    s === "limited" ||
    s.includes("excessive") ||
    s.includes("insufficient") ||
    s.includes("relocal")
  ) {
    return "limited";
  }
  if (s === "paused" || s === "pause") return "paused";
  return "stopped";
}

/** Recoverable coaching — null means keep the plugin's own hint. */
export function trackingCoach(
  state: TrackingState,
  placed: boolean,
): string | null {
  if (state === "tracking") return null;
  if (state === "limited") {
    return placed
      ? "Hold still — the cube will snap back when the camera finds the floor."
      : "Move the phone slowly so the camera can find the floor.";
  }
  return placed
    ? "Camera tracking paused. Point at the floor again."
    : "Camera tracking paused. Point at a flat surface.";
}
