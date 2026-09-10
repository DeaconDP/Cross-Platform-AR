/** Guided Access / screen pinning / MDM camera-policy steward — kiosk lock that hides Settings or Home. */

export type ArKioskKind = "ok" | "pinned" | "policy";
export type ArKioskProduct = "place" | "scan" | "emily" | "cubes";

export const AR_KIOSK_HOLD_MS = 400;
export const AR_KIOSK_RELEASE_MS = 800;

export type ArKioskHold = {
  kind: ArKioskKind;
  raw: ArKioskKind;
  since: number;
};

export type ArKioskState = {
  kind: ArKioskKind;
  pinned: boolean;
  policy: boolean;
  valid: boolean;
};

export function arKioskKindFromFlags(flags: {
  pinned: boolean;
  policy: boolean;
}): ArKioskKind {
  if (flags.policy) return "policy";
  if (flags.pinned) return "pinned";
  return "ok";
}

/** Web cannot see Guided Access or Lock Task. Fullscreen / PWA is not a kiosk. */
export function arKioskReadWeb(): {
  pinned: boolean;
  policy: boolean;
  valid: boolean;
} {
  return { pinned: false, policy: false, valid: false };
}

/** 400 ms into a warning; 800 ms back to ok. First sample stays ok. */
export function arKioskStep(
  prev: ArKioskHold | null,
  raw: ArKioskKind,
  now: number,
): ArKioskHold {
  if (!prev) return { kind: "ok", raw, since: now };
  if (raw === prev.raw) {
    if (raw !== prev.kind) {
      const need = raw === "ok" ? AR_KIOSK_RELEASE_MS : AR_KIOSK_HOLD_MS;
      if (now - prev.since >= need) return { kind: raw, raw, since: now };
    }
    return prev;
  }
  return { kind: prev.kind, raw, since: now };
}

export function arKioskCoach(
  kind: ArKioskKind,
  product: ArKioskProduct,
): string | null {
  if (kind === "ok") return null;
  if (kind === "policy") {
    if (product === "scan") {
      return "Camera is turned off by a device restriction — ask a staff member.";
    }
    if (product === "emily") {
      return "Camera is turned off on this device — I can't sit on the table.";
    }
    if (product === "cubes") {
      return "Camera is turned off by a device restriction — native AR can't start.";
    }
    return "Camera is turned off by a device restriction — ask a staff member.";
  }
  if (product === "scan") {
    return "This device is locked to the exhibit — hold still on the plaque.";
  }
  if (product === "emily") {
    return "This device is locked to the app — use Back to leave Place.";
  }
  if (product === "cubes") {
    return "This device is locked to the demo — use Exit to leave AR.";
  }
  return "This device is locked to the exhibit — use Back to leave the camera.";
}

/** Kiosk never blocks a tap — the camera can still find a table. */
export function arKioskBlocksPlace(
  _kind: ArKioskKind,
  _product: ArKioskProduct,
): boolean {
  return false;
}

export function arKioskApplyClass(el: Element | null, kind: ArKioskKind): void {
  if (!el) return;
  el.classList.toggle("is-ar-kiosk", kind === "pinned");
  el.classList.toggle("is-ar-policy", kind === "policy");
}

export function arKioskParseNative(data: {
  kind?: string;
  pinned?: boolean;
  policy?: boolean;
  valid?: boolean;
}): ArKioskState {
  const pinned = data.pinned === true;
  const policy = data.policy === true;
  const kind: ArKioskKind =
    data.kind === "pinned" || data.kind === "policy" || data.kind === "ok"
      ? data.kind
      : arKioskKindFromFlags({ pinned, policy });
  return {
    kind,
    pinned,
    policy,
    valid: data.valid === true,
  };
}

export type ArKioskArm = { dispose: () => void };

export function arKioskArm(opts: {
  product: ArKioskProduct;
  getNative?: () => Promise<ArKioskState | null>;
  onKind: (kind: ArKioskKind, coach: string | null) => void;
  root?: Element | null;
  intervalMs?: number;
  now?: () => number;
}): ArKioskArm {
  const nowFn = opts.now ?? Date.now;
  let hold: ArKioskHold | null = null;
  let alive = true;
  const apply = (raw: ArKioskKind) => {
    hold = arKioskStep(hold, raw, nowFn());
    arKioskApplyClass(opts.root ?? null, hold.kind);
    opts.onKind(hold.kind, arKioskCoach(hold.kind, opts.product));
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
    const web = arKioskReadWeb();
    apply(web.valid ? arKioskKindFromFlags(web) : (hold?.raw ?? "ok"));
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
      arKioskApplyClass(opts.root ?? null, "ok");
    },
  };
}
