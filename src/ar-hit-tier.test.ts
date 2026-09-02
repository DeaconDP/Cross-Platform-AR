import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  HIT_MAX_M,
  HIT_MIN_M,
  distance3,
  inComfortRange,
  pickHitTier,
} from "./ar-hit-tier.ts";

describe("ar-hit-tier", () => {
  it("prefers a polygon hit over extents and infinite", () => {
    assert.equal(
      pickHitTier({
        horizontal: true,
        inPolygon: true,
        inExtents: true,
        distanceM: 4,
      }),
      "polygon",
    );
  });

  it("uses extents when the tap is on the grown AABB but off the mesh", () => {
    assert.equal(
      pickHitTier({
        horizontal: true,
        inPolygon: false,
        inExtents: true,
        distanceM: 1.2,
      }),
      "extents",
    );
  });

  it("accepts a comfort-range infinite hit once a plane exists", () => {
    assert.equal(
      pickHitTier({
        horizontal: true,
        inPolygon: false,
        inExtents: false,
        distanceM: 1,
      }),
      "infinite",
    );
  });

  it("rejects horizon / too-close infinite hits", () => {
    assert.equal(
      pickHitTier({
        horizontal: true,
        inPolygon: false,
        inExtents: false,
        distanceM: HIT_MIN_M - 0.01,
      }),
      null,
    );
    assert.equal(
      pickHitTier({
        horizontal: true,
        inPolygon: false,
        inExtents: false,
        distanceM: HIT_MAX_M + 0.01,
      }),
      null,
    );
  });

  it("ignores walls and ceilings", () => {
    assert.equal(
      pickHitTier({
        horizontal: false,
        inPolygon: true,
        inExtents: true,
        distanceM: 1,
      }),
      null,
    );
  });

  it("measures camera-to-hit distance", () => {
    assert.ok(inComfortRange(distance3(0, 1.4, 0, 0, 0, 1.2)));
    assert.equal(distance3(0, 0, 0, 3, 4, 0), 5);
  });
});
