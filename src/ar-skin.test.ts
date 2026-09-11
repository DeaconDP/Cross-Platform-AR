import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AR_SKIN_HOLD_MS,
  AR_SKIN_RELEASE_MS,
  arSkinApplyClass,
  arSkinBlocksPlace,
  arSkinCoach,
  arSkinKindFromFlags,
  arSkinKindFromSignals,
  arSkinParseNative,
  arSkinPrefersMarks,
  arSkinReadWeb,
  arSkinStep,
} from "./ar-skin.ts";

describe("arSkinKindFromFlags", () => {
  it("is ok in light appearance", () => {
    assert.equal(arSkinKindFromFlags({ forceOn: false, darkOn: false }), "ok");
  });

  it("prefers Force-dark over a user Dark theme", () => {
    assert.equal(arSkinKindFromFlags({ forceOn: true, darkOn: true }), "force");
  });

  it("treats Dark appearance as dark", () => {
    assert.equal(arSkinKindFromFlags({ forceOn: false, darkOn: true }), "dark");
  });
});

describe("arSkinKindFromSignals", () => {
  it("maps Force-dark / night mode / prefers-color-scheme / light", () => {
    assert.equal(arSkinKindFromSignals({ forceDark: true }), "force");
    assert.equal(arSkinKindFromSignals({ nightMode: true }), "dark");
    assert.equal(arSkinKindFromSignals({ prefersDark: true }), "dark");
    assert.equal(
      arSkinKindFromSignals({ forceDark: true, nightMode: true }),
      "force",
    );
    assert.equal(arSkinKindFromSignals({}), "ok");
  });
});

describe("arSkinReadWeb", () => {
  it("is invalid in node without matchMedia", () => {
    const web = arSkinReadWeb();
    assert.equal(web.valid, false);
    assert.equal(web.forceOn, false);
    assert.equal(web.darkOn, false);
  });
});

describe("arSkinStep", () => {
  it("stays ok until the hold elapses", () => {
    const t0 = 1_000;
    const a = arSkinStep(null, "force", t0);
    assert.equal(a.kind, "ok");
    const b = arSkinStep(a, "force", t0 + AR_SKIN_HOLD_MS - 1);
    assert.equal(b.kind, "ok");
    const c = arSkinStep(b, "force", t0 + AR_SKIN_HOLD_MS);
    assert.equal(c.kind, "force");
  });

  it("needs a longer hold to return to ok", () => {
    const t0 = 5_000;
    let h = arSkinStep(null, "dark", t0);
    h = arSkinStep(h, "dark", t0 + AR_SKIN_HOLD_MS);
    assert.equal(h.kind, "dark");
    h = arSkinStep(h, "ok", t0 + AR_SKIN_HOLD_MS + 1);
    h = arSkinStep(h, "ok", t0 + AR_SKIN_HOLD_MS + AR_SKIN_RELEASE_MS - 1);
    assert.equal(h.kind, "dark");
    h = arSkinStep(h, "ok", t0 + AR_SKIN_HOLD_MS + 1 + AR_SKIN_RELEASE_MS);
    assert.equal(h.kind, "ok");
  });
});

describe("arSkinCoach + blocks + prefersMarks", () => {
  it("is silent when ok", () => {
    assert.equal(arSkinCoach("ok", "place"), null);
  });

  it("names the product", () => {
    assert.match(arSkinCoach("force", "place") ?? "", /Force dark|fossil/i);
    assert.match(arSkinCoach("force", "scan") ?? "", /Force dark|plaque/i);
    assert.match(arSkinCoach("force", "emily") ?? "", /Force dark/i);
    assert.match(arSkinCoach("force", "cubes") ?? "", /Force dark|cube/i);
    assert.match(arSkinCoach("dark", "place") ?? "", /Dark appearance|outline|fossil|table/i);
    assert.match(arSkinCoach("dark", "emily") ?? "", /Dark appearance|outline/i);
  });

  it("never blocks place", () => {
    assert.equal(arSkinBlocksPlace("ok", "place"), false);
    assert.equal(arSkinBlocksPlace("dark", "place"), false);
    assert.equal(arSkinBlocksPlace("force", "emily"), false);
    assert.equal(arSkinBlocksPlace("dark", "scan"), false);
    assert.equal(arSkinBlocksPlace("force", "cubes"), false);
  });

  it("asks hosts to prefer marks when the theme remaps color", () => {
    assert.equal(arSkinPrefersMarks("ok"), false);
    assert.equal(arSkinPrefersMarks("dark"), true);
    assert.equal(arSkinPrefersMarks("force"), true);
  });
});

describe("arSkinApplyClass + parse", () => {
  it("toggles force/dark classes", () => {
    const el = {
      classList: {
        forceOn: false,
        darkOn: false,
        toggle(name: string, on: boolean) {
          if (name === "is-ar-skin-force") this.forceOn = on;
          if (name === "is-ar-skin-dark") this.darkOn = on;
        },
      },
    };
    arSkinApplyClass(el as unknown as Element, "force");
    assert.equal(el.classList.forceOn, true);
    assert.equal(el.classList.darkOn, false);
    arSkinApplyClass(el as unknown as Element, "ok");
    assert.equal(el.classList.forceOn, false);
    assert.equal(el.classList.darkOn, false);
  });

  it("parses native payloads", () => {
    assert.deepEqual(
      arSkinParseNative({
        kind: "force",
        forceOn: true,
        darkOn: true,
        valid: true,
      }),
      {
        kind: "force",
        forceOn: true,
        darkOn: true,
        valid: true,
      },
    );
    assert.equal(arSkinParseNative({ forceOn: true }).kind, "force");
    assert.equal(arSkinParseNative({ darkOn: true }).kind, "dark");
    assert.equal(arSkinParseNative({ kind: "nope" }).kind, "ok");
  });
});
