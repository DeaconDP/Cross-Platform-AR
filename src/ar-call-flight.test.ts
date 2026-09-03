import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createArCallFlight } from "./ar-call-flight.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createArCallFlight latest", () => {
  it("runs a lone call", async () => {
    const flight = createArCallFlight("latest");
    const out = await flight.schedule("tap", { x: 0.4, y: 0.6 }, async (p) => p);
    assert.deepEqual(out, { status: "ran", value: { x: 0.4, y: 0.6 } });
  });

  it("keeps only the newest waiting tap", async () => {
    const flight = createArCallFlight("latest");
    const first = deferred<{ n: number }>();
    const a = flight.schedule("tap", 1, () => first.promise);
    const b = flight.schedule("tap", 2, async (n) => n);
    const c = flight.schedule("tap", 3, async (n) => n);
    first.resolve({ n: 1 });
    assert.deepEqual(await a, { status: "ran", value: { n: 1 } });
    assert.deepEqual(await b, { status: "superseded" });
    assert.deepEqual(await c, { status: "ran", value: 3 });
  });

  it("still pumps after a rejection", async () => {
    const flight = createArCallFlight("latest");
    const first = deferred<number>();
    const a = flight.schedule("tap", 1, () => first.promise);
    const b = flight.schedule("tap", 2, async (n) => n);
    first.reject(new Error("miss"));
    await assert.rejects(a, /miss/);
    assert.deepEqual(await b, { status: "ran", value: 2 });
  });

  it("reset supersedes waiters without touching the in-flight call", async () => {
    const flight = createArCallFlight("latest");
    const first = deferred<string>();
    const a = flight.schedule("move", "a", () => first.promise);
    const b = flight.schedule("move", "b", async (s) => s);
    flight.reset();
    first.resolve("a");
    assert.deepEqual(await a, { status: "ran", value: "a" });
    assert.deepEqual(await b, { status: "superseded" });
    assert.equal(flight.pending("move"), 0);
  });
});

describe("createArCallFlight serial", () => {
  it("runs every queued tap in order", async () => {
    const flight = createArCallFlight("serial");
    const first = deferred<number>();
    const seen: number[] = [];
    const a = flight.schedule("tap", 1, () => first.promise.then(() => seen.push(1)));
    const b = flight.schedule("tap", 2, async () => seen.push(2));
    const c = flight.schedule("tap", 3, async () => seen.push(3));
    first.resolve(1);
    await a;
    await b;
    await c;
    assert.deepEqual(seen, [1, 2, 3]);
  });
});
