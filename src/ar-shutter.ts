/** Hardware shutter: volume, camera, and Bluetooth remotes place at view center. */

export const AR_SHUTTER_COOLDOWN_MS = 450;
export const AR_SHUTTER_NORM = { x: 0.5, y: 0.5 } as const;

export type ArShutterKind = "place" | "scan" | "cubes";
export type ArShutterSource = "volume" | "media" | "camera" | "unknown";

const VOLUME_KEYS = new Set([
  "AudioVolumeUp",
  "AudioVolumeDown",
  "VolumeUp",
  "VolumeDown",
]);
const MEDIA_KEYS = new Set([
  "MediaPlayPause",
  "MediaPlay",
  "MediaSelect",
]);
const CAMERA_KEYS = new Set(["Camera"]);

const VOLUME_CODES = new Set(["VolumeUp", "VolumeDown", "AudioVolumeUp", "AudioVolumeDown"]);
const MEDIA_CODES = new Set(["MediaPlayPause", "MediaPlay", "MediaSelect"]);

/** Android KeyEvent keycodes used by volume, headset, and camera remotes. */
export const AR_SHUTTER_ANDROID_VOLUME = new Set([24, 25]);
export const AR_SHUTTER_ANDROID_MEDIA = new Set([79, 85, 126, 127]);
export const AR_SHUTTER_ANDROID_CAMERA = new Set([27, 80]);

export function arShutterSourceFromKey(key: string, code = ""): ArShutterSource {
  if (VOLUME_KEYS.has(key) || VOLUME_CODES.has(code)) return "volume";
  if (MEDIA_KEYS.has(key) || MEDIA_CODES.has(code)) return "media";
  if (CAMERA_KEYS.has(key) || code === "Camera") return "camera";
  return "unknown";
}

export function arShutterSourceFromAndroidCode(code: number): ArShutterSource {
  if (AR_SHUTTER_ANDROID_VOLUME.has(code)) return "volume";
  if (AR_SHUTTER_ANDROID_MEDIA.has(code)) return "media";
  if (AR_SHUTTER_ANDROID_CAMERA.has(code)) return "camera";
  return "unknown";
}

export function arIsShutterKey(key: string, code = ""): boolean {
  return arShutterSourceFromKey(key, code) !== "unknown";
}

function asElement(
  target: EventTarget | null,
): { tagName: string; isContentEditable?: boolean; closest?: (sel: string) => unknown } | null {
  if (!target || typeof target !== "object") return null;
  const el = target as {
    tagName?: unknown;
    isContentEditable?: boolean;
    closest?: (sel: string) => unknown;
  };
  if (typeof el.tagName !== "string") return null;
  return el as { tagName: string; isContentEditable?: boolean; closest?: (sel: string) => unknown };
}

export function arShutterIsTyping(target: EventTarget | null): boolean {
  const el = asElement(target);
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return Boolean(el.isContentEditable);
}

export function arShouldShutter(e: {
  key: string;
  code?: string;
  repeat?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  target?: EventTarget | null;
}): boolean {
  if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return false;
  if (!arIsShutterKey(e.key, e.code ?? "")) return false;
  if (arShutterIsTyping(e.target ?? null)) return false;
  return true;
}

export function arShutterShouldFire(kind: ArShutterKind, placed: boolean): boolean {
  if (kind === "scan") return !placed;
  if (kind === "cubes") return true;
  return !placed;
}

export function arShutterCoach(opts: {
  placed?: boolean;
  kind?: ArShutterKind;
}): string | null {
  const kind = opts.kind ?? "place";
  if (kind === "scan") {
    return opts.placed ? null : "Volume simulates a find in the 3D view.";
  }
  if (kind === "cubes") return "Volume or a camera remote drops a cube.";
  if (opts.placed) return null;
  return "Volume or a camera remote places at the center.";
}

export function arShutterAccept(
  lastFire: number,
  now: number,
  cooldown = AR_SHUTTER_COOLDOWN_MS,
): { fire: boolean; lastFire: number } {
  if (lastFire > 0 && now - lastFire < cooldown) {
    return { fire: false, lastFire };
  }
  return { fire: true, lastFire: now };
}

export type ArShutterHandles = {
  dispose: () => void;
  notePlaced: (placed: boolean) => void;
};

type KeyBus = {
  add: (type: "keydown", fn: (ev: KeyboardEvent) => void) => void;
  remove: (type: "keydown", fn: (ev: KeyboardEvent) => void) => void;
};

export function arShutterArm(opts: {
  onShutter: (source: ArShutterSource) => void;
  canFire?: () => boolean;
  kind?: ArShutterKind;
  now?: () => number;
  keys?: KeyBus;
}): ArShutterHandles {
  const kind = opts.kind ?? "place";
  const now = opts.now ?? (() => Date.now());
  let placed = false;
  let lastFire = 0;
  let alive = true;

  const fire = (source: ArShutterSource) => {
    if (!alive) return;
    if (!arShutterShouldFire(kind, placed)) return;
    if (!(opts.canFire?.() ?? true)) return;
    const next = arShutterAccept(lastFire, now());
    lastFire = next.lastFire;
    if (!next.fire) return;
    opts.onShutter(source);
  };

  const onKey = (ev: KeyboardEvent) => {
    if (!arShouldShutter(ev)) return;
    ev.preventDefault();
    fire(arShutterSourceFromKey(ev.key, ev.code));
  };

  const keys =
    opts.keys ??
    (typeof window !== "undefined"
      ? {
          add: (type: "keydown", fn: (ev: KeyboardEvent) => void) =>
            window.addEventListener(type, fn),
          remove: (type: "keydown", fn: (ev: KeyboardEvent) => void) =>
            window.removeEventListener(type, fn),
        }
      : undefined);

  keys?.add("keydown", onKey);

  return {
    notePlaced(next) {
      placed = next;
    },
    dispose() {
      alive = false;
      keys?.remove("keydown", onKey);
    },
  };
}
