const AVAIL_TTL_MS = 4000;

let availAt = 0;
let availValue: { supported: boolean; backend: "arkit" | "arcore" | "none" } | null =
  null;
let startToken = 0;

export function isArForeground(): boolean {
  return typeof document === "undefined" || !document.hidden;
}

export function nextArStartToken(): number {
  startToken += 1;
  return startToken;
}

export function invalidateArStarts(): void {
  startToken += 1;
}

export function isCurrentArStart(token: number): boolean {
  return token === startToken;
}

export async function cachedNativeSupport(
  probe: () => Promise<{
    supported: boolean;
    backend: "arkit" | "arcore" | "none";
  }>,
): Promise<{ supported: boolean; backend: "arkit" | "arcore" | "none" }> {
  const now = Date.now();
  if (availValue && now - availAt < AVAIL_TTL_MS) return availValue;
  const value = await probe();
  availAt = Date.now();
  availValue = value;
  return value;
}
