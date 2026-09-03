import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AR_ZOOM_LOCK_CLASS,
  AR_ZOOM_SCALE_EPS,
  arZoomCoach,
  arZoomCopy,
  arZoomCreate,
  arZoomIsPageZoomed,
  arZoomLockViewport,
  arZoomNormScale,
  arZoomNoteScale,
  arZoomShouldPreventPageGesture,
} from "./ar-zoom-lock.ts";

describe("arZoomLock", () => {
  it("treats missing or bogus scales as 1×", () => {
    assert.equal(arZoomNormScale(Number.NaN), 1);
    assert.equal(arZoomNormScale(0), 1);
    assert.equal(arZoomNormScale(-2), 1);
    assert.equal(arZoomNormScale(1.25), 1.25);
  });

  it("flags a page that is already pinch-zoomed", () => {
    assert.equal(arZoomIsPageZoomed(1), false);
    assert.equal(arZoomIsPageZoomed(1 + AR_ZOOM_SCALE_EPS), true);
    assert.equal(arZoomIsPageZoomed(1.1), true);
    assert.equal(arZoomIsPageZoomed(0.85), true);
  });

  it("locks the viewport meta to 1×", () => {
    const locked = arZoomLockViewport(
      "width=device-width, initial-scale=1.0, viewport-fit=cover",
    );
    assert.match(locked, /maximum-scale=1/);
    assert.match(locked, /user-scalable=no/);
    assert.match(arZoomLockViewport(null), /user-scalable=no/);
  });

  it("blocks page gestures while armed, and ctrl-wheel always", () => {
    assert.equal(arZoomShouldPreventPageGesture(true, false), true);
    assert.equal(arZoomShouldPreventPageGesture(false, true), true);
    assert.equal(arZoomShouldPreventPageGesture(false, false), false);
  });

  it("coaches only when the page is zoomed, with product copy", () => {
    const s = arZoomCreate(1);
    assert.equal(arZoomCoach("cube", s.scale), null);
    arZoomNoteScale(s, 1.2);
    assert.equal(arZoomCoach("cube", s.scale), arZoomCopy("cube"));
    assert.match(arZoomCopy("coh"), /fossil/i);
    assert.match(arZoomCopy("origins"), /exhibit/i);
    assert.match(arZoomCopy("emily"), /pinch me/i);
    assert.equal(AR_ZOOM_LOCK_CLASS, "is-ar-zoom-lock");
  });
});
