import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AR_READY_POINTER_PAD_MS,
  AR_READY_QUIET_MS,
  AR_READY_VOICE_GAP_MS,
  arReadyBlockReason,
  arReadyCoach,
  arReadyCopy,
  arReadyCreate,
  arReadyNotePointer,
  arReadyOpen,
  arReadyShouldSpeak,
  arReadySpeak,
} from "./ar-ready.ts";

describe("arReady", () => {
  it("blocks place during the quiet window", () => {
    const s = arReadyCreate(1000);
    assert.equal(s.until, 1000 + AR_READY_QUIET_MS);
    assert.equal(arReadyOpen(s, 1000), false);
    assert.equal(arReadyBlockReason(s, 1479), "quiet");
    assert.equal(arReadyOpen(s, 1480), true);
    assert.equal(arReadyOpen(null, 1000), true);
  });

  it("holds closed while a pointer is still down, then pads", () => {
    const s = arReadyCreate(0, 0);
    arReadyNotePointer(s, true, 10);
    arReadyNotePointer(s, true, 11);
    assert.equal(arReadyBlockReason(s, 20), "pointer");
    arReadyNotePointer(s, false, 30);
    assert.equal(arReadyBlockReason(s, 30), "pointer");
    arReadyNotePointer(s, false, 40);
    assert.equal(s.pointers, 0);
    assert.equal(arReadyBlockReason(s, 40), "pointer");
    assert.equal(arReadyOpen(s, 40 + AR_READY_POINTER_PAD_MS), true);
  });

  it("coaches quiet then scan then placed", () => {
    const s = arReadyCreate(0);
    assert.equal(arReadyCoach(s, 0, "cube", false), arReadyCopy("cube", "quiet"));
    assert.equal(
      arReadyCoach(s, AR_READY_QUIET_MS, "cube", false),
      arReadyCopy("cube", "scan"),
    );
    assert.equal(
      arReadyCoach(s, AR_READY_QUIET_MS, "cube", true),
      arReadyCopy("cube", "placed"),
    );
  });

  it("uses product-specific visitor copy", () => {
    assert.match(arReadyCopy("origins", "scan"), /highlighted/i);
    assert.match(arReadyCopy("emily", "miss"), /flatter/i);
    assert.match(arReadyCopy("cube", "placed"), /cube/i);
  });

  it("dedupes voice within the gap", () => {
    const s = arReadyCreate(0, 0);
    const first = arReadySpeak(s, "scan", "cube", 10);
    assert.ok(first);
    assert.equal(arReadySpeak(s, "scan", "cube", 10 + 200), null);
    assert.equal(
      arReadyShouldSpeak(s, "scan", first, 10 + AR_READY_VOICE_GAP_MS),
      true,
    );
    assert.ok(arReadySpeak(s, "placed", "cube", 10 + 200));
  });
});
