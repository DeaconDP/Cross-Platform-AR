import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AR_FREEZE_FROZEN_MS,
  AR_FREEZE_HOLD_DOWN_MS,
  AR_FREEZE_HOLD_UP_MS,
  AR_FREEZE_STALE_MS,
  AR_FREEZE_WARM_MS,
  arFreezeBlocksPlace,
  arFreezeCoach,
  arFreezeProfile,
  arHoldFreeze,
  arJudgeFreeze,
  arParseFreezeEvent,
  arParseVideoClock,
  arParseXrClock,
} from "./ar-freeze.ts";

const live = (
  extra: Partial<Parameters<typeof arJudgeFreeze>[0]> = {},
) =>
  arJudgeFreeze({
    live: true,
    ageMs: 80,
    sessionMs: 8000,
    ...extra,
  });

describe("arJudgeFreeze", () => {
  it("treats unknown or warming samples as ok", () => {
    assert.equal(
      arJudgeFreeze({ live: false, ageMs: -1, sessionMs: -1 }),
      "ok",
    );
    assert.equal(
      live({ sessionMs: AR_FREEZE_WARM_MS - 1, ageMs: 5000, stuck: true }),
      "ok",
    );
  });

  it("flags stale then frozen by age, and stuck as frozen", () => {
    assert.equal(live({ ageMs: AR_FREEZE_STALE_MS - 1 }), "ok");
    assert.equal(live({ ageMs: AR_FREEZE_STALE_MS }), "stale");
    assert.equal(live({ ageMs: AR_FREEZE_FROZEN_MS }), "frozen");
    assert.equal(live({ ageMs: 80, stuck: true }), "frozen");
  });
});

describe("arFreezeBlocksPlace", () => {
  it("blocks place/emily/cubes only when frozen; scan still hunts", () => {
    assert.equal(arFreezeBlocksPlace("ok", "place"), false);
    assert.equal(arFreezeBlocksPlace("stale", "place"), false);
    assert.equal(arFreezeBlocksPlace("frozen", "place"), true);
    assert.equal(arFreezeBlocksPlace("frozen", "emily"), true);
    assert.equal(arFreezeBlocksPlace("frozen", "cubes"), true);
    assert.equal(arFreezeBlocksPlace("frozen", "scan"), false);
  });
});

describe("arHoldFreeze", () => {
  it("holds 400ms before raising and 800ms before clearing", () => {
    assert.equal(
      arHoldFreeze({ shown: "ok", raw: "stale", heldMs: 200 }),
      "ok",
    );
    assert.equal(
      arHoldFreeze({
        shown: "ok",
        raw: "frozen",
        heldMs: AR_FREEZE_HOLD_UP_MS,
      }),
      "frozen",
    );
    assert.equal(
      arHoldFreeze({ shown: "frozen", raw: "ok", heldMs: 400 }),
      "frozen",
    );
    assert.equal(
      arHoldFreeze({
        shown: "frozen",
        raw: "ok",
        heldMs: AR_FREEZE_HOLD_DOWN_MS,
      }),
      "ok",
    );
  });
});

describe("arFreezeCoach", () => {
  it("is silent when the camera is advancing", () => {
    assert.equal(arFreezeCoach("ok", "place"), "");
  });

  it("tells place visitors to close and retry when frozen", () => {
    assert.match(arFreezeCoach("stale", "place"), /hitch|hold still/i);
    assert.match(arFreezeCoach("frozen", "place"), /froze|try again/i);
  });

  it("keeps scan copy on the printed mark", () => {
    assert.match(arFreezeCoach("frozen", "scan"), /mark|froze/i);
  });
});

describe("arFreezeProfile", () => {
  it("carries coach, blockPlace, and placed through the judge", () => {
    const frozen = arFreezeProfile(
      {
        live: true,
        ageMs: 2000,
        sessionMs: 8000,
        placed: false,
      },
      "place",
    );
    assert.equal(frozen.kind, "frozen");
    assert.equal(frozen.blockPlace, true);
    assert.ok(frozen.coach.length > 0);
    const ok = arFreezeProfile(
      {
        live: true,
        ageMs: 40,
        sessionMs: 8000,
        placed: true,
      },
      "emily",
    );
    assert.equal(ok.kind, "ok");
    assert.equal(ok.coach, "");
    assert.equal(ok.placed, true);
    assert.equal(ok.blockPlace, false);
  });
});

describe("arParseFreezeEvent", () => {
  it("reads native payloads and ignores junk", () => {
    assert.deepEqual(
      arParseFreezeEvent({
        live: true,
        ageMs: 99,
        sessionMs: 200,
        stuck: true,
        placed: true,
      }),
      {
        live: true,
        ageMs: 99,
        sessionMs: 200,
        stuck: true,
        placed: true,
      },
    );
    assert.equal(arParseFreezeEvent(null).live, false);
    assert.equal(arParseFreezeEvent({ ageMs: Number.NaN }).ageMs, -1);
  });
});

describe("arParseVideoClock", () => {
  it("ages a stuck currentTime into a freeze", () => {
    const first = arParseVideoClock({
      live: true,
      currentTime: 1.2,
      prev: null,
      nowMs: 3000,
      sessionStartMs: 0,
    });
    assert.equal(first.sample.live, true);
    assert.equal(first.sample.ageMs, 0);
    const stuck = arParseVideoClock({
      live: true,
      currentTime: 1.2,
      prev: first.stamp,
      nowMs: 3000 + AR_FREEZE_FROZEN_MS,
      sessionStartMs: 0,
    });
    assert.equal(stuck.sample.stuck, true);
    assert.equal(stuck.sample.ageMs, AR_FREEZE_FROZEN_MS);
    const moved = arParseVideoClock({
      live: true,
      currentTime: 1.25,
      prev: stuck.stamp,
      nowMs: 5000,
      sessionStartMs: 0,
    });
    assert.equal(moved.sample.stuck, false);
    assert.equal(moved.sample.ageMs, 0);
  });
});

describe("arParseXrClock", () => {
  it("reuses the video-clock helper for XR frame times", () => {
    const sample = arParseXrClock({
      live: true,
      frameTime: 16.6,
      prev: null,
      nowMs: 4000,
      sessionStartMs: 1000,
    });
    assert.equal(sample.sample.sessionMs, 3000);
    assert.equal(sample.sample.live, true);
  });
});
