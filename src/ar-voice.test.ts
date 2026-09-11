import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AR_VOICE_HOLD_MS,
  AR_VOICE_RELEASE_MS,
  arVoiceApplyClass,
  arVoiceBlocksPlace,
  arVoiceCoach,
  arVoiceKindFromFlags,
  arVoiceParseNative,
  arVoicePrefersSelect,
  arVoiceReadWeb,
  arVoiceStep,
} from "./ar-voice.ts";

describe("arVoiceKindFromFlags", () => {
  it("is ok when neither aid is on", () => {
    assert.equal(arVoiceKindFromFlags({ voiceOn: false, keysOn: false }), "ok");
  });

  it("prefers voice over keys", () => {
    assert.equal(arVoiceKindFromFlags({ voiceOn: true, keysOn: true }), "voice");
  });

  it("treats a hardware keyboard as keys", () => {
    assert.equal(arVoiceKindFromFlags({ voiceOn: false, keysOn: true }), "keys");
  });
});

describe("arVoiceReadWeb", () => {
  it("is invalid in node without window", () => {
    const web = arVoiceReadWeb();
    assert.equal(web.valid, false);
    assert.equal(web.voiceOn, false);
    assert.equal(web.keysOn, false);
  });
});

describe("arVoiceStep", () => {
  it("stays ok until the hold elapses", () => {
    const t0 = 1_000;
    const a = arVoiceStep(null, "voice", t0);
    assert.equal(a.kind, "ok");
    const b = arVoiceStep(a, "voice", t0 + AR_VOICE_HOLD_MS - 1);
    assert.equal(b.kind, "ok");
    const c = arVoiceStep(b, "voice", t0 + AR_VOICE_HOLD_MS);
    assert.equal(c.kind, "voice");
  });

  it("needs a longer hold to return to ok", () => {
    const t0 = 5_000;
    let h = arVoiceStep(null, "keys", t0);
    h = arVoiceStep(h, "keys", t0 + AR_VOICE_HOLD_MS);
    assert.equal(h.kind, "keys");
    h = arVoiceStep(h, "ok", t0 + AR_VOICE_HOLD_MS + 1);
    h = arVoiceStep(h, "ok", t0 + AR_VOICE_HOLD_MS + AR_VOICE_RELEASE_MS - 1);
    assert.equal(h.kind, "keys");
    h = arVoiceStep(h, "ok", t0 + AR_VOICE_HOLD_MS + 1 + AR_VOICE_RELEASE_MS);
    assert.equal(h.kind, "ok");
  });
});

describe("arVoiceCoach + blocks + select", () => {
  it("is silent when ok", () => {
    assert.equal(arVoiceCoach("ok", "place"), null);
  });

  it("names the product", () => {
    assert.match(arVoiceCoach("voice", "place") ?? "", /Voice Control|mic|Place/i);
    assert.match(arVoiceCoach("voice", "scan") ?? "", /plaque|Voice Control/i);
    assert.match(arVoiceCoach("voice", "emily") ?? "", /Place|Voice Control/i);
    assert.match(arVoiceCoach("voice", "cubes") ?? "", /cube|Voice Control/i);
    assert.match(arVoiceCoach("keys", "place") ?? "", /keyboard|Tab|Space/i);
    assert.match(arVoiceCoach("keys", "emily") ?? "", /keyboard|Place/i);
  });

  it("never blocks place", () => {
    assert.equal(arVoiceBlocksPlace("ok", "place"), false);
    assert.equal(arVoiceBlocksPlace("keys", "place"), false);
    assert.equal(arVoiceBlocksPlace("voice", "emily"), false);
    assert.equal(arVoiceBlocksPlace("keys", "scan"), false);
    assert.equal(arVoiceBlocksPlace("voice", "cubes"), false);
  });

  it("asks hosts for a named target when an aid is on", () => {
    assert.equal(arVoicePrefersSelect("ok"), false);
    assert.equal(arVoicePrefersSelect("keys"), true);
    assert.equal(arVoicePrefersSelect("voice"), true);
  });
});

describe("arVoiceApplyClass + parse", () => {
  it("toggles voice/keys classes", () => {
    const el = {
      classList: {
        voiceOn: false,
        keysOn: false,
        toggle(name: string, on: boolean) {
          if (name === "is-ar-voice-voice") this.voiceOn = on;
          if (name === "is-ar-voice-keys") this.keysOn = on;
        },
      },
    };
    arVoiceApplyClass(el as unknown as Element, "voice");
    assert.equal(el.classList.voiceOn, true);
    assert.equal(el.classList.keysOn, false);
    arVoiceApplyClass(el as unknown as Element, "ok");
    assert.equal(el.classList.voiceOn, false);
    assert.equal(el.classList.keysOn, false);
  });

  it("parses native payloads", () => {
    assert.deepEqual(
      arVoiceParseNative({
        kind: "voice",
        voiceOn: true,
        keysOn: true,
        valid: true,
      }),
      {
        kind: "voice",
        voiceOn: true,
        keysOn: true,
        valid: true,
      },
    );
    assert.equal(arVoiceParseNative({ voiceOn: true }).kind, "voice");
    assert.equal(arVoiceParseNative({ keysOn: true }).kind, "keys");
    assert.equal(arVoiceParseNative({ kind: "nope" }).kind, "ok");
  });
});
