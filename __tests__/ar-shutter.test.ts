import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AR_SHUTTER_COOLDOWN_MS,
  AR_SHUTTER_NORM,
  arIsShutterKey,
  arShouldShutter,
  arShutterAccept,
  arShutterArm,
  arShutterCoach,
  arShutterIsTyping,
  arShutterShouldFire,
  arShutterSourceFromAndroidCode,
  arShutterSourceFromKey,
} from "../src/ar-shutter.ts";

describe("arShutterSourceFromKey", () => {
  it("classifies volume, media, and camera keys", () => {
    assert.equal(arShutterSourceFromKey("AudioVolumeUp"), "volume");
    assert.equal(arShutterSourceFromKey("VolumeDown"), "volume");
    assert.equal(arShutterSourceFromKey("MediaPlayPause"), "media");
    assert.equal(arShutterSourceFromKey("MediaPlay"), "media");
    assert.equal(arShutterSourceFromKey("Camera"), "camera");
    assert.equal(arShutterSourceFromKey("Enter"), "unknown");
    assert.equal(arShutterSourceFromKey(" ", "Space"), "unknown");
  });

  it("reads KeyboardEvent.code when key is empty", () => {
    assert.equal(arShutterSourceFromKey("", "VolumeUp"), "volume");
    assert.equal(arShutterSourceFromKey("", "MediaPlayPause"), "media");
  });
});

describe("arShutterSourceFromAndroidCode", () => {
  it("maps volume / headset / camera keycodes", () => {
    assert.equal(arShutterSourceFromAndroidCode(24), "volume");
    assert.equal(arShutterSourceFromAndroidCode(25), "volume");
    assert.equal(arShutterSourceFromAndroidCode(85), "media");
    assert.equal(arShutterSourceFromAndroidCode(79), "media");
    assert.equal(arShutterSourceFromAndroidCode(27), "camera");
    assert.equal(arShutterSourceFromAndroidCode(4), "unknown");
  });
});

describe("arShouldShutter", () => {
  it("accepts a volume press and skips repeats / typing", () => {
    assert.equal(arIsShutterKey("AudioVolumeUp"), true);
    assert.equal(arShouldShutter({ key: "AudioVolumeUp" }), true);
    assert.equal(arShouldShutter({ key: "AudioVolumeUp", repeat: true }), false);
    assert.equal(arShouldShutter({ key: "AudioVolumeUp", metaKey: true }), false);
    assert.equal(arShouldShutter({ key: "Enter" }), false);
    const input = { tagName: "TEXTAREA" };
    assert.equal(arShutterIsTyping(input), true);
    assert.equal(arShouldShutter({ key: "AudioVolumeUp", target: input }), false);
  });
});

describe("arShutterShouldFire / coach", () => {
  it("places once, cubes always, scan only before find", () => {
    assert.equal(arShutterShouldFire("place", false), true);
    assert.equal(arShutterShouldFire("place", true), false);
    assert.equal(arShutterShouldFire("cubes", true), true);
    assert.equal(arShutterShouldFire("scan", false), true);
    assert.equal(arShutterShouldFire("scan", true), false);
  });

  it("coaches shutter copy before place", () => {
    assert.equal(
      arShutterCoach({ placed: false, kind: "place" }),
      "Volume or a camera remote places at the center.",
    );
    assert.equal(arShutterCoach({ placed: true, kind: "place" }), null);
    assert.equal(
      arShutterCoach({ placed: false, kind: "scan" }),
      "Volume simulates a find in the 3D view.",
    );
    assert.equal(
      arShutterCoach({ kind: "cubes" }),
      "Volume or a camera remote drops a cube.",
    );
  });

  it("keeps the view-center norm", () => {
    assert.deepEqual(AR_SHUTTER_NORM, { x: 0.5, y: 0.5 });
  });
});

describe("arShutterAccept", () => {
  it("debounces inside the cooldown", () => {
    const first = arShutterAccept(0, 10);
    assert.equal(first.fire, true);
    const again = arShutterAccept(first.lastFire, 10 + 40);
    assert.equal(again.fire, false);
    const later = arShutterAccept(first.lastFire, 10 + AR_SHUTTER_COOLDOWN_MS + 1);
    assert.equal(later.fire, true);
  });
});

describe("arShutterArm", () => {
  it("fires on volume after arm, then ignores after place", () => {
    const shots: string[] = [];
    const listeners = new Set<(ev: KeyboardEvent) => void>();
    const arm = arShutterArm({
      kind: "place",
      onShutter: (source) => {
        shots.push(source);
      },
      now: () => 20,
      keys: {
        add: (_t, fn) => {
          listeners.add(fn);
        },
        remove: (_t, fn) => {
          listeners.delete(fn);
        },
      },
    });
    for (const fn of listeners) {
      fn({ key: "AudioVolumeUp", preventDefault() {} } as KeyboardEvent);
    }
    assert.deepEqual(shots, ["volume"]);
    arm.notePlaced(true);
    for (const fn of listeners) {
      fn({ key: "AudioVolumeUp", preventDefault() {} } as KeyboardEvent);
    }
    assert.equal(shots.length, 1);
    arm.dispose();
    assert.equal(listeners.size, 0);
  });

  it("does not fire for scan after found", () => {
    let n = 0;
    const listeners = new Set<(ev: KeyboardEvent) => void>();
    const arm = arShutterArm({
      kind: "scan",
      onShutter: () => {
        n += 1;
      },
      now: () => 20,
      keys: {
        add: (_t, fn) => {
          listeners.add(fn);
        },
        remove: (_t, fn) => {
          listeners.delete(fn);
        },
      },
    });
    arm.notePlaced(true);
    for (const fn of listeners) {
      fn({ key: "MediaPlayPause", preventDefault() {} } as KeyboardEvent);
    }
    assert.equal(n, 0);
    arm.dispose();
  });
});
