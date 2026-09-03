import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canFaceTarget, faceYawDeg, faceYawRad } from "./ar-pose.ts";

describe("arPose", () => {
  it("refuses to aim when camera and target overlap", () => {
    assert.equal(canFaceTarget(1, 1, 1, 1), false);
    assert.equal(canFaceTarget(0, 1, 0, 0), true);
  });

  it("faces +Z toward a camera in front", () => {
    assert.ok(Math.abs(faceYawRad(0, 2, 0, 0)) < 1e-6);
    assert.ok(Math.abs(faceYawDeg(0, 2, 0, 0)) < 1e-6);
  });

  it("yaws +90° when the camera is to +X", () => {
    assert.ok(Math.abs(faceYawDeg(3, 0, 0, 0) - 90) < 1e-6);
  });

  it("yaws −90° when the camera is to −X", () => {
    assert.ok(Math.abs(faceYawDeg(-2, 0, 0, 0) + 90) < 1e-6);
  });
});
