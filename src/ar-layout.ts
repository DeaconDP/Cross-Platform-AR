/** Mid-session layout steward. Shared math for CoH / Origins / Emily / Cube. */

export const AR_LAYOUT = {
  minWidth: 280,
  minHeight: 320,
  splitCoverage: 0.62,
  debounceMs: 80,
} as const;

export type ArLayoutKind = "full" | "split" | "tiny" | "covered";

export type ArLayoutBox = {
  overlayW: number;
  overlayH: number;
  screenW: number;
  screenH: number;
  overlayX?: number;
  overlayY?: number;
};

export type ArLayoutNative = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type ArLayoutVerdict = {
  kind: ArLayoutKind;
  usable: boolean;
  shouldPause: boolean;
  coach: string | null;
  native: ArLayoutNative;
};

export function arLayoutCopy(kind: ArLayoutKind): string | null {
  switch (kind) {
    case "split":
      return "Open full screen — this pane is tight for placing.";
    case "tiny":
      return "AR needs a larger view. Rotate the phone or leave split screen.";
    default:
      return null;
  }
}

export function arLayoutNative(box: ArLayoutBox): ArLayoutNative {
  const sw = Math.max(box.screenW, 1);
  const sh = Math.max(box.screenH, 1);
  return {
    x: (box.overlayX ?? 0) / sw,
    y: (box.overlayY ?? 0) / sh,
    w: box.overlayW / sw,
    h: box.overlayH / sh,
  };
}

export function arMeasureHost(
  el: { getBoundingClientRect(): DOMRect } | null,
  screen?: { w: number; h: number },
): ArLayoutBox {
  const sw =
    screen?.w ?? (typeof window !== "undefined" ? window.innerWidth : 0);
  const sh =
    screen?.h ?? (typeof window !== "undefined" ? window.innerHeight : 0);
  if (!el) {
    return {
      overlayW: 0,
      overlayH: 0,
      screenW: sw,
      screenH: sh,
      overlayX: 0,
      overlayY: 0,
    };
  }
  const r = el.getBoundingClientRect();
  return {
    overlayW: r.width,
    overlayH: r.height,
    screenW: sw,
    screenH: sh,
    overlayX: r.left,
    overlayY: r.top,
  };
}

export function arJudgeLayout(box: ArLayoutBox): ArLayoutVerdict {
  const native = arLayoutNative(box);
  const w = box.overlayW;
  const h = box.overlayH;
  if (w < 8 || h < 8) {
    return {
      kind: "covered",
      usable: false,
      shouldPause: true,
      coach: arLayoutCopy("covered"),
      native,
    };
  }
  if (w < AR_LAYOUT.minWidth || h < AR_LAYOUT.minHeight) {
    return {
      kind: "tiny",
      usable: false,
      shouldPause: true,
      coach: arLayoutCopy("tiny"),
      native,
    };
  }
  const screenArea = Math.max(box.screenW, 1) * Math.max(box.screenH, 1);
  const coverage = (w * h) / screenArea;
  if (coverage < AR_LAYOUT.splitCoverage) {
    return {
      kind: "split",
      usable: true,
      shouldPause: false,
      coach: arLayoutCopy("split"),
      native,
    };
  }
  return {
    kind: "full",
    usable: true,
    shouldPause: false,
    coach: null,
    native,
  };
}

export type ArLayoutClock = {
  every: (fn: () => void, ms: number) => () => void;
};

export function arArmLayout(
  opts: {
    measure: () => ArLayoutBox;
    onChange: (verdict: ArLayoutVerdict) => void;
  },
  clock?: Partial<ArLayoutClock>,
): { note: () => void; dispose: () => void } {
  const every =
    clock?.every ??
    ((fn, ms) => {
      const id = setInterval(fn, ms);
      return () => clearInterval(id);
    });

  let lastKey = "";
  let disposed = false;

  const tick = () => {
    if (disposed) return;
    const verdict = arJudgeLayout(opts.measure());
    const key = `${verdict.kind}:${verdict.native.x.toFixed(3)}:${verdict.native.y.toFixed(3)}:${verdict.native.w.toFixed(3)}:${verdict.native.h.toFixed(3)}`;
    if (key === lastKey) return;
    lastKey = key;
    opts.onChange(verdict);
  };

  const stopTick = every(tick, AR_LAYOUT.debounceMs);
  const onResize = () => tick();
  if (typeof window !== "undefined") {
    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("scroll", onResize);
  }
  tick();

  return {
    note: tick,
    dispose: () => {
      disposed = true;
      stopTick();
      if (typeof window !== "undefined") {
        window.removeEventListener("resize", onResize);
        window.visualViewport?.removeEventListener("resize", onResize);
        window.visualViewport?.removeEventListener("scroll", onResize);
      }
    },
  };
}
