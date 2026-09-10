/** Palm / wet-contact steward — reject accidental fat or smear taps. */

export type ArPalmKind = "ok" | "fat" | "smear";
export type ArPalmProduct = "place" | "scan" | "emily" | "cubes";

export const AR_PALM_HOLD_MS = 400;
export const AR_PALM_RELEASE_MS = 800;
export const AR_PALM_FAT_PX = 48;
export const AR_PALM_FAT_MM = 12;
export const AR_PALM_SMEAR_POINTERS = 3;

export type ArPalmHold = {
  kind: ArPalmKind;
  raw: ArPalmKind;
  since: number;
};

export type ArPalmState = {
  kind: ArPalmKind;
  fat: boolean;
  smear: boolean;
  valid: boolean;
};

export type ArPalmContact = {
  widthPx?: number;
  heightPx?: number;
  majorPx?: number;
  majorMm?: number;
  pointers?: number;
};

export function arPalmKindFromFlags(flags: {
  fat: boolean;
  smear: boolean;
}): ArPalmKind {
  if (flags.smear) return "smear";
  if (flags.fat) return "fat";
  return "ok";
}

export function arPalmFromContact(contact: ArPalmContact): {
  fat: boolean;
  smear: boolean;
} {
  const w = contact.widthPx ?? 0;
  const h = contact.heightPx ?? 0;
  const majorPx = contact.majorPx ?? Math.max(w, h);
  const majorMm = contact.majorMm ?? 0;
  const pointers = contact.pointers ?? 1;
  const fat =
    majorMm >= AR_PALM_FAT_MM ||
    majorPx >= AR_PALM_FAT_PX ||
    Math.max(w, h) >= AR_PALM_FAT_PX;
  const smear = pointers >= AR_PALM_SMEAR_POINTERS;
  return { fat, smear };
}

let webContact: { fat: boolean; smear: boolean; valid: boolean } = {
  fat: false,
  smear: false,
  valid: false,
};

/** Last overlay contact. Hosts call this from pointer events. */
export function arPalmNoteWeb(flags: { fat: boolean; smear: boolean }): void {
  webContact = { fat: flags.fat, smear: flags.smear, valid: true };
}

export function arPalmReadWeb(): {
  fat: boolean;
  smear: boolean;
  valid: boolean;
} {
  return webContact;
}

/** 400 ms into a warning; 800 ms back to ok. First sample stays ok. */
export function arPalmStep(
  prev: ArPalmHold | null,
  raw: ArPalmKind,
  now: number,
): ArPalmHold {
  if (!prev) return { kind: "ok", raw, since: now };
  if (raw === prev.raw) {
    if (raw !== prev.kind) {
      const need = raw === "ok" ? AR_PALM_RELEASE_MS : AR_PALM_HOLD_MS;
      if (now - prev.since >= need) return { kind: raw, raw, since: now };
    }
    return prev;
  }
  return { kind: prev.kind, raw, since: now };
}

export function arPalmCoach(
  kind: ArPalmKind,
  product: ArPalmProduct,
): string | null {
  if (kind === "ok") return null;
  if (kind === "smear") {
    if (product === "scan") {
      return "Wet or extra fingers on the glass — lift, then keep hunting.";
    }
    if (product === "emily") {
      return "Wet or extra fingers on the glass — lift, then tap the floor.";
    }
    if (product === "cubes") {
      return "Wet or extra fingers on the glass — lift, then tap a surface.";
    }
    return "Wet or extra fingers on the glass — lift, then tap the table.";
  }
  if (product === "scan") {
    return "Heel of your hand is on the screen — lift it, then keep hunting.";
  }
  if (product === "emily") {
    return "Heel of your hand is on the screen — lift it, then tap the floor.";
  }
  if (product === "cubes") {
    return "Heel of your hand is on the screen — lift it, then tap a surface.";
  }
  return "Heel of your hand is on the screen — lift it, then tap the table.";
}

/** Fat / smear remaps place taps. Scan still hunts. */
export function arPalmBlocksPlace(
  kind: ArPalmKind,
  product: ArPalmProduct,
): boolean {
  return (kind === "fat" || kind === "smear") && product !== "scan";
}

export function arPalmApplyClass(
  el: Element | null,
  kind: ArPalmKind,
): void {
  if (!el) return;
  el.classList.toggle("is-ar-palm-fat", kind === "fat");
  el.classList.toggle("is-ar-palm-smear", kind === "smear");
}

export function arPalmParseNative(data: {
  kind?: string;
  fat?: boolean;
  smear?: boolean;
  valid?: boolean;
}): ArPalmState {
  const fat = data.fat === true;
  const smear = data.smear === true;
  const kind: ArPalmKind =
    data.kind === "fat" || data.kind === "smear" || data.kind === "ok"
      ? data.kind
      : arPalmKindFromFlags({ fat, smear });
  return {
    kind,
    fat,
    smear,
    valid: data.valid === true,
  };
}

export type ArPalmArm = { dispose: () => void };

export function arPalmArm(opts: {
  product: ArPalmProduct;
  getNative?: () => Promise<ArPalmState | null>;
  onKind: (kind: ArPalmKind, coach: string | null) => void;
  root?: Element | null;
  intervalMs?: number;
  now?: () => number;
}): ArPalmArm {
  const nowFn = opts.now ?? Date.now;
  let hold: ArPalmHold | null = null;
  let alive = true;
  const apply = (raw: ArPalmKind) => {
    hold = arPalmStep(hold, raw, nowFn());
    arPalmApplyClass(opts.root ?? null, hold.kind);
    opts.onKind(hold.kind, arPalmCoach(hold.kind, opts.product));
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
    const web = arPalmReadWeb();
    apply(web.valid ? arPalmKindFromFlags(web) : (hold?.raw ?? "ok"));
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
      arPalmApplyClass(opts.root ?? null, "ok");
      webContact = { fat: false, smear: false, valid: false };
    },
  };
}
