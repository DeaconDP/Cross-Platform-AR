import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { platformFromCapacitor, screenToNativeTap } from "./ar-coords.ts";

describe("screenToNativeTap", () => {
  it("leaves iOS taps in CSS points (ARKit raycastQuery)", () => {
    assert.deepEqual(
      screenToNativeTap({ clientX: 120, clientY: 340, platform: "ios", devicePixelRatio: 3 }),
      { x: 120, y: 340 },
    );
  });

  it("scales Android taps by devicePixelRatio (ARCore view pixels)", () => {
    assert.deepEqual(
      screenToNativeTap({ clientX: 120, clientY: 340, platform: "android", devicePixelRatio: 2.5 }),
      { x: 300, y: 850 },
    );
  });

  it("does not scale browser / web fallbacks", () => {
    assert.deepEqual(
      screenToNativeTap({ clientX: 10, clientY: 20, platform: "web", devicePixelRatio: 3 }),
      { x: 10, y: 20 },
    );
  });

  it("defaults missing dpr to 1", () => {
    assert.deepEqual(screenToNativeTap({ clientX: 8, clientY: 9, platform: "android" }), {
      x: 8,
      y: 9,
    });
  });
});

describe("platformFromCapacitor", () => {
  it("maps known shells and falls back to web", () => {
    assert.equal(platformFromCapacitor("ios"), "ios");
    assert.equal(platformFromCapacitor("android"), "android");
    assert.equal(platformFromCapacitor("web"), "web");
    assert.equal(platformFromCapacitor("electron"), "web");
  });
});
