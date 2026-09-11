import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AR_RANGE_HOLD_MS,
  AR_RANGE_RELEASE_MS,
  arRangeApplyClass,
  arRangeBlocksPlace,
  arRangeCoach,
  arRangeKindFromFlags,
  arRangeKindFromSignals,
  arRangeParseNative,
  arRangePrefersMarks,
  arRangeReadWeb,
  arRangeStep,
} from "./ar-range.ts";

describe("arRangeKindFromFlags", () => {
  it("is ok at normal brightness", () => {
    assert.equal(arRangeKindFromFlags({ hdrOn: false, peakOn: false }), "ok");
  });

  it("prefers HDR over peak brightness", () => {
    assert.equal(arRangeKindFromFlags({ hdrOn: true, peakOn: true }), "hdr");
  });

  it("treats full brightness as peak", () => {
    assert.equal(arRangeKindFromFlags({ hdrOn: false, peakOn: true }), "peak");
  });
});

describe("arRangeKindFromSignals", () => {
  it("maps HDR / dynamic-range / peak / ok", () => {
    assert.equal(arRangeKindFromSignals({ hdr: true }), "hdr");
    assert.equal(arRangeKindFromSignals({ dynamicRangeHigh: true }), "hdr");
    assert.equal(arRangeKindFromSignals({ peak: true }), "peak");
    assert.equal(
      arRangeKindFromSignals({ hdr: true, peak: true }),
      "hdr",
    );
    assert.equal(arRangeKindFromSignals({}), "ok");
  });
});

describe("arRangeReadWeb", () => {
  it("is invalid in node without matchMedia", () => {
    const web = arRangeReadWeb();
    assert.equal(web.valid, false);
    assert.equal(web.hdrOn, false);
    assert.equal(web.peakOn, false);
  });
});

describe("arRangeStep", () => {
  it("stays ok until the hold elapses", () => {
    const t0 = 1_000;
    const a = arRangeStep(null, "hdr", t0);
    assert.equal(a.kind, "ok");
    const b = arRangeStep(a, "hdr", t0 + AR_RANGE_HOLD_MS - 1);
    assert.equal(b.kind, "ok");
    const c = arRangeStep(b, "hdr", t0 + AR_RANGE_HOLD_MS);
    assert.equal(c.kind, "hdr");
  });

  it("needs a longer hold to return to ok", () => {
    const t0 = 5_000;
    let h = arRangeStep(null, "peak", t0);
    h = arRangeStep(h, "peak", t0 + AR_RANGE_HOLD_MS);
    assert.equal(h.kind, "peak");
    h = arRangeStep(h, "ok", t0 + AR_RANGE_HOLD_MS + 1);
    h = arRangeStep(h, "ok", t0 + AR_RANGE_HOLD_MS + AR_RANGE_RELEASE_MS - 1);
    assert.equal(h.kind, "peak");
    h = arRangeStep(h, "ok", t0 + AR_RANGE_HOLD_MS + 1 + AR_RANGE_RELEASE_MS);
    assert.equal(h.kind, "ok");
  });
});

describe("arRangeCoach + blocks + prefersMarks", () => {
  it("is silent when ok", () => {
    assert.equal(arRangeCoach("ok", "place"), null);
  });

  it("names the product", () => {
    assert.match(arRangeCoach("hdr", "place") ?? "", /HDR|fossil|table/i);
    assert.match(arRangeCoach("hdr", "scan") ?? "", /HDR|plaque/i);
    assert.match(arRangeCoach("hdr", "emily") ?? "", /HDR/i);
    assert.match(arRangeCoach("hdr", "cubes") ?? "", /HDR|cube/i);
    assert.match(
      arRangeCoach("peak", "place") ?? "",
      /full brightness|high-contrast|fossil/i,
    );
    assert.match(arRangeCoach("peak", "emily") ?? "", /full brightness/i);
  });

  it("never blocks place", () => {
    assert.equal(arRangeBlocksPlace("ok", "place"), false);
    assert.equal(arRangeBlocksPlace("peak", "place"), false);
    assert.equal(arRangeBlocksPlace("hdr", "emily"), false);
    assert.equal(arRangeBlocksPlace("peak", "scan"), false);
    assert.equal(arRangeBlocksPlace("hdr", "cubes"), false);
  });

  it("asks hosts to prefer marks when tone-mapping washes color", () => {
    assert.equal(arRangePrefersMarks("ok"), false);
    assert.equal(arRangePrefersMarks("peak"), true);
    assert.equal(arRangePrefersMarks("hdr"), true);
  });
});

describe("arRangeApplyClass + parse", () => {
  it("toggles hdr/peak classes", () => {
    const el = {
      classList: {
        hdrOn: false,
        peakOn: false,
        toggle(name: string, on: boolean) {
          if (name === "is-ar-range-hdr") this.hdrOn = on;
          if (name === "is-ar-range-peak") this.peakOn = on;
        },
      },
    };
    arRangeApplyClass(el as unknown as Element, "hdr");
    assert.equal(el.classList.hdrOn, true);
    assert.equal(el.classList.peakOn, false);
    arRangeApplyClass(el as unknown as Element, "ok");
    assert.equal(el.classList.hdrOn, false);
    assert.equal(el.classList.peakOn, false);
  });

  it("parses native payloads", () => {
    assert.deepEqual(
      arRangeParseNative({
        kind: "hdr",
        hdrOn: true,
        peakOn: true,
        valid: true,
      }),
      {
        kind: "hdr",
        hdrOn: true,
        peakOn: true,
        valid: true,
      },
    );
    assert.equal(arRangeParseNative({ hdrOn: true }).kind, "hdr");
    assert.equal(arRangeParseNative({ peakOn: true }).kind, "peak");
    assert.equal(arRangeParseNative({ kind: "nope" }).kind, "ok");
  });
});
