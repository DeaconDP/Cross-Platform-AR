import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AR_MOTOR_HOLD_MS,
  AR_MOTOR_RELEASE_MS,
  arMotorApplyClass,
  arMotorBlocksPlace,
  arMotorCoach,
  arMotorKindFromFlags,
  arMotorParseNative,
  arMotorPrefersSelect,
  arMotorReadWeb,
  arMotorStep,
} from "./ar-motor.ts";

describe("arMotorKindFromFlags", () => {
  it("is ok when neither aid is on", () => {
    assert.equal(arMotorKindFromFlags({ switchOn: false, dwell: false }), "ok");
  });

  it("prefers switch over dwell", () => {
    assert.equal(arMotorKindFromFlags({ switchOn: true, dwell: true }), "switch");
  });

  it("treats autoclick as dwell", () => {
    assert.equal(arMotorKindFromFlags({ switchOn: false, dwell: true }), "dwell");
  });
});

describe("arMotorReadWeb", () => {
  it("is invalid in node without window", () => {
    const web = arMotorReadWeb();
    assert.equal(web.valid, false);
    assert.equal(web.switchOn, false);
    assert.equal(web.dwell, false);
  });
});

describe("arMotorStep", () => {
  it("stays ok until the hold elapses", () => {
    const t0 = 1_000;
    const a = arMotorStep(null, "switch", t0);
    assert.equal(a.kind, "ok");
    const b = arMotorStep(a, "switch", t0 + AR_MOTOR_HOLD_MS - 1);
    assert.equal(b.kind, "ok");
    const c = arMotorStep(b, "switch", t0 + AR_MOTOR_HOLD_MS);
    assert.equal(c.kind, "switch");
  });

  it("needs a longer hold to return to ok", () => {
    const t0 = 5_000;
    let h = arMotorStep(null, "dwell", t0);
    h = arMotorStep(h, "dwell", t0 + AR_MOTOR_HOLD_MS);
    assert.equal(h.kind, "dwell");
    h = arMotorStep(h, "ok", t0 + AR_MOTOR_HOLD_MS + 1);
    h = arMotorStep(h, "ok", t0 + AR_MOTOR_HOLD_MS + AR_MOTOR_RELEASE_MS - 1);
    assert.equal(h.kind, "dwell");
    h = arMotorStep(h, "ok", t0 + AR_MOTOR_HOLD_MS + 1 + AR_MOTOR_RELEASE_MS);
    assert.equal(h.kind, "ok");
  });
});

describe("arMotorCoach + blocks + select", () => {
  it("is silent when ok", () => {
    assert.equal(arMotorCoach("ok", "place"), null);
  });

  it("names the product", () => {
    assert.match(arMotorCoach("switch", "place") ?? "", /Switch scanning|Select|missed tap/i);
    assert.match(arMotorCoach("switch", "scan") ?? "", /hunting|Switch scanning/i);
    assert.match(arMotorCoach("switch", "emily") ?? "", /places me|Switch scanning/i);
    assert.match(arMotorCoach("switch", "cubes") ?? "", /cube|Switch scanning/i);
    assert.match(arMotorCoach("dwell", "place") ?? "", /Hover click|dwell/i);
    assert.match(arMotorCoach("dwell", "emily") ?? "", /Hover click|floor/i);
  });

  it("never blocks place", () => {
    assert.equal(arMotorBlocksPlace("ok", "place"), false);
    assert.equal(arMotorBlocksPlace("dwell", "place"), false);
    assert.equal(arMotorBlocksPlace("switch", "emily"), false);
    assert.equal(arMotorBlocksPlace("dwell", "scan"), false);
    assert.equal(arMotorBlocksPlace("switch", "cubes"), false);
  });

  it("asks hosts for a Select target when an aid is on", () => {
    assert.equal(arMotorPrefersSelect("ok"), false);
    assert.equal(arMotorPrefersSelect("dwell"), true);
    assert.equal(arMotorPrefersSelect("switch"), true);
  });
});

describe("arMotorApplyClass + parse", () => {
  it("toggles switch/dwell classes", () => {
    const el = {
      classList: {
        switchOn: false,
        dwell: false,
        toggle(name: string, on: boolean) {
          if (name === "is-ar-motor-switch") this.switchOn = on;
          if (name === "is-ar-motor-dwell") this.dwell = on;
        },
      },
    };
    arMotorApplyClass(el as unknown as Element, "switch");
    assert.equal(el.classList.switchOn, true);
    assert.equal(el.classList.dwell, false);
    arMotorApplyClass(el as unknown as Element, "ok");
    assert.equal(el.classList.switchOn, false);
    assert.equal(el.classList.dwell, false);
  });

  it("parses native payloads", () => {
    assert.deepEqual(
      arMotorParseNative({
        kind: "switch",
        switchOn: true,
        dwell: true,
        valid: true,
      }),
      {
        kind: "switch",
        switchOn: true,
        dwell: true,
        valid: true,
      },
    );
    assert.equal(arMotorParseNative({ switchOn: true }).kind, "switch");
    assert.equal(arMotorParseNative({ dwell: true }).kind, "dwell");
    assert.equal(arMotorParseNative({ kind: "nope" }).kind, "ok");
  });
});
