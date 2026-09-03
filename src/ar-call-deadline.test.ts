import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  arCallDeadlineMs,
  arCallTimeoutMessage,
  isArCallTimeout,
  raceArCall,
  ArCallTimeoutError,
} from "./ar-call-deadline.ts";

const hang = () => new Promise<never>(() => {});
const never = { delay: () => new Promise<void>(() => {}) };
const immediate = { delay: async () => {} };

describe("arCallDeadline", () => {
  it("keeps short hit/tap/move budgets and a slightly longer stop", () => {
    assert.equal(arCallDeadlineMs("hit"), 1800);
    assert.equal(arCallDeadlineMs("tap"), 1800);
    assert.equal(arCallDeadlineMs("move"), 1800);
    assert.equal(arCallDeadlineMs("stop"), 2500);
  });

  it("returns the value when the native call wins", async () => {
    const result = await raceArCall({
      kind: "hit",
      run: async () => [1, 0, 0, 0],
      fallback: null,
      clock: never,
    });
    assert.equal(result.timedOut, false);
    assert.deepEqual(result.value, [1, 0, 0, 0]);
  });

  it("returns fallback when the call hangs", async () => {
    const result = await raceArCall({
      kind: "tap",
      run: hang,
      fallback: { placed: false },
      clock: immediate,
    });
    assert.equal(result.timedOut, true);
    assert.deepEqual(result.value, { placed: false });
  });

  it("propagates real native failures", async () => {
    await assert.rejects(
      () =>
        raceArCall({
          kind: "move",
          run: async () => {
            throw new Error("ARCore is not supported on this device");
          },
          fallback: { moved: false },
          clock: never,
        }),
      /not supported/,
    );
  });

  it("classifies timeout errors and coaches taps, not stop", () => {
    const err = new ArCallTimeoutError("tap", 1800);
    assert.equal(isArCallTimeout(err), true);
    assert.equal(isArCallTimeout(new Error("nope")), false);
    assert.equal(arCallTimeoutMessage("tap"), "That tap didn’t register. Try again.");
    assert.equal(arCallTimeoutMessage("stop"), "");
  });
});
