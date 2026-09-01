type WakeLockSentinelLike = { release: () => Promise<void> };

/**
 * Keep the screen on during a browser AR session.
 * Native Android already sets keepScreenOn; iOS native uses idleTimerDisabled.
 */
export async function acquireWakeLock(): Promise<() => void> {
  const nav = navigator as Navigator & {
    wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
  };
  if (!nav.wakeLock) return () => {};
  try {
    const lock = await nav.wakeLock.request("screen");
    return () => {
      void lock.release();
    };
  } catch {
    return () => {};
  }
}
