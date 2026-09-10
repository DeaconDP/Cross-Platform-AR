export type ArWalkKind = "ok" | "walk" | "ride";
export type ArWalkProduct = "place" | "scan" | "emily" | "cubes";

export type ArWalkSample = {
  live: boolean;
  /** Horizontal speed m/s. -1 unknown. */
  speedMps: number;
  /** Pedometer cadence, steps/s. -1 unknown. */
  stepHz: number;
  /** Activity API: walking / running. */
  walk?: boolean;
  /** Activity API: automotive / cycling. */
  ride?: boolean;
  /** Time since the session started, ms. -1 unknown. */
  sessionMs?: number;
  placed?: boolean;
};

export type ArWalkNative = {
  live?: boolean;
  speedMps?: number;
  stepHz?: number;
  walk?: boolean;
  ride?: boolean;
  sessionMs?: number;
  kind?: string;
  blockPlace?: boolean;
  placed?: boolean;
};

export type ArWalkJudge = {
  kind: ArWalkKind;
  live: boolean;
  speedMps: number;
  stepHz: number;
  walk: boolean;
  ride: boolean;
  placed: boolean;
  blockPlace: boolean;
  coach: string;
};

/** Ignore the sit-down jostle while the camera wakes. */
export const AR_WALK_WARM_MS = 1200;
/** ~2.5 km/h — a slow gallery stroll. */
export const AR_WALK_WALK_MPS = 0.7;
/** ~14 km/h — a car, bus, or bike. */
export const AR_WALK_RIDE_MPS = 4;
/** Brisk walk cadence. */
export const AR_WALK_STEP_HZ = 1.15;
/** Sustained linear-accel RMS that means footsteps, not a tap. */
export const AR_WALK_RMS = 1.55;
export const AR_WALK_HOLD_UP_MS = 600;
export const AR_WALK_HOLD_DOWN_MS = 800;
export const AR_WALK_POLL_MS = 250;

const RANK: Record<ArWalkKind, number> = {
  ok: 0,
  walk: 1,
  ride: 2,
};

export function arWalkRank(kind: ArWalkKind): number {
  return RANK[kind] ?? 0;
}

export function arWalkBlocksPlace(
  kind: ArWalkKind,
  product: ArWalkProduct,
): boolean {
  return kind === "ride" && product !== "scan";
}

export function arJudgeWalk(sample: ArWalkSample): ArWalkKind {
  if (!sample.live) return "ok";
  const sessionMs = sample.sessionMs ?? -1;
  if (sessionMs >= 0 && sessionMs < AR_WALK_WARM_MS) return "ok";
  if (sample.ride || sample.speedMps >= AR_WALK_RIDE_MPS) return "ride";
  if (
    sample.walk ||
    sample.speedMps >= AR_WALK_WALK_MPS ||
    sample.stepHz >= AR_WALK_STEP_HZ
  ) {
    return "walk";
  }
  return "ok";
}

export function arWalkCoach(
  kind: ArWalkKind,
  product: ArWalkProduct,
  placed = false,
): string {
  if (kind === "ok") return "";
  if (product === "scan") {
    if (kind === "ride") {
      return placed
        ? "Stop first — a moving seat will lose the mark."
        : "Stop first so the printed mark can lock.";
    }
    return placed
      ? "Hold still — walking can drop the find."
      : "Pause so the mark can lock.";
  }
  if (product === "emily") {
    if (kind === "ride") {
      return placed
        ? "Stop first — I cannot stay on the floor from a moving seat."
        : "Stop first. I cannot see the floor from a moving seat.";
    }
    return placed
      ? "Pause — walking makes me slide."
      : "Pause to place — walking makes the floor slip.";
  }
  if (product === "cubes") {
    if (kind === "ride") {
      return placed
        ? "Stop first — extra cubes will miss from a moving seat."
        : "Stop first. AR cannot track from a moving seat.";
    }
    return placed
      ? "Pause — walking makes cubes drift."
      : "Pause to place — walking makes the table slip.";
  }
  if (kind === "ride") {
    return placed
      ? "Stop first — the fossil cannot stay locked from a moving seat."
      : "Stop first. AR cannot track from a moving seat.";
  }
  return placed
    ? "Pause — walking makes the fossil drift."
    : "Pause to place — walking makes the table slip.";
}

export function arWalkProfile(
  sample: ArWalkSample,
  product: ArWalkProduct,
): ArWalkJudge {
  const kind = arJudgeWalk(sample);
  const placed = Boolean(sample.placed);
  return {
    kind,
    live: sample.live,
    speedMps: sample.speedMps,
    stepHz: sample.stepHz,
    walk: Boolean(sample.walk),
    ride: Boolean(sample.ride),
    placed,
    blockPlace: arWalkBlocksPlace(kind, product),
    coach: arWalkCoach(kind, product, placed),
  };
}

