import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  arArmPocket,
  arIsFaceDown,
  arIsNear,
  arJudgePocket,
  arPocketCoach,
  arPocketHoldMs,
  arPocketShouldExit,
  arSampleFromMotion,
} from "./ar-pocket.ts";

describe("ar-pocket", () => {
  it("uses the near boolean first", () => {
    assert.equal(arIsNear({ near: true, distanceCm: 40 }), true);
    assert.equal(arIsNear({ near: false, distanceCm: 1 }), false);
    assert.equal(arIsNear({ distanceCm: 2 }), true);
    assert.equal(arIsNear({ distanceCm: 12 }), false);
  });

  it("reads face-down by flag and platform sign", () => {
    assert.equal(arIsFaceDown({ facedown: true, accelZ: 9 }), true);
    assert.equal(arIsFaceDown({ facedown: false, accelZ: -9 }), false);
    assert.equal(arIsFaceDown({ accelZ: 9.6, faceUpSign: 1 }), false);
    assert.equal(arIsFaceDown({ accelZ: -8.2, faceUpSign: 1 }), true);
    assert.equal(arIsFaceDown({ accelZ: -9.6, faceUpSign: -1 }), false);
    assert.equal(arIsFaceDown({ accelZ: 8.2, faceUpSign: -1 }), true);
  });

  it("does not treat a hidden tab as a pocket", () => {
    assert.equal(arJudgePocket({ hidden: true }), "ok");
  });

  it("classifies near, face-down, and pocket", () => {
    assert.equal(arJudgePocket({ near: true, accelZ: 9.5, faceUpSign: 1 }), "near");
    assert.equal(arJudgePocket({ near: false, accelZ: -8, faceUpSign: 1 }), "facedown");
    assert.equal(arJudgePocket({ near: true, facedown: true }), "pocket");
    assert.equal(
      arJudgePocket({ near: true, accelY: 9.4, accelZ: 0.4, faceUpSign: 1 }),
      "pocket",
    );
    assert.equal(arJudgePocket({ near: true, hidden: true }), "pocket");
    assert.equal(arJudgePocket({ near: true, osBlanksOnNear: true }), "pocket");
  });

  it("uses cubes coach copy and hold times", () => {
    assert.equal(arPocketShouldExit("near"), false);
    assert.equal(arPocketHoldMs("near"), 0);
    assert.match(arPocketCoach("near", "cubes"), /Proximity/i);
    assert.ok(arPocketHoldMs("facedown") > arPocketHoldMs("pocket"));
    assert.match(arPocketCoach("pocket", "cubes"), /Pocketed/i);
  });

  it("copies motion axes", () => {
    const sample = arSampleFromMotion(
      { accelerationIncludingGravity: { y: 1, z: -8 } },
      1,
    );
    assert.equal(sample.accelY, 1);
    assert.equal(sample.accelZ, -8);
  });

  it("waits the pocket hold then exits once", () => {
    let t = 1000;
    const exits: string[] = [];
    const arm = arArmPocket({
      product: "cubes",
      now: () => t,
      onExit: (kind) => exits.push(kind),
    });
    arm.note({ near: true, facedown: true });
    t += 200;
    arm.note({ near: true, facedown: true });
    assert.deepEqual(exits, []);
    t += 250;
    arm.note({ near: true, facedown: true });
    assert.deepEqual(exits, ["pocket"]);
    arm.dispose();
  });
});
