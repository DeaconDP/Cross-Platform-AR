import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ArNativeSticky,
  ArStartWatch,
  fallbackAfterStartError,
  isStartStall,
  nextWatchDelayMs,
  parseStartPhase,
  PHASE_STALL_MS,
  runStartWatch,
  shouldAbortStart,
  STALL_MESSAGE,
  STICKY_MESSAGE,
  STICKY_SKIP_MS,
} from "./ar-start-phase.ts";

describe("parseStartPhase", () => {
  it("reads { phase } payloads and ignores junk", () => {
    assert.equal(parseStartPhase({ phase: "camera" }), "camera");
    assert.equal(parseStartPhase("installing"), "installing");
    assert.equal(parseStartPhase({ phase: "nope" }), null);
    assert.equal(parseStartPhase(null), null);
  });
});

describe("shouldAbortStart", () => {
  it("waits through permission and Play Store install", () => {
    assert.equal(
      shouldAbortStart({
        phase: "permission",
        phaseAgeMs: 30_000,
        totalAgeMs: 30_000,
      }).abort,
      false,
    );
    assert.equal(
      shouldAbortStart({
        phase: "installing",
        phaseAgeMs: 60_000,
        totalAgeMs: 60_000,
      }).abort,
      false,
    );
  });

  it("aborts a hung camera/model phase after 8s", () => {
    const hit = shouldAbortStart({
      phase: "camera",
      phaseAgeMs: PHASE_STALL_MS.camera,
      totalAgeMs: PHASE_STALL_MS.camera,
    });
    assert.equal(hit.abort, true);
    assert.equal(hit.reason, "stall");
  });

  it("never stalls once ready", () => {
    assert.equal(
      shouldAbortStart({
        phase: "ready",
        phaseAgeMs: 60_000,
        totalAgeMs: 60_000,
      }).abort,
      false,
    );
  });

  it("caps the whole start", () => {
    const hit = shouldAbortStart({
      phase: "permission",
      phaseAgeMs: 10,
      totalAgeMs: 180_000,
    });
    assert.equal(hit.abort, true);
    assert.equal(hit.reason, "cap");
  });
});

describe("ArStartWatch", () => {
  it("resets phase age when the native side reports a new phase", () => {
    let t = 0;
    const watch = new ArStartWatch(() => t);
    t = 7_000;
    assert.equal(watch.verdict().abort, false);
    watch.setPhase("camera");
    t = 7_000 + PHASE_STALL_MS.camera;
    assert.equal(watch.verdict().abort, true);
  });
});

describe("nextWatchDelayMs", () => {
  it("wakes at the sooner of stall or cap", () => {
    assert.equal(
      nextWatchDelayMs({
        phase: "camera",
        phaseAgeMs: 3_000,
        totalAgeMs: 3_000,
      }),
      5_000,
    );
  });
});

describe("sticky + fallback", () => {
  it("skips native for the sticky window after a stall", () => {
    const sticky = new ArNativeSticky();
    sticky.remember(1_000);
    assert.equal(sticky.shouldSkip(1_000 + STICKY_SKIP_MS - 1), true);
    assert.equal(sticky.shouldSkip(1_000 + STICKY_SKIP_MS), false);
    sticky.clear();
    assert.equal(sticky.shouldSkip(9_999), false);
  });

  it("classifies stall as a soft fallback and camera deny as hard", () => {
    assert.equal(isStartStall(new Error(STALL_MESSAGE)), true);
    assert.equal(fallbackAfterStartError(new Error(STALL_MESSAGE)), "soft");
    assert.equal(
      fallbackAfterStartError(new Error("Camera access is needed")),
      "hard",
    );
  });
});

describe("runStartWatch", () => {
  it("returns the start result when the session becomes ready in time", async () => {
    const sticky = new ArNativeSticky();
    let t = 0;
    const result = await runStartWatch({
      now: () => t,
      wait: () => new Promise(() => undefined),
      sticky,
      start: async () => {
        t = 200;
        return "ok";
      },
      stop: async () => {
        throw new Error("stop should not run on success");
      },
    });
    assert.equal(result, "ok");
    assert.equal(sticky.shouldSkip(200), false);
  });

  it("stops native and remembers a stall when the camera phase hangs", async () => {
    const sticky = new ArNativeSticky();
    let t = 0;
    let stopped = false;
    let phaseCb: ((phase: "camera") => void) | null = null;
    await assert.rejects(
      () =>
        runStartWatch({
          now: () => t,
          wait: async (ms) => {
            t += ms;
          },
          sticky,
          onPhase: async (cb) => {
            phaseCb = cb;
            return () => undefined;
          },
          start: async () => {
            phaseCb?.("camera");
            return new Promise(() => undefined);
          },
          stop: async () => {
            stopped = true;
          },
        }),
      (err: unknown) => {
        assert.equal(err instanceof Error && err.message, STALL_MESSAGE);
        return true;
      },
    );
    assert.equal(stopped, true);
    assert.equal(sticky.shouldSkip(t), true);
  });

  it("throws the sticky message without calling start", async () => {
    const sticky = new ArNativeSticky();
    sticky.remember(0);
    let started = false;
    await assert.rejects(
      () =>
        runStartWatch({
          now: () => 1,
          sticky,
          start: async () => {
            started = true;
            return "nope";
          },
          stop: async () => undefined,
        }),
      (err: unknown) => {
        assert.equal(err instanceof Error && err.message, STICKY_MESSAGE);
        return true;
      },
    );
    assert.equal(started, false);
  });
});
