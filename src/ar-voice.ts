/** Voice Control / Voice Access / full-keyboard steward — named targets still place, never block place. */

export type ArVoiceKind = "ok" | "keys" | "voice";
export type ArVoiceProduct = "place" | "scan" | "emily" | "cubes";

export const AR_VOICE_HOLD_MS = 400;
export const AR_VOICE_RELEASE_MS = 800;

export type ArVoiceHold = {
  kind: ArVoiceKind;
  raw: ArVoiceKind;
  since: number;
};

export type ArVoiceState = {
  kind: ArVoiceKind;
  voiceOn: boolean;
  keysOn: boolean;
  valid: boolean;
};

export function arVoiceKindFromFlags(flags: {
  voiceOn: boolean;
  keysOn: boolean;
}): ArVoiceKind {
  if (flags.voiceOn) return "voice";
  if (flags.keysOn) return "keys";
  return "ok";
}

/** Browsers have no Voice Control / Voice Access API — web is always ok when a window exists. */
export function arVoiceReadWeb(): {
  voiceOn: boolean;
  keysOn: boolean;
  valid: boolean;
} {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return { voiceOn: false, keysOn: false, valid: false };
  }
  return { voiceOn: false, keysOn: false, valid: true };
}

/** 400 ms into a warning; 800 ms back to ok. First sample stays ok. */
export function arVoiceStep(
  prev: ArVoiceHold | null,
  raw: ArVoiceKind,
  now: number,
): ArVoiceHold {
  if (!prev) return { kind: "ok", raw, since: now };
  if (raw === prev.raw) {
    if (raw !== prev.kind) {
      const need = raw === "ok" ? AR_VOICE_RELEASE_MS : AR_VOICE_HOLD_MS;
      if (now - prev.since >= need) return { kind: raw, raw, since: now };
    }
    return prev;
  }
  return { kind: prev.kind, raw, since: now };
}

export function arVoiceCoach(
  kind: ArVoiceKind,
  product: ArVoiceProduct,
): string | null {
  if (kind === "ok") return null;
  if (kind === "voice") {
    if (product === "scan") {
      return "Voice Control is on — say the plaque name; it still finds.";
    }
    if (product === "emily") {
      return "Voice Control is on — say Place, and I still land.";
    }
    if (product === "cubes") {
      return "Voice Control is on — say Place, and a cube still lands.";
    }
    return "Voice Control is on — say Place. A missed tap is the mic, not the camera.";
  }
  if (product === "scan") {
    return "A keyboard is driving this — Tab to the plaque, then Space finds it.";
  }
  if (product === "emily") {
    return "A keyboard is driving this — Tab to Place, then Space, and I land.";
  }
  if (product === "cubes") {
    return "A keyboard is driving this — Tab to Place, then Space, and a cube lands.";
  }
  return "A keyboard is driving this — Tab to Place, then press Space.";
}

/** Voice / keyboard aids never remap taps. Scan still hunts. */
export function arVoiceBlocksPlace(
  _kind: ArVoiceKind,
  _product: ArVoiceProduct,
): boolean {
  return false;
}

/** Spoken commands and keyboard focus need a named Place target. */
export function arVoicePrefersSelect(kind: ArVoiceKind): boolean {
  return kind === "voice" || kind === "keys";
}

export function arVoiceApplyClass(el: Element | null, kind: ArVoiceKind): void {
  if (!el) return;
  el.classList.toggle("is-ar-voice-voice", kind === "voice");
  el.classList.toggle("is-ar-voice-keys", kind === "keys");
}

export function arVoiceParseNative(data: {
  kind?: string;
  voiceOn?: boolean;
  keysOn?: boolean;
  valid?: boolean;
}): ArVoiceState {
  const voiceOn = data.voiceOn === true;
  const keysOn = data.keysOn === true;
  const kind: ArVoiceKind =
    data.kind === "voice" || data.kind === "keys" || data.kind === "ok"
      ? data.kind
      : arVoiceKindFromFlags({ voiceOn, keysOn });
  return {
    kind,
    voiceOn,
    keysOn,
    valid: data.valid === true,
  };
}

export type ArVoiceArm = { dispose: () => void };

export function arVoiceArm(opts: {
  product: ArVoiceProduct;
  getNative?: () => Promise<ArVoiceState | null>;
  onKind: (kind: ArVoiceKind, coach: string | null) => void;
  root?: Element | null;
  intervalMs?: number;
  now?: () => number;
}): ArVoiceArm {
  const nowFn = opts.now ?? Date.now;
  let hold: ArVoiceHold | null = null;
  let alive = true;
  const apply = (raw: ArVoiceKind) => {
    hold = arVoiceStep(hold, raw, nowFn());
    arVoiceApplyClass(opts.root ?? null, hold.kind);
    opts.onKind(hold.kind, arVoiceCoach(hold.kind, opts.product));
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
    const web = arVoiceReadWeb();
    apply(web.valid ? arVoiceKindFromFlags(web) : (hold?.raw ?? "ok"));
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
      arVoiceApplyClass(opts.root ?? null, "ok");
    },
  };
}
