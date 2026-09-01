import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pickCubeXrHit, XR_TRANSIENT_HIT_MS } from "./ar-hit.ts";

describe("pickCubeXrHit", () => {
  it("places at the finger when a transient hit is fresh", () => {
    assert.equal(
      pickCubeXrHit({
        transientVisible: true,
        reticleVisible: true,
        transientAgeMs: 30,
      }),
      "transient",
    );
  });

  it("uses the reticle when the finger hit is stale or missing", () => {
    assert.equal(
      pickCubeXrHit({
        transientVisible: true,
        reticleVisible: true,
        transientAgeMs: XR_TRANSIENT_HIT_MS + 10,
      }),
      "reticle",
    );
    assert.equal(
      pickCubeXrHit({ transientVisible: false, reticleVisible: true }),
      "reticle",
    );
  });

  it("returns null when no surface is ready", () => {
    assert.equal(
      pickCubeXrHit({ transientVisible: false, reticleVisible: false }),
      null,
    );
  });
});
