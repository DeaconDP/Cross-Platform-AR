import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  arClassifyMediaError,
  arOccupy,
  arOccupyCoach,
  arOccupyReset,
  arStopTracks,
} from "./ar-occupy.ts";

afterEach(() => {
  arOccupyReset();
});

describe("arClassifyMediaError", () => {
  it("maps permission and NotAllowed to denied", () => {
    assert.equal(
      arClassifyMediaError(Object.assign(new Error("nope"), { name: "NotAllowedError" })),
      "denied",
    );
    assert.equal(arClassifyMediaError(new Error("Camera permission denied")), "denied");
  });

  it("maps in-use / NotReadable to busy", () => {
    assert.equal(
      arClassifyMediaError(Object.assign(new Error("device"), { name: "NotReadableError" })),
      "busy",
    );
    assert.equal(arClassifyMediaError(new Error("ERROR_CAMERA_IN_USE")), "busy");
    assert.equal(arClassifyMediaError(new Error("camera in use")), "busy");
  });

  it("maps missing devices", () => {
    assert.equal(
      arClassifyMediaError(Object.assign(new Error(""), { name: "NotFoundError" })),
      "missing",
    );
  });

  it("falls back to failed", () => {
    assert.equal(arClassifyMediaError(new Error("boom")), "failed");
  });
});

describe("arOccupyCoach", () => {
  it("tells the visitor how to recover", () => {
    assert.match(arOccupyCoach("denied", "camera"), /Settings/);
    assert.match(arOccupyCoach("busy", "camera"), /busy/);
    assert.match(arOccupyCoach("yielded"), /another tab/);
    assert.match(arOccupyCoach("insecure"), /HTTPS/);
    assert.equal(arOccupyCoach("ok"), "");
  });
});

describe("arOccupy", () => {
  it("yields the previous in-process owner", () => {
    let yielded = 0;
    const first = arOccupy({
      id: "a",
      onYield: () => {
        yielded += 1;
      },
    });
    assert.equal(first.alive(), true);
    const second = arOccupy({ id: "b" });
    assert.equal(yielded, 1);
    assert.equal(first.alive(), false);
    assert.equal(second.alive(), true);
    second.release();
    assert.equal(second.alive(), false);
  });

  it("release is a no-op after yield", () => {
    const first = arOccupy({ id: "a" });
    const second = arOccupy({ id: "b" });
    first.release();
    assert.equal(second.alive(), true);
    second.release();
  });
});

describe("arStopTracks", () => {
  it("stops every track and ignores holes", () => {
    let n = 0;
    arStopTracks({
      getTracks: () => [
        {
          stop() {
            n += 1;
          },
        },
        {
          stop() {
            n += 1;
            throw new Error("already stopped");
          },
        },
      ],
    });
    assert.equal(n, 2);
    arStopTracks(null);
  });
});
