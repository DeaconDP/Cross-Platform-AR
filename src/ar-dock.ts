/** Dock / charge / desk-stand steward — keep the session hot, never block place. */

export type ArDockKind = "ok" | "charge" | "desk";
export type ArDockProduct = "place" | "scan" | "emily" | "cubes";

export const AR_DOCK_HOLD_MS = 400;
export const AR_DOCK_RELEASE_MS = 800;

export type ArDockHold = {
  kind: ArDockKind;
  raw: ArDockKind;
  since: number;
};

export type ArDockState = {
  kind: ArDockKind;
  desk: boolean;
  charge: boolean;
  valid: boolean;
};

type BatteryLike = {
  charging?: boolean;
  addEventListener?: (name: string, fn: () => void) => void;
};

export function arDockKindFromFlags(flags: {
  desk: boolean;
  charge: boolean;
}): ArDockKind {
  if (flags.desk) return "desk";
  if (flags.charge) return "charge";
  return "ok";
}

function isDeskForm(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }
  const ua = navigator.userAgent || "";
  if (/iPad|Tablet|Android(?!.*Mobile)/i.test(ua)) return true;
  try {
    return window.matchMedia("(min-width: 768px) and (pointer: coarse)").matches;
  } catch {
    return false;
  }
}

let webBattery: { charging: boolean; desk: boolean } | null = null;
let webBatteryHooked = false;

function hookBattery(battery: BatteryLike): void {
  const apply = () => {
    const charging = battery.charging === true;
    webBattery = { charging, desk: charging && isDeskForm() };
  };
  apply();
  try {
    battery.addEventListener?.("chargingchange", apply);
  } catch {
    /* older Battery API */
  }
}

function warmWebBattery(): void {
  if (webBatteryHooked || typeof navigator === "undefined") return;
  webBatteryHooked = true;
  const nav = navigator as Navigator & {
    getBattery?: () => Promise<BatteryLike>;
  };
  if (typeof nav.getBattery !== "function") return;
  void nav.getBattery().then(hookBattery).catch(() => {
    webBatteryHooked = false;
  });
}

export function arDockReadWeb(): {
  desk: boolean;
  charge: boolean;
  valid: boolean;
} {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return { desk: false, charge: false, valid: false };
  }
  warmWebBattery();
  if (!webBattery) {
    return { desk: false, charge: false, valid: true };
  }
  return {
    desk: webBattery.desk,
    charge: webBattery.charging,
    valid: true,
  };
}

/** 400 ms into a warning; 800 ms back to ok. First sample stays ok. */
export function arDockStep(
  prev: ArDockHold | null,
  raw: ArDockKind,
  now: number,
): ArDockHold {
  if (!prev) return { kind: "ok", raw, since: now };
  if (raw === prev.raw) {
    if (raw !== prev.kind) {
      const need = raw === "ok" ? AR_DOCK_RELEASE_MS : AR_DOCK_HOLD_MS;
      if (now - prev.since >= need) return { kind: raw, raw, since: now };
    }
    return prev;
  }
  return { kind: prev.kind, raw, since: now };
}

export function arDockCoach(
  kind: ArDockKind,
  product: ArDockProduct,
): string | null {
  if (kind === "ok") return null;
  if (kind === "desk") {
    if (product === "scan") {
      return "On a stand — keep hunting; the plaque find stays put.";
    }
    if (product === "emily") {
      return "On a stand — I will still sit on the floor. Tap when ready.";
    }
    if (product === "cubes") {
      return "On a stand — the cube tap still works. Tap a surface.";
    }
    return "On a stand — this fossil stays ready. Tap the table when you want it.";
  }
  if (product === "scan") {
    return "Charging — keep hunting.";
  }
  if (product === "emily") {
    return "Charging — I stay ready on this phone. Tap the floor when ready.";
  }
  if (product === "cubes") {
    return "Charging — tap a surface.";
  }
  return "Charging — this fossil stays ready on the phone. Tap the table when ready.";
}

/** A dock or charger never remaps taps. Scan still hunts. */
export function arDockBlocksPlace(
  _kind: ArDockKind,
  _product: ArDockProduct,
): boolean {
  return false;
}

/** Prefer onboard copies and keep the session hot on a stand or charger. */
export function arDockPrefersStayHot(kind: ArDockKind): boolean {
  return kind === "desk" || kind === "charge";
}

export function arDockApplyClass(el: Element | null, kind: ArDockKind): void {
  if (!el) return;
  el.classList.toggle("is-ar-dock-desk", kind === "desk");
  el.classList.toggle("is-ar-dock-charge", kind === "charge");
}

export function arDockParseNative(data: {
  kind?: string;
  desk?: boolean;
  charge?: boolean;
  valid?: boolean;
}): ArDockState {
  const desk = data.desk === true;
  const charge = data.charge === true;
  const kind: ArDockKind =
    data.kind === "desk" || data.kind === "charge" || data.kind === "ok"
      ? data.kind
      : arDockKindFromFlags({ desk, charge });
  return {
    kind,
    desk,
    charge,
    valid: data.valid === true,
  };
}

export type ArDockArm = { dispose: () => void };

export function arDockArm(opts: {
  product: ArDockProduct;
  getNative?: () => Promise<ArDockState | null>;
  onKind: (kind: ArDockKind, coach: string | null) => void;
  root?: Element | null;
  intervalMs?: number;
  now?: () => number;
}): ArDockArm {
  const nowFn = opts.now ?? Date.now;
  let hold: ArDockHold | null = null;
  let alive = true;
  const apply = (raw: ArDockKind) => {
    hold = arDockStep(hold, raw, nowFn());
    arDockApplyClass(opts.root ?? null, hold.kind);
    opts.onKind(hold.kind, arDockCoach(hold.kind, opts.product));
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
    const web = arDockReadWeb();
    apply(web.valid ? arDockKindFromFlags(web) : (hold?.raw ?? "ok"));
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
      arDockApplyClass(opts.root ?? null, "ok");
    },
  };
}
