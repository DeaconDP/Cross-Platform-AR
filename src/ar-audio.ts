/** Session audio mix so camera start cannot mute overlay / system audio. */

export type ArAudioPolicy = "mix" | "duck";

export type ArAudioContext = {
  state: string;
  resume: () => Promise<void>;
};

export function arJudgeAudio(opts?: { duck?: boolean }): ArAudioPolicy {
  return opts?.duck ? "duck" : "mix";
}

export function arNormalizePolicy(raw: string | null | undefined): ArAudioPolicy {
  return raw === "duck" ? "duck" : "mix";
}

export function arAudioSuspended(
  ctx: ArAudioContext | null | undefined,
): boolean {
  return ctx?.state === "suspended";
}

export async function arResumeAudioContext(
  ctx: ArAudioContext | null | undefined,
): Promise<boolean> {
  if (!ctx || ctx.state !== "suspended") return false;
  try {
    await ctx.resume();
    return `${ctx.state}` === "running";
  } catch {
    return false;
  }
}

export function arAudioCoach(kind: "suspended" | "blocked"): string {
  if (kind === "blocked") {
    return "Sound is blocked — tap the screen to hear the exhibit.";
  }
  return "Sound is paused — tap to hear the exhibit.";
}

export type ArAudioHandle = {
  policy: ArAudioPolicy;
  resume: () => Promise<boolean>;
  suspended: () => boolean;
  dispose: () => void;
};

export function arArmAudio(opts?: {
  getContext?: () => ArAudioContext | null;
  duck?: boolean;
  onSuspended?: (copy: string) => void;
}): ArAudioHandle {
  const policy = arJudgeAudio(opts);
  let disposed = false;
  const getCtx = () => opts?.getContext?.() ?? null;

  const resume = async () => {
    if (disposed) return false;
    return arResumeAudioContext(getCtx());
  };

  const notifyIfSuspended = () => {
    if (disposed || !arAudioSuspended(getCtx())) return;
    opts?.onSuspended?.(arAudioCoach("suspended"));
  };

  const onPtr = () => {
    void resume().then(() => notifyIfSuspended());
  };
  const onVis = () => {
    if (typeof document !== "undefined" && document.visibilityState === "visible") {
      void resume();
    }
  };

  if (typeof document !== "undefined") {
    document.addEventListener("pointerdown", onPtr, true);
    document.addEventListener("visibilitychange", onVis);
  }

  void resume().then((ok) => {
    if (!ok) notifyIfSuspended();
  });

  return {
    policy,
    resume,
    suspended: () => arAudioSuspended(getCtx()),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      if (typeof document === "undefined") return;
      document.removeEventListener("pointerdown", onPtr, true);
      document.removeEventListener("visibilitychange", onVis);
    },
  };
}
