import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AR_IMU_HOLD_DOWN_MS,
  AR_IMU_HOLD_UP_MS,
  AR_IMU_STUCK_MAG,
  AR_IMU_WILD_MAG,
  arHoldImu,
  arImuCoach,
  arImuProfile,
  arJudgeImu,
  arParseImuEvent,
  arSampleDeviceMotion,
} from "./ar-imu.ts";

const live = (gravityMag: number, extra: Partial<Parameters<typeof arJudgeImu>[0]> = {}) =>
  arJudgeImu({
    live: true,
    hasAccel: true,
    hasGyro: true,
    gravityMag,
    ...extra,
  });

describe("arJudgeImu", () => {
  it("treats unknown / waiting samples as ok", () => {
    assert.equal(
      arJudgeImu({
        live: false,
        hasAccel: false,
        hasGyro: false,
        gravityMag: -1,
      }),
      "ok",
    );
  });

  it("promotes a silent sensor to missing after the wait", () => {
    assert.equal(
      arJudgeImu(
        { live: false, hasAccel: false, hasGyro: false, gravityMag: -1 },
        { waitExpired: true },
      ),
      "missing",
    );
  });

  it("flags denied before missing", () => {
    assert.equal(
      arJudgeImu(
        {
          live: false,
          hasAccel: false,
          hasGyro: false,
          gravityMag: -1,
          denied: true,
        },
        { waitExpired: true },
      ),
      "denied",
    );
  });

  it("flags stuck when gravity is near zero or wild", () => {
    assert.equal(live(9.81), "ok");
    assert.equal(live(AR_IMU_STUCK_MAG), "ok");
    assert.equal(live(AR_IMU_STUCK_MAG - 0.01), "stuck");
    assert.equal(live(AR_IMU_WILD_MAG + 1), "stuck");
  });
});

describe("arHoldImu", () => {
  it("holds 600ms before raising and 800ms before clearing", () => {
    assert.equal(arHoldImu({ shown: "ok", raw: "stuck", heldMs: 200 }), "ok");
    assert.equal(
      arHoldImu({ shown: "ok", raw: "missing", heldMs: AR_IMU_HOLD_UP_MS }),
      "missing",
    );
    assert.equal(arHoldImu({ shown: "stuck", raw: "ok", heldMs: 400 }), "stuck");
    assert.equal(
      arHoldImu({
        shown: "stuck",
        raw: "ok",
        heldMs: AR_IMU_HOLD_DOWN_MS,
      }),
      "ok",
    );
  });
});

describe("arImuCoach", () => {
  it("is silent when sensors are healthy", () => {
    assert.equal(arImuCoach("ok", "place"), "");
  });

  it("tells place visitors about Settings, 3D view, and force-stop", () => {
    assert.match(arImuCoach("denied", "place"), /Motion|Settings/i);
    assert.match(arImuCoach("missing", "place"), /3D view|motion/i);
    assert.match(arImuCoach("stuck", "place"), /frozen|Force-stop/i);
  });

  it("keeps scan copy on the printed mark", () => {
    assert.match(arImuCoach("missing", "scan"), /mark|3D view/i);
    assert.match(arImuCoach("stuck", "scan"), /frozen/i);
  });
});

describe("arImuProfile", () => {
  it("carries coach and placed through the judge", () => {
    const stuck = arImuProfile(
      {
        live: true,
        hasAccel: true,
        hasGyro: true,
        gravityMag: 0.1,
        placed: false,
      },
      "place",
    );
    assert.equal(stuck.kind, "stuck");
    assert.ok(stuck.coach.length > 0);
    const ok = arImuProfile(
      {
        live: true,
        hasAccel: true,
        hasGyro: true,
        gravityMag: 9.8,
        placed: true,
      },
      "emily",
    );
    assert.equal(ok.kind, "ok");
    assert.equal(ok.coach, "");
    assert.equal(ok.placed, true);
  });
});

describe("arParseImuEvent", () => {
  it("reads native payloads and ignores junk", () => {
    assert.deepEqual(
      arParseImuEvent({
        live: true,
        hasAccel: true,
        hasGyro: false,
        gravityMag: 9.4,
        placed: true,
      }),
      {
        live: true,
        hasAccel: true,
        hasGyro: false,
        gravityMag: 9.4,
        denied: false,
        placed: true,
      },
    );
    assert.equal(arParseImuEvent(null).live, false);
    assert.equal(arParseImuEvent({ gravityMag: Number.NaN }).gravityMag, -1);
  });
});

describe("arSampleDeviceMotion", () => {
  it("reads accelerationIncludingGravity as gravity magnitude", () => {
    const sample = arSampleDeviceMotion({
      accelerationIncludingGravity: { x: 0, y: 0, z: 9.8 },
      rotationRate: null,
    } as DeviceMotionEvent);
    assert.equal(sample.live, true);
    assert.ok(Math.abs(sample.gravityMag - 9.8) < 0.01);
  });
});
