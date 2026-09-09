import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AR_HEAT_HOLD_DOWN_MS,
  AR_HEAT_HOLD_UP_MS,
  arHeatCoach,
  arHeatPlatformFromCap,
  arHeatProfile,
  arHoldHeat,
  arJudgeHeatLevel,
  arLevelFromAndroid,
  arLevelFromFrame,
  arLevelFromIos,
  arParseHeatEvent,
} from "./ar-heat.ts";

describe("arLevelFromIos", () => {
  it("maps ProcessInfo thermal states", () => {
    assert.equal(arLevelFromIos(0), "ok");
    assert.equal(arLevelFromIos(2), "hot");
    assert.equal(arLevelFromIos(3), "critical");
  });
});

describe("arLevelFromAndroid", () => {
  it("maps PowerManager thermal status", () => {
    assert.equal(arLevelFromAndroid(1), "ok");
    assert.equal(arLevelFromAndroid(2), "warm");
    assert.equal(arLevelFromAndroid(3), "hot");
    assert.equal(arLevelFromAndroid(5), "critical");
  });
});

describe("arLevelFromFrame", () => {
  it("uses rAF cost when the OS has no thermal API", () => {
    assert.equal(arLevelFromFrame(16), "ok");
    assert.equal(arLevelFromFrame(40), "hot");
    assert.equal(arLevelFromFrame(80), "critical");
  });
});

describe("arJudgeHeatLevel", () => {
  it("prefers native thermal over frame timing", () => {
    assert.equal(
      arJudgeHeatLevel({ thermal: 3, platform: "android", frameMs: 16 }),
      "hot",
    );
    assert.equal(
      arJudgeHeatLevel({ thermal: -1, platform: "web", frameMs: 40 }),
      "hot",
    );
  });
});

describe("arHoldHeat", () => {
  it("holds 400ms before rising and 800ms before falling", () => {
    assert.equal(arHoldHeat({ shown: "ok", raw: "hot", heldMs: 200 }), "ok");
    assert.equal(
      arHoldHeat({ shown: "ok", raw: "hot", heldMs: AR_HEAT_HOLD_UP_MS }),
      "hot",
    );
    assert.equal(
      arHoldHeat({ shown: "hot", raw: "ok", heldMs: AR_HEAT_HOLD_DOWN_MS }),
      "ok",
    );
  });
});

describe("arHeatProfile", () => {
  it("keeps cubes simple when hot", () => {
    const hot = arHeatProfile("hot", "cubes");
    assert.equal(hot.lowFx, true);
    assert.equal(hot.antialias, false);
    assert.match(hot.coach, /cubes stay simple/);
  });
});

describe("arHeatCoach", () => {
  it("is empty when cool", () => {
    assert.equal(arHeatCoach("ok", "cubes"), "");
    assert.match(arHeatCoach("critical", "cubes"), /close AR/);
  });
});

describe("arParseHeatEvent", () => {
  it("treats missing thermal as unknown", () => {
    assert.equal(arParseHeatEvent(null, "ios").thermal, -1);
  });
});

describe("arHeatPlatformFromCap", () => {
  it("maps Capacitor platforms", () => {
    assert.equal(arHeatPlatformFromCap("android"), "android");
    assert.equal(arHeatPlatformFromCap("web"), "web");
  });
});
