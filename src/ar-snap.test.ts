import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  arCanSnap,
  arParseSnapResult,
  arSnapCoach,
  arSnapDoneCoach,
  arSnapFilename,
  arSnapPrefix,
  arSnapSlug,
  arSnapStamp,
  arSnapTitle,
} from "./ar-snap.ts";

describe("arCanSnap", () => {
  it("blocks until a cube is placed and while a save is in flight", () => {
    assert.equal(arCanSnap({ ready: false, busy: false }), "not-ready");
    assert.equal(arCanSnap({ ready: true, busy: true }), "busy");
    assert.equal(arCanSnap({ ready: true, busy: false }), "ok");
  });
});

describe("arSnapCoach", () => {
  it("is product-specific before and after a cube is placed", () => {
    assert.match(arSnapCoach("ok", "cubes"), /cubes/i);
    assert.match(arSnapCoach("not-ready", "cubes"), /Place a cube first/i);
    assert.equal(arSnapCoach("busy", "cubes"), "Saving…");
    assert.equal(arSnapCoach("denied", "cubes"), "");
    assert.match(arSnapCoach("fail", "cubes"), /try again/i);
  });
});

describe("arSnapDoneCoach", () => {
  it("confirms a share sheet or a download fallback", () => {
    assert.match(arSnapDoneCoach("ok"), /share/i);
    assert.match(arSnapDoneCoach("unsupported"), /downloads/i);
    assert.equal(arSnapDoneCoach("denied"), "");
  });
});

describe("arSnapFilename", () => {
  it("stamps a stable souvenir name", () => {
    const now = new Date("2026-09-09T21:42:00.000Z");
    assert.equal(arSnapStamp(now), "20260909");
    assert.equal(arSnapSlug("Cube AR"), "cube-ar");
    assert.equal(arSnapPrefix("cubes"), "cube-ar");
    assert.equal(arSnapFilename("cubes", "Cube AR", now), "cube-ar-cube-ar-20260909.jpg");
    assert.equal(arSnapTitle("cubes"), "Cube AR");
  });
});

describe("arParseSnapResult", () => {
  it("accepts a JPEG payload and classifies empty/fail", () => {
    const data = "A".repeat(40);
    const ok = arParseSnapResult({ ok: true, mime: "image/jpeg", data });
    assert.equal(ok.ok, true);
    assert.equal(ok.reason, "ok");
    assert.equal(ok.data, data);
    assert.equal(arParseSnapResult(null).reason, "empty");
    assert.equal(
      arParseSnapResult({ ok: false, reason: "not-ready" }).reason,
      "not-ready",
    );
  });
});
