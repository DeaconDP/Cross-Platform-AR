export type ArDiskKind = "ok" | "low" | "critical";
export type ArDiskProduct = "place" | "scan" | "emily" | "cubes";

export type ArDiskSample = {
  live: boolean;
  /** Free bytes. -1 unknown. */
  bytesAvail: number;
  /** Volume / quota bytes. -1 unknown. */
  bytesTotal: number;
  /** Expected GLB size. 0 unknown. */
  modelBytes?: number;
  placed?: boolean;
};

export type ArDiskNative = {
  live?: boolean;
  bytesAvail?: number;
  bytesTotal?: number;
  modelBytes?: number;
  kind?: string;
  skipCache?: boolean;
  placed?: boolean;
};

export type ArDiskJudge = {
  kind: ArDiskKind;
  live: boolean;
  bytesAvail: number;
  bytesTotal: number;
  modelBytes: number;
  placed: boolean;
  skipCache: boolean;
  coach: string;
};

export const AR_DISK_LOW_BYTES = 200 * 1024 * 1024;
export const AR_DISK_CRITICAL_BYTES = 32 * 1024 * 1024;
export const AR_DISK_HEADROOM_BYTES = 8 * 1024 * 1024;
export const AR_DISK_LOW_RATIO = 0.05;
export const AR_DISK_HOLD_UP_MS = 400;
export const AR_DISK_HOLD_DOWN_MS = 800;
export const AR_DISK_POLL_MS = 2000;

const RANK: Record<ArDiskKind, number> = {
  ok: 0,
  low: 1,
  critical: 2,
};

export function arDiskRank(kind: ArDiskKind): number {
  return RANK[kind] ?? 0;
}

export function arDiskNeedBytes(modelBytes = 0): number {
  const model = Number.isFinite(modelBytes) && modelBytes > 0 ? modelBytes : 0;
  return Math.max(AR_DISK_CRITICAL_BYTES, model + AR_DISK_HEADROOM_BYTES);
}

export function arDiskSkipCache(kind: ArDiskKind): boolean {
  return kind === "critical";
}

export function arJudgeDisk(sample: ArDiskSample): ArDiskKind {
  if (!(sample.bytesAvail >= 0)) return "ok";
  if (sample.bytesAvail < arDiskNeedBytes(sample.modelBytes)) return "critical";
  if (sample.bytesAvail < AR_DISK_LOW_BYTES) return "low";
  const total = sample.bytesTotal;
  if (total > 0 && sample.bytesAvail / total < AR_DISK_LOW_RATIO) return "low";
  return "ok";
}

export function arDiskCoach(
  kind: ArDiskKind,
  product: ArDiskProduct,
  placed = false,
): string {
  if (kind === "ok") return "";
  if (product === "scan") {
    if (kind === "critical") {
      return placed
        ? "Storage is full — the find may not stay loaded. Free space, then scan again."
        : "Free some storage so the mark can load.";
    }
    return "Storage is getting full. You can still scan — free space if the model fails to load.";
  }
  if (product === "emily") {
    if (kind === "critical") {
      return placed
        ? "Storage is full — I may vanish. Free space, then Place again."
        : "Free some storage so I can sit on the floor.";
    }
    return "Storage is getting full. You can still Place — free space if I fail to load.";
  }
  if (product === "cubes") {
    if (kind === "critical") {
      return placed
        ? "Storage is full — cubes may not stay. Free space, then try again."
        : "Free some storage so cubes can load.";
    }
    return "Storage is getting full. You can still place — free space if a cube fails.";
  }
  if (kind === "critical") {
    return placed
      ? "Storage is full — the fossil may not stay loaded. Free space, then try again."
      : "Free some storage so this fossil can load.";
  }
  return "Storage is getting full. You can still place — free space if the fossil fails to load.";
}

export function arDiskProfile(
  sample: ArDiskSample,
  product: ArDiskProduct,
): ArDiskJudge {
  const kind = arJudgeDisk(sample);
  const placed = Boolean(sample.placed);
  const modelBytes =
    typeof sample.modelBytes === "number" && Number.isFinite(sample.modelBytes)
      ? sample.modelBytes
      : 0;
  return {
    kind,
    live: sample.live,
    bytesAvail: sample.bytesAvail,
    bytesTotal: sample.bytesTotal,
    modelBytes,
    placed,
    skipCache: arDiskSkipCache(kind),
    coach: arDiskCoach(kind, product, placed),
  };
}

