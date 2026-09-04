/** Eyes-up AR coach: speak overlay copy so visitors can look at the room, not the chrome. */

export type ArSpeakKind = "idle" | "coach" | "skip";

export type ArSpeakPrefs = {
  muted?: boolean;
  screenReader?: boolean;
};

export type ArSpeakInput = ArSpeakPrefs & {
  text: string;
  prev?: string;
  placed?: boolean;
};

export type ArSpeakEngine = {
  prefs?: () => Promise<ArSpeakPrefs> | ArSpeakPrefs;
  speak?: (text: string) => void | Promise<void>;
  stop?: () => void | Promise<void>;
};

export type ArSpeakBridge = {
  speechPrefs?: () => Promise<ArSpeakPrefs>;
  speakCoach?: (opts: { text: string }) => Promise<void>;
  stopSpeak?: () => Promise<void>;
};

export type ArSpeakHandle = {
  say: (text: string, flags?: { placed?: boolean }) => Promise<void>;
  reset: () => void;
  dispose: () => void;
};

export const AR_SPEAK_FIND = "Move your phone to find a surface";
export const AR_SPEAK_SURFACE = "Tap to place a cube";
export const AR_SPEAK_MISS = "No surface there. Keep moving, then tap again.";

export function arSpeakNorm(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

export function arSpeakUtterance(text: string): string {
  return text
    .replace(/[·•]/g, ".")
    .replace(/\s*\.\s*/g, ". ")
    .replace(/\s+/g, " ")
    .trim();
}

export function arSpeakKind(input: ArSpeakInput): ArSpeakKind {
  const text = arSpeakNorm(input.text);
  if (!text) return "idle";
  if (input.placed || input.muted || input.screenReader) return "skip";
  if (text === arSpeakNorm(input.prev ?? "")) return "idle";
  return "coach";
}

export function arSpeakWebEngine(): Pick<ArSpeakEngine, "speak" | "stop"> {
  return {
    speak(text) {
      if (typeof speechSynthesis === "undefined") return;
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.05;
      u.volume = 0.85;
      speechSynthesis.speak(u);
    },
    stop() {
      if (typeof speechSynthesis === "undefined") return;
      speechSynthesis.cancel();
    },
  };
}

export function arSpeakBridgeEngine(bridge: ArSpeakBridge): ArSpeakEngine {
  const web = arSpeakWebEngine();
  return {
    prefs: async () => {
      try {
        return (await bridge.speechPrefs?.()) ?? {};
      } catch {
        return {};
      }
    },
    speak: async (text) => {
      try {
        if (bridge.speakCoach) {
          await bridge.speakCoach({ text });
          return;
        }
      } catch {
        /* PWA / missing plugin */
      }
      web.speak(text);
    },
    stop: async () => {
      try {
        if (bridge.stopSpeak) {
          await bridge.stopSpeak();
          return;
        }
      } catch {
        /* PWA / missing plugin */
      }
      web.stop();
    },
  };
}

export function arSpeakArm(engine: ArSpeakEngine = {}): ArSpeakHandle {
  let prev = "";
  let dead = false;

  const readPrefs = async (): Promise<ArSpeakPrefs> => {
    try {
      return (await engine.prefs?.()) ?? {};
    } catch {
      return {};
    }
  };

  return {
    async say(text, flags = {}) {
      if (dead) return;
      const prefs = await readPrefs();
      const kind = arSpeakKind({
        text,
        prev,
        placed: flags.placed,
        muted: prefs.muted,
        screenReader: prefs.screenReader,
      });
      if (kind === "idle") return;
      if (kind === "skip") {
        await engine.stop?.();
        return;
      }
      prev = text;
      await engine.speak?.(arSpeakUtterance(text));
    },
    reset() {
      prev = "";
    },
    dispose() {
      dead = true;
      void engine.stop?.();
    },
  };
}
