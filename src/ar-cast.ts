/** Screen-share / extra-display steward — AirPlay, Cast, HDMI, recording. */

export type ArCastKind = "ok" | "mirrored" | "recorded";
export type ArCastProduct = "place" | "scan" | "emily" | "cubes";

export type ArCastSample = {
  captured?: boolean;
  extraDisplays?: number;
  wireless?: boolean;
  extended?: boolean;
};

export const AR_CAST_HOLD_MS = 400;
export const AR_CAST_CLEAR_MS = 200;

export function arJudgeCast(sample: ArCastSample): ArCastKind {
  if (sample.captured) return "recorded";
  const extra = sample.extraDisplays ?? 0;
  if (extra > 0 || sample.wireless || sample.extended) return "mirrored";
  return "ok";
}

export function arCastLowFx(kind: ArCastKind): boolean {
  return kind !== "ok";
}

export function arCastCoach(
  kind: ArCastKind,
  product: ArCastProduct,
): string | null {
  if (kind === "ok") return null;
  if (kind === "recorded") {
    if (product === "scan") return "Recording is on — hold the marker in frame.";
    if (product === "emily") return "Recording is on — the floor may take longer to find.";
    if (product === "cubes") return "Recording is on — surfaces may take longer.";
    return "Recording is on — tracking may slow. Hold the table in view.";
  }
  if (product === "scan") {
    return "This screen is shared — keep the marker in the camera.";
  }
  if (product === "emily") {
    return "This screen is shared — the floor may take longer to find.";
  }
  if (product === "cubes") {
    return "This screen is shared — move slowly to find a surface.";
  }
  return "This screen is shared — tracking may slow. Keep the table in view.";
}

export function arWebCastSample(
  scr: { isExtended?: boolean } | null | undefined = globalThis.screen,
): ArCastSample {
  try {
    return { extended: Boolean(scr?.isExtended) };
  } catch {
    return {};
  }
}

export type ArCastNative = {
  castState?: () => Promise<ArCastSample>;
  listen?: (
    cb: (sample: ArCastSample) => void,
  ) =>
    | (() => void)
    | Promise<(() => void) | void>
    | { remove?: () => void | Promise<void> }
    | Promise<{ remove?: () => void | Promise<void> } | void>
    | void;
};

export type ArCastHandle = {
  kind: () => ArCastKind;
  dispose: () => void;
};

function unwrapListen(
  ret: Awaited<ReturnType<NonNullable<ArCastNative["listen"]>>>,
): (() => void) | null {
  if (!ret) return null;
  if (typeof ret === "function") return ret;
  if (typeof ret.remove === "function") {
    const remove = ret.remove.bind(ret);
    return () => {
      void remove();
    };
  }
  return null;
}

export function armArCast(opts: {
  product: ArCastProduct;
  onKind: (kind: ArCastKind, coach: string | null) => void;
  native?: ArCastNative;
  pollMs?: number;
  now?: () => number;
  setTimeoutFn?: (fn: () => void, ms: number) => unknown;
  clearTimeoutFn?: (id: unknown) => void;
  setIntervalFn?: (fn: () => void, ms: number) => unknown;
  clearIntervalFn?: (id: unknown) => void;
}): ArCastHandle {
  const setTimeoutFn = opts.setTimeoutFn ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimeoutFn = opts.clearTimeoutFn ?? ((id) => clearTimeout(id as ReturnType<typeof setTimeout>));
  const setIntervalFn = opts.setIntervalFn ?? ((fn, ms) => setInterval(fn, ms));
  const clearIntervalFn = opts.clearIntervalFn ?? ((id) => clearInterval(id as ReturnType<typeof setInterval>));

  let kind: ArCastKind = "ok";
  let pending: ArCastKind = "ok";
  let holdId: unknown = 0;
  let pollId: unknown = 0;
  let disposed = false;
  let unlisten: (() => void) | null = null;

  const apply = (next: ArCastKind) => {
    if (disposed || next === kind) return;
    kind = next;
    opts.onKind(kind, arCastCoach(kind, opts.product));
  };

  const consider = (sample: ArCastSample) => {
    if (disposed) return;
    const judged = arJudgeCast({ ...arWebCastSample(), ...sample });
    if (judged === kind) {
      pending = judged;
      if (holdId) {
        clearTimeoutFn(holdId);
        holdId = 0;
      }
      return;
    }
    if (judged === pending && holdId) return;
    pending = judged;
    if (holdId) clearTimeoutFn(holdId);
    const delay = judged === "ok" ? AR_CAST_CLEAR_MS : AR_CAST_HOLD_MS;
    holdId = setTimeoutFn(() => {
      holdId = 0;
      apply(judged);
    }, delay);
  };

  const poll = () => {
    if (opts.native?.castState) {
      void opts.native
        .castState()
        .then((s) => consider(s))
        .catch(() => consider(arWebCastSample()));
      return;
    }
    consider(arWebCastSample());
  };

  poll();
  pollId = setIntervalFn(poll, opts.pollMs ?? 1000);

  if (opts.native?.listen) {
    const ret = opts.native.listen((s) => consider(s));
    if (ret && typeof (ret as Promise<unknown>).then === "function") {
      void Promise.resolve(ret).then((resolved) => {
        if (disposed) {
          unwrapListen(resolved)?.();
          return;
        }
        unlisten = unwrapListen(resolved);
      });
    } else {
      unlisten = unwrapListen(ret as Awaited<typeof ret>);
    }
  }

  const onResize = () => consider(arWebCastSample());
  if (typeof window !== "undefined") {
    window.addEventListener("resize", onResize);
  }

  return {
    kind: () => kind,
    dispose: () => {
      disposed = true;
      if (holdId) clearTimeoutFn(holdId);
      if (pollId) clearIntervalFn(pollId);
      unlisten?.();
      if (typeof window !== "undefined") {
        window.removeEventListener("resize", onResize);
      }
    },
  };
}
