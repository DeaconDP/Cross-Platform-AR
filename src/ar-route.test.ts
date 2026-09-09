import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AR_ROUTE_HOLD_DOWN_MS,
  AR_ROUTE_HOLD_UP_MS,
  arHoldRoute,
  arJudgeRoute,
  arKindFromDeviceLabel,
  arKindFromFlags,
  arParseRouteEvent,
  arParseRouteKind,
  arRouteChange,
  arRouteCoach,
  arRoutePlatformFromCap,
  arRouteProfile,
  arSampleFromDeviceLabels,
} from "./ar-route.ts";

describe("arKindFromFlags", () => {
  it("prefers bluetooth over wired over speaker", () => {
    assert.equal(
      arKindFromFlags({ wired: true, bluetooth: true, speaker: true }),
      "bluetooth",
    );
    assert.equal(
      arKindFromFlags({ wired: true, bluetooth: false, speaker: true }),
      "wired",
    );
    assert.equal(
      arKindFromFlags({ wired: false, bluetooth: false, speaker: true }),
      "speaker",
    );
    assert.equal(
      arKindFromFlags({ wired: false, bluetooth: false, speaker: false }),
      "unknown",
    );
  });
});

describe("arRouteChange", () => {
  it("stays quiet until the first known route settles", () => {
    assert.equal(arRouteChange("unknown", "bluetooth"), "none");
    assert.equal(arRouteChange("unknown", "speaker"), "none");
  });

  it("flags unplug to speaker and plug to headset", () => {
    assert.equal(arRouteChange("wired", "speaker"), "to-speaker");
    assert.equal(arRouteChange("bluetooth", "speaker"), "to-speaker");
    assert.equal(arRouteChange("speaker", "wired"), "to-headset");
    assert.equal(arRouteChange("speaker", "bluetooth"), "to-headset");
    assert.equal(arRouteChange("wired", "bluetooth"), "none");
  });
});

describe("arHoldRoute", () => {
  it("holds 400ms before rising and 800ms before falling", () => {
    assert.equal(
      arHoldRoute({ shown: "speaker", raw: "bluetooth", heldMs: 200 }),
      "speaker",
    );
    assert.equal(
      arHoldRoute({
        shown: "speaker",
        raw: "bluetooth",
        heldMs: AR_ROUTE_HOLD_UP_MS,
      }),
      "bluetooth",
    );
    assert.equal(
      arHoldRoute({
        shown: "bluetooth",
        raw: "speaker",
        heldMs: AR_ROUTE_HOLD_DOWN_MS,
      }),
      "speaker",
    );
  });
});

describe("arRouteCoach", () => {
  it("tells Emily when headphones come out", () => {
    assert.match(arRouteCoach("to-speaker", "emily", false), /speaker/);
    assert.match(arRouteCoach("to-headset", "emily", false), /headphones/);
    assert.equal(arRouteCoach("none", "emily", false), "");
    assert.match(arRouteCoach("none", "emily", true), /one ear/);
  });
});

describe("arRouteProfile", () => {
  it("ducks exhibit sound only on unplug to speaker", () => {
    const unplug = arRouteProfile(
      {
        kind: "speaker",
        outputs: 1,
        wired: false,
        bluetooth: false,
        speaker: true,
        mono: false,
      },
      "wired",
      "place",
    );
    assert.equal(unplug.duckSpeaker, true);
    assert.equal(unplug.change, "to-speaker");
    const stay = arJudgeRoute(
      {
        kind: "speaker",
        outputs: 1,
        wired: false,
        bluetooth: false,
        speaker: true,
        mono: false,
      },
      "speaker",
    );
    assert.equal(stay.duckSpeaker, false);
  });
});

describe("arParseRouteEvent", () => {
  it("reads flags and falls back to kind", () => {
    assert.equal(arParseRouteEvent(undefined).kind, "unknown");
    assert.equal(arParseRouteEvent({ kind: "wired" }).kind, "wired");
    assert.equal(
      arParseRouteEvent({ bluetooth: true, speaker: true }).kind,
      "bluetooth",
    );
    assert.equal(arParseRouteKind("nope"), "unknown");
  });
});

describe("arKindFromDeviceLabel", () => {
  it("classifies web audiooutput labels", () => {
    assert.equal(arKindFromDeviceLabel("AirPods Pro"), "bluetooth");
    assert.equal(arKindFromDeviceLabel("Wired Headphones"), "wired");
    assert.equal(arKindFromDeviceLabel("MacBook Speakers"), "speaker");
    assert.equal(
      arSampleFromDeviceLabels(["Built-in Speakers", "AirPods"]).kind,
      "bluetooth",
    );
  });
});

describe("arRoutePlatformFromCap", () => {
  it("maps Capacitor platforms", () => {
    assert.equal(arRoutePlatformFromCap("ios"), "ios");
    assert.equal(arRoutePlatformFromCap("web"), "web");
  });
});
