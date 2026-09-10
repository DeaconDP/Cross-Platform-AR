/** System edge-gesture / accidental-back steward — swipe-from-edge leaves AR. */

export type ArEdgeKind = "ok" | "edge" | "back";
export type ArEdgeProduct = "place" | "scan" | "emily" | "cubes";

export const AR_EDGE_HOLD_MS = 400;
export const AR_EDGE_RELEASE_MS = 800;
export const AR_EDGE_X = 0.08;
export const AR_EDGE_Y_BOTTOM = 0.94;

export type ArEdgeHold = {
  kind: ArEdgeKind;
  raw: ArEdgeKind;
  since: number;
};

export type ArEdgeState = {
  kind: ArEdgeKind;
  edge: boolean;
  back: boolean;
  valid: boolean;
};

export function arEdgeKindFromFlags(flags: {
  edge: boolean;
  back: boolean;
}): ArEdgeKind {
  if (flags.back) return "back";
  if (flags.edge) return "edge";
  return "ok";
}

/** Left / right system-gesture inset or home-indicator band. */
export function arEdgeInZone(nx: number, ny: number): boolean {
  return nx < AR_EDGE_X || nx > 1 - AR_EDGE_X || ny > AR_EDGE_Y_BOTTOM;
}

/** Touch phones keep an edge-back swipe in the browser and in gesture nav. */
export function arEdgeReadWeb(): {
  edge: boolean;
  back: boolean;
  valid: boolean;
} {
  if (typeof navigator === "undefined") {
    return { edge: false, back: false, valid: false };
  }
  const touch = (navigator.maxTouchPoints ?? 0) > 0;
  const ua = navigator.userAgent ?? "";
  const mobile = /iPhone|iPad|iPod|Android/i.test(ua);
  return { edge: touch && mobile, back: false, valid: true };
}

/** 400 ms into a warning; 800 ms back to ok. First sample stays ok. */
export function arEdgeStep(
  prev: ArEdgeHold | null,
  raw: ArEdgeKind,
  now: number,
): ArEdgeHold {
  if (!prev) return { kind: "ok", raw, since: now };
  if (raw === prev.raw) {
    if (raw !== prev.kind) {
      const need = raw === "ok" ? AR_EDGE_RELEASE_MS : AR_EDGE_HOLD_MS;
      if (now - prev.since >= need) return { kind: raw, raw, since: now };
    }
    return prev;
  }
  return { kind: prev.kind, raw, since: now };
}

export function arEdgeCoach(
  kind: ArEdgeKind,
  product: ArEdgeProduct,
): string | null {
  if (kind === "ok") return null;
  if (kind === "back") {
    if (product === "scan") {
      return "The edge swipe leaves — use Back when you are done with the plaque.";
    }
    if (product === "emily") {
      return "The edge swipe leaves — use Leave AR when you are done.";
    }
    if (product === "cubes") {
      return "The edge swipe leaves — use Exit when you are done.";
    }
    return "The edge swipe leaves — use Back when you are done.";
  }
  if (product === "scan") {
    return "Keep the plaque in the middle — the edge goes Back.";
  }
  if (product === "emily") {
    return "Tap the floor in the middle — the edge swipe leaves.";
  }
  if (product === "cubes") {
    return "Tap the table in the middle — the edge swipe leaves.";
  }
  return "Tap the table in the middle — the edge swipe goes Back.";
}

/** Edge-zone / back-swipe taps miss. Scan still hunts. */
export function arEdgeBlocksPlace(
  kind: ArEdgeKind,
  product: ArEdgeProduct,
  nx?: number,
  ny?: number,
): boolean {
  if (product === "scan") return false;
  if (kind === "back") return true;
  if (kind === "edge" && nx != null && ny != null) {
    return arEdgeInZone(nx, ny);
  }
  return false;
}

export function arEdgeApplyClass(el: Element | null, kind: ArEdgeKind): void {
  if (!el) return;
  el.classList.toggle("is-ar-edge-edge", kind === "edge");
  el.classList.toggle("is-ar-edge-back", kind === "back");
}

export function arEdgeParseNative(data: {
  kind?: string;
  edge?: boolean;
  back?: boolean;
  valid?: boolean;
}): ArEdgeState {
  const edge = data.edge === true;
  const back = data.back === true;
  const kind: ArEdgeKind =
    data.kind === "edge" || data.kind === "back" || data.kind === "ok"
      ? data.kind
      : arEdgeKindFromFlags({ edge, back });
  return {
    kind,
    edge,
    back,
    valid: data.valid === true,
  };
}

export type ArEdgeArm = { dispose: () => void };

export function arEdgeArm(opts: {
  product: ArEdgeProduct;
  getNative?: () => Promise<ArEdgeState | null>;
  onKind: (kind: ArEdgeKind, coach: string | null) => void;
  root?: Element | null;
  intervalMs?: number;
  now?: () => number;
}): ArEdgeArm {
  const nowFn = opts.now ?? Date.now;
  let hold: ArEdgeHold | null = null;
  let alive = true;
  const apply = (raw: ArEdgeKind) => {
    hold = arEdgeStep(hold, raw, nowFn());
    arEdgeApplyClass(opts.root ?? null, hold.kind);
    opts.onKind(hold.kind, arEdgeCoach(hold.kind, opts.product));
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
    const web = arEdgeReadWeb();
    apply(web.valid ? arEdgeKindFromFlags(web) : (hold?.raw ?? "ok"));
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
      arEdgeApplyClass(opts.root ?? null, "ok");
    },
  };
}
