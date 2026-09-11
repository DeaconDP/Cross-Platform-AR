/** Switch Control / Switch Access / hover-click steward — Select still places, never block place. */

export type ArMotorKind = "ok" | "dwell" | "switch";
export type ArMotorProduct = "place" | "scan" | "emily" | "cubes";

export const AR_MOTOR_HOLD_MS = 400;
export const AR_MOTOR_RELEASE_MS = 800;

export type ArMotorHold = {
  kind: ArMotorKind;
  raw: ArMotorKind;
  since: number;
};

export type ArMotorState = {
  kind: ArMotorKind;
  switchOn: boolean;
  dwell: boolean;
  valid: boolean;
};

export function arMotorKindFromFlags(flags: {
  switchOn: boolean;
  dwell: boolean;
}): ArMotorKind {
  if (flags.switchOn) return "switch";
  if (flags.dwell) return "dwell";
  return "ok";
}

/** Browsers have no Switch Access / autoclick API — web is always ok when a window exists. */
export function arMotorReadWeb(): {
  switchOn: boolean;
  dwell: boolean;
  valid: boolean;
} {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return { switchOn: false, dwell: false, valid: false };
  }
  return { switchOn: false, dwell: false, valid: true };
}

/** 400 ms into a warning; 800 ms back to ok. First sample stays ok. */
export function arMotorStep(
  prev: ArMotorHold | null,
  raw: ArMotorKind,
  now: number,
): ArMotorHold {
  if (!prev) return { kind: "ok", raw, since: now };
  if (raw === prev.raw) {
    if (raw !== prev.kind) {
      const need = raw === "ok" ? AR_MOTOR_RELEASE_MS : AR_MOTOR_HOLD_MS;
      if (now - prev.since >= need) return { kind: raw, raw, since: now };
    }
    return prev;
  }
  return { kind: prev.kind, raw, since: now };
}

export function arMotorCoach(
  kind: ArMotorKind,
  product: ArMotorProduct,
): string | null {
  if (kind === "ok") return null;
  if (kind === "switch") {
    if (product === "scan") {
      return "Switch scanning is on — keep hunting; Select still finds the plaque.";
    }
    if (product === "emily") {
      return "Switch scanning is on — Select still places me.";
    }
    if (product === "cubes") {
      return "Switch scanning is on — Select still places a cube.";
    }
    return "Switch scanning is on — Select still places. A missed tap is the switch, not the camera.";
  }
  if (product === "scan") {
    return "Hover click is on — dwell on the plaque, then it finds.";
  }
  if (product === "emily") {
    return "Hover click is on — dwell on the floor, then I land.";
  }
  if (product === "cubes") {
    return "Hover click is on — dwell on the surface, then it places.";
  }
  return "Hover click is on — dwell on the table, then it places.";
}

/** Motor aids never remap taps. Scan still hunts. */
export function arMotorBlocksPlace(
  _kind: ArMotorKind,
  _product: ArMotorProduct,
): boolean {
  return false;
}

/** Switch scanning needs a named Select target, not a color-only reticle. */
export function arMotorPrefersSelect(kind: ArMotorKind): boolean {
  return kind === "switch" || kind === "dwell";
}

export function arMotorApplyClass(el: Element | null, kind: ArMotorKind): void {
  if (!el) return;
  el.classList.toggle("is-ar-motor-switch", kind === "switch");
  el.classList.toggle("is-ar-motor-dwell", kind === "dwell");
}

export function arMotorParseNative(data: {
  kind?: string;
  switchOn?: boolean;
  dwell?: boolean;
  valid?: boolean;
}): ArMotorState {
  const switchOn = data.switchOn === true;
  const dwell = data.dwell === true;
  const kind: ArMotorKind =
    data.kind === "switch" || data.kind === "dwell" || data.kind === "ok"
      ? data.kind
      : arMotorKindFromFlags({ switchOn, dwell });
  return {
    kind,
    switchOn,
    dwell,
    valid: data.valid === true,
  };
}

export type ArMotorArm = { dispose: () => void };

export function arMotorArm(opts: {
  product: ArMotorProduct;
  getNative?: () => Promise<ArMotorState | null>;
  onKind: (kind: ArMotorKind, coach: string | null) => void;
  root?: Element | null;
  intervalMs?: number;
  now?: () => number;
}): ArMotorArm {
  const nowFn = opts.now ?? Date.now;
  let hold: ArMotorHold | null = null;
  let alive = true;
  const apply = (raw: ArMotorKind) => {
    hold = arMotorStep(hold, raw, nowFn());
    arMotorApplyClass(opts.root ?? null, hold.kind);
    opts.onKind(hold.kind, arMotorCoach(hold.kind, opts.product));
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
    const web = arMotorReadWeb();
    apply(web.valid ? arMotorKindFromFlags(web) : (hold?.raw ?? "ok"));
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
      arMotorApplyClass(opts.root ?? null, "ok");
    },
  };
}
