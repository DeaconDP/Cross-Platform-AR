import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LAST_PLANE_MAX_AGE_MS,
  TAP_RETRY_MS,
  canSnapToLastPlane,
  isUsablePlaneExtent,
  tapWithRetry,
} from "./ar-place-policy.ts";

describe("isUsablePlaneExtent", () => {
  it("rejects tiny or non-finite extents", () => {
    assert.equal(isUsablePlaneExtent(0.05, 0.4), false);
    assert.equal(isUsablePlaneExtent(0.4, 0.05), false);
    assert.equal(isUsablePlaneExtent(Number.NaN, 0.4), false);
  });

  it("accepts a table-sized plane", () => {
    assert.equal(isUsablePlaneExtent(0.18, 0.18), true);
    assert.equal(isUsablePlaneExtent(0.6, 0.4), true);
  });
});

describe("canSnapToLastPlane", () => {
  it("requires tracking and a fresh timestamp", () => {
    assert.equal(canSnapToLastPlane(5000, null, true), false);
    assert.equal(canSnapToLastPlane(5000, 5000 - LAST_PLANE_MAX_AGE_MS - 1, true), false);
    assert.equal(canSnapToLastPlane(5000, 4000, false), false);
    assert.equal(canSnapToLastPlane(5000, 4000, true), true);
  });
});

describe("tapWithRetry", () => {
  it("returns the first success without waiting", async () => {
    let waits = 0;
    const result = await tapWithRetry(
      async () => ({ placed: true, count: 1 }),
      10,
      20,
      async () => {
        waits += 1;
      },
    );
    assert.deepEqual(result, { placed: true, count: 1 });
    assert.equal(waits, 0);
  });

  it("retries once after TAP_RETRY_MS when the first tap misses", async () => {
    const xs: number[] = [];
    let waited = 0;
    const result = await tapWithRetry(
      async (x) => {
        xs.push(x);
        return { placed: xs.length > 1, count: xs.length };
      },
      12,
      34,
      async (ms) => {
        waited = ms;
      },
    );
    assert.deepEqual(result, { placed: true, count: 2 });
    assert.deepEqual(xs, [12, 12]);
    assert.equal(waited, TAP_RETRY_MS);
  });
});
