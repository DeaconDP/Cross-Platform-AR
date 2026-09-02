/** Last successful cube tap — replayed when tracking becomes ready again. */

export type LastPlace = {
  x: number;
  y: number;
  scale: number;
  t: number;
};

const KEY = "cube.ar.lastPlace";
const TTL_MS = 2 * 60 * 60 * 1000;

export function saveLastPlace(x: number, y: number, now = Date.now()): void {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ x, y, scale: 1, t: now } satisfies LastPlace),
    );
  } catch {
    /* quota / private mode */
  }
}

export function readLastPlace(now = Date.now()): LastPlace | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LastPlace>;
    if (
      typeof parsed.x !== "number" ||
      typeof parsed.y !== "number" ||
      typeof parsed.t !== "number"
    ) {
      localStorage.removeItem(KEY);
      return null;
    }
    if (now - parsed.t > TTL_MS) {
      localStorage.removeItem(KEY);
      return null;
    }
    return { x: parsed.x, y: parsed.y, scale: 1, t: parsed.t };
  } catch {
    return null;
  }
}
