export type ArCameraLoss = "revoked" | "disconnected" | "in-use" | "unknown";

export type ArLostProduct = "fossil" | "exhibit" | "place" | "cube";

export type ArLostHint = {
  name?: string;
  message?: string;
  reason?: string;
  state?: string;
  readyState?: string;
  ended?: boolean;
};

export type ArLostWatchHandle = {
  release: () => void;
  markUserEnd: () => void;
};

type Listenable = {
  addEventListener: (type: string, fn: () => void) => void;
  removeEventListener: (type: string, fn: () => void) => void;
};

export type ArLostPermission = Listenable & { state?: string };
export type ArLostTrack = Listenable & { readyState?: string };

function blobOf(hint: ArLostHint): string {
  return [hint.name, hint.message, hint.reason, hint.state, hint.readyState]
    .filter((s): s is string => !!s)
    .join(" ")
    .toLowerCase();
}

function isRevoked(blob: string): boolean {
  return (
    blob.includes("notallowed") ||
    blob.includes("permission") ||
    blob.includes("denied") ||
    blob.includes("unauthorized") ||
    blob.includes("revok")
  );
}

function isInUse(blob: string): boolean {
  return (
    blob.includes("in use") ||
    blob.includes("in-use") ||
    blob.includes("already in use") ||
    blob.includes("busy") ||
    blob.includes("notreadable")
  );
}

function isDisconnected(blob: string): boolean {
  return (
    blob.includes("ended") ||
    blob.includes("disconnect") ||
    blob.includes("device") ||
    blob.includes("unavailable") ||
    blob.includes("unplugged") ||
    blob.includes("lost")
  );
}

export function arClassifyCameraLoss(hint: ArLostHint): ArCameraLoss {
  const reason = (hint.reason ?? "").toLowerCase();
  if (reason === "revoked" || reason === "denied") return "revoked";
  if (reason === "in-use" || reason === "busy") return "in-use";
  if (reason === "disconnected" || reason === "ended") return "disconnected";

  if (hint.state === "denied") return "revoked";
  if (hint.ended === true || hint.readyState === "ended") {
    const blob = blobOf(hint);
    if (isInUse(blob)) return "in-use";
    if (isRevoked(blob)) return "revoked";
    return "disconnected";
  }

  const blob = blobOf(hint);
  if (isRevoked(blob)) return "revoked";
  if (isInUse(blob)) return "in-use";
  if (isDisconnected(blob)) return "disconnected";
  return "unknown";
}

function needCamera(product: ArLostProduct): string {
  if (product === "fossil") {
    return "Camera access is needed to place fossils on a table.";
  }
  if (product === "exhibit") {
    return "Camera access is needed for AR exhibits.";
  }
  if (product === "place") {
    return "Camera access is needed to place me on the floor.";
  }
  return "Camera access is needed to place cubes.";
}

export function arCameraLossCopy(
  kind: ArCameraLoss,
  product: ArLostProduct,
): string {
  const need = needCamera(product);
  if (kind === "revoked") {
    return `${need} Camera permission was turned off. Allow Camera in Settings, then try again.`;
  }
  if (kind === "in-use") {
    return "Another app is using the camera. Close it, then try again.";
  }
  if (kind === "disconnected") {
    return "The camera stopped. Check that nothing else is using it, then try again.";
  }
  return `${need} The camera session ended. Try again.`;
}

export function arWatchCameraLost(opts: {
  onLost: (kind: ArCameraLoss) => void;
  permission?: ArLostPermission | null;
  tracks?: ArLostTrack[] | null;
}): ArLostWatchHandle {
  let alive = true;
  let fired = false;
  const cleanups: Array<() => void> = [];

  const fire = (kind: ArCameraLoss) => {
    if (!alive || fired || kind === "unknown") return;
    fired = true;
    opts.onLost(kind);
  };

  const perm = opts.permission;
  if (perm) {
    if (perm.state === "denied") fire("revoked");
    const onChange = () => {
      fire(arClassifyCameraLoss({ state: perm.state, reason: perm.state }));
    };
    perm.addEventListener("change", onChange);
    cleanups.push(() => perm.removeEventListener("change", onChange));
  }

  for (const track of opts.tracks ?? []) {
    if (track.readyState === "ended") {
      fire(arClassifyCameraLoss({ readyState: "ended", ended: true }));
    }
    const onEnded = () => {
      fire(
        arClassifyCameraLoss({
          readyState: track.readyState,
          ended: true,
        }),
      );
    };
    track.addEventListener("ended", onEnded);
    cleanups.push(() => track.removeEventListener("ended", onEnded));
  }

  return {
    release: () => {
      alive = false;
      for (const c of cleanups) c();
    },
    markUserEnd: () => {
      fired = true;
    },
  };
}

export function arWatchSessionEnd(
  session: Listenable,
  onLost: (kind: ArCameraLoss) => void,
): ArLostWatchHandle {
  let alive = true;
  let userEnded = false;
  const onEnd = () => {
    if (!alive || userEnded) return;
    onLost(
      arClassifyCameraLoss({
        reason: "disconnected",
        message: "session ended",
      }),
    );
  };
  session.addEventListener("end", onEnd);
  return {
    release: () => {
      alive = false;
      session.removeEventListener("end", onEnd);
    },
    markUserEnd: () => {
      userEnded = true;
    },
  };
}

async function defaultQuery(desc: {
  name: string;
}): Promise<ArLostPermission> {
  const nav = globalThis.navigator as {
    permissions?: {
      query: (d: { name: string }) => Promise<ArLostPermission>;
    };
  };
  if (!nav.permissions?.query) {
    throw new Error("no permissions");
  }
  return nav.permissions.query(desc);
}

export async function arQueryCameraPermission(
  query: (desc: { name: string }) => Promise<ArLostPermission> = defaultQuery,
): Promise<ArLostPermission | null> {
  try {
    return await query({ name: "camera" });
  } catch {
    return null;
  }
}
