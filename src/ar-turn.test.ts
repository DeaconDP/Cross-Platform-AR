import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AR_TURN_HOLD_MS,
  AR_TURN_RELEASE_MS,
  arTurnApplyClass,
  arTurnBlocksPlace,
  arTurnCoach,
  arTurnKindFromFlags,
  arTurnParseNative,
  arTurnPrefersUpright,
  arTurnReadWeb,
  arTurnStep,
} from "./ar-turn.ts";

describe("arTurnKindFromFlags", () => {
  it("is ok when the phone matches the UI", () => {
    assert.equal(arTurnKindFromFlags({ flipOn: false, lockOn: false }), "ok");
  });

  it("prefers a sideways mismatch over lock", () => {
    assert.equal(arTurnKindFromFlags({ flipOn: true, lockOn: true }), "flip");
  });

  it("treats rotation lock alone as lock", () => {
    assert.equal(arTurnKindFromFlags({ flipOn: false, lockOn: true }), "lock");
  });
});

describe("arTurnReadWeb", () => {
  it("is invalid in node without window", () => {
    const web = arTurnReadWeb();
    assert.equal(web.valid, false);
    assert.equal(web.flipOn, false);
    assert.equal(web.lockOn, false);
  });
});

describe("arTurnStep", () => {
  it("stays ok until the hold elapses", () => {
    const t0 = 1_000;
    const a = arTurnStep(null, "flip", t0);
    assert.equal(a.kind, "ok");
    const b = arTurnStep(a, "flip", t0 + AR_TURN_HOLD_MS - 1);
    assert.equal(b.kind, "ok");
    const c = arTurnStep(b, "flip", t0 + AR_TURN_HOLD_MS);
    assert.equal(c.kind, "flip");
  });

  it("needs a longer hold to return to ok", () => {
    const t0 = 5_000;
    let h = arTurnStep(null, "lock", t0);
    h = arTurnStep(h, "lock", t0 + AR_TURN_HOLD_MS);
    assert.equal(h.kind, "lock");
    h = arTurnStep(h, "ok", t0 + AR_TURN_HOLD_MS + 1);
    h = arTurnStep(h, "ok", t0 + AR_TURN_HOLD_MS + AR_TURN_RELEASE_MS - 1);
    assert.equal(h.kind, "lock");
    h = arTurnStep(h, "ok", t0 + AR_TURN_HOLD_MS + 1 + AR_TURN_RELEASE_MS);
    assert.equal(h.kind, "ok");
  });
});

describe("arTurnCoach + blocks + upright", () => {
  it("is silent when ok", () => {
    assert.equal(arTurnCoach("ok", "place"), null);
  });

  it("names the product", () => {
    assert.match(arTurnCoach("flip", "place") ?? "", /sideways|upright|fossil|table/i);
    assert.match(arTurnCoach("flip", "scan") ?? "", /plaque|sideways/i);
    assert.match(arTurnCoach("flip", "emily") ?? "", /floor|sideways/i);
    assert.match(arTurnCoach("flip", "cubes") ?? "", /cube|sideways/i);
    assert.match(arTurnCoach("lock", "place") ?? "", /Rotation lock|upright|table/i);
    assert.match(arTurnCoach("lock", "emily") ?? "", /Rotation lock|floor/i);
  });

  it("never blocks place", () => {
    assert.equal(arTurnBlocksPlace("ok", "place"), false);
    assert.equal(arTurnBlocksPlace("lock", "place"), false);
    assert.equal(arTurnBlocksPlace("flip", "emily"), false);
    assert.equal(arTurnBlocksPlace("lock", "scan"), false);
    assert.equal(arTurnBlocksPlace("flip", "cubes"), false);
  });

  it("asks hosts to keep chrome upright when lock or flip", () => {
    assert.equal(arTurnPrefersUpright("ok"), false);
    assert.equal(arTurnPrefersUpright("lock"), true);
    assert.equal(arTurnPrefersUpright("flip"), true);
  });
});

describe("arTurnApplyClass + parse", () => {
  it("toggles flip/lock classes", () => {
    const el = {
      classList: {
        flipOn: false,
        lockOn: false,
        toggle(name: string, on: boolean) {
          if (name === "is-ar-turn-flip") this.flipOn = on;
          if (name === "is-ar-turn-lock") this.lockOn = on;
        },
      },
    };
    arTurnApplyClass(el as unknown as Element, "flip");
    assert.equal(el.classList.flipOn, true);
    assert.equal(el.classList.lockOn, false);
    arTurnApplyClass(el as unknown as Element, "ok");
    assert.equal(el.classList.flipOn, false);
    assert.equal(el.classList.lockOn, false);
  });

  it("parses native payloads", () => {
    assert.deepEqual(
      arTurnParseNative({
        kind: "flip",
        flipOn: true,
        lockOn: true,
        valid: true,
      }),
      {
        kind: "flip",
        flipOn: true,
        lockOn: true,
        valid: true,
      },
    );
    assert.equal(arTurnParseNative({ flipOn: true }).kind, "flip");
    assert.equal(arTurnParseNative({ lockOn: true }).kind, "lock");
    assert.equal(arTurnParseNative({ kind: "nope" }).kind, "ok");
  });
});
