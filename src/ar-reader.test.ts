import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AR_READER_HOLD_MS,
  AR_READER_RELEASE_MS,
  arReaderApplyClass,
  arReaderBlocksPlace,
  arReaderCoach,
  arReaderKindFromFlags,
  arReaderParseNative,
  arReaderReadWeb,
  arReaderStep,
} from "./ar-reader.ts";

describe("arReaderKindFromFlags", () => {
  it("is ok when nothing is remapping touches", () => {
    assert.equal(arReaderKindFromFlags({ explore: false, speak: false }), "ok");
  });

  it("prefers touch exploration over spoken-only", () => {
    assert.equal(arReaderKindFromFlags({ explore: true, speak: true }), "explore");
  });

  it("treats Select to Speak as speak", () => {
    assert.equal(arReaderKindFromFlags({ explore: false, speak: true }), "speak");
  });
});

describe("arReaderReadWeb", () => {
  it("is never valid — VoiceOver / TalkBack are native", () => {
    const web = arReaderReadWeb();
    assert.equal(web.valid, false);
    assert.equal(web.explore, false);
    assert.equal(web.speak, false);
  });
});

describe("arReaderStep", () => {
  it("stays ok until the hold elapses", () => {
    const t0 = 1_000;
    const a = arReaderStep(null, "explore", t0);
    assert.equal(a.kind, "ok");
    const b = arReaderStep(a, "explore", t0 + AR_READER_HOLD_MS - 1);
    assert.equal(b.kind, "ok");
    const c = arReaderStep(b, "explore", t0 + AR_READER_HOLD_MS);
    assert.equal(c.kind, "explore");
  });

  it("needs a longer hold to return to ok", () => {
    const t0 = 5_000;
    let h = arReaderStep(null, "speak", t0);
    h = arReaderStep(h, "speak", t0 + AR_READER_HOLD_MS);
    assert.equal(h.kind, "speak");
    h = arReaderStep(h, "ok", t0 + AR_READER_HOLD_MS + 1);
    h = arReaderStep(h, "ok", t0 + AR_READER_HOLD_MS + AR_READER_RELEASE_MS - 1);
    assert.equal(h.kind, "speak");
    h = arReaderStep(h, "ok", t0 + AR_READER_HOLD_MS + 1 + AR_READER_RELEASE_MS);
    assert.equal(h.kind, "ok");
  });
});

describe("arReaderCoach + blocks", () => {
  it("is silent when ok", () => {
    assert.equal(arReaderCoach("ok", "place"), null);
  });

  it("names the product", () => {
    assert.match(arReaderCoach("explore", "place") ?? "", /TalkBack|table/i);
    assert.match(arReaderCoach("explore", "scan") ?? "", /plaque|VoiceOver/i);
    assert.match(arReaderCoach("explore", "emily") ?? "", /sit|tap|VoiceOver/i);
    assert.match(arReaderCoach("explore", "cubes") ?? "", /TalkBack|table/i);
    assert.match(arReaderCoach("speak", "place") ?? "", /Spoken|Back/i);
    assert.match(arReaderCoach("speak", "emily") ?? "", /Place|Spoken/i);
  });

  it("blocks place on explore except scan", () => {
    assert.equal(arReaderBlocksPlace("ok", "place"), false);
    assert.equal(arReaderBlocksPlace("speak", "place"), false);
    assert.equal(arReaderBlocksPlace("explore", "place"), true);
    assert.equal(arReaderBlocksPlace("explore", "emily"), true);
    assert.equal(arReaderBlocksPlace("explore", "cubes"), true);
    assert.equal(arReaderBlocksPlace("explore", "scan"), false);
  });
});

describe("arReaderApplyClass + parse", () => {
  it("toggles explore/speak classes", () => {
    const el = {
      classList: {
        explore: false,
        speak: false,
        toggle(name: string, on: boolean) {
          if (name === "is-ar-reader-explore") this.explore = on;
          if (name === "is-ar-reader-speak") this.speak = on;
        },
      },
    };
    arReaderApplyClass(el as unknown as Element, "explore");
    assert.equal(el.classList.explore, true);
    assert.equal(el.classList.speak, false);
    arReaderApplyClass(el as unknown as Element, "ok");
    assert.equal(el.classList.explore, false);
    assert.equal(el.classList.speak, false);
  });

  it("parses native payloads", () => {
    assert.deepEqual(
      arReaderParseNative({
        kind: "explore",
        explore: true,
        speak: true,
        valid: true,
      }),
      {
        kind: "explore",
        explore: true,
        speak: true,
        valid: true,
      },
    );
    assert.equal(arReaderParseNative({ speak: true }).kind, "speak");
    assert.equal(arReaderParseNative({ kind: "nope" }).kind, "ok");
  });
});
