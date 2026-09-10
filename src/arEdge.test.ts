import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AR_EDGE_HOLD_MS,
  AR_EDGE_RELEASE_MS,
  arEdgeApplyClass,
  arEdgeBlocksPlace,
  arEdgeCoach,
  arEdgeInZone,
  arEdgeKindFromFlags,
  arEdgeParseNative,
  arEdgeReadWeb,
  arEdgeStep,
} from "./arEdge.ts";

describe("arEdgeKindFromFlags", () => {
  it("is ok when 3-button nav has no edge swipe", () => {
    assert.equal(arEdgeKindFromFlags({ edge: false, back: false }), "ok");
  });

  it("prefers an in-flight back swipe over gesture-nav", () => {
    assert.equal(arEdgeKindFromFlags({ edge: true, back: true }), "back");
  });

  it("treats gesture nav / home indicator as edge", () => {
    assert.equal(arEdgeKindFromFlags({ edge: true, back: false }), "edge");
  });
});

describe("arEdgeInZone", () => {
  it("treats the middle of the camera as safe", () => {
    assert.equal(arEdgeInZone(0.5, 0.5), false);
  });

  it("flags left, right, and home-indicator bands", () => {
    assert.equal(arEdgeInZone(0.02, 0.5), true);
    assert.equal(arEdgeInZone(0.98, 0.5), true);
    assert.equal(arEdgeInZone(0.5, 0.97), true);
  });
});

describe("arEdgeReadWeb", () => {
  it("is valid in this runtime", () => {
    const web = arEdgeReadWeb();
    assert.equal(web.valid, true);
    assert.equal(web.back, false);
  });
});

describe("arEdgeStep", () => {
  it("stays ok until the hold elapses", () => {
    const t0 = 1_000;
    const a = arEdgeStep(null, "edge", t0);
    assert.equal(a.kind, "ok");
    const b = arEdgeStep(a, "edge", t0 + AR_EDGE_HOLD_MS - 1);
    assert.equal(b.kind, "ok");
    const c = arEdgeStep(b, "edge", t0 + AR_EDGE_HOLD_MS);
    assert.equal(c.kind, "edge");
  });

  it("needs a longer hold to return to ok", () => {
    const t0 = 5_000;
    let h = arEdgeStep(null, "back", t0);
    h = arEdgeStep(h, "back", t0 + AR_EDGE_HOLD_MS);
    assert.equal(h.kind, "back");
    h = arEdgeStep(h, "ok", t0 + AR_EDGE_HOLD_MS + 1);
    h = arEdgeStep(h, "ok", t0 + AR_EDGE_HOLD_MS + AR_EDGE_RELEASE_MS - 1);
    assert.equal(h.kind, "back");
    h = arEdgeStep(h, "ok", t0 + AR_EDGE_HOLD_MS + 1 + AR_EDGE_RELEASE_MS);
    assert.equal(h.kind, "ok");
  });
});

describe("arEdgeCoach + blocks", () => {
  it("is silent when ok", () => {
    assert.equal(arEdgeCoach("ok", "place"), null);
  });

  it("names the product", () => {
    assert.match(arEdgeCoach("edge", "place") ?? "", /middle|Back/i);
    assert.match(arEdgeCoach("edge", "scan") ?? "", /plaque|middle/i);
    assert.match(arEdgeCoach("edge", "emily") ?? "", /floor|Leave|middle/i);
    assert.match(arEdgeCoach("edge", "cubes") ?? "", /table|Exit|middle/i);
    assert.match(arEdgeCoach("back", "place") ?? "", /Back|edge/i);
    assert.match(arEdgeCoach("back", "emily") ?? "", /Leave AR|edge/i);
  });

  it("blocks edge-zone place except scan", () => {
    assert.equal(arEdgeBlocksPlace("ok", "place", 0.02, 0.5), false);
    assert.equal(arEdgeBlocksPlace("edge", "place", 0.5, 0.5), false);
    assert.equal(arEdgeBlocksPlace("edge", "place", 0.02, 0.5), true);
    assert.equal(arEdgeBlocksPlace("edge", "emily", 0.98, 0.4), true);
    assert.equal(arEdgeBlocksPlace("edge", "cubes", 0.5, 0.97), true);
    assert.equal(arEdgeBlocksPlace("edge", "scan", 0.02, 0.5), false);
    assert.equal(arEdgeBlocksPlace("back", "place"), true);
    assert.equal(arEdgeBlocksPlace("back", "scan"), false);
  });
});

describe("arEdgeApplyClass + parse", () => {
  it("toggles edge/back classes", () => {
    const el = {
      classList: {
        edge: false,
        back: false,
        toggle(name: string, on: boolean) {
          if (name === "is-ar-edge-edge") this.edge = on;
          if (name === "is-ar-edge-back") this.back = on;
        },
      },
    };
    arEdgeApplyClass(el as unknown as Element, "edge");
    assert.equal(el.classList.edge, true);
    assert.equal(el.classList.back, false);
    arEdgeApplyClass(el as unknown as Element, "ok");
    assert.equal(el.classList.edge, false);
    assert.equal(el.classList.back, false);
  });

  it("parses native payloads", () => {
    assert.deepEqual(
      arEdgeParseNative({
        kind: "edge",
        edge: true,
        back: false,
        valid: true,
      }),
      {
        kind: "edge",
        edge: true,
        back: false,
        valid: true,
      },
    );
    assert.equal(arEdgeParseNative({ back: true }).kind, "back");
    assert.equal(arEdgeParseNative({ kind: "nope" }).kind, "ok");
  });
});
