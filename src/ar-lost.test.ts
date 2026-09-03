import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  arCameraLossCopy,
  arClassifyCameraLoss,
  arQueryCameraPermission,
  arWatchCameraLost,
  arWatchSessionEnd,
} from "./ar-lost.ts";

function fakeListenable(state?: string) {
  const listeners = new Map<string, Set<() => void>>();
  return {
    state,
    listeners,
    addEventListener(type: string, fn: () => void) {
      const set = listeners.get(type) ?? new Set();
      set.add(fn);
      listeners.set(type, set);
    },
    removeEventListener(type: string, fn: () => void) {
      listeners.get(type)?.delete(fn);
    },
    emit(type: string) {
      for (const fn of listeners.get(type) ?? []) fn();
    },
  };
}

describe("arClassifyCameraLoss", () => {
  it("maps native reason tokens first", () => {
    assert.equal(arClassifyCameraLoss({ reason: "revoked" }), "revoked");
    assert.equal(arClassifyCameraLoss({ reason: "in-use" }), "in-use");
    assert.equal(arClassifyCameraLoss({ reason: "disconnected" }), "disconnected");
  });

  it("maps permission state and NotAllowedError", () => {
    assert.equal(arClassifyCameraLoss({ state: "denied" }), "revoked");
    assert.equal(
      arClassifyCameraLoss({ name: "NotAllowedError", message: "Permission denied" }),
      "revoked",
    );
  });

  it("maps ended tracks to disconnected unless busy/denied", () => {
    assert.equal(
      arClassifyCameraLoss({ ended: true, readyState: "ended" }),
      "disconnected",
    );
    assert.equal(
      arClassifyCameraLoss({
        ended: true,
        message: "Device in use by another app",
      }),
      "in-use",
    );
  });

  it("maps NotReadable / busy copy to in-use", () => {
    assert.equal(
      arClassifyCameraLoss({ name: "NotReadableError", message: "Could not start video source" }),
      "in-use",
    );
  });
});

describe("arCameraLossCopy", () => {
  it("tells the visitor to open Settings after a revoke", () => {
    const copy = arCameraLossCopy("revoked", "cube");
    assert.match(copy, /Settings/);
    assert.match(copy, /cube/i);
  });

  it("does not mention Settings for a busy camera", () => {
    const copy = arCameraLossCopy("in-use", "cube");
    assert.match(copy, /another app/i);
    assert.doesNotMatch(copy, /Settings/);
  });
});

describe("arWatchCameraLost", () => {
  it("fires once when permission flips to denied", () => {
    const perm = fakeListenable("granted");
    const kinds: string[] = [];
    const watch = arWatchCameraLost({
      permission: perm,
      onLost: (kind) => kinds.push(kind),
    });
    perm.state = "denied";
    perm.emit("change");
    perm.emit("change");
    assert.deepEqual(kinds, ["revoked"]);
    watch.release();
  });

  it("fires disconnected when a live track ends", () => {
    const track = { ...fakeListenable(), readyState: "live" };
    const kinds: string[] = [];
    const watch = arWatchCameraLost({
      tracks: [track],
      onLost: (kind) => kinds.push(kind),
    });
    track.emit("ended");
    assert.deepEqual(kinds, ["disconnected"]);
    watch.release();
  });

  it("does not fire after release or markUserEnd", () => {
    const perm = fakeListenable("granted");
    const kinds: string[] = [];
    const watch = arWatchCameraLost({
      permission: perm,
      onLost: (kind) => kinds.push(kind),
    });
    watch.markUserEnd();
    perm.state = "denied";
    perm.emit("change");
    watch.release();
    perm.emit("change");
    assert.deepEqual(kinds, []);
  });
});

describe("arWatchSessionEnd", () => {
  it("treats an unexpected end as disconnected", () => {
    const session = fakeListenable();
    const kinds: string[] = [];
    const watch = arWatchSessionEnd(session, (kind) => kinds.push(kind));
    session.emit("end");
    assert.deepEqual(kinds, ["disconnected"]);
    watch.release();
  });

  it("ignores a user-requested end", () => {
    const session = fakeListenable();
    const kinds: string[] = [];
    const watch = arWatchSessionEnd(session, (kind) => kinds.push(kind));
    watch.markUserEnd();
    session.emit("end");
    assert.deepEqual(kinds, []);
    watch.release();
  });
});

describe("arQueryCameraPermission", () => {
  it("returns null when the Permissions API is missing", async () => {
    const got = await arQueryCameraPermission(async () => {
      throw new Error("no permissions");
    });
    assert.equal(got, null);
  });
});
