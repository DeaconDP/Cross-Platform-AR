import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  arArmStill,
  arGravityExcessG,
  arLinearG,
  arMergeMotion,
  arSampleExcessG,
  arStillAllowsPlace,
  arStillCoach,
  arStillKind,
  arStillPush,
  arTapWasShaky,
} from "./ar-still.ts";

describe("arLinearG / arGravityExcessG", () => {
  it("treats ~9.8 m/s² linear as about 1g", () => {
    assert.ok(Math.abs(arLinearG(0, 0, 9.81) - 1) < 0.02);
  });

  it("treats already-g linear as g", () => {
    assert.ok(Math.abs(arLinearG(0, 0, 0.3) - 0.3) < 0.001);
  });

  it("strips gravity from including-gravity samples", () => {
    assert.ok(arGravityExcessG(0, 0, 9.81) < 0.02);
    assert.ok(arGravityExcessG(0, 0, 1) < 0.02);
    assert.ok(arGravityExcessG(0, 0, 1.4) > 0.35);
  });

  it("uses linear vs gravity path from the sample flag", () => {
    assert.ok(arSampleExcessG({ ax: 0, ay: 0, az: 0.4, linear: true }) > 0.3);
    assert.ok(arSampleExcessG({ ax: 0, ay: 0, az: 1 }) < 0.02);
  });
});

describe("arStillPush", () => {
  it("ignores non-finite samples and seeds from a missing prev", () => {
    assert.equal(arStillPush(0.2, Number.NaN), 0.2);
    assert.equal(arStillPush(Number.NaN, 0.4), 0.4);
  });

  it("moves toward the sample", () => {
    const next = arStillPush(0, 1, 0.25);
    assert.equal(next, 0.25);
  });
});

describe("arStillKind", () => {
  it("is ok when still or unknown", () => {
    assert.equal(arStillKind(0), "ok");
    assert.equal(arStillKind(0.1), "ok");
    assert.equal(arStillKind(Number.NaN), "ok");
  });

  it("is busy then shaky as motion rises", () => {
    assert.equal(arStillKind(0.2), "busy");
    assert.equal(arStillKind(0.45), "shaky");
    assert.equal(arStillKind(1), "shaky");
  });

  it("only allows place when ok", () => {
    assert.equal(arStillAllowsPlace("ok"), true);
    assert.equal(arStillAllowsPlace("busy"), false);
    assert.equal(arStillAllowsPlace("shaky"), false);
  });
});

describe("arStillCoach", () => {
  it("is silent when still", () => {
    assert.equal(arStillCoach("ok"), null);
  });

  it("asks to hold still for place vs scan", () => {
    assert.match(arStillCoach("shaky") ?? "", /Hold the phone still/);
    assert.match(arStillCoach("busy") ?? "", /Pause a moment/);
    assert.match(arStillCoach("shaky", "scan") ?? "", /plaque/);
    assert.match(arStillCoach("busy", "scan") ?? "", /plaque/);
  });
});

describe("arMergeMotion", () => {
  it("uses web when native is missing", () => {
    assert.equal(arMergeMotion(0.3, null), 0.3);
  });

  it("uses native g when web is missing", () => {
    assert.equal(arMergeMotion(null, { g: 0.5 }), 0.5);
  });

  it("treats native moving without g as busy", () => {
    assert.ok(arMergeMotion(null, { moving: true }) >= 0.18);
  });

  it("takes the stronger of web and native", () => {
    assert.equal(arMergeMotion(0.1, { g: 0.4 }), 0.4);
    assert.equal(arMergeMotion(0.6, { g: 0.2 }), 0.6);
  });
});

describe("arTapWasShaky", () => {
  it("reads the native miss flag", () => {
    assert.equal(arTapWasShaky(undefined), false);
    assert.equal(arTapWasShaky({}), false);
    assert.equal(arTapWasShaky({ shaky: true }), true);
  });
});

describe("arArmStill", () => {
  it("applies native motion then clears after dispose", async () => {
    const kinds: string[] = [];
    const dispose = arArmStill({
      listenMotion: () => () => {},
      getNative: async () => ({ g: 0.6 }),
      onChange: (kind) => {
        kinds.push(kind);
      },
    });
    await Promise.resolve();
    await Promise.resolve();
    assert.ok(kinds.includes("shaky"));
    dispose();
  });

  it("smooths injected motion samples", async () => {
    let send!: (sample: { ax: number; ay: number; az: number; linear?: boolean }) => void;
    const kinds: string[] = [];
    const dispose = arArmStill({
      listenMotion: (cb) => {
        send = cb;
        return () => {};
      },
      onChange: (kind) => {
        kinds.push(kind);
      },
    });
    send({ ax: 0, ay: 0, az: 0.05, linear: true });
    assert.equal(kinds.at(-1), "ok");
    send({ ax: 0, ay: 0, az: 1.2, linear: true });
    send({ ax: 0, ay: 0, az: 1.2, linear: true });
    send({ ax: 0, ay: 0, az: 1.2, linear: true });
    send({ ax: 0, ay: 0, az: 1.2, linear: true });
    send({ ax: 0, ay: 0, az: 1.2, linear: true });
    send({ ax: 0, ay: 0, az: 1.2, linear: true });
    assert.equal(kinds.at(-1), "shaky");
    dispose();
  });

  it("ignores late native prefs after dispose", async () => {
    let resolveNative!: (v: { g: number }) => void;
    const pending = new Promise<{ g: number }>((resolve) => {
      resolveNative = resolve;
    });
    const kinds: string[] = [];
    const dispose = arArmStill({
      listenMotion: () => () => {},
      getNative: () => pending,
      onChange: (kind) => {
        kinds.push(kind);
      },
    });
    dispose();
    resolveNative({ g: 0.9 });
    await pending;
    await Promise.resolve();
    assert.equal(
      kinds.filter((k) => k === "shaky").length,
      0,
    );
  });
});
