/** Session idle + first-surface timeout. Shared math for CoH / Origins / Emily / Cube. */

export const AR_IDLE = {
  surfaceHintMs: 8_000,
  surfaceSlowMs: 16_000,
  unplacedMs: 45_000,
  placedMs: 90_000,
  warnLeadMs: 15_000,
  pocketMs: 8_000,
  tickMs: 1_000,
} as const;

export type ArIdlePhase =
  | "ok"
  | "surfaceHint"
  | "surfaceSlow"
  | "idleWarn"
  | "idleExit"
  | "pocketExit";

export type ArIdleReason = "idle" | "pocket" | null;

export type ArIdleInput = {
  now: number;
  startedAt: number;
  lastInteractAt: number;
  hiddenSince: number | null;
  placed: boolean;
  planeFound: boolean;
  imageMode?: boolean;
};

export type ArIdleVerdict = {
  phase: ArIdlePhase;
  coach: string | null;
  shouldExit: boolean;
  reason: ArIdleReason;
};

export function arIdleLimit(placed: boolean): number {
  return placed ? AR_IDLE.placedMs : AR_IDLE.unplacedMs;
}

export function arIdleCopy(phase: ArIdlePhase): string {
  switch (phase) {
    case "surfaceHint":
      return "Move the phone slowly. Hold it over a table or floor.";
    case "surfaceSlow":
      return "Need more light or a larger flat surface. Tilt down toward the table.";
    case "idleWarn":
      return "AR will close soon if you don’t move or tap.";
    case "idleExit":
      return "AR closed after a pause — open it again when you’re ready.";
    case "pocketExit":
      return "AR closed because the app went to the background.";
    default:
      return "";
  }
}

export function arJudgeIdle(input: ArIdleInput): ArIdleVerdict {
  if (
    input.hiddenSince != null &&
    input.now - input.hiddenSince >= AR_IDLE.pocketMs
  ) {
    return {
      phase: "pocketExit",
      coach: arIdleCopy("pocketExit"),
      shouldExit: true,
      reason: "pocket",
    };
  }

  const idleFor = input.now - input.lastInteractAt;
  const limit = arIdleLimit(input.placed);
  if (idleFor >= limit) {
    return {
      phase: "idleExit",
      coach: arIdleCopy("idleExit"),
      shouldExit: true,
      reason: "idle",
    };
  }
  if (idleFor >= limit - AR_IDLE.warnLeadMs) {
    return {
      phase: "idleWarn",
      coach: arIdleCopy("idleWarn"),
      shouldExit: false,
      reason: null,
    };
  }

  if (!input.imageMode && !input.placed && !input.planeFound) {
    const wait = input.now - input.startedAt;
    if (wait >= AR_IDLE.surfaceSlowMs) {
      return {
        phase: "surfaceSlow",
        coach: arIdleCopy("surfaceSlow"),
        shouldExit: false,
        reason: null,
      };
    }
    if (wait >= AR_IDLE.surfaceHintMs) {
      return {
        phase: "surfaceHint",
        coach: arIdleCopy("surfaceHint"),
        shouldExit: false,
        reason: null,
      };
    }
  }

  return { phase: "ok", coach: null, shouldExit: false, reason: null };
}

export type ArIdleClock = {
  now: () => number;
  hidden: () => boolean;
  every: (fn: () => void, ms: number) => () => void;
};

export function arArmIdle(
  opts: {
    getState: () => { placed: boolean; planeFound: boolean; imageMode?: boolean };
    onCoach: (copy: string | null, phase: ArIdlePhase) => void;
    onExit: (reason: "idle" | "pocket", copy: string) => void;
  },
  clock?: Partial<ArIdleClock>,
): { noteInteract: () => void; notePlane: () => void; dispose: () => void } {
  const now = clock?.now ?? (() => Date.now());
  const hidden =
    clock?.hidden ??
    (() => typeof document !== "undefined" && document.hidden);
  const every =
    clock?.every ??
    ((fn, ms) => {
      const id = setInterval(fn, ms);
      return () => clearInterval(id);
    });

  const startedAt = now();
  let lastInteractAt = startedAt;
  let hiddenSince: number | null = hidden() ? now() : null;
  let planeFound = false;
  let exited = false;
  let lastPhase: ArIdlePhase = "ok";

  const tick = () => {
    if (exited) return;
    if (hidden()) {
      if (hiddenSince == null) hiddenSince = now();
    } else {
      hiddenSince = null;
    }
    const state = opts.getState();
    if (state.planeFound) planeFound = true;
    const verdict = arJudgeIdle({
      now: now(),
      startedAt,
      lastInteractAt,
      hiddenSince,
      placed: state.placed,
      planeFound,
      imageMode: state.imageMode,
    });
    if (verdict.shouldExit && verdict.reason) {
      exited = true;
      opts.onExit(verdict.reason, verdict.coach ?? arIdleCopy(verdict.phase));
      return;
    }
    if (verdict.phase !== lastPhase) {
      lastPhase = verdict.phase;
      opts.onCoach(verdict.coach, verdict.phase);
    }
  };

  const stopTick = every(tick, AR_IDLE.tickMs);
  const onVis = () => tick();
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVis);
  }

  return {
    noteInteract: () => {
      lastInteractAt = now();
      if (!exited && lastPhase === "idleWarn") {
        lastPhase = "ok";
        opts.onCoach(null, "ok");
      }
    },
    notePlane: () => {
      planeFound = true;
      if (
        !exited &&
        (lastPhase === "surfaceHint" || lastPhase === "surfaceSlow")
      ) {
        lastPhase = "ok";
        opts.onCoach(null, "ok");
      }
    },
    dispose: () => {
      exited = true;
      stopTick();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVis);
      }
    },
  };
}
