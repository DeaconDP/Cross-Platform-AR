import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  intersectRayPlane,
  pickAnalyticHit,
  rankAnalyticHit,
} from "./ar-ray-plane.ts";

describe("intersectRayPlane", () => {
  it("hits a table under a downward look", () => {
    const hit = intersectRayPlane(
      { x: 0, y: 1.4, z: 0 },
      { x: 0, y: -0.7, z: -0.714 },
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
    );
    assert.ok(hit);
    assert.ok(Math.abs(hit.point.y) < 1e-6);
    assert.ok(hit.t > 1.5 && hit.t < 2.2);
  });

  it("rejects a ray parallel to the plane", () => {
    assert.equal(
      intersectRayPlane(
        { x: 0, y: 1, z: 0 },
        { x: 0, y: 0, z: -1 },
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 1, z: 0 },
      ),
      null,
    );
  });

  it("rejects hits behind the camera", () => {
    assert.equal(
      intersectRayPlane(
        { x: 0, y: 1, z: 0 },
        { x: 0, y: 1, z: 0 },
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 1, z: 0 },
      ),
      null,
    );
  });
});

describe("pickAnalyticHit", () => {
  it("prefers in-polygon over extents over loose", () => {
    const picked = pickAnalyticHit([
      { t: 0.4, inPolygon: false, inExtents: false, centerDist: 0.5 },
      { t: 1.2, inPolygon: false, inExtents: true, centerDist: 0.3 },
      { t: 1.8, inPolygon: true, inExtents: true, centerDist: 0.1 },
    ]);
    assert.ok(picked);
    assert.equal(rankAnalyticHit(picked), 0);
    assert.equal(picked.t, 1.8);
  });

  it("drops far loose misses", () => {
    assert.equal(
      pickAnalyticHit([
        { t: 7, inPolygon: false, inExtents: false, centerDist: 3 },
      ]),
      null,
    );
  });

  it("picks the nearer of two polygon hits", () => {
    const picked = pickAnalyticHit([
      { t: 2.4, inPolygon: true, inExtents: true, centerDist: 0.2 },
      { t: 1.1, inPolygon: true, inExtents: true, centerDist: 0.4 },
    ]);
    assert.ok(picked);
    assert.equal(picked.t, 1.1);
  });
});
