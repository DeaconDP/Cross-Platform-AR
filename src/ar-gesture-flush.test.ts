import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  arPointerNorm,
  arTapCatch,
  arViewPx,
  clamp01,
  createArGestureFlush,
} from "./ar-gesture-flush.ts";

describe("clamp01 / arPointerNorm", () => {
  it("clamps and treats non-finite as center", () => {
    assert.equal(clamp01(-1), 0);
    assert.equal(clamp01(2), 1);
    assert.equal(clamp01(0.25), 0.25);
    assert.equal(clamp01(Number.NaN), 0.5);
  });

  it("maps overlay-local client coords to 0–1", () => {
    const rect = { left: 100, top: 50, width: 200, height: 400 };
    assert.deepEqual(arPointerNorm(100, 50, rect), { x: 0, y: 0 });
    assert.deepEqual(arPointerNorm(200, 250, rect), { x: 0.5, y: 0.5 });
    assert.deepEqual(arPointerNorm(400, 50, rect), { x: 1, y: 0 });
  });

  it("uses the view center when the overlay has no size", () => {
    assert.deepEqual(arPointerNorm(10, 10, { left: 0, top: 0, width: 0, height: 0 }), {
      x: 0.5,
      y: 0.5,
    });
    assert.deepEqual(arPointerNorm(10, 10, null), { x: 0.5, y: 0.5 });
  });
});

describe("arViewPx", () => {
  it("converts overlay-relative CSS pixels through devicePixelRatio", () => {
    assert.deepEqual(arViewPx(120, 80, { left: 20, top: 10 }, 2), { x: 200, y: 140 });
    assert.deepEqual(arViewPx(10, 10, null, 0), { x: 10, y: 10 });
  });
});

describe("createArGestureFlush", () => {
  it("accumulates rotate, latest-wins scale/move, and flushes once per raf", () => {
    const calls: string[] = [];
    let tick: (() => void) | null = null;
    let scheduled = 0;
    const flush = createArGestureFlush(
      {
        rotate: (dx, dy) => calls.push(`r:${dx},${dy}`),
        scale: (f) => calls.push(`s:${f}`),
        move: (x, y) => calls.push(`m:${x},${y}`),
      },
      (cb) => {
        scheduled += 1;
        tick = cb;
        return 1;
      },
      () => {
        tick = null;
      },
    );

    flush.queueRotate(2, 1);
    flush.queueRotate(3, 4);
    flush.queueScale(1.1);
    flush.queueScale(1.4);
    flush.queueMove(0.2, 0.3);
    flush.queueMove(0.8, 0.1);
    assert.equal(scheduled, 1);
    assert.deepEqual(flush.pending(), {
      rotate: { dx: 5, dy: 5 },
      scale: 1.4,
      move: { x: 0.8, y: 0.1 },
    });

    tick?.();
    assert.deepEqual(calls, ["r:5,5", "s:1.4", "m:0.8,0.1"]);
    assert.deepEqual(flush.pending(), { rotate: { dx: 0, dy: 0 }, scale: null, move: null });
    flush.dispose();
  });

  it("drops queued work while blocked (emerge / spawn)", () => {
    const calls: string[] = [];
    let tick: (() => void) | null = null;
    const flush = createArGestureFlush(
      { rotate: (dx, dy) => calls.push(`r:${dx},${dy}`) },
      (cb) => {
        tick = cb;
        return 7;
      },
      () => {
        tick = null;
      },
    );
    flush.setBlocked(true);
    flush.queueRotate(9, 9);
    assert.deepEqual(flush.pending().rotate, { dx: 0, dy: 0 });
    flush.setBlocked(false);
    flush.queueRotate(1, 2);
    tick?.();
    assert.deepEqual(calls, ["r:1,2"]);
    flush.dispose();
  });
});

describe("arTapCatch", () => {
  it("returns a miss instead of throwing when the native tap rejects", async () => {
    const miss = await arTapCatch(async () => {
      throw new Error("Still loading this fossil…");
    }, 0.4, 0.6);
    assert.deepEqual(miss, { placed: false });
    const hit = await arTapCatch(async () => ({ placed: true }), 0.5, 0.5);
    assert.deepEqual(hit, { placed: true });
  });
});
