import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AR_STAY_COPY,
  arOrientationLockType,
  arReadOrientation,
  arStay,
  arStayMismatch,
} from "./ar-stay.ts";

describe("arStay", () => {
  it("reads portrait and landscape from Screen Orientation types", () => {
    assert.equal(arReadOrientation({ type: "portrait-primary" }), "portrait");
    assert.equal(arReadOrientation({ type: "landscape-primary" }), "landscape");
  });

  it("falls back to window.orientation angles and box size", () => {
    assert.equal(arReadOrientation({ angle: 90 }), "landscape");
    assert.equal(arReadOrientation({ angle: 0 }), "portrait");
    assert.equal(arReadOrientation({ innerWidth: 844, innerHeight: 390 }), "landscape");
    assert.equal(arReadOrientation({ innerWidth: 390, innerHeight: 844 }), "portrait");
    assert.equal(arReadOrientation({}), "any");
  });

  it("locks only a known axis", () => {
    assert.equal(arOrientationLockType("portrait"), "portrait");
    assert.equal(arOrientationLockType("any"), null);
  });

  it("flags a real rotate against the locked axis", () => {
    assert.equal(arStayMismatch("portrait", "landscape"), true);
    assert.equal(arStayMismatch("portrait", "portrait"), false);
    assert.equal(arStayMismatch("any", "landscape"), false);
  });

  it("release is idempotent and visitor copy is set", () => {
    const stay = arStay({ keepAwake: false, lockOrientation: false, immersive: false });
    stay.release();
    stay.release();
    assert.match(AR_STAY_COPY.rotate, /phone/);
  });
});
