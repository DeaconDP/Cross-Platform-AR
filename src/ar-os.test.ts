import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  arOsCoach,
  arOsHttpsFileUrl,
  arOsNativeFailFallback,
  arOsQuickLookSupported,
  arOsResolve,
  arOsSceneViewerHref,
  arOsSceneViewerSupported,
  arOsWebXrSupported,
} from "./ar-os.ts";

describe("arOsResolve", () => {
  it("prefers native when the plugin is ready", () => {
    assert.equal(
      arOsResolve({
        native: true,
        webxr: true,
        quicklook: true,
        sceneviewer: true,
        camera: true,
      }),
      "native",
    );
  });

  it("keeps image-mode on orbit when native is missing", () => {
    assert.equal(
      arOsResolve({
        native: false,
        webxr: true,
        quicklook: true,
        sceneviewer: true,
        imageMode: true,
      }),
      "orbit",
    );
  });

  it("uses WebXR on a browser PWA before system viewers", () => {
    assert.equal(
      arOsResolve({
        native: false,
        webxr: true,
        quicklook: true,
        sceneviewer: true,
      }),
      "webxr",
    );
  });

  it("skips WebXR inside a Capacitor shell", () => {
    assert.equal(
      arOsResolve({
        native: false,
        webxr: true,
        quicklook: true,
        sceneviewer: false,
        nativeShell: true,
      }),
      "quicklook",
    );
  });

  it("falls through Quick Look → Scene Viewer → camera → orbit", () => {
    assert.equal(
      arOsResolve({
        native: false,
        webxr: false,
        quicklook: true,
        sceneviewer: true,
      }),
      "quicklook",
    );
    assert.equal(
      arOsResolve({
        native: false,
        webxr: false,
        quicklook: false,
        sceneviewer: true,
      }),
      "sceneviewer",
    );
    assert.equal(
      arOsResolve({
        native: false,
        webxr: false,
        quicklook: false,
        sceneviewer: false,
        camera: true,
      }),
      "camera",
    );
    assert.equal(
      arOsResolve({
        native: false,
        webxr: false,
        quicklook: false,
        sceneviewer: false,
      }),
      "orbit",
    );
  });
});

describe("arOsNativeFailFallback", () => {
  it("returns a real AR path, not orbit", () => {
    assert.equal(
      arOsNativeFailFallback({
        webxr: true,
        quicklook: false,
        sceneviewer: false,
      }),
      "webxr",
    );
    assert.equal(
      arOsNativeFailFallback({
        webxr: false,
        quicklook: false,
        sceneviewer: false,
      }),
      null,
    );
  });
});

describe("arOs detectors", () => {
  it("accepts https model files only", () => {
    assert.equal(
      arOsHttpsFileUrl("https://museum.example/content/models/ar/skull.glb"),
      true,
    );
    assert.equal(arOsHttpsFileUrl("https://museum.example/foo.usdz"), true);
    assert.equal(arOsHttpsFileUrl("http://museum.example/skull.glb"), false);
    assert.equal(arOsHttpsFileUrl("https://museum.example/readme.txt"), false);
    assert.equal(arOsHttpsFileUrl("not a url"), false);
  });

  it("detects Quick Look from relList", () => {
    assert.equal(arOsQuickLookSupported({ supports: (rel) => rel === "ar" }), true);
    assert.equal(arOsQuickLookSupported({ supports: () => false }), false);
    assert.equal(arOsQuickLookSupported(null), false);
  });

  it("limits Scene Viewer to Android", () => {
    assert.equal(
      arOsSceneViewerSupported(
        "Mozilla/5.0 (Linux; Android 14) Chrome/120",
        "android",
      ),
      true,
    );
    assert.equal(
      arOsSceneViewerSupported("Mozilla/5.0 (iPhone; CPU iPhone OS 18)", "ios"),
      false,
    );
    assert.equal(arOsSceneViewerSupported("Mozilla/5.0 (Macintosh)", "web"), false);
  });

  it("builds a Scene Viewer href", () => {
    const href = arOsSceneViewerHref(
      "https://museum.example/a.glb",
      "Australopithecus",
    );
    const url = new URL(href);
    assert.equal(url.hostname, "arvr.google.com");
    assert.equal(url.searchParams.get("file"), "https://museum.example/a.glb");
    assert.equal(url.searchParams.get("mode"), "ar_preferred");
    assert.equal(url.searchParams.get("title"), "Australopithecus");
  });

  it("probes WebXR immersive-ar", async () => {
    assert.equal(await arOsWebXrSupported(null), false);
    assert.equal(
      await arOsWebXrSupported({
        isSessionSupported: async (mode) => mode === "immersive-ar",
      }),
      true,
    );
    assert.equal(
      await arOsWebXrSupported({
        isSessionSupported: async () => {
          throw new Error("blocked");
        },
      }),
      false,
    );
  });
});

describe("arOsCoach", () => {
  it("speaks path-specific copy", () => {
    assert.match(arOsCoach("webxr", "place"), /surface/i);
    assert.match(arOsCoach("quicklook", "place"), /Apple/i);
    assert.match(arOsCoach("sceneviewer", "place"), /Google/i);
    assert.match(arOsCoach("orbit", "scan"), /phone app/i);
    assert.match(arOsCoach("native", "scan"), /plaque/i);
    assert.match(arOsCoach("camera", "emily"), /floor/i);
    assert.match(arOsCoach("orbit", "cubes"), /Chrome/i);
  });
});
