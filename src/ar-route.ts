export type ArRouteKind = "speaker" | "wired" | "bluetooth" | "unknown";
export type ArRouteChange = "none" | "to-headset" | "to-speaker";
export type ArRoutePlatform = "ios" | "android" | "web";
export type ArRouteProduct = "place" | "scan" | "emily" | "cubes";

export type ArRouteSample = {
  kind: ArRouteKind;
  outputs: number;
  wired: boolean;
  bluetooth: boolean;
  speaker: boolean;
  mono: boolean;
};

export type ArRouteNative = {
  kind?: string;
  outputs?: number;
  wired?: boolean;
  bluetooth?: boolean;
  speaker?: boolean;
  mono?: boolean;
};

export type ArRouteJudge = {
  kind: ArRouteKind;
  change: ArRouteChange;
  mono: boolean;
  duckSpeaker: boolean;
  coach: string;
};

export const AR_ROUTE_HOLD_UP_MS = 400;
export const AR_ROUTE_HOLD_DOWN_MS = 800;
export const AR_ROUTE_POLL_MS = 1500;

const RANK: Record<ArRouteKind, number> = {
  unknown: 0,
  speaker: 1,
  wired: 2,
  bluetooth: 3,
};

export function arRouteRank(kind: ArRouteKind): number {
  return RANK[kind] ?? 0;
}

export function arKindFromFlags(flags: {
  wired: boolean;
  bluetooth: boolean;
  speaker: boolean;
}): ArRouteKind {
  if (flags.bluetooth) return "bluetooth";
  if (flags.wired) return "wired";
  if (flags.speaker) return "speaker";
  return "unknown";
}

export function arParseRouteKind(raw: string | null | undefined): ArRouteKind {
  if (raw === "wired" || raw === "bluetooth" || raw === "speaker") return raw;
  return "unknown";
}

export function arRouteChange(
  prev: ArRouteKind,
  next: ArRouteKind,
): ArRouteChange {
  if (prev === "unknown" || prev === next) return "none";
  const prevHeadset = prev === "wired" || prev === "bluetooth";
  const nextHeadset = next === "wired" || next === "bluetooth";
  if (prevHeadset && next === "speaker") return "to-speaker";
  if (!prevHeadset && nextHeadset) return "to-headset";
  return "none";
}

export function arRouteCoach(
  change: ArRouteChange,
  product: ArRouteProduct,
  mono: boolean,
): string {
  if (change === "to-speaker") {
    if (product === "emily") {
      return "Headphones out — I’m on the speaker now.";
    }
    if (product === "scan") {
      return "Headphones out — marker sound is on the speaker.";
    }
    if (product === "cubes") {
      return "Headphones out — sound moved to the speaker.";
    }
    return "Headphones unplugged — sound moved to the speaker.";
  }
  if (change === "to-headset") {
    if (product === "emily") return "I’ll talk in your headphones.";
    if (product === "scan") return "Sound is in your headphones — keep looking.";
    if (product === "cubes") return "Sound is in your headphones.";
    return "Sound is in your headphones.";
  }
  if (mono) {
    if (product === "emily") return "Hearing is set to one ear — I’ll keep talking.";
    return "Hearing is set to one ear — sound is mixed.";
  }
  return "";
}

export function arJudgeRoute(
  sample: ArRouteSample,
  prev: ArRouteKind,
): ArRouteJudge {
  const kind = arKindFromFlags(sample);
  const change = arRouteChange(prev, kind);
  return {
    kind,
    change,
    mono: sample.mono,
    duckSpeaker: change === "to-speaker",
    coach: arRouteCoach(change, "place", sample.mono),
  };
}

export function arRouteProfile(
  sample: ArRouteSample,
  prev: ArRouteKind,
  product: ArRouteProduct,
): ArRouteJudge {
  const kind = arKindFromFlags(sample);
  const change = arRouteChange(prev, kind);
  return {
    kind,
    change,
    mono: sample.mono,
    duckSpeaker: change === "to-speaker",
    coach: arRouteCoach(change, product, sample.mono),
  };
}

export function arHoldRoute(args: {
  shown: ArRouteKind;
  raw: ArRouteKind;
  heldMs: number;
}): ArRouteKind {
  if (args.raw === args.shown) return args.shown;
  const up = arRouteRank(args.raw) > arRouteRank(args.shown);
  const need = up ? AR_ROUTE_HOLD_UP_MS : AR_ROUTE_HOLD_DOWN_MS;
  return args.heldMs >= need ? args.raw : args.shown;
}

export function arParseRouteEvent(
  data: ArRouteNative | null | undefined,
): ArRouteSample {
  const wired = Boolean(data?.wired);
  const bluetooth = Boolean(data?.bluetooth);
  const speaker = Boolean(data?.speaker);
  const fromFlags = arKindFromFlags({ wired, bluetooth, speaker });
  const kind =
    fromFlags !== "unknown" ? fromFlags : arParseRouteKind(data?.kind);
  const outputs =
    typeof data?.outputs === "number" && Number.isFinite(data.outputs)
      ? data.outputs
      : 0;
  return {
    kind,
    outputs,
    wired: wired || kind === "wired",
    bluetooth: bluetooth || kind === "bluetooth",
    speaker: speaker || kind === "speaker",
    mono: Boolean(data?.mono),
  };
}