export function arHoldWalk(args: {
  shown: ArWalkKind;
  raw: ArWalkKind;
  heldMs: number;
}): ArWalkKind {
  if (args.raw === args.shown) return args.shown;
  const up = arWalkRank(args.raw) > arWalkRank(args.shown);
  const need = up ? AR_WALK_HOLD_UP_MS : AR_WALK_HOLD_DOWN_MS;
  return args.heldMs >= need ? args.raw : args.shown;
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function arParseWalkEvent(
  data: ArWalkNative | null | undefined,
): ArWalkSample {
  return {
    live: Boolean(data?.live),
    speedMps: finiteOr(data?.speedMps, -1),
    stepHz: finiteOr(data?.stepHz, -1),
    walk: Boolean(data?.walk),
    ride: Boolean(data?.ride),
    sessionMs: finiteOr(data?.sessionMs, -1),
    placed: Boolean(data?.placed),
  };
}

export function arWalkRms(samples: number[]): number {
  if (!samples.length) return 0;
  let sum = 0;
  for (const n of samples) {
    const v = finiteOr(n, 0);
    sum += v * v;
  }
  return Math.sqrt(sum / samples.length);
}

/** DeviceMotion user-acceleration RMS + optional GPS speed. */
export function arParseWalkMotion(args: {
  live: boolean;
  rms: number;
  speedMps?: number;
  sessionMs?: number;
  placed?: boolean;
}): ArWalkSample {
  const rms = finiteOr(args.rms, 0);
  const speed = finiteOr(args.speedMps, -1);
  const walking = rms >= AR_WALK_RMS;
  return {
    live: Boolean(args.live),
    speedMps: speed,
    stepHz: -1,
    walk: walking && speed < AR_WALK_RIDE_MPS,
    ride: speed >= AR_WALK_RIDE_MPS,
    sessionMs: finiteOr(args.sessionMs, -1),
    placed: Boolean(args.placed),
  };
}

export function arApplyWalkClass(
  el: HTMLElement | null | undefined,
  kind: ArWalkKind,
): void {
  if (!el) return;
  el.classList.toggle("is-ar-walk", kind !== "ok");
  el.classList.toggle("is-ar-walk-stroll", kind === "walk");
  el.classList.toggle("is-ar-walk-ride", kind === "ride");
}

export function arClearWalkClass(el: HTMLElement | null | undefined): void {
  if (!el) return;
  el.classList.remove("is-ar-walk", "is-ar-walk-stroll", "is-ar-walk-ride");
}

export type ArWalkArmOpts = {
  product: ArWalkProduct;
  getNative?: () => Promise<ArWalkNative | null>;
  onChange?: (judge: ArWalkJudge) => void;
  pollMs?: number;
  root?: HTMLElement | null;
  placed?: boolean;
  useWeb?: boolean;
  getWebSample?: () => ArWalkSample | null;
};

export type ArWalkHandle = {
  dispose: () => void;
  snapshot: () => ArWalkJudge;
  pushNative: (data: ArWalkNative | null) => void;
  setPlaced: (placed: boolean) => void;
};

export function arArmWalk(opts: ArWalkArmOpts): ArWalkHandle {
  const product = opts.product;
  const pollMs = opts.pollMs ?? AR_WALK_POLL_MS;
  const root =
    opts.root ??
    (typeof document !== "undefined" ? document.documentElement : null);

  let disposed = false;
  let placed = Boolean(opts.placed);
  let sample: ArWalkSample = {
    live: false,
    speedMps: -1,
    stepHz: -1,
    placed,
  };
  let shown: ArWalkKind = "ok";
  let pending: ArWalkKind = "ok";
  let pendingSince = 0;
  let judge: ArWalkJudge = {
    kind: "ok",
    live: false,
    speedMps: -1,
    stepHz: -1,
    walk: false,
    ride: false,
    placed,
    blockPlace: false,
    coach: "",
  };
  let poll = 0;

  const nowMs = () =>
    typeof performance !== "undefined" ? performance.now() : Date.now();

  const publish = (now: number) => {
    const raw = arJudgeWalk(sample);
    if (raw !== pending) {
      pending = raw;
      pendingSince = now;
    }
    const next = arHoldWalk({
      shown,
      raw,
      heldMs: now - pendingSince,
    });
    const nextJudge = arWalkProfile({ ...sample, placed }, product);
    nextJudge.kind = next;
    nextJudge.blockPlace = arWalkBlocksPlace(next, product);
    nextJudge.coach = arWalkCoach(next, product, placed);
    if (
      next === shown &&
      nextJudge.coach === judge.coach &&
      nextJudge.placed === judge.placed &&
      nextJudge.blockPlace === judge.blockPlace
    ) {
      return;
    }
    shown = next;
    judge = nextJudge;
    arApplyWalkClass(root, shown);
    opts.onChange?.(judge);
  };

  const applyNative = (data: ArWalkNative | null | undefined) => {
    if (disposed || !data) return;
    const parsed = arParseWalkEvent(data);
    sample = { ...parsed, placed };
    publish(nowMs());
  };

  const pullWeb = () => {
    if (disposed || !opts.useWeb || !opts.getWebSample) return;
    const web = opts.getWebSample();
    if (!web || !web.live || sample.live) return;
    sample = { ...web, placed };
    publish(nowMs());
  };

  const pull = () => {
    if (disposed) return;
    if (opts.getNative) {
      void opts
        .getNative()
        .then((data) => {
          if (data) applyNative(data);
          else pullWeb();
        })
        .catch(() => pullWeb());
      return;
    }
    pullWeb();
  };

  pendingSince = nowMs();
  pull();
  if (typeof window !== "undefined") {
    poll = window.setInterval(pull, pollMs);
  }

  return {
    dispose() {
      disposed = true;
      if (poll && typeof window !== "undefined") {
        window.clearInterval(poll);
      }
      arClearWalkClass(root);
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
