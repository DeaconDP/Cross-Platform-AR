export type TrackingHintReason =
  | "none"
  | "insufficientLight"
  | "excessiveMotion"
  | "insufficientFeatures"
  | "cameraUnavailable"
  | "relocalizing";

const COPY: Record<TrackingHintReason, string> = {
  none: "",
  insufficientLight: "Need more light — turn toward a window or lamp.",
  excessiveMotion: "Hold the phone still so the camera can catch up.",
  insufficientFeatures: "Point at a textured table or floor, not a blank wall.",
  cameraUnavailable: "Camera tracking paused. Close other camera apps and try again.",
  relocalizing: "Looking for the same room — move slowly.",
};

export function trackingHintCopy(reason: string | undefined): string {
  if (!reason || reason === "none") return "";
  if (reason in COPY) return COPY[reason as TrackingHintReason];
  return "";
}
