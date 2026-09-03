import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AR_SAFE,
  arApplySafeVars,
  arArmSafe,
  arClampInset,
  arCoachPx,
  arMergeInsets,
  arParseNativeInsets,
  arParsePx,
  arReadFontScale,
  arReadHostInsets,
  arSafeChrome,
  arSafeVars,
  arZeroInsets,
  type ArInsets,
} from "./ar-safe.ts";

const notch: ArInsets = { top: 47, right: 0, bottom: 34, left: 0 };

describe("arParsePx / clamp", () => {
  it("parses CSS pixel strings and ignores junk", () => {
    assert.equal(arParsePx("47px"), 47);
    assert.equal(arParsePx(12.5), 12.5);
    assert.equal(arParsePx("nope"), 0);
    assert.equal(arParsePx(null), 0);
  });

  it("clamps negative and huge insets", () => {
    assert.equal(arClampInset(-4), 0);
    assert.equal(arClampInset(240), AR_SAFE.ceil);
    assert.equal(arClampInset(24), 24);
  });
});

describe("arMergeInsets", () => {
  it("takes the max per edge so native cutout wins when CSS env is 0", () => {
    assert.deepEqual(arMergeInsets(arZeroInsets(), notch), notch);
    assert.deepEqual(
      arMergeInsets({ top: 12, right: 8, bottom: 0, left: 4 }, notch),
      { top: 47, right: 8, bottom: 34, left: 4 },
    );
  });

  it("ignores null sources", () => {
    assert.deepEqual(arMergeInsets(null, undefined, notch), notch);
  });
});

describe("arParseNativeInsets", () => {
  it("reads plugin payload and fills missing sides", () => {
    assert.deepEqual(arParseNativeInsets({ top: 44 }), {
      top: 44,
      right: 0,
      bottom: 0,
      left: 0,
    });
    assert.equal(arParseNativeInsets({ top: "nope" }), null);
    assert.equal(arParseNativeInsets(null), null);
  });
});

describe("arSafeChrome", () => {
  it("merges insets and scales coach type", () => {
    const chrome = arSafeChrome({
      css: { top: 0, right: 0, bottom: 0, left: 0 },
      native: notch,
      fontScale: 1.5,
    });
    assert.deepEqual(chrome.insets, notch);
    assert.equal(chrome.coachPx, 24);
    assert.equal(arSafeVars(chrome)["--ar-safe-top"], "47px");
    assert.equal(arSafeVars(chrome)["--ar-coach-px"], "24px");
  });

  it("clamps coach size for huge Dynamic Type", () => {
    assert.equal(arCoachPx(3), AR_SAFE.maxCoachPx);
    assert.equal(arCoachPx(0.5), AR_SAFE.minCoachPx);
    assert.equal(arReadFontScale(24), 1.5);
    assert.equal(arReadFontScale(0), 1);
  });
});

describe("arReadHostInsets", () => {
  it("reads token vars before padding", () => {
    const el = { id: "host" } as unknown as Element;
    const insets = arReadHostInsets(el, () => ({
      getPropertyValue: (name: string) =>
        name === "--safe-top" ? "47px" : name === "--safe-bottom" ? "34px" : "",
      paddingTop: "8px",
      paddingRight: "16px",
      paddingBottom: "8px",
      paddingLeft: "16px",
    }));
    assert.deepEqual(insets, { top: 47, right: 16, bottom: 34, left: 16 });
  });

  it("returns zeros for a missing host", () => {
    assert.deepEqual(arReadHostInsets(null), arZeroInsets());
  });
});

describe("arArmSafe", () => {
  it("applies merged chrome and ignores late native after dispose", async () => {
    const applied: number[] = [];
    let resolveNative: ((v: ArInsets | null) => void) | undefined;
    const native = new Promise<ArInsets | null>((resolve) => {
      resolveNative = resolve;
    });
    const arm = arArmSafe(
      {
        readCss: () => arZeroInsets(),
        readNative: () => native,
        fontScale: () => 1,
        apply: (chrome) => applied.push(chrome.insets.top),
      },
      { every: () => () => undefined },
    );
    assert.deepEqual(applied, [0]);
    arm.dispose();
    resolveNative?.(notch);
    await native;
    await Promise.resolve();
    assert.deepEqual(applied, [0]);
  });

  it("writes CSS variables onto the overlay host", () => {
    const props: Record<string, string> = {};
    arApplySafeVars(
      { style: { setProperty: (k, v) => { props[k] = v; } } },
      arSafeChrome({ native: notch, fontScale: 1 }),
    );
    assert.equal(props["--ar-safe-top"], "47px");
    assert.equal(props["--ar-safe-bottom"], "34px");
  });
});
