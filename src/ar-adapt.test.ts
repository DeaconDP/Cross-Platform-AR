import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { arAdaptClass, arAdaptProfile, readArAdaptHints } from "./ar-adapt.ts";

describe("arAdaptClass", () => {
  it("defaults to high with no hints", () => {
    assert.equal(arAdaptClass({}), "high");
  });

  it("treats 2 GB or 2 cores as low", () => {
    assert.equal(arAdaptClass({ deviceMemoryGb: 2 }), "low");
    assert.equal(arAdaptClass({ hardwareConcurrency: 2 }), "low");
  });

  it("treats 4 GB as mid even with many cores", () => {
    assert.equal(arAdaptClass({ deviceMemoryGb: 4, hardwareConcurrency: 8 }), "mid");
  });

  it("keeps 8 GB / 8 cores high", () => {
    assert.equal(arAdaptClass({ deviceMemoryGb: 8, hardwareConcurrency: 8 }), "high");
  });

  it("forces low on Save-Data or 2g", () => {
    assert.equal(
      arAdaptClass({ deviceMemoryGb: 8, hardwareConcurrency: 8, saveData: true }),
      "low",
    );
    assert.equal(
      arAdaptClass({ deviceMemoryGb: 8, hardwareConcurrency: 8, effectiveType: "2g" }),
      "low",
    );
  });

  it("caps 3g at mid", () => {
    assert.equal(
      arAdaptClass({ deviceMemoryGb: 8, hardwareConcurrency: 8, effectiveType: "3g" }),
      "mid",
    );
  });
});

describe("arAdaptProfile", () => {
  it("caps pixel ratio and turns off FX on low", () => {
    const profile = arAdaptProfile({
      deviceMemoryGb: 2,
      devicePixelRatio: 3,
    });
    assert.equal(profile.class, "low");
    assert.equal(profile.pixelRatio, 1);
    assert.equal(profile.antialias, false);
    assert.equal(profile.powerPreference, "low-power");
    assert.equal(profile.enableFx, false);
    assert.equal(profile.featurePoints, false);
    assert.equal(profile.autoRotate, false);
  });

  it("uses 1.5× on mid and 2× on high", () => {
    assert.equal(
      arAdaptProfile({ deviceMemoryGb: 4, devicePixelRatio: 3 }).pixelRatio,
      1.5,
    );
    const high = arAdaptProfile({
      deviceMemoryGb: 8,
      hardwareConcurrency: 8,
      devicePixelRatio: 3,
    });
    assert.equal(high.pixelRatio, 2);
    assert.equal(high.antialias, true);
    assert.equal(high.powerPreference, "high-performance");
    assert.equal(high.enableFx, true);
  });

  it("keeps class high under reduced motion but drops FX", () => {
    const profile = arAdaptProfile({
      deviceMemoryGb: 8,
      hardwareConcurrency: 8,
      reduceMotion: true,
    });
    assert.equal(profile.class, "high");
    assert.equal(profile.enableFx, false);
    assert.equal(profile.autoRotate, false);
  });
});

describe("readArAdaptHints", () => {
  it("reads navigator connection fields", () => {
    const hints = readArAdaptHints(
      {
        deviceMemory: 4,
        hardwareConcurrency: 6,
        connection: { saveData: true, effectiveType: "3g" },
      },
      true,
      2.5,
    );
    assert.deepEqual(hints, {
      deviceMemoryGb: 4,
      hardwareConcurrency: 6,
      saveData: true,
      effectiveType: "3g",
      reduceMotion: true,
      devicePixelRatio: 2.5,
    });
  });
});