export function arKindFromDeviceLabel(label: string): ArRouteKind {
  const s = label.toLowerCase();
  if (!s) return "unknown";
  if (
    /airpods|beats|galaxy buds|buds|bluetooth|a2dp|sco|hearing aid|hfp/.test(s)
  ) {
    return "bluetooth";
  }
  if (/headphone|headset|earbud|earphone|usb audio|wired/.test(s)) {
    return "wired";
  }
  if (/speaker|macbook|built-in/.test(s)) return "speaker";
  return "unknown";
}

export function arSampleFromDeviceLabels(labels: string[]): ArRouteSample {
  let wired = false;
  let bluetooth = false;
  let speaker = false;
  for (const label of labels) {
    const kind = arKindFromDeviceLabel(label);
    if (kind === "bluetooth") bluetooth = true;
    else if (kind === "wired") wired = true;
    else if (kind === "speaker") speaker = true;
  }
  const kind = arKindFromFlags({ wired, bluetooth, speaker });
  return {
    kind,
    outputs: labels.length,
    wired,
    bluetooth,
    speaker,
    mono: false,
  };
}

export function arApplyRouteClass(
  el: HTMLElement | null | undefined,
  kind: ArRouteKind,
): void {
  if (!el) return;
  el.classList.toggle("is-ar-route-headset", kind === "wired" || kind === "bluetooth");
  el.classList.toggle("is-ar-route-speaker", kind === "speaker");
  el.classList.toggle("is-ar-route-bluetooth", kind === "bluetooth");
}

export function arClearRouteClass(el: HTMLElement | null | undefined): void {
  if (!el) return;
  el.classList.remove(
    "is-ar-route-headset",
    "is-ar-route-speaker",
    "is-ar-route-bluetooth",
  );
}

export function arRoutePlatformFromCap(platform: string): ArRoutePlatform {
  if (platform === "ios") return "ios";
  if (platform === "android") return "android";
  return "web";
}

export type ArRouteArmOpts = {
  product: ArRouteProduct;
  getNative?: () => Promise<ArRouteNative | null>;
  onChange?: (judge: ArRouteJudge) => void;
  pollMs?: number;
  root?: HTMLElement | null;
};

export type ArRouteHandle = {
  dispose: () => void;
  snapshot: () => ArRouteJudge;
  pushNative: (data: ArRouteNative | null) => void;
};

export function arArmRoute(opts: ArRouteArmOpts): ArRouteHandle {
  const product = opts.product;
  const pollMs = opts.pollMs ?? AR_ROUTE_POLL_MS;
  const root =
    opts.root ??
    (typeof document !== "undefined" ? document.documentElement : null);

  let disposed = false;
  let sample: ArRouteSample = {
    kind: "unknown",
    outputs: 0,
    wired: false,
    bluetooth: false,
    speaker: false,
    mono: false,
  };
  let shown: ArRouteKind = "unknown";
  let pending: ArRouteKind = "unknown";
  let pendingSince = 0;
  let judge: ArRouteJudge = {
    kind: "unknown",
    change: "none",
    mono: false,
    duckSpeaker: false,
    coach: "",
  };
  let poll = 0;
  let deviceListen: (() => void) | null = null;

  const nowMs = () =>
    typeof performance !== "undefined" ? performance.now() : Date.now();

  const publish = (now: number, force = false) => {
    const raw = arKindFromFlags(sample);
    if (raw !== pending) {
      pending = raw;
      pendingSince = now;
    }
    const next = arHoldRoute({
      shown,
      raw,
      heldMs: now - pendingSince,
    });
    if (!force && next === shown && next === judge.kind && sample.mono === judge.mono) {
      return;
    }
    const prev = shown;
    shown = next;
    judge = arRouteProfile({ ...sample, kind: next }, prev, product);
    arApplyRouteClass(root, shown);
    opts.onChange?.(judge);
  };

  const applySample = (next: ArRouteSample, force = false) => {
    sample = next;
    publish(nowMs(), force);
  };

  const pullNative = () => {
    if (disposed) return;
    if (!opts.getNative) {
      void pullWeb();
      return;
    }
    void opts
      .getNative()
      .then((data) => {
        if (disposed) return;
        if (!data) {
          void pullWeb();
          return;
        }
        applySample(arParseRouteEvent(data));
      })
      .catch(() => {
        if (!disposed) void pullWeb();
      });
  };

  const pullWeb = async () => {
    if (disposed) return;
    const nav = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (!nav?.enumerateDevices) return;
    try {
      const devices = await nav.enumerateDevices();
      const labels = devices
        .filter((d) => d.kind === "audiooutput")
        .map((d) => d.label);
      applySample(arSampleFromDeviceLabels(labels));
    } catch {
      /* labels often empty without a prior permission */
    }
  };

  pullNative();
  void pullWeb();
  if (typeof window !== "undefined") {
    poll = window.setInterval(() => {
      pullNative();
      void pullWeb();
    }, pollMs);
    const devices = navigator.mediaDevices;
    if (devices?.addEventListener) {
      const onChange = () => {
        pullNative();
        void pullWeb();
      };
      devices.addEventListener("devicechange", onChange);
      deviceListen = () => devices.removeEventListener("devicechange", onChange);
    }
  }

  return {
    dispose() {
      disposed = true;
      if (poll && typeof window !== "undefined") {
        window.clearInterval(poll);
      }
      deviceListen?.();
      arClearRouteClass(root);
    },
    snapshot: () => judge,
    pushNative(data) {
      if (disposed || !data) return;
      applySample(arParseRouteEvent(data));
    },
  };
}
