import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AR_IDLE,
  arArmIdle,
  arIdleCopy,
  arIdleLimit,
  arJudgeIdle,
  type ArIdleInput,
} from "./ar-idle.ts";

const base = (over: Partial<ArIdleInput> = {}): ArIdleInput => ({
  now: 0,
  startedAt: 0,
  lastInteractAt: 0,
  hiddenSince: null,
  placed: false,
  planeFound: false,
  ...over,
});

describe("arJudgeIdle", () => {
  it("stays ok before the first surface hint", () => {
    const v = arJudgeIdle(base({ now: AR_IDLE.surfaceHintMs - 1 }));
    assert.equal(v.phase, "ok");
    assert.equal(v.shouldExit, false);
    assert.equal(v.coach, null);
  });

  it("escalates surface coaching at 8s then 16s", () => {
    const hint = arJudgeIdle(base({ now: AR_IDLE.surfaceHintMs }));
    assert.equal(hint.phase, "surfaceHint");
    assert.match(hint.coach || "", /slowly/);
    const slow = arJudgeIdle(base({ now: AR_IDLE.surfaceSlowMs }));
    assert.equal(slow.phase, "surfaceSlow");
    assert.match(slow.coach || "", /light/);
  });

  it("skips surface coaching once a plane is found or in image mode", () => {
    assert.equal(
      arJudgeIdle(base({ now: AR_IDLE.surfaceSlowMs, planeFound: true })).phase,
      "ok",
    );
    assert.equal(
      arJudgeIdle(base({ now: AR_IDLE.surfaceSlowMs, imageMode: true })).phase,
      "ok",
    );
  });

  it("warns then exits after an unplaced pause", () => {
    const warnAt = AR_IDLE.unplacedMs - AR_IDLE.warnLeadMs;
    const warn = arJudgeIdle(base({ now: warnAt }));
    assert.equal(warn.phase, "idleWarn");
    assert.equal(warn.shouldExit, false);
    const exit = arJudgeIdle(base({ now: AR_IDLE.unplacedMs }));
    assert.equal(exit.phase, "idleExit");
    assert.equal(exit.shouldExit, true);
    assert.equal(exit.reason, "idle");
  });

  it("gives a placed session 90s before idle exit", () => {
    const almost = arJudgeIdle(
      base({ now: AR_IDLE.placedMs - 1, placed: true, planeFound: true }),
    );
    assert.equal(almost.shouldExit, false);
    const done = arJudgeIdle(
      base({ now: AR_IDLE.placedMs, placed: true, planeFound: true }),
    );
    assert.equal(done.phase, "idleExit");
    assert.equal(arIdleLimit(true), AR_IDLE.placedMs);
  });

  it("exits after 8s in the background (pocket)", () => {
    const early = arJudgeIdle(base({ now: 7_000, hiddenSince: 0 }));
    assert.equal(early.shouldExit, false);
    const pocket = arJudgeIdle(base({ now: AR_IDLE.pocketMs, hiddenSince: 0 }));
    assert.equal(pocket.phase, "pocketExit");
    assert.equal(pocket.reason, "pocket");
    assert.equal(pocket.coach, arIdleCopy("pocketExit"));
  });
});

describe("arArmIdle", () => {
  const fake = () => {
    let t = 0;
    let hid = false;
    let pulse: (() => void) | null = null;
    return {
      clock: {
        now: () => t,
        hidden: () => hid,
        every: (fn: () => void) => {
          pulse = fn;
          return () => {
            pulse = null;
          };
        },
      },
      advance: (ms: number) => {
        t += ms;
        pulse?.();
      },
      hide: () => {
        hid = true;
        pulse?.();
      },
    };
  };

  it("clears surface coach when a plane arrives", () => {
    const env = fake();
    const coaches: string[] = [];
    const idle = arArmIdle(
      {
        getState: () => ({ placed: false, planeFound: false }),
        onCoach: (copy) => {
          if (copy) coaches.push(copy);
          else coaches.push("");
        },
        onExit: () => {},
      },
      env.clock,
    );
    env.advance(AR_IDLE.surfaceHintMs);
    assert.equal(coaches.at(-1), arIdleCopy("surfaceHint"));
    idle.notePlane();
    assert.equal(coaches.at(-1), "");
    idle.dispose();
  });

  it("exits once on idle and ignores later ticks", () => {
    const env = fake();
    const exits: string[] = [];
    const idle = arArmIdle(
      {
        getState: () => ({ placed: false, planeFound: true }),
        onCoach: () => {},
        onExit: (reason, copy) => exits.push(`${reason}:${copy}`),
      },
      env.clock,
    );
    env.advance(AR_IDLE.unplacedMs);
    env.advance(AR_IDLE.unplacedMs);
    assert.equal(exits.length, 1);
    assert.match(exits[0]!, /^idle:/);
    idle.dispose();
  });

  it("resets idle-warn when the visitor taps", () => {
    const env = fake();
    const coaches: Array<string | null> = [];
    const idle = arArmIdle(
      {
        getState: () => ({ placed: false, planeFound: true }),
        onCoach: (copy) => coaches.push(copy),
        onExit: () => {},
      },
      env.clock,
    );
    env.advance(AR_IDLE.unplacedMs - AR_IDLE.warnLeadMs);
    assert.equal(coaches.at(-1), arIdleCopy("idleWarn"));
    idle.noteInteract();
    assert.equal(coaches.at(-1), null);
    idle.dispose();
  });

  it("pocket-exits after hidden dwell", () => {
    const env = fake();
    const exits: string[] = [];
    const idle = arArmIdle(
      {
        getState: () => ({ placed: true, planeFound: true }),
        onCoach: () => {},
        onExit: (reason) => exits.push(reason),
      },
      env.clock,
    );
    env.hide();
    env.advance(AR_IDLE.pocketMs);
    assert.deepEqual(exits, ["pocket"]);
    idle.dispose();
  });
});
