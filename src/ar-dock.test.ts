import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AR_DOCK_HOLD_MS,
  AR_DOCK_RELEASE_MS,
  arDockApplyClass,
  arDockBlocksPlace,
  arDockCoach,
  arDockKindFromFlags,
  arDockParseNative,
  arDockPrefersStayHot,
  arDockReadWeb,
  arDockStep,
} from "./ar-dock.ts";

describe("arDockKindFromFlags", () => {
  it("is ok on battery", () => {
    assert.equal(arDockKindFromFlags({ desk: false, charge: false }), "ok");
  });

  it("prefers a desk dock over a plain charger", () => {
    assert.equal(arDockKindFromFlags({ desk: true, charge: true }), "desk");
  });

  it("treats a handheld charger as charge", () => {
    assert.equal(arDockKindFromFlags({ desk: false, charge: true }), "charge");
  });
});

describe("arDockReadWeb", () => {
  it("is invalid in node without window", () => {
    const web = arDockReadWeb();
    assert.equal(web.valid, false);
    assert.equal(web.desk, false);
    assert.equal(web.charge, false);
  });
});

describe("arDockStep", () => {
  it("stays ok until the hold elapses", () => {
    const t0 = 1_000;
    const a = arDockStep(null, "charge", t0);
    assert.equal(a.kind, "ok");
    const b = arDockStep(a, "charge", t0 + AR_DOCK_HOLD_MS - 1);
    assert.equal(b.kind, "ok");
    const c = arDockStep(b, "charge", t0 + AR_DOCK_HOLD_MS);
    assert.equal(c.kind, "charge");
  });

  it("needs a longer hold to return to ok", () => {
    const t0 = 5_000;
    let h = arDockStep(null, "desk", t0);
    h = arDockStep(h, "desk", t0 + AR_DOCK_HOLD_MS);
    assert.equal(h.kind, "desk");
    h = arDockStep(h, "ok", t0 + AR_DOCK_HOLD_MS + 1);
    h = arDockStep(h, "ok", t0 + AR_DOCK_HOLD_MS + AR_DOCK_RELEASE_MS - 1);
    assert.equal(h.kind, "desk");
    h = arDockStep(h, "ok", t0 + AR_DOCK_HOLD_MS + 1 + AR_DOCK_RELEASE_MS);
    assert.equal(h.kind, "ok");
  });
});

describe("arDockCoach + blocks + stay-hot", () => {
  it("is silent when ok", () => {
    assert.equal(arDockCoach("ok", "place"), null);
  });

  it("names the product", () => {
    assert.match(arDockCoach("desk", "place") ?? "", /stand|fossil|table/i);
    assert.match(arDockCoach("desk", "scan") ?? "", /hunting|stand/i);
    assert.match(arDockCoach("desk", "emily") ?? "", /floor|stand/i);
    assert.match(arDockCoach("desk", "cubes") ?? "", /cube|surface/i);
    assert.match(arDockCoach("charge", "place") ?? "", /Charging|table|fossil/i);
    assert.match(arDockCoach("charge", "emily") ?? "", /Charging|floor/i);
  });

  it("never blocks place", () => {
    assert.equal(arDockBlocksPlace("ok", "place"), false);
    assert.equal(arDockBlocksPlace("charge", "place"), false);
    assert.equal(arDockBlocksPlace("desk", "emily"), false);
    assert.equal(arDockBlocksPlace("charge", "scan"), false);
    assert.equal(arDockBlocksPlace("desk", "cubes"), false);
  });

  it("asks hosts to stay hot on desk or charge", () => {
    assert.equal(arDockPrefersStayHot("ok"), false);
    assert.equal(arDockPrefersStayHot("charge"), true);
    assert.equal(arDockPrefersStayHot("desk"), true);
  });
});

describe("arDockApplyClass + parse", () => {
  it("toggles desk/charge classes", () => {
    const el = {
      classList: {
        desk: false,
        charge: false,
        toggle(name: string, on: boolean) {
          if (name === "is-ar-dock-desk") this.desk = on;
          if (name === "is-ar-dock-charge") this.charge = on;
        },
      },
    };
    arDockApplyClass(el as unknown as Element, "desk");
    assert.equal(el.classList.desk, true);
    assert.equal(el.classList.charge, false);
    arDockApplyClass(el as unknown as Element, "ok");
    assert.equal(el.classList.desk, false);
    assert.equal(el.classList.charge, false);
  });

  it("parses native payloads", () => {
    assert.deepEqual(
      arDockParseNative({
        kind: "desk",
        desk: true,
        charge: true,
        valid: true,
      }),
      {
        kind: "desk",
        desk: true,
        charge: true,
        valid: true,
      },
    );
    assert.equal(arDockParseNative({ desk: true }).kind, "desk");
    assert.equal(arDockParseNative({ charge: true }).kind, "charge");
    assert.equal(arDockParseNative({ kind: "nope" }).kind, "ok");
  });
});
