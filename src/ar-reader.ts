/** TalkBack / VoiceOver / spoken-feedback steward — remapped explore taps. */

export type ArReaderKind = "ok" | "speak" | "explore";
export type ArReaderProduct = "place" | "scan" | "emily" | "cubes";

export const AR_READER_HOLD_MS = 400;
export const AR_READER_RELEASE_MS = 800;

export type ArReaderHold = {
  kind: ArReaderKind;
  raw: ArReaderKind;
  since: number;
};

export type ArReaderState = {
  kind: ArReaderKind;
  explore: boolean;
  speak: boolean;
  valid: boolean;
};

export function arReaderKindFromFlags(flags: {
  explore: boolean;
  speak: boolean;
}): ArReaderKind {
  if (flags.explore) return "explore";
  if (flags.speak) return "speak";
  return "ok";
}

/** VoiceOver / TalkBack are native. No web media query — stay invalid. */
export function arReaderReadWeb(): {
  explore: boolean;
  speak: boolean;
  valid: boolean;
} {
  return { explore: false, speak: false, valid: false };
}

/** 400 ms into a warning; 800 ms back to ok. First sample stays ok. */
export function arReaderStep(
  prev: ArReaderHold | null,
  raw: ArReaderKind,
  now: number,
): ArReaderHold {
  if (!prev) return { kind: "ok", raw, since: now };
  if (raw === prev.raw) {
    if (raw !== prev.kind) {
      const need = raw === "ok" ? AR_READER_RELEASE_MS : AR_READER_HOLD_MS;
      if (now - prev.since >= need) return { kind: raw, raw, since: now };
    }
    return prev;
  }
  return { kind: prev.kind, raw, since: now };
}

export function arReaderCoach(
  kind: ArReaderKind,
  product: ArReaderProduct,
): string | null {
  if (kind === "ok") return null;
  if (kind === "explore") {
    if (product === "scan") {
      return "VoiceOver is on — hold still on the plaque. Double-tap Back when done.";
    }
    if (product === "emily") {
      return "VoiceOver remaps taps — turn it off so I can sit where you tap.";
    }
    if (product === "cubes") {
      return "TalkBack remaps taps — turn it off so the tap hits the table.";
    }
    return "TalkBack remaps taps — turn it off so your tap hits the table.";
  }
  if (product === "scan") {
    return "Spoken feedback is on — Back is labeled when you are done.";
  }
  if (product === "emily") {
    return "Spoken feedback is on — Place and Leave AR are labeled.";
  }
  if (product === "cubes") {
    return "Spoken feedback is on — Place and Exit are labeled.";
  }
  return "Spoken feedback is on — Back is labeled.";
}

/** Touch exploration remaps taps. Spoken-only does not. Scan still hunts. */
export function arReaderBlocksPlace(
  kind: ArReaderKind,
  product: ArReaderProduct,
): boolean {
  return kind === "explore" && product !== "scan";
}

export function arReaderApplyClass(el: Element | null, kind: ArReaderKind): void {
  if (!el) return;
  el.classList.toggle("is-ar-reader-explore", kind === "explore");
  el.classList.toggle("is-ar-reader-speak", kind === "speak");
}

export function arReaderParseNative(data: {
  kind?: string;
  explore?: boolean;
  speak?: boolean;
  valid?: boolean;
}): ArReaderState {
  const explore = data.explore === true;
  const speak = data.speak === true;
  const kind: ArReaderKind =
    data.kind === "speak" || data.kind === "explore" || data.kind === "ok"
      ? data.kind
      : arReaderKindFromFlags({ explore, speak });
  return {
    kind,
    explore,
    speak,
    valid: data.valid === true,
  };
}

export type ArReaderArm = { dispose: () => void };

export function arReaderArm(opts: {
  product: ArReaderProduct;
  getNative?: () => Promise<ArReaderState | null>;
  onKind: (kind: ArReaderKind, coach: string | null) => void;
  root?: Element | null;
  intervalMs?: number;
  now?: () => number;
}): ArReaderArm {
  const nowFn = opts.now ?? Date.now;
  let hold: ArReaderHold | null = null;
  let alive = true;
  const apply = (raw: ArReaderKind) => {
    hold = arReaderStep(hold, raw, nowFn());
    arReaderApplyClass(opts.root ?? null, hold.kind);
    opts.onKind(hold.kind, arReaderCoach(hold.kind, opts.product));
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
    const web = arReaderReadWeb();
    apply(web.valid ? arReaderKindFromFlags(web) : (hold?.raw ?? "ok"));
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
      arReaderApplyClass(opts.root ?? null, "ok");
    },
  };
}
