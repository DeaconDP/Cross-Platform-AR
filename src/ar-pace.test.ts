import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AR_PACE_HOLD_DOWN_MS,
  AR_PACE_HOLD_UP_MS,
  AR_PACE_JANK_MS,
  AR_PACE_SLOW_MS,
  arEmaFrame,
  arHoldPace,
  arJudgePace,
  arPaceCoach,
  arPaceProfile,
  arParsePaceEvent,
} from "./ar-pace.ts";

describe("arJudgePace", () => {
  it("treats unknown samples as ok", () => {
    assert.equal(arJudgePace({ dtMs: -1 }), "ok");
  });

  it("flags 45fps-and-better as ok", () => {
    assert.equal(arJudgePace({ dtMs: 16 }), "ok");
    assert.equal(arJudgePace({ dtMs: AR_PACE_SLOW_MS - 0.01 }), "ok");
  });

  it("flags mid-20s fps as slow and worse as jank", () => {
    assert.equal(arJudgePace({ dtMs: AR_PACE_SLOW_MS }), "slow");
    assert.equal(arJudgePace({ dtMs: 30 }), "slow");
    assert.equal(arJudgePace({ dtMs: AR_PACE_JANK_MS }), "jank");
    assert.equal(arJudgePace({ dtMs: 50 }), "jank");
  });
});

describe("arEmaFrame", () => {
  it("seeds on the first sample and ignores stalls", () => {
    assert.equal(arEmaFrame(-1, 16), 16);
    assert.equal(arEmaFrame(16, 0), 16);
    assert.equal(arEmaFrame(16, 400), 16);
    const next = arEmaFrame(16, 20);
    assert.ok(next > 16 && next < 20);
  });
});

describe("arHoldPace", () => {
  it("holds 400ms before raising and 800ms before clearing", () => {
    assert.equal(arHoldPace({ shown: "ok", raw: "jank", heldMs: 200 }), "ok");
    assert.equal(
      arHoldPace({ shown: "ok", raw: "slow", heldMs: AR_PACE_HOLD_UP_MS }),
      "slow",
    );
    assert.equal(arHoldPace({ shown: "jank", raw: "ok", heldMs: 400 }), "jank");
    assert.equal(
      arHoldPace({
        shown: "jank",
        raw: "ok",
        heldMs: AR_PACE_HOLD_DOWN_MS,
      }),
      "ok",
    );
  });
});

describe("arPaceProfile", () => {
  it("drops FX and pixel ratio as frames get slower", () => {
    const ok = arPaceProfile("ok", "cubes");
    assert.equal(ok.lowFx, false);
    assert.equal(ok.pixelRatio, 2);
    assert.equal(ok.coach, "");

    const slow = arPaceProfile("slow", "cubes");
    assert.equal(slow.lowFx, true);
    assert.equal(slow.antialias, false);
    assert.match(slow.coach, /smooth/i);

    const jank = arPaceProfile("jank", "cubes");
    assert.equal(jank.pixelRatio, 1);
    assert.match(jank.coach, /cubes/i);
  });
});

describe("arPaceCoach", () => {
  it("is empty when ok and product-specific when not", () => {
    assert.equal(arPaceCoach("ok", "cubes"), "");
    assert.match(arPaceCoach("slow", "cubes"), /cubes/);
    assert.match(arPaceCoach("jank", "cubes"), /simple/);
  });
});

describe("arParsePaceEvent", () => {
  it("reads dtMs or derives it from fps", () => {
    assert.deepEqual(arParsePaceEvent(null), { dtMs: -1 });
    assert.equal(arParsePaceEvent({ dtMs: 18 }).dtMs, 18);
    assert.equal(arParsePaceEvent({ fps: 50 }).dtMs, 20);
  });
});
