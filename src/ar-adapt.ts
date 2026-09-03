export type ArDeviceClass = "low" | "mid" | "high";

export type ArAdaptHints = {
  deviceMemoryGb?: number;
  hardwareConcurrency?: number;
  saveData?: boolean;
  effectiveType?: string;
  reduceMotion?: boolean;
  devicePixelRatio?: number;
};

export type ArAdaptProfile = {
  class: ArDeviceClass;
  pixelRatio: number;
  antialias: boolean;
  powerPreference: "default" | "high-performance" | "low-power";
  enableFx: boolean;
  featurePoints: boolean;
  autoRotate: boolean;
};

const RANK: Record<ArDeviceClass, number> = { low: 0, mid: 1, high: 2 };

function worse(a: ArDeviceClass, b: ArDeviceClass): ArDeviceClass {
  return RANK[a] <= RANK[b] ? a : b;
}

export function arAdaptClass(hints: ArAdaptHints): ArDeviceClass {
  let cls: ArDeviceClass = "high";
  const mem = hints.deviceMemoryGb;
  if (typeof mem === "number") {
    if (mem <= 2) cls = worse(cls, "low");
    else if (mem <= 4) cls = worse(cls, "mid");
  }
  const cores = hints.hardwareConcurrency;
  if (typeof cores === "number") {
    if (cores <= 2) cls = worse(cls, "low");
    else if (cores <= 4) cls = worse(cls, "mid");
  }
  if (hints.saveData) cls = "low";
  const net = hints.effectiveType;
  if (net === "slow-2g" || net === "2g") cls = "low";
  else if (net === "3g") cls = worse(cls, "mid");
  return cls;
}

export function arAdaptProfile(hints: ArAdaptHints): ArAdaptProfile {
  const cls = arAdaptClass(hints);
  const dpr = hints.devicePixelRatio ?? 1;
  const cap = cls === "low" ? 1 : cls === "mid" ? 1.5 : 2;
  const reduce = Boolean(hints.reduceMotion);
  const enableFx = cls !== "low" && !reduce;
  return {
    class: cls,
    pixelRatio: Math.min(Math.max(dpr, 1), cap),
    antialias: cls !== "low",
    powerPreference:
      cls === "low" ? "low-power" : cls === "high" ? "high-performance" : "default",
    enableFx,
    featurePoints: cls !== "low",
    autoRotate: cls !== "low" && !reduce,
  };
}

type NavigatorLike = {
  deviceMemory?: number;
  hardwareConcurrency?: number;
  connection?: { saveData?: boolean; effectiveType?: string };
};

export function readArAdaptHints(
  nav?: NavigatorLike,
  reduceMotion = false,
  devicePixelRatio = 1,
): ArAdaptHints {
  const conn = nav?.connection;
  return {
    deviceMemoryGb: typeof nav?.deviceMemory === "number" ? nav.deviceMemory : undefined,
    hardwareConcurrency:
      typeof nav?.hardwareConcurrency === "number"
        ? nav.hardwareConcurrency
        : undefined,
    saveData: Boolean(conn?.saveData),
    effectiveType: typeof conn?.effectiveType === "string" ? conn.effectiveType : undefined,
    reduceMotion,
    devicePixelRatio,
  };
}

export function probeArAdapt(): ArAdaptProfile {
  const nav =
    typeof navigator === "undefined" ? undefined : (navigator as NavigatorLike);
  const reduce =
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;
  const dpr = typeof devicePixelRatio === "number" ? devicePixelRatio : 1;
  return arAdaptProfile(readArAdaptHints(nav, reduce, dpr));
}

export function arAdaptRendererOptions(profile: ArAdaptProfile): {
  antialias: boolean;
  powerPreference: ArAdaptProfile["powerPreference"];
} {
  return {
    antialias: profile.antialias,
    powerPreference: profile.powerPreference,
  };
}
