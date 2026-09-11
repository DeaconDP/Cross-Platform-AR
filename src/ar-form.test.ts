import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AR_FORM_HOLD_MS,
  AR_FORM_RELEASE_MS,
  arFormApplyClass,
  arFormBlocksPlace,
  arFormCoach,
  arFormDesktopUa,
  arFormKindFromFlags,
  arFormKindFromSignals,
  arFormParseNative,
  arFormPrefersPhone,
  arFormReadWeb,
  arFormStep,
} from "./ar-form.ts";

describe("arFormKindFromFlags", () => {
  it("is ok on a phone", () => {
    assert.equal(arFormKindFromFlags({ hostOn: false, siteOn: false }), "ok");
  });

  it("prefers a computer host over a desktop-site UA", () => {
    assert.equal(arFormKindFromFlags({ hostOn: true, siteOn: true }), "host");
  });

  it("treats Request Desktop Website as site", () => {
    assert.equal(arFormKindFromFlags({ hostOn: false, siteOn: true }), "site");
  });
});

describe("arFormKindFromSignals", () => {
  it("maps Mac / Chromebook / desktop UA / phone", () => {
    assert.equal(
      arFormKindFromSignals({
        iosOnMac: true,
        desktopUa: false,
        mobileUa: false,
        touch: false,
      }),
      "host",
    );
    assert.equal(
      arFormKindFromSignals({
        pcWithoutPhone: true,
        desktopUa: false,
        mobileUa: false,
        touch: true,
      }),
      "host",
    );
    assert.equal(
      arFormKindFromSignals({
        chromebook: true,
        desktopUa: true,
        mobileUa: false,
        touch: true,
      }),
      "host",
    );
    assert.equal(
      arFormKindFromSignals({
        desktopUa: true,
        mobileUa: false,
        touch: false,
      }),
      "host",
    );
    assert.equal(
      arFormKindFromSignals({
        desktopUa: true,
        mobileUa: false,
        touch: true,
      }),
      "site",
    );
    assert.equal(
      arFormKindFromSignals({
        desktopUa: false,
        mobileUa: true,
        touch: true,
      }),
      "ok",
    );
    assert.equal(
      arFormKindFromSignals({
        desktopUa: false,
        mobileUa: false,
        touch: false,
        mobileHint: false,
      }),
      "host",
    );
  });
});

describe("arFormDesktopUa", () => {
  it("spots a desktop UA and ignores Mobile Safari", () => {
    assert.equal(
      arFormDesktopUa(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
      ),
      true,
    );
    assert.equal(
      arFormDesktopUa(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
      ),
      false,
    );
  });
});

describe("arFormReadWeb", () => {
  it("is invalid in node without window", () => {
    const web = arFormReadWeb();
    assert.equal(web.valid, false);
    assert.equal(web.hostOn, false);
    assert.equal(web.siteOn, false);
  });
});

describe("arFormStep", () => {
  it("stays ok until the hold elapses", () => {
    const t0 = 1_000;
    const a = arFormStep(null, "host", t0);
    assert.equal(a.kind, "ok");
    const b = arFormStep(a, "host", t0 + AR_FORM_HOLD_MS - 1);
    assert.equal(b.kind, "ok");
    const c = arFormStep(b, "host", t0 + AR_FORM_HOLD_MS);
    assert.equal(c.kind, "host");
  });

  it("needs a longer hold to return to ok", () => {
    const t0 = 5_000;
    let h = arFormStep(null, "site", t0);
    h = arFormStep(h, "site", t0 + AR_FORM_HOLD_MS);
    assert.equal(h.kind, "site");
    h = arFormStep(h, "ok", t0 + AR_FORM_HOLD_MS + 1);
    h = arFormStep(h, "ok", t0 + AR_FORM_HOLD_MS + AR_FORM_RELEASE_MS - 1);
    assert.equal(h.kind, "site");
    h = arFormStep(h, "ok", t0 + AR_FORM_HOLD_MS + 1 + AR_FORM_RELEASE_MS);
    assert.equal(h.kind, "ok");
  });
});

describe("arFormCoach + blocks + prefersPhone", () => {
  it("is silent when ok", () => {
    assert.equal(arFormCoach("ok", "place"), null);
  });

  it("names the product", () => {
    assert.match(arFormCoach("host", "place") ?? "", /computer|phone|fossil/i);
    assert.match(arFormCoach("host", "scan") ?? "", /plaque|phone/i);
    assert.match(arFormCoach("host", "emily") ?? "", /computer|phone/i);
    assert.match(arFormCoach("host", "cubes") ?? "", /cube|phone/i);
    assert.match(
      arFormCoach("site", "place") ?? "",
      /Desktop Website|taps|fossil/i,
    );
    assert.match(arFormCoach("site", "emily") ?? "", /Desktop Website|taps/i);
  });

  it("never blocks place", () => {
    assert.equal(arFormBlocksPlace("ok", "place"), false);
    assert.equal(arFormBlocksPlace("site", "place"), false);
    assert.equal(arFormBlocksPlace("host", "emily"), false);
    assert.equal(arFormBlocksPlace("site", "scan"), false);
    assert.equal(arFormBlocksPlace("host", "cubes"), false);
  });

  it("asks hosts to prefer a phone when the form factor is wrong", () => {
    assert.equal(arFormPrefersPhone("ok"), false);
    assert.equal(arFormPrefersPhone("site"), true);
    assert.equal(arFormPrefersPhone("host"), true);
  });
});

describe("arFormApplyClass + parse", () => {
  it("toggles host/site classes", () => {
    const el = {
      classList: {
        hostOn: false,
        siteOn: false,
        toggle(name: string, on: boolean) {
          if (name === "is-ar-form-host") this.hostOn = on;
          if (name === "is-ar-form-site") this.siteOn = on;
        },
      },
    };
    arFormApplyClass(el as unknown as Element, "host");
    assert.equal(el.classList.hostOn, true);
    assert.equal(el.classList.siteOn, false);
    arFormApplyClass(el as unknown as Element, "ok");
    assert.equal(el.classList.hostOn, false);
    assert.equal(el.classList.siteOn, false);
  });

  it("parses native payloads", () => {
    assert.deepEqual(
      arFormParseNative({
        kind: "host",
        hostOn: true,
        siteOn: true,
        valid: true,
      }),
      {
        kind: "host",
        hostOn: true,
        siteOn: true,
        valid: true,
      },
    );
    assert.equal(arFormParseNative({ hostOn: true }).kind, "host");
    assert.equal(arFormParseNative({ siteOn: true }).kind, "site");
    assert.equal(arFormParseNative({ kind: "nope" }).kind, "ok");
  });
});
