import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clamp01,
  clientToViewNorm,
  isViewNorm,
  missHint,
  mulMv,
  unprojectViewNorm,
  viewNormToNdc,
  viewNormToPx,
} from "../src/ar-view-hit.ts";

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

describe("ar-view-hit", () => {
  it("clamps and detects view-normalized taps", () => {
    assert.equal(clamp01(-0.2), 0);
    assert.equal(clamp01(1.4), 1);
    assert.equal(isViewNorm(0.5, 0.25), true);
    assert.equal(isViewNorm(120, 80), false);
  });

  it("maps client points through the overlay rect", () => {
    const p = clientToViewNorm(150, 80, { left: 100, top: 40, width: 200, height: 80 });
    assert.equal(p.x, 0.25);
    assert.equal(p.y, 0.5);
  });

  it("latches the last non-zero view size", () => {
    assert.equal(viewNormToPx(0.5, 0.5, 0, 0), null);
    const px = viewNormToPx(0.5, 1, 0, 0, 200, 100);
    assert.deepEqual(px, { x: 100, y: 100 });
  });

  it("flips Y when going VIEW_NORMALIZED → NDC", () => {
    assert.deepEqual(viewNormToNdc(0.5, 0), { x: 0, y: 1 });
    assert.deepEqual(viewNormToNdc(0.5, 1), { x: 0, y: -1 });
    assert.deepEqual(viewNormToNdc(0, 0.5), { x: -1, y: 0 });
  });

  it("unprojects screen-center through identity view-proj along +Z", () => {
    const ray = unprojectViewNorm(IDENTITY, 0.5, 0.5);
    assert.ok(ray);
    assert.deepEqual(ray.origin, [0, 0, -1]);
    assert.ok(Math.abs(ray.direction[0]) < 1e-6);
    assert.ok(Math.abs(ray.direction[1]) < 1e-6);
    assert.ok(Math.abs(ray.direction[2] - 1) < 1e-6);
    assert.deepEqual(mulMv(IDENTITY, [1, 2, 3, 1]).slice(0, 3), [1, 2, 3]);
  });

  it("names miss reasons for overlay coaching", () => {
    assert.match(missHint("notTracking"), /locking on/i);
    assert.match(missHint("notReady"), /starting/i);
    assert.match(missHint("noSurface"), /flat surface/i);
    assert.equal(missHint("alreadyPlaced"), "");
  });
});
