import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AR_TINT_HOLD_MS,
  AR_TINT_RELEASE_MS,
  arTintApplyClass,
  arTintBlocksPlace,
  arTintCoach,
  arTintKindFromFlags,
  arTintParseNative,
  arTintPrefersMarks,
  arTintReadWeb,
  arTintStep,
} from "./ar-tint.ts";

describe("arTintKindFromFlags", () => {
  it("is ok when no color remap is on", () => {
    assert.equal(arTintKindFromFlags({ filter: false, diff: false }), "ok");
  });

  it("prefers filter over differentiate-without-color", () => {
    assert.equal(arTintKindFromFlags({ filter: true, diff: true }), "filter");
  });

  it("treats differentiate-without-color as diff", () => {
    assert.equal(arTintKindFromFlags({ filter: false, diff: true }), "diff");
  });
});

describe("arTintReadWeb", () => {
  it("is invalid in node without window", () => {
    const web = arTintReadWeb();
    assert.equal(web.valid, false);
    assert.equal(web.filter, false);
    assert.equal(web.diff, false);
  });
});

describe("arTintStep", () => {
  it("stays ok until the hold elapses", () => {
    const t0 = 1_000;
    const a = arTintStep(null, "filter", t0);
    assert.equal(a.kind, "ok");
    const b = arTintStep(a, "filter", t0 + AR_TINT_HOLD_MS - 1);
    assert.equal(b.kind, "ok");
    const c = arTintStep(b, "filter", t0 + AR_TINT_HOLD_MS);
    assert.equal(c.kind, "filter");
  });

  it("needs a longer hold to return to ok", () => {
    const t0 = 5_000;
    let h = arTintStep(null, "diff", t0);
    h = arTintStep(h, "diff", t0 + AR_TINT_HOLD_MS);
    assert.equal(h.kind, "diff");
    h = arTintStep(h, "ok", t0 + AR_TINT_HOLD_MS + 1);
    h = arTintStep(h, "ok", t0 + AR_TINT_HOLD_MS + AR_TINT_RELEASE_MS - 1);
    assert.equal(h.kind, "diff");
    h = arTintStep(h, "ok", t0 + AR_TINT_HOLD_MS + 1 + AR_TINT_RELEASE_MS);
    assert.equal(h.kind, "ok");
  });
});

describe("arTintCoach + blocks + marks", () => {
  it("is silent when ok", () => {
    assert.equal(arTintCoach("ok", "place"), null);
  });

  it("names the product", () => {
    assert.match(arTintCoach("filter", "place") ?? "", /Color correction|words|tint/i);
    assert.match(arTintCoach("filter", "scan") ?? "", /hunting|Color correction/i);
    assert.match(arTintCoach("filter", "emily") ?? "", /watch me|Color correction/i);
    assert.match(arTintCoach("filter", "cubes") ?? "", /surface|Color correction/i);
    assert.match(arTintCoach("diff", "place") ?? "", /Marks|outlined/i);
    assert.match(arTintCoach("diff", "emily") ?? "", /Marks|watch me/i);
  });

  it("never blocks place", () => {
    assert.equal(arTintBlocksPlace("ok", "place"), false);
    assert.equal(arTintBlocksPlace("diff", "place"), false);
    assert.equal(arTintBlocksPlace("filter", "emily"), false);
    assert.equal(arTintBlocksPlace("diff", "scan"), false);
    assert.equal(arTintBlocksPlace("filter", "cubes"), false);
  });

  it("asks hosts for marks when a remap is on", () => {
    assert.equal(arTintPrefersMarks("ok"), false);
    assert.equal(arTintPrefersMarks("diff"), true);
    assert.equal(arTintPrefersMarks("filter"), true);
  });
});

describe("arTintApplyClass + parse", () => {
  it("toggles filter/diff classes", () => {
    const el = {
      classList: {
        filter: false,
        diff: false,
        toggle(name: string, on: boolean) {
          if (name === "is-ar-tint-filter") this.filter = on;
          if (name === "is-ar-tint-diff") this.diff = on;
        },
      },
    };
    arTintApplyClass(el as unknown as Element, "filter");
    assert.equal(el.classList.filter, true);
    assert.equal(el.classList.diff, false);
    arTintApplyClass(el as unknown as Element, "ok");
    assert.equal(el.classList.filter, false);
    assert.equal(el.classList.diff, false);
  });

  it("parses native payloads", () => {
    assert.deepEqual(
      arTintParseNative({
        kind: "filter",
        filter: true,
        diff: true,
        valid: true,
      }),
      {
        kind: "filter",
        filter: true,
        diff: true,
        valid: true,
      },
    );
    assert.equal(arTintParseNative({ filter: true }).kind, "filter");
    assert.equal(arTintParseNative({ diff: true }).kind, "diff");
    assert.equal(arTintParseNative({ kind: "nope" }).kind, "ok");
  });
});
