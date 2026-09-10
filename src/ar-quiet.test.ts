import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AR_QUIET_HOLD_MS,
  AR_QUIET_RELEASE_MS,
  arQuietApplyClass,
  arQuietBlocksPlace,
  arQuietCoach,
  arQuietKindFromFlags,
  arQuietParseNative,
  arQuietPrefersVisual,
  arQuietReadWeb,
  arQuietStep,
} from "./ar-quiet.ts";

describe("arQuietKindFromFlags", () => {
  it("is ok when Focus is off", () => {
    assert.equal(arQuietKindFromFlags({ sleep: false, focus: false }), "ok");
  });

  it("prefers Sleep over generic Focus", () => {
    assert.equal(arQuietKindFromFlags({ sleep: true, focus: true }), "sleep");
  });

  it("treats DND / Focus as focus", () => {
    assert.equal(arQuietKindFromFlags({ sleep: false, focus: true }), "focus");
  });
});

describe("arQuietReadWeb", () => {
  it("is invalid in node without window", () => {
    const web = arQuietReadWeb();
    assert.equal(web.valid, false);
    assert.equal(web.sleep, false);
    assert.equal(web.focus, false);
  });
});

describe("arQuietStep", () => {
  it("stays ok until the hold elapses", () => {
    const t0 = 1_000;
    const a = arQuietStep(null, "focus", t0);
    assert.equal(a.kind, "ok");
    const b = arQuietStep(a, "focus", t0 + AR_QUIET_HOLD_MS - 1);
    assert.equal(b.kind, "ok");
    const c = arQuietStep(b, "focus", t0 + AR_QUIET_HOLD_MS);
    assert.equal(c.kind, "focus");
  });

  it("needs a longer hold to return to ok", () => {
    const t0 = 5_000;
    let h = arQuietStep(null, "sleep", t0);
    h = arQuietStep(h, "sleep", t0 + AR_QUIET_HOLD_MS);
    assert.equal(h.kind, "sleep");
    h = arQuietStep(h, "ok", t0 + AR_QUIET_HOLD_MS + 1);
    h = arQuietStep(h, "ok", t0 + AR_QUIET_HOLD_MS + AR_QUIET_RELEASE_MS - 1);
    assert.equal(h.kind, "sleep");
    h = arQuietStep(h, "ok", t0 + AR_QUIET_HOLD_MS + 1 + AR_QUIET_RELEASE_MS);
    assert.equal(h.kind, "ok");
  });
});

describe("arQuietCoach + blocks + visual", () => {
  it("is silent when ok", () => {
    assert.equal(arQuietCoach("ok", "place"), null);
  });

  it("names the product", () => {
    assert.match(arQuietCoach("sleep", "place") ?? "", /Sleep|table|silent/i);
    assert.match(arQuietCoach("sleep", "scan") ?? "", /hunting|Sleep/i);
    assert.match(arQuietCoach("sleep", "emily") ?? "", /floor|Sleep/i);
    assert.match(arQuietCoach("sleep", "cubes") ?? "", /surface|Sleep/i);
    assert.match(arQuietCoach("focus", "place") ?? "", /Disturb|fossil|highlight/i);
    assert.match(arQuietCoach("focus", "emily") ?? "", /Disturb|floor/i);
  });

  it("never blocks place", () => {
    assert.equal(arQuietBlocksPlace("ok", "place"), false);
    assert.equal(arQuietBlocksPlace("focus", "place"), false);
    assert.equal(arQuietBlocksPlace("sleep", "emily"), false);
    assert.equal(arQuietBlocksPlace("focus", "scan"), false);
    assert.equal(arQuietBlocksPlace("sleep", "cubes"), false);
  });

  it("asks hosts to keep the visual coach up", () => {
    assert.equal(arQuietPrefersVisual("ok"), false);
    assert.equal(arQuietPrefersVisual("focus"), true);
    assert.equal(arQuietPrefersVisual("sleep"), true);
  });
});

describe("arQuietApplyClass + parse", () => {
  it("toggles sleep/focus classes", () => {
    const el = {
      classList: {
        sleep: false,
        focus: false,
        toggle(name: string, on: boolean) {
          if (name === "is-ar-quiet-sleep") this.sleep = on;
          if (name === "is-ar-quiet-focus") this.focus = on;
        },
      },
    };
    arQuietApplyClass(el as unknown as Element, "sleep");
    assert.equal(el.classList.sleep, true);
    assert.equal(el.classList.focus, false);
    arQuietApplyClass(el as unknown as Element, "ok");
    assert.equal(el.classList.sleep, false);
    assert.equal(el.classList.focus, false);
  });

  it("parses native payloads", () => {
    assert.deepEqual(
      arQuietParseNative({
        kind: "sleep",
        sleep: true,
        focus: true,
        valid: true,
      }),
      {
        kind: "sleep",
        sleep: true,
        focus: true,
        valid: true,
      },
    );
    assert.equal(arQuietParseNative({ sleep: true }).kind, "sleep");
    assert.equal(arQuietParseNative({ focus: true }).kind, "focus");
    assert.equal(arQuietParseNative({ kind: "nope" }).kind, "ok");
  });
});
