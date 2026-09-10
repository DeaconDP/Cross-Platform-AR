import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AR_MEM_CRITICAL_BYTES,
  AR_MEM_CRITICAL_RATIO,
  AR_MEM_HOLD_DOWN_MS,
  AR_MEM_HOLD_UP_MS,
  AR_MEM_TIGHT_BYTES,
  AR_MEM_TIGHT_RATIO,
  arHoldMem,
  arJudgeMem,
  arMemCoach,
  arMemLowFx,
  arMemProfile,
  arParseHeapEstimate,
  arParseMemEvent,
} from "./ar-mem.ts";

const live = (
  extra: Partial<Parameters<typeof arJudgeMem>[0]> = {},
) =>
  arJudgeMem({
    live: true,
    bytesAvail: 512 * 1024 * 1024,
    bytesTotal: 4 * 1024 * 1024 * 1024,
    usedRatio: 0.4,
    ...extra,
  });

describe("arJudgeMem", () => {
  it("treats unknown samples as ok", () => {
    assert.equal(
      arJudgeMem({
        live: false,
        bytesAvail: -1,
        bytesTotal: -1,
        usedRatio: -1,
      }),
      "ok",
    );
  });

  it("flags critical on OS warning or under the floor", () => {
    assert.equal(live({ warned: true }), "critical");
    assert.equal(live({ bytesAvail: AR_MEM_CRITICAL_BYTES }), "tight");
    assert.equal(live({ bytesAvail: AR_MEM_CRITICAL_BYTES - 1 }), "critical");
  });

  it("flags tight under 80 MB or a hot heap", () => {
    assert.equal(live({ bytesAvail: AR_MEM_TIGHT_BYTES }), "ok");
    assert.equal(live({ bytesAvail: AR_MEM_TIGHT_BYTES - 1 }), "tight");
    assert.equal(
      live({
        bytesAvail: -1,
        usedRatio: AR_MEM_TIGHT_RATIO,
      }),
      "tight",
    );
    assert.equal(
      live({
        bytesAvail: -1,
        usedRatio: AR_MEM_CRITICAL_RATIO,
      }),
      "critical",
    );
  });
});

describe("arMemLowFx", () => {
  it("drops FX whenever memory is not healthy", () => {
    assert.equal(arMemLowFx("ok"), false);
    assert.equal(arMemLowFx("tight"), true);
    assert.equal(arMemLowFx("critical"), true);
  });
});

describe("arHoldMem", () => {
  it("holds 400ms before raising and 800ms before clearing", () => {
    assert.equal(arHoldMem({ shown: "ok", raw: "tight", heldMs: 200 }), "ok");
    assert.equal(
      arHoldMem({ shown: "ok", raw: "critical", heldMs: AR_MEM_HOLD_UP_MS }),
      "critical",
    );
    assert.equal(
      arHoldMem({ shown: "critical", raw: "ok", heldMs: 400 }),
      "critical",
    );
    assert.equal(
      arHoldMem({
        shown: "critical",
        raw: "ok",
        heldMs: AR_MEM_HOLD_DOWN_MS,
      }),
      "ok",
    );
  });
});

describe("arMemCoach", () => {
  it("is silent when memory is healthy", () => {
    assert.equal(arMemCoach("ok", "place"), "");
  });

  it("tells place visitors to close other apps", () => {
    assert.match(arMemCoach("tight", "place"), /low on memory|simpler view/i);
    assert.match(arMemCoach("critical", "place"), /Close other apps|fossil/i);
  });

  it("keeps scan copy on the printed mark", () => {
    assert.match(arMemCoach("critical", "scan"), /mark|vanish|apps/i);
  });
});

describe("arMemProfile", () => {
  it("carries coach, lowFx, and placed through the judge", () => {
    const critical = arMemProfile(
      {
        live: true,
        bytesAvail: 8 * 1024 * 1024,
        bytesTotal: 4 * 1024 * 1024 * 1024,
        usedRatio: 0.2,
        placed: false,
      },
      "place",
    );
    assert.equal(critical.kind, "critical");
    assert.equal(critical.lowFx, true);
    assert.ok(critical.coach.length > 0);
    const ok = arMemProfile(
      {
        live: true,
        bytesAvail: 2 * 1024 * 1024 * 1024,
        bytesTotal: 8 * 1024 * 1024 * 1024,
        usedRatio: 0.2,
        placed: true,
      },
      "emily",
    );
    assert.equal(ok.kind, "ok");
    assert.equal(ok.coach, "");
    assert.equal(ok.placed, true);
    assert.equal(ok.lowFx, false);
  });
});

describe("arParseMemEvent", () => {
  it("reads native payloads and ignores junk", () => {
    assert.deepEqual(
      arParseMemEvent({
        live: true,
        bytesAvail: 99,
        bytesTotal: 200,
        usedRatio: 0.5,
        warned: true,
        placed: true,
      }),
      {
        live: true,
        bytesAvail: 99,
        bytesTotal: 200,
        usedRatio: 0.5,
        warned: true,
        placed: true,
      },
    );
    assert.equal(arParseMemEvent(null).live, false);
    assert.equal(arParseMemEvent({ bytesAvail: Number.NaN }).bytesAvail, -1);
  });
});

describe("arParseHeapEstimate", () => {
  it("turns heap used/limit into free bytes and a ratio", () => {
    const sample = arParseHeapEstimate({
      usedJSHeapSize: 250,
      jsHeapSizeLimit: 1000,
    });
    assert.equal(sample.live, true);
    assert.equal(sample.bytesAvail, 750);
    assert.equal(sample.bytesTotal, 1000);
    assert.equal(sample.usedRatio, 0.25);
    assert.equal(arParseHeapEstimate(null).live, false);
  });
});
