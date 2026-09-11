import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AR_VEIL_HOLD_MS,
  AR_VEIL_RELEASE_MS,
  arVeilApplyClass,
  arVeilBlocksPlace,
  arVeilCoach,
  arVeilKindFromFlags,
  arVeilKindFromSignals,
  arVeilParseNative,
  arVeilPrefersMarks,
  arVeilReadWeb,
  arVeilStep,
} from "./ar-veil.ts";

describe("arVeilKindFromFlags", () => {
  it("is ok when the camera is uncovered", () => {
    assert.equal(arVeilKindFromFlags({ coverOn: false, peekOn: false }), "ok");
  });

  it("prefers a full cover over a banner peek", () => {
    assert.equal(arVeilKindFromFlags({ coverOn: true, peekOn: true }), "cover");
  });

  it("treats a tall status banner as peek", () => {
    assert.equal(arVeilKindFromFlags({ coverOn: false, peekOn: true }), "peek");
  });
});

describe("arVeilKindFromSignals", () => {
  it("maps cover / peek / unfocused / ok", () => {
    assert.equal(arVeilKindFromSignals({ cover: true }), "cover");
    assert.equal(arVeilKindFromSignals({ peek: true }), "peek");
    assert.equal(arVeilKindFromSignals({ unfocusedVisible: true }), "peek");
    assert.equal(
      arVeilKindFromSignals({ cover: true, peek: true }),
      "cover",
    );
    assert.equal(arVeilKindFromSignals({}), "ok");
  });
});

describe("arVeilReadWeb", () => {
  it("is invalid in node without a document", () => {
    const web = arVeilReadWeb();
    assert.equal(web.valid, false);
    assert.equal(web.coverOn, false);
    assert.equal(web.peekOn, false);
  });
});

describe("arVeilStep", () => {
  it("stays ok until the hold elapses", () => {
    const t0 = 1_000;
    const a = arVeilStep(null, "cover", t0);
    assert.equal(a.kind, "ok");
    const b = arVeilStep(a, "cover", t0 + AR_VEIL_HOLD_MS - 1);
    assert.equal(b.kind, "ok");
    const c = arVeilStep(b, "cover", t0 + AR_VEIL_HOLD_MS);
    assert.equal(c.kind, "cover");
  });

  it("needs a longer hold to return to ok", () => {
    const t0 = 5_000;
    let h = arVeilStep(null, "peek", t0);
    h = arVeilStep(h, "peek", t0 + AR_VEIL_HOLD_MS);
    assert.equal(h.kind, "peek");
    h = arVeilStep(h, "ok", t0 + AR_VEIL_HOLD_MS + 1);
    h = arVeilStep(h, "ok", t0 + AR_VEIL_HOLD_MS + AR_VEIL_RELEASE_MS - 1);
    assert.equal(h.kind, "peek");
    h = arVeilStep(h, "ok", t0 + AR_VEIL_HOLD_MS + 1 + AR_VEIL_RELEASE_MS);
    assert.equal(h.kind, "ok");
  });
});

describe("arVeilCoach + blocks + prefersMarks", () => {
  it("is silent when ok", () => {
    assert.equal(arVeilCoach("ok", "place"), null);
  });

  it("names the product", () => {
    assert.match(arVeilCoach("cover", "place") ?? "", /system panel|table|dismiss/i);
    assert.match(arVeilCoach("cover", "scan") ?? "", /system panel|plaque/i);
    assert.match(arVeilCoach("cover", "emily") ?? "", /system panel|floor/i);
    assert.match(arVeilCoach("cover", "cubes") ?? "", /system panel|table/i);
    assert.match(
      arVeilCoach("peek", "place") ?? "",
      /banner|fossil|below/i,
    );
    assert.match(arVeilCoach("peek", "emily") ?? "", /banner|floor/i);
  });

  it("never blocks place", () => {
    assert.equal(arVeilBlocksPlace("ok", "place"), false);
    assert.equal(arVeilBlocksPlace("peek", "place"), false);
    assert.equal(arVeilBlocksPlace("cover", "emily"), false);
    assert.equal(arVeilBlocksPlace("peek", "scan"), false);
    assert.equal(arVeilBlocksPlace("cover", "cubes"), false);
  });

  it("asks hosts to prefer marks when a panel covers the camera", () => {
    assert.equal(arVeilPrefersMarks("ok"), false);
    assert.equal(arVeilPrefersMarks("peek"), true);
    assert.equal(arVeilPrefersMarks("cover"), true);
  });
});

describe("arVeilApplyClass + parse", () => {
  it("toggles cover/peek classes", () => {
    const el = {
      classList: {
        coverOn: false,
        peekOn: false,
        toggle(name: string, on: boolean) {
          if (name === "is-ar-veil-cover") this.coverOn = on;
          if (name === "is-ar-veil-peek") this.peekOn = on;
        },
      },
    };
    arVeilApplyClass(el as unknown as Element, "cover");
    assert.equal(el.classList.coverOn, true);
    assert.equal(el.classList.peekOn, false);
    arVeilApplyClass(el as unknown as Element, "ok");
    assert.equal(el.classList.coverOn, false);
    assert.equal(el.classList.peekOn, false);
  });

  it("parses native payloads", () => {
    assert.deepEqual(
      arVeilParseNative({
        kind: "cover",
        coverOn: true,
        peekOn: true,
        valid: true,
      }),
      {
        kind: "cover",
        coverOn: true,
        peekOn: true,
        valid: true,
      },
    );
    assert.equal(arVeilParseNative({ coverOn: true }).kind, "cover");
    assert.equal(arVeilParseNative({ peekOn: true }).kind, "peek");
    assert.equal(arVeilParseNative({ kind: "nope" }).kind, "ok");
  });
});
