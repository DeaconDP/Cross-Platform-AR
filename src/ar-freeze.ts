export type ArFreezeKind = "ok" | "stale" | "frozen";
export type ArFreezeProduct = "place" | "scan" | "emily" | "cubes";

export type ArFreezeSample = {
  live: boolean;
  /** Age of the last unique camera frame, ms. -1 unknown. */
  ageMs: number;
  /** Time since the session started, ms. -1 unknown. */
  sessionMs: number;
  /** Same camera timestamp while updates still fire. */
  stuck?: boolean;
  placed?: boolean;
};

export type ArFreezeNative = {
  live?: boolean;
  ageMs?: number;
  sessionMs?: number;
  stuck?: boolean;
  kind?: string;
  blockPlace?: boolean;
  placed?: boolean;
};

export type ArFreezeJudge = {
  kind: ArFreezeKind;
  live: boolean;
  ageMs: number;
  sessionMs: number;
  stuck: boolean;
  placed: boolean;
  blockPlace: boolean;
  coach: string;
};

/** Ignore hitch/freeze until the camera has had time to wake. */
export const AR_FREEZE_WARM_MS = 2000;
/** Frame age that is a hitch, not a dead camera. */
export const AR_FREEZE_STALE_MS = 400;
/** Frame age (or stuck hold) that means the preview is frozen. */
export const AR_FREEZE_FROZEN_MS = 1200;
export const AR_FREEZE_HOLD_UP_MS = 400;
export const AR_FREEZE_HOLD_DOWN_MS = 800;
export const AR_FREEZE_POLL_MS = 250;

const RANK: Record<ArFreezeKind, number> = {
  ok: 0,
  stale: 1,
  frozen: 2,
};

export function arFreezeRank(kind: ArFreezeKind): number {
  return RANK[kind] ?? 0;
}

export function arFreezeBlocksPlace(
  kind: ArFreezeKind,
  product: ArFreezeProduct,
): boolean {
  return kind === "frozen" && product !== "scan";
}

export function arJudgeFreeze(sample: ArFreezeSample): ArFreezeKind {
  if (!sample.live) return "ok";
  if (sample.sessionMs >= 0 && sample.sessionMs < AR_FREEZE_WARM_MS) {
    return "ok";
  }
  if (sample.stuck) return "frozen";
  if (sample.ageMs < 0) return "ok";
  if (sample.ageMs >= AR_FREEZE_FROZEN_MS) return "frozen";
  if (sample.ageMs >= AR_FREEZE_STALE_MS) return "stale";
  return "ok";
}

export function arFreezeCoach(
  kind: ArFreezeKind,
  product: ArFreezeProduct,
  placed = false,
): string {
  if (kind === "ok") return "";
  if (product === "scan") {
    if (kind === "frozen") {
      return placed
        ? "The camera froze — the find may vanish. Close and try again."
        : "The camera froze. Close and point at the mark again.";
    }
    return "Camera hitch — keep the mark in view.";
  }
  if (product === "emily") {
    if (kind === "frozen") {
      return placed
        ? "The camera froze — I may drift. Close Place and try again."
        : "The camera froze. Close Place and try again.";
    }
    return "Camera hitch — hold still a moment.";
  }
  if (product === "cubes") {
    if (kind === "frozen") {
      return placed
        ? "The camera froze — extra cubes may miss. Exit and try again."
        : "The camera froze. Exit and try again.";
    }
    return "Camera hitch — hold still a moment.";
  }
  if (kind === "frozen") {
    return placed
      ? "The camera froze — the fossil may drift. Close and try again."
      : "The camera froze. Close and try again.";
  }
  return "Camera hitch — hold still a moment.";
}

export function arFreezeProfile(
  sample: ArFreezeSample,
  product: ArFreezeProduct,
): ArFreezeJudge {
  const kind = arJudgeFreeze(sample);
  const placed = Boolean(sample.placed);
  return {
    kind,
    live: sample.live,
    ageMs: sample.ageMs,
    sessionMs: sample.sessionMs,
    stuck: Boolean(sample.stuck),
    placed,
    blockPlace: arFreezeBlocksPlace(kind, product),
    coach: arFreezeCoach(kind, product, placed),
  };
}

