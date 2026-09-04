export type ArNetKind = "ok" | "offline" | "slow" | "captive";
export type ArNetProduct = "place" | "scan" | "cubes" | "emily";
export type ArNetType = "wifi" | "cellular" | "ethernet" | "none" | "unknown";

export type ArNetSample = {
  supported?: boolean;
  online?: boolean;
  type?: ArNetType;
  downlinkMbps?: number | null;
  rttMs?: number | null;
  captive?: boolean;
  constrained?: boolean;
};

/** Below this, a validated link is still too thin to wait on a remote GLB. */
export const AR_NET_SLOW_DOWNLINK_MBPS = 0.4;
export const AR_NET_SLOW_RTT_MS = 800;
export const AR_NET_HOLD_MS = 500;
export const AR_NET_POLL_MS = 800;

export const AR_NET_FETCH_OK_MS = 8000;
export const AR_NET_FETCH_SLOW_MS = 14000;
export const AR_NET_FETCH_CAPTIVE_MS = 3500;
export const AR_NET_FETCH_OFFLINE_ONBOARD_MS = 2500;

export function arJudgeNet(sample: ArNetSample): ArNetKind {
  if (sample.supported === false) return "ok";
  if (sample.captive) return "captive";
  if (sample.online === false || sample.type === "none") return "offline";
  if (sample.constrained) return "slow";
  if (
    typeof sample.downlinkMbps === "number" &&
    Number.isFinite(sample.downlinkMbps) &&
    sample.downlinkMbps > 0 &&
    sample.downlinkMbps < AR_NET_SLOW_DOWNLINK_MBPS
  ) {
    return "slow";
  }
  if (
    typeof sample.rttMs === "number" &&
    Number.isFinite(sample.rttMs) &&
    sample.rttMs >= AR_NET_SLOW_RTT_MS
  ) {
    return "slow";
  }
  return "ok";
}

export function arNetCoach(kind: ArNetKind, product: ArNetProduct): string {
  if (kind === "ok") return "";
  if (kind === "offline") {
    if (product === "emily") return "I'll use the copy I already have — no signal.";
    if (product === "scan") return "No signal — using the saved model.";
    if (product === "cubes") return "Offline — using the cube already on this phone.";
    return "No signal — using the fossil already on this phone.";
  }
  if (kind === "captive") {
    if (product === "emily") return "Wi-Fi wants a login — I'll keep using the saved me.";
    if (product === "scan") return "Wi-Fi needs a login — using the saved model.";
    if (product === "cubes") return "Wi-Fi needs a sign-in — using the onboard cube.";
    return "Wi-Fi needs a sign-in — using the fossil already saved.";
  }
  if (product === "emily") return "Slow connection — I'll keep going with what's already here.";
  if (product === "scan") return "Slow Wi-Fi — hang on, or we'll use the saved model.";
  if (product === "cubes") return "Slow network — the cube is already on the phone.";
  return "Slow Wi-Fi — the fossil is already on this phone.";
}

export function arNetIsOnboard(url: string, origin?: string): boolean {
  if (!url) return false;
  if (
    url.startsWith("capacitor://") ||
    url.startsWith("ionic://") ||
    url.startsWith("file:") ||
    url.startsWith("content://")
  ) {
    return true;
  }
  if (url.startsWith("/") && !url.startsWith("//")) return true;
  if (url.startsWith("./") || url.startsWith("../")) return true;
  if (origin && url.startsWith(origin)) return true;
  return false;
}

export function arNetFetchMs(kind: ArNetKind, onboard: boolean): number {
  if (onboard) {
    return kind === "offline" || kind === "captive"
      ? AR_NET_FETCH_OFFLINE_ONBOARD_MS
      : AR_NET_FETCH_OK_MS;
  }
  if (kind === "offline") return 0;
  if (kind === "captive") return AR_NET_FETCH_CAPTIVE_MS;
  if (kind === "slow") return AR_NET_FETCH_SLOW_MS;
  return AR_NET_FETCH_OK_MS;
}

export function arNetShouldSkipRemote(kind: ArNetKind, onboard: boolean): boolean {
  return !onboard && (kind === "offline" || kind === "captive");
}

export function arMergeNetSample(
  prev: ArNetSample,
  next: ArNetSample,
): ArNetSample {
  return { ...prev, ...next };
}

export type ArNetFetchResult<T> = {
  ok: boolean;
  timedOut: boolean;
  skipped: boolean;
  value?: T;
};

