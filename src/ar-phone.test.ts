import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AR_PHONE_ACTIVE_HOLD_MS,
  AR_PHONE_RING_HOLD_MS,
  arArmPhone,
  arJudgePhone,
  arPhoneBlocksPlace,
  arPhoneCoach,
  arPhoneHoldMs,
  arPhoneShouldClose,
  arReadBrowserPhone,
} from "./ar-phone.ts";

describe("arJudgePhone", () => {
  it("treats unsupported as ok", () => {
    assert.equal(arJudgePhone({ supported: false, inCall: true }), "ok");
  });

  it("ranks in-call and interrupt above ringing", () => {
    assert.equal(arJudgePhone({ inCall: true, ringing: true }), "active");
    assert.equal(arJudgePhone({ interrupted: true }), "active");
    assert.equal(arJudgePhone({ ringing: true }), "ringing");
    assert.equal(arJudgePhone({}), "ok");
  });
});

describe("arPhoneCoach", () => {
  it("is silent when ok", () => {
    assert.equal(arPhoneCoach("ok", "place"), "");
  });

  it("names ringing vs active per product", () => {
    assert.match(arPhoneCoach("ringing", "place"), /Call coming in/);
    assert.match(arPhoneCoach("ringing", "emily"), /calling/);
    assert.match(arPhoneCoach("active", "scan"), /plaque/);
    assert.match(arPhoneCoach("active", "cubes"), /paused/);
  });
});

describe("arPhoneBlocksPlace / close / hold", () => {
  it("blocks place while ringing or on a call", () => {
    assert.equal(arPhoneBlocksPlace("ok"), false);
    assert.equal(arPhoneBlocksPlace("ringing"), true);
    assert.equal(arPhoneBlocksPlace("active"), true);
  });

  it("closes only once the call is active", () => {
    assert.equal(arPhoneShouldClose("ringing"), false);
    assert.equal(arPhoneShouldClose("active"), true);
  });

  it("holds ringing shorter than an active call", () => {
    assert.equal(arPhoneHoldMs("ringing"), AR_PHONE_RING_HOLD_MS);
    assert.equal(arPhoneHoldMs("active"), AR_PHONE_ACTIVE_HOLD_MS);
    assert.equal(arPhoneHoldMs("ok"), 0);
  });
});

describe("arReadBrowserPhone", () => {
  it("maps AudioContext interrupted to a call-like pause", () => {
    const sample = arReadBrowserPhone({ state: "interrupted" });
    assert.equal(sample.interrupted, true);
    assert.equal(sample.reason, "focus");
    assert.equal(arJudgePhone(sample), "active");
  });

  it("is unsupported without a context", () => {
    assert.equal(arReadBrowserPhone(null).supported, false);
    assert.equal(arJudgePhone(arReadBrowserPhone(null)), "ok");
  });
});

describe("arArmPhone", () => {
  it("holds before coaching so a one-frame ring is ignored", () => {
    const kinds: string[] = [];
    let clock = 0;
    const arm = arArmPhone({
      product: "place",
      now: () => clock,
      onKind: (k) => kinds.push(k),
    });
    arm.note({ ringing: true });
    assert.deepEqual(kinds, []);
    clock += AR_PHONE_RING_HOLD_MS;
    arm.note({ ringing: true });
    assert.deepEqual(kinds, ["ringing"]);
    arm.note({ ringing: false, inCall: false, interrupted: false });
    assert.deepEqual(kinds, ["ringing", "ok"]);
    arm.dispose();
  });

  it("needs a longer hold before closing on an active call", () => {
    const kinds: string[] = [];
    let clock = 0;
    const arm = arArmPhone({
      product: "place",
      now: () => clock,
      onKind: (k) => kinds.push(k),
    });
    arm.note({ inCall: true });
    clock += AR_PHONE_RING_HOLD_MS;
    arm.note({ inCall: true });
    assert.deepEqual(kinds, []);
    clock += AR_PHONE_ACTIVE_HOLD_MS;
    arm.note({ inCall: true });
    assert.deepEqual(kinds, ["active"]);
    arm.dispose();
  });
});
