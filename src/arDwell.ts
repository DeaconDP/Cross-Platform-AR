/** Shared look-and-hold placement + camera-tilt coaching. */

export const DWELL_MS = 800;
export const LOOK_DOWN_DEG = 22;
export const MISS_RESET_MS = 160;

export type DwellHint = "lookDown" | "hold" | "scan" | "";

export type DwellState = {
  hitStartedAt: number | null;
  lastHitAt: number | null;
  progress: number;
  ready: boolean;
  hint: DwellHint;
};

export type DwellSample = {
  now: number;
  hasHit: boolean;
  lookDownDeg: number;
  placed: boolean;
};

export function createDwellState(): DwellState {
  return {
    hitStartedAt: null,
    lastHitAt: null,
    progress: 0,
    ready: false,
    hint: "",
  };
}

/** Degrees below the horizon. 0 = looking ahead, 90 = straight at the floor. */
export function lookDownDegFromForwardY(forwardY: number): number {
  return Math.asin(Math.max(-1, Math.min(1, -forwardY))) * (180 / Math.PI);
}

/**
 * Column-major view matrix (world → view). Camera looks down −Z in view space,
 * so world look.y is −m[6].
 */
export function lookDownDegFromView(m: ArrayLike<number>): number {
  if (m.length < 7) return 0;
  return lookDownDegFromForwardY(-m[6]);
}

export function updateDwell(state: DwellState, sample: DwellSample): DwellState {
  if (sample.placed) return createDwellState();
  if (sample.hasHit) {
    const start = state.hitStartedAt ?? sample.now;
    const progress = Math.min(1, (sample.now - start) / DWELL_MS);
    return {
      hitStartedAt: start,
      lastHitAt: sample.now,
      progress,
      ready: progress >= 1,
      hint: "hold",
    };
  }
  if (state.lastHitAt != null && sample.now - state.lastHitAt < MISS_RESET_MS) {
    return { ...state, ready: false };
  }
  return {
    hitStartedAt: null,
    lastHitAt: null,
    progress: 0,
    ready: false,
    hint: sample.lookDownDeg < LOOK_DOWN_DEG ? "lookDown" : "scan",
  };
}

export function dwellHintText(hint: DwellHint): string {
  switch (hint) {
    case "lookDown":
      return "Tilt the camera toward the table.";
    case "hold":
      return "Hold still to place a cube.";
    case "scan":
      return "Slowly sweep a flat surface.";
    default:
      return "";
  }
}
