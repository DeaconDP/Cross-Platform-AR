import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AR_DISK_CRITICAL_BYTES,
  AR_DISK_HOLD_DOWN_MS,
  AR_DISK_HOLD_UP_MS,
  AR_DISK_LOW_BYTES,
  arDiskCoach,
  arDiskNeedBytes,
  arDiskProfile,
  arDiskSkipCache,
  arHoldDisk,
  arJudgeDisk,
  arParseDiskEvent,
  arParseStorageEstimate,
} from "./ar-disk.ts";

const live = (
  bytesAvail: number,
  extra: Partial<Parameters<typeof arJudgeDisk>[0]> = {},
) =>
  arJudgeDisk({
    live: true,
    bytesAvail,
    // 3 GB so the 5% ratio does not fire at the 200 MB low floor.
    bytesTotal: 3 * 1024 * 1024 * 1024,
    ...extra,
  });

describe("arJudgeDisk", () => {
  it("treats unknown samples as ok", () => {
    assert.equal(
      arJudgeDisk({ live: false, bytesAvail: -1, bytesTotal: -1 }),
      "ok",
    );
  });

  it("flags critical below the floor or model+headroom", () => {
    assert.equal(live(AR_DISK_CRITICAL_BYTES), "low");
    assert.equal(live(AR_DISK_CRITICAL_BYTES - 1), "critical");
    assert.equal(
      live(40 * 1024 * 1024, { modelBytes: 36 * 1024 * 1024 }),
      "critical",
    );
  });

  it("flags low under 200 MB or under 5% of the volume", () => {
    assert.equal(live(AR_DISK_LOW_BYTES), "ok");
    assert.equal(live(AR_DISK_LOW_BYTES - 1), "low");
    assert.equal(
      arJudgeDisk({
        live: true,
        bytesAvail: 80 * 1024 * 1024,
        bytesTotal: 2 * 1024 * 1024 * 1024,
      }),
      "low",
    );
  });
});

describe("arDiskNeedBytes / skipCache", () => {
  it("never asks for less than the critical floor", () => {
    assert.equal(arDiskNeedBytes(0), AR_DISK_CRITICAL_BYTES);
    assert.ok(arDiskNeedBytes(40 * 1024 * 1024) > AR_DISK_CRITICAL_BYTES);
  });

  it("skips the cache write only when critical", () => {
    assert.equal(arDiskSkipCache("ok"), false);
    assert.equal(arDiskSkipCache("low"), false);
    assert.equal(arDiskSkipCache("critical"), true);
  });
});

describe("arHoldDisk", () => {
  it("holds 400ms before raising and 800ms before clearing", () => {
    assert.equal(arHoldDisk({ shown: "ok", raw: "low", heldMs: 200 }), "ok");
    assert.equal(
      arHoldDisk({ shown: "ok", raw: "critical", heldMs: AR_DISK_HOLD_UP_MS }),
      "critical",
    );
    assert.equal(
      arHoldDisk({ shown: "critical", raw: "ok", heldMs: 400 }),
      "critical",
    );
    assert.equal(
      arHoldDisk({
        shown: "critical",
        raw: "ok",
        heldMs: AR_DISK_HOLD_DOWN_MS,
      }),
      "ok",
    );
  });
});

describe("arDiskCoach", () => {
  it("is silent when storage is healthy", () => {
    assert.equal(arDiskCoach("ok", "place"), "");
  });

  it("tells place visitors to free space", () => {
    assert.match(arDiskCoach("low", "place"), /getting full|free space/i);
    assert.match(arDiskCoach("critical", "place"), /Free some storage|fossil/i);
  });

  it("keeps scan copy on the printed mark", () => {
    assert.match(arDiskCoach("critical", "scan"), /mark|storage/i);
  });
});

describe("arDiskProfile", () => {
  it("carries coach, skipCache, and placed through the judge", () => {
    const critical = arDiskProfile(
      {
        live: true,
        bytesAvail: 8 * 1024 * 1024,
        bytesTotal: 64 * 1024 * 1024 * 1024,
        placed: false,
      },
      "place",
    );
    assert.equal(critical.kind, "critical");
    assert.equal(critical.skipCache, true);
    assert.ok(critical.coach.length > 0);
    const ok = arDiskProfile(
      {
        live: true,
        bytesAvail: 8 * 1024 * 1024 * 1024,
        bytesTotal: 64 * 1024 * 1024 * 1024,
        placed: true,
      },
      "emily",
    );
    assert.equal(ok.kind, "ok");
    assert.equal(ok.coach, "");
    assert.equal(ok.placed, true);
    assert.equal(ok.skipCache, false);
  });
});

describe("arParseDiskEvent", () => {
  it("reads native payloads and ignores junk", () => {
    assert.deepEqual(
      arParseDiskEvent({
        live: true,
        bytesAvail: 99,
        bytesTotal: 200,
        placed: true,
      }),
      {
        live: true,
        bytesAvail: 99,
        bytesTotal: 200,
        modelBytes: 0,
        placed: true,
      },
    );
    assert.equal(arParseDiskEvent(null).live, false);
    assert.equal(arParseDiskEvent({ bytesAvail: Number.NaN }).bytesAvail, -1);
  });
});

describe("arParseStorageEstimate", () => {
  it("turns quota minus usage into free bytes", () => {
    const sample = arParseStorageEstimate({
      quota: 1000,
      usage: 250,
    });
    assert.equal(sample.live, true);
    assert.equal(sample.bytesAvail, 750);
    assert.equal(sample.bytesTotal, 1000);
    assert.equal(arParseStorageEstimate(null).live, false);
  });
});
