import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AR_DIM_BRIGHT_FLOOR,
  AR_DIM_HOLD_MS,
  AR_DIM_RELEASE_MS,
  arDimApplyClass,
  arDimBlocksPlace,
  arDimCoach,
  arDimKindFromFlags,
  arDimParseNative,
  arDimStep,
} from "./ar-dim.ts";

describe("arDimKindFromFlags", () => {
  it("is ok when the display is bright and untinted", () => {
    assert.equal(
      arDimKindFromFlags({
        night: false,
        extraDim: false,
        reduceWhite: false,
        brightness: 0.8,
      }),
      "ok",
    );
  });

  it("prefers night over extra-dim", () => {
    assert.equal(
      arDimKindFromFlags({
        night: true,
        extraDim: true,
        reduceWhite: false,
        brightness: 0.05,
      }),
      "night",
    );
  });

  it("treats Extra Dim, Reduce White Point, and a dark screen as dim", () => {
    assert.equal(
      arDimKindFromFlags({
        night: false,
        extraDim: true,
        reduceWhite: false,
        brightness: 1,
      }),
      "dim",
    );
    assert.equal(
      arDimKindFromFlags({
        night: false,
        extraDim: false,
        reduceWhite: true,
        brightness: 1,
      }),
      "dim",
    );
    assert.equal(
      arDimKindFromFlags({
        night: false,
        extraDim: false,
        reduceWhite: false,
        brightness: AR_DIM_BRIGHT_FLOOR - 0.01,
      }),
      "dim",
    );
  });
});

describe("arDimStep", () => {
  it("stays ok until the hold elapses", () => {
    const t0 = 1_000;
    const a = arDimStep(null, "dim", t0);
    assert.equal(a.kind, "ok");
    const b = arDimStep(a, "dim", t0 + AR_DIM_HOLD_MS - 1);
    assert.equal(b.kind, "ok");
    const c = arDimStep(b, "dim", t0 + AR_DIM_HOLD_MS);
    assert.equal(c.kind, "dim");
  });

  it("needs a longer hold to return to ok", () => {
    const t0 = 5_000;
    let h = arDimStep(null, "night", t0);
    h = arDimStep(h, "night", t0 + AR_DIM_HOLD_MS);
    assert.equal(h.kind, "night");
    h = arDimStep(h, "ok", t0 + AR_DIM_HOLD_MS + 1);
    h = arDimStep(h, "ok", t0 + AR_DIM_HOLD_MS + AR_DIM_RELEASE_MS - 1);
    assert.equal(h.kind, "night");
    h = arDimStep(h, "ok", t0 + AR_DIM_HOLD_MS + 1 + AR_DIM_RELEASE_MS);
    assert.equal(h.kind, "ok");
  });
});

describe("arDimCoach + blocks", () => {
  it("is silent when ok", () => {
    assert.equal(arDimCoach("ok", "place"), null);
  });

  it("names the product", () => {
    assert.match(arDimCoach("dim", "place") ?? "", /fossil|brightness/i);
    assert.match(arDimCoach("dim", "scan") ?? "", /plaque/i);
    assert.match(arDimCoach("dim", "emily") ?? "", /see me|brightness/i);
    assert.match(arDimCoach("night", "cubes") ?? "", /Night Light|warmer/i);
    assert.match(arDimCoach("night", "place") ?? "", /camera|warmer/i);
  });

  it("never blocks place", () => {
    assert.equal(arDimBlocksPlace("ok", "place"), false);
    assert.equal(arDimBlocksPlace("dim", "place"), false);
    assert.equal(arDimBlocksPlace("night", "emily"), false);
    assert.equal(arDimBlocksPlace("dim", "scan"), false);
  });
});

describe("arDimApplyClass + parse", () => {
  it("toggles dim/night classes", () => {
    const el = {
      classList: {
        dim: false,
        night: false,
        toggle(name: string, on: boolean) {
          if (name === "is-ar-dim") this.dim = on;
          if (name === "is-ar-night") this.night = on;
        },
      },
    };
    arDimApplyClass(el as unknown as Element, "dim");
    assert.equal(el.classList.dim, true);
    assert.equal(el.classList.night, false);
    arDimApplyClass(el as unknown as Element, "ok");
    assert.equal(el.classList.dim, false);
    assert.equal(el.classList.night, false);
  });

  it("parses native payloads", () => {
    assert.deepEqual(
      arDimParseNative({
        kind: "night",
        night: true,
        extraDim: false,
        reduceWhite: false,
        brightness: 0.4,
        valid: true,
      }),
      {
        kind: "night",
        night: true,
        extraDim: false,
        reduceWhite: false,
        brightness: 0.4,
        valid: true,
      },
    );
    assert.equal(
      arDimParseNative({ extraDim: true, brightness: 1 }).kind,
      "dim",
    );
    assert.equal(arDimParseNative({ kind: "nope" }).kind, "ok");
  });
});
