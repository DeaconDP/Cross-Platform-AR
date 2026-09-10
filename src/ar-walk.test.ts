import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AR_WALK_HOLD_DOWN_MS,
  AR_WALK_HOLD_UP_MS,
  AR_WALK_RIDE_MPS,
  AR_WALK_RMS,
  AR_WALK_STEP_HZ,
  AR_WALK_WALK_MPS,
  AR_WALK_WARM_MS,
  arHoldWalk,
  arJudgeWalk,
  arParseWalkEvent,
  arParseWalkMotion,
  arWalkBlocksPlace,
  arWalkCoach,
  arWalkProfile,
  arWalkRms,
} from "./ar-walk.ts";

const live = (extra: Partial<Parameters<typeof arJudgeWalk>[0]> = {}) =>
  arJudgeWalk({
    live: true,
    speedMps: -1,
    stepHz: -1,
    sessionMs: 8000,
    ...extra,
  });

describe("arJudgeWalk", () => {
  it("treats unknown or warming samples as ok", () => {
    assert.equal(
      arJudgeWalk({ live: false, speedMps: 12, stepHz: 2, ride: true }),
      "ok",
    );
    assert.equal(
      live({ sessionMs: AR_WALK_WARM_MS - 1, ride: true, speedMps: 20 }),
      "ok",
    );
  });

  it("flags walk from speed, steps, or activity, and ride from speed or flag", () => {
    assert.equal(live(), "ok");
    assert.equal(live({ speedMps: AR_WALK_WALK_MPS }), "walk");
    assert.equal(live({ stepHz: AR_WALK_STEP_HZ }), "walk");
    assert.equal(live({ walk: true }), "walk");
    assert.equal(live({ speedMps: AR_WALK_RIDE_MPS }), "ride");
    assert.equal(live({ ride: true, speedMps: 0 }), "ride");
  });
});

describe("arWalkBlocksPlace", () => {
  it("blocks cubes only in a vehicle; scan still hunts", () => {
    assert.equal(arWalkBlocksPlace("walk", "cubes"), false);
    assert.equal(arWalkBlocksPlace("ride", "cubes"), true);
    assert.equal(arWalkBlocksPlace("ride", "scan"), false);
  });
});

describe("arHoldWalk", () => {
  it("holds 600ms before raising and 800ms before clearing", () => {
    assert.equal(arHoldWalk({ shown: "ok", raw: "walk", heldMs: 200 }), "ok");
    assert.equal(
      arHoldWalk({ shown: "ok", raw: "ride", heldMs: AR_WALK_HOLD_UP_MS }),
      "ride",
    );
    assert.equal(
      arHoldWalk({ shown: "ride", raw: "ok", heldMs: AR_WALK_HOLD_DOWN_MS }),
      "ok",
    );
  });
});

describe("arWalkCoach", () => {
  it("tells cube visitors to pause or stop", () => {
    assert.equal(arWalkCoach("ok", "cubes"), "");
    assert.match(arWalkCoach("walk", "cubes"), /pause|walking/i);
    assert.match(arWalkCoach("ride", "cubes"), /stop|moving seat/i);
  });
});

describe("arWalkProfile", () => {
  it("carries coach and blockPlace for cubes", () => {
    const ride = arWalkProfile(
      {
        live: true,
        speedMps: 12,
        stepHz: -1,
        sessionMs: 8000,
        placed: false,
      },
      "cubes",
    );
    assert.equal(ride.kind, "ride");
    assert.equal(ride.blockPlace, true);
    assert.ok(ride.coach.length > 0);
  });
});

describe("arParseWalkEvent + motion", () => {
  it("reads native payloads and DeviceMotion RMS", () => {
    assert.equal(arParseWalkEvent(null).live, false);
    assert.equal(arWalkRms([0, 0, 0]), 0);
    assert.ok(arWalkRms([2, 2, 2]) >= AR_WALK_RMS);
    const walk = arParseWalkMotion({
      live: true,
      rms: AR_WALK_RMS,
      sessionMs: 8000,
    });
    assert.equal(arJudgeWalk(walk), "walk");
    const ride = arParseWalkMotion({
      live: true,
      rms: 0.2,
      speedMps: AR_WALK_RIDE_MPS,
      sessionMs: 8000,
    });
    assert.equal(arJudgeWalk(ride), "ride");
  });
});