export async function arFetchWithBudget<T>(opts: {
  kind: ArNetKind;
  url: string;
  origin?: string;
  budgetMs?: number;
  fetchFn: (
    url: string,
    init: { signal?: AbortSignal },
  ) => Promise<T>;
}): Promise<ArNetFetchResult<T>> {
  const onboard = arNetIsOnboard(opts.url, opts.origin);
  if (arNetShouldSkipRemote(opts.kind, onboard)) {
    return { ok: false, timedOut: false, skipped: true };
  }
  const ms = opts.budgetMs ?? arNetFetchMs(opts.kind, onboard);
  if (ms <= 0) {
    return { ok: false, timedOut: false, skipped: true };
  }
  const ctl =
    typeof AbortController !== "undefined" ? new AbortController() : null;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctl?.abort();
  }, ms);
  try {
    const value = await opts.fetchFn(opts.url, { signal: ctl?.signal });
    return { ok: true, timedOut: false, skipped: false, value };
  } catch {
    return { ok: false, timedOut, skipped: false };
  } finally {
    clearTimeout(timer);
  }
}

export type ArNetArm = {
  note: (sample: ArNetSample) => ArNetKind;
  kind: () => ArNetKind;
  dispose: () => void;
};

export function arArmNet(opts: {
  product: ArNetProduct;
  poll?: () => Promise<ArNetSample | null> | ArNetSample | null;
  onKind?: (kind: ArNetKind, coach: string) => void;
  intervalMs?: number;
  holdMs?: number;
  now?: () => number;
  setIntervalFn?: (fn: () => void, ms: number) => number;
  clearIntervalFn?: (id: number) => void;
}): ArNetArm {
  const now = opts.now ?? (() => Date.now());
  const setInt =
    opts.setIntervalFn ??
    ((fn, ms) => globalThis.setInterval(fn, ms) as unknown as number);
  const clearInt =
    opts.clearIntervalFn ?? ((id) => globalThis.clearInterval(id));
  const holdNeed = opts.holdMs ?? AR_NET_HOLD_MS;
  let last: ArNetSample = {};
  let kind: ArNetKind = "ok";
  let pending: ArNetKind = "ok";
  let holdSince = 0;
  let disposed = false;

  const emit = (next: ArNetKind) => {
    if (kind === next) return;
    kind = next;
    opts.onKind?.(next, arNetCoach(next, opts.product));
  };

  const consider = (sample: ArNetSample): ArNetKind => {
    if (disposed) return kind;
    last = arMergeNetSample(last, sample);
    const next = arJudgeNet(last);
    if (next !== pending) {
      pending = next;
      holdSince = now();
    }
    if (next === "ok") {
      emit("ok");
      return "ok";
    }
    if (now() - holdSince < holdNeed) return kind;
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
      consider(result as ArNetSample);
    } catch {
      /* poll is best-effort */
    }
  };

  const interval = opts.poll
    ? setInt(tick, opts.intervalMs ?? AR_NET_POLL_MS)
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

type BrowserConnection = {
  type?: string;
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  addEventListener?: (type: string, fn: () => void) => void;
  removeEventListener?: (type: string, fn: () => void) => void;
};

function mapConnType(type?: string): ArNetType {
  if (type === "wifi" || type === "cellular" || type === "ethernet" || type === "none") {
    return type;
  }
  return "unknown";
}

/** Navigator.onLine + Network Information API. Native poll covers iOS WebView. */
export function arReadBrowserNet(
  nav: {
    onLine?: boolean;
    connection?: BrowserConnection;
  } | null = typeof navigator !== "undefined" ? navigator : null,
): ArNetSample {
  if (!nav) return { supported: false };
  const conn = nav.connection;
  return {
    supported: true,
    online: nav.onLine !== false,
    type: mapConnType(conn?.type),
    downlinkMbps: typeof conn?.downlink === "number" ? conn.downlink : null,
    rttMs: typeof conn?.rtt === "number" ? conn.rtt : null,
  };
}

export function arListenNet(
  note: (sample: ArNetSample) => void,
  target: {
    addEventListener: (type: string, fn: () => void) => void;
    removeEventListener: (type: string, fn: () => void) => void;
    navigator?: {
      onLine?: boolean;
      connection?: BrowserConnection;
    };
  } | null = typeof window !== "undefined" ? window : null,
): () => void {
  if (!target) return () => undefined;
  const read = () =>
    arReadBrowserNet(
      target.navigator ??
        (typeof navigator !== "undefined" ? navigator : null),
    );
  const onChange = () => note(read());
  target.addEventListener("online", onChange);
  target.addEventListener("offline", onChange);
  const conn =
    target.navigator?.connection ??
    (typeof navigator !== "undefined"
      ? (navigator as { connection?: BrowserConnection }).connection
      : undefined);
  conn?.addEventListener?.("change", onChange);
  return () => {
    target.removeEventListener("online", onChange);
    target.removeEventListener("offline", onChange);
    conn?.removeEventListener?.("change", onChange);
  };
}
