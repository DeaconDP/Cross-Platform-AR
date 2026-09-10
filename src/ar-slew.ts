export type ArSlewKind = "ok" | "sweep" | "spin";
export type ArSlewProduct = "place" | "scan" | "emily" | "cubes";

export type ArSlewSample = {
  live: boolean;
  /** Gyro magnitude, rad/s. -1 unknown. */
  radPerSec: number;
  /** Time since the session started, ms. -1 unknown. */
  sessionMs?: number;
  placed?: boolean;
};

export type ArSlewNative = {
  live?: boolean;
  radPerSec?: number;
  sessionMs?: number;
  kind?: string;
  blockPlace?: boolean;
  placed?: boolean;
  spin?: boolean;
};

export type ArSlewJudge = {
  kind: ArSlewKind;
  live: boolean;
  radPerSec: number;
  placed: boolean;
  blockPlace: boolean;
  coach: string;
};

/** Ignore the lift-to-camera flick. */
export const AR_SLEW_WARM_MS = 800;
/** ~77 deg/s — looking around a gallery. */
export const AR_SLEW_SWEEP_RAD = 1.35;
/** ~149 deg/s — a whip pan that breaks tracking. */
export const AR_SLEW_SPIN_RAD = 2.6;
export const AR_SLEW_HOLD_UP_MS = 400;
export const AR_SLEW_HOLD_DOWN_MS = 800;
export const AR_SLEW_POLL_MS = 200;

const RANK: Record<ArSlewKind, number> = {
  ok: 0,
  sweep: 1,
  spin: 2,
};

export function arSlewRank(kind: ArSlewKind): number {
  return RANK[kind] ?? 0;
}

export function arSlewBlocksPlace(
  kind: ArSlewKind,
  product: ArSlewProduct,
): boolean {
  return kind === "spin" && product !== "scan";
}

export function arJudgeSlew(sample: ArSlewSample): ArSlewKind {
  if (!sample.live) return "ok";
  const sessionMs = sample.sessionMs ?? -1;
  if (sessionMs >= 0 && sessionMs < AR_SLEW_WARM_MS) return "ok";
  if (sample.radPerSec >= AR_SLEW_SPIN_RAD) return "spin";
  if (sample.radPerSec >= AR_SLEW_SWEEP_RAD) return "sweep";
  return "ok";
}

export function arSlewCoach(
  kind: ArSlewKind,
  product: ArSlewProduct,
  placed = false,
): string {
  if (kind === "ok") return "";
  if (product === "scan") {
    if (kind === "spin") {
      return placed
        ? "Hold still — a fast pan will drop the find."
        : "Hold still so the printed mark can lock.";
    }
    return placed
      ? "Slow the sweep — the mark can slip."
      : "Slow the sweep so the printed mark can lock.";
  }
  if (product === "emily") {
    if (kind === "spin") {
      return placed
        ? "Hold still — a fast pan makes me slide."
        : "Hold still. A fast pan will miss the floor.";
    }
    return placed
      ? "Slow the sweep — I start to drift."
      : "Slow the sweep — I cannot see the floor yet.";
  }
  if (product === "cubes") {
    if (kind === "spin") {
      return placed
        ? "Hold still — a fast pan will miss the next cube."
        : "Hold still. A fast pan will miss the table.";
    }
    return placed
      ? "Slow the sweep — cubes start to drift."
      : "Slow the sweep so the table can lock.";
  }
  if (kind === "spin") {
    return placed
      ? "Hold still — a fast pan will unlock the fossil."
      : "Hold still. A fast pan will miss the table.";
  }
  return placed
    ? "Slow the sweep — the fossil starts to drift."
    : "Slow the sweep so the table can lock.";
}

export function arSlewProfile(
  sample: ArSlewSample,
  product: ArSlewProduct,
): ArSlewJudge {
  const kind = arJudgeSlew(sample);
  const placed = Boolean(sample.placed);
  return {
    kind,
    live: sample.live,
    radPerSec: sample.radPerSec,
    placed,
    blockPlace: arSlewBlocksPlace(kind, product),
    coach: arSlewCoach(kind, product, placed),
  };
}

