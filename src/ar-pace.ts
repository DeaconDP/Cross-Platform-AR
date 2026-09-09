export type ArPaceLevel = "ok" | "slow" | "jank";
export type ArPaceProduct = "place" | "scan" | "emily" | "cubes";

export type ArPaceSample = {
  /** EMA frame interval in ms. -1 unknown. */
  dtMs: number;
};

export type ArPaceNative = {
  dtMs?: number;
  fps?: number;
  level?: string;
  lowFx?: boolean;
};

export type ArPaceJudge = {
  level: ArPaceLevel;
  lowFx: boolean;
  pixelRatio: number;
  antialias: boolean;
  enableFx: boolean;
  featurePoints: boolean;
  coach: string;
};

export const AR_PACE_SLOW_MS = 22;
export const AR_PACE_JANK_MS = 36;
export const AR_PACE_HOLD_UP_MS = 400;
export const AR_PACE_HOLD_DOWN_MS = 800;
export const AR_PACE_POLL_MS = 700;
/** Ignore tab-hide / debugger stalls so they cannot fake jank. */
export const AR_PACE_DT_MAX_MS = 250;

const RANK: Record<ArPaceLevel, number> = {
  ok: 0,
  slow: 1,
  jank: 2,
};

export function arPaceRank(level: ArPaceLevel): number {
  return RANK[level] ?? 0;
}

export function arEmaFrame(prev: number, dt: number): number {
  if (!(dt > 0) || dt >= AR_PACE_DT_MAX_MS) return prev;
  return prev < 0 ? dt : prev * 0.85 + dt * 0.15;
}

export function arJudgePace(sample: ArPaceSample): ArPaceLevel {
  if (sample.dtMs < 0) return "ok";
  if (sample.dtMs < AR_PACE_SLOW_MS) return "ok";
  if (sample.dtMs < AR_PACE_JANK_MS) return "slow";
  return "jank";
}

export function arPaceCoach(
  level: ArPaceLevel,
  product: ArPaceProduct,
): string {
  if (level === "ok") return "";
  if (level === "slow") {
    if (product === "emily") return "Keeping my camera light so I stay smooth.";
    if (product === "scan") {
      return "Simplifying the view so the plaque stays locked.";
    }
    if (product === "cubes") {
      return "Simplifying the view so cubes stay smooth.";
    }
    return "Simplifying the view so tracking stays smooth.";
  }
  if (product === "emily") {
    return "This phone is struggling — I dropped sparkles to keep Place up.";
  }
  if (product === "scan") {
    return "This phone is struggling — visuals eased so the marker stays locked.";
  }
  if (product === "cubes") {
    return "This phone is struggling — cubes stay simple so tracking stays up.";
  }
  return "This phone is struggling — visuals eased so tracking stays up.";
}

export function arPaceProfile(
  level: ArPaceLevel,
  product: ArPaceProduct,
): ArPaceJudge {
  const coach = arPaceCoach(level, product);
  if (level === "ok") {
    return {
      level,
      lowFx: false,
      pixelRatio: 2,
      antialias: true,
      enableFx: true,
      featurePoints: true,
      coach,
    };
  }
  if (level === "slow") {
    return {
      level,
      lowFx: true,
      pixelRatio: 1.25,
      antialias: false,
      enableFx: false,
      featurePoints: false,
      coach,
    };
  }
  return {
    level,
    lowFx: true,
    pixelRatio: 1,
    antialias: false,
    enableFx: false,
    featurePoints: false,
    coach,
  };
}

export function arHoldPace(args: {
  shown: ArPaceLevel;
  raw: ArPaceLevel;
  heldMs: number;
}): ArPaceLevel {
  if (args.raw === args.shown) return args.shown;
  const up = arPaceRank(args.raw) > arPaceRank(args.shown);
  const need = up ? AR_PACE_HOLD_UP_MS : AR_PACE_HOLD_DOWN_MS;
  return args.heldMs >= need ? args.raw : args.shown;
}

