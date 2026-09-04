export type ArPocketKind = "ok" | "near" | "facedown" | "pocket";
export type ArPocketProduct = "place" | "scan" | "cubes" | "emily";

export type ArPocketSample = {
  near?: boolean;
  distanceCm?: number | null;
  /** Device +Z including gravity, m/s². Android face-up ≈ +9.8 */
  accelZ?: number | null;
  /** Device +Y including gravity, m/s². Portrait upright ≈ ±9.8 */
  accelY?: number | null;
  facedown?: boolean;
  upright?: boolean;
  hidden?: boolean;
  /** iOS proximity monitoring blanks the display — treat near as pocket. */
  osBlanksOnNear?: boolean;
  /** +1 Android / most browsers; −1 iOS DeviceMotion / CoreMotion g. */
  faceUpSign?: 1 | -1;
};

export const AR_POCKET_FACE_DOWN_MS2 = 6.5;
export const AR_POCKET_NEAR_CM = 5;
export const AR_POCKET_FACE_HOLD_MS = 1200;
export const AR_POCKET_POCKET_HOLD_MS = 400;
export const AR_POCKET_POLL_MS = 250;

export function arIsNear(sample: ArPocketSample): boolean {
  if (sample.near === true) return true;
  if (sample.near === false) return false;
  if (typeof sample.distanceCm === "number" && Number.isFinite(sample.distanceCm)) {
    return sample.distanceCm >= 0 && sample.distanceCm <= AR_POCKET_NEAR_CM;
  }
  return false;
}

export function arIsFaceDown(sample: ArPocketSample): boolean {
  if (sample.facedown === true) return true;
  if (sample.facedown === false) return false;
  if (typeof sample.accelZ !== "number" || !Number.isFinite(sample.accelZ)) {
    return false;
  }
  const sign = sample.faceUpSign ?? 1;
  return sample.accelZ * sign <= -AR_POCKET_FACE_DOWN_MS2;
}

export function arIsUpright(sample: ArPocketSample): boolean {
  if (sample.upright === true) return true;
  if (typeof sample.accelY !== "number" || !Number.isFinite(sample.accelY)) {
    return false;
  }
  return Math.abs(sample.accelY) >= AR_POCKET_FACE_DOWN_MS2;
}

export function arJudgePocket(sample: ArPocketSample): ArPocketKind {
  const near = arIsNear(sample);
  const facedown = arIsFaceDown(sample);
  const upright = arIsUpright(sample);
  if (near && (facedown || upright || sample.hidden || sample.osBlanksOnNear)) {
    return "pocket";
  }
  if (facedown) return "facedown";
  if (near) return "near";
  return "ok";
}

export function arPocketShouldExit(kind: ArPocketKind): boolean {
  return kind === "pocket" || kind === "facedown";
}

export function arPocketHoldMs(kind: ArPocketKind): number {
  if (kind === "pocket") return AR_POCKET_POCKET_HOLD_MS;
  if (kind === "facedown") return AR_POCKET_FACE_HOLD_MS;
  return 0;
}

export function arPocketCoach(
  kind: ArPocketKind,
  product: ArPocketProduct,
): string {
  if (kind === "ok") return "";
  if (kind === "near") {
    if (product === "scan") return "Keep the camera clear of pockets and cases.";
    if (product === "emily") {
      return "Something’s covering the camera — I can’t see the floor.";
    }
    if (product === "cubes") {
      return "Proximity sensor covered — keep the camera clear.";
    }
    return "Keep the earpiece clear so the camera can see the table.";
  }
  if (kind === "facedown") {
    if (product === "emily") {
      return "Phone is face-down — leaving AR so the camera can rest.";
    }
    return "Phone is face-down — camera stopped.";
  }
  if (product === "emily") {
    return "Pocketed — I stopped the camera so it doesn’t stay on.";
  }
  if (product === "cubes") {
    return "Pocketed — AR closed so the camera does not stay on.";
  }
  return "Camera stopped so it doesn’t stay on in a pocket.";
}

export function arPocketFaceUpSign(): 1 | -1 {
  if (typeof navigator === "undefined") return 1;
  if (/iPhone|iPad|iPod/i.test(navigator.userAgent || "")) return -1;
  return 1;
}

