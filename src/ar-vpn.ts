/** VPN / Private Relay / lockdown-tunnel steward — prefer onboard copies, never block place. */

export type ArVpnKind = "ok" | "vpn" | "lock";
export type ArVpnProduct = "place" | "scan" | "emily" | "cubes";

export const AR_VPN_HOLD_MS = 400;
export const AR_VPN_RELEASE_MS = 800;

export type ArVpnHold = {
  kind: ArVpnKind;
  raw: ArVpnKind;
  since: number;
};

export type ArVpnState = {
  kind: ArVpnKind;
  vpn: boolean;
  lock: boolean;
  valid: boolean;
};

type NetworkInformationLike = {
  type?: string;
};

export function arVpnKindFromFlags(flags: {
  vpn: boolean;
  lock: boolean;
}): ArVpnKind {
  if (flags.lock) return "lock";
  if (flags.vpn) return "vpn";
  return "ok";
}

function connection(): NetworkInformationLike | null {
  if (typeof navigator === "undefined") return null;
  const nav = navigator as Navigator & { connection?: NetworkInformationLike };
  return nav.connection ?? null;
}

export function arVpnReadWeb(): {
  vpn: boolean;
  lock: boolean;
  valid: boolean;
} {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return { vpn: false, lock: false, valid: false };
  }
  try {
    const conn = connection();
    if (!conn) return { vpn: false, lock: false, valid: true };
    const type = (conn.type || "").toLowerCase();
    return { vpn: type === "vpn", lock: false, valid: true };
  } catch {
    return { vpn: false, lock: false, valid: false };
  }
}

/** 400 ms into a warning; 800 ms back to ok. First sample stays ok. */
export function arVpnStep(
  prev: ArVpnHold | null,
  raw: ArVpnKind,
  now: number,
): ArVpnHold {
  if (!prev) return { kind: "ok", raw, since: now };
  if (raw === prev.raw) {
    if (raw !== prev.kind) {
      const need = raw === "ok" ? AR_VPN_RELEASE_MS : AR_VPN_HOLD_MS;
      if (now - prev.since >= need) return { kind: raw, raw, since: now };
    }
    return prev;
  }
  return { kind: prev.kind, raw, since: now };
}

export function arVpnCoach(
  kind: ArVpnKind,
  product: ArVpnProduct,
): string | null {
  if (kind === "ok") return null;
  if (kind === "lock") {
    if (product === "scan") {
      return "VPN lockdown is on — keep hunting; the plaque find stays put.";
    }
    if (product === "emily") {
      return "VPN lockdown is on — I will still sit on the floor. Tap when ready.";
    }
    if (product === "cubes") {
      return "VPN lockdown is on — the cube tap still works. Tap a surface.";
    }
    return "VPN lockdown is on — this fossil uses the copy already on the phone. Tap the table when ready.";
  }
  if (product === "scan") {
    return "A VPN is on — keep hunting.";
  }
  if (product === "emily") {
    return "A VPN is on — I stay on this phone. Tap the floor when ready.";
  }
  if (product === "cubes") {
    return "A VPN is on — tap a surface.";
  }
  return "A VPN is on — this fossil uses the copy already on the phone. Tap the table when ready.";
}

/** A tunnel never remaps taps. Scan still hunts. */
export function arVpnBlocksPlace(
  _kind: ArVpnKind,
  _product: ArVpnProduct,
): boolean {
  return false;
}

/** Prefer HTTP cache / skip extra fetches when a tunnel may stall LAN. */
export function arVpnPrefersCache(kind: ArVpnKind): boolean {
  return kind === "vpn" || kind === "lock";
}

export function arVpnApplyClass(el: Element | null, kind: ArVpnKind): void {
  if (!el) return;
  el.classList.toggle("is-ar-vpn-vpn", kind === "vpn");
  el.classList.toggle("is-ar-vpn-lock", kind === "lock");
}

export function arVpnParseNative(data: {
  kind?: string;
  vpn?: boolean;
  lock?: boolean;
  valid?: boolean;
}): ArVpnState {
  const vpn = data.vpn === true;
  const lock = data.lock === true;
  const kind: ArVpnKind =
    data.kind === "lock" || data.kind === "vpn" || data.kind === "ok"
      ? data.kind
      : arVpnKindFromFlags({ vpn, lock });
  return {
    kind,
    vpn,
    lock,
    valid: data.valid === true,
  };
}

export type ArVpnArm = { dispose: () => void };

export function arVpnArm(opts: {
  product: ArVpnProduct;
  getNative?: () => Promise<ArVpnState | null>;
  onKind: (kind: ArVpnKind, coach: string | null) => void;
  root?: Element | null;
  intervalMs?: number;
  now?: () => number;
}): ArVpnArm {
  const nowFn = opts.now ?? Date.now;
  let hold: ArVpnHold | null = null;
  let alive = true;
  const apply = (raw: ArVpnKind) => {
    hold = arVpnStep(hold, raw, nowFn());
    arVpnApplyClass(opts.root ?? null, hold.kind);
    opts.onKind(hold.kind, arVpnCoach(hold.kind, opts.product));
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
    const web = arVpnReadWeb();
    apply(web.valid ? arVpnKindFromFlags(web) : (hold?.raw ?? "ok"));
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
      arVpnApplyClass(opts.root ?? null, "ok");
    },
  };
}