export function arParsePaceEvent(
  data: ArPaceNative | null | undefined,
): ArPaceSample {
  const dtMs =
    typeof data?.dtMs === "number" && Number.isFinite(data.dtMs)
      ? data.dtMs
      : typeof data?.fps === "number" && data.fps > 0
        ? 1000 / data.fps
        : -1;
  return { dtMs };
}

export function arApplyPaceClass(
  el: HTMLElement | null | undefined,
  level: ArPaceLevel,
): void {
  if (!el) return;
  el.classList.toggle("is-ar-pace", level !== "ok");
  el.classList.toggle("is-ar-pace-slow", level === "slow");
  el.classList.toggle("is-ar-pace-jank", level === "jank");
}

export function arClearPaceClass(el: HTMLElement | null | undefined): void {
  if (!el) return;
  el.classList.remove("is-ar-pace", "is-ar-pace-slow", "is-ar-pace-jank");
}

export type ArPaceArmOpts = {
  product: ArPaceProduct;
  getNative?: () => Promise<ArPaceNative | null>;
  onChange?: (judge: ArPaceJudge) => void;
  pollMs?: number;
  root?: HTMLElement | null;
};

export type ArPaceHandle = {
  dispose: () => void;
  snapshot: () => ArPaceJudge;
  pushNative: (data: ArPaceNative | null) => void;
};

export function arArmPace(opts: ArPaceArmOpts): ArPaceHandle {
  const product = opts.product;
  const pollMs = opts.pollMs ?? AR_PACE_POLL_MS;
  const root =
    opts.root ??
    (typeof document !== "undefined" ? document.documentElement : null);

  let disposed = false;
  let nativeDt = -1;
  let frameDt = -1;
  let ema = -1;
  let lastTs = 0;
  let shown: ArPaceLevel = "ok";
  let pending: ArPaceLevel = "ok";
  let pendingSince = 0;
  let judge = arPaceProfile("ok", product);
  let raf = 0;
  let poll = 0;

  const nowMs = () =>
    typeof performance !== "undefined" ? performance.now() : Date.now();

  const publish = (now: number) => {
    const dtMs = nativeDt >= 0 ? nativeDt : frameDt;
    const raw = arJudgePace({ dtMs });
    if (raw !== pending) {
      pending = raw;
      pendingSince = now;
    }
    const next = arHoldPace({
      shown,
      raw,
      heldMs: now - pendingSince,
    });
    if (next === shown && next === judge.level) return;
    shown = next;
    judge = arPaceProfile(shown, product);
    arApplyPaceClass(root, shown);
    opts.onChange?.(judge);
  };

  const onFrame = (ts: number) => {
    if (disposed) return;
    if (lastTs > 0) {
      ema = arEmaFrame(ema, ts - lastTs);
      frameDt = ema;
    }
    lastTs = ts;
    publish(ts);
    if (typeof requestAnimationFrame === "function") {
      raf = requestAnimationFrame(onFrame);
    }
  };

  const pull = () => {
    if (disposed || !opts.getNative) return;
    void opts
      .getNative()
      .then((data) => {
        if (disposed || !data) return;
        nativeDt = arParsePaceEvent(data).dtMs;
        publish(nowMs());
      })
      .catch(() => undefined);
  };

  if (typeof requestAnimationFrame === "function") {
    raf = requestAnimationFrame(onFrame);
  }
  pull();
  if (typeof window !== "undefined") {
    poll = window.setInterval(pull, pollMs);
  }

  return {
    dispose() {
      disposed = true;
      if (raf && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(raf);
      }
      if (poll && typeof window !== "undefined") {
        window.clearInterval(poll);
      }
      arClearPaceClass(root);
    },
    snapshot: () => judge,
    pushNative(data) {
      if (disposed || !data) return;
      nativeDt = arParsePaceEvent(data).dtMs;
      publish(nowMs());
    },
  };
}
