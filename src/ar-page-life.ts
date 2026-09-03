/** Why the JS AR host must drop the native session. */
export type ArPageLifeReason = "pagehide" | "freeze" | "bfcache" | "discarded";

export type ArPageLifeInput = {
  type: string;
  persisted?: boolean;
  wasDiscarded?: boolean;
};

export type ArPageLifeEnv = {
  addEventListener(
    type: string,
    fn: EventListener,
    opts?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener(
    type: string,
    fn: EventListener,
    opts?: boolean | AddEventListenerOptions,
  ): void;
  wasDiscarded?: boolean;
};

/**
 * Classify a page-lifecycle event. Visibility hides and Activity pause are
 * ignored — those are normal app-switch. This is freeze / unload / restore.
 */
export function arPageLifeReason(input: ArPageLifeInput): ArPageLifeReason | null {
  const type = input.type.toLowerCase();
  if (type === "pagehide") return "pagehide";
  if (type === "freeze") return "freeze";
  if (type === "pageshow" && input.persisted) return "bfcache";
  if (type === "pageshow" && input.wasDiscarded) return "discarded";
  return null;
}

export function arPageLifeCoach(reason: ArPageLifeReason): string {
  if (reason === "freeze") {
    return "AR paused while the page was frozen. Start again when you’re back.";
  }
  if (reason === "bfcache" || reason === "discarded") {
    return "The page was restored — start AR again.";
  }
  return "";
}

/** Subscribe to unload/freeze/restore. Returns an unsubscribe. */
export function bindArPageLife(
  onTearDown: (reason: ArPageLifeReason) => void,
  env: ArPageLifeEnv = globalThis as unknown as ArPageLifeEnv,
): () => void {
  const onEvent = (event: Event) => {
    const persisted =
      "persisted" in event ? Boolean((event as PageTransitionEvent).persisted) : undefined;
    const reason = arPageLifeReason({
      type: event.type,
      persisted,
      wasDiscarded: env.wasDiscarded,
    });
    if (reason) onTearDown(reason);
  };
  const opts = { capture: true };
  env.addEventListener("pagehide", onEvent, opts);
  env.addEventListener("freeze", onEvent, opts);
  env.addEventListener("pageshow", onEvent, opts);
  return () => {
    env.removeEventListener("pagehide", onEvent, opts);
    env.removeEventListener("freeze", onEvent, opts);
    env.removeEventListener("pageshow", onEvent, opts);
  };
}
