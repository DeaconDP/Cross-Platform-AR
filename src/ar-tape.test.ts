import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AR_TAPE_HOLD_MS,
  AR_TAPE_RELEASE_MS,
  arTapeApplyClass,
  arTapeBlocksPlace,
  arTapeCoach,
  arTapeKindFromFlags,
  arTapeParseNative,
  arTapePrefersLowFx,
  arTapeReadWeb,
  arTapeStep,
} from "./ar-tape.ts";

describe("arTapeKindFromFlags", () => {
  it("is ok when the screen is not captured", () => {
    assert.equal(arTapeKindFromFlags({ record: false, shot: false }), "ok");
  });

  it("prefers record over shot", () => {
    assert.equal(arTapeKindFromFlags({ record: true, shot: true }), "record");
  });

  it("treats a recent screenshot as shot", () => {
    assert.equal(arTapeKindFromFlags({ record: false, shot: true }), "shot");
  });
});

describe("arTapeReadWeb", () => {
  it("is invalid in node without window", () => {
    const web = arTapeReadWeb();
    assert.equal(web.valid, false);
    assert.equal(web.record, false);
    assert.equal(web.shot, false);
  });
});

describe("arTapeStep", () => {
  it("stays ok until the hold elapses", () => {
    const t0 = 1_000;
    const a = arTapeStep(null, "record", t0);
    assert.equal(a.kind, "ok");
    const b = arTapeStep(a, "record", t0 + AR_TAPE_HOLD_MS - 1);
    assert.equal(b.kind, "ok");
    const c = arTapeStep(b, "record", t0 + AR_TAPE_HOLD_MS);
    assert.equal(c.kind, "record");
  });

  it("needs a longer hold to return to ok", () => {
    const t0 = 5_000;
    let h = arTapeStep(null, "shot", t0);
    h = arTapeStep(h, "shot", t0 + AR_TAPE_HOLD_MS);
    assert.equal(h.kind, "shot");
    h = arTapeStep(h, "ok", t0 + AR_TAPE_HOLD_MS + 1);
    h = arTapeStep(h, "ok", t0 + AR_TAPE_HOLD_MS + AR_TAPE_RELEASE_MS - 1);
    assert.equal(h.kind, "shot");
    h = arTapeStep(h, "ok", t0 + AR_TAPE_HOLD_MS + 1 + AR_TAPE_RELEASE_MS);
    assert.equal(h.kind, "ok");
  });
});

describe("arTapeCoach + blocks + low-fx", () => {
  it("is silent when ok", () => {
    assert.equal(arTapeCoach("ok", "place"), null);
  });

  it("names the product", () => {
    assert.match(arTapeCoach("record", "place") ?? "", /Recording|fossil|places/i);
    assert.match(arTapeCoach("record", "scan") ?? "", /hunting|Recording/i);
    assert.match(arTapeCoach("record", "emily") ?? "", /floor|Recording/i);
    assert.match(arTapeCoach("record", "cubes") ?? "", /surface|Recording/i);
    assert.match(arTapeCoach("shot", "place") ?? "", /Screenshot|placing/i);
    assert.match(arTapeCoach("shot", "emily") ?? "", /Screenshot|floor/i);
  });

  it("never blocks place", () => {
    assert.equal(arTapeBlocksPlace("ok", "place"), false);
    assert.equal(arTapeBlocksPlace("shot", "place"), false);
    assert.equal(arTapeBlocksPlace("record", "emily"), false);
    assert.equal(arTapeBlocksPlace("shot", "scan"), false);
    assert.equal(arTapeBlocksPlace("record", "cubes"), false);
  });

  it("asks hosts for low FX only while recording", () => {
    assert.equal(arTapePrefersLowFx("ok"), false);
    assert.equal(arTapePrefersLowFx("shot"), false);
    assert.equal(arTapePrefersLowFx("record"), true);
  });
});

describe("arTapeApplyClass + parse", () => {
  it("toggles record/shot classes", () => {
    const el = {
      classList: {
        record: false,
        shot: false,
        toggle(name: string, on: boolean) {
          if (name === "is-ar-tape-record") this.record = on;
          if (name === "is-ar-tape-shot") this.shot = on;
        },
      },
    };
    arTapeApplyClass(el as unknown as Element, "record");
    assert.equal(el.classList.record, true);
    assert.equal(el.classList.shot, false);
    arTapeApplyClass(el as unknown as Element, "ok");
    assert.equal(el.classList.record, false);
    assert.equal(el.classList.shot, false);
  });

  it("parses native payloads", () => {
    assert.deepEqual(
      arTapeParseNative({
        kind: "record",
        record: true,
        shot: true,
        valid: true,
      }),
      {
        kind: "record",
        record: true,
        shot: true,
        valid: true,
      },
    );
    assert.equal(arTapeParseNative({ record: true }).kind, "record");
    assert.equal(arTapeParseNative({ shot: true }).kind, "shot");
    assert.equal(arTapeParseNative({ kind: "nope" }).kind, "ok");
  });
});
