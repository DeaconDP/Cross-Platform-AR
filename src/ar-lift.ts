export type ArLiftKind = "ok" | "stairs" | "lift";
export type ArLiftProduct = "place" | "scan" | "emily" | "cubes";

export type ArLiftSample = {
  live: boolean;
  /** |dP/dt| in Pa/s. -1 unknown. */
  paPerSec: number;
  /** |dH/dt| in m/s. -1 unknown. */
  mPerSec?: number;
  /** Time since the session started, ms. -1 unknown. */
  sessionMs?: number;
  placed?: boolean;
};

export type ArLiftNative = {
  live?: boolean;
  paPerSec?: number;
  mPerSec?: number;
  sessionMs?: number;
  kind?: string;
  blockPlace?: boolean;
  placed?: boolean;
  lift?: boolean;
};

export type ArLiftJudge = {
  kind: ArLiftKind;
  live: boolean;
  paPerSec: number;
  mPerSec: number;
  placed: boolean;
  blockPlace: boolean;
  coach: string;
};

/** Ignore the first barometer ticks after camera start. */
export const AR_LIFT_WARM_MS = 1200;
/** ~12 Pa per metre near sea level. */
export const AR_LIFT_PA_PER_M = 12;
/** ~0.2 m/s — walking a stair flight. */
export const AR_LIFT_STAIRS_PA_S = 2.4;
/** ~0.83 m/s — a passenger lift. */
export const AR_LIFT_LIFT_PA_S = 10;
export const AR_LIFT_HOLD_UP_MS = 400;
export const AR_LIFT_HOLD_DOWN_MS = 800;
export const AR_LIFT_POLL_MS = 250;

const RANK: Record<ArLiftKind, number> = {
  ok: 0,
  stairs: 1,
  lift: 2,
};

export function arLiftRank(kind: ArLiftKind): number {
  return RANK[kind] ?? 0;
}

export function arLiftBlocksPlace(
  kind: ArLiftKind,
  product: ArLiftProduct,
): boolean {
  return kind === "lift" && product !== "scan";
}

export function arLiftPaFromMps(mPerSec: number): number {
  const mps = finiteOr(mPerSec, -1);
  if (mps < 0) return -1;
  return mps * AR_LIFT_PA_PER_M;
}

export function arLiftMpsFromPa(paPerSec: number): number {
  const pa = finiteOr(paPerSec, -1);
  if (pa < 0) return -1;
  return pa / AR_LIFT_PA_PER_M;
}

/** Barometer samples are hPa. 1 hPa = 100 Pa. */
export function arLiftPaPerSecFromHpa(
  prevHpa: number,
  nextHpa: number,
  dtMs: number,
): number {
  const prev = finiteOr(prevHpa, -1);
  const next = finiteOr(nextHpa, -1);
  const dt = finiteOr(dtMs, -1);
  if (prev < 0 || next < 0 || dt < 40) return -1;
  return (Math.abs(next - prev) * 100 * 1000) / dt;
}

export function arLiftRatePa(sample: ArLiftSample): number {
  const fromPa = finiteOr(sample.paPerSec, -1);
  const fromM = arLiftPaFromMps(sample.mPerSec ?? -1);
  return Math.max(fromPa, fromM);
}

export function arJudgeLift(sample: ArLiftSample): ArLiftKind {
  if (!sample.live) return "ok";
  const sessionMs = sample.sessionMs ?? -1;
  if (sessionMs >= 0 && sessionMs < AR_LIFT_WARM_MS) return "ok";
  const rate = arLiftRatePa(sample);
  if (rate < 0) return "ok";
  if (rate >= AR_LIFT_LIFT_PA_S) return "lift";
  if (rate >= AR_LIFT_STAIRS_PA_S) return "stairs";
  return "ok";
}

export function arLiftCoach(
  kind: ArLiftKind,
  product: ArLiftProduct,
  placed = false,
): string {
  if (kind === "ok") return "";
  if (product === "scan") {
    if (kind === "lift") {
      return placed
        ? "Wait until the lift stops — the mark can slip."
        : "Wait until the lift stops so the printed mark can lock.";
    }
    return placed
      ? "Stay on this floor — stairs will drop the find."
      : "Stay on this floor so the printed mark can lock.";
  }
  if (product === "emily") {
    if (kind === "lift") {
      return placed
        ? "Wait until the lift stops — I start to slide."
        : "Wait until the lift stops. Then find the floor.";
    }
    return placed
      ? "Stay on this floor — stairs make me drift."
      : "Stay on this floor so I can see the rug.";
  }
  if (product === "cubes") {
    if (kind === "lift") {
      return placed
        ? "Wait until the lift stops — cubes will miss."
        : "Wait until the lift stops. Then find the table.";
    }
    return placed
      ? "Stay on this floor — stairs make cubes drift."
      : "Stay on this floor so the table can lock.";
  }
  if (kind === "lift") {
    return placed
      ? "Wait until the lift stops — the fossil will unlock."
      : "Wait until the lift stops. Then find a table.";
  }
  return placed
    ? "Stay on this floor — stairs will unlock the fossil."
    : "Stay on this floor so the table can lock.";
}

