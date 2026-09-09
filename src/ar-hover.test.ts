import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  arClassifyPointer,
  arHoverCoach,
  arHoverShouldPlace,
  arNormFromClient,
  arPointerIsPrecise,
  createArHover,
  createArHoverProbe,
} from "./ar-hover.ts";

describe("arClassifyPointer", () => {
  it("maps pointer types", () => {
    assert.equal(arClassifyPointer("mouse"), "mouse");
    assert.equal(arClassifyPointer("pen"), "pen");
    assert.equal(arClassifyPointer("touch"), "touch");
    assert.equal(arClassifyPointer(""), "unknown");
    assert.equal(arClassifyPointer(undefined), "unknown");
  });
});

describe("arPointerIsPrecise", () => {
  it("treats mouse and pen as precise", () => {
    assert.equal(arPointerIsPrecise("mouse"), true);
    assert.equal(arPointerIsPrecise("pen"), true);
    assert.equal(arPointerIsPrecise("touch"), false);
    assert.equal(arPointerIsPrecise("unknown"), false);
  });
});

describe("arHoverCoach", () => {
  it("is silent after place or on touch", () => {
    assert.equal(
      arHoverCoach({ kind: "mouse", hovering: true, placed: true, mode: "place" }),
      null,
    );
    assert.equal(
      arHoverCoach({ kind: "touch", hovering: true, placed: false, mode: "place" }),
      null,
    );
  });

  it("coaches place / cubes / scan", () => {
    assert.match(
      arHoverCoach({ kind: "mouse", hovering: true, placed: false, mode: "place" }) ?? "",
      /click to place/i,
    );
    assert.match(
      arHoverCoach({ kind: "pen", hovering: true, placed: false, mode: "cubes" }) ?? "",
      /cube/i,
    );
    assert.match(
      arHoverCoach({ kind: "mouse", hovering: true, placed: false, mode: "scan" }) ?? "",
      /plaque/i,
    );
    assert.equal(
      arHoverCoach({ kind: "mouse", hovering: false, placed: false, mode: "scan" }),
      null,
    );
  });
});

describe("arNormFromClient", () => {
  it("clamps overlay-normalized coords", () => {
    const rect = { left: 10, top: 20, width: 100, height: 200 };
    assert.deepEqual(arNormFromClient(10, 20, rect), { x: 0, y: 0 });
    assert.deepEqual(arNormFromClient(60, 120, rect), { x: 0.5, y: 0.5 });
    assert.deepEqual(arNormFromClient(-50, 999, rect), { x: 0, y: 1 });
  });
});

describe("arHoverShouldPlace", () => {
  it("rejects right-click and accepts left / touch", () => {
    assert.equal(arHoverShouldPlace("mouse", 2), false);
    assert.equal(arHoverShouldPlace("mouse", 1), true);
    assert.equal(arHoverShouldPlace("pen", 1), true);
    assert.equal(arHoverShouldPlace("touch", 0), true);
  });
});

describe("createArHover", () => {
  it("ignores touch and coalesces mouse to the latest point", () => {
    const seen: string[] = [];
    let run: (() => void) | null = null;
    const hover = createArHover({
      onChange: (s) => seen.push(`${s.hovering}:${s.x.toFixed(2)}`),
      schedule: (cb) => {
        run = cb;
        return 1;
      },
      cancel: () => {
        run = null;
      },
    });
    const rect = { left: 0, top: 0, width: 100, height: 100 };
    hover.move(10, 10, "touch", rect);
    assert.equal(run, null);
    hover.arm();
    hover.move(10, 10, "touch", rect);
    assert.equal(run, null);
    hover.move(20, 20, "mouse", rect);
    hover.move(80, 50, "mouse", rect);
    run?.();
    assert.deepEqual(seen, ["true:0.80"]);
    hover.leave();
    assert.equal(seen.at(-1), "false:0.80");
    hover.dispose();
  });
});

describe("createArHoverProbe", () => {
  it("returns only the latest in-flight result", async () => {
    let resolveFirst!: (v: boolean) => void;
    let n = 0;
    const probe = createArHoverProbe(async () => {
      n += 1;
      if (n === 1) {
        return await new Promise<boolean>((resolve) => {
          resolveFirst = resolve;
        });
      }
      return true;
    });
    const a = probe.probe(0.1, 0.1);
    const b = probe.probe(0.9, 0.9);
    resolveFirst(false);
    assert.equal(await a, null);
    assert.equal(await b, true);
    probe.reset();
    const c = probe.probe(0.2, 0.2);
    assert.equal(await c, true);
  });
});
