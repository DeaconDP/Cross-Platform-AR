import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AR_PREFLIGHT_COACH,
  arBrowserFlags,
  arDeniedCoach,
  arIsSecureContext,
  arJudgePreflight,
  arMayRevealCamera,
} from "../src/ar-preflight.ts";

describe("arJudgePreflight", () => {
  it("reveals when granted and available", () => {
    const v = arJudgePreflight({ permission: "granted", available: true });
    assert.equal(v.ok, true);
    assert.equal(arMayRevealCamera(v), true);
  });

  it("holds chrome for a camera prompt", () => {
    const v = arJudgePreflight({ permission: "prompt", available: true });
    assert.deepEqual(v, {
      ok: true,
      reveal: false,
      reason: "prompt",
      coach: AR_PREFLIGHT_COACH.prompt,
    });
  });

  it("fails denied before any chrome swap", () => {
    const v = arJudgePreflight({ permission: "denied", available: true });
    assert.equal(v.ok, false);
    if (!v.ok) assert.equal(v.reason, "denied");
    assert.equal(arMayRevealCamera(v), false);
  });

  it("fails unavailable unless Play Services still needs install", () => {
    const miss = arJudgePreflight({ available: false });
    assert.equal(miss.ok, false);
    if (!miss.ok) assert.equal(miss.reason, "unavailable");
    const install = arJudgePreflight({ available: false, installNeeded: true });
    assert.deepEqual(install, {
      ok: true,
      reveal: false,
      reason: "install",
      coach: AR_PREFLIGHT_COACH.install,
    });
  });

  it("rejects insecure, busy, and tiny views", () => {
    assert.equal(arJudgePreflight({ insecure: true }).ok, false);
    assert.equal(arJudgePreflight({ cameraBusy: true }).ok, false);
    const tiny = arJudgePreflight({ viewW: 180, viewH: 800, available: true });
    assert.equal(tiny.ok, false);
    if (!tiny.ok) assert.equal(tiny.reason, "tiny");
  });

  it("ignores missing or zero view size", () => {
    const v = arJudgePreflight({ viewW: 0, viewH: 0, available: true });
    assert.equal(arMayRevealCamera(v), true);
  });
});

describe("arIsSecureContext", () => {
  it("allows https, capacitor, localhost http", () => {
    assert.equal(arIsSecureContext(true, "http:", "192.168.1.8"), true);
    assert.equal(arIsSecureContext(undefined, "https:", "example.com"), true);
    assert.equal(arIsSecureContext(undefined, "capacitor:", "localhost"), true);
    assert.equal(arIsSecureContext(undefined, "http:", "127.0.0.1"), true);
  });

  it("rejects LAN http", () => {
    assert.equal(arIsSecureContext(false, "http:", "192.168.1.8"), false);
    assert.equal(arIsSecureContext(undefined, "http:", "192.168.1.8"), false);
  });
});

describe("arBrowserFlags + denied copy", () => {
  it("flags insecure LAN pages", () => {
    const flags = arBrowserFlags({
      protocol: "http:",
      hostname: "10.0.0.4",
      innerWidth: 390,
      innerHeight: 844,
    });
    assert.equal(flags.insecure, true);
    assert.equal(flags.viewW, 390);
  });

  it("uses product denied copy", () => {
    assert.match(arDeniedCoach("cube"), /Cube AR/);
  });
});
