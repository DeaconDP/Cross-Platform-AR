import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AR_FLICKER_HOLD_MS,
  AR_FLICKER_P2P,
  AR_FLICKER_RELEASE_MS,
  AR_FLICKER_STROBE_P2P,
  AR_FLICKER_WARMUP_MS,
  arFlickerApplyClass,
  arFlickerBlocksPlace,
  arFlickerBuf,
  arFlickerCoach,
  arFlickerKindFromSamples,
  arFlickerLumaFromLux,
  arFlickerParseNative,
  arFlickerPush,
  arFlickerStats,
  arFlickerStep,
} from "./ar-flicker.ts";

describe("arFlickerKindFromSamples", () => {
  it("needs four samples", () => {
    assert.equal(arFlickerKindFromSamples([0.4, 0.9, 0.2]), "ok");
  });

  it("reads a steady lamp as ok", () => {
    assert.equal(arFlickerKindFromSamples([0.4, 0.41, 0.39, 0.4, 0.405]), "ok");
  });

  it("reads PWM beat as flicker", () => {
    const wave = [0.3, 0.42, 0.28, 0.44, 0.29, 0.43, 0.3, 0.41];
    assert.ok(arFlickerStats(wave).p2p >= AR_FLICKER_P2P);
    assert.equal(arFlickerKindFromSamples(wave), "flicker");
  });

  it("reads a hard strobe as strobe", () => {
    const wave = [0.1, 0.85, 0.08, 0.9, 0.12, 0.88, 0.1, 0.86];
    assert.ok(arFlickerStats(wave).p2p >= AR_FLICKER_STROBE_P2P);
    assert.equal(arFlickerKindFromSamples(wave), "strobe");
  });

  it("promotes a rolling-shutter band flip to strobe", () => {
    assert.equal(arFlickerKindFromSamples([0.4, 0.41, 0.4, 0.42], true), "strobe");
  });
});

describe("arFlickerPush", () => {
  it("stays ok during warmup", () => {
    const t0 = 1_000;
    const buf = arFlickerBuf(t0);
    const kind = arFlickerPush(buf, 0.9, t0 + AR_FLICKER_WARMUP_MS - 1);
    assert.equal(kind, "ok");
  });

  it("maps iOS lux into 0–1", () => {
    assert.equal(arFlickerLumaFromLux(0), 0);
    assert.ok(arFlickerLumaFromLux(500) > 0.4 && arFlickerLumaFromLux(500) < 0.6);
    assert.equal(arFlickerLumaFromLux(4000), 1);
  });
});

describe("arFlickerStep", () => {
  it("stays ok until the hold elapses", () => {
    const t0 = 1_000;
    const a = arFlickerStep(null, "flicker", t0);
    assert.equal(a.kind, "ok");
    const b = arFlickerStep(a, "flicker", t0 + AR_FLICKER_HOLD_MS - 1);
    assert.equal(b.kind, "ok");
    const c = arFlickerStep(b, "flicker", t0 + AR_FLICKER_HOLD_MS);
    assert.equal(c.kind, "flicker");
  });

  it("needs a longer hold to return to ok", () => {
    const t0 = 5_000;
    let h = arFlickerStep(null, "strobe", t0);
    h = arFlickerStep(h, "strobe", t0 + AR_FLICKER_HOLD_MS);
    assert.equal(h.kind, "strobe");
    h = arFlickerStep(h, "ok", t0 + AR_FLICKER_HOLD_MS + 1);
    h = arFlickerStep(h, "ok", t0 + AR_FLICKER_HOLD_MS + AR_FLICKER_RELEASE_MS - 1);
    assert.equal(h.kind, "strobe");
    h = arFlickerStep(h, "ok", t0 + AR_FLICKER_HOLD_MS + 1 + AR_FLICKER_RELEASE_MS);
    assert.equal(h.kind, "ok");
  });
});

describe("arFlickerCoach + blocks", () => {
  it("is silent when ok", () => {
    assert.equal(arFlickerCoach("ok", "place"), null);
  });

  it("names the product", () => {
    assert.match(arFlickerCoach("flicker", "place") ?? "", /light/i);
    assert.match(arFlickerCoach("strobe", "scan") ?? "", /steady/i);
    assert.match(arFlickerCoach("flicker", "emily") ?? "", /sit/i);
    assert.match(arFlickerCoach("strobe", "cubes") ?? "", /tap/i);
  });

  it("blocks place on strobe only", () => {
    assert.equal(arFlickerBlocksPlace("ok", "place"), false);
    assert.equal(arFlickerBlocksPlace("flicker", "place"), false);
    assert.equal(arFlickerBlocksPlace("strobe", "place"), true);
    assert.equal(arFlickerBlocksPlace("strobe", "emily"), true);
    assert.equal(arFlickerBlocksPlace("strobe", "cubes"), true);
    assert.equal(arFlickerBlocksPlace("strobe", "scan"), false);
  });
});

describe("arFlickerApplyClass + parse", () => {
  it("toggles flicker/strobe classes", () => {
    const el = {
      classList: {
        flicker: false,
        strobe: false,
        toggle(name: string, on: boolean) {
          if (name === "is-ar-flicker") this.flicker = on;
          if (name === "is-ar-strobe") this.strobe = on;
        },
      },
    };
    arFlickerApplyClass(el as unknown as Element, "flicker");
    assert.equal(el.classList.flicker, true);
    assert.equal(el.classList.strobe, false);
    arFlickerApplyClass(el as unknown as Element, "ok");
    assert.equal(el.classList.flicker, false);
    assert.equal(el.classList.strobe, false);
  });

  it("parses native payloads", () => {
    assert.deepEqual(
      arFlickerParseNative({ kind: "strobe", p2p: 0.3, valid: true }),
      { kind: "strobe", p2p: 0.3, valid: true },
    );
    assert.equal(arFlickerParseNative({ kind: "nope" }).kind, "ok");
  });
});
