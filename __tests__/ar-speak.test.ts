import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AR_SPEAK_FIND,
  AR_SPEAK_MISS,
  AR_SPEAK_SURFACE,
  arSpeakArm,
  arSpeakKind,
  arSpeakNorm,
  arSpeakUtterance,
} from "../src/ar-speak.ts";

describe("arSpeakNorm", () => {
  it("collapses case and space", () => {
    assert.equal(arSpeakNorm("  TAP  HERE  "), "tap here");
  });
});

describe("arSpeakUtterance", () => {
  it("turns museum dots into pauses", () => {
    assert.equal(arSpeakUtterance("Find · tap"), "Find. tap");
  });
});

describe("arSpeakKind", () => {
  it("idles on empty or unchanged copy", () => {
    assert.equal(arSpeakKind({ text: "  " }), "idle");
    assert.equal(arSpeakKind({ text: AR_SPEAK_FIND, prev: AR_SPEAK_FIND }), "idle");
  });

  it("skips once placed, muted, or a screen reader is on", () => {
    assert.equal(arSpeakKind({ text: "Tap", placed: true }), "skip");
    assert.equal(arSpeakKind({ text: "Tap", muted: true }), "skip");
    assert.equal(arSpeakKind({ text: "Tap", screenReader: true }), "skip");
  });

  it("speaks new coach copy", () => {
    assert.equal(arSpeakKind({ text: AR_SPEAK_SURFACE }), "coach");
    assert.equal(arSpeakKind({ text: AR_SPEAK_MISS, prev: AR_SPEAK_SURFACE }), "coach");
  });
});

describe("arSpeakArm", () => {
  it("speaks once, skips a repeat, then stops when placed", async () => {
    const heard: string[] = [];
    let stopped = 0;
    const handle = arSpeakArm({
      speak: (text) => {
        heard.push(text);
      },
      stop: () => {
        stopped += 1;
      },
    });
    await handle.say(AR_SPEAK_FIND);
    await handle.say(AR_SPEAK_FIND);
    await handle.say(AR_SPEAK_SURFACE);
    await handle.say("done", { placed: true });
    handle.dispose();
    assert.deepEqual(heard, [AR_SPEAK_FIND, AR_SPEAK_SURFACE]);
    assert.equal(stopped >= 2, true);
  });

  it("does not speak after dispose", async () => {
    const heard: string[] = [];
    const handle = arSpeakArm({
      speak: (text) => {
        heard.push(text);
      },
    });
    handle.dispose();
    await handle.say(AR_SPEAK_FIND);
    assert.deepEqual(heard, []);
  });
});
