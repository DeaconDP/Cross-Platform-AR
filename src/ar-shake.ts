/** Shake-to-lift: a deliberate back-and-forth pick-up, not a walking step. */

export const AR_SHAKE_PEAK = 3.2;
export const AR_SHAKE_CROSSINGS = 1;
export const AR_SHAKE_WINDOW_MS = 650;
export const AR_SHAKE_COOLDOWN_MS = 1400;
export const AR_SHAKE_POLL_MS = 50;

export type ArShakeKind = "place" | "scan" | "cubes";

export type ArShakeSample = { ax: number; ay: number; az: number };

export type ArShakeState = {
  crossings: number;
  lastSign: number;
  windowStart: number;
  lastFire: number;
};

export function arShakeMag(ax: number, ay: number, az: number): number {
  return Math.hypot(ax, ay, az);
}

export function arShakeFresh(now = 0): ArShakeState {
  return { crossings: 0, lastSign: 0, windowStart: now, lastFire: 0 };
}

export function arShakeDominantSign(ax: number, ay: number, az: number): number {
  const axa = Math.abs(ax);
  const aya = Math.abs(ay);
  const aza = Math.abs(az);
  if (axa >= aya && axa >= aza) return ax === 0 ? 0 : ax > 0 ? 1 : -1;
  if (aya >= aza) return ay === 0 ? 0 : ay > 0 ? 1 : -1;
  return az === 0 ? 0 : az > 0 ? 1 : -1;
}

export function arShakeTick(
  prev: ArShakeState,
  sample: ArShakeSample,
  now: number,
): { fire: boolean; shaking: boolean; state: ArShakeState } {
  const mag = arShakeMag(sample.ax, sample.ay, sample.az);
  const shaking = mag >= AR_SHAKE_PEAK;
  let { crossings, lastSign, windowStart, lastFire } = prev;

  if (lastFire > 0 && now - lastFire < AR_SHAKE_COOLDOWN_MS) {
    return { fire: false, shaking, state: { crossings, lastSign, windowStart, lastFire } };
  }

  if (now - windowStart > AR_SHAKE_WINDOW_MS) {
    crossings = 0;
    lastSign = 0;
    windowStart = now;
  }

  if (shaking) {
    const sign = arShakeDominantSign(sample.ax, sample.ay, sample.az);
    if (sign !== 0 && lastSign !== 0 && sign !== lastSign) {
      crossings += 1;
    }
    if (sign !== 0) lastSign = sign;
  }

  if (crossings >= AR_SHAKE_CROSSINGS) {
    return {
      fire: true,
      shaking,
      state: { crossings: 0, lastSign: 0, windowStart: now, lastFire: now },
    };
  }
  return { fire: false, shaking, state: { crossings, lastSign, windowStart, lastFire } };
}

export function arShakeFromDeviceMotion(ev: {
  acceleration?: { x: number | null; y: number | null; z: number | null } | null;
  accelerationIncludingGravity?: {
    x: number | null;
    y: number | null;
    z: number | null;
  } | null;
}): ArShakeSample | null {
  const a = ev.acceleration;
  if (a && (a.x != null || a.y != null || a.z != null)) {
    return { ax: a.x ?? 0, ay: a.y ?? 0, az: a.z ?? 0 };
  }
  const g = ev.accelerationIncludingGravity;
  if (!g || (g.x == null && g.y == null && g.z == null)) return null;
  return { ax: g.x ?? 0, ay: g.y ?? 0, az: (g.z ?? 0) - 9.81 };
}

export function arShakeShouldLift(kind: ArShakeKind, placed: boolean): boolean {
  if (kind === "scan") return false;
  if (kind === "cubes") return placed;
  return placed;
}

export function arShakeCoach(opts: {
  placed: boolean;
  kind: ArShakeKind;
  reducedMotion?: boolean;
}): string | null {
  if (opts.reducedMotion) return null;
  if (opts.kind === "scan") {
    return opts.placed ? null : "Hold the phone still on the plaque.";
  }
  if (!opts.placed) return null;
  if (opts.kind === "cubes") return "Shake to lift the last cube.";
  return "Shake the phone to lift it and place again.";
}

export function arShakeReducedMotion(
  matchMedia?: (q: string) => { matches: boolean } | null,
): boolean {
  try {
    return Boolean(matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
  } catch {
    return false;
  }
}

export type ArShakeHandles = {
  dispose: () => void;
  notePlaced: (placed: boolean) => void;
};

type MotionBus = {
  add: (type: "devicemotion", fn: (ev: DeviceMotionEvent) => void) => void;
  remove: (type: "devicemotion", fn: (ev: DeviceMotionEvent) => void) => void;
};

export function arShakeArm(opts: {
  onLift: () => void;
  canLift?: () => boolean;
  poll?: () => Promise<ArShakeSample | null>;
  kind?: ArShakeKind;
  now?: () => number;
  motion?: MotionBus;
  matchMedia?: (q: string) => { matches: boolean } | null;
  interval?: (fn: () => void, ms: number) => number;
  clearInterval?: (id: number) => void;
}): ArShakeHandles {
  const kind = opts.kind ?? "place";
  const now = opts.now ?? (() => Date.now());
  let placed = false;
  let state = arShakeFresh(now());
  let alive = true;
  let pollId = 0;
  const reduced = arShakeReducedMotion(
    opts.matchMedia ??
      (typeof window !== "undefined" ? (q) => window.matchMedia(q) : undefined),
  );

  const ingest = (sample: ArShakeSample | null) => {
    if (!alive || !sample || reduced) return;
    const next = arShakeTick(state, sample, now());
    state = next.state;
    if (
      next.fire &&
      arShakeShouldLift(kind, placed) &&
      (opts.canLift?.() ?? true)
    ) {
      opts.onLift();
    }
  };

  const onMotion = (ev: DeviceMotionEvent) => {
    ingest(arShakeFromDeviceMotion(ev));
  };

  const motion =
    opts.motion ??
    (typeof window !== "undefined"
      ? {
          add: (type: "devicemotion", fn: (ev: DeviceMotionEvent) => void) =>
            window.addEventListener(type, fn),
          remove: (type: "devicemotion", fn: (ev: DeviceMotionEvent) => void) =>
            window.removeEventListener(type, fn),
        }
      : undefined);

  motion?.add("devicemotion", onMotion);

  const Doe = (
    globalThis as unknown as {
      DeviceMotionEvent?: { requestPermission?: () => Promise<string> };
    }
  ).DeviceMotionEvent;
  if (typeof Doe?.requestPermission === "function") {
    void Doe.requestPermission().catch(() => undefined);
  }

  if (opts.poll) {
    const setInt = opts.interval ?? ((fn, ms) => window.setInterval(fn, ms));
    pollId = setInt(() => {
      void opts.poll?.().then(ingest);
    }, AR_SHAKE_POLL_MS);
  }

  return {
    notePlaced(next) {
      placed = next;
    },
    dispose() {
      alive = false;
      motion?.remove("devicemotion", onMotion);
      const clear = opts.clearInterval ?? ((id) => window.clearInterval(id));
      if (pollId) clear(pollId);
    },
  };
}
