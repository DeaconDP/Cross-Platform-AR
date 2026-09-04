import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AR_MAG_HOLD_MS,
  arArmMag,
  arJudgeMag,
  arMagAccuracyFromCode,
  arMagCoach,
  arMagNormUt,
} from "./ar-mag.ts";

describe("arMagAccuracyFromCode", () => {
  it("maps CoreMotion / Android codes", () => {
    assert.equal(arMagAccuracyFromCode(-1), "uncalibrated");
    assert.equal(arMagAccuracyFromCode(0), "low");
    assert.equal(arMagAccuracyFromCode(1), "medium");
    assert.equal(arMagAccuracyFromCode(2), "high");
    assert.equal(arMagAccuracyFromCode(undefined), "unknown");
  });
});

describe("arMagNormUt", () => {
  it("returns hypot of a valid triad", () => {
    assert.equal(arMagNormUt(3, 4, 0), 5);
    assert.equal(arMagNormUt(null, 1, 1), null);
    assert.equal(arMagNormUt(1, Number.NaN, 1), null);
  });
});

describe("arJudgeMag", () => {
  it("treats unsupported as ok", () => {
    assert.equal(arJudgeMag({ supported: false, uT: 200 }), "ok");
  });

  it("flags uncalibrated before field strength", () => {
    assert.equal(
      arJudgeMag({ accuracyCode: -1, uT: 45 }),
      "uncalibrated",
    );
  });

  it("flags metal / speaker interference", () => {
    assert.equal(arJudgeMag({ uT: 8 }), "interfere");
    assert.equal(arJudgeMag({ uT: 140 }), "interfere");
    assert.equal(arJudgeMag({ x: 30, y: 20, z: 10 }), "ok");
  });

  it("flags low accuracy as weak", () => {
    assert.equal(arJudgeMag({ accuracy: "low", uT: 45 }), "weak");
    assert.equal(arJudgeMag({ accuracy: "high", uT: 45 }), "ok");
  });
});

describe("arMagCoach", () => {
  it("is silent when ok", () => {
    assert.equal(arMagCoach("ok", "place"), "");
  });

  it("asks for a figure-8 when uncalibrated", () => {
    assert.match(arMagCoach("uncalibrated", "place"), /figure-8/);
    assert.match(arMagCoach("uncalibrated", "emily"), /north/);
    assert.match(arMagCoach("uncalibrated", "scan"), /plaque/);
  });

  it("names metal when the field is off", () => {
    assert.match(arMagCoach("interfere", "place"), /Metal/);
    assert.match(arMagCoach("interfere", "emily"), /floor/);
    assert.match(arMagCoach("weak", "cubes"), /settling/);
  });
});

describe("arArmMag", () => {
  it("holds before coaching so a one-frame spike is ignored", () => {
    const kinds: string[] = [];
    let clock = 0;
    const arm = arArmMag({
      product: "place",
      now: () => clock,
      onKind: (k) => kinds.push(k),
    });
    assert.equal(arm.note({ uT: 200 }), "ok");
    assert.equal(arm.kind(), "ok");
    clock = AR_MAG_HOLD_MS;
    assert.equal(arm.note({ uT: 200 }), "interfere");
    assert.deepEqual(kinds, ["interfere"]);
    arm.dispose();
  });

  it("clears coach when the field returns to earth range", () => {
    const coaches: string[] = [];
    let clock = 0;
    const arm = arArmMag({
      product: "emily",
      now: () => clock,
      onKind: (_k, c) => coaches.push(c),
    });
    arm.note({ accuracyCode: -1, uT: 45 });
    clock = AR_MAG_HOLD_MS;
    arm.note({ accuracyCode: -1, uT: 45 });
    assert.match(coaches.at(-1) ?? "", /figure-8/);
    arm.note({ accuracyCode: 2, uT: 45 });
    assert.equal(arm.kind(), "ok");
    assert.equal(coaches.at(-1), "");
    arm.dispose();
  });

  it("polls native and ignores after dispose", async () => {
    let polls = 0;
    const ids: number[] = [];
    const arm = arArmMag({
      product: "scan",
      poll: () => {
        polls += 1;
        return { uT: 12 };
      },
      intervalMs: 5,
      holdMs: 0,
      setIntervalFn: (fn, _ms) => {
        ids.push(1);
        fn();
        return 1;
      },
      clearIntervalFn: () => {
        ids.length = 0;
      },
    });
    assert.equal(polls, 1);
    assert.equal(arm.kind(), "interfere");
    arm.dispose();
    assert.equal(ids.length, 0);
    assert.equal(arm.note({ uT: 45 }), "interfere");
  });
});