export function arHoldFreeze(args: {
  shown: ArFreezeKind;
  raw: ArFreezeKind;
  heldMs: number;
}): ArFreezeKind {
  if (args.raw === args.shown) return args.shown;
  const up = arFreezeRank(args.raw) > arFreezeRank(args.shown);
  const need = up ? AR_FREEZE_HOLD_UP_MS : AR_FREEZE_HOLD_DOWN_MS;
  return args.heldMs >= need ? args.raw : args.shown;
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function arParseFreezeEvent(
  data: ArFreezeNative | null | undefined,
): ArFreezeSample {
  return {
    live: Boolean(data?.live),
    ageMs: finiteOr(data?.ageMs, -1),
    sessionMs: finiteOr(data?.sessionMs, -1),
    stuck: Boolean(data?.stuck),
    placed: Boolean(data?.placed),
  };
}

export type ArVideoClockStamp = {
  time: number;
  atMs: number;
};

/** Web camera-plane / <video>: currentTime that stops advancing is a freeze. */
export function arParseVideoClock(args: {
  live: boolean;
  currentTime: number;
  prev: ArVideoClockStamp | null;
  nowMs: number;
  sessionStartMs: number;
}): { sample: ArFreezeSample; stamp: ArVideoClockStamp } {
  const time = finiteOr(args.currentTime, -1);
  const stamp: ArVideoClockStamp = {
    time: time < 0 ? 0 : time,
    atMs: args.nowMs,
  };
  if (!args.live || time < 0) {
    return {
      sample: {
        live: false,
        ageMs: -1,
        sessionMs: -1,
      },
      stamp: args.prev ?? stamp,
    };
  }
  const moved =
    args.prev == null || Math.abs(time - args.prev.time) > 0.0005;
  const uniqueAt = moved ? args.nowMs : args.prev!.atMs;
  stamp.atMs = uniqueAt;
  return {
    sample: {
      live: true,
      ageMs: args.nowMs - uniqueAt,
      sessionMs: args.nowMs - args.sessionStartMs,
      stuck: !moved && args.nowMs - uniqueAt >= AR_FREEZE_FROZEN_MS,
    },
    stamp,
  };
}

/** WebXR / rAF: predictedDisplayTime or frame id that stops changing. */
export function arParseXrClock(args: {
  live: boolean;
  frameTime: number;
  prev: ArVideoClockStamp | null;
  nowMs: number;
  sessionStartMs: number;
}): { sample: ArFreezeSample; stamp: ArVideoClockStamp } {
  return arParseVideoClock({
    live: args.live,
    currentTime: args.frameTime,
    prev: args.prev,
    nowMs: args.nowMs,
    sessionStartMs: args.sessionStartMs,
  });
}

export function arApplyFreezeClass(
  el: HTMLElement | null | undefined,
  kind: ArFreezeKind,
): void {
  if (!el) return;
  el.classList.toggle("is-ar-freeze", kind !== "ok");
  el.classList.toggle("is-ar-freeze-stale", kind === "stale");
  el.classList.toggle("is-ar-freeze-frozen", kind === "frozen");
}

export function arClearFreezeClass(el: HTMLElement | null | undefined): void {
  if (!el) return;
  el.classList.remove(
    "is-ar-freeze",
    "is-ar-freeze-stale",
    "is-ar-freeze-frozen",
  );
}

export type ArFreezeArmOpts = {
  product: ArFreezeProduct;
  getNative?: () => Promise<ArFreezeNative | null>;
  onChange?: (judge: ArFreezeJudge) => void;
  pollMs?: number;
  root?: HTMLElement | null;
  placed?: boolean;
  useWeb?: boolean;
  getWebSample?: () => ArFreezeSample | null;
};

export type ArFreezeHandle = {
  dispose: () => void;
  snapshot: () => ArFreezeJudge;
  pushNative: (data: ArFreezeNative | null) => void;
  setPlaced: (placed: boolean) => void;
};

export function arArmFreeze(opts: ArFreezeArmOpts): ArFreezeHandle {
  const product = opts.product;
  const pollMs = opts.pollMs ?? AR_FREEZE_POLL_MS;
  const root =
    opts.root ??
    (typeof document !== "undefined" ? document.documentElement : null);

  let disposed = false;
  let placed = Boolean(opts.placed);
  let sample: ArFreezeSample = {
    live: false,
    ageMs: -1,
    sessionMs: -1,
    placed,
  };
  let shown: ArFreezeKind = "ok";
  let pending: ArFreezeKind = "ok";
  let pendingSince = 0;
  let judge: ArFreezeJudge = {
    kind: "ok",
    live: false,
    ageMs: -1,
    sessionMs: -1,
    stuck: false,
    placed,
    blockPlace: false,
    coach: "",
  };
  let poll = 0;

  const nowMs = () =>
    typeof performance !== "undefined" ? performance.now() : Date.now();

  const publish = (now: number) => {
    const raw = arJudgeFreeze(sample);
    if (raw !== pending) {
      pending = raw;
      pendingSince = now;
    }
    const next = arHoldFreeze({
      shown,
      raw,
      heldMs: now - pendingSince,
    });
    const nextJudge = arFreezeProfile({ ...sample, placed }, product);
    nextJudge.kind = next;
    nextJudge.blockPlace = arFreezeBlocksPlace(next, product);
    nextJudge.coach = arFreezeCoach(next, product, placed);
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
    arApplyFreezeClass(root, shown);
    opts.onChange?.(judge);
  };

  const applyNative = (data: ArFreezeNative | null | undefined) => {
    if (disposed || !data) return;
    const parsed = arParseFreezeEvent(data);
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
      arClearFreezeClass(root);
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
