import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AR_NET_FETCH_CAPTIVE_MS,
  AR_NET_HOLD_MS,
  arArmNet,
  arFetchWithBudget,
  arJudgeNet,
  arNetCoach,
  arNetFetchMs,
  arNetIsOnboard,
  arNetShouldSkipRemote,
  arReadBrowserNet,
} from "./ar-net.ts";

describe("arJudgeNet", () => {
  it("treats unsupported as ok", () => {
    assert.equal(arJudgeNet({ supported: false, online: false }), "ok");
  });

  it("flags captive before offline", () => {
    assert.equal(
      arJudgeNet({ captive: true, online: false }),
      "captive",
    );
  });

  it("flags offline and none", () => {
    assert.equal(arJudgeNet({ online: false }), "offline");
    assert.equal(arJudgeNet({ type: "none" }), "offline");
  });

  it("flags thin or high-latency links as slow", () => {
    assert.equal(arJudgeNet({ downlinkMbps: 0.2 }), "slow");
    assert.equal(arJudgeNet({ rttMs: 900 }), "slow");
    assert.equal(arJudgeNet({ constrained: true }), "slow");
    assert.equal(arJudgeNet({ downlinkMbps: 12, rttMs: 40 }), "ok");
  });
});

describe("arNetCoach", () => {
  it("is silent when ok", () => {
    assert.equal(arNetCoach("ok", "place"), "");
  });

  it("names no-signal vs login vs slow", () => {
    assert.match(arNetCoach("offline", "place"), /No signal/);
    assert.match(arNetCoach("offline", "emily"), /no signal/);
    assert.match(arNetCoach("captive", "scan"), /login/);
    assert.match(arNetCoach("slow", "cubes"), /Slow/);
  });
});

describe("arNetIsOnboard / skip / budget", () => {
  it("treats same-origin and Capacitor paths as onboard", () => {
    assert.equal(arNetIsOnboard("/content/models/ar/foo.glb"), true);
    assert.equal(arNetIsOnboard("./models/foo.glb"), true);
    assert.equal(arNetIsOnboard("capacitor://localhost/x"), true);
    assert.equal(
      arNetIsOnboard("https://app.example/x", "https://app.example"),
      true,
    );
    assert.equal(arNetIsOnboard("https://cdn.example/x"), false);
  });

  it("skips only remote fetches when offline or captive", () => {
    assert.equal(arNetShouldSkipRemote("offline", false), true);
    assert.equal(arNetShouldSkipRemote("captive", false), true);
    assert.equal(arNetShouldSkipRemote("offline", true), false);
    assert.equal(arNetShouldSkipRemote("ok", false), false);
  });

  it("gives remote offline a zero budget", () => {
    assert.equal(arNetFetchMs("offline", false), 0);
    assert.equal(arNetFetchMs("captive", false), AR_NET_FETCH_CAPTIVE_MS);
    assert.ok(arNetFetchMs("offline", true) > 0);
  });
});

describe("arFetchWithBudget", () => {
  it("skips a remote URL when offline", async () => {
    const result = await arFetchWithBudget({
      kind: "offline",
      url: "https://cdn.example/model.glb",
      fetchFn: async () => {
        throw new Error("should not run");
      },
    });
    assert.equal(result.skipped, true);
    assert.equal(result.ok, false);
  });

  it("loads an onboard URL even when offline", async () => {
    const result = await arFetchWithBudget({
      kind: "offline",
      url: "/content/models/ar/foo.glb",
      fetchFn: async () => "ok",
    });
    assert.equal(result.ok, true);
    assert.equal(result.value, "ok");
  });

  it("times out a hung remote fetch", async () => {
    const result = await arFetchWithBudget({
      kind: "ok",
      url: "https://cdn.example/model.glb",
      budgetMs: 20,
      fetchFn: (_url, init) =>
        new Promise((_, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new Error("aborted")),
          );
        }),
    });
    assert.equal(result.ok, false);
    assert.equal(result.timedOut, true);
  });
});

describe("arReadBrowserNet", () => {
  it("reads onLine and connection numbers", () => {
    const sample = arReadBrowserNet({
      onLine: false,
      connection: { type: "wifi", downlink: 0.15, rtt: 40 },
    });
    assert.equal(sample.online, false);
    assert.equal(sample.type, "wifi");
    assert.equal(sample.downlinkMbps, 0.15);
    assert.equal(arJudgeNet(sample), "offline");
  });
});

describe("arArmNet", () => {
  it("holds before coaching so a one-frame blip is ignored", () => {
    const kinds: string[] = [];
    let clock = 0;
    const arm = arArmNet({
      product: "place",
      now: () => clock,
      onKind: (k) => kinds.push(k),
    });
    arm.note({ online: false });
    assert.deepEqual(kinds, []);
    clock += AR_NET_HOLD_MS;
    arm.note({ online: false });
    assert.deepEqual(kinds, ["offline"]);
    arm.note({ online: true, type: "wifi", downlinkMbps: 20 });
    assert.deepEqual(kinds, ["offline", "ok"]);
    arm.dispose();
  });
});
