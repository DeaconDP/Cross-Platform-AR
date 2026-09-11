import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AR_DOZE_HOLD_MS,
  AR_DOZE_RELEASE_MS,
  arDozeApplyClass,
  arDozeBlocksPlace,
  arDozeCoach,
  arDozeKindFromFlags,
  arDozeParseNative,
  arDozePrefersStayHot,
  arDozeReadWeb,
  arDozeStep,
} from "./ar-doze.ts";

describe("arDozeKindFromFlags", () => {
  it("is ok when the OS is not restricting the app", () => {
    assert.equal(
      arDozeKindFromFlags({ restrict: false, optimize: false }),
      "ok",
    );
  });

  it("prefers restrict over optimize", () => {
    assert.equal(
      arDozeKindFromFlags({ restrict: true, optimize: true }),
      "restrict",
    );
  });

  it("treats App Standby / rare bucket as optimize", () => {
    assert.equal(
      arDozeKindFromFlags({ restrict: false, optimize: true }),
      "optimize",
    );
  });
});

describe("arDozeReadWeb", () => {
  it("is invalid in node without window", () => {
    const web = arDozeReadWeb();
    assert.equal(web.valid, false);
    assert.equal(web.restrict, false);
    assert.equal(web.optimize, false);
  });
});

describe("arDozeStep", () => {
  it("stays ok until the hold elapses", () => {
    const t0 = 1_000;
    const a = arDozeStep(null, "optimize", t0);
    assert.equal(a.kind, "ok");
    const b = arDozeStep(a, "optimize", t0 + AR_DOZE_HOLD_MS - 1);
    assert.equal(b.kind, "ok");
    const c = arDozeStep(b, "optimize", t0 + AR_DOZE_HOLD_MS);
    assert.equal(c.kind, "optimize");
  });

  it("needs a longer hold to return to ok", () => {
    const t0 = 5_000;
    let h = arDozeStep(null, "restrict", t0);
    h = arDozeStep(h, "restrict", t0 + AR_DOZE_HOLD_MS);
    assert.equal(h.kind, "restrict");
    h = arDozeStep(h, "ok", t0 + AR_DOZE_HOLD_MS + 1);
    h = arDozeStep(h, "ok", t0 + AR_DOZE_HOLD_MS + AR_DOZE_RELEASE_MS - 1);
    assert.equal(h.kind, "restrict");
    h = arDozeStep(h, "ok", t0 + AR_DOZE_HOLD_MS + 1 + AR_DOZE_RELEASE_MS);
    assert.equal(h.kind, "ok");
  });
});

describe("arDozeCoach + blocks + stay-hot", () => {
  it("is silent when ok", () => {
    assert.equal(arDozeCoach("ok", "place"), null);
  });

  it("names the product", () => {
    assert.match(arDozeCoach("restrict", "place") ?? "", /limiting|fossil|open/i);
    assert.match(arDozeCoach("restrict", "scan") ?? "", /hunting|limiting/i);
    assert.match(arDozeCoach("restrict", "emily") ?? "", /floor|limiting/i);
    assert.match(arDozeCoach("restrict", "cubes") ?? "", /surface|limiting/i);
    assert.match(arDozeCoach("optimize", "place") ?? "", /Power|tracking|screen/i);
    assert.match(arDozeCoach("optimize", "emily") ?? "", /Power|floor/i);
  });

  it("never blocks place", () => {
    assert.equal(arDozeBlocksPlace("ok", "place"), false);
    assert.equal(arDozeBlocksPlace("optimize", "place"), false);
    assert.equal(arDozeBlocksPlace("restrict", "emily"), false);
    assert.equal(arDozeBlocksPlace("optimize", "scan"), false);
    assert.equal(arDozeBlocksPlace("restrict", "cubes"), false);
  });

  it("asks hosts to keep the session in front", () => {
    assert.equal(arDozePrefersStayHot("ok"), false);
    assert.equal(arDozePrefersStayHot("optimize"), true);
    assert.equal(arDozePrefersStayHot("restrict"), true);
  });
});

describe("arDozeApplyClass + parse", () => {
  it("toggles restrict/optimize classes", () => {
    const el = {
      classList: {
        restrict: false,
        optimize: false,
        toggle(name: string, on: boolean) {
          if (name === "is-ar-doze-restrict") this.restrict = on;
          if (name === "is-ar-doze-optimize") this.optimize = on;
        },
      },
    };
    arDozeApplyClass(el as unknown as Element, "restrict");
    assert.equal(el.classList.restrict, true);
    assert.equal(el.classList.optimize, false);
    arDozeApplyClass(el as unknown as Element, "ok");
    assert.equal(el.classList.restrict, false);
    assert.equal(el.classList.optimize, false);
  });

  it("parses native payloads", () => {
    assert.deepEqual(
      arDozeParseNative({
        kind: "restrict",
        restrict: true,
        optimize: true,
        valid: true,
      }),
      {
        kind: "restrict",
        restrict: true,
        optimize: true,
        valid: true,
      },
    );
    assert.equal(arDozeParseNative({ restrict: true }).kind, "restrict");
    assert.equal(arDozeParseNative({ optimize: true }).kind, "optimize");
    assert.equal(arDozeParseNative({ kind: "nope" }).kind, "ok");
  });
});
