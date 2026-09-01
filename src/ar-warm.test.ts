import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nextWarmAction } from "./ar-warm.ts";

describe("nextWarmAction", () => {
  it("skips on web", () => {
    assert.equal(nextWarmAction({ native: false, alreadyWarmed: false }), "skip");
  });

  it("warms the native runtime once", () => {
    assert.equal(nextWarmAction({ native: true, alreadyWarmed: false }), "runtime");
    assert.equal(nextWarmAction({ native: true, alreadyWarmed: true }), "skip");
  });
});
