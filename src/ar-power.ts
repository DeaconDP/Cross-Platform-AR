/** OS power-save + battery only — not RAM/cores (device class) or thermal FPS. */

export type ArPowerInput = {
  powerSave: boolean;
  level: number | null;
  charging: boolean | null;
};

export type ArPowerClass = "ok" | "saver" | "critical";

export type ArPowerProfile = {
  class: ArPowerClass;
  enableFx: boolean;
  antialias: boolean;
  pixelRatioCap: number;
  featurePoints: boolean;
  coach: string | null;
};

export function arJudgePower(input: ArPowerInput): ArPowerProfile {
  const charging = input.charging === true;
  const level = input.level;
  const critical = level != null && level <= 0.15 && !charging;
  const saver =
    input.powerSave || (level != null && level <= 0.25 && !charging);

  if (critical) {
    return {
      class: "critical",
      enableFx: false,
      antialias: false,
      pixelRatioCap: 1,
      featurePoints: false,
      coach: "Battery is low — AR is using a lighter camera.",
    };
  }
  if (saver) {
    return {
      class: "saver",
      enableFx: false,
      antialias: false,
      pixelRatioCap: 1.25,
      featurePoints: false,
      coach: input.powerSave
        ? "Low Power Mode — AR is using a lighter camera."
        : null,
    };
  }
  return {
    class: "ok",
    enableFx: true,
    antialias: true,
    pixelRatioCap: 2,
    featurePoints: true,
    coach: null,
  };
}

export function arApplyPixelRatio(
  devicePixelRatio: number,
  cap: number,
): number {
  const dpr =
    Number.isFinite(devicePixelRatio) && devicePixelRatio > 0
      ? devicePixelRatio
      : 1;
  const safeCap = Number.isFinite(cap) && cap > 0 ? cap : 1;
  return Math.min(Math.max(dpr, 1), safeCap);
}

export function arMergePower(
  native: Partial<ArPowerInput> | null | undefined,
  web: Partial<ArPowerInput> | null | undefined,
): ArPowerInput {
  return {
    powerSave: Boolean(native?.powerSave || web?.powerSave),
    level: pickLevel(native?.level, web?.level),
    charging:
      native?.charging != null ? native.charging : (web?.charging ?? null),
  };
}

function pickLevel(
  a: number | null | undefined,
  b: number | null | undefined,
): number | null {
  const av = a != null && Number.isFinite(a) ? clamp01(a) : null;
  const bv = b != null && Number.isFinite(b) ? clamp01(b) : null;
  if (av == null) return bv;
  if (bv == null) return av;
  return Math.min(av, bv);
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export function arParsePowerState(raw: unknown): ArPowerInput {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    powerSave: o.powerSave === true,
    level: typeof o.level === "number" && Number.isFinite(o.level) ? clamp01(o.level) : null,
    charging: typeof o.charging === "boolean" ? o.charging : null,
  };
}

export async function arReadWebBattery(): Promise<{
  level: number | null;
  charging: boolean | null;
}> {
  try {
    const nav = navigator as Navigator & {
      getBattery?: () => Promise<{ level: number; charging: boolean }>;
    };
    if (!nav.getBattery) return { level: null, charging: null };
    const bat = await nav.getBattery();
    return { level: bat.level, charging: bat.charging };
  } catch {
    return { level: null, charging: null };
  }
}

let last: ArPowerProfile = arJudgePower({
  powerSave: false,
  level: null,
  charging: null,
});

export function arRememberPower(profile: ArPowerProfile): ArPowerProfile {
  last = profile;
  return profile;
}

export function arLastPower(): ArPowerProfile {
  return last;
}

export async function arResolvePower(
  native?: Partial<ArPowerInput> | null,
): Promise<ArPowerProfile> {
  const web = await arReadWebBattery();
  return arRememberPower(arJudgePower(arMergePower(native, web)));
}
