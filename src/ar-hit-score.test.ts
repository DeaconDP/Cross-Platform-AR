import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { scoreXrHitDistance } from "./ar-hit-score.ts";

describe("scoreXrHitDistance", () => {
  it("prefers arm's-length surfaces over far floors", () => {
    assert.ok(scoreXrHitDistance(0.9) > scoreXrHitDistance(4.2));
  });

  it("penalizes glancing hits that are too close", () => {
    assert.ok(scoreXrHitDistance(1.0) > scoreXrHitDistance(0.12));
  });
});
