import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  asTrackingState,
  coachForTracking,
  mapCameraTracking,
} from "./ar-tracking.ts";

describe("mapCameraTracking", () => {
  it("stays initializing until a surface exists", () => {
    assert.equal(mapCameraTracking("tracking", false), "initializing");
    assert.equal(mapCameraTracking("normal", false), "initializing");
  });

  it("is ready once the camera is tracking a surface", () => {
    assert.equal(mapCameraTracking("tracking", true), "ready");
    assert.equal(mapCameraTracking("normal", true), "ready");
  });

  it("maps limited / paused / lost cameras", () => {
    assert.equal(mapCameraTracking("paused", true), "limited");
    assert.equal(mapCameraTracking("limited", true), "limited");
    assert.equal(mapCameraTracking("stopped", true), "unavailable");
    assert.equal(mapCameraTracking("notAvailable", false), "unavailable");
  });
});

describe("coachForTracking", () => {
  it("keeps explore copy after place", () => {
    assert.equal(coachForTracking("ready", { placed: true }), null);
  });

  it("coaches table-top hunt and tap", () => {
    assert.equal(
      coachForTracking("initializing"),
      "Move your phone to find a surface",
    );
    assert.equal(coachForTracking("ready"), "Tap to place a cube");
  });

  it("prefers native limited/unavailable messages", () => {
    assert.equal(
      coachForTracking("limited", { message: "Move more slowly" }),
      "Move more slowly",
    );
  });
});

describe("asTrackingState", () => {
  it("falls back to initializing on junk", () => {
    assert.equal(asTrackingState("ready"), "ready");
    assert.equal(asTrackingState("nope"), "initializing");
  });
});
