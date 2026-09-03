/** Stale-event fencing, visibility-gated starts, and availability memo. */

export type ArSessionStamp = {
  sessionId?: string | number | null;
};

export const AR_AVAIL_HIT_TTL_MS = 45_000;
export const AR_AVAIL_MISS_TTL_MS = 1_000;
export const AR_VISIBLE_WAIT_MS = 8_000;

export function createArSessionEpoch() {
  let seq = 0;
  let live = 0;
  let bound: string | null = null;

  return {
    begin(): number {
      seq += 1;
      live = seq;
      bound = null;
      return live;
    },

    bind(token: number, sessionId?: string | number | null): void {
      if (token !== live) return;
      if (sessionId == null || sessionId === "") return;
      bound = String(sessionId);
    },

    end(token?: number): void {
      if (token == null || token === live) {
        live = 0;
        bound = null;
      }
    },

    current(): number {
      return live;
    },

    isCurrent(token: number): boolean {
      return live !== 0 && token === live;
    },

    accept(token: number, event?: ArSessionStamp | null): boolean {
      if (live === 0 || token !== live) return false;
      const sid = event?.sessionId;
      if (bound == null) {
        return sid == null || sid === "";
      }
      if (sid == null || sid === "") return false;
      return String(sid) === bound;
    },
  };
}

export type ArAvailResult = {
  available?: boolean;
  supported?: boolean;
};

export function createArAvailabilityMemo<T extends ArAvailResult>(opts?: {
  hitTtlMs?: number;
  missTtlMs?: number;
  now?: () => number;
}) {
  const hitTtl = opts?.hitTtlMs ?? AR_AVAIL_HIT_TTL_MS;
  const missTtl = opts?.missTtlMs ?? AR_AVAIL_MISS_TTL_MS;
  const now = opts?.now ?? Date.now;
  let cached: { at: number; value: T; hit: boolean } | null = null;

  const hitOf = (value: T) => value.available === true || value.supported === true;

  return {
    async probe(fn: () => Promise<T>): Promise<T> {
      const t = now();
      if (cached && t - cached.at < (cached.hit ? hitTtl : missTtl)) {
        return cached.value;
      }
      const value = await fn();
      cached = { at: now(), value, hit: hitOf(value) };
      return value;
    },
    invalidate() {
      cached = null;
    },
  };
}

export type VisibleWaitDeps = {
  hidden?: () => boolean;
  subscribe?: (cb: () => void) => () => void;
  delay?: (ms: number, cb: () => void) => () => void;
};

export async function whenDocumentVisible(
  timeoutMs: number = AR_VISIBLE_WAIT_MS,
  deps: VisibleWaitDeps = {},
): Promise<"already" | "visible" | "timeout"> {
  const hidden =
    deps.hidden ?? (() => typeof document !== "undefined" && document.hidden);
  if (!hidden()) return "already";

  const delay =
    deps.delay ??
    ((ms, cb) => {
      const timer = setTimeout(cb, ms);
      return () => clearTimeout(timer);
    });

  const subscribe =
    deps.subscribe ??
    ((cb) => {
      if (typeof document === "undefined") return () => {};
      const onVis = () => {
        if (!document.hidden) cb();
      };
      document.addEventListener("visibilitychange", onVis);
      return () => document.removeEventListener("visibilitychange", onVis);
    });

  return new Promise((resolve) => {
    let settled = false;
    let unsubVis = () => {};
    let unsubTimer = () => {};
    const finish = (why: "visible" | "timeout") => {
      if (settled) return;
      settled = true;
      unsubVis();
      unsubTimer();
      resolve(why);
    };
    unsubVis = subscribe(() => {
      if (!hidden()) finish("visible");
    });
    unsubTimer = delay(timeoutMs, () => finish("timeout"));
  });
}
