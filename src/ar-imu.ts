export type ArImuKind = "ok" | "denied" | "missing" | "stuck";
export type ArImuProduct = "place" | "scan" | "emily" | "cubes";

export type ArImuSample = {
  live: boolean;
  hasAccel: boolean;
  hasGyro: boolean;
  /** |raw accel| in m/s². -1 unknown. */
  gravityMag: number;
  denied?: boolean;
  placed?: boolean;
};

export type ArImuNative = {
  live?: boolean;
  hasAccel?: boolean;
  hasGyro?: boolean;
  gravityMag?: number;
  kind?: string;
  denied?: boolean;
  placed?: boolean;
};

export type ArImuJudge = {
  kind: ArImuKind;
  live: boolean;
  hasAccel: boolean;
  hasGyro: boolean;
  gravityMag: number;
  denied: boolean;
  placed: boolean;
  coach: string;
};

export const AR_IMU_STUCK_MAG = 0.45;
export const AR_IMU_WILD_MAG = 22;
export const AR_IMU_MISSING_MS = 1200;
export const AR_IMU_HOLD_UP_MS = 600;
export const AR_IMU_HOLD_DOWN_MS = 800;
export const AR_IMU_POLL_MS = 700;

const RANK: Record<ArImuKind, number> = {
  ok: 0,
  denied: 1,
  missing: 2,
  stuck: 3,
};

export function arImuRank(kind: ArImuKind): number {
  return RANK[kind] ?? 0;
}

export function arJudgeImu(
  sample: ArImuSample,
  opts?: { waitExpired?: boolean },
): ArImuKind {
  if (sample.denied) return "denied";
  if (!sample.live) return opts?.waitExpired ? "missing" : "ok";
  if (!(sample.gravityMag >= 0)) return "ok";
  if (sample.gravityMag < AR_IMU_STUCK_MAG || sample.gravityMag > AR_IMU_WILD_MAG) {
    return "stuck";
  }
  return "ok";
}

export function arImuCoach(
  kind: ArImuKind,
  product: ArImuProduct,
  placed = false,
): string {
  if (kind === "ok") return "";
  if (product === "scan") {
    if (kind === "denied") {
      return "Allow Motion in Settings so the mark can stay locked.";
    }
    if (kind === "missing") {
      return "This phone isn’t reporting motion. Hold the printed mark, or use the 3D view.";
    }
    return placed
      ? "Motion sensors look frozen — the find may drift. Force-stop and try again."
      : "Motion sensors look frozen. Force-stop the app and try again.";
  }
  if (product === "emily") {
    if (kind === "denied") {
      return "Allow Motion in Settings so I can stay on the floor.";
    }
    if (kind === "missing") {
      return "This phone isn’t reporting motion. Try another device, or leave Place.";
    }
    return placed
      ? "I may drift — motion sensors look frozen. Force-stop and Place again."
      : "Motion sensors look frozen. Force-stop the app and try Place again.";
  }
  if (product === "cubes") {
    if (kind === "denied") {
      return "Allow Motion in Settings so cubes can stay locked.";
    }
    if (kind === "missing") {
      return "This phone isn’t reporting motion. Try the 3D preview, or another device.";
    }
    return placed
      ? "Cubes may drift — motion sensors look frozen. Force-stop and try again."
      : "Motion sensors look frozen. Force-stop the app and try again.";
  }
  if (kind === "denied") {
    return "Allow Motion in Settings so the fossil can stay locked.";
  }
  if (kind === "missing") {
    return "This phone isn’t reporting motion. Try the 3D view, or another device.";
  }
  return placed
    ? "Tracking may drift — motion sensors look frozen. Force-stop and try again."
    : "Motion sensors look frozen. Force-stop the app and try again.";
}

export function arImuProfile(
  sample: ArImuSample,
  product: ArImuProduct,
  opts?: { waitExpired?: boolean },
): ArImuJudge {
  const kind = arJudgeImu(sample, opts);
  const placed = Boolean(sample.placed);
  return {
    kind,
    live: sample.live,
    hasAccel: sample.hasAccel,
    hasGyro: sample.hasGyro,
    gravityMag: sample.gravityMag,
    denied: Boolean(sample.denied),
    placed,
    coach: arImuCoach(kind, product, placed),
  };
}

export function arHoldImu(args: {
  shown: ArImuKind;
  raw: ArImuKind;
  heldMs: number;
}): ArImuKind {
  if (args.raw === args.shown) return args.shown;
  const up = arImuRank(args.raw) > arImuRank(args.shown);
  const need = up ? AR_IMU_HOLD_UP_MS : AR_IMU_HOLD_DOWN_MS;
  return args.heldMs >= need ? args.raw : args.shown;
}

export function arParseImuEvent(
  data: ArImuNative | null | undefined,
): ArImuSample {
  const gravityMag =
    typeof data?.gravityMag === "number" && Number.isFinite(data.gravityMag)
      ? data.gravityMag
      : -1;
  return {
    live: Boolean(data?.live),
    hasAccel: Boolean(data?.hasAccel),
    hasGyro: Boolean(data?.hasGyro),
    gravityMag,
    denied: Boolean(data?.denied),
    placed: Boolean(data?.placed),
  };
}

export function arSampleDeviceMotion(
  ev: Pick<DeviceMotionEvent, "accelerationIncludingGravity" | "rotationRate">,
): ArImuSample {
  const g = ev.accelerationIncludingGravity;
  if (!g || g.x == null || g.y == null || g.z == null) {
    return {
      live: false,
      hasAccel: false,
      hasGyro: ev.rotationRate != null,
      gravityMag: -1,
    };
  }
  return {
    live: true,
    hasAccel: true,
    hasGyro: ev.rotationRate != null,
    gravityMag: Math.hypot(g.x, g.y, g.z),
  };
}

