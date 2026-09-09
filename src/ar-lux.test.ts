import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AR_LUX_HOLD_DOWN_MS,
  AR_LUX_HOLD_UP_MS,
  arHoldLux,
  arJudgeLuxLevel,
  arLevelFromAndroidLux,
  arLevelFromIosIntensity,
  arLuxCoach,
  arLuxPlatformFromCap,
  arLuxProfile,
  arParseLuxEvent,
} from "./ar-lux.ts";

describe("arLevelFromAndroidLux", () => {
  it("maps TYPE_LIGHT lux to outdoor glare", () => {
    assert.equal(arLevelFromAndroidLux(-1), "ok");
    assert.equal(arLevelFromAndroidLux(400), "ok");
    assert.equal(arLevelFromAndroidLux(12000), "bright");
    assert.equal(arLevelFromAndroidLux(40000), "glare");
  });
});

describe("arLevelFromIosIntensity", () => {
  it("maps ARKit ambientIntensity", () => {
    assert.equal(arLevelFromIosIntensity(-1), "ok");
    assert.equal(arLevelFromIosIntensity(1000), "ok");
    assert.equal(arLevelFromIosIntensity(1800), "bright");
    assert.equal(arLevelFromIosIntensity(2400), "glare");
  });
});

describe("arJudgeLuxLevel", () => {
  it("uses iOS intensity and Android lux separately", () => {
    assert.equal(
      arJudgeLuxLevel({ lux: 1800, platform: "ios" }),
      "bright",
    );
    assert.equal(
      arJudgeLuxLevel({ lux: 1800, platform: "android" }),
      "ok",
    );
    assert.equal(arJudgeLuxLevel({ lux: -1, platform: "web" }), "ok");
  });
});

describe("arHoldLux", () => {
  it("holds 400ms before rising and 800ms before falling", () => {
    assert.equal(
      arHoldLux({ shown: "ok", raw: "glare", heldMs: 200 }),
      "ok",
    );
    assert.equal(
      arHoldLux({ shown: "ok", raw: "glare", heldMs: AR_LUX_HOLD_UP_MS }),
      "glare",
    );
    assert.equal(
      arHoldLux({ shown: "glare", raw: "ok", heldMs: 400 }),
      "glare",
    );
    assert.equal(
      arHoldLux({
        shown: "glare",
        raw: "ok",
        heldMs: AR_LUX_HOLD_DOWN_MS,
      }),
      "ok",
    );
  });
});

describe("arLuxProfile", () => {
  it("makes chrome opaque only in glare", () => {
    const ok = arLuxProfile("ok", "place");
    assert.equal(ok.opaque, false);
    assert.equal(ok.contrast, false);
    assert.equal(ok.coach, "");

    const bright = arLuxProfile("bright", "place");
    assert.equal(bright.opaque, false);
    assert.equal(bright.contrast, true);
    assert.match(bright.coach, /stronger/i);

    const glare = arLuxProfile("glare", "place");
    assert.equal(glare.opaque, true);
    assert.equal(glare.contrast, true);
    assert.match(glare.coach, /solid chrome/i);
  });
});

describe("arLuxCoach", () => {
  it("is empty indoors and product-specific in glare", () => {
    assert.equal(arLuxCoach("ok", "place"), "");
    assert.match(arLuxCoach("glare", "place"), /Close/);
    assert.match(arLuxCoach("glare", "scan"), /hunt/);
    assert.match(arLuxCoach("glare", "emily"), /Close/);
    assert.match(arLuxCoach("glare", "cubes"), /Exit/);
  });
});

describe("arParseLuxEvent", () => {
  it("treats missing lux as unknown", () => {
    assert.deepEqual(arParseLuxEvent(null, "ios"), {
      lux: -1,
      platform: "ios",
    });
    assert.equal(arParseLuxEvent({ lux: 12000 }, "android").lux, 12000);
  });
});

describe("arLuxPlatformFromCap", () => {
  it("maps Capacitor platforms", () => {
    assert.equal(arLuxPlatformFromCap("ios"), "ios");
    assert.equal(arLuxPlatformFromCap("android"), "android");
    assert.equal(arLuxPlatformFromCap("web"), "web");
  });
});
