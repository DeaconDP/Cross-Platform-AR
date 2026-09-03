import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AR_STALE_PAUSE_MS,
  AR_START_LEASE_EXPIRED,
  createArWorldLease,
  isStalePause,
} from "./ar-world-freshness.ts";

describe("isStalePause", () => {
  it("is false when the session never paused", () => {
    assert.equal(isStalePause(null, 50_000), false);
    assert.equal(isStalePause(undefined, 50_000), false);
  });

  it("is false just under the threshold and true at it", () => {
    assert.equal(isStalePause(1000, 1000 + AR_STALE_PAUSE_MS - 1), false);
    assert.equal(isStalePause(1000, 1000 + AR_STALE_PAUSE_MS), true);
  });
});

describe("createArWorldLease", () => {
  it("invalidates the previous generation on begin and end", () => {
    const lease = createArWorldLease();
    const first = lease.begin();
    assert.equal(lease.isCurrent(first), true);
    const second = lease.begin();
    assert.equal(lease.isCurrent(first), false);
    assert.equal(lease.isCurrent(second), true);
    lease.end();
    assert.equal(lease.isCurrent(second), false);
  });

  it("asks for a world reset only after a long pause", () => {
    let now = 10_000;
    const lease = createArWorldLease({ clock: { now: () => now } });
    lease.begin();
    lease.notePaused();
    now = 10_000 + AR_STALE_PAUSE_MS - 1;
    assert.equal(lease.resumeNeedsReset(), false);
    assert.equal(lease.noteResumed().reset, false);
    lease.notePaused();
    now += AR_STALE_PAUSE_MS;
    assert.equal(lease.noteResumed().reset, true);
    assert.equal(lease.resumeNeedsReset(), false);
  });

  it("ignores pause notes after end", () => {
    const lease = createArWorldLease({ clock: { now: () => 0 } });
    lease.begin();
    lease.end();
    lease.notePaused(0);
    assert.equal(lease.resumeNeedsReset(AR_STALE_PAUSE_MS * 2), false);
  });

  it("runs exclusive work in order", async () => {
    const lease = createArWorldLease();
    const order: number[] = [];
    const slow = lease.runExclusive(async () => {
      await new Promise((r) => setTimeout(r, 20));
      order.push(1);
      return "a";
    });
    const fast = lease.runExclusive(async () => {
      order.push(2);
      return "b";
    });
    assert.deepEqual(await Promise.all([slow, fast]), ["a", "b"]);
    assert.deepEqual(order, [1, 2]);
  });

  it("rejects when the start lease expires", async () => {
    const lease = createArWorldLease();
    const hung = new Promise<string>(() => undefined);
    await assert.rejects(
      () => lease.withLease(hung, 15),
      (err: unknown) =>
        err instanceof Error && err.message === AR_START_LEASE_EXPIRED,
    );
  });
});
