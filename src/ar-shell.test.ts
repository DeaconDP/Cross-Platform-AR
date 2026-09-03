import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AR_TAP_SLOP_PX,
  type ArShellWindow,
  attachArShell,
  arShellCssLock,
  arShellState,
  gestureTravelPx,
  isArShellState,
  isExitKey,
  isPlacementTap,
  onSessionBack,
  pointerEndKind,
  shouldPushHistoryTrap,
} from "./ar-shell.ts";

function fakeWin(initial: unknown = null): ArShellWindow & {
  emitKey: (key: string) => { prevented: boolean };
  pop: () => void;
} {
  const stack: unknown[] = [initial];
  const listeners = {
    popstate: new Set<(ev: { key?: string; preventDefault(): void }) => void>(),
    keydown: new Set<(ev: { key?: string; preventDefault(): void }) => void>(),
  };
  const style = { overflow: "auto", overscrollBehavior: "contain" };
  const win: ArShellWindow = {
    history: {
      get state() {
        return stack[stack.length - 1];
      },
      pushState(data: unknown) {
        stack.push(data);
      },
      back() {
        if (stack.length <= 1) return;
        stack.pop();
        for (const fn of listeners.popstate) fn({ preventDefault() {} });
      },
    },
    document: { documentElement: { style } },
    addEventListener(type, listener) {
      listeners[type].add(listener);
    },
    removeEventListener(type, listener) {
      listeners[type].delete(listener);
    },
  };
  return {
    ...win,
    emitKey(key: string) {
      let prevented = false;
      const ev = {
        key,
        preventDefault() {
          prevented = true;
        },
      };
      for (const fn of listeners.keydown) fn(ev);
      return { prevented };
    },
    pop() {
      win.history.back();
    },
  };
}

describe("pointerEndKind", () => {
  it("treats up as commit and cancel/lost as cancel", () => {
    assert.equal(pointerEndKind("pointerup"), "commit");
    assert.equal(pointerEndKind("pointercancel"), "cancel");
    assert.equal(pointerEndKind("lostpointercapture"), "cancel");
  });
});

describe("isPlacementTap", () => {
  it("accepts a short committed lift and rejects cancel/drag", () => {
    assert.equal(
      isPlacementTap({ kind: "commit", remainingPointers: 0, travelPx: 2 }),
      true,
    );
    assert.equal(
      isPlacementTap({ kind: "cancel", remainingPointers: 0, travelPx: 0 }),
      false,
    );
    assert.equal(
      isPlacementTap({
        kind: "commit",
        remainingPointers: 0,
        travelPx: AR_TAP_SLOP_PX + 8,
      }),
      false,
    );
  });
});

describe("session chrome", () => {
  it("maps travel, back, and Escape", () => {
    assert.equal(gestureTravelPx(10, 10, 10, 10), 0);
    assert.equal(onSessionBack(true), "close-session");
    assert.equal(isExitKey("Escape"), true);
    assert.equal(isArShellState(arShellState()), true);
    assert.equal(shouldPushHistoryTrap({}), true);
  });
});

describe("attachArShell", () => {
  it("locks the page, closes on history back, restores overflow", () => {
    const win = fakeWin({ page: "landing" });
    let exits = 0;
    const release = attachArShell({
      onExit: () => {
        exits += 1;
      },
      historyTrap: true,
      win,
    });
    assert.deepEqual(win.document.documentElement.style, arShellCssLock());
    win.pop();
    assert.equal(exits, 1);
    release();
    assert.equal(win.document.documentElement.style.overflow, "auto");
  });

  it("button close pops the sentinel without calling onExit", () => {
    const win = fakeWin({ page: "landing" });
    let exits = 0;
    attachArShell({
      onExit: () => {
        exits += 1;
      },
      historyTrap: true,
      win,
    })();
    assert.equal(exits, 0);
    assert.deepEqual(win.history.state, { page: "landing" });
  });
});
