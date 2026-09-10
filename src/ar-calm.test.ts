import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AR_CALM_HOLD_MS,
  AR_CALM_RELEASE_MS,
  arCalmApplyClass,
  arCalmBlocksPlace,
  arCalmCoach,
  arCalmKindFromFlags,
  arCalmParseNative,
  arCalmPrefersReduce,
  arCalmReadWeb,
  arCalmStep,
} from "./ar-calm.ts";

describe("arCalmKindFromFlags", () => {
  it("is ok when motion is allowed", () => {
    assert.equal(arCalmKindFromFlags({ reduce: false, fade: false }), "ok");
  });

  it("prefers full reduce over cross-fade", () => {
    assert.equal(arCalmKindFromFlags({ reduce: true, fade: true }), "reduce");
  });

  it("treats cross-fade as fade", () => {
    assert.equal(arCalmKindFromFlags({ reduce: false, fade: true }), "fade");
  });
});

describe("arCalmReadWeb", () => {
  it("is invalid in node without matchMedia", () => {
    const web = arCalmReadWeb();
    assert.equal(web.valid, false);
    assert.equal(web.reduce, false);
    assert.equal(web.fade, false);
  });
});

describe("arCalmStep", () => {
  it("stays ok until the hold elapses", () => {
    const t0 = 1_000;
    const a = arCalmStep(null, "reduce", t0);
    assert.equal(a.kind, "ok");
    const b = arCalmStep(a, "reduce", t0 + AR_CALM_HOLD_MS - 1);
    assert.equal(b.kind, "ok");
    const c = arCalmStep(b, "reduce", t0 + AR_CALM_HOLD_MS);
    assert.equal(c.kind, "reduce");
  });

  it("needs a longer hold to return to ok", () => {
    const t0 = 5_000;
    let h = arCalmStep(null, "fade", t0);
    h = arCalmStep(h, "fade", t0 + AR_CALM_HOLD_MS);
    assert.equal(h.kind, "fade");
    h = arCalmStep(h, "ok", t0 + AR_CALM_HOLD_MS + 1);
    h = arCalmStep(h, "ok", t0 + AR_CALM_HOLD_MS + AR_CALM_RELEASE_MS - 1);
    assert.equal(h.kind, "fade");
    h = arCalmStep(h, "ok", t0 + AR_CALM_HOLD_MS + 1 + AR_CALM_RELEASE_MS);
    assert.equal(h.kind, "ok");
  });
});

describe("arCalmCoach + blocks", () => {
  it("is silent when ok", () => {
    assert.equal(arCalmCoach("ok", "place"), null);
  });

  it("names the product", () => {
    assert.match(arCalmCoach("reduce", "place") ?? "", /fossil|table/i);
    assert.match(arCalmCoach("reduce", "scan") ?? "", /hunting|find/i);
    assert.match(arCalmCoach("reduce", "emily") ?? "", /sit still|floor/i);
    assert.match(arCalmCoach("reduce", "cubes") ?? "", /cube|surface/i);
    assert.match(arCalmCoach("fade", "place") ?? "", /faded|fossil/i);
    assert.match(arCalmCoach("fade", "emily") ?? "", /faded|floor/i);
  });

  it("never blocks place", () => {
    assert.equal(arCalmBlocksPlace("ok", "place"), false);
    assert.equal(arCalmBlocksPlace("reduce", "place"), false);
    assert.equal(arCalmBlocksPlace("fade", "emily"), false);
    assert.equal(arCalmBlocksPlace("reduce", "scan"), false);
    assert.equal(arCalmBlocksPlace("fade", "cubes"), false);
  });

  it("marks reduce as prefers-reduce", () => {
    assert.equal(arCalmPrefersReduce("reduce"), true);
    assert.equal(arCalmPrefersReduce("fade"), false);
    assert.equal(arCalmPrefersReduce("ok"), false);
  });
});

describe("arCalmApplyClass + parse", () => {
  it("toggles reduce/fade classes", () => {
    const el = {
      classList: {
        reduce: false,
        fade: false,
        toggle(name: string, on: boolean) {
          if (name === "is-ar-calm-reduce") this.reduce = on;
          if (name === "is-ar-calm-fade") this.fade = on;
        },
      },
    };
    arCalmApplyClass(el as unknown as Element, "reduce");
    assert.equal(el.classList.reduce, true);
    assert.equal(el.classList.fade, false);
    arCalmApplyClass(el as unknown as Element, "ok");
    assert.equal(el.classList.reduce, false);
    assert.equal(el.classList.fade, false);
  });

  it("parses native payloads", () => {
    assert.deepEqual(
      arCalmParseNative({
        kind: "reduce",
        reduce: true,
        fade: true,
        valid: true,
      }),
      {
        kind: "reduce",
        reduce: true,
        fade: true,
        valid: true,
      },
    );
    assert.equal(arCalmParseNative({ reduce: true }).kind, "reduce");
    assert.equal(arCalmParseNative({ fade: true }).kind, "fade");
    assert.equal(arCalmParseNative({ kind: "nope" }).kind, "ok");
  });
});
