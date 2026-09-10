/** Low Data / constrained-path steward — prefer onboard copies, never block place. */

export type ArSaveKind = "ok" | "meter" | "save";
export type ArSaveProduct = "place" | "scan" | "emily" | "cubes";

export const AR_SAVE_HOLD_MS = 400;
export const AR_SAVE_RELEASE_MS = 800;

export type ArSaveHold = {
  kind: ArSaveKind;
  raw: ArSaveKind;
  since: number;
};

export type ArSaveState = {
  kind: ArSaveKind;
  save: boolean;
  meter: boolean;
  valid: boolean;
};

type NetworkInformationLike = {
  saveData?: boolean;
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
};

export function arSaveKindFromFlags(flags: {
  save: boolean;
  meter: boolean;
}): ArSaveKind {
  if (flags.save) return "save";
  if (flags.meter) return "meter";
  return "ok";
}

function connection(): NetworkInformationLike | null {
  if (typeof navigator === "undefined") return null;
  const nav = navigator as Navigator & { connection?: NetworkInformationLike };
  return nav.connection ?? null;
}

export function arSaveReadWeb(): {
  save: boolean;
  meter: boolean;
  valid: boolean;
} {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return { save: false, meter: false, valid: false };
  }
  try {
    const conn = connection();
    if (!conn) return { save: false, meter: false, valid: true };
    const type = (conn.effectiveType || "").toLowerCase();
    const downlink = typeof conn.downlink === "number" ? conn.downlink : Infinity;
    const rtt = typeof conn.rtt === "number" ? conn.rtt : 0;
    const save = conn.saveData === true;
    const meter =
      type === "slow-2g" ||
      type === "2g" ||
      downlink < 0.4 ||
      rtt > 1000;
    return { save, meter, valid: true };
  } catch {
    return { save: false, meter: false, valid: false };
  }
}

/** 400 ms into a warning; 800 ms back to ok. First sample stays ok. */
export function arSaveStep(
  prev: ArSaveHold | null,
  raw: ArSaveKind,
  now: number,
): ArSaveHold {
  if (!prev) return { kind: "ok", raw, since: now };
  if (raw === prev.raw) {
    if (raw !== prev.kind) {
      const need = raw === "ok" ? AR_SAVE_RELEASE_MS : AR_SAVE_HOLD_MS;
      if (now - prev.since >= need) return { kind: raw, raw, since: now };
    }
    return prev;
  }
  return { kind: prev.kind, raw, since: now };
}

export function arSaveCoach(
  kind: ArSaveKind,
  product: ArSaveProduct,
): string | null {
  if (kind === "ok") return null;
  if (kind === "save") {
    if (product === "scan") {
      return "Low Data Mode is on — keep hunting; the plaque find stays put.";
    }
    if (product === "emily") {
      return "Low Data Mode is on — I will still sit on the floor. Tap when ready.";
    }
    if (product === "cubes") {
      return "Low Data Mode is on — the cube tap still works. Tap a surface.";
    }
    return "Low Data Mode is on — this fossil uses the copy already on the phone. Tap the table when ready.";
  }
  if (product === "scan") {
    return "This connection is metered — keep hunting.";
  }
  if (product === "emily") {
    return "This connection is metered — I stay on this phone. Tap the floor when ready.";
  }
  if (product === "cubes") {
    return "This connection is metered — tap a surface.";
  }
  return "This connection is metered — placing still works. Tap the table when ready.";
}

/** Constrained path never remaps taps. Scan still hunts. */
export function arSaveBlocksPlace(
  _kind: ArSaveKind,
  _product: ArSaveProduct,
): boolean {
  return false;
}

/** Prefer HTTP cache / skip extra fetches on save or metered. */
export function arSavePrefersCache(kind: ArSaveKind): boolean {
  return kind === "save" || kind === "meter";
}

export function arSaveApplyClass(
  el: Element | null,
  kind: ArSaveKind,
): void {
  if (!el) return;
  el.classList.toggle("is-ar-save-save", kind === "save");
  el.classList.toggle("is-ar-save-meter", kind === "meter");
}

export function arSaveParseNative(data: {
  kind?: string;
  save?: boolean;
  meter?: boolean;
  valid?: boolean;
}): ArSaveState {
  const save = data.save === true;
  const meter = data.meter === true;
  const kind: ArSaveKind =
    data.kind === "save" || data.kind === "meter" || data.kind === "ok"
      ? data.kind
      : arSaveKindFromFlags({ save, meter });
  return {
    kind,
    save,
    meter,
    valid: data.valid === true,
  };
}

export type ArSaveArm = { dispose: () => void };

export function arSaveArm(opts: {
  product: ArSaveProduct;
  getNative?: () => Promise<ArSaveState | null>;
  onKind: (kind: ArSaveKind, coach: string | null) => void;
  root?: Element | null;
  intervalMs?: number;
  now?: () => number;
}): ArSaveArm {
  const nowFn = opts.now ?? Date.now;
  let hold: ArSaveHold | null = null;
  let alive = true;
  const apply = (raw: ArSaveKind) => {
    hold = arSaveStep(hold, raw, nowFn());
    arSaveApplyClass(opts.root ?? null, hold.kind);
    opts.onKind(hold.kind, arSaveCoach(hold.kind, opts.product));
  };
  const tick = async () => {
    if (!alive) return;
    if (opts.getNative) {
      try {
        const native = await opts.getNative();
        if (!alive) return;
        if (native?.valid) {
          apply(native.kind);
          return;
        }
      } catch {
        /* fall through to web */
      }
    }
    const web = arSaveReadWeb();
    apply(web.valid ? arSaveKindFromFlags(web) : (hold?.raw ?? "ok"));
  };
  const id =
    typeof window !== "undefined"
      ? window.setInterval(() => {
          void tick();
        }, opts.intervalMs ?? 800)
      : 0;
  void tick();
  return {
    dispose() {
      alive = false;
      if (typeof window !== "undefined") window.clearInterval(id);
      arSaveApplyClass(opts.root ?? null, "ok");
    },
  };
}
