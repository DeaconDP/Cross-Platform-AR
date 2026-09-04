import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AR_CAST_CLEAR_MS,
  AR_CAST_HOLD_MS,
  arCastCoach,
  arCastLowFx,
  arJudgeCast,
  arWebCastSample,
  armArCast,
} from "./ar-cast.ts";

describe("arJudgeCast", () => {
  it("is ok when the phone is the only display", () => {
    assert.equal(arJudgeCast({}), "ok");
    assert.equal(arJudgeCast({ extraDisplays: 0, wireless: false }), "ok");
  });

  it("treats recording as recorded even with extra displays", () => {
    assert.equal(
      arJudgeCast({ captured: true, extraDisplays: 2, wireless: true }),
      "recorded",
    );
  });

  it("treats HDMI / Cast / AirPlay / extended desktop as mirrored", () => {
    assert.equal(arJudgeCast({ extraDisplays: 1 }), "mirrored");
    assert.equal(arJudgeCast({ wireless: true }), "mirrored");
    assert.equal(arJudgeCast({ extended: true }), "mirrored");
  });
});

describe("arCastCoach / lowFx", () => {
  it("stays quiet when ok", () => {
    assert.equal(arCastCoach("ok", "cubes"), null);
    assert.equal(arCastLowFx("ok"), false);
  });

  it("coaches recording and mirroring per product", () => {
    assert.match(arCastCoach("recorded", "place") || "", /Recording/);
    assert.match(arCastCoach("recorded", "scan") || "", /marker/);
    assert.match(arCastCoach("mirrored", "emily") || "", /shared/);
    assert.match(arCastCoach("mirrored", "cubes") || "", /surface/);
    assert.equal(arCastLowFx("mirrored"), true);
    assert.equal(arCastLowFx("recorded"), true);
  });
});

describe("arWebCastSample", () => {
  it("reads isExtended when present", () => {
    assert.deepEqual(arWebCastSample({ isExtended: true }), { extended: true });
    assert.deepEqual(arWebCastSample({}), { extended: false });
  });
});

describe("armArCast", () => {
  it("holds before flipping to mirrored, then clears faster", async () => {
    const kinds: string[] = [];
    const timers: Array<{ id: number; fn: () => void; ms: number }> = [];
    let nextId = 1;
    const handle = armArCast({
      product: "cubes",
      onKind: (kind) => kinds.push(kind),
      native: {
        castState: async () => ({ extraDisplays: 1 }),
      },
      pollMs: 60_000,
      setTimeoutFn: (fn, ms) => {
        const id = nextId++;
        timers.push({ id, fn, ms });
        return id;
      },
      clearTimeoutFn: (id) => {
        const i = timers.findIndex((t) => t.id === id);
        if (i >= 0) timers.splice(i, 1);
      },
      setIntervalFn: () => 99,
      clearIntervalFn: () => undefined,
    });
    await Promise.resolve();
    assert.equal(handle.kind(), "ok");
    assert.equal(timers[0]?.ms, AR_CAST_HOLD_MS);
    timers[0]?.fn();
    assert.equal(handle.kind(), "mirrored");
    assert.deepEqual(kinds, ["mirrored"]);
    handle.dispose();
    assert.equal(AR_CAST_CLEAR_MS < AR_CAST_HOLD_MS, true);
  });

  it("dispose ignores a late native sample", async () => {
    let send: ((s: { extraDisplays: number }) => void) | null = null;
    const kinds: string[] = [];
    const handle = armArCast({
      product: "cubes",
      onKind: (kind) => kinds.push(kind),
      native: {
        listen: (cb) => {
          send = cb;
          return () => undefined;
        },
      },
      pollMs: 60_000,
      setTimeoutFn: (fn) => {
        fn();
        return 1;
      },
      clearTimeoutFn: () => undefined,
      setIntervalFn: () => 1,
      clearIntervalFn: () => undefined,
    });
    handle.dispose();
    send?.({ extraDisplays: 2 });
    assert.deepEqual(kinds, []);
  });
});
