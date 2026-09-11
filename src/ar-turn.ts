/** Rotation-lock / sideways-hold steward — taps still place, never block place. */

export type ArTurnKind = "ok" | "lock" | "flip";
export type ArTurnProduct = "place" | "scan" | "emily" | "cubes";

export const AR_TURN_HOLD_MS = 400;
export const AR_TURN_RELEASE_MS = 800;

export type ArTurnHold = {
  kind: ArTurnKind;
  raw: ArTurnKind;
  since: number;
};

export type ArTurnState = {
  kind: ArTurnKind;
  flipOn: boolean;
  lockOn: boolean;
  valid: boolean;
};

export function arTurnKindFromFlags(flags: {
  flipOn: boolean;
  lockOn: boolean;
}): ArTurnKind {
  if (flags.flipOn) return "flip";
  if (flags.lockOn) return "lock";
  return "ok";
}

/** Screen vs viewport mismatch is flip; browsers have no rotation-lock API. */
export function arTurnReadWeb(): {
  flipOn: boolean;
  lockOn: boolean;
  valid: boolean;
} {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return { flipOn: false, lockOn: false, valid: false };
  }
  const viewportLandscape = window.innerWidth > window.innerHeight;
  let screenLandscape = viewportLandscape;
  try {
    const type = window.screen?.orientation?.type ?? "";
    if (type.includes("landscape")) screenLandscape = true;
    else if (type.includes("portrait")) screenLandscape = false;
    else if (typeof window.orientation === "number") {
      screenLandscape = Math.abs(window.orientation) === 90;
    }
  } catch {
    /* orientation API optional */
  }
  return {
    flipOn: screenLandscape !== viewportLandscape,
    lockOn: false,
    valid: true,
  };
}

/** 400 ms into a warning; 800 ms back to ok. First sample stays ok. */
export function arTurnStep(
  prev: ArTurnHold | null,
  raw: ArTurnKind,
  now: number,
): ArTurnHold {
  if (!prev) return { kind: "ok", raw, since: now };
  if (raw === prev.raw) {
    if (raw !== prev.kind) {
      const need = raw === "ok" ? AR_TURN_RELEASE_MS : AR_TURN_HOLD_MS;
      if (now - prev.since >= need) return { kind: raw, raw, since: now };
    }
    return prev;
  }
  return { kind: prev.kind, raw, since: now };
}

export function arTurnCoach(
  kind: ArTurnKind,
  product: ArTurnProduct,
): string | null {
  if (kind === "ok") return null;
  if (kind === "flip") {
    if (product === "scan") {
      return "Phone is sideways — turn it upright so the plaque stays in frame.";
    }
    if (product === "emily") {
      return "Phone is sideways — turn it upright so I land on the floor, not the wall.";
    }
    if (product === "cubes") {
      return "Phone is sideways — turn it upright so a cube sits on the table, not the wall.";
    }
    return "Phone is sideways — turn it upright so the fossil sits on the table, not the wall.";
  }
  if (product === "scan") {
    return "Rotation lock is on. Keep the phone upright so the plaque stays in frame.";
  }
  if (product === "emily") {
    return "Rotation lock is on. Keep the phone upright so I land on the floor.";
  }
  if (product === "cubes") {
    return "Rotation lock is on. Keep the phone upright so a cube sits on the table.";
  }
  return "Rotation lock is on. Keep the phone upright so taps land on the table.";
}

/** A sideways hold never remaps taps. Scan still hunts. */
export function arTurnBlocksPlace(
  _kind: ArTurnKind,
  _product: ArTurnProduct,
): boolean {
  return false;
}

/** Hosts can keep overlay chrome portrait-safe while lock/flip is on. */
export function arTurnPrefersUpright(kind: ArTurnKind): boolean {
  return kind === "flip" || kind === "lock";
}

export function arTurnApplyClass(el: Element | null, kind: ArTurnKind): void {
  if (!el) return;
  el.classList.toggle("is-ar-turn-flip", kind === "flip");
  el.classList.toggle("is-ar-turn-lock", kind === "lock");
}

export function arTurnParseNative(data: {
  kind?: string;
  flipOn?: boolean;
  lockOn?: boolean;
  valid?: boolean;
}): ArTurnState {
  const flipOn = data.flipOn === true;
  const lockOn = data.lockOn === true;
  const kind: ArTurnKind =
    data.kind === "flip" || data.kind === "lock" || data.kind === "ok"
      ? data.kind
      : arTurnKindFromFlags({ flipOn, lockOn });
  return {
    kind,
    flipOn,
    lockOn,
    valid: data.valid === true,
  };
}

export type ArTurnArm = { dispose: () => void };

export function arTurnArm(opts: {
  product: ArTurnProduct;
  getNative?: () => Promise<ArTurnState | null>;
  onKind: (kind: ArTurnKind, coach: string | null) => void;
  root?: Element | null;
  intervalMs?: number;
  now?: () => number;
}): ArTurnArm {
  const nowFn = opts.now ?? Date.now;
  let hold: ArTurnHold | null = null;
  let alive = true;
  const apply = (raw: ArTurnKind) => {
    hold = arTurnStep(hold, raw, nowFn());
    arTurnApplyClass(opts.root ?? null, hold.kind);
    opts.onKind(hold.kind, arTurnCoach(hold.kind, opts.product));
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
    const web = arTurnReadWeb();
    apply(web.valid ? arTurnKindFromFlags(web) : (hold?.raw ?? "ok"));
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
      arTurnApplyClass(opts.root ?? null, "ok");
    },
  };
}
