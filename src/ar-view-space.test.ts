import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  AR_TAP_SLOP_PX,
  arIsTap,
  arOverlayNorm,
  arPointerHit,
  arScreenNorm,
  arUseScreenSpace,
  clamp01,
  lastViewMetrics,
  rememberViewMetrics,
  refreshArViewMetrics,
} from "./ar-view-space.ts";

const overlay = { left: 0, top: 0, width: 400, height: 800 };

describe("clamp01", () => {
  it("clamps and substitutes non-finite", () => {
    assert.equal(clamp01(-1), 0);
    assert.equal(clamp01(2), 1);
    assert.equal(clamp01(0.25), 0.25);
    assert.equal(clamp01(Number.NaN), 0.5);
  });
});

describe("arOverlayNorm", () => {
  it("maps the overlay box to 0–1", () => {
    assert.deepEqual(arOverlayNorm(200, 400, overlay), { nx: 0.5, ny: 0.5 });
    assert.deepEqual(arOverlayNorm(-20, 900, overlay), { nx: 0, ny: 1 });
  });
});

describe("arScreenNorm", () => {
  it("subtracts visualViewport offset", () => {
    const vp = {
      offsetLeft: 0,
      offsetTop: 100,
      scale: 1,
      width: 400,
      height: 700,
    };
    assert.deepEqual(arScreenNorm(200, 450, vp, overlay), {
      nx: 0.5,
      ny: 0.5,
    });
  });
});

describe("arUseScreenSpace", () => {
  it("stays on overlay when the visual viewport is identity", () => {
    assert.equal(
      arUseScreenSpace({
        offsetLeft: 0,
        offsetTop: 0,
        scale: 1,
        width: 400,
        height: 800,
      }),
      false,
    );
  });

  it("switches when zoomed or panned", () => {
    assert.equal(
      arUseScreenSpace({
        offsetLeft: 0,
        offsetTop: 80,
        scale: 1,
        width: 400,
        height: 720,
      }),
      true,
    );
    assert.equal(
      arUseScreenSpace({
        offsetLeft: 0,
        offsetTop: 0,
        scale: 2,
        width: 200,
        height: 400,
      }),
      true,
    );
  });
});

describe("arPointerHit", () => {
  beforeEach(() => rememberViewMetrics(null));

  it("uses overlay mapping on an identity viewport", () => {
    const hit = arPointerHit(100, 200, overlay, {
      offsetLeft: 0,
      offsetTop: 0,
      scale: 1,
      width: 400,
      height: 800,
    });
    assert.equal(hit.nx, 0.25);
    assert.equal(hit.ny, 0.25);
    assert.equal(hit.viewX, 100);
    assert.equal(hit.viewY, 200);
  });

  it("uses screen mapping when the URL bar offsets the visual viewport", () => {
    const hit = arPointerHit(
      200,
      450,
      overlay,
      { offsetLeft: 0, offsetTop: 100, scale: 1, width: 400, height: 700 },
      { width: 1080, height: 1920, ready: true },
    );
    assert.equal(hit.nx, 0.5);
    assert.equal(hit.ny, 0.5);
    assert.equal(hit.viewX, 540);
    assert.equal(hit.viewY, 960);
  });

  it("falls back to overlay size when native metrics are not ready", () => {
    const hit = arPointerHit(200, 400, overlay, null, {
      width: 0,
      height: 0,
      ready: false,
    });
    assert.equal(hit.viewX, 200);
    assert.equal(hit.viewY, 400);
  });
});

describe("arIsTap", () => {
  it("accepts travel within slop", () => {
    assert.equal(arIsTap(AR_TAP_SLOP_PX), true);
    assert.equal(arIsTap(AR_TAP_SLOP_PX + 1), false);
    assert.equal(arIsTap(Number.NaN), false);
  });
});

describe("view metrics cache", () => {
  beforeEach(() => rememberViewMetrics(null));

  it("keeps only a ready native size", () => {
    rememberViewMetrics({ width: 0, height: 800, ready: true });
    assert.equal(lastViewMetrics(), null);
    rememberViewMetrics({ width: 1080, height: 1920, ready: true });
    assert.deepEqual(lastViewMetrics(), {
      width: 1080,
      height: 1920,
      ready: true,
    });
  });

  it("refresh remembers a successful probe", async () => {
    const metrics = await refreshArViewMetrics(async () => ({
      width: 800,
      height: 1200,
      ready: true,
    }));
    assert.equal(metrics.ready, true);
    assert.equal(lastViewMetrics()?.width, 800);
  });

  it("refresh clears on failure", async () => {
    rememberViewMetrics({ width: 10, height: 10, ready: true });
    const metrics = await refreshArViewMetrics(async () => {
      throw new Error("plugin down");
    });
    assert.equal(metrics.ready, false);
    assert.equal(lastViewMetrics(), null);
  });
});
