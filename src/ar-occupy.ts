/** Camera occupancy — one AR session per origin, plus getUserMedia error copy. */

export type ArMediaKind = "camera" | "mic";

export type ArMediaReason =
  | "ok"
  | "denied"
  | "busy"
  | "missing"
  | "insecure"
  | "yielded"
  | "failed";

export type ArOccupyHandle = {
  id: string;
  alive: () => boolean;
  release: () => void;
};

type OccupyMsg = { type: "claim" | "release"; id: string; at: number };

type LocalOwner = {
  id: string;
  at: number;
  onYield?: () => void;
};

const CHANNEL = "dale-ar-occupy";

let local: LocalOwner | null = null;
let channel: BroadcastChannel | null = null;

function ensureChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  if (!channel) {
    try {
      channel = new BroadcastChannel(CHANNEL);
      channel.onmessage = (ev: MessageEvent<OccupyMsg>) => {
        const msg = ev.data;
        if (!msg || !local || msg.type !== "claim" || msg.id === local.id) return;
        const cb = local.onYield;
        local = null;
        cb?.();
      };
    } catch {
      channel = null;
    }
  }
  return channel;
}

export function arOccupyReset(): void {
  local = null;
  try {
    channel?.close();
  } catch {
    /* already closed */
  }
  channel = null;
}

export function arOccupy(opts: {
  id?: string;
  onYield?: () => void;
} = {}): ArOccupyHandle {
  const id = opts.id ?? `ar-${Math.random().toString(36).slice(2, 10)}`;
  const at = Date.now();

  if (local && local.id !== id) {
    const prev = local;
    local = null;
    prev.onYield?.();
  }

  local = { id, at, onYield: opts.onYield };
  const ch = ensureChannel();
  try {
    ch?.postMessage({ type: "claim", id, at } satisfies OccupyMsg);
  } catch {
    /* private / unsupported channel */
  }

  return {
    id,
    alive: () => local?.id === id,
    release() {
      if (local?.id !== id) return;
      local = null;
      try {
        ch?.postMessage({ type: "release", id, at } satisfies OccupyMsg);
      } catch {
        /* ignore */
      }
    },
  };
}

export function arStopTracks(
  stream: { getTracks(): Array<{ stop(): void }> } | null | undefined,
): void {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch {
      /* already stopped */
    }
  }
}

export function arClassifyMediaError(err: unknown): Exclude<
  ArMediaReason,
  "ok" | "yielded"
> {
  if (typeof window !== "undefined" && window.isSecureContext === false) {
    return "insecure";
  }
  const name =
    err && typeof err === "object" && "name" in err
      ? String((err as { name: unknown }).name)
      : "";
  const msg = err instanceof Error ? err.message : String(err ?? "");
  const blob = `${name} ${msg}`.toLowerCase();
  if (
    blob.includes("notallowed") ||
    blob.includes("permission") ||
    blob.includes("denied") ||
    blob.includes("securityerror")
  ) {
    return "denied";
  }
  if (
    blob.includes("notreadable") ||
    blob.includes("trackstart") ||
    blob.includes("in_use") ||
    blob.includes("in use") ||
    blob.includes("busy") ||
    blob.includes("could not start video") ||
    blob.includes("aborterror")
  ) {
    return "busy";
  }
  if (
    blob.includes("notfound") ||
    blob.includes("devicesnotfound") ||
    blob.includes("overconstrained") ||
    blob.includes("no camera")
  ) {
    return "missing";
  }
  if (
    blob.includes("insecure") ||
    blob.includes("https") ||
    blob.includes("notsupported")
  ) {
    return "insecure";
  }
  return "failed";
}

export function arOccupyCoach(
  reason: ArMediaReason,
  kind: ArMediaKind = "camera",
): string {
  if (reason === "yielded") {
    return "AR moved to another tab. Come back here to continue.";
  }
  if (reason === "insecure") {
    return "AR camera needs HTTPS (or the phone app).";
  }
  if (reason === "missing") {
    return kind === "mic"
      ? "This device doesn’t have a microphone AR can use."
      : "This device doesn’t have a camera AR can use.";
  }
  if (reason === "busy") {
    return kind === "mic"
      ? "The microphone is busy in another app. Close it, then try again."
      : "The camera is busy in another app or tab. Close it, then try again.";
  }
  if (reason === "denied") {
    return kind === "mic"
      ? "Microphone access is needed after AR. Allow it in Settings, then try again."
      : "Camera access is needed for AR. Allow it in Settings, then try again.";
  }
  if (reason === "ok") return "";
  return "Could not start the camera on this device.";
}