export function arApplyImuClass(
  el: HTMLElement | null | undefined,
  kind: ArImuKind,
): void {
  if (!el) return;
  el.classList.toggle("is-ar-imu", kind !== "ok");
  el.classList.toggle("is-ar-imu-denied", kind === "denied");
  el.classList.toggle("is-ar-imu-missing", kind === "missing");
  el.classList.toggle("is-ar-imu-stuck", kind === "stuck");
}

export function arClearImuClass(el: HTMLElement | null | undefined): void {
  if (!el) return;
  el.classList.remove(
    "is-ar-imu",
    "is-ar-imu-denied",
    "is-ar-imu-missing",
    "is-ar-imu-stuck",
  );
}

export type ArImuArmOpts = {
  product: ArImuProduct;
  getNative?: () => Promise<ArImuNative | null>;
  onChange?: (judge: ArImuJudge) => void;
  pollMs?: number;
  root?: HTMLElement | null;
  placed?: boolean;
  useWeb?: boolean;
};

export type ArImuHandle = {
  dispose: () => void;
  snapshot: () => ArImuJudge;
  pushNative: (data: ArImuNative | null) => void;
  setPlaced: (placed: boolean) => void;
};

export function arArmImu(opts: ArImuArmOpts): ArImuHandle {
  const product = opts.product;
  const pollMs = opts.pollMs ?? AR_IMU_POLL_MS;
  const root =
    opts.root ??
    (typeof document !== "undefined" ? document.documentElement : null);

  let disposed = false;
  let placed = Boolean(opts.placed);
  let sample: ArImuSample = {
    live: false,
    hasAccel: false,
    hasGyro: false,
    gravityMag: -1,
    placed,
  };
  let shown: ArImuKind = "ok";
  let pending: ArImuKind = "ok";
  let pendingSince = 0;
  let startedAt = 0;
  let judge: ArImuJudge = {
    kind: "ok",
    live: false,
    hasAccel: false,
    hasGyro: false,
    gravityMag: -1,
    denied: false,
    placed,
    coach: "",
  };
  let poll = 0;
  let motion: ((ev: DeviceMotionEvent) => void) | null = null;

  const nowMs = () =>
    typeof performance !== "undefined" ? performance.now() : Date.now();

  const publish = (now: number) => {
    const waitExpired =
      !sample.live && !sample.denied && now - startedAt >= AR_IMU_MISSING_MS;
    const raw = arJudgeImu(sample, { waitExpired });
    if (raw !== pending) {
      pending = raw;
      pendingSince = now;
    }
    const next = arHoldImu({
      shown,
      raw,
      heldMs: now - pendingSince,
    });
    const nextJudge = {
      kind: next,
      live: sample.live,
      hasAccel: sample.hasAccel,
      hasGyro: sample.hasGyro,
      gravityMag: sample.gravityMag,
      denied: Boolean(sample.denied),
      placed,
      coach: arImuCoach(next, product, placed),
    };
    if (
      next === shown &&
      nextJudge.coach === judge.coach &&
      nextJudge.placed === judge.placed
    ) {
      return;
    }
    shown = next;
    judge = nextJudge;
    arApplyImuClass(root, shown);
    opts.onChange?.(judge);
  };

  const applyNative = (data: ArImuNative | null | undefined) => {
    if (disposed || !data) return;
    const parsed = arParseImuEvent(data);
    sample = { ...parsed, placed };
    publish(nowMs());
  };

  const pull = () => {
    if (disposed || !opts.getNative) return;
    void opts
      .getNative()
      .then((data) => applyNative(data))
      .catch(() => undefined);
  };

  startedAt = nowMs();
  pendingSince = startedAt;
  pull();
  if (typeof window !== "undefined") {
    poll = window.setInterval(pull, pollMs);
  }

  if (opts.useWeb && typeof window !== "undefined") {
    const attach = () => {
      if (disposed) return;
      motion = (ev: DeviceMotionEvent) => {
        if (disposed || sample.live) return;
        const web = arSampleDeviceMotion(ev);
        if (!web.live) return;
        sample = { ...web, placed, denied: sample.denied };
        publish(nowMs());
      };
      window.addEventListener("devicemotion", motion, { passive: true });
    };
    const req = (
      DeviceMotionEvent as unknown as {
        requestPermission?: () => Promise<string>;
      }
    ).requestPermission;
    if (typeof req === "function") {
      void req()
        .then((status) => {
          if (disposed) return;
          if (status !== "granted") {
            sample = { ...sample, denied: true, placed };
            publish(nowMs());
            return;
          }
          attach();
        })
        .catch(() => {
          if (disposed) return;
          sample = { ...sample, denied: true, placed };
          publish(nowMs());
        });
    } else {
      attach();
    }
  }

  return {
    dispose() {
      disposed = true;
      if (poll && typeof window !== "undefined") {
        window.clearInterval(poll);
      }
      if (motion && typeof window !== "undefined") {
        window.removeEventListener("devicemotion", motion);
      }
      arClearImuClass(root);
    },
    snapshot: () => judge,
    pushNative(data) {
      applyNative(data);
    },
    setPlaced(next) {
      if (disposed || placed === next) return;
      placed = next;
      sample = { ...sample, placed };
      publish(nowMs());
    },
  };
}
