import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AR_SAVE_HOLD_MS,
  AR_SAVE_RELEASE_MS,
  arSaveApplyClass,
  arSaveBlocksPlace,
  arSaveCoach,
  arSaveKindFromFlags,
  arSaveParseNative,
  arSavePrefersCache,
  arSaveReadWeb,
  arSaveStep,
} from "./ar-save.ts";

describe("arSaveKindFromFlags", () => {
  it("is ok on an unconstrained path", () => {
    assert.equal(arSaveKindFromFlags({ save: false, meter: false }), "ok");
  });

  it("prefers Low Data / Data Saver over metered", () => {
    assert.equal(arSaveKindFromFlags({ save: true, meter: true }), "save");
  });

  it("treats a metered path as meter", () => {
    assert.equal(arSaveKindFromFlags({ save: false, meter: true }), "meter");
  });
});

describe("arSaveReadWeb", () => {
  it("is invalid in node without navigator.connection", () => {
    const web = arSaveReadWeb();
    assert.equal(web.valid, false);
    assert.equal(web.save, false);
    assert.equal(web.meter, false);
  });
});

describe("arSaveStep", () => {
  it("stays ok until the hold elapses", () => {
    const t0 = 1_000;
    const a = arSaveStep(null, "save", t0);
    assert.equal(a.kind, "ok");
    const b = arSaveStep(a, "save", t0 + AR_SAVE_HOLD_MS - 1);
    assert.equal(b.kind, "ok");
    const c = arSaveStep(b, "save", t0 + AR_SAVE_HOLD_MS);
    assert.equal(c.kind, "save");
  });

  it("needs a longer hold to return to ok", () => {
    const t0 = 5_000;
    let h = arSaveStep(null, "meter", t0);
    h = arSaveStep(h, "meter", t0 + AR_SAVE_HOLD_MS);
    assert.equal(h.kind, "meter");
    h = arSaveStep(h, "ok", t0 + AR_SAVE_HOLD_MS + 1);
    h = arSaveStep(h, "ok", t0 + AR_SAVE_HOLD_MS + AR_SAVE_RELEASE_MS - 1);
    assert.equal(h.kind, "meter");
    h = arSaveStep(h, "ok", t0 + AR_SAVE_HOLD_MS + 1 + AR_SAVE_RELEASE_MS);
    assert.equal(h.kind, "ok");
  });
});

describe("arSaveCoach + blocks + cache", () => {
  it("is silent when ok", () => {
    assert.equal(arSaveCoach("ok", "place"), null);
  });

  it("names the product", () => {
    assert.match(arSaveCoach("save", "place") ?? "", /Low Data|fossil|table/i);
    assert.match(arSaveCoach("save", "scan") ?? "", /hunting|Low Data/i);
    assert.match(arSaveCoach("save", "emily") ?? "", /floor|Low Data/i);
    assert.match(arSaveCoach("save", "cubes") ?? "", /cube|surface/i);
    assert.match(arSaveCoach("meter", "place") ?? "", /metered|table/i);
    assert.match(arSaveCoach("meter", "emily") ?? "", /metered|floor/i);
  });

  it("never blocks place", () => {
    assert.equal(arSaveBlocksPlace("ok", "place"), false);
    assert.equal(arSaveBlocksPlace("save", "place"), false);
    assert.equal(arSaveBlocksPlace("meter", "emily"), false);
    assert.equal(arSaveBlocksPlace("save", "scan"), false);
    assert.equal(arSaveBlocksPlace("meter", "cubes"), false);
  });

  it("asks hosts to prefer cache on save or meter", () => {
    assert.equal(arSavePrefersCache("ok"), false);
    assert.equal(arSavePrefersCache("save"), true);
    assert.equal(arSavePrefersCache("meter"), true);
  });
});

describe("arSaveApplyClass + parse", () => {
  it("toggles save/meter classes", () => {
    const el = {
      classList: {
        save: false,
        meter: false,
        toggle(name: string, on: boolean) {
          if (name === "is-ar-save-save") this.save = on;
          if (name === "is-ar-save-meter") this.meter = on;
        },
      },
    };
    arSaveApplyClass(el as unknown as Element, "save");
    assert.equal(el.classList.save, true);
    assert.equal(el.classList.meter, false);
    arSaveApplyClass(el as unknown as Element, "ok");
    assert.equal(el.classList.save, false);
    assert.equal(el.classList.meter, false);
  });

  it("parses native payloads", () => {
    assert.deepEqual(
      arSaveParseNative({
        kind: "save",
        save: true,
        meter: true,
        valid: true,
      }),
      {
        kind: "save",
        save: true,
        meter: true,
        valid: true,
      },
    );
    assert.equal(arSaveParseNative({ save: true }).kind, "save");
    assert.equal(arSaveParseNative({ meter: true }).kind, "meter");
    assert.equal(arSaveParseNative({ kind: "nope" }).kind, "ok");
  });
});
