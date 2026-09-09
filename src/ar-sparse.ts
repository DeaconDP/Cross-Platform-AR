export type ArSparseLevel = "ok" | "thin" | "blank";
export type ArSparseProduct = "place" | "scan" | "emily" | "cubes";

export type ArSparseSample = {
  /** Feature-point count. -1 unknown. */
  points: number;
  planes: number;
  placed?: boolean;
};

export type ArSparseNative = {
  points?: number;
  planes?: number;
  level?: string;
  placed?: boolean;
};

export type ArSparseJudge = {
  level: ArSparseLevel;
  points: number;
  planes: number;
  placed: boolean;
  coach: string;
};

export const AR_SPARSE_THIN_POINTS = 40;
export const AR_SPARSE_BLANK_POINTS = 12;
export const AR_SPARSE_HOLD_UP_MS = 600;
export const AR_SPARSE_HOLD_DOWN_MS = 800;
export const AR_SPARSE_POLL_MS = 700;

const RANK: Record<ArSparseLevel, number> = {
  ok: 0,
  thin: 1,
  blank: 2,
};

export function arSparseRank(level: ArSparseLevel): number {
  return RANK[level] ?? 0;
}

export function arJudgeSparse(sample: ArSparseSample): ArSparseLevel {
  if (!(sample.points >= 0)) return "ok";
  if (sample.points < AR_SPARSE_BLANK_POINTS) return "blank";
  if (sample.points < AR_SPARSE_THIN_POINTS) return "thin";
  return "ok";
}

export function arSparseCoach(
  level: ArSparseLevel,
  product: ArSparseProduct,
  placed = false,
): string {
  if (level === "ok") return "";
  if (product === "scan") {
    return level === "blank"
      ? "This wall is too plain — hold on the printed Origins mark."
      : "Keep the printed mark filling the view.";
  }
  if (product === "emily") {
    if (placed) {
      return level === "blank"
        ? "I may drift — point at a more textured floor."
        : "Tracking is thin — find more texture so I stay put.";
    }
    return level === "blank"
      ? "This floor is too plain — point at wood, tiles, or a rug."
      : "Slowly sweep across a textured floor or rug.";
  }
  if (product === "cubes") {
    if (placed) {
      return level === "blank"
        ? "Cubes may drift — find wood grain or tiles."
        : "Tracking is thin — find more texture so cubes stay locked.";
    }
    return level === "blank"
      ? "This surface is too plain — point at wood grain, tiles, or a book."
      : "Slowly sweep across a textured table.";
  }
  if (placed) {
    return level === "blank"
      ? "Tracking is weak — find wood grain or tiles so it stays locked."
      : "Tracking is thin — find more texture so the fossil stays locked.";
  }
  return level === "blank"
    ? "This surface is too plain — point at wood grain, tiles, or a book."
    : "Slowly sweep across a textured table.";
}

export function arSparseProfile(
  sample: ArSparseSample,
  product: ArSparseProduct,
): ArSparseJudge {
  const level = arJudgeSparse(sample);
  const placed = Boolean(sample.placed);
  return {
    level,
    points: sample.points,
    planes: sample.planes,
    placed,
    coach: arSparseCoach(level, product, placed),
  };
}

export function arHoldSparse(args: {
  shown: ArSparseLevel;
  raw: ArSparseLevel;
  heldMs: number;
}): ArSparseLevel {
  if (args.raw === args.shown) return args.shown;
  const up = arSparseRank(args.raw) > arSparseRank(args.shown);
  const need = up ? AR_SPARSE_HOLD_UP_MS : AR_SPARSE_HOLD_DOWN_MS;
  return args.heldMs >= need ? args.raw : args.shown;
}

export function arParseSparseEvent(
  data: ArSparseNative | null | undefined,
): ArSparseSample {
  const points =
    typeof data?.points === "number" && Number.isFinite(data.points)
      ? data.points
      : -1;
  const planes =
    typeof data?.planes === "number" && Number.isFinite(data.planes)
      ? data.planes
      : 0;
  return {
    points,
    planes,
    placed: Boolean(data?.placed),
  };
}

export function arApplySparseClass(
  el: HTMLElement | null | undefined,
  level: ArSparseLevel,
): void {
  if (!el) return;
  el.classList.toggle("is-ar-sparse", level !== "ok");
  el.classList.toggle("is-ar-sparse-thin", level === "thin");
  el.classList.toggle("is-ar-sparse-blank", level === "blank");
}

export function arClearSparseClass(el: HTMLElement | null | undefined): void {
  if (!el) return;
  el.classList.remove(
    "is-ar-sparse",
    "is-ar-sparse-thin",
    "is-ar-sparse-blank",
  );
}

export type ArSparseArmOpts = {
  product: ArSparseProduct;
  getNative?: () => Promise<ArSparseNative | null>;
  onChange?: (judge: ArSparseJudge) => void;
  pollMs?: number;
  root?: HTMLElement | null;
  placed?: boolean;
};

export type ArSparseHandle = {
  dispose: () => void;
  snapshot: () => ArSparseJudge;
  pushNative: (data: ArSparseNative | null) => void;
  setPlaced: (placed: boolean) => void;
};

export function arArmSparse(opts: ArSparseArmOpts): ArSparseHandle {
  const product = opts.product;
  const pollMs = opts.pollMs ?? AR_SPARSE_POLL_MS;
  const root =
    opts.root ??
    (typeof document !== "undefined" ? document.documentElement : null);

  let disposed = false;
  let placed = Boolean(opts.placed);
  let sample: ArSparseSample = { points: -1, planes: 0, placed };
  let shown: ArSparseLevel = "ok";
  let pending: ArSparseLevel = "ok";
  let pendingSince = 0;
  let judge: ArSparseJudge = {
    level: "ok",
    points: -1,
    planes: 0,
    placed,
    coach: "",
  };
  let poll = 0;

  const nowMs = () =>
    typeof performance !== "undefined" ? performance.now() : Date.now();

  const publish = (now: number) => {
    const raw = arJudgeSparse(sample);
    if (raw !== pending) {
      pending = raw;
      pendingSince = now;
    }
    const next = arHoldSparse({
      shown,
      raw,
      heldMs: now - pendingSince,
    });
    const nextJudge = {
      level: next,
      points: sample.points,
      planes: sample.planes,
      placed,
      coach: arSparseCoach(next, product, placed),
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
    arApplySparseClass(root, shown);
    opts.onChange?.(judge);
  };

  const applyNative = (data: ArSparseNative | null | undefined) => {
    if (disposed || !data) return;
    const parsed = arParseSparseEvent(data);
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
      arClearSparseClass(root);
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
