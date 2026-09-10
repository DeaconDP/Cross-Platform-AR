import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AR_INVERT_HOLD_MS,
  AR_INVERT_RELEASE_MS,
  arInvertApplyClass,
  arInvertBlocksPlace,
  arInvertCoach,
  arInvertKindFromFlags,
  arInvertParseNative,
  arInvertStep,
} from "./ar-invert.ts";

describe("arInvertKindFromFlags", () => {
  it("is ok when both are off", () => {
    assert.equal(arInvertKindFromFlags(false, false), "ok");
  });

  it("prefers invert over gray", () => {
    assert.equal(arInvertKindFromFlags(true, true), "invert");
    assert.equal(arInvertKindFromFlags(false, true), "gray");
  });
});

describe("arInvertStep", () => {
  it("stays ok until the hold elapses", () => {
    const t0 = 1_000;
    const a = arInvertStep(null, "invert", t0);
    assert.equal(a.kind, "ok");
    const b = arInvertStep(a, "invert", t0 + AR_INVERT_HOLD_MS - 1);
    assert.equal(b.kind, "ok");
    const c = arInvertStep(b, "invert", t0 + AR_INVERT_HOLD_MS);
    assert.equal(c.kind, "invert");
  });

  it("needs a longer hold to return to ok", () => {
    const t0 = 5_000;
    let h = arInvertStep(null, "gray", t0);
    h = arInvertStep(h, "gray", t0 + AR_INVERT_HOLD_MS);
    assert.equal(h.kind, "gray");
    h = arInvertStep(h, "ok", t0 + AR_INVERT_HOLD_MS + 1);
    h = arInvertStep(h, "ok", t0 + AR_INVERT_HOLD_MS + AR_INVERT_RELEASE_MS - 1);
    assert.equal(h.kind, "gray");
    h = arInvertStep(h, "ok", t0 + AR_INVERT_HOLD_MS + 1 + AR_INVERT_RELEASE_MS);
    assert.equal(h.kind, "ok");
  });
});

describe("arInvertCoach + blocks", () => {
  it("is silent when ok", () => {
    assert.equal(arInvertCoach("ok", "cubes"), null);
  });

  it("names the product", () => {
    assert.match(arInvertCoach("invert", "cubes") ?? "", /cube/i);
    assert.match(arInvertCoach("gray", "cubes") ?? "", /color/i);
  });

  it("never blocks place", () => {
    assert.equal(arInvertBlocksPlace("invert", "cubes"), false);
    assert.equal(arInvertBlocksPlace("gray", "cubes"), false);
  });
});

describe("arInvertApplyClass + parse", () => {
  it("toggles invert/gray classes", () => {
    const el = {
      classList: {
        invert: false,
        gray: false,
        toggle(name: string, on: boolean) {
          if (name === "is-ar-invert") this.invert = on;
          if (name === "is-ar-gray") this.gray = on;
        },
      },
    };
    arInvertApplyClass(el as unknown as Element, "invert");
    assert.equal(el.classList.invert, true);
    arInvertApplyClass(el as unknown as Element, "ok");
    assert.equal(el.classList.invert, false);
  });

  it("parses native payloads", () => {
    assert.equal(arInvertParseNative({ kind: "invert", invert: true, valid: true }).kind, "invert");
    assert.equal(arInvertParseNative({ invert: false, gray: true }).kind, "gray");
    assert.equal(arInvertParseNative({ kind: "nope" }).kind, "ok");
  });
});
