import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  arPageLifeCoach,
  arPageLifeReason,
  bindArPageLife,
  type ArPageLifeEnv,
  type ArPageLifeReason,
} from "./ar-page-life.ts";

describe("arPageLifeReason", () => {
  it("tears down on pagehide and freeze", () => {
    assert.equal(arPageLifeReason({ type: "pagehide" }), "pagehide");
    assert.equal(arPageLifeReason({ type: "PAGEHIDE" }), "pagehide");
    assert.equal(arPageLifeReason({ type: "freeze" }), "freeze");
  });

  it("tears down on bfcache restore, not a normal pageshow", () => {
    assert.equal(arPageLifeReason({ type: "pageshow", persisted: true }), "bfcache");
    assert.equal(arPageLifeReason({ type: "pageshow", persisted: false }), null);
    assert.equal(arPageLifeReason({ type: "pageshow" }), null);
  });

  it("tears down on discarded restore", () => {
    assert.equal(
      arPageLifeReason({ type: "pageshow", wasDiscarded: true }),
      "discarded",
    );
  });

  it("prefers bfcache when both restore flags are set", () => {
    assert.equal(
      arPageLifeReason({ type: "pageshow", persisted: true, wasDiscarded: true }),
      "bfcache",
    );
  });

  it("ignores visibility and unknown events", () => {
    assert.equal(arPageLifeReason({ type: "visibilitychange" }), null);
    assert.equal(arPageLifeReason({ type: "blur" }), null);
    assert.equal(arPageLifeReason({ type: "resume" }), null);
  });
});

describe("arPageLifeCoach", () => {
  it("is silent on pagehide and explains restore", () => {
    assert.equal(arPageLifeCoach("pagehide"), "");
    assert.match(arPageLifeCoach("freeze"), /frozen/i);
    assert.match(arPageLifeCoach("bfcache"), /restored/i);
    assert.match(arPageLifeCoach("discarded"), /restored/i);
  });
});

class FakeEnv implements ArPageLifeEnv {
  wasDiscarded = false;
  private readonly listeners = new Map<string, Set<EventListener>>();

  addEventListener(type: string, fn: EventListener): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(fn);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, fn: EventListener): void {
    this.listeners.get(type)?.delete(fn);
  }

  dispatch(type: string, persisted?: boolean): void {
    const event = { type, persisted } as Event;
    for (const fn of this.listeners.get(type) ?? []) fn(event);
  }

  count(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }
}

describe("bindArPageLife", () => {
  it("forwards classified events and unsubscribes", () => {
    const env = new FakeEnv();
    const seen: ArPageLifeReason[] = [];
    const stop = bindArPageLife((reason) => seen.push(reason), env);
    env.dispatch("visibilitychange");
    env.dispatch("pagehide");
    env.dispatch("freeze");
    env.dispatch("pageshow", true);
    assert.deepEqual(seen, ["pagehide", "freeze", "bfcache"]);
    stop();
    env.dispatch("pagehide");
    assert.deepEqual(seen, ["pagehide", "freeze", "bfcache"]);
    assert.equal(env.count("pagehide"), 0);
  });

  it("reads wasDiscarded from the env on pageshow", () => {
    const env = new FakeEnv();
    env.wasDiscarded = true;
    const seen: ArPageLifeReason[] = [];
    bindArPageLife((reason) => seen.push(reason), env);
    env.dispatch("pageshow", false);
    assert.deepEqual(seen, ["discarded"]);
  });
});