export function arHoldSlew(args: {
  shown: ArSlewKind;
  raw: ArSlewKind;
  heldMs: number;
}): ArSlewKind {
  if (args.raw === args.shown) return args.shown;
  const up = arSlewRank(args.raw) > arSlewRank(args.shown);
  const need = up ? AR_SLEW_HOLD_UP_MS : AR_SLEW_HOLD_DOWN_MS;
  return args.heldMs >= need ? args.raw : args.shown;
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function arParseSlewEvent(
  data: ArSlewNative | null | undefined,
): ArSlewSample {
  return {
    live: Boolean(data?.live),
    radPerSec: finiteOr(data?.radPerSec, -1),
    sessionMs: finiteOr(data?.sessionMs, -1),
    placed: Boolean(data?.placed),
  };
}

/** DeviceMotion.rotationRate is degrees/s. Native gyro is rad/s. */
export function arSlewRadFromDegrees(degPerSec: number): number {
  const deg = finiteOr(degPerSec, -1);
  if (deg < 0) return -1;
  return (deg * Math.PI) / 180;
}

export function arSlewRadFromAxes(
  x: number,
  y: number,
  z: number,
  degrees = false,
): number {
  const mag = Math.hypot(finiteOr(x, 0), finiteOr(y, 0), finiteOr(z, 0));
  return degrees ? arSlewRadFromDegrees(mag) : mag;
}

export function arParseSlewMotion(args: {
  live: boolean;
  radPerSec: number;
  sessionMs?: number;
  placed?: boolean;
}): ArSlewSample {
  return {
    live: Boolean(args.live),
    radPerSec: finiteOr(args.radPerSec, -1),
    sessionMs: finiteOr(args.sessionMs, -1),
    placed: Boolean(args.placed),
  };
}

export function arApplySlewClass(
  el: HTMLElement | null | undefined,
  kind: ArSlewKind,
): void {
  if (!el) return;
  el.classList.toggle("is-ar-slew", kind !== "ok");
  el.classList.toggle("is-ar-slew-sweep", kind === "sweep");
  el.classList.toggle("is-ar-slew-spin", kind === "spin");
}

export function arClearSlewClass(el: HTMLElement | null | undefined): void {
  if (!el) return;
  el.classList.remove("is-ar-slew", "is-ar-slew-sweep", "is-ar-slew-spin");
}

export type ArSlewArmOpts = {
  product: ArSlewProduct;
  getNative?: () => Promise<ArSlewNative | null>;
  onChange?: (judge: ArSlewJudge) => void;
  pollMs?: number;
  root?: HTMLElement | null;
  placed?: boolean;
  useWeb?: boolean;
  getWebSample?: () => ArSlewSample | null;
};

export type ArSlewHandle = {
  dispose: () => void;
  snapshot: () => ArSlewJudge;
  pushNative: (data: ArSlewNative | null) => void;
  setPlaced: (placed: boolean) => void;
};

export function arArmSlew(opts: ArSlewArmOpts): ArSlewHandle {
  const product = opts.product;
  const pollMs = opts.pollMs ?? AR_SLEW_POLL_MS;
  const root =
    opts.root ??
    (typeof document !== "undefined" ? document.documentElement : null);

  let disposed = false;
  let placed = Boolean(opts.placed);
  let sample: ArSlewSample = {
    live: false,
    radPerSec: -1,
    placed,
  };
  let shown: ArSlewKind = "ok";
  let pending: ArSlewKind = "ok";
  let pendingSince = 0;
  let judge: ArSlewJudge = {
    kind: "ok",
    live: false,
    radPerSec: -1,
    placed,
    blockPlace: false,
    coach: "",
  };
  let poll = 0;

  const nowMs = () =>
    typeof performance !== "undefined" ? performance.now() : Date.now();

  const publish = (now: number) => {
    const raw = arJudgeSlew(sample);
    if (raw !== pending) {
      pending = raw;
      pendingSince = now;
    }
    const next = arHoldSlew({
      shown,
      raw,
      heldMs: now - pendingSince,
    });
    const nextJudge = arSlewProfile({ ...sample, placed }, product);
    nextJudge.kind = next;
    nextJudge.blockPlace = arSlewBlocksPlace(next, product);
    nextJudge.coach = arSlewCoach(next, product, placed);
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
    arApplySlewClass(root, shown);
    opts.onChange?.(judge);
  };

  const applyNative = (data: ArSlewNative | null | undefined) => {
    if (disposed || !data) return;
    const parsed = arParseSlewEvent(data);
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
      arClearSlewClass(root);
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
