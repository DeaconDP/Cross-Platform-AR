import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AR_SHAKE_COOLDOWN_MS,
  AR_SHAKE_PEAK,
  arShakeArm,
  arShakeCoach,
  arShakeDominantSign,
  arShakeFromDeviceMotion,
  arShakeFresh,
  arShakeReducedMotion,
  arShakeShouldLift,
  arShakeTick,
} from "../src/ar-shake.ts";

const peak = AR_SHAKE_PEAK + 0.4;

describe("arShakeDominantSign", () => {
  it("picks the largest axis", () => {
    assert.equal(arShakeDominantSign(4, 1, -1), 1);
    assert.equal(arShakeDominantSign(-4, 1, 1), -1);
    assert.equal(arShakeDominantSign(1, 5, 0), 1);
    assert.equal(arShakeDominantSign(0, 0, -3), -1);
  });
});

describe("arShakeTick", () => {
  it("ignores a single walking pulse", () => {
    const once = arShakeTick(arShakeFresh(0), { ax: peak, ay: 0, az: 0 }, 10);
    assert.equal(once.fire, false);
    assert.equal(once.shaking, true);
    assert.equal(arShakeTick(once.state, { ax: 0.1, ay: 0, az: 0 }, 80).fire, false);
  });

  it("fires after two opposite peaks in the window", () => {
    const a = arShakeTick(arShakeFresh(0), { ax: peak, ay: 0, az: 0 }, 10);
    const b = arShakeTick(a.state, { ax: -peak, ay: 0, az: 0 }, 80);
    assert.equal(b.fire, true);
    assert.equal(b.state.lastFire, 80);
  });

  it("does not fire again during cooldown", () => {
    const a = arShakeTick(arShakeFresh(0), { ax: peak, ay: 0, az: 0 }, 10);
    const fired = arShakeTick(a.state, { ax: -peak, ay: 0, az: 0 }, 80);
    assert.equal(fired.fire, true);
    const again = arShakeTick(fired.state, { ax: peak, ay: 0, az: 0 }, 120);
    const third = arShakeTick(again.state, { ax: -peak, ay: 0, az: 0 }, 160);
    assert.equal(third.fire, false);
    const later = arShakeTick(
      third.state,
      { ax: peak, ay: 0, az: 0 },
      80 + AR_SHAKE_COOLDOWN_MS + 10,
    );
    const ready = arShakeTick(
      later.state,
      { ax: -peak, ay: 0, az: 0 },
      80 + AR_SHAKE_COOLDOWN_MS + 50,
    );
    assert.equal(ready.fire, true);
  });
});

describe("arShakeFromDeviceMotion", () => {
  it("prefers user acceleration", () => {
    assert.deepEqual(
      arShakeFromDeviceMotion({
        acceleration: { x: 1, y: 2, z: 3 },
        accelerationIncludingGravity: { x: 9, y: 9, z: 9 },
      }),
      { ax: 1, ay: 2, az: 3 },
    );
  });

  it("strips gravity when only including-gravity is present", () => {
    const sample = arShakeFromDeviceMotion({
      accelerationIncludingGravity: { x: 0, y: 0, z: 9.81 },
    });
    assert.ok(sample);
    assert.ok(Math.abs(sample.az) < 0.01);
  });

  it("returns null when empty", () => {
    assert.equal(arShakeFromDeviceMotion({}), null);
  });
});

describe("arShakeShouldLift / coach", () => {
  it("lifts only after a place (not image scan)", () => {
    assert.equal(arShakeShouldLift("place", true), true);
    assert.equal(arShakeShouldLift("place", false), false);
    assert.equal(arShakeShouldLift("scan", true), false);
    assert.equal(arShakeShouldLift("cubes", true), true);
  });

  it("coaches lift copy after place", () => {
    assert.equal(
      arShakeCoach({ placed: true, kind: "place" }),
      "Shake the phone to lift it and place again.",
    );
    assert.equal(arShakeCoach({ placed: false, kind: "place" }), null);
    assert.equal(
      arShakeCoach({ placed: true, kind: "place", reducedMotion: true }),
      null,
    );
    assert.equal(
      arShakeCoach({ placed: true, kind: "cubes" }),
      "Shake to lift the last cube.",
    );
  });

  it("reads reduced-motion from matchMedia", () => {
    assert.equal(arShakeReducedMotion(() => ({ matches: true })), true);
    assert.equal(arShakeReducedMotion(() => ({ matches: false })), false);
  });
});

describe("arShakeArm", () => {
  it("lifts on a DeviceMotion shake after placed", () => {
    let lifts = 0;
    const listeners = new Set<(ev: DeviceMotionEvent) => void>();
    const arm = arShakeArm({
      onLift: () => {
        lifts += 1;
      },
      now: () => 20,
      matchMedia: () => ({ matches: false }),
      motion: {
        add: (_t, fn) => {
          listeners.add(fn);
        },
        remove: (_t, fn) => {
          listeners.delete(fn);
        },
      },
    });
    arm.notePlaced(true);
    for (const fn of listeners) {
      fn({ acceleration: { x: peak, y: 0, z: 0 } } as DeviceMotionEvent);
      fn({ acceleration: { x: -peak, y: 0, z: 0 } } as DeviceMotionEvent);
    }
    assert.equal(lifts, 1);
    arm.dispose();
    assert.equal(listeners.size, 0);
  });

  it("does not lift before place or for scan", () => {
    let lifts = 0;
    const listeners = new Set<(ev: DeviceMotionEvent) => void>();
    const fire = (armKind: "place" | "scan", placed: boolean) => {
      const arm = arShakeArm({
        kind: armKind,
        onLift: () => {
          lifts += 1;
        },
        now: () => 20,
        matchMedia: () => ({ matches: false }),
        motion: {
          add: (_t, fn) => {
            listeners.add(fn);
          },
          remove: (_t, fn) => {
            listeners.delete(fn);
          },
        },
      });
      arm.notePlaced(placed);
      for (const fn of listeners) {
        fn({ acceleration: { x: peak, y: 0, z: 0 } } as DeviceMotionEvent);
        fn({ acceleration: { x: -peak, y: 0, z: 0 } } as DeviceMotionEvent);
      }
      arm.dispose();
      listeners.clear();
    };
    fire("place", false);
    fire("scan", true);
    assert.equal(lifts, 0);
  });
});
