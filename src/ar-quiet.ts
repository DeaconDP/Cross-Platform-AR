/** Focus / DND / Sleep steward — keep coaching visual, never block place. */

export type ArQuietKind = "ok" | "focus" | "sleep";
export type ArQuietProduct = "place" | "scan" | "emily" | "cubes";

export const AR_QUIET_HOLD_MS = 400;
export const AR_QUIET_RELEASE_MS = 800;

export type ArQuietHold = {
  kind: ArQuietKind;
  raw: ArQuietKind;
  since: number;
};

export type ArQuietState = {
  kind: ArQuietKind;
  sleep: boolean;
  focus: boolean;
  valid: boolean;
};

export function arQuietKindFromFlags(flags: {
  sleep: boolean;
  focus: boolean;
}): ArQuietKind {
  if (flags.sleep) return "sleep";
  if (flags.focus) return "focus";
  return "ok";
}

/** Browsers have no Focus / DND API — web is always ok when a window exists. */
export function arQuietReadWeb(): {
  sleep: boolean;
  focus: boolean;
  valid: boolean;
} {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return { sleep: false, focus: false, valid: false };
  }
  return { sleep: false, focus: false, valid: true };
}

/** 400 ms into a warning; 800 ms back to ok. First sample stays ok. */
export function arQuietStep(
  prev: ArQuietHold | null,
  raw: ArQuietKind,
  now: number,
): ArQuietHold {
  if (!prev) return { kind: "ok", raw, since: now };
  if (raw === prev.raw) {
    if (raw !== prev.kind) {
      const need = raw === "ok" ? AR_QUIET_RELEASE_MS : AR_QUIET_HOLD_MS;
      if (now - prev.since >= need) return { kind: raw, raw, since: now };
    }
    return prev;
  }
  return { kind: prev.kind, raw, since: now };
}

export function arQuietCoach(
  kind: ArQuietKind,
  product: ArQuietProduct,
): string | null {
  if (kind === "ok") return null;
  if (kind === "sleep") {
    if (product === "scan") {
      return "Sleep Focus is on — taps stay silent. Keep hunting; the find still stamps.";
    }
    if (product === "emily") {
      return "Sleep Focus is on — taps stay silent. Watch the floor, then tap.";
    }
    if (product === "cubes") {
      return "Sleep Focus is on — taps stay silent. Watch the surface, then tap.";
    }
    return "Sleep Focus is on — taps stay silent. Watch the table, then tap.";
  }
  if (product === "scan") {
    return "Do Not Disturb is on — keep hunting. Watch the plaque for the find.";
  }
  if (product === "emily") {
    return "Do Not Disturb is on — I stay ready. Watch the floor, then tap.";
  }
  if (product === "cubes") {
    return "Do Not Disturb is on — tap a surface. Watch the reticle.";
  }
  return "Do Not Disturb is on — this fossil still places. Watch the highlight, then tap.";
}

/** Focus / Sleep never remaps taps. Scan still hunts. */
export function arQuietBlocksPlace(
  _kind: ArQuietKind,
  _product: ArQuietProduct,
): boolean {
  return false;
}

/** Prefer the on-screen coach when the OS is swallowing haptics and banners. */
export function arQuietPrefersVisual(kind: ArQuietKind): boolean {
  return kind === "sleep" || kind === "focus";
}

export function arQuietApplyClass(el: Element | null, kind: ArQuietKind): void {
  if (!el) return;
  el.classList.toggle("is-ar-quiet-sleep", kind === "sleep");
  el.classList.toggle("is-ar-quiet-focus", kind === "focus");
}

export function arQuietParseNative(data: {
  kind?: string;
  sleep?: boolean;
  focus?: boolean;
  valid?: boolean;
}): ArQuietState {
  const sleep = data.sleep === true;
  const focus = data.focus === true;
  const kind: ArQuietKind =
    data.kind === "sleep" || data.kind === "focus" || data.kind === "ok"
      ? data.kind
      : arQuietKindFromFlags({ sleep, focus });
  return {
    kind,
    sleep,
    focus,
    valid: data.valid === true,
  };
}

export type ArQuietArm = { dispose: () => void };

export function arQuietArm(opts: {
  product: ArQuietProduct;
  getNative?: () => Promise<ArQuietState | null>;
  onKind: (kind: ArQuietKind, coach: string | null) => void;
  root?: Element | null;
  intervalMs?: number;
  now?: () => number;
}): ArQuietArm {
  const nowFn = opts.now ?? Date.now;
  let hold: ArQuietHold | null = null;
  let alive = true;
  const apply = (raw: ArQuietKind) => {
    hold = arQuietStep(hold, raw, nowFn());
    arQuietApplyClass(opts.root ?? null, hold.kind);
    opts.onKind(hold.kind, arQuietCoach(hold.kind, opts.product));
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
    const web = arQuietReadWeb();
    apply(web.valid ? arQuietKindFromFlags(web) : (hold?.raw ?? "ok"));
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
      arQuietApplyClass(opts.root ?? null, "ok");
    },
  };
}