export function arLiftProfile(
  sample: ArLiftSample,
  product: ArLiftProduct,
): ArLiftJudge {
  const kind = arJudgeLift(sample);
  const placed = Boolean(sample.placed);
  const paPerSec = arLiftRatePa(sample);
  return {
    kind,
    live: sample.live,
    paPerSec,
    mPerSec: arLiftMpsFromPa(paPerSec),
    placed,
    blockPlace: arLiftBlocksPlace(kind, product),
    coach: arLiftCoach(kind, product, placed),
  };
}

export function arHoldLift(args: {
  shown: ArLiftKind;
  raw: ArLiftKind;
  heldMs: number;
}): ArLiftKind {
  if (args.raw === args.shown) return args.shown;
  const up = arLiftRank(args.raw) > arLiftRank(args.shown);
  const need = up ? AR_LIFT_HOLD_UP_MS : AR_LIFT_HOLD_DOWN_MS;
  return args.heldMs >= need ? args.raw : args.shown;
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function arParseLiftEvent(
  data: ArLiftNative | null | undefined,
): ArLiftSample {
  return {
    live: Boolean(data?.live),
    paPerSec: finiteOr(data?.paPerSec, -1),
    mPerSec: finiteOr(data?.mPerSec, -1),
    sessionMs: finiteOr(data?.sessionMs, -1),
    placed: Boolean(data?.placed),
  };
}

export function arParseLiftMotion(args: {
  live: boolean;
  paPerSec: number;
  mPerSec?: number;
  sessionMs?: number;
  placed?: boolean;
}): ArLiftSample {
  return {
    live: Boolean(args.live),
    paPerSec: finiteOr(args.paPerSec, -1),
    mPerSec: finiteOr(args.mPerSec, -1),
    sessionMs: finiteOr(args.sessionMs, -1),
    placed: Boolean(args.placed),
  };
}

export function arApplyLiftClass(
  el: HTMLElement | null | undefined,
  kind: ArLiftKind,
): void {
  if (!el) return;
  el.classList.toggle("is-ar-lift", kind !== "ok");
  el.classList.toggle("is-ar-lift-stairs", kind === "stairs");
  el.classList.toggle("is-ar-lift-cabin", kind === "lift");
}

export function arClearLiftClass(el: HTMLElement | null | undefined): void {
  if (!el) return;
  el.classList.remove("is-ar-lift", "is-ar-lift-stairs", "is-ar-lift-cabin");
}

export type ArLiftArmOpts = {
  product: ArLiftProduct;
  getNative?: () => Promise<ArLiftNative | null>;
  onChange?: (judge: ArLiftJudge) => void;
  pollMs?: number;
  root?: HTMLElement | null;
  placed?: boolean;
  useWeb?: boolean;
  getWebSample?: () => ArLiftSample | null;
};

export type ArLiftHandle = {
  dispose: () => void;
  snapshot: () => ArLiftJudge;
  pushNative: (data: ArLiftNative | null) => void;
  setPlaced: (placed: boolean) => void;
};

export function arArmLift(opts: ArLiftArmOpts): ArLiftHandle {
  const product = opts.product;
  const pollMs = opts.pollMs ?? AR_LIFT_POLL_MS;
  const root =
    opts.root ??
    (typeof document !== "undefined" ? document.documentElement : null);

  let disposed = false;
  let placed = Boolean(opts.placed);
  let sample: ArLiftSample = {
    live: false,
    paPerSec: -1,
    mPerSec: -1,
    placed,
  };
  let shown: ArLiftKind = "ok";
  let pending: ArLiftKind = "ok";
  let pendingSince = 0;
  let judge: ArLiftJudge = {
    kind: "ok",
    live: false,
    paPerSec: -1,
    mPerSec: -1,
    placed,
    blockPlace: false,
    coach: "",
  };
  let poll = 0;

  const nowMs = () =>
    typeof performance !== "undefined" ? performance.now() : Date.now();

  const publish = (now: number) => {
    const raw = arJudgeLift(sample);
    if (raw !== pending) {
      pending = raw;
      pendingSince = now;
    }
    const next = arHoldLift({
      shown,
      raw,
      heldMs: now - pendingSince,
    });
    const nextJudge = arLiftProfile({ ...sample, placed }, product);
    nextJudge.kind = next;
    nextJudge.blockPlace = arLiftBlocksPlace(next, product);
    nextJudge.coach = arLiftCoach(next, product, placed);
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
    arApplyLiftClass(root, shown);
    opts.onChange?.(judge);
  };

  const applyNative = (data: ArLiftNative | null | undefined) => {
    if (disposed || !data) return;
    const parsed = arParseLiftEvent(data);
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
      arClearLiftClass(root);
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
