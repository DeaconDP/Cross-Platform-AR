import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  arArmAudio,
  arAudioCoach,
  arAudioSuspended,
  arJudgeAudio,
  arNormalizePolicy,
  arResumeAudioContext,
} from "./ar-audio.ts";

describe("arJudgeAudio", () => {
  it("defaults to mix so the camera does not steal playback", () => {
    assert.equal(arJudgeAudio(), "mix");
    assert.equal(arJudgeAudio({}), "mix");
  });

  it("ducks only when asked", () => {
    assert.equal(arJudgeAudio({ duck: true }), "duck");
  });
});

describe("arNormalizePolicy", () => {
  it("treats unknown values as mix", () => {
    assert.equal(arNormalizePolicy(undefined), "mix");
    assert.equal(arNormalizePolicy("exclusive"), "mix");
    assert.equal(arNormalizePolicy("duck"), "duck");
  });
});

describe("arAudioSuspended", () => {
  it("is false without a context", () => {
    assert.equal(arAudioSuspended(null), false);
    assert.equal(arAudioSuspended({ state: "running", resume: async () => {} }), false);
  });

  it("is true when the graph is suspended", () => {
    assert.equal(
      arAudioSuspended({ state: "suspended", resume: async () => {} }),
      true,
    );
  });
});

describe("arResumeAudioContext", () => {
  it("skips running or missing contexts", async () => {
    let called = false;
    assert.equal(await arResumeAudioContext(null), false);
    assert.equal(
      await arResumeAudioContext({
        state: "running",
        resume: async () => {
          called = true;
        },
      }),
      false,
    );
    assert.equal(called, false);
  });

  it("resumes a suspended context", async () => {
    const ctx = {
      state: "suspended",
      resume: async () => {
        ctx.state = "running";
      },
    };
    assert.equal(await arResumeAudioContext(ctx), true);
    assert.equal(ctx.state, "running");
  });

  it("returns false when resume throws", async () => {
    assert.equal(
      await arResumeAudioContext({
        state: "suspended",
        resume: async () => {
          throw new Error("blocked");
        },
      }),
      false,
    );
  });
});

describe("arAudioCoach", () => {
  it("asks the visitor to tap", () => {
    assert.match(arAudioCoach("suspended"), /tap/i);
    assert.match(arAudioCoach("blocked"), /tap/i);
  });
});

describe("arArmAudio", () => {
  it("exposes mix policy and idempotent dispose", async () => {
    const handle = arArmAudio();
    assert.equal(handle.policy, "mix");
    assert.equal(handle.suspended(), false);
    handle.dispose();
    handle.dispose();
    assert.equal(await handle.resume(), false);
  });

  it("resumes the provided context until disposed", async () => {
    const ctx = {
      state: "suspended" as string,
      resume: async () => {
        ctx.state = "running";
      },
    };
    const handle = arArmAudio({ getContext: () => ctx });
    await handle.resume();
    assert.equal(ctx.state, "running");
    handle.dispose();
    ctx.state = "suspended";
    assert.equal(await handle.resume(), false);
  });
});
