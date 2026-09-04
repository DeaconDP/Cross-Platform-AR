import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  arApplyContrastClass,
  arArmContrast,
  arClearContrastClass,
  arContrastClass,
  arContrastCoach,
  arContrastKind,
  arMergeDisplayPrefs,
  arReadCssDisplayPrefs,
  type ArClassList,
  type ArDisplayPrefs,
} from "./ar-contrast.ts";

const css = (
  over: Partial<ArDisplayPrefs> = {},
): ArDisplayPrefs => ({
  contrast: "no-preference",
  reduceTransparency: false,
  differentiateWithoutColor: false,
  forcedColors: false,
  ...over,
});

function fakeRoot() {
  const names = new Set<string>();
  const classList: ArClassList = {
    add: (name) => {
      names.add(name);
    },
    remove: (name) => {
      names.delete(name);
    },
  };
  return { classList, names };
}

describe("arReadCssDisplayPrefs", () => {
  it("defaults when no queries match", () => {
    const prefs = arReadCssDisplayPrefs(() => false);
    assert.deepEqual(prefs, css());
  });

  it("reads prefers-contrast more", () => {
    const prefs = arReadCssDisplayPrefs((q) => q.includes("contrast: more"));
    assert.equal(prefs.contrast, "more");
  });

  it("reads reduced transparency and forced colors", () => {
    const prefs = arReadCssDisplayPrefs(
      (q) => q.includes("reduced-transparency") || q.includes("forced-colors"),
    );
    assert.equal(prefs.reduceTransparency, true);
    assert.equal(prefs.forcedColors, true);
  });
});

describe("arMergeDisplayPrefs", () => {
  it("lifts CSS contrast when native high contrast is on", () => {
    const prefs = arMergeDisplayPrefs(css(), { highContrast: true });
    assert.equal(prefs.contrast, "more");
  });

  it("ORs reduce-transparency and differentiate-without-color", () => {
    const prefs = arMergeDisplayPrefs(css(), {
      reduceTransparency: true,
      differentiateWithoutColor: true,
    });
    assert.equal(prefs.reduceTransparency, true);
    assert.equal(prefs.differentiateWithoutColor, true);
  });
});

describe("arContrastKind", () => {
  it("is ok by default", () => {
    assert.equal(arContrastKind(css()), "ok");
  });

  it("boosts for high contrast or differentiate-without-color", () => {
    assert.equal(arContrastKind(css({ contrast: "more" })), "boost");
    assert.equal(
      arContrastKind(css({ differentiateWithoutColor: true })),
      "boost",
    );
  });

  it("goes opaque for reduce-transparency or forced-colors", () => {
    assert.equal(arContrastKind(css({ reduceTransparency: true })), "opaque");
    assert.equal(arContrastKind(css({ forcedColors: true })), "opaque");
  });

  it("prefers opaque over boost", () => {
    assert.equal(
      arContrastKind(css({ contrast: "more", reduceTransparency: true })),
      "opaque",
    );
  });
});

describe("arContrastCoach + class", () => {
  it("is silent when ok", () => {
    assert.equal(arContrastCoach("ok"), null);
    assert.equal(arContrastClass("ok"), "is-ar-contrast-ok");
  });

  it("explains boost and opaque", () => {
    assert.match(arContrastCoach("boost") ?? "", /High contrast/);
    assert.match(arContrastCoach("opaque") ?? "", /solid/);
  });
});

describe("arApplyContrastClass", () => {
  it("replaces kind classes and clears on dispose helper", () => {
    const root = fakeRoot();
    arApplyContrastClass(root, "boost");
    assert.equal(root.names.has("is-ar-contrast-boost"), true);
    assert.equal(root.names.has("is-ar-contrast"), true);
    arApplyContrastClass(root, "opaque");
    assert.equal(root.names.has("is-ar-contrast-boost"), false);
    assert.equal(root.names.has("is-ar-contrast-opaque"), true);
    arClearContrastClass(root);
    assert.equal(root.names.size, 0);
  });
});

describe("arArmContrast", () => {
  it("applies native prefs then clears on dispose", async () => {
    const root = fakeRoot();
    const kinds: string[] = [];
    const dispose = arArmContrast({
      root,
      matches: () => false,
      getNative: async () => ({ highContrast: true }),
      onChange: (kind) => {
        kinds.push(kind);
      },
    });
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(root.names.has("is-ar-contrast-boost"), true);
    assert.ok(kinds.includes("boost"));
    dispose();
    assert.equal(root.names.size, 0);
  });
});
