import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AR_HZ_HOLD_MS,
  AR_HZ_RELEASE_MS,
  arHzApplyClass,
  arHzBlocksPlace,
  arHzCoach,
  arHzKindFromFlags,
  arHzKindFromHz,
  arHzParseNative,
  arHzPrefersLowFx,
  arHzReadWeb,
  arHzStep,
} from "./ar-hz.ts";

describe("arHzKindFromFlags", () => {
  it("is ok when the panel is 60 Hz+", () => {
    assert.equal(arHzKindFromFlags({ slowOn: false, softOn: false }), "ok");
  });

  it("prefers a 30 Hz panel over a soft cap", () => {
    assert.equal(arHzKindFromFlags({ slowOn: true, softOn: true }), "slow");
  });

  it("treats a 48 Hz panel as soft", () => {
    assert.equal(arHzKindFromFlags({ slowOn: false, softOn: true }), "soft");
  });
});

describe("arHzKindFromHz", () => {
  it("maps 30 / 48 / 60", () => {
    assert.equal(arHzKindFromHz(30), "slow");
    assert.equal(arHzKindFromHz(48), "soft");
    assert.equal(arHzKindFromHz(60), "ok");
    assert.equal(arHzKindFromHz(0), "ok");
  });
});

describe("arHzReadWeb", () => {
  it("is invalid in node without window", () => {
    const web = arHzReadWeb();
    assert.equal(web.valid, false);
    assert.equal(web.slowOn, false);
    assert.equal(web.softOn, false);
  });
});

describe("arHzStep", () => {
  it("stays ok until the hold elapses", () => {
    const t0 = 1_000;
    const a = arHzStep(null, "slow", t0);
    assert.equal(a.kind, "ok");
    const b = arHzStep(a, "slow", t0 + AR_HZ_HOLD_MS - 1);
    assert.equal(b.kind, "ok");
    const c = arHzStep(b, "slow", t0 + AR_HZ_HOLD_MS);
    assert.equal(c.kind, "slow");
  });

  it("needs a longer hold to return to ok", () => {
    const t0 = 5_000;
    let h = arHzStep(null, "soft", t0);
    h = arHzStep(h, "soft", t0 + AR_HZ_HOLD_MS);
    assert.equal(h.kind, "soft");
    h = arHzStep(h, "ok", t0 + AR_HZ_HOLD_MS + 1);
    h = arHzStep(h, "ok", t0 + AR_HZ_HOLD_MS + AR_HZ_RELEASE_MS - 1);
    assert.equal(h.kind, "soft");
    h = arHzStep(h, "ok", t0 + AR_HZ_HOLD_MS + 1 + AR_HZ_RELEASE_MS);
    assert.equal(h.kind, "ok");
  });
});

describe("arHzCoach + blocks + lowFx", () => {
  it("is silent when ok", () => {
    assert.equal(arHzCoach("ok", "place"), null);
  });

  it("names the product", () => {
    assert.match(arHzCoach("slow", "place") ?? "", /30 Hz|fossil|step/i);
    assert.match(arHzCoach("slow", "scan") ?? "", /plaque|30 Hz/i);
    assert.match(arHzCoach("slow", "emily") ?? "", /30 Hz|step/i);
    assert.match(arHzCoach("slow", "cubes") ?? "", /cube|30 Hz/i);
    assert.match(arHzCoach("soft", "place") ?? "", /slow|fossil|planted/i);
    assert.match(arHzCoach("soft", "emily") ?? "", /slow|planted/i);
  });

  it("never blocks place", () => {
    assert.equal(arHzBlocksPlace("ok", "place"), false);
    assert.equal(arHzBlocksPlace("soft", "place"), false);
    assert.equal(arHzBlocksPlace("slow", "emily"), false);
    assert.equal(arHzBlocksPlace("soft", "scan"), false);
    assert.equal(arHzBlocksPlace("slow", "cubes"), false);
  });

  it("asks hosts to drop extra FX when slow or soft", () => {
    assert.equal(arHzPrefersLowFx("ok"), false);
    assert.equal(arHzPrefersLowFx("soft"), true);
    assert.equal(arHzPrefersLowFx("slow"), true);
  });
});

describe("arHzApplyClass + parse", () => {
  it("toggles slow/soft classes", () => {
    const el = {
      classList: {
        slowOn: false,
        softOn: false,
        toggle(name: string, on: boolean) {
          if (name === "is-ar-hz-slow") this.slowOn = on;
          if (name === "is-ar-hz-soft") this.softOn = on;
        },
      },
    };
    arHzApplyClass(el as unknown as Element, "slow");
    assert.equal(el.classList.slowOn, true);
    assert.equal(el.classList.softOn, false);
    arHzApplyClass(el as unknown as Element, "ok");
    assert.equal(el.classList.slowOn, false);
    assert.equal(el.classList.softOn, false);
  });

  it("parses native payloads", () => {
    assert.deepEqual(
      arHzParseNative({
        kind: "slow",
        slowOn: true,
        softOn: true,
        hz: 30,
        valid: true,
      }),
      {
        kind: "slow",
        slowOn: true,
        softOn: true,
        hz: 30,
        valid: true,
      },
    );
    assert.equal(arHzParseNative({ slowOn: true }).kind, "slow");
    assert.equal(arHzParseNative({ softOn: true }).kind, "soft");
    assert.equal(arHzParseNative({ kind: "nope" }).kind, "ok");
  });
});
