import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AR_DIR_HOLD_MS,
  AR_DIR_RELEASE_MS,
  arDirApplyClass,
  arDirBlocksPlace,
  arDirCoach,
  arDirKindFromFlags,
  arDirLocaleDirection,
  arDirParseNative,
  arDirPrefersRtl,
  arDirReadWeb,
  arDirStep,
} from "./ar-dir.ts";

describe("arDirKindFromFlags", () => {
  it("is ok when the page is left to right", () => {
    assert.equal(arDirKindFromFlags({ rtl: false, mix: false }), "ok");
  });

  it("prefers mix over a clean rtl", () => {
    assert.equal(arDirKindFromFlags({ rtl: true, mix: true }), "mix");
  });

  it("treats a matching rtl locale as rtl", () => {
    assert.equal(arDirKindFromFlags({ rtl: true, mix: false }), "rtl");
  });
});

describe("arDirLocaleDirection", () => {
  it("is empty without a tag", () => {
    assert.equal(arDirLocaleDirection(""), "");
    assert.equal(arDirLocaleDirection("   "), "");
  });

  it("marks Arabic and Hebrew as rtl", () => {
    assert.equal(arDirLocaleDirection("ar"), "rtl");
    assert.equal(arDirLocaleDirection("ar-SA"), "rtl");
    assert.equal(arDirLocaleDirection("he-IL"), "rtl");
    assert.equal(arDirLocaleDirection("fa"), "rtl");
    assert.equal(arDirLocaleDirection("ur-PK"), "rtl");
  });

  it("marks English and isiZulu as ltr", () => {
    assert.equal(arDirLocaleDirection("en"), "ltr");
    assert.equal(arDirLocaleDirection("en-ZA"), "ltr");
    assert.equal(arDirLocaleDirection("zu-ZA"), "ltr");
  });
});

describe("arDirReadWeb", () => {
  it("is invalid in node without a document", () => {
    const web = arDirReadWeb();
    assert.equal(web.valid, false);
    assert.equal(web.rtl, false);
    assert.equal(web.mix, false);
  });
});

describe("arDirStep", () => {
  it("stays ok until the hold elapses", () => {
    const t0 = 1_000;
    const a = arDirStep(null, "rtl", t0);
    assert.equal(a.kind, "ok");
    const b = arDirStep(a, "rtl", t0 + AR_DIR_HOLD_MS - 1);
    assert.equal(b.kind, "ok");
    const c = arDirStep(b, "rtl", t0 + AR_DIR_HOLD_MS);
    assert.equal(c.kind, "rtl");
  });

  it("needs a longer hold to return to ok", () => {
    const t0 = 5_000;
    let h = arDirStep(null, "mix", t0);
    h = arDirStep(h, "mix", t0 + AR_DIR_HOLD_MS);
    assert.equal(h.kind, "mix");
    h = arDirStep(h, "ok", t0 + AR_DIR_HOLD_MS + 1);
    h = arDirStep(h, "ok", t0 + AR_DIR_HOLD_MS + AR_DIR_RELEASE_MS - 1);
    assert.equal(h.kind, "mix");
    h = arDirStep(h, "ok", t0 + AR_DIR_HOLD_MS + 1 + AR_DIR_RELEASE_MS);
    assert.equal(h.kind, "ok");
  });
});

describe("arDirCoach + blocks", () => {
  it("is silent when ok", () => {
    assert.equal(arDirCoach("ok", "place"), null);
  });

  it("names the product", () => {
    assert.match(arDirCoach("rtl", "place") ?? "", /right to left|table/i);
    assert.match(arDirCoach("rtl", "scan") ?? "", /hunting|right to left/i);
    assert.match(arDirCoach("rtl", "emily") ?? "", /floor|right to left/i);
    assert.match(arDirCoach("rtl", "cubes") ?? "", /cube|surface/i);
    assert.match(arDirCoach("mix", "place") ?? "", /mixed|flipped/i);
    assert.match(arDirCoach("mix", "emily") ?? "", /mixed|floor/i);
  });

  it("never blocks place", () => {
    assert.equal(arDirBlocksPlace("ok", "place"), false);
    assert.equal(arDirBlocksPlace("rtl", "place"), false);
    assert.equal(arDirBlocksPlace("mix", "emily"), false);
    assert.equal(arDirBlocksPlace("rtl", "scan"), false);
    assert.equal(arDirBlocksPlace("mix", "cubes"), false);
  });

  it("marks rtl as prefers-rtl", () => {
    assert.equal(arDirPrefersRtl("rtl"), true);
    assert.equal(arDirPrefersRtl("mix"), false);
    assert.equal(arDirPrefersRtl("ok"), false);
  });
});

describe("arDirApplyClass + parse", () => {
  it("toggles rtl/mix classes", () => {
    const el = {
      classList: {
        rtl: false,
        mix: false,
        toggle(name: string, on: boolean) {
          if (name === "is-ar-dir-rtl") this.rtl = on;
          if (name === "is-ar-dir-mix") this.mix = on;
        },
      },
    };
    arDirApplyClass(el as unknown as Element, "rtl");
    assert.equal(el.classList.rtl, true);
    assert.equal(el.classList.mix, false);
    arDirApplyClass(el as unknown as Element, "ok");
    assert.equal(el.classList.rtl, false);
    assert.equal(el.classList.mix, false);
  });

  it("parses native payloads", () => {
    assert.deepEqual(
      arDirParseNative({
        kind: "rtl",
        rtl: true,
        mix: true,
        valid: true,
      }),
      {
        kind: "rtl",
        rtl: true,
        mix: true,
        valid: true,
      },
    );
    assert.equal(arDirParseNative({ mix: true }).kind, "mix");
    assert.equal(arDirParseNative({ rtl: true }).kind, "rtl");
    assert.equal(arDirParseNative({ kind: "nope" }).kind, "ok");
  });
});
