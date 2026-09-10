import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AR_LOUPE_HOLD_MS,
  AR_LOUPE_RELEASE_MS,
  arLoupeApplyClass,
  arLoupeBlocksPlace,
  arLoupeCoach,
  arLoupeKindFromFlags,
  arLoupeParseNative,
  arLoupeReadWeb,
  arLoupeStep,
} from "./ar-loupe.ts";

describe("arLoupeKindFromFlags", () => {
  it("is ok when nothing is remapping touches", () => {
    assert.equal(arLoupeKindFromFlags({ assist: false, zoom: false }), "ok");
  });

  it("prefers magnification over a floating button", () => {
    assert.equal(arLoupeKindFromFlags({ assist: true, zoom: true }), "zoom");
  });

  it("treats AssistiveTouch as assist", () => {
    assert.equal(arLoupeKindFromFlags({ assist: true, zoom: false }), "assist");
  });
});

describe("arLoupeReadWeb", () => {
  it("is never valid — page zoom is a different lock", () => {
    const web = arLoupeReadWeb();
    assert.equal(web.valid, false);
    assert.equal(web.assist, false);
    assert.equal(web.zoom, false);
  });
});

describe("arLoupeStep", () => {
  it("stays ok until the hold elapses", () => {
    const t0 = 1_000;
    const a = arLoupeStep(null, "zoom", t0);
    assert.equal(a.kind, "ok");
    const b = arLoupeStep(a, "zoom", t0 + AR_LOUPE_HOLD_MS - 1);
    assert.equal(b.kind, "ok");
    const c = arLoupeStep(b, "zoom", t0 + AR_LOUPE_HOLD_MS);
    assert.equal(c.kind, "zoom");
  });

  it("needs a longer hold to return to ok", () => {
    const t0 = 5_000;
    let h = arLoupeStep(null, "assist", t0);
    h = arLoupeStep(h, "assist", t0 + AR_LOUPE_HOLD_MS);
    assert.equal(h.kind, "assist");
    h = arLoupeStep(h, "ok", t0 + AR_LOUPE_HOLD_MS + 1);
    h = arLoupeStep(h, "ok", t0 + AR_LOUPE_HOLD_MS + AR_LOUPE_RELEASE_MS - 1);
    assert.equal(h.kind, "assist");
    h = arLoupeStep(h, "ok", t0 + AR_LOUPE_HOLD_MS + 1 + AR_LOUPE_RELEASE_MS);
    assert.equal(h.kind, "ok");
  });
});

describe("arLoupeCoach + blocks", () => {
  it("is silent when ok", () => {
    assert.equal(arLoupeCoach("ok", "place"), null);
  });

  it("names the product", () => {
    assert.match(arLoupeCoach("zoom", "place") ?? "", /Magnification|table/i);
    assert.match(arLoupeCoach("zoom", "scan") ?? "", /plaque/i);
    assert.match(arLoupeCoach("zoom", "emily") ?? "", /sit|tap/i);
    assert.match(arLoupeCoach("zoom", "cubes") ?? "", /table|tap/i);
    assert.match(arLoupeCoach("assist", "place") ?? "", /AssistiveTouch|Back/i);
    assert.match(arLoupeCoach("assist", "emily") ?? "", /Place|AssistiveTouch/i);
  });

  it("blocks place on magnification except scan", () => {
    assert.equal(arLoupeBlocksPlace("ok", "place"), false);
    assert.equal(arLoupeBlocksPlace("assist", "place"), false);
    assert.equal(arLoupeBlocksPlace("zoom", "place"), true);
    assert.equal(arLoupeBlocksPlace("zoom", "emily"), true);
    assert.equal(arLoupeBlocksPlace("zoom", "cubes"), true);
    assert.equal(arLoupeBlocksPlace("zoom", "scan"), false);
  });
});

describe("arLoupeApplyClass + parse", () => {
  it("toggles zoom/assist classes", () => {
    const el = {
      classList: {
        zoom: false,
        assist: false,
        toggle(name: string, on: boolean) {
          if (name === "is-ar-loupe-zoom") this.zoom = on;
          if (name === "is-ar-loupe-assist") this.assist = on;
        },
      },
    };
    arLoupeApplyClass(el as unknown as Element, "zoom");
    assert.equal(el.classList.zoom, true);
    assert.equal(el.classList.assist, false);
    arLoupeApplyClass(el as unknown as Element, "ok");
    assert.equal(el.classList.zoom, false);
    assert.equal(el.classList.assist, false);
  });

  it("parses native payloads", () => {
    assert.deepEqual(
      arLoupeParseNative({
        kind: "zoom",
        assist: false,
        zoom: true,
        valid: true,
      }),
      {
        kind: "zoom",
        assist: false,
        zoom: true,
        valid: true,
      },
    );
    assert.equal(arLoupeParseNative({ assist: true }).kind, "assist");
    assert.equal(arLoupeParseNative({ kind: "nope" }).kind, "ok");
  });
});
