/** View-center place: keyboard, switch, and gamepad hit the camera middle. */

export const AR_CENTER_NORM = { x: 0.5, y: 0.5 } as const;

export function arIsPlaceKey(key: string): boolean {
  return key === " " || key === "Enter" || key === "Spacebar";
}

function asElement(
  target: EventTarget | null,
): { tagName: string; isContentEditable?: boolean; closest?: (sel: string) => unknown } | null {
  if (!target || typeof target !== "object") return null;
  const el = target as { tagName?: unknown; isContentEditable?: boolean; closest?: (sel: string) => unknown };
  if (typeof el.tagName !== "string") return null;
  return el as { tagName: string; isContentEditable?: boolean; closest?: (sel: string) => unknown };
}

export function arIsTypingTarget(target: EventTarget | null): boolean {
  const el = asElement(target);
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return Boolean(el.isContentEditable);
}

export function arIsChromeTarget(target: EventTarget | null): boolean {
  const el = asElement(target);
  if (!el) return false;
  if (arIsTypingTarget(target)) return true;
  if (typeof el.closest === "function" && el.closest("button, a, [role='button'], input, textarea, select, summary")) {
    return true;
  }
  return false;
}

export function arShouldCenterPlace(e: {
  key: string;
  repeat?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  target?: EventTarget | null;
}): boolean {
  if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return false;
  if (!arIsPlaceKey(e.key)) return false;
  if (arIsChromeTarget(e.target ?? null)) return false;
  return true;
}

export function arIsPlacePad(
  index: number,
  pressed: boolean,
  wasPressed: boolean,
): boolean {
  return index === 0 && pressed && !wasPressed;
}

export function arCenterPx(width: number, height: number): { x: number; y: number } {
  const w = Math.max(0, width);
  const h = Math.max(0, height);
  return { x: w / 2, y: h / 2 };
}

export function arCenterCoach(opts: {
  placed?: boolean;
  kind?: "place" | "scan";
}): string | null {
  if (opts.placed) return null;
  if (opts.kind === "scan") return "Point at the marker, or press Space.";
  return "Tap a surface, or press Space to place.";
}

export function arArmCenterPlace(opts: {
  isLive: () => boolean;
  onPlace: () => void;
}): () => void {
  const prev = new Map<number, boolean>();
  const onKey = (e: KeyboardEvent) => {
    if (!opts.isLive()) return;
    if (!arShouldCenterPlace(e)) return;
    e.preventDefault();
    opts.onPlace();
  };
  const poll = () => {
    if (!opts.isLive()) return;
    const pads =
      typeof navigator !== "undefined" && typeof navigator.getGamepads === "function"
        ? navigator.getGamepads()
        : [];
    for (const pad of pads) {
      if (!pad) continue;
      const pressed = Boolean(pad.buttons[0]?.pressed);
      const was = prev.get(pad.index) ?? false;
      prev.set(pad.index, pressed);
      if (arIsPlacePad(0, pressed, was)) opts.onPlace();
    }
  };
  window.addEventListener("keydown", onKey);
  const tick = window.setInterval(poll, 250);
  return () => {
    window.removeEventListener("keydown", onKey);
    window.clearInterval(tick);
    prev.clear();
  };
}
