import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AR_LENS_HOLD_DOWN_MS,
  AR_LENS_HOLD_UP_MS,
  AR_LENS_MEAN_MAX,
  AR_LENS_VAR_MAX,
  arHoldLens,
  arJudgeLens,
  arLensCoach,
  arLensProfile,
  arLensShouldPlace,
  arParseLensEvent,
  arSampleLumaBytes,
  arSampleRgba,
} from "./ar-lens.ts";

describe("arJudgeLens", () => {
  it("treats unknown samples as clear", () => {
    assert.equal(arJudgeLens({ mean: -1, variance: -1 }), "ok");
  });

  it("flags a uniform dark frame as covered", () => {
    assert.equal(
      arJudgeLens({ mean: AR_LENS_MEAN_MAX, variance: AR_LENS_VAR_MAX }),
      "covered",
    );
    assert.equal(arJudgeLens({ mean: 0.02, variance: 0.0004 }), "covered");
  });

  it("keeps a dark but textured room as ok", () => {
    assert.equal(arJudgeLens({ mean: 0.06, variance: 0.02 }), "ok");
    assert.equal(arJudgeLens({ mean: 0.35, variance: 0.0001 }), "ok");
  });
});

describe("arSampleLumaBytes", () => {
  it("computes mean and variance from 0–255 bytes", () => {
    const sample = arSampleLumaBytes([0, 0, 0, 0, 0, 0, 0, 0]);
    assert.ok(sample.mean < 0.01);
    assert.ok(sample.variance < 0.001);
    assert.equal(arJudgeLens(sample), "covered");
  });

  it("needs at least four samples", () => {
    assert.deepEqual(arSampleLumaBytes([0, 1]), { mean: -1, variance: -1 });
  });
});

describe("arSampleRgba", () => {
  it("reads luma from RGBA pixels", () => {
    const dark = arSampleRgba(new Uint8Array(16));
    assert.equal(arJudgeLens(dark), "covered");
    const bright = arSampleRgba(
      new Uint8Array([255, 255, 255, 255, 200, 180, 40, 255, 10, 80, 200, 255, 90, 90, 90, 255]),
    );
    assert.equal(arJudgeLens(bright), "ok");
  });
});

describe("arHoldLens", () => {
  it("holds 400ms before covering and 800ms before clearing", () => {
    assert.equal(
      arHoldLens({ shown: "ok", raw: "covered", heldMs: 200 }),
      "ok",
    );
    assert.equal(
      arHoldLens({ shown: "ok", raw: "covered", heldMs: AR_LENS_HOLD_UP_MS }),
      "covered",
    );
    assert.equal(
      arHoldLens({ shown: "covered", raw: "ok", heldMs: 400 }),
      "covered",
    );
    assert.equal(
      arHoldLens({
        shown: "covered",
        raw: "ok",
        heldMs: AR_LENS_HOLD_DOWN_MS,
      }),
      "ok",
    );
  });
});

describe("arLensProfile", () => {
  it("blocks place only when covered", () => {
    const ok = arLensProfile("ok", "place");
    assert.equal(ok.blocked, false);
    assert.equal(ok.coach, "");
    assert.equal(arLensShouldPlace(ok), true);

    const covered = arLensProfile("covered", "place");
    assert.equal(covered.blocked, true);
    assert.match(covered.coach, /finger|lens/i);
    assert.equal(arLensShouldPlace(covered), false);
  });
});

describe("arLensCoach", () => {
  it("is empty when clear and product-specific when covered", () => {
    assert.equal(arLensCoach("ok", "place"), "");
    assert.match(arLensCoach("covered", "place"), /lens/);
    assert.match(arLensCoach("covered", "scan"), /plaque/);
    assert.match(arLensCoach("covered", "emily"), /finger/);
    assert.match(arLensCoach("covered", "cubes"), /table/);
  });
});

describe("arParseLensEvent", () => {
  it("treats missing samples as unknown", () => {
    assert.deepEqual(arParseLensEvent(null), { mean: -1, variance: -1 });
    assert.equal(arParseLensEvent({ mean: 0.04, variance: 0.001 }).mean, 0.04);
  });
});
