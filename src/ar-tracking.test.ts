import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeTrackingState, trackingCoach } from "./ar-tracking.ts";

describe("normalizeTrackingState", () => {
  it("maps ready to tracking and initializing to limited", () => {
    assert.equal(normalizeTrackingState("ready"), "tracking");
    assert.equal(normalizeTrackingState("initializing"), "limited");
  });

  it("maps unavailable to stopped", () => {
    assert.equal(normalizeTrackingState("unavailable"), "stopped");
  });
});

describe("trackingCoach", () => {
  it("stays quiet while tracking is healthy", () => {
    assert.equal(trackingCoach("tracking", false), null);
  });

  it("coaches a slow sweep before place", () => {
    const copy = trackingCoach("limited", false);
    assert.ok(copy && copy.toLowerCase().includes("slowly"));
  });
});