export function arMergePocketSample(
  prev: ArPocketSample,
  next: ArPocketSample,
): ArPocketSample {
  return { ...prev, ...next };
}

export function arSampleFromMotion(
  ev: {
    accelerationIncludingGravity?: {
      x?: number | null;
      y?: number | null;
      z?: number | null;
    } | null;
  },
  faceUpSign: 1 | -1 = 1,
): ArPocketSample {
  const g = ev.accelerationIncludingGravity;
  return {
    accelY: typeof g?.y === "number" ? g.y : null,
    accelZ: typeof g?.z === "number" ? g.z : null,
    faceUpSign,
  };
}

export type ArPocketArm = {
  note: (sample: ArPocketSample) => ArPocketKind;
  dispose: () => void;
};

export function arArmPocket(opts: {
  product: ArPocketProduct;
  poll?: () => Promise<ArPocketSample | null> | ArPocketSample | null;
  onKind?: (kind: ArPocketKind, coach: string) => void;
  onExit: (kind: ArPocketKind, coach: string) => void;
  intervalMs?: number;
  now?: () => number;
  setIntervalFn?: (fn: () => void, ms: number) => number;
  clearIntervalFn?: (id: number) => void;
}): ArPocketArm {
  const now = opts.now ?? (() => Date.now());
  const setInt = opts.setIntervalFn ?? ((fn, ms) => globalThis.setInterval(fn, ms) as unknown as number);
  const clearInt = opts.clearIntervalFn ?? ((id) => globalThis.clearInterval(id));
  let last: ArPocketSample = {};
  let kind: ArPocketKind = "ok";
  let holdSince = 0;
  let exited = false;
  let disposed = false;

  const emitKind = (next: ArPocketKind) => {
    kind = next;
    opts.onKind?.(next, arPocketCoach(next, opts.product));
  };

  const consider = (sample: ArPocketSample): ArPocketKind => {
    if (disposed || exited) return kind;
    last = arMergePocketSample(last, sample);
    const next = arJudgePocket(last);
    if (next !== kind) {
      holdSince = arPocketShouldExit(next) ? now() : 0;
      emitKind(next);
    }
    if (!arPocketShouldExit(next)) return next;
    const need = arPocketHoldMs(next);
    if (need > 0 && now() - holdSince < need) return next;
    exited = true;
    opts.onExit(next, arPocketCoach(next, opts.product));
    return next;
  };

  const tick = () => {
    if (disposed || exited) return;
    try {
      const result = opts.poll?.();
      if (result == null) return;
      if (typeof (result as { then?: unknown }).then === "function") {
        void Promise.resolve(result).then((sample) => {
          if (sample) consider(sample);
        });
        return;
      }
      consider(result as ArPocketSample);
    } catch {
      /* poll is best-effort */
    }
  };

  const interval = opts.poll
    ? setInt(tick, opts.intervalMs ?? AR_POCKET_POLL_MS)
    : 0;

  return {
    note: consider,
    dispose: () => {
      disposed = true;
      if (interval) clearInt(interval);
    },
  };
}

/** DeviceMotion + visibility. Hidden alone is not a pocket (idle wave owns that). */
export function arListenPocketSensors(
  note: (sample: ArPocketSample) => void,
): () => void {
  const faceUpSign = arPocketFaceUpSign();
  const onMotion = (ev: DeviceMotionEvent) => {
    note(arSampleFromMotion(ev, faceUpSign));
  };
  const onVis = () => {
    note({ hidden: typeof document !== "undefined" && document.hidden });
  };
  if (typeof window !== "undefined") {
    window.addEventListener("devicemotion", onMotion);
  }
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVis);
  }
  const motion = (
    DeviceMotionEvent as typeof DeviceMotionEvent & {
      requestPermission?: () => Promise<string>;
    }
  ).requestPermission;
  if (typeof motion === "function") {
    void motion().catch(() => undefined);
  }
  return () => {
    if (typeof window !== "undefined") {
      window.removeEventListener("devicemotion", onMotion);
    }
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onVis);
    }
  };
}
