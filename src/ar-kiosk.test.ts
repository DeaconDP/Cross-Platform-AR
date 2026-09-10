import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AR_KIOSK_HOLD_MS,
  AR_KIOSK_RELEASE_MS,
  arKioskApplyClass,
  arKioskBlocksPlace,
  arKioskCoach,
  arKioskKindFromFlags,
  arKioskParseNative,
  arKioskReadWeb,
  arKioskStep,
} from "./ar-kiosk.ts";

describe("arKioskKindFromFlags", () => {
  it("is ok when the device is not locked", () => {
    assert.equal(arKioskKindFromFlags({ pinned: false, policy: false }), "ok");
  });

  it("prefers policy over pinned", () => {
    assert.equal(arKioskKindFromFlags({ pinned: true, policy: true }), "policy");
  });

  it("treats Guided Access / Lock Task as pinned", () => {
    assert.equal(
      arKioskKindFromFlags({ pinned: true, policy: false }),
      "pinned",
    );
  });
});

describe("arKioskReadWeb", () => {
  it("is never valid — fullscreen is not Guided Access", () => {
    const web = arKioskReadWeb();
    assert.equal(web.valid, false);
    assert.equal(web.pinned, false);
    assert.equal(web.policy, false);
  });
});

describe("arKioskStep", () => {
  it("stays ok until the hold elapses", () => {
    const t0 = 1_000;
    const a = arKioskStep(null, "pinned", t0);
    assert.equal(a.kind, "ok");
    const b = arKioskStep(a, "pinned", t0 + AR_KIOSK_HOLD_MS - 1);
    assert.equal(b.kind, "ok");
    const c = arKioskStep(b, "pinned", t0 + AR_KIOSK_HOLD_MS);
    assert.equal(c.kind, "pinned");
  });

  it("needs a longer hold to return to ok", () => {
    const t0 = 5_000;
    let h = arKioskStep(null, "policy", t0);
    h = arKioskStep(h, "policy", t0 + AR_KIOSK_HOLD_MS);
    assert.equal(h.kind, "policy");
    h = arKioskStep(h, "ok", t0 + AR_KIOSK_HOLD_MS + 1);
    h = arKioskStep(h, "ok", t0 + AR_KIOSK_HOLD_MS + AR_KIOSK_RELEASE_MS - 1);
    assert.equal(h.kind, "policy");
    h = arKioskStep(h, "ok", t0 + AR_KIOSK_HOLD_MS + 1 + AR_KIOSK_RELEASE_MS);
    assert.equal(h.kind, "ok");
  });
});

describe("arKioskCoach + blocks", () => {
  it("is silent when ok", () => {
    assert.equal(arKioskCoach("ok", "place"), null);
  });

  it("names the product", () => {
    assert.match(arKioskCoach("pinned", "place") ?? "", /exhibit|Back|camera/i);
    assert.match(arKioskCoach("pinned", "scan") ?? "", /plaque/i);
    assert.match(arKioskCoach("pinned", "emily") ?? "", /Place|Back/i);
    assert.match(arKioskCoach("pinned", "cubes") ?? "", /Exit|demo/i);
    assert.match(arKioskCoach("policy", "place") ?? "", /restriction|staff/i);
    assert.match(arKioskCoach("policy", "emily") ?? "", /table|restriction/i);
  });

  it("never blocks place", () => {
    assert.equal(arKioskBlocksPlace("ok", "place"), false);
    assert.equal(arKioskBlocksPlace("pinned", "place"), false);
    assert.equal(arKioskBlocksPlace("policy", "emily"), false);
    assert.equal(arKioskBlocksPlace("pinned", "scan"), false);
  });
});

describe("arKioskApplyClass + parse", () => {
  it("toggles kiosk/policy classes", () => {
    const el = {
      classList: {
        kiosk: false,
        policy: false,
        toggle(name: string, on: boolean) {
          if (name === "is-ar-kiosk") this.kiosk = on;
          if (name === "is-ar-policy") this.policy = on;
        },
      },
    };
    arKioskApplyClass(el as unknown as Element, "pinned");
    assert.equal(el.classList.kiosk, true);
    assert.equal(el.classList.policy, false);
    arKioskApplyClass(el as unknown as Element, "ok");
    assert.equal(el.classList.kiosk, false);
    assert.equal(el.classList.policy, false);
  });

  it("parses native payloads", () => {
    assert.deepEqual(
      arKioskParseNative({
        kind: "pinned",
        pinned: true,
        policy: false,
        valid: true,
      }),
      {
        kind: "pinned",
        pinned: true,
        policy: false,
        valid: true,
      },
    );
    assert.equal(arKioskParseNative({ policy: true }).kind, "policy");
    assert.equal(arKioskParseNative({ kind: "nope" }).kind, "ok");
  });
});
