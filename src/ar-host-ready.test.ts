import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hostHasSize, whenArHostReady } from "./ar-host-ready.ts";

describe("arHostReady", () => {
  it("rejects an empty or tiny host", () => {
    assert.equal(hostHasSize({ width: 0, height: 0 }), false);
    assert.equal(hostHasSize({ width: 4, height: 844 }), false);
    assert.equal(hostHasSize({ width: 390, height: 844 }), true);
  });

  it("resolves once the host lays out", async () => {
    let n = 0;
    const ok = await whenArHostReady(
      () => {
        n += 1;
        return n < 3 ? { width: 0, height: 0 } : { width: 390, height: 844 };
      },
      {
        nowMs: (() => {
          let t = 0;
          return () => (t += 16);
        })(),
        waitFrame: async () => undefined,
      },
    );
    assert.equal(ok, true);
    assert.ok(n >= 3);
  });

  it("waits while the page is hidden", async () => {
    let hidden = true;
    let frames = 0;
    const ok = await whenArHostReady(() => ({ width: 390, height: 844 }), {
      isHidden: () => hidden,
      nowMs: (() => {
        let t = 0;
        return () => (t += 16);
      })(),
      waitFrame: async () => {
        frames += 1;
        if (frames >= 2) hidden = false;
      },
    });
    assert.equal(ok, true);
    assert.ok(frames >= 2);
  });

  it("returns false if the host stays 0×0 past the timeout", async () => {
    const ok = await whenArHostReady(() => ({ width: 0, height: 0 }), {
      timeoutMs: 50,
      nowMs: (() => {
        let t = 0;
        return () => (t += 25);
      })(),
      waitFrame: async () => undefined,
    });
    assert.equal(ok, false);
  });
});
