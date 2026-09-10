export type ArMemKind = "ok" | "tight" | "critical";
export type ArMemProduct = "place" | "scan" | "emily" | "cubes";

export type ArMemSample = {
  live: boolean;
  /** Free RAM bytes. -1 unknown. */
  bytesAvail: number;
  /** Total RAM / heap limit. -1 unknown. */
  bytesTotal: number;
  /** 0–1 used ratio. -1 unknown. */
  usedRatio: number;
  /** OS trim / memory-warning. */
  warned?: boolean;
  placed?: boolean;
};

export type ArMemNative = {
  live?: boolean;
  bytesAvail?: number;
  bytesTotal?: number;
  usedRatio?: number;
  warned?: boolean;
  kind?: string;
  lowFx?: boolean;
  placed?: boolean;
};

export type ArMemJudge = {
  kind: ArMemKind;
  live: boolean;
  bytesAvail: number;
  bytesTotal: number;
  usedRatio: number;
  warned: boolean;
  placed: boolean;
  lowFx: boolean;
  coach: string;
};

export const AR_MEM_TIGHT_BYTES = 80 * 1024 * 1024;
export const AR_MEM_CRITICAL_BYTES = 32 * 1024 * 1024;
export const AR_MEM_TIGHT_RATIO = 0.85;
export const AR_MEM_CRITICAL_RATIO = 0.93;
export const AR_MEM_HOLD_UP_MS = 400;
export const AR_MEM_HOLD_DOWN_MS = 800;
export const AR_MEM_POLL_MS = 2000;

const RANK: Record<ArMemKind, number> = {
  ok: 0,
  tight: 1,
  critical: 2,
};

export function arMemRank(kind: ArMemKind): number {
  return RANK[kind] ?? 0;
}

export function arMemLowFx(kind: ArMemKind): boolean {
  return kind !== "ok";
}

export function arJudgeMem(sample: ArMemSample): ArMemKind {
  if (sample.warned) return "critical";
  if (sample.bytesAvail >= 0) {
    if (sample.bytesAvail < AR_MEM_CRITICAL_BYTES) return "critical";
    if (sample.bytesAvail < AR_MEM_TIGHT_BYTES) return "tight";
  }
  if (sample.usedRatio >= 0) {
    if (sample.usedRatio >= AR_MEM_CRITICAL_RATIO) return "critical";
    if (sample.usedRatio >= AR_MEM_TIGHT_RATIO) return "tight";
  }
  return "ok";
}

export function arMemCoach(
  kind: ArMemKind,
  product: ArMemProduct,
  placed = false,
): string {
  if (kind === "ok") return "";
  if (product === "scan") {
    if (kind === "critical") {
      return placed
        ? "Memory is nearly full — the find may vanish. Close other apps."
        : "Close other apps so the mark can stay loaded.";
    }
    return "This phone is low on memory — scanning a simpler view.";
  }
  if (product === "emily") {
    if (kind === "critical") {
      return placed
        ? "Memory is nearly full — I may vanish. Close other apps, then Place again."
        : "Close other apps so I can sit on the floor.";
    }
    return "I'm running on fumes — placing a simpler view.";
  }
  if (product === "cubes") {
    if (kind === "critical") {
      return placed
        ? "Memory is nearly full — extra cubes may not stay. Close other apps."
        : "Close other apps so cubes can stay loaded.";
    }
    return "This phone is low on memory — extra cubes may not stay.";
  }
  if (kind === "critical") {
    return placed
      ? "Memory is nearly full — the fossil may vanish. Close other apps."
      : "Close other apps so this fossil can stay loaded.";
  }
  return "This phone is low on memory — placing a simpler view.";
}

export function arMemProfile(
  sample: ArMemSample,
  product: ArMemProduct,
): ArMemJudge {
  const kind = arJudgeMem(sample);
  const placed = Boolean(sample.placed);
  return {
    kind,
    live: sample.live,
    bytesAvail: sample.bytesAvail,
    bytesTotal: sample.bytesTotal,
    usedRatio: sample.usedRatio,
    warned: Boolean(sample.warned),
    placed,
    lowFx: arMemLowFx(kind),
    coach: arMemCoach(kind, product, placed),
  };
}

