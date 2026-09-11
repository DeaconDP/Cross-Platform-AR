/** Screen-record / ReplayKit / screenshot steward — prefer low FX while recording, never block place. */

export type ArTapeKind = "ok" | "shot" | "record";
export type ArTapeProduct = "place" | "scan" | "emily" | "cubes";

export const AR_TAPE_HOLD_MS = 400;
export const AR_TAPE_RELEASE_MS = 800;

export type ArTapeHold = {
  kind: ArTapeKind;
  raw: ArTapeKind;
  since: number;
};

export type ArTapeState = {
  kind: ArTapeKind;
  record: boolean;
  shot: boolean;
  valid: boolean;
};

export function arTapeKindFromFlags(flags: {
  record: boolean;
  shot: boolean;
}): ArTapeKind {
  if (flags.record) return "record";
  if (flags.shot) return "shot";
  return "ok";
}

/** Browsers have no ReplayKit / screen-record API — web is always ok when a window exists. */
export function arTapeReadWeb(): {
  record: boolean;
  shot: boolean;
  valid: boolean;
} {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return { record: false, shot: false, valid: false };
  }
  return { record: false, shot: false, valid: true };
}

/** 400 ms into a warning; 800 ms back to ok. First sample stays ok. */
export function arTapeStep(
  prev: ArTapeHold | null,
  raw: ArTapeKind,
  now: number,
): ArTapeHold {
  if (!prev) return { kind: "ok", raw, since: now };
  if (raw === prev.raw) {
    if (raw !== prev.kind) {
      const need = raw === "ok" ? AR_TAPE_RELEASE_MS : AR_TAPE_HOLD_MS;
      if (now - prev.since >= need) return { kind: raw, raw, since: now };
    }
    return prev;
  }
  return { kind: prev.kind, raw, since: now };
}

export function arTapeCoach(
  kind: ArTapeKind,
  product: ArTapeProduct,
): string | null {
  if (kind === "ok") return null;
  if (kind === "record") {
    if (product === "scan") {
      return "Recording can slow the camera — keep hunting; the find still stamps.";
    }
    if (product === "emily") {
      return "Recording can slow the floor — watch me, then tap.";
    }
    if (product === "cubes") {
      return "Recording can slow the camera — watch the surface, then tap.";
    }
    return "Recording can slow the camera — the fossil still places.";
  }
  if (product === "scan") {
    return "Screenshot saved — keep hunting for the plaque.";
  }
  if (product === "emily") {
    return "Screenshot saved — the floor is still live.";
  }
  if (product === "cubes") {
    return "Screenshot saved — the reticle is still live.";
  }
  return "Screenshot saved — keep placing.";
}

/** Capture never remaps taps. Scan still hunts. */
export function arTapeBlocksPlace(
  _kind: ArTapeKind,
  _product: ArTapeProduct,
): boolean {
  return false;
}

/** Screen recording taxes GPU — prefer the low-FX ladder. */
export function arTapePrefersLowFx(kind: ArTapeKind): boolean {
  return kind === "record";
}

export function arTapeApplyClass(el: Element | null, kind: ArTapeKind): void {
  if (!el) return;
  el.classList.toggle("is-ar-tape-record", kind === "record");
  el.classList.toggle("is-ar-tape-shot", kind === "shot");
}

export function arTapeParseNative(data: {
  kind?: string;
  record?: boolean;
  shot?: boolean;
  valid?: boolean;
}): ArTapeState {
  const record = data.record === true;
  const shot = data.shot === true;
  const kind: ArTapeKind =
    data.kind === "record" || data.kind === "shot" || data.kind === "ok"
      ? data.kind
      : arTapeKindFromFlags({ record, shot });
  return {
    kind,
    record,
    shot,
    valid: data.valid === true,
  };
}

export type ArTapeArm = { dispose: () => void };

export function arTapeArm(opts: {
  product: ArTapeProduct;
  getNative?: () => Promise<ArTapeState | null>;
  onKind: (kind: ArTapeKind, coach: string | null) => void;
  root?: Element | null;
  intervalMs?: number;
  now?: () => number;
}): ArTapeArm {
  const nowFn = opts.now ?? Date.now;
  let hold: ArTapeHold | null = null;
  let alive = true;
  const apply = (raw: ArTapeKind) => {
    hold = arTapeStep(hold, raw, nowFn());
    arTapeApplyClass(opts.root ?? null, hold.kind);
    opts.onKind(hold.kind, arTapeCoach(hold.kind, opts.product));
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
    const web = arTapeReadWeb();
    apply(web.valid ? arTapeKindFromFlags(web) : (hold?.raw ?? "ok"));
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
      arTapeApplyClass(opts.root ?? null, "ok");
    },
  };
}
