import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isDocumentHidden } from "./ar-session-life.ts";

describe("isDocumentHidden", () => {
  it("pauses when the tab is hidden", () => {
    assert.equal(isDocumentHidden("hidden"), true);
  });

  it("stays live when visible", () => {
    assert.equal(isDocumentHidden("visible"), false);
  });
});
