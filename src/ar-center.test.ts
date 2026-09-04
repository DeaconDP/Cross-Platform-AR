import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AR_CENTER_NORM,
  arCenterCoach,
  arCenterPx,
  arIsChromeTarget,
  arIsPlaceKey,
  arIsPlacePad,
  arIsTypingTarget,
  arShouldCenterPlace,
} from "./ar-center.ts";

describe("AR_CENTER_NORM", () => {
  it("is the camera middle", () => {
    assert.deepEqual(AR_CENTER_NORM, { x: 0.5, y: 0.5 });
  });
});

describe("arIsPlaceKey", () => {
  it("accepts Space and Enter", () => {
    assert.equal(arIsPlaceKey(" "), true);
    assert.equal(arIsPlaceKey("Enter"), true);
    assert.equal(arIsPlaceKey("Spacebar"), true);
    assert.equal(arIsPlaceKey("Escape"), false);
    assert.equal(arIsPlaceKey("p"), false);
  });
});

describe("arIsTypingTarget / arIsChromeTarget", () => {
  it("treats missing targets as safe to place", () => {
    assert.equal(arIsTypingTarget(null), false);
    assert.equal(arIsChromeTarget(null), false);
  });
});

describe("arShouldCenterPlace", () => {
  it("places on Space when focus is not chrome", () => {
    assert.equal(arShouldCenterPlace({ key: " " }), true);
    assert.equal(arShouldCenterPlace({ key: "Enter" }), true);
  });

  it("ignores repeats, chords, and other keys", () => {
    assert.equal(arShouldCenterPlace({ key: " ", repeat: true }), false);
    assert.equal(arShouldCenterPlace({ key: " ", metaKey: true }), false);
    assert.equal(arShouldCenterPlace({ key: " ", ctrlKey: true }), false);
    assert.equal(arShouldCenterPlace({ key: "Escape" }), false);
  });
});

describe("arIsPlacePad", () => {
  it("fires on A/Cross rising edge only", () => {
    assert.equal(arIsPlacePad(0, true, false), true);
    assert.equal(arIsPlacePad(0, true, true), false);
    assert.equal(arIsPlacePad(0, false, false), false);
    assert.equal(arIsPlacePad(1, true, false), false);
  });
});

describe("arCenterPx", () => {
  it("halves the live view", () => {
    assert.deepEqual(arCenterPx(390, 844), { x: 195, y: 422 });
    assert.deepEqual(arCenterPx(0, 0), { x: 0, y: 0 });
    assert.deepEqual(arCenterPx(-10, 20), { x: 0, y: 10 });
  });
});

describe("arCenterCoach", () => {
  it("stays quiet after a place", () => {
    assert.equal(arCenterCoach({ placed: true }), null);
  });

  it("offers Space for place and scan", () => {
    assert.equal(
      arCenterCoach({}),
      "Tap a surface, or press Space to place.",
    );
    assert.equal(
      arCenterCoach({ kind: "scan" }),
      "Point at the marker, or press Space.",
    );
  });
});
