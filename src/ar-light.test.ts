import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  arCoachLight,
  arLightLabel,
  arTorchAvailable,
  arTorchLevel,
} from "./ar-light.ts";

describe("arTorchAvailable", () => {
  it("is true when native or media can light the room", () => {
    assert.equal(
      arTorchAvailable({ torchAvailable: false, mediaTorchAvailable: false }),
      false,
    );
    assert.equal(
      arTorchAvailable({ torchAvailable: true, mediaTorchAvailable: false }),
      true,
    );
    assert.equal(
      arTorchAvailable({ torchAvailable: false, mediaTorchAvailable: true }),
      true,
    );
  });
});

describe("arCoachLight", () => {
  it("stays quiet without a torch", () => {
    assert.equal(
      arCoachLight({ torchAvailable: false, torchOn: false }),
      null,
    );
  });

  it("invites Light before a place, then only while the LED is on", () => {
    assert.equal(
      arCoachLight({ torchAvailable: true, torchOn: false }),
      "Too dark? Tap Light to find a surface faster.",
    );
    assert.equal(
      arCoachLight({ torchAvailable: true, torchOn: true }),
      "Light on — scan a flat surface.",
    );
    assert.equal(
      arCoachLight({ torchAvailable: true, torchOn: false, placed: true }),
      null,
    );
    assert.equal(
      arCoachLight({ torchAvailable: true, torchOn: true, placed: true }),
      "Light on — scan a flat surface.",
    );
  });
});

describe("arLightLabel", () => {
  it("toggles pressed copy", () => {
    assert.equal(arLightLabel(false), "Light");
    assert.equal(arLightLabel(true), "Light on");
  });
});

describe("arTorchLevel", () => {
  it("drops intensity under power-save", () => {
    assert.equal(arTorchLevel({}), 0.7);
    assert.equal(arTorchLevel({ saver: true }), 0.4);
    assert.equal(arTorchLevel({ critical: true }), 0.25);
    assert.equal(arTorchLevel({ saver: true, critical: true }), 0.25);
  });
});
