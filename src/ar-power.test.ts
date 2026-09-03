import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  arApplyPixelRatio,
  arJudgePower,
  arMergePower,
  arParsePowerState,
} from "./ar-power.ts";

const ok = { powerSave: false, level: 0.8, charging: false };

describe("arJudgePower", () => {
  it("keeps FX on a healthy battery", () => {
    const p = arJudgePower(ok);
    assert.equal(p.class, "ok");
    assert.equal(p.enableFx, true);
    assert.equal(p.antialias, true);
    assert.equal(p.pixelRatioCap, 2);
    assert.equal(p.featurePoints, true);
    assert.equal(p.coach, null);
  });

  it("treats Low Power Mode as saver even at 90%", () => {
    const p = arJudgePower({ powerSave: true, level: 0.9, charging: false });
    assert.equal(p.class, "saver");
    assert.equal(p.enableFx, false);
    assert.equal(p.pixelRatioCap, 1.25);
    assert.match(p.coach ?? "", /Low Power Mode/);
  });

  it("treats ≤25% unplugged as saver without OS flag", () => {
    const p = arJudgePower({ powerSave: false, level: 0.25, charging: false });
    assert.equal(p.class, "saver");
    assert.equal(p.enableFx, false);
    assert.equal(p.coach, null);
  });

  it("treats ≤15% unplugged as critical", () => {
    const p = arJudgePower({ powerSave: false, level: 0.12, charging: false });
    assert.equal(p.class, "critical");
    assert.equal(p.pixelRatioCap, 1);
    assert.match(p.coach ?? "", /Battery is low/);
  });

  it("does not drop FX while charging at 12%", () => {
    const p = arJudgePower({ powerSave: false, level: 0.12, charging: true });
    assert.equal(p.class, "ok");
    assert.equal(p.enableFx, true);
  });

  it("ignores unknown level without power-save", () => {
    const p = arJudgePower({
      powerSave: false,
      level: null,
      charging: null,
    });
    assert.equal(p.class, "ok");
  });
});

describe("arMergePower / parse", () => {
  it("ORs power-save and takes the lower known level", () => {
    const m = arMergePower(
      { powerSave: false, level: 0.4, charging: false },
      { powerSave: true, level: 0.9, charging: true },
    );
    assert.equal(m.powerSave, true);
    assert.equal(m.level, 0.4);
    assert.equal(m.charging, false);
  });

  it("parses a native payload and ignores junk", () => {
    const p = arParsePowerState({
      powerSave: true,
      level: 0.33,
      charging: false,
      extra: 1,
    });
    assert.deepEqual(p, { powerSave: true, level: 0.33, charging: false });
    assert.deepEqual(arParsePowerState(null), {
      powerSave: false,
      level: null,
      charging: null,
    });
  });
});

describe("arApplyPixelRatio", () => {
  it("caps and floors bad inputs", () => {
    assert.equal(arApplyPixelRatio(3, 1.25), 1.25);
    assert.equal(arApplyPixelRatio(1.5, 2), 1.5);
    assert.equal(arApplyPixelRatio(0, 2), 1);
    assert.equal(arApplyPixelRatio(2, 0), 1);
  });
});
