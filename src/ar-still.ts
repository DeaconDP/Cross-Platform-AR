/** Hold-still place gate so a walking tap cannot miss through the floor. */

export type ArStillKind = "ok" | "busy" | "shaky";

export type ArMotionSample = {
  ax: number;
  ay: number;
  az: number;
  linear?: boolean;
};

export type ArNativeMotion = {
  g?: number;
  moving?: boolean;
};

const BUSY_G = 0.18;
const SHAKY_G = 0.45;
const EMA_ALPHA = 0.22;
const MS2_G = 9.80665;

export function arLinearG(ax: number, ay: number, az: number): number {
  const mag = Math.hypot(ax, ay, az);
  if (!Number.isFinite(mag)) return 0;
  return mag > 4 ? mag / MS2_G : mag;
}

export function arGravityExcessG(ax: number, ay: number, az: number): number {
  const mag = Math.hypot(ax, ay, az);
  if (!Number.isFinite(mag)) return 0;
  if (mag > 4) return Math.abs(mag / MS2_G - 1);
  return Math.abs(mag - 1);
}

export function arSampleExcessG(sample: ArMotionSample): number {
  if (sample.linear) return arLinearG(sample.ax, sample.ay, sample.az);
  return arGravityExcessG(sample.ax, sample.ay, sample.az);
}

export function arStillPush(
  prev: number,
  sample: number,
  alpha = EMA_ALPHA,
): number {
  if (!Number.isFinite(sample)) return prev;
  if (!Number.isFinite(prev)) return sample;
  return prev + alpha * (sample - prev);
}

export function arStillKind(g: number): ArStillKind {
  if (!Number.isFinite(g) || g < BUSY_G) return "ok";
  if (g >= SHAKY_G) return "shaky";
  return "busy";
}

export function arStillAllowsPlace(kind: ArStillKind): boolean {
  return kind === "ok";
}

export function arStillCoach(
  kind: ArStillKind,
  mode: "place" | "scan" = "place",
): string | null {
  if (kind === "shaky") {
    return mode === "scan"
      ? "Hold still on the plaque."
      : "Hold the phone still, then tap.";
  }
  if (kind === "busy") {
    return mode === "scan"
      ? "Pause a moment on the plaque."
      : "Pause a moment, then tap the surface.";
  }
  return null;
}

export function arMergeMotion(
  webG: number | null | undefined,
  native?: ArNativeMotion | null,
): number {
  const nativeG =
    typeof native?.g === "number" && Number.isFinite(native.g)
      ? Math.max(0, native.g)
      : native?.moving
        ? BUSY_G + 0.01
        : null;
  if (webG == null || !Number.isFinite(webG)) return nativeG ?? 0;
  if (nativeG == null) return webG;
  return Math.max(webG, nativeG);
}

export function arTapWasShaky(
  result: { shaky?: boolean } | null | undefined,
): boolean {
  return Boolean(result?.shaky);
}

function listenDeviceMotion(
  cb: (sample: ArMotionSample) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const onMotion = (event: DeviceMotionEvent) => {
    const lin = event.acceleration;
    if (
      lin &&
      (lin.x != null || lin.y != null || lin.z != null)
    ) {
      cb({
        ax: lin.x ?? 0,
        ay: lin.y ?? 0,
        az: lin.z ?? 0,
        linear: true,
      });
      return;
    }
    const grav = event.accelerationIncludingGravity;
    if (
      grav &&
      (grav.x != null || grav.y != null || grav.z != null)
    ) {
      cb({
        ax: grav.x ?? 0,
        ay: grav.y ?? 0,
        az: grav.z ?? 0,
      });
    }
  };
  window.addEventListener("devicemotion", onMotion);
  return () => window.removeEventListener("devicemotion", onMotion);
}

export function arArmStill(opts?: {
  getNative?: () => Promise<ArNativeMotion | null>;
  listenMotion?: (cb: (sample: ArMotionSample) => void) => () => void;
  pollMs?: number;
  onChange?: (kind: ArStillKind, g: number) => void;
}): () => void {
  let disposed = false;
  let ema = 0;
  let hasEma = false;
  let lastKind: ArStillKind = "ok";

  const emit = (native?: ArNativeMotion | null) => {
    if (disposed) return;
    const g = arMergeMotion(hasEma ? ema : null, native);
    const kind = arStillKind(g);
    if (kind === lastKind && hasEma) {
      opts?.onChange?.(kind, g);
      return;
    }
    lastKind = kind;
    opts?.onChange?.(kind, g);
  };

  emit(null);

  const unlisten = (opts?.listenMotion ?? listenDeviceMotion)((sample) => {
    const raw = arSampleExcessG(sample);
    ema = hasEma ? arStillPush(ema, raw) : raw;
    hasEma = true;
    emit(null);
  });

  let timer = 0;
  if (opts?.getNative) {
    const poll = () => {
      void (async () => {
        if (disposed) return;
        try {
          emit(await opts.getNative?.());
        } catch {
          emit(null);
        }
      })();
    };
    poll();
    const timers = typeof window !== "undefined" ? window : globalThis;
    timer = timers.setInterval(poll, opts.pollMs ?? 280) as unknown as number;
  }

  return () => {
    disposed = true;
    unlisten();
    if (timer) {
      const timers = typeof window !== "undefined" ? window : globalThis;
      timers.clearInterval(timer);
    }
  };
}
