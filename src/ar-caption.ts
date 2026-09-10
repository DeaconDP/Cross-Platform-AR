/** Closed captions / hearing-aid steward — keep coach text on screen. */

export type ArCaptionKind = "ok" | "aid" | "caps";
export type ArCaptionProduct = "place" | "scan" | "emily" | "cubes";

export const AR_CAPTION_HOLD_MS = 400;
export const AR_CAPTION_RELEASE_MS = 800;

export type ArCaptionHold = {
  kind: ArCaptionKind;
  raw: ArCaptionKind;
  since: number;
};

export type ArCaptionState = {
  kind: ArCaptionKind;
  caps: boolean;
  aid: boolean;
  valid: boolean;
};

export function arCaptionKindFromFlags(flags: {
  caps: boolean;
  aid: boolean;
}): ArCaptionKind {
  if (flags.caps) return "caps";
  if (flags.aid) return "aid";
  return "ok";
}

/** Captions / hearing aids are native. No web media query — stay invalid. */
export function arCaptionReadWeb(): {
  caps: boolean;
  aid: boolean;
  valid: boolean;
} {
  return { caps: false, aid: false, valid: false };
}

/** 400 ms into a warning; 800 ms back to ok. First sample stays ok. */
export function arCaptionStep(
  prev: ArCaptionHold | null,
  raw: ArCaptionKind,
  now: number,
): ArCaptionHold {
  if (!prev) return { kind: "ok", raw, since: now };
  if (raw === prev.raw) {
    if (raw !== prev.kind) {
      const need = raw === "ok" ? AR_CAPTION_RELEASE_MS : AR_CAPTION_HOLD_MS;
      if (now - prev.since >= need) return { kind: raw, raw, since: now };
    }
    return prev;
  }
  return { kind: prev.kind, raw, since: now };
}

export function arCaptionCoach(
  kind: ArCaptionKind,
  product: ArCaptionProduct,
): string | null {
  if (kind === "ok") return null;
  if (kind === "caps") {
    if (product === "scan") {
      return "Captions are on — plaque text stays on screen.";
    }
    if (product === "emily") {
      return "Captions are on — I will keep my words on screen.";
    }
    if (product === "cubes") {
      return "Captions are on — placement hints stay on screen.";
    }
    return "Captions are on — fossil hints stay on screen.";
  }
  if (product === "scan") {
    return "Hearing aid connected — keep the plaque in view.";
  }
  if (product === "emily") {
    return "Hearing aid connected — I will keep talking in your aid.";
  }
  if (product === "cubes") {
    return "Hearing aid connected — hints stay on screen.";
  }
  return "Hearing aid connected — fossil sound stays in your aid.";
}

/** Captions never remap taps. Scan still hunts. */
export function arCaptionBlocksPlace(
  _kind: ArCaptionKind,
  _product: ArCaptionProduct,
): boolean {
  return false;
}

export function arCaptionApplyClass(
  el: Element | null,
  kind: ArCaptionKind,
): void {
  if (!el) return;
  el.classList.toggle("is-ar-caption-caps", kind === "caps");
  el.classList.toggle("is-ar-caption-aid", kind === "aid");
}

export function arCaptionParseNative(data: {
  kind?: string;
  caps?: boolean;
  aid?: boolean;
  valid?: boolean;
}): ArCaptionState {
  const caps = data.caps === true;
  const aid = data.aid === true;
  const kind: ArCaptionKind =
    data.kind === "aid" || data.kind === "caps" || data.kind === "ok"
      ? data.kind
      : arCaptionKindFromFlags({ caps, aid });
  return {
    kind,
    caps,
    aid,
    valid: data.valid === true,
  };
}

export type ArCaptionArm = { dispose: () => void };

export function arCaptionArm(opts: {
  product: ArCaptionProduct;
  getNative?: () => Promise<ArCaptionState | null>;
  onKind: (kind: ArCaptionKind, coach: string | null) => void;
  root?: Element | null;
  intervalMs?: number;
  now?: () => number;
}): ArCaptionArm {
  const nowFn = opts.now ?? Date.now;
  let hold: ArCaptionHold | null = null;
  let alive = true;
  const apply = (raw: ArCaptionKind) => {
    hold = arCaptionStep(hold, raw, nowFn());
    arCaptionApplyClass(opts.root ?? null, hold.kind);
    opts.onKind(hold.kind, arCaptionCoach(hold.kind, opts.product));
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
    const web = arCaptionReadWeb();
    apply(web.valid ? arCaptionKindFromFlags(web) : (hold?.raw ?? "ok"));
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
      arCaptionApplyClass(opts.root ?? null, "ok");
    },
  };
}
