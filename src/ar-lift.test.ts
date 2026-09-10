import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AR_LIFT_HOLD_DOWN_MS,
  AR_LIFT_HOLD_UP_MS,
  AR_LIFT_LIFT_PA_S,
  AR_LIFT_PA_PER_M,
  AR_LIFT_STAIRS_PA_S,
  AR_LIFT_WARM_MS,
  arHoldLift,
  arJudgeLift,
  arLiftBlocksPlace,
  arLiftCoach,
  arLiftPaFromMps,
  arLiftPaPerSecFromHpa,
  arLiftProfile,
  arParseLiftEvent,
  arParseLiftMotion,
} from "./ar-lift.ts";

const live = (extra: Partial<Parameters<typeof arJudgeLift>[0]> = {}) =>
  arJudgeLift({
    live: true,
    paPerSec: -1,
    sessionMs: 8000,
    ...extra,
  });

describe("arJudgeLift", () => {
  it("treats unknown or warming samples as ok", () => {
    assert.equal(arJudgeLift({ live: false, paPerSec: 40 }), "ok");
    assert.equal(
      live({ sessionMs: AR_LIFT_WARM_MS - 1, paPerSec: 40 }),
      "ok",
    );
  });

  it("flags stairs then lift from pressure rate", () => {
    assert.equal(live(), "ok");
    assert.equal(live({ paPerSec: AR_LIFT_STAIRS_PA_S }), "stairs");
    assert.equal(live({ paPerSec: AR_LIFT_LIFT_PA_S }), "lift");
  });

  it("accepts altitude metres as a second rate", () => {
    assert.equal(live({ mPerSec: AR_LIFT_STAIRS_PA_S / AR_LIFT_PA_PER_M }), "stairs");
    assert.equal(live({ mPerSec: 1.2 }), "lift");
  });
});

describe("arLiftBlocksPlace", () => {
  it("blocks place/emily/cubes only in a lift; scan still hunts", () => {
    assert.equal(arLiftBlocksPlace("ok", "place"), false);
    assert.equal(arLiftBlocksPlace("stairs", "place"), false);
    assert.equal(arLiftBlocksPlace("lift", "place"), true);
    assert.equal(arLiftBlocksPlace("lift", "emily"), true);
    assert.equal(arLiftBlocksPlace("lift", "cubes"), true);
    assert.equal(arLiftBlocksPlace("lift", "scan"), false);
  });
});

describe("arHoldLift", () => {
  it("holds 400ms before raising and 800ms before clearing", () => {
    assert.equal(arHoldLift({ shown: "ok", raw: "stairs", heldMs: 200 }), "ok");
    assert.equal(
      arHoldLift({ shown: "ok", raw: "lift", heldMs: AR_LIFT_HOLD_UP_MS }),
      "lift",
    );
    assert.equal(arHoldLift({ shown: "lift", raw: "ok", heldMs: 400 }), "lift");
    assert.equal(
      arHoldLift({ shown: "lift", raw: "ok", heldMs: AR_LIFT_HOLD_DOWN_MS }),
      "ok",
    );
  });
});

describe("arLiftCoach", () => {
  it("is silent on one floor", () => {
    assert.equal(arLiftCoach("ok", "place"), "");
  });

  it("tells place visitors to wait out a lift or stairs", () => {
    assert.match(arLiftCoach("stairs", "place"), /floor|stairs/i);
    assert.match(arLiftCoach("lift", "place"), /lift/i);
  });

  it("keeps scan copy on the printed mark", () => {
    assert.match(arLiftCoach("lift", "scan"), /mark|lift/i);
  });
});

describe("arLiftProfile", () => {
  it("carries coach, blockPlace, and placed through the judge", () => {
    const cabin = arLiftProfile(
      {
        live: true,
        paPerSec: 16,
        sessionMs: 8000,
        placed: false,
      },
      "place",
    );
    assert.equal(cabin.kind, "lift");
    assert.equal(cabin.blockPlace, true);
    assert.ok(cabin.coach.length > 0);
    const ok = arLiftProfile(
      {
        live: true,
        paPerSec: -1,
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

describe("arParseLiftEvent + hPa delta", () => {
  it("reads native payloads and ignores junk", () => {
    assert.deepEqual(
      arParseLiftEvent({
        live: true,
        paPerSec: 3.2,
        mPerSec: 0.25,
        sessionMs: 200,
        placed: true,
      }),
      {
        live: true,
        paPerSec: 3.2,
        mPerSec: 0.25,
        sessionMs: 200,
        placed: true,
      },
    );
    assert.equal(arParseLiftEvent(null).live, false);
    assert.equal(arParseLiftEvent({ paPerSec: Number.NaN }).paPerSec, -1);
  });

  it("converts successive hPa ticks into Pa/s", () => {
    const stairs = arLiftPaPerSecFromHpa(1013.25, 1013.2, 1000);
    assert.ok(stairs > 0);
    assert.equal(arLiftPaPerSecFromHpa(1013, 1012, 20), -1);
    assert.ok(Math.abs(arLiftPaFromMps(1) - AR_LIFT_PA_PER_M) < 1e-6);
    const motion = arParseLiftMotion({
      live: true,
      paPerSec: AR_LIFT_LIFT_PA_S,
      sessionMs: 8000,
    });
    assert.equal(arJudgeLift(motion), "lift");
  });
});
