export type MappingStatus = "notAvailable" | "limited" | "extending" | "mapped";

export const HEARTBEAT_STALL_MS = 5000;

/** Visitor copy while the session is still learning the room. */
export function mappingCoach(
  status: MappingStatus,
  opts: { placed?: boolean; restored?: boolean } = {},
): string | null {
  if (opts.placed) return null;
  if (status === "mapped") {
    return opts.restored ? "Surface remembered — tap to place." : null;
  }
  if (status === "extending") {
    return "Keep scanning — then tap to place a cube.";
  }
  return "Walk around so the camera can learn this surface.";
}

export function heartbeatStalled(
  lastMs: number,
  nowMs: number,
  timeoutMs = HEARTBEAT_STALL_MS,
): boolean {
  return nowMs - lastMs > timeoutMs;
}

export function parseMappingStatus(raw: unknown): MappingStatus {
  if (
    raw === "mapped" ||
    raw === "extending" ||
    raw === "limited" ||
    raw === "notAvailable"
  ) {
    return raw;
  }
  return "notAvailable";
}
