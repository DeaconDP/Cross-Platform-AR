import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AR_LAYOUT,
  arArmLayout,
  arJudgeLayout,
  arLayoutCopy,
  arLayoutNative,
  arMeasureHost,
  type ArLayoutBox,
} from "./ar-layout.ts";

const box = (over: Partial<ArLayoutBox> = {}): ArLayoutBox => ({
  overlayW: 390,
  overlayH: 844,
  screenW: 390,
  screenH: 844,
  overlayX: 0,
  overlayY: 0,
  ...over,
});

describe("arJudgeLayout", () => {
  it("treats a phone-sized overlay as full", () => {
    const v = arJudgeLayout(box());
    assert.equal(v.kind, "full");
    assert.equal(v.usable, true);
    assert.equal(v.shouldPause, false);
    assert.equal(v.coach, null);
    assert.deepEqual(v.native, { x: 0, y: 0, w: 1, h: 1 });
  });

  it("coaches split screen when the overlay is a side pane", () => {
    const v = arJudgeLayout(
      box({ overlayW: 300, overlayH: 844, screenW: 800, screenH: 844 }),
    );
    assert.equal(v.kind, "split");
    assert.equal(v.usable, true);
    assert.equal(v.shouldPause, false);
    assert.equal(v.coach, arLayoutCopy("split"));
    assert.ok(v.native.w < AR_LAYOUT.splitCoverage);
  });

  it("pauses hits when the overlay is below the floor", () => {
    const v = arJudgeLayout(box({ overlayW: 200, overlayH: 200 }));
    assert.equal(v.kind, "tiny");
    assert.equal(v.usable, false);
    assert.equal(v.shouldPause, true);
    assert.match(v.coach || "", /larger view/);
  });

  it("marks a hidden host as covered without coaching", () => {
    const v = arJudgeLayout(box({ overlayW: 0, overlayH: 0 }));
    assert.equal(v.kind, "covered");
    assert.equal(v.usable, false);
    assert.equal(v.shouldPause, true);
    assert.equal(v.coach, null);
  });

  it("maps overlay CSS pixels to window-normalized native rects", () => {
    assert.deepEqual(
      arLayoutNative({
        overlayX: 100,
        overlayY: 50,
        overlayW: 200,
        overlayH: 400,
        screenW: 400,
        screenH: 800,
      }),
      { x: 0.25, y: 0.0625, w: 0.5, h: 0.5 },
    );
  });

  it("measures a missing host as covered-size", () => {
    const m = arMeasureHost(null, { w: 390, h: 844 });
    assert.equal(m.overlayW, 0);
    assert.equal(m.screenW, 390);
    assert.equal(arJudgeLayout(m).kind, "covered");
  });
});

describe("arArmLayout", () => {
  it("emits once per distinct verdict and ignores repeats", () => {
    const kinds: string[] = [];
    let current = box();
    let pulse: (() => void) | null = null;
    const arm = arArmLayout(
      {
        measure: () => current,
        onChange: (v) => kinds.push(v.kind),
      },
      {
        every: (fn) => {
          pulse = fn;
          return () => {
            pulse = null;
          };
        },
      },
    );
    assert.deepEqual(kinds, ["full"]);
    pulse?.();
    pulse?.();
    assert.deepEqual(kinds, ["full"]);
    current = box({ overlayW: 200, overlayH: 200 });
    pulse?.();
    assert.deepEqual(kinds, ["full", "tiny"]);
    arm.dispose();
    current = box();
    pulse?.();
    assert.deepEqual(kinds, ["full", "tiny"]);
  });
});
