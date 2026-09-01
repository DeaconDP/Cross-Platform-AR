import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nativeARErrorMessage, webXRErrorMessage } from "./ar-errors.ts";

describe("nativeARErrorMessage", () => {
  it("maps camera permission denials", () => {
    assert.match(nativeARErrorMessage(new Error("Camera permission denied")), /Settings/);
  });

  it("maps ARCore install decline", () => {
    assert.match(nativeARErrorMessage("ARCore install declined"), /Play Store/);
  });

  it("maps session timeout", () => {
    assert.match(nativeARErrorMessage("camera session timed out"), /Force-stop/);
  });

  it("unwraps Failed to start native AR detail", () => {
    assert.equal(
      nativeARErrorMessage("Failed to start native AR: sensor warmup failed"),
      "sensor warmup failed",
    );
  });

  it("falls back for empty / null messages", () => {
    assert.match(nativeARErrorMessage("null"), /Force-stop/);
  });
});

describe("webXRErrorMessage", () => {
  it("maps permission denials", () => {
    assert.match(webXRErrorMessage(new Error("NotAllowedError")), /Allow camera/);
  });

  it("maps missing immersive-ar", () => {
    assert.match(webXRErrorMessage(new Error("NotSupportedError: immersive-ar")), /Chrome/);
  });

  it("maps hit-test gaps", () => {
    assert.match(webXRErrorMessage(new Error("Hit testing unavailable on this device")), /Native AR/);
  });
});
