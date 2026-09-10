import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AR_WB_COLD_K,
  AR_WB_HOLD_MS,
  AR_WB_RELEASE_MS,
  AR_WB_WARM_K,
  arWbApplyClass,
  arWbBlocksPlace,
  arWbCctFromRgb,
  arWbCctFromXy,
  arWbCoach,
  arWbKindFromCct,
  arWbParseNative,
  arWbStep,
} from "./ar-wb.ts";

describe("arWbCctFromRgb", () => {
  it("returns null for black", () => {
    assert.equal(arWbCctFromRgb(0, 0, 0), null);
  });

  it("reads tungsten-orange as warm", () => {
    const cct = arWbCctFromRgb(1, 0.55, 0.18);
    assert.ok(cct != null && cct < AR_WB_WARM_K);
    assert.equal(arWbKindFromCct(cct), "warm");
  });

  it("reads CIE D75 as cold", () => {
    const cct = arWbCctFromXy(0.299, 0.315);
    assert.ok(cct > AR_WB_COLD_K);
    assert.equal(arWbKindFromCct(cct), "cold");
  });

  it("reads near-white as ok", () => {
    const cct = arWbCctFromRgb(1, 1, 1);
    assert.ok(cct != null);
    assert.equal(arWbKindFromCct(cct), "ok");
  });
});

describe("arWbKindFromCct", () => {
  it("treats missing and wild values as ok", () => {
    assert.equal(arWbKindFromCct(null), "ok");
    assert.equal(arWbKindFromCct(Number.NaN), "ok");
    assert.equal(arWbKindFromCct(2800), "warm");
    assert.equal(arWbKindFromCct(9000), "cold");
  });
});

describe("arWbStep", () => {
  it("stays ok until the hold elapses", () => {
    const t0 = 1_000;
    const a = arWbStep(null, "warm", t0);
    assert.equal(a.kind, "ok");
    const b = arWbStep(a, "warm", t0 + AR_WB_HOLD_MS - 1);
    assert.equal(b.kind, "ok");
    const c = arWbStep(b, "warm", t0 + AR_WB_HOLD_MS);
    assert.equal(c.kind, "warm");
  });

  it("needs a longer hold to return to ok", () => {
    const t0 = 5_000;
    let h = arWbStep(null, "cold", t0);
    h = arWbStep(h, "cold", t0 + AR_WB_HOLD_MS);
    assert.equal(h.kind, "cold");
    h = arWbStep(h, "ok", t0 + AR_WB_HOLD_MS + 1);
    h = arWbStep(h, "ok", t0 + AR_WB_HOLD_MS + AR_WB_RELEASE_MS - 1);
    assert.equal(h.kind, "cold");
    h = arWbStep(h, "ok", t0 + AR_WB_HOLD_MS + 1 + AR_WB_RELEASE_MS);
    assert.equal(h.kind, "ok");
  });

  it("resets the clock when raw flickers", () => {
    const t0 = 9_000;
    let h = arWbStep(null, "warm", t0);
    h = arWbStep(h, "warm", t0 + 200);
    h = arWbStep(h, "ok", t0 + 250);
    h = arWbStep(h, "warm", t0 + 300);
    assert.equal(h.kind, "ok");
    h = arWbStep(h, "warm", t0 + 300 + AR_WB_HOLD_MS - 1);
    assert.equal(h.kind, "ok");
  });
});

describe("arWbCoach", () => {
  it("is silent when ok", () => {
    assert.equal(arWbCoach("ok", "place"), null);
  });

  it("names the product in warm and cold copy", () => {
    assert.match(arWbCoach("warm", "place") ?? "", /fossil/i);
    assert.match(arWbCoach("cold", "scan") ?? "", /marker/i);
    assert.match(arWbCoach("warm", "emily") ?? "", /fur/i);
    assert.match(arWbCoach("cold", "cubes") ?? "", /cube/i);
  });
});

describe("arWbBlocksPlace", () => {
  it("never blocks a tap", () => {
    assert.equal(arWbBlocksPlace("warm"), false);
    assert.equal(arWbBlocksPlace("cold"), false);
  });
});

describe("arWbApplyClass + parse", () => {
  it("toggles warm/cold classes", () => {
    const el = {
      classList: {
        warm: false,
        cold: false,
        toggle(name: string, on: boolean) {
          if (name === "is-ar-wb-warm") this.warm = on;
          if (name === "is-ar-wb-cold") this.cold = on;
        },
      },
    };
    arWbApplyClass(el as unknown as Element, "warm");
    assert.equal(el.classList.warm, true);
    assert.equal(el.classList.cold, false);
    arWbApplyClass(el as unknown as Element, "ok");
    assert.equal(el.classList.warm, false);
    assert.equal(el.classList.cold, false);
  });

  it("parses native payloads", () => {
    assert.deepEqual(arWbParseNative({ kind: "warm", cct: 2800, valid: true }), {
      kind: "warm",
      cct: 2800,
      valid: true,
    });
    assert.equal(arWbParseNative({ kind: "nope" }).kind, "ok");
  });
});
