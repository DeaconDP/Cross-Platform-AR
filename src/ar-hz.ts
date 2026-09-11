/** Display refresh-rate steward — 30 Hz / battery-saver still places, never blocks. */

export type ArHzKind = "ok" | "soft" | "slow";
export type ArHzProduct = "place" | "scan" | "emily" | "cubes";

export const AR_HZ_HOLD_MS = 400;
export const AR_HZ_RELEASE_MS = 800;
export const AR_HZ_SLOW = 35;
export const AR_HZ_SOFT = 50;

export type ArHzHold = {
  kind: ArHzKind;
  raw: ArHzKind;
  since: number;
};

export type ArHzState = {
  kind: ArHzKind;
  slowOn: boolean;
  softOn: boolean;
  hz: number;
  valid: boolean;
};

export function arHzKindFromFlags(flags: {
  slowOn: boolean;
  softOn: boolean;
}): ArHzKind {
  if (flags.slowOn) return "slow";
  if (flags.softOn) return "soft";
  return "ok";
}

export function arHzKindFromHz(hz: number): ArHzKind {
  if (!(hz > 0)) return "ok";
  if (hz <= AR_HZ_SLOW) return "slow";
  if (hz <= AR_HZ_SOFT) return "soft";
  return "ok";
}

let webHz = 0;
let webHzLast = 0;
const webHzSamples: number[] = [];
let webHzRaf = 0;

function sampleWebHz(t: number): void {
  if (webHzLast > 0) {
    const dt = t - webHzLast;
    if (dt > 4 && dt < 80) {
      webHzSamples.push(1000 / dt);
      if (webHzSamples.length > 24) webHzSamples.shift();
      const sorted = [...webHzSamples].sort((a, b) => a - b);
      webHz = sorted[Math.floor(sorted.length / 2)] ?? 0;
    }
  }
  webHzLast = t;
  if (typeof window !== "undefined") {
    webHzRaf = window.requestAnimationFrame(sampleWebHz);
  }
}

export function arHzEnsureWebSample(): void {
  if (typeof window === "undefined" || webHzRaf) return;
  webHzRaf = window.requestAnimationFrame(sampleWebHz);
}

/** Chrome/Electron may expose screen.refreshRate; otherwise rAF median. */
export function arHzReadWeb(): {
  slowOn: boolean;
  softOn: boolean;
  hz: number;
  valid: boolean;
} {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return { slowOn: false, softOn: false, hz: 0, valid: false };
  }
  let hz = 0;
  try {
    const reported = (window.screen as { refreshRate?: number } | undefined)
      ?.refreshRate;
    if (typeof reported === "number" && reported > 0) hz = reported;
  } catch {
    /* refreshRate is optional */
  }
  if (!(hz > 0) && webHz > 0) hz = webHz;
  const kind = arHzKindFromHz(hz);
  return {
    slowOn: kind === "slow",
    softOn: kind === "soft",
    hz,
    valid: true,
  };
}

/** 400 ms into a warning; 800 ms back to ok. First sample stays ok. */
export function arHzStep(
  prev: ArHzHold | null,
  raw: ArHzKind,
  now: number,
): ArHzHold {
  if (!prev) return { kind: "ok", raw, since: now };
  if (raw === prev.raw) {
    if (raw !== prev.kind) {
      const need = raw === "ok" ? AR_HZ_RELEASE_MS : AR_HZ_HOLD_MS;
      if (now - prev.since >= need) return { kind: raw, raw, since: now };
    }
    return prev;
  }
  return { kind: prev.kind, raw, since: now };
}

export function arHzCoach(
  kind: ArHzKind,
  product: ArHzProduct,
): string | null {
  if (kind === "ok") return null;
  if (kind === "slow") {
    if (product === "scan") {
      return "Display is 30 Hz — the plaque may step, not slide. Hold steady.";
    }
    if (product === "emily") {
      return "Display is 30 Hz — I may step, not slide. Hold the phone steady.";
    }
    if (product === "cubes") {
      return "Display is 30 Hz — a cube may step, not slide. Hold steady.";
    }
    return "Display is 30 Hz — the fossil may step, not slide. Hold steady.";
  }
  if (product === "scan") {
    return "Display is running slow — hold still so the plaque stays planted.";
  }
  if (product === "emily") {
    return "Display is running slow — hold still so I stay planted.";
  }
  if (product === "cubes") {
    return "Display is running slow — hold still so a cube stays planted.";
  }
  return "Display is running slow — hold still so the fossil stays planted.";
}

/** A 30 Hz panel never remaps taps. Scan still hunts. */
export function arHzBlocksPlace(
  _kind: ArHzKind,
  _product: ArHzProduct,
): boolean {
  return false;
}

/** Hosts can drop extra FX when the panel cannot keep up. */
export function arHzPrefersLowFx(kind: ArHzKind): boolean {
  return kind === "slow" || kind === "soft";
}

export function arHzApplyClass(el: Element | null, kind: ArHzKind): void {
  if (!el) return;
  el.classList.toggle("is-ar-hz-slow", kind === "slow");
  el.classList.toggle("is-ar-hz-soft", kind === "soft");
}

export function arHzParseNative(data: {
  kind?: string;
  slowOn?: boolean;
  softOn?: boolean;
  hz?: number;
  valid?: boolean;
}): ArHzState {
  const slowOn = data.slowOn === true;
  const softOn = data.softOn === true;
  const hz = typeof data.hz === "number" && data.hz > 0 ? data.hz : 0;
  const kind: ArHzKind =
    data.kind === "slow" || data.kind === "soft" || data.kind === "ok"
      ? data.kind
      : arHzKindFromFlags({ slowOn, softOn });
  return {
    kind,
    slowOn,
    softOn,
    hz,
    valid: data.valid === true,
  };
}

export type ArHzArm = { dispose: () => void };

export function arHzArm(opts: {
  product: ArHzProduct;
  getNative?: () => Promise<ArHzState | null>;
  onKind: (kind: ArHzKind, coach: string | null) => void;
  root?: Element | null;
  intervalMs?: number;
  now?: () => number;
}): ArHzArm {
  const nowFn = opts.now ?? Date.now;
  let hold: ArHzHold | null = null;
  let alive = true;
  arHzEnsureWebSample();
  const apply = (raw: ArHzKind) => {
    hold = arHzStep(hold, raw, nowFn());
    arHzApplyClass(opts.root ?? null, hold.kind);
    opts.onKind(hold.kind, arHzCoach(hold.kind, opts.product));
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
    const web = arHzReadWeb();
    apply(web.valid ? arHzKindFromFlags(web) : (hold?.raw ?? "ok"));
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
      arHzApplyClass(opts.root ?? null, "ok");
    },
  };
}
