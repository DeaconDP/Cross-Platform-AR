import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AR_CAPTION_HOLD_MS,
  AR_CAPTION_RELEASE_MS,
  arCaptionApplyClass,
  arCaptionBlocksPlace,
  arCaptionCoach,
  arCaptionKindFromFlags,
  arCaptionParseNative,
  arCaptionReadWeb,
  arCaptionStep,
} from "./ar-caption.ts";

describe("arCaptionKindFromFlags", () => {
  it("is ok when captions and aids are off", () => {
    assert.equal(arCaptionKindFromFlags({ caps: false, aid: false }), "ok");
  });

  it("prefers captions over a hearing aid", () => {
    assert.equal(arCaptionKindFromFlags({ caps: true, aid: true }), "caps");
  });

  it("treats a paired aid as aid", () => {
    assert.equal(arCaptionKindFromFlags({ caps: false, aid: true }), "aid");
  });
});

describe("arCaptionReadWeb", () => {
  it("is never valid — captions / aids are native", () => {
    const web = arCaptionReadWeb();
    assert.equal(web.valid, false);
    assert.equal(web.caps, false);
    assert.equal(web.aid, false);
  });
});

describe("arCaptionStep", () => {
  it("stays ok until the hold elapses", () => {
    const t0 = 1_000;
    const a = arCaptionStep(null, "caps", t0);
    assert.equal(a.kind, "ok");
    const b = arCaptionStep(a, "caps", t0 + AR_CAPTION_HOLD_MS - 1);
    assert.equal(b.kind, "ok");
    const c = arCaptionStep(b, "caps", t0 + AR_CAPTION_HOLD_MS);
    assert.equal(c.kind, "caps");
  });

  it("needs a longer hold to return to ok", () => {
    const t0 = 5_000;
    let h = arCaptionStep(null, "aid", t0);
    h = arCaptionStep(h, "aid", t0 + AR_CAPTION_HOLD_MS);
    assert.equal(h.kind, "aid");
    h = arCaptionStep(h, "ok", t0 + AR_CAPTION_HOLD_MS + 1);
    h = arCaptionStep(h, "ok", t0 + AR_CAPTION_HOLD_MS + AR_CAPTION_RELEASE_MS - 1);
    assert.equal(h.kind, "aid");
    h = arCaptionStep(h, "ok", t0 + AR_CAPTION_HOLD_MS + 1 + AR_CAPTION_RELEASE_MS);
    assert.equal(h.kind, "ok");
  });
});

describe("arCaptionCoach + blocks", () => {
  it("is silent when ok", () => {
    assert.equal(arCaptionCoach("ok", "place"), null);
  });

  it("names the product", () => {
    assert.match(arCaptionCoach("caps", "place") ?? "", /Captions|fossil/i);
    assert.match(arCaptionCoach("caps", "scan") ?? "", /plaque|Captions/i);
    assert.match(arCaptionCoach("caps", "emily") ?? "", /words|Captions/i);
    assert.match(arCaptionCoach("caps", "cubes") ?? "", /Captions|hints/i);
    assert.match(arCaptionCoach("aid", "place") ?? "", /Hearing|aid/i);
    assert.match(arCaptionCoach("aid", "emily") ?? "", /Hearing|aid/i);
  });

  it("never blocks place", () => {
    assert.equal(arCaptionBlocksPlace("ok", "place"), false);
    assert.equal(arCaptionBlocksPlace("caps", "place"), false);
    assert.equal(arCaptionBlocksPlace("aid", "emily"), false);
    assert.equal(arCaptionBlocksPlace("caps", "scan"), false);
    assert.equal(arCaptionBlocksPlace("aid", "cubes"), false);
  });
});

describe("arCaptionApplyClass + parse", () => {
  it("toggles caps/aid classes", () => {
    const el = {
      classList: {
        caps: false,
        aid: false,
        toggle(name: string, on: boolean) {
          if (name === "is-ar-caption-caps") this.caps = on;
          if (name === "is-ar-caption-aid") this.aid = on;
        },
      },
    };
    arCaptionApplyClass(el as unknown as Element, "caps");
    assert.equal(el.classList.caps, true);
    assert.equal(el.classList.aid, false);
    arCaptionApplyClass(el as unknown as Element, "ok");
    assert.equal(el.classList.caps, false);
    assert.equal(el.classList.aid, false);
  });

  it("parses native payloads", () => {
    assert.deepEqual(
      arCaptionParseNative({
        kind: "caps",
        caps: true,
        aid: true,
        valid: true,
      }),
      {
        kind: "caps",
        caps: true,
        aid: true,
        valid: true,
      },
    );
    assert.equal(arCaptionParseNative({ aid: true }).kind, "aid");
    assert.equal(arCaptionParseNative({ kind: "nope" }).kind, "ok");
  });
});
