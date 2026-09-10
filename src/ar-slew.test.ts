import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AR_SLEW_HOLD_DOWN_MS,
  AR_SLEW_HOLD_UP_MS,
  AR_SLEW_SPIN_RAD,
  AR_SLEW_SWEEP_RAD,
  AR_SLEW_WARM_MS,
  arHoldSlew,
  arJudgeSlew,
  arParseSlewEvent,
  arParseSlewMotion,
  arSlewBlocksPlace,
  arSlewCoach,
  arSlewProfile,
  arSlewRadFromAxes,
  arSlewRadFromDegrees,
} from "./ar-slew.ts";

const live = (extra: Partial<Parameters<typeof arJudgeSlew>[0]> = {}) =>
  arJudgeSlew({
    live: true,
    radPerSec: -1,
    sessionMs: 8000,
    ...extra,
  });

describe("arJudgeSlew", () => {
  it("treats unknown or warming samples as ok", () => {
    assert.equal(
      arJudgeSlew({ live: false, radPerSec: 12 }),
      "ok",
    );
    assert.equal(
      live({ sessionMs: AR_SLEW_WARM_MS - 1, radPerSec: 12 }),
      "ok",
    );
  });

  it("flags sweep then spin from gyro magnitude", () => {
    assert.equal(live(), "ok");
    assert.equal(live({ radPerSec: AR_SLEW_SWEEP_RAD }), "sweep");
    assert.equal(live({ radPerSec: AR_SLEW_SPIN_RAD }), "spin");
  });
});

describe("arSlewBlocksPlace", () => {
  it("blocks place/emily/cubes only on a whip pan; scan still hunts", () => {
    assert.equal(arSlewBlocksPlace("ok", "place"), false);
    assert.equal(arSlewBlocksPlace("sweep", "place"), false);
    assert.equal(arSlewBlocksPlace("spin", "place"), true);
    assert.equal(arSlewBlocksPlace("spin", "emily"), true);
    assert.equal(arSlewBlocksPlace("spin", "cubes"), true);
    assert.equal(arSlewBlocksPlace("spin", "scan"), false);
  });
});

describe("arHoldSlew", () => {
  it("holds 400ms before raising and 800ms before clearing", () => {
    assert.equal(arHoldSlew({ shown: "ok", raw: "sweep", heldMs: 200 }), "ok");
    assert.equal(
      arHoldSlew({ shown: "ok", raw: "spin", heldMs: AR_SLEW_HOLD_UP_MS }),
      "spin",
    );
    assert.equal(arHoldSlew({ shown: "spin", raw: "ok", heldMs: 400 }), "spin");
    assert.equal(
      arHoldSlew({ shown: "spin", raw: "ok", heldMs: AR_SLEW_HOLD_DOWN_MS }),
      "ok",
    );
  });
});

describe("arSlewCoach", () => {
  it("is silent when the phone is still", () => {
    assert.equal(arSlewCoach("ok", "place"), "");
  });

  it("tells place visitors to slow or hold still", () => {
    assert.match(arSlewCoach("sweep", "place"), /slow|sweep/i);
    assert.match(arSlewCoach("spin", "place"), /hold still|fast pan/i);
  });

  it("keeps scan copy on the printed mark", () => {
    assert.match(arSlewCoach("spin", "scan"), /mark|hold still/i);
  });
});

describe("arSlewProfile", () => {
  it("carries coach, blockPlace, and placed through the judge", () => {
    const spin = arSlewProfile(
      {
        live: true,
        radPerSec: 4,
        sessionMs: 8000,
        placed: false,
      },
      "place",
    );
    assert.equal(spin.kind, "spin");
    assert.equal(spin.blockPlace, true);
    assert.ok(spin.coach.length > 0);
    const ok = arSlewProfile(
      {
        live: true,
        radPerSec: -1,
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

describe("arParseSlewEvent", () => {
  it("reads native payloads and ignores junk", () => {
    assert.deepEqual(
      arParseSlewEvent({
        live: true,
        radPerSec: 1.8,
        sessionMs: 200,
        placed: true,
      }),
      {
        live: true,
        radPerSec: 1.8,
        sessionMs: 200,
        placed: true,
      },
    );
    assert.equal(arParseSlewEvent(null).live, false);
    assert.equal(arParseSlewEvent({ radPerSec: Number.NaN }).radPerSec, -1);
  });
});

describe("arSlewRadFromDegrees + arParseSlewMotion", () => {
  it("converts DeviceMotion degrees/s and judges a sweep", () => {
    assert.ok(Math.abs(arSlewRadFromDegrees(180) - Math.PI) < 1e-6);
    assert.equal(arSlewRadFromDegrees(-1), -1);
    const fromAxes = arSlewRadFromAxes(0, AR_SLEW_SWEEP_RAD, 0);
    assert.ok(fromAxes >= AR_SLEW_SWEEP_RAD);
    const sweep = arParseSlewMotion({
      live: true,
      radPerSec: AR_SLEW_SWEEP_RAD,
      sessionMs: 8000,
    });
    assert.equal(arJudgeSlew(sweep), "sweep");
    const spin = arParseSlewMotion({
      live: true,
      radPerSec: AR_SLEW_SPIN_RAD,
      sessionMs: 8000,
    });
    assert.equal(arJudgeSlew(spin), "spin");
  });
});
