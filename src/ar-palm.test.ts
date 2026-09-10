import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AR_PALM_HOLD_MS,
  AR_PALM_RELEASE_MS,
  arPalmApplyClass,
  arPalmBlocksPlace,
  arPalmCoach,
  arPalmFromContact,
  arPalmKindFromFlags,
  arPalmParseNative,
  arPalmReadWeb,
  arPalmStep,
} from "./ar-palm.ts";

describe("arPalmKindFromFlags", () => {
  it("is ok when the contact is a normal finger", () => {
    assert.equal(arPalmKindFromFlags({ fat: false, smear: false }), "ok");
  });

  it("prefers a wet smear over a fat palm", () => {
    assert.equal(arPalmKindFromFlags({ fat: true, smear: true }), "smear");
  });
});

describe("arPalmFromContact", () => {
  it("stays ok for a typical fingertip", () => {
    assert.deepEqual(arPalmFromContact({ widthPx: 12, heightPx: 12, pointers: 1 }), {
      fat: false,
      smear: false,
    });
  });

  it("flags a palm-sized blob and a three-finger smear", () => {
    assert.equal(arPalmFromContact({ widthPx: 64 }).fat, true);
    assert.equal(arPalmFromContact({ pointers: 3 }).smear, true);
  });
});

describe("arPalmReadWeb", () => {
  it("starts invalid until a host notes a contact", () => {
    assert.equal(arPalmReadWeb().valid, false);
  });
});

describe("arPalmStep", () => {
  it("stays ok until the hold elapses", () => {
    const t0 = 1_000;
    const a = arPalmStep(null, "fat", t0);
    assert.equal(a.kind, "ok");
    assert.equal(arPalmStep(a, "fat", t0 + AR_PALM_HOLD_MS).kind, "fat");
  });

  it("needs a longer hold to return to ok", () => {
    const t0 = 5_000;
    let h = arPalmStep(null, "smear", t0);
    h = arPalmStep(h, "smear", t0 + AR_PALM_HOLD_MS);
    h = arPalmStep(h, "ok", t0 + AR_PALM_HOLD_MS + 1);
    h = arPalmStep(h, "ok", t0 + AR_PALM_HOLD_MS + AR_PALM_RELEASE_MS - 1);
    assert.equal(h.kind, "smear");
    h = arPalmStep(h, "ok", t0 + AR_PALM_HOLD_MS + 1 + AR_PALM_RELEASE_MS);
    assert.equal(h.kind, "ok");
  });
});

describe("arPalmCoach + blocks", () => {
  it("names cubes and blocks place", () => {
    assert.equal(arPalmCoach("ok", "cubes"), null);
    assert.match(arPalmCoach("fat", "cubes") ?? "", /hand|surface/i);
    assert.equal(arPalmBlocksPlace("fat", "cubes"), true);
    assert.equal(arPalmBlocksPlace("fat", "scan"), false);
  });
});

describe("arPalmApplyClass + parse", () => {
  it("toggles classes and parses native payloads", () => {
    const el = {
      classList: {
        fat: false,
        smear: false,
        toggle(name: string, on: boolean) {
          if (name === "is-ar-palm-fat") this.fat = on;
          if (name === "is-ar-palm-smear") this.smear = on;
        },
      },
    };
    arPalmApplyClass(el as unknown as Element, "smear");
    assert.equal(el.classList.smear, true);
    assert.equal(arPalmParseNative({ smear: true }).kind, "smear");
  });
});
