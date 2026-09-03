import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createArAvailabilityMemo,
  createArSessionEpoch,
  whenDocumentVisible,
} from "./ar-session-guard.ts";

describe("createArSessionEpoch", () => {
  it("drops events after end and from a previous token", () => {
    const epoch = createArSessionEpoch();
    const first = epoch.begin();
    epoch.bind(first, "1");
    assert.equal(epoch.accept(first, { sessionId: "1" }), true);

    epoch.end(first);
    assert.equal(epoch.accept(first, { sessionId: "1" }), false);

    const second = epoch.begin();
    epoch.bind(second, "2");
    assert.equal(epoch.accept(first, { sessionId: "1" }), false);
    assert.equal(epoch.accept(second, { sessionId: "1" }), false);
    assert.equal(epoch.accept(second, { sessionId: "2" }), true);
  });

  it("rejects stamped leftovers before bind, and unstamped events after bind", () => {
    const epoch = createArSessionEpoch();
    const token = epoch.begin();
    assert.equal(epoch.accept(token, { sessionId: "9" }), false);
    assert.equal(epoch.accept(token, {}), true);
    epoch.bind(token, "9");
    assert.equal(epoch.accept(token, {}), false);
    assert.equal(epoch.accept(token, { sessionId: "9" }), true);
  });
});

describe("createArAvailabilityMemo", () => {
  it("reuses a supported hit and expires a miss sooner", async () => {
    let now = 1_000;
    let probes = 0;
    const memo = createArAvailabilityMemo({
      hitTtlMs: 40,
      missTtlMs: 5,
      now: () => now,
    });

    const hit = await memo.probe(async () => {
      probes += 1;
      return { available: true };
    });
    assert.equal(hit.available, true);
    now += 20;
    await memo.probe(async () => {
      probes += 1;
      return { available: false };
    });
    assert.equal(probes, 1);

    memo.invalidate();
    const miss = await memo.probe(async () => {
      probes += 1;
      return { available: false };
    });
    assert.equal(miss.available, false);
    now += 3;
    await memo.probe(async () => {
      probes += 1;
      return { available: true };
    });
    assert.equal(probes, 2);
    now += 6;
    await memo.probe(async () => {
      probes += 1;
      return { supported: true };
    });
    assert.equal(probes, 3);
  });
});

describe("whenDocumentVisible", () => {
  it("resolves already, visible, or timeout", async () => {
    assert.equal(await whenDocumentVisible(10, { hidden: () => false }), "already");

    let hidden = true;
    let notify = () => {};
    const visible = whenDocumentVisible(50, {
      hidden: () => hidden,
      subscribe: (cb) => {
        notify = () => {
          hidden = false;
          cb();
        };
        return () => {};
      },
      delay: () => () => {},
    });
    notify();
    assert.equal(await visible, "visible");

    let fireTimer = () => {};
    const timed = whenDocumentVisible(5, {
      hidden: () => true,
      subscribe: () => () => {},
      delay: (_ms, cb) => {
        fireTimer = cb;
        return () => {};
      },
    });
    fireTimer();
    assert.equal(await timed, "timeout");
  });
});
