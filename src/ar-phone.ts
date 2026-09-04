export type ArPhoneKind = "ok" | "ringing" | "active";
export type ArPhoneProduct = "place" | "scan" | "cubes" | "emily";
export type ArPhoneReason = "call" | "alarm" | "siri" | "focus" | "unknown";

export type ArPhoneSample = {
  supported?: boolean;
  ringing?: boolean;
  inCall?: boolean;
  interrupted?: boolean;
  reason?: ArPhoneReason;
  kind?: ArPhoneKind;
};

/** Ignore a one-frame ringtone blip. */
export const AR_PHONE_RING_HOLD_MS = 400;
/** Stay active this long before we treat it as a real call / Siri / alarm. */
export const AR_PHONE_ACTIVE_HOLD_MS = 800;
export const AR_PHONE_POLL_MS = 400;
/** Let the visitor read the coach before the overlay closes. */
export const AR_PHONE_CLOSE_MS = 1100;

export function arJudgePhone(sample: ArPhoneSample): ArPhoneKind {
  if (sample.supported === false) return "ok";
  if (sample.inCall) return "active";
  if (sample.interrupted) return "active";
  if (sample.ringing) return "ringing";
  return "ok";
}

export function arPhoneCoach(kind: ArPhoneKind, product: ArPhoneProduct): string {
  if (kind === "ok") return "";
  if (kind === "ringing") {
    if (product === "emily") return "Someone's calling — I'll wait.";
    if (product === "scan") return "Call coming in — hold the marker when you're back.";
    if (product === "cubes") return "Call coming in — cubes will wait.";
    return "Call coming in — AR will wait.";
  }
  if (product === "emily") return "Take the call — I'll be here when you're back.";
  if (product === "scan") return "Call — AR paused. Point at the plaque when you're back.";
  if (product === "cubes") return "Call — AR paused until you're done.";
  return "Call — AR paused. Come back when you're done.";
}

export function arPhoneBlocksPlace(kind: ArPhoneKind): boolean {
  return kind !== "ok";
}

export function arPhoneShouldClose(kind: ArPhoneKind): boolean {
  return kind === "active";
}

export function arPhoneHoldMs(kind: ArPhoneKind): number {
  if (kind === "ringing") return AR_PHONE_RING_HOLD_MS;
  if (kind === "active") return AR_PHONE_ACTIVE_HOLD_MS;
  return 0;
}

export function arMergePhoneSample(
  prev: ArPhoneSample,
  next: ArPhoneSample,
): ArPhoneSample {
  return { ...prev, ...next };
}

export type ArPhoneArm = {
  note: (sample: ArPhoneSample) => ArPhoneKind;
  kind: () => ArPhoneKind;
  dispose: () => void;
};

export function arArmPhone(opts: {
  product: ArPhoneProduct;
  poll?: () => Promise<ArPhoneSample | null> | ArPhoneSample | null;
  onKind?: (kind: ArPhoneKind, coach: string) => void;
  intervalMs?: number;
  now?: () => number;
  setIntervalFn?: (fn: () => void, ms: number) => number;
  clearIntervalFn?: (id: number) => void;
}): ArPhoneArm {
  const now = opts.now ?? (() => Date.now());
  const setInt =
    opts.setIntervalFn ??
    ((fn, ms) => globalThis.setInterval(fn, ms) as unknown as number);
  const clearInt =
    opts.clearIntervalFn ?? ((id) => globalThis.clearInterval(id));
  let last: ArPhoneSample = {};
  let kind: ArPhoneKind = "ok";
  let pending: ArPhoneKind = "ok";
  let holdSince = 0;
  let disposed = false;

  const emit = (next: ArPhoneKind) => {
    if (kind === next) return;
    kind = next;
    opts.onKind?.(next, arPhoneCoach(next, opts.product));
  };

  const consider = (sample: ArPhoneSample): ArPhoneKind => {
    if (disposed) return kind;
    last = arMergePhoneSample(last, sample);
    const next = arJudgePhone(last);
    if (next !== pending) {
      pending = next;
      holdSince = now();
    }
    if (next === "ok") {
      emit("ok");
      return "ok";
    }
    if (now() - holdSince < arPhoneHoldMs(next)) return kind;
    emit(next);
    return next;
  };

  const tick = () => {
    if (disposed) return;
    try {
      const result = opts.poll?.();
      if (result == null) return;
      if (typeof (result as { then?: unknown }).then === "function") {
        void Promise.resolve(result).then((sample) => {
          if (sample) consider(sample);
        });
        return;
      }
      consider(result as ArPhoneSample);
    } catch {
      /* poll is best-effort */
    }
  };

  const interval = opts.poll
    ? setInt(tick, opts.intervalMs ?? AR_PHONE_POLL_MS)
    : 0;

  return {
    note: consider,
    kind: () => kind,
    dispose: () => {
      disposed = true;
      if (interval) clearInt(interval);
    },
  };
}

type BrowserAudio = {
  state?: string;
  addEventListener?: (type: string, fn: () => void) => void;
  removeEventListener?: (type: string, fn: () => void) => void;
  close?: () => Promise<void> | void;
};

export function arReadBrowserPhone(ctx?: BrowserAudio | null): ArPhoneSample {
  if (!ctx) return { supported: false };
  const interrupted = ctx.state === "interrupted";
  return {
    supported: true,
    interrupted,
    reason: interrupted ? "focus" : undefined,
  };
}

/** Safari sets AudioContext to `interrupted` during a call / Siri / alarm. */
export function arListenPhone(
  note: (sample: ArPhoneSample) => void,
  opts: { context?: BrowserAudio | null } = {},
): () => void {
  const Ctor =
    typeof globalThis !== "undefined"
      ? (
          globalThis as {
            AudioContext?: new () => BrowserAudio;
            webkitAudioContext?: new () => BrowserAudio;
          }
        ).AudioContext ??
        (
          globalThis as {
            webkitAudioContext?: new () => BrowserAudio;
          }
        ).webkitAudioContext
      : undefined;
  let ctx = opts.context ?? null;
  let owned = false;
  if (!ctx && Ctor) {
    try {
      ctx = new Ctor();
      owned = true;
    } catch {
      ctx = null;
    }
  }
  if (!ctx?.addEventListener) {
    note(arReadBrowserPhone(ctx));
    return () => undefined;
  }
  const onState = () => note(arReadBrowserPhone(ctx));
  ctx.addEventListener("statechange", onState);
  onState();
  return () => {
    ctx?.removeEventListener?.("statechange", onState);
    if (owned) {
      try {
        void ctx?.close?.();
      } catch {
        /* already closed */
      }
    }
  };
}