export function arHoldDisk(args: {
  shown: ArDiskKind;
  raw: ArDiskKind;
  heldMs: number;
}): ArDiskKind {
  if (args.raw === args.shown) return args.shown;
  const up = arDiskRank(args.raw) > arDiskRank(args.shown);
  const need = up ? AR_DISK_HOLD_UP_MS : AR_DISK_HOLD_DOWN_MS;
  return args.heldMs >= need ? args.raw : args.shown;
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function arParseDiskEvent(
  data: ArDiskNative | null | undefined,
): ArDiskSample {
  return {
    live: Boolean(data?.live),
    bytesAvail: finiteOr(data?.bytesAvail, -1),
    bytesTotal: finiteOr(data?.bytesTotal, -1),
    modelBytes: finiteOr(data?.modelBytes, 0),
    placed: Boolean(data?.placed),
  };
}

export function arParseStorageEstimate(
  est: { quota?: number; usage?: number } | null | undefined,
): ArDiskSample {
  const quota = est?.quota;
  if (typeof quota !== "number" || !Number.isFinite(quota) || quota <= 0) {
    return { live: false, bytesAvail: -1, bytesTotal: -1 };
  }
  const usage =
    typeof est?.usage === "number" && Number.isFinite(est.usage) ? est.usage : 0;
  return {
    live: true,
    bytesAvail: Math.max(0, quota - usage),
    bytesTotal: quota,
  };
}

export function arApplyDiskClass(
  el: HTMLElement | null | undefined,
  kind: ArDiskKind,
): void {
  if (!el) return;
  el.classList.toggle("is-ar-disk", kind !== "ok");
  el.classList.toggle("is-ar-disk-low", kind === "low");
  el.classList.toggle("is-ar-disk-critical", kind === "critical");
}

export function arClearDiskClass(el: HTMLElement | null | undefined): void {
  if (!el) return;
  el.classList.remove("is-ar-disk", "is-ar-disk-low", "is-ar-disk-critical");
}

export type ArDiskArmOpts = {
  product: ArDiskProduct;
  getNative?: () => Promise<ArDiskNative | null>;
  onChange?: (judge: ArDiskJudge) => void;
  pollMs?: number;
  root?: HTMLElement | null;
  placed?: boolean;
  modelBytes?: number;
  useWeb?: boolean;
};

export type ArDiskHandle = {
  dispose: () => void;
  snapshot: () => ArDiskJudge;
  pushNative: (data: ArDiskNative | null) => void;
  setPlaced: (placed: boolean) => void;
  setModelBytes: (bytes: number) => void;
};

export function arArmDisk(opts: ArDiskArmOpts): ArDiskHandle {
  const product = opts.product;
  const pollMs = opts.pollMs ?? AR_DISK_POLL_MS;
  const root =
    opts.root ??
    (typeof document !== "undefined" ? document.documentElement : null);

  let disposed = false;
  let placed = Boolean(opts.placed);
  let modelBytes =
    typeof opts.modelBytes === "number" && Number.isFinite(opts.modelBytes)
      ? opts.modelBytes
      : 0;
  let sample: ArDiskSample = {
    live: false,
    bytesAvail: -1,
    bytesTotal: -1,
    modelBytes,
    placed,
  };
  let shown: ArDiskKind = "ok";
  let pending: ArDiskKind = "ok";
  let pendingSince = 0;
  let judge: ArDiskJudge = {
    kind: "ok",
    live: false,
    bytesAvail: -1,
    bytesTotal: -1,
    modelBytes,
    placed,
    skipCache: false,
    coach: "",
  };
  let poll = 0;

  const nowMs = () =>
    typeof performance !== "undefined" ? performance.now() : Date.now();

  const publish = (now: number) => {
    const raw = arJudgeDisk(sample);
    if (raw !== pending) {
      pending = raw;
      pendingSince = now;
    }
    const next = arHoldDisk({
      shown,
      raw,
      heldMs: now - pendingSince,
    });
    const nextJudge = {
      kind: next,
      live: sample.live,
      bytesAvail: sample.bytesAvail,
      bytesTotal: sample.bytesTotal,
      modelBytes,
      placed,
      skipCache: arDiskSkipCache(next),
      coach: arDiskCoach(next, product, placed),
    };
    if (
      next === shown &&
      nextJudge.coach === judge.coach &&
      nextJudge.placed === judge.placed &&
      nextJudge.skipCache === judge.skipCache
    ) {
      return;
    }
    shown = next;
    judge = nextJudge;
    arApplyDiskClass(root, shown);
    opts.onChange?.(judge);
  };

  const applyNative = (data: ArDiskNative | null | undefined) => {
    if (disposed || !data) return;
    const parsed = arParseDiskEvent(data);
    sample = { ...parsed, placed, modelBytes };
    publish(nowMs());
  };

  const pullWeb = () => {
    if (disposed || !opts.useWeb) return;
    const storage =
      typeof navigator !== "undefined" ? navigator.storage : undefined;
    if (!storage?.estimate) return;
    void storage
      .estimate()
      .then((est) => {
        if (disposed || sample.live) return;
        const web = arParseStorageEstimate(est);
        if (!web.live) return;
        sample = { ...web, placed, modelBytes };
        publish(nowMs());
      })
      .catch(() => undefined);
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
      arClearDiskClass(root);
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
    setModelBytes(bytes) {
      if (disposed) return;
      const next = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
      if (next === modelBytes) return;
      modelBytes = next;
      sample = { ...sample, modelBytes };
      publish(nowMs());
    },
  };
}