export function arHoldMem(args: {
  shown: ArMemKind;
  raw: ArMemKind;
  heldMs: number;
}): ArMemKind {
  if (args.raw === args.shown) return args.shown;
  const up = arMemRank(args.raw) > arMemRank(args.shown);
  const need = up ? AR_MEM_HOLD_UP_MS : AR_MEM_HOLD_DOWN_MS;
  return args.heldMs >= need ? args.raw : args.shown;
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function arParseMemEvent(
  data: ArMemNative | null | undefined,
): ArMemSample {
  return {
    live: Boolean(data?.live),
    bytesAvail: finiteOr(data?.bytesAvail, -1),
    bytesTotal: finiteOr(data?.bytesTotal, -1),
    usedRatio: finiteOr(data?.usedRatio, -1),
    warned: Boolean(data?.warned),
    placed: Boolean(data?.placed),
  };
}

type PerfMem = {
  usedJSHeapSize?: number;
  jsHeapSizeLimit?: number;
};

export function arParseHeapEstimate(
  mem: PerfMem | null | undefined,
): ArMemSample {
  const used = mem?.usedJSHeapSize;
  const limit = mem?.jsHeapSizeLimit;
  if (
    typeof used !== "number" ||
    !Number.isFinite(used) ||
    typeof limit !== "number" ||
    !Number.isFinite(limit) ||
    limit <= 0
  ) {
    return { live: false, bytesAvail: -1, bytesTotal: -1, usedRatio: -1 };
  }
  return {
    live: true,
    bytesAvail: Math.max(0, limit - used),
    bytesTotal: limit,
    usedRatio: used / limit,
  };
}

export function arApplyMemClass(
  el: HTMLElement | null | undefined,
  kind: ArMemKind,
): void {
  if (!el) return;
  el.classList.toggle("is-ar-mem", kind !== "ok");
  el.classList.toggle("is-ar-mem-tight", kind === "tight");
  el.classList.toggle("is-ar-mem-critical", kind === "critical");
}

export function arClearMemClass(el: HTMLElement | null | undefined): void {
  if (!el) return;
  el.classList.remove("is-ar-mem", "is-ar-mem-tight", "is-ar-mem-critical");
}

export type ArMemArmOpts = {
  product: ArMemProduct;
  getNative?: () => Promise<ArMemNative | null>;
  onChange?: (judge: ArMemJudge) => void;
  pollMs?: number;
  root?: HTMLElement | null;
  placed?: boolean;
  useWeb?: boolean;
};

export type ArMemHandle = {
  dispose: () => void;
  snapshot: () => ArMemJudge;
  pushNative: (data: ArMemNative | null) => void;
  setPlaced: (placed: boolean) => void;
};

export function arArmMem(opts: ArMemArmOpts): ArMemHandle {
  const product = opts.product;
  const pollMs = opts.pollMs ?? AR_MEM_POLL_MS;
  const root =
    opts.root ??
    (typeof document !== "undefined" ? document.documentElement : null);

  let disposed = false;
  let placed = Boolean(opts.placed);
  let sample: ArMemSample = {
    live: false,
    bytesAvail: -1,
    bytesTotal: -1,
    usedRatio: -1,
    placed,
  };
  let shown: ArMemKind = "ok";
  let pending: ArMemKind = "ok";
  let pendingSince = 0;
  let judge: ArMemJudge = {
    kind: "ok",
    live: false,
    bytesAvail: -1,
    bytesTotal: -1,
    usedRatio: -1,
    warned: false,
    placed,
    lowFx: false,
    coach: "",
  };
  let poll = 0;

  const nowMs = () =>
    typeof performance !== "undefined" ? performance.now() : Date.now();

  const publish = (now: number) => {
    const raw = arJudgeMem(sample);
    if (raw !== pending) {
      pending = raw;
      pendingSince = now;
    }
    const next = arHoldMem({
      shown,
      raw,
      heldMs: now - pendingSince,
    });
    const nextJudge = arMemProfile({ ...sample, placed }, product);
    nextJudge.kind = next;
    nextJudge.lowFx = arMemLowFx(next);
    nextJudge.coach = arMemCoach(next, product, placed);
    if (
      next === shown &&
      nextJudge.coach === judge.coach &&
      nextJudge.placed === judge.placed &&
      nextJudge.lowFx === judge.lowFx
    ) {
      return;
    }
    shown = next;
    judge = nextJudge;
    arApplyMemClass(root, shown);
    opts.onChange?.(judge);
  };

  const applyNative = (data: ArMemNative | null | undefined) => {
    if (disposed || !data) return;
    const parsed = arParseMemEvent(data);
    sample = { ...parsed, placed };
    publish(nowMs());
  };

  const pullWeb = () => {
    if (disposed || !opts.useWeb) return;
    const perf =
      typeof performance !== "undefined"
        ? (performance as Performance & { memory?: PerfMem }).memory
        : undefined;
    const web = arParseHeapEstimate(perf);
    if (!web.live || sample.live) return;
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
      arClearMemClass(root);
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
