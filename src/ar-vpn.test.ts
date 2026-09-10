import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AR_VPN_HOLD_MS,
  AR_VPN_RELEASE_MS,
  arVpnApplyClass,
  arVpnBlocksPlace,
  arVpnCoach,
  arVpnKindFromFlags,
  arVpnParseNative,
  arVpnPrefersCache,
  arVpnReadWeb,
  arVpnStep,
} from "./ar-vpn.ts";

describe("arVpnKindFromFlags", () => {
  it("is ok on a direct path", () => {
    assert.equal(arVpnKindFromFlags({ vpn: false, lock: false }), "ok");
  });

  it("prefers lockdown over a plain VPN", () => {
    assert.equal(arVpnKindFromFlags({ vpn: true, lock: true }), "lock");
  });

  it("treats a tunneled path as vpn", () => {
    assert.equal(arVpnKindFromFlags({ vpn: true, lock: false }), "vpn");
  });
});

describe("arVpnReadWeb", () => {
  it("is invalid in node without window", () => {
    const web = arVpnReadWeb();
    assert.equal(web.valid, false);
    assert.equal(web.vpn, false);
    assert.equal(web.lock, false);
  });
});

describe("arVpnStep", () => {
  it("stays ok until the hold elapses", () => {
    const t0 = 1_000;
    const a = arVpnStep(null, "vpn", t0);
    assert.equal(a.kind, "ok");
    const b = arVpnStep(a, "vpn", t0 + AR_VPN_HOLD_MS - 1);
    assert.equal(b.kind, "ok");
    const c = arVpnStep(b, "vpn", t0 + AR_VPN_HOLD_MS);
    assert.equal(c.kind, "vpn");
  });

  it("needs a longer hold to return to ok", () => {
    const t0 = 5_000;
    let h = arVpnStep(null, "lock", t0);
    h = arVpnStep(h, "lock", t0 + AR_VPN_HOLD_MS);
    assert.equal(h.kind, "lock");
    h = arVpnStep(h, "ok", t0 + AR_VPN_HOLD_MS + 1);
    h = arVpnStep(h, "ok", t0 + AR_VPN_HOLD_MS + AR_VPN_RELEASE_MS - 1);
    assert.equal(h.kind, "lock");
    h = arVpnStep(h, "ok", t0 + AR_VPN_HOLD_MS + 1 + AR_VPN_RELEASE_MS);
    assert.equal(h.kind, "ok");
  });
});

describe("arVpnCoach + blocks + cache", () => {
  it("is silent when ok", () => {
    assert.equal(arVpnCoach("ok", "place"), null);
  });

  it("names the product", () => {
    assert.match(arVpnCoach("lock", "place") ?? "", /lockdown|fossil|table/i);
    assert.match(arVpnCoach("lock", "scan") ?? "", /hunting|lockdown/i);
    assert.match(arVpnCoach("lock", "emily") ?? "", /floor|lockdown/i);
    assert.match(arVpnCoach("lock", "cubes") ?? "", /cube|surface/i);
    assert.match(arVpnCoach("vpn", "place") ?? "", /VPN|table|fossil/i);
    assert.match(arVpnCoach("vpn", "emily") ?? "", /VPN|floor/i);
  });

  it("never blocks place", () => {
    assert.equal(arVpnBlocksPlace("ok", "place"), false);
    assert.equal(arVpnBlocksPlace("vpn", "place"), false);
    assert.equal(arVpnBlocksPlace("lock", "emily"), false);
    assert.equal(arVpnBlocksPlace("vpn", "scan"), false);
    assert.equal(arVpnBlocksPlace("lock", "cubes"), false);
  });

  it("asks hosts to prefer cache on vpn or lock", () => {
    assert.equal(arVpnPrefersCache("ok"), false);
    assert.equal(arVpnPrefersCache("vpn"), true);
    assert.equal(arVpnPrefersCache("lock"), true);
  });
});

describe("arVpnApplyClass + parse", () => {
  it("toggles vpn/lock classes", () => {
    const el = {
      classList: {
        vpn: false,
        lock: false,
        toggle(name: string, on: boolean) {
          if (name === "is-ar-vpn-vpn") this.vpn = on;
          if (name === "is-ar-vpn-lock") this.lock = on;
        },
      },
    };
    arVpnApplyClass(el as unknown as Element, "vpn");
    assert.equal(el.classList.vpn, true);
    assert.equal(el.classList.lock, false);
    arVpnApplyClass(el as unknown as Element, "ok");
    assert.equal(el.classList.vpn, false);
    assert.equal(el.classList.lock, false);
  });

  it("parses native payloads", () => {
    assert.deepEqual(
      arVpnParseNative({
        kind: "lock",
        vpn: true,
        lock: true,
        valid: true,
      }),
      {
        kind: "lock",
        vpn: true,
        lock: true,
        valid: true,
      },
    );
    assert.equal(arVpnParseNative({ lock: true }).kind, "lock");
    assert.equal(arVpnParseNative({ vpn: true }).kind, "vpn");
    assert.equal(arVpnParseNative({ kind: "nope" }).kind, "ok");
  });
});
