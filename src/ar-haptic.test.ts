import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AR_HAPTIC_GAP_MS,
  arArmHaptic,
  arHapticCanVibrate,
  arHapticCoach,
  arHapticEnabled,
  arHapticPattern,
  arHapticShouldPlay,
} from "./ar-haptic.ts";

describe("arHapticPattern", () => {
  it("uses a short tick for surface and a longer one for place", () => {
    assert.ok(arHapticPattern("surface")[0]! < arHapticPattern("place")[0]!);
  });

  it("uses a two-gap pulse for miss so it does not feel like a place", () => {
    assert.ok(arHapticPattern("miss").length >= 3);
    assert.notDeepEqual(arHapticPattern("miss"), arHapticPattern("place"));
  });
});

describe("arHapticEnabled", () => {
  it("is on unless the OS setting is off", () => {
    assert.equal(arHapticEnabled({}), true);
    assert.equal(arHapticEnabled({ enabled: true }), true);
    assert.equal(arHapticEnabled({ enabled: false }), false);
  });

  it("still allows vibrate when muted — the buzz is the cue", () => {
    assert.equal(arHapticCanVibrate({ muted: true }), true);
    assert.equal(arHapticCanVibrate({ vibrate: false }), false);
    assert.equal(arHapticCanVibrate({ enabled: false }), false);
  });
});

describe("arHapticCoach", () => {
  it("explains a miss per product", () => {
    assert.match(arHapticCoach("miss", "place"), /flat surface/i);
    assert.match(arHapticCoach("miss", "emily"), /flatter/i);
    assert.match(arHapticCoach("miss", "cubes"), /surface/i);
    assert.match(arHapticCoach("miss", "scan"), /plaque/i);
  });

  it("stays quiet on a successful place when sound is on", () => {
    assert.equal(arHapticCoach("place", "place"), "");
    assert.equal(arHapticCoach("surface", "place"), "");
    assert.equal(arHapticCoach("lift", "place"), "");
  });

  it("names the buzz when the ringer is off", () => {
    assert.match(arHapticCoach("place", "place", { muted: true }), /sound is off/i);
    assert.match(arHapticCoach("place", "cubes", { muted: true }), /silent/i);
  });
});

describe("arHapticShouldPlay", () => {
  it("debounces the same kind inside the gap", () => {
    assert.equal(arHapticShouldPlay("miss", {}, 1000, 1000 + AR_HAPTIC_GAP_MS - 1, "miss"), false);
    assert.equal(arHapticShouldPlay("miss", {}, 1000, 1000 + AR_HAPTIC_GAP_MS, "miss"), true);
  });

  it("lets a different kind through during the gap", () => {
    assert.equal(arHapticShouldPlay("place", {}, 1000, 1010, "miss"), true);
  });

  it("respects the system off switch", () => {
    assert.equal(arHapticShouldPlay("place", { enabled: false }, 0, 1000), false);
  });
});

describe("arArmHaptic", () => {
  it("plays native first and skips a repeat miss", () => {
    const kinds: string[] = [];
    let t = 0;
    const arm = arArmHaptic({
      product: "cubes",
      now: () => t,
      playNative: (kind) => {
        kinds.push(kind);
      },
    });
    assert.equal(arm.play("miss"), true);
    t += 20;
    assert.equal(arm.play("miss"), false);
    t += AR_HAPTIC_GAP_MS;
    assert.equal(arm.play("place"), true);
    assert.deepEqual(kinds, ["miss", "place"]);
    arm.dispose();
    assert.equal(arm.play("error"), false);
  });

  it("falls back to vibrate when native throws", () => {
    const pulses: number[][] = [];
    const arm = arArmHaptic({
      product: "cubes",
      playNative: () => {
        throw new Error("no plugin");
      },
      vibrate: (pattern) => pulses.push(pattern),
    });
    assert.equal(arm.play("surface"), true);
    assert.deepEqual(pulses, [arHapticPattern("surface")]);
    arm.dispose();
  });

  it("emits muted-place coach without blocking the buzz", () => {
    const coaches: string[] = [];
    const kinds: string[] = [];
    const arm = arArmHaptic({
      product: "cubes",
      prefs: () => ({ muted: true }),
      playNative: (kind) => {
        kinds.push(kind);
      },
      onCoach: (coach) => coaches.push(coach),
    });
    arm.play("place");
    assert.equal(kinds[0], "place");
    assert.match(coaches[0] ?? "", /silent/i);
    arm.dispose();
  });
});
