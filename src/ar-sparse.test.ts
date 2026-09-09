import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AR_SPARSE_BLANK_POINTS,
  AR_SPARSE_HOLD_DOWN_MS,
  AR_SPARSE_HOLD_UP_MS,
  AR_SPARSE_THIN_POINTS,
  arHoldSparse,
  arJudgeSparse,
  arParseSparseEvent,
  arSparseCoach,
  arSparseProfile,
} from "./ar-sparse.ts";

describe("arJudgeSparse", () => {
  it("treats unknown samples as ok", () => {
    assert.equal(arJudgeSparse({ points: -1, planes: 0 }), "ok");
  });

  it("flags thin and blank from feature-point count", () => {
    assert.equal(
      arJudgeSparse({ points: AR_SPARSE_THIN_POINTS, planes: 0 }),
      "ok",
    );
    assert.equal(
      arJudgeSparse({ points: AR_SPARSE_THIN_POINTS - 1, planes: 0 }),
      "thin",
    );
    assert.equal(
      arJudgeSparse({ points: AR_SPARSE_BLANK_POINTS, planes: 2 }),
      "thin",
    );
    assert.equal(
      arJudgeSparse({ points: AR_SPARSE_BLANK_POINTS - 1, planes: 1 }),
      "blank",
    );
  });
});

describe("arHoldSparse", () => {
  it("holds 600ms before raising and 800ms before clearing", () => {
    assert.equal(arHoldSparse({ shown: "ok", raw: "blank", heldMs: 200 }), "ok");
    assert.equal(
      arHoldSparse({ shown: "ok", raw: "thin", heldMs: AR_SPARSE_HOLD_UP_MS }),
      "thin",
    );
    assert.equal(
      arHoldSparse({ shown: "blank", raw: "ok", heldMs: 400 }),
      "blank",
    );
    assert.equal(
      arHoldSparse({
        shown: "blank",
        raw: "ok",
        heldMs: AR_SPARSE_HOLD_DOWN_MS,
      }),
      "ok",
    );
  });
});

describe("arSparseCoach", () => {
  it("is silent when tracking is textured", () => {
    assert.equal(arSparseCoach("ok", "place"), "");
  });

  it("tells place visitors to find texture", () => {
    assert.match(arSparseCoach("blank", "place"), /plain|wood grain/i);
    assert.match(arSparseCoach("thin", "place"), /sweep/i);
    assert.match(arSparseCoach("blank", "place", true), /locked|wood/i);
  });

  it("keeps scan copy on the printed mark", () => {
    assert.match(arSparseCoach("blank", "scan"), /Origins mark|printed/i);
    assert.match(arSparseCoach("thin", "scan"), /mark/i);
  });
});

describe("arSparseProfile", () => {
  it("carries coach and placed through the judge", () => {
    const blank = arSparseProfile(
      { points: 4, planes: 0, placed: false },
      "place",
    );
    assert.equal(blank.level, "blank");
    assert.ok(blank.coach.length > 0);
    const ok = arSparseProfile({ points: 80, planes: 1, placed: true }, "emily");
    assert.equal(ok.level, "ok");
    assert.equal(ok.coach, "");
    assert.equal(ok.placed, true);
  });
});

describe("arParseSparseEvent", () => {
  it("reads native payloads and ignores junk", () => {
    assert.deepEqual(arParseSparseEvent({ points: 22, planes: 1, placed: true }), {
      points: 22,
      planes: 1,
      placed: true,
    });
    assert.equal(arParseSparseEvent(null).points, -1);
    assert.equal(arParseSparseEvent({ points: Number.NaN }).points, -1);
  });
});
