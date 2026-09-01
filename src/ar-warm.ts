export type WarmKind = "runtime" | "skip";

/** Probe ARCore and start IMU warmup once per visit — no camera view. */
export function nextWarmAction(opts: {
  native: boolean;
  alreadyWarmed: boolean;
}): WarmKind {
  if (!opts.native || opts.alreadyWarmed) return "skip";
  return "runtime";
}
