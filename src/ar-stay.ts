/**
 * Session-scoped stay-alive for AR.
 * Keeps the display on, locks the current orientation, and marks immersive
 * chrome so native plugins can hide system bars. Distinct from app-wide
 * keep-awake and from page-life teardown.
 */

export const AR_STAY_COPY = {
  rotate: "Turn your phone back to keep placing.",
} as const;

export type ArStayOrientation = "portrait" | "landscape" | "any";

export type ArStayOpts = {
  lockOrientation?: boolean;
  immersive?: boolean;
  keepAwake?: boolean;
};

export type ArStaySnapshot = {
  type?: string | null;
  angle?: number | null;
  innerWidth?: number;
  innerHeight?: number;
};

export type ArStayHandle = {
  orientation: ArStayOrientation;
  release: () => void;
};

const STAY_CLASS = "is-ar-stay";

export function arReadOrientation(input: ArStaySnapshot): ArStayOrientation {
  const type = (input.type ?? "").toLowerCase();
  if (type.startsWith("portrait")) return "portrait";
  if (type.startsWith("landscape")) return "landscape";
  const angle = input.angle ?? null;
  if (angle === 90 || angle === -90 || angle === 270) return "landscape";
  if (angle === 0 || angle === 180) return "portrait";
  const w = input.innerWidth ?? 0;
  const h = input.innerHeight ?? 0;
  if (w > 0 && h > 0) return w >= h ? "landscape" : "portrait";
  return "any";
}

export function arOrientationLockType(
  orientation: ArStayOrientation,
): "portrait" | "landscape" | null {
  return orientation === "any" ? null : orientation;
}

export function arStayMismatch(
  locked: ArStayOrientation,
  current: ArStayOrientation,
): boolean {
  if (locked === "any" || current === "any") return false;
  return locked !== current;
}

export function arStaySnapshot(): ArStaySnapshot {
  const snap: ArStaySnapshot = {};
  if (typeof screen !== "undefined") {
    const ori = (
      screen as { orientation?: { type?: string; angle?: number } }
    ).orientation;
    if (ori) {
      snap.type = ori.type;
      snap.angle = ori.angle;
    }
  }
  if (typeof window !== "undefined") {
    snap.innerWidth = window.innerWidth;
    snap.innerHeight = window.innerHeight;
    if (snap.angle == null) {
      const legacy = (window as { orientation?: number }).orientation;
      if (typeof legacy === "number") snap.angle = legacy;
    }
  }
  return snap;
}

type WakeHandle = { release: () => void };

function tryWakeLock(): Promise<WakeHandle | null> {
  const nav = typeof navigator === "undefined" ? undefined : navigator;
  const lockApi = (
    nav as { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }
  )?.wakeLock;
  if (!lockApi) return Promise.resolve(null);
  return lockApi
    .request("screen")
    .then((sent) => ({
      release: () => {
        void sent.release();
      },
    }))
    .catch(() => null);
}

function tryLockOrientation(type: "portrait" | "landscape"): void {
  const ori = (
    typeof screen === "undefined"
      ? undefined
      : (screen as { orientation?: { lock?: (t: string) => Promise<void> } })
          .orientation
  );
  if (!ori?.lock) return;
  void ori.lock(type).catch(() => undefined);
}

function tryUnlockOrientation(): void {
  const ori = (
    typeof screen === "undefined"
      ? undefined
      : (screen as { orientation?: { unlock?: () => void } }).orientation
  );
  try {
    ori?.unlock?.();
  } catch {
    /* not locked / unsupported */
  }
}

export function arStay(opts: ArStayOpts = {}): ArStayHandle {
  const lockOrientation = opts.lockOrientation !== false;
  const immersive = opts.immersive !== false;
  const keepAwake = opts.keepAwake !== false;
  const orientation = arReadOrientation(arStaySnapshot());
  let released = false;
  let wake: WakeHandle | null = null;

  if (immersive && typeof document !== "undefined") {
    document.documentElement.classList.add(STAY_CLASS);
    document.body?.classList.add(STAY_CLASS);
  }

  if (keepAwake) {
    void tryWakeLock().then((handle) => {
      if (released) {
        handle?.release();
        return;
      }
      wake = handle;
    });
  }

  if (lockOrientation) {
    const type = arOrientationLockType(orientation);
    if (type) tryLockOrientation(type);
  }

  return {
    orientation,
    release() {
      if (released) return;
      released = true;
      wake?.release();
      wake = null;
      if (typeof document !== "undefined") {
        document.documentElement.classList.remove(STAY_CLASS);
        document.body?.classList.remove(STAY_CLASS);
      }
      tryUnlockOrientation();
    },
  };
}
