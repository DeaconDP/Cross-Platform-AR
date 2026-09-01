const ORIENT_MS = 280;

let orientUntil = 0;

export function markOrientationDirty(): void {
  orientUntil = Date.now() + ORIENT_MS;
}

export function isOrientationSettled(): boolean {
  return Date.now() >= orientUntil;
}

export function installOrientationGate(): () => void {
  const bump = () => markOrientationDirty();
  window.addEventListener("orientationchange", bump);
  window.addEventListener("resize", bump);
  return () => {
    window.removeEventListener("orientationchange", bump);
    window.removeEventListener("resize", bump);
  };
}
