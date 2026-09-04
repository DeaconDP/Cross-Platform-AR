export type ArMagKind = "ok" | "weak" | "interfere" | "uncalibrated";
export type ArMagProduct = "place" | "scan" | "cubes" | "emily";
export type ArMagAccuracy = "high" | "medium" | "low" | "uncalibrated" | "unknown";

export type ArMagSample = {
  supported?: boolean;
  x?: number | null;
  y?: number | null;
  z?: number | null;
  uT?: number | null;
  accuracy?: ArMagAccuracy;
  accuracyCode?: number | null;
};

/** Earth field is ~25–65 μT. Outside this band is metal / speaker / case. */
export const AR_MAG_EARTH_MIN_UT = 15;
export const AR_MAG_EARTH_MAX_UT = 80;
export const AR_MAG_HOLD_MS = 600;
export const AR_MAG_POLL_MS = 400;

export function arMagAccuracyFromCode(
  code: number | null | undefined,
): ArMagAccuracy {
  if (code === -1) return "uncalibrated";
  if (code === 0) return "low";
  if (code === 1) return "medium";
  if (code === 2) return "high";
  return "unknown";
}

export function arMagNormUt(
  x?: number | null,
  y?: number | null,
  z?: number | null,
): number | null {
  if (
    typeof x !== "number" ||
    typeof y !== "number" ||
    typeof z !== "number" ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(z)
  ) {
    return null;
  }
  return Math.hypot(x, y, z);
}

export function arJudgeMag(sample: ArMagSample): ArMagKind {
  if (sample.supported === false) return "ok";
  const acc =
    sample.accuracy ?? arMagAccuracyFromCode(sample.accuracyCode);
  const uT =
    typeof sample.uT === "number" && Number.isFinite(sample.uT)
      ? sample.uT
      : arMagNormUt(sample.x, sample.y, sample.z);
  if (acc === "uncalibrated") return "uncalibrated";
  if (typeof uT === "number" && (uT < AR_MAG_EARTH_MIN_UT || uT > AR_MAG_EARTH_MAX_UT)) {
    return "interfere";
  }
  if (acc === "low") return "weak";
  return "ok";
}

export function arMagCoach(kind: ArMagKind, product: ArMagProduct): string {
  if (kind === "ok") return "";
  if (kind === "uncalibrated") {
    if (product === "emily") return "Sweep me in a figure-8 so I can find north.";
    if (product === "scan") return "Sweep the phone in a figure-8 so the plaque can lock.";
    if (product === "cubes") return "Sweep the phone in a figure-8 to calibrate.";
    return "Sweep the phone in a figure-8 so the fossil stays locked.";
  }
  if (kind === "interfere") {
    if (product === "emily") return "Metal nearby — step away so I can see the floor.";
    if (product === "scan") return "Metal nearby — step away from the case.";
    if (product === "cubes") return "Metal nearby — move a step from the table edge.";
    return "Metal nearby — step away from the case so the fossil stays put.";
  }
  if (product === "emily") return "Move me slowly — the compass is still settling.";
  if (product === "scan") return "Hold steady — compass is settling.";
  if (product === "cubes") return "Move slowly — compass is settling.";
  return "Move slowly — compass is settling on the table.";
}

export function arMergeMagSample(
  prev: ArMagSample,
  next: ArMagSample,
): ArMagSample {
  return { ...prev, ...next };
}

export type ArMagArm = {
  note: (sample: ArMagSample) => ArMagKind;
  kind: () => ArMagKind;
  dispose: () => void;
};

export function arArmMag(opts: {
  product: ArMagProduct;
  poll?: () => Promise<ArMagSample | null> | ArMagSample | null;
  onKind?: (kind: ArMagKind, coach: string) => void;
  intervalMs?: number;
  holdMs?: number;
  now?: () => number;
  setIntervalFn?: (fn: () => void, ms: number) => number;
  clearIntervalFn?: (id: number) => void;
}): ArMagArm {
  const now = opts.now ?? (() => Date.now());
  const setInt =
    opts.setIntervalFn ??
    ((fn, ms) => globalThis.setInterval(fn, ms) as unknown as number);
  const clearInt =
    opts.clearIntervalFn ?? ((id) => globalThis.clearInterval(id));
  const holdNeed = opts.holdMs ?? AR_MAG_HOLD_MS;
  let last: ArMagSample = {};
  let kind: ArMagKind = "ok";
  let pending: ArMagKind = "ok";
  let holdSince = 0;
  let disposed = false;

  const emit = (next: ArMagKind) => {
    if (kind === next) return;
    kind = next;
    opts.onKind?.(next, arMagCoach(next, opts.product));
  };

  const consider = (sample: ArMagSample): ArMagKind => {
    if (disposed) return kind;
    last = arMergeMagSample(last, sample);
    const next = arJudgeMag(last);
    if (next !== pending) {
      pending = next;
      holdSince = now();
    }
    if (next === "ok") {
      emit("ok");
      return "ok";
    }
    if (now() - holdSince < holdNeed) return kind;
    emit(next);
    return next;
  };

  const tick = () => {
    if (disposed) return;
    try {
      const result = opts.poll?.();
      if (result == null) return;
      if (typeof (result as { then?: unknown }).then === "function") {
        void Promise.resolve(result).then((sample) => {
          if (sample) consider(sample);
        });
        return;
      }
      consider(result as ArMagSample);
    } catch {
      /* poll is best-effort */
    }
  };

  const interval = opts.poll
    ? setInt(tick, opts.intervalMs ?? AR_MAG_POLL_MS)
    : 0;

  return {
    note: consider,
    kind: () => kind,
    dispose: () => {
      disposed = true;
      if (interval) clearInt(interval);
    },
  };
}

type MagSensor = {
  x?: number;
  y?: number;
  z?: number;
  start: () => void;
  stop: () => void;
  addEventListener: (type: string, fn: () => void) => void;
  removeEventListener: (type: string, fn: () => void) => void;
};

/** Generic Sensor Magnetometer (Chrome Android). Native poll covers iOS / WebView. */
export function arListenMagSensors(
  note: (sample: ArMagSample) => void,
): () => void {
  const Mag = (
    globalThis as {
      Magnetometer?: new (opts: { frequency: number }) => MagSensor;
    }
  ).Magnetometer;
  if (!Mag) return () => undefined;
  let sensor: MagSensor | null = null;
  const onRead = () => {
    if (!sensor) return;
    note({
      supported: true,
      x: typeof sensor.x === "number" ? sensor.x : null,
      y: typeof sensor.y === "number" ? sensor.y : null,
      z: typeof sensor.z === "number" ? sensor.z : null,
    });
  };
  try {
    sensor = new Mag({ frequency: 10 });
    sensor.addEventListener("reading", onRead);
    sensor.start();
  } catch {
    return () => undefined;
  }
  return () => {
    try {
      sensor?.removeEventListener("reading", onRead);
      sensor?.stop();
    } catch {
      /* already stopped */
    }
  };
}
