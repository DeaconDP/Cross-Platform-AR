import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyArStartError,
  isTransientArStart,
  normalizeArAvailability,
  probeArAvailability,
  withArStartRetry,
} from "./ar-start.ts";

describe("classifyArStartError", () => {
  it("maps Cube plugin copy", () => {
    assert.equal(classifyArStartError(new Error("Camera permission denied")), "camera_denied");
    assert.equal(classifyArStartError(new Error("ARCore install declined")), "needs_install");
    assert.equal(classifyArStartError(new Error("ARCore is not supported on this device")), "unsupported");
    assert.equal(classifyArStartError(new Error("camera session timed out")), "timeout");
    assert.equal(isTransientArStart("timeout"), true);
  });
});

describe("normalizeArAvailability", () => {
  it("accepts supported from isSupported()", () => {
    assert.deepEqual(normalizeArAvailability({ supported: true }), {
      available: true,
      reason: "supported",
    });
  });

  it("keeps Place-like CTAs visible while checking", () => {
    assert.equal(normalizeArAvailability({ supported: false, reason: "checking" }).available, true);
  });
});

describe("probe + retry", () => {
  it("polls checking then settles", async () => {
    let n = 0;
    const result = await probeArAvailability(
      async () => {
        n += 1;
        return n === 1
          ? { supported: false, reason: "checking" }
          : { supported: true, reason: "supported" };
      },
      { delayMs: 1 },
    );
    assert.equal(result.reason, "supported");
    assert.equal(n, 2);
  });

  it("retries timeout once", async () => {
    let n = 0;
    await withArStartRetry(
      async () => {
        n += 1;
        if (n === 1) throw new Error("camera session timed out");
        return undefined;
      },
      { delayMs: 1 },
    );
    assert.equal(n, 2);
  });
});
