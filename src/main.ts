import "./style.css";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { startPreview } from "./scene";
import { isWebXRSupported, startWebXR } from "./ar-webxr";
import { isQuickLookSupported, prepareQuickLook } from "./ar-quicklook";
import {
  isNativeARSupported,
  nativeARErrorMessage,
  startNativeAR,
} from "./ar-native";
import type { CubeARTechnique } from "cube-ar";
import { buildCompatSnapshot } from "./ar-debug";
import { readOverlayChrome } from "./ar-gestures";

const $ = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

const pathsRoot = $("ar-paths");
const status = $("status");
const overlay = readOverlayChrome();

startPreview($("preview"));

function setStatus(text: string, isError = false): void {
  status.textContent = text;
  status.classList.toggle("error", isError);
}

function arChromeOrigin(): string | null {
  const fromEnv = (import.meta.env.VITE_AR_ORIGIN as string | undefined)?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (
    !Capacitor.isNativePlatform() &&
    window.location.protocol === "https:" &&
    window.location.hostname !== "localhost"
  ) {
    return window.location.origin;
  }
  return null;
}

interface PathDef {
  id: string;
  label: string;
  title: string;
  detail: string;
  primary?: boolean;
  run: () => Promise<void>;
}

function renderPaths(paths: PathDef[]): void {
  pathsRoot.replaceChildren();
  for (const path of paths) {
    const row = document.createElement("article");
    row.className = "path-row";
    row.dataset.pathId = path.id;

    const meta = document.createElement("div");
    meta.className = "path-meta";

    const tag = document.createElement("p");
    tag.className = "path-tag";
    tag.textContent = path.label;

    const detail = document.createElement("p");
    detail.className = "path-detail";
    detail.textContent = path.detail;

    meta.append(tag, detail);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = path.primary ? "cta" : "cta cta-secondary";
    btn.textContent = path.title;
    btn.addEventListener("click", () => void path.run());

    row.append(meta, btn);
    pathsRoot.append(row);
  }
}

function setPathBusy(pathId: string, busy: boolean, label?: string): void {
  const row = pathsRoot.querySelector<HTMLElement>(`[data-path-id="${pathId}"]`);
  const btn = row?.querySelector<HTMLButtonElement>("button");
  if (!btn) return;
  btn.disabled = busy;
  btn.setAttribute("aria-busy", String(busy));
  if (label) btn.textContent = label;
}

function resetPathButton(pathId: string, title: string): void {
  const row = pathsRoot.querySelector<HTMLElement>(`[data-path-id="${pathId}"]`);
  const btn = row?.querySelector<HTMLButtonElement>("button");
  if (!btn) return;
  btn.disabled = false;
  btn.removeAttribute("aria-busy");
  btn.textContent = title;
}

async function init(): Promise<void> {
  const webxrSupported = await isWebXRSupported();
  const quickLookSupported = isQuickLookSupported();
  const native = await isNativeARSupported();
  const isCapAndroid =
    Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
  const origin = arChromeOrigin();
  const paths: PathDef[] = [];
  let primaryAssigned = false;

  const markPrimary = (path: PathDef): PathDef => {
    if (!primaryAssigned) {
      path.primary = true;
      primaryAssigned = true;
    }
    return path;
  };

  if (native.supported) {
    const backendLabel = native.backend === "arkit" ? "ARKit" : "ARCore";
    paths.push(
      markPrimary({
        id: "native",
        label: `Native · ${backendLabel}`,
        title: "Start native AR",
        detail: "In-app ARKit/ARCore — place one cube, then rotate, scale, move.",
        run: async () => {
          const snapshot = buildCompatSnapshot({
            arPath: "native",
            webxrSupported,
            quickLookSupported,
            arOrigin: origin,
          });
          setPathBusy("native", true, "Starting camera\u2026");
          try {
            await startNativeAR(overlay, snapshot);
            setStatus("Native AR session ended \u2014 pick another path anytime.");
          } catch (err) {
            setStatus(nativeARErrorMessage(err), true);
          } finally {
            overlay.root.hidden = true;
            resetPathButton("native", "Start native AR");
          }
        },
      }),
    );

    if (native.supported && native.backend === "arcore") {
      const androidTechniques: {
        id: string;
        technique: CubeARTechnique;
        title: string;
        detail: string;
      }[] = [
        {
          id: "native-points",
          technique: "points",
          title: "Feature points",
          detail: "ARCore point cloud under the cube session.",
        },
        {
          id: "native-depth",
          technique: "depth",
          title: "Depth peek",
          detail: "ARCore depth heatmap. Needs a depth-capable phone.",
        },
        {
          id: "native-light",
          technique: "light",
          title: "Light estimate",
          detail: "Ambient intensity drives the cube light.",
        },
        {
          id: "native-image",
          technique: "image",
          title: "Image marker",
          detail: "Print the bundled marker about 16 cm wide.",
        },
        {
          id: "native-face",
          technique: "face",
          title: "Face mesh",
          detail: "Front camera face mesh and a cube on the nose.",
        },
      ];

      for (const row of androidTechniques) {
        paths.push({
          id: row.id,
          label: `Native · ARCore · ${row.title}`,
          title: row.title,
          detail: row.detail,
          run: async () => {
            const snapshot = buildCompatSnapshot({
              arPath: "native",
              webxrSupported,
              quickLookSupported,
              arOrigin: origin,
            });
            setPathBusy(row.id, true, "Starting camera\u2026");
            try {
              await startNativeAR(overlay, snapshot, row.technique);
              setStatus("Native AR session ended \u2014 pick another path anytime.");
            } catch (err) {
              setStatus(nativeARErrorMessage(err), true);
            } finally {
              overlay.root.hidden = true;
              resetPathButton(row.id, row.title);
            }
          },
        });
      }
    }
  }

  if (webxrSupported) {
    paths.push(
      markPrimary({
        id: "webxr",
        label: "WebXR · Chrome",
        title: "Start WebXR AR",
        detail: "immersive-ar + hit-test — place one cube, then manipulate.",
        run: async () => {
          const snapshot = buildCompatSnapshot({
            arPath: "webxr",
            webxrSupported,
            quickLookSupported,
            arOrigin: origin,
          });
          setPathBusy("webxr", true, "Starting camera\u2026");
          overlay.root.hidden = false;
          try {
            await startWebXR(overlay, snapshot);
            setStatus("WebXR session ended \u2014 pick another path anytime.");
          } catch {
            setStatus("Couldn't start WebXR. Allow camera access and try again.", true);
          } finally {
            overlay.root.hidden = true;
            resetPathButton("webxr", "Start WebXR AR");
          }
        },
      }),
    );
  } else if (isCapAndroid) {
    paths.push(
      markPrimary({
        id: "chrome",
        label: "WebXR · Chrome handoff",
        title: "Open in Chrome for AR",
        detail: "Capacitor WebView can't run immersive-ar \u2014 same WebXR flow in Chrome.",
        run: async () => {
          if (!origin) {
            setStatus(
              "Set VITE_AR_ORIGIN to your HTTPS URL (LAN or public), rebuild, then try again.",
              true,
            );
            return;
          }
          setPathBusy("chrome", true, "Opening Chrome\u2026");
          try {
            await Browser.open({ url: origin });
            setStatus("Continue in Chrome \u2014 allow camera, then tap Start WebXR AR.");
          } catch {
            setStatus("Couldn't open Chrome. Open this URL yourself: " + origin, true);
          } finally {
            resetPathButton("chrome", "Open in Chrome for AR");
          }
        },
      }),
    );
  }

  if (quickLookSupported) {
    const qlAnchor = document.createElement("a");
    qlAnchor.hidden = true;
    const qlImg = document.createElement("img");
    qlImg.src = "./icon.svg";
    qlImg.alt = "";
    qlImg.width = 20;
    qlImg.height = 20;
    qlAnchor.append(qlImg);
    document.body.append(qlAnchor);

    paths.push(
      markPrimary({
        id: "quicklook",
        label: "Quick Look · USDZ",
        title: "View in AR",
        detail: "Runtime USDZ export into Apple's native AR viewer.",
        run: async () => {
          setPathBusy("quicklook", true, "Preparing model\u2026");
          try {
            if (!qlAnchor.href) {
              await prepareQuickLook(qlAnchor);
            }
            qlAnchor.click();
            setStatus("AR Quick Look opened \u2014 tap a surface to place the cube.");
          } catch {
            setStatus("Couldn't prepare the AR model. Reload to try again.", true);
          } finally {
            resetPathButton("quicklook", "View in AR");
          }
        },
      }),
    );

    // Eagerly prepare USDZ so Quick Look tap is instant.
    prepareQuickLook(qlAnchor).catch(() => {
      /* row handler shows error on click */
    });
  }

  if (paths.length === 0) {
    buildCompatSnapshot({
      arPath: "preview-only",
      webxrSupported,
      quickLookSupported,
      arOrigin: origin,
    });
    setStatus(
      "AR needs a phone \u2014 try the Capacitor app or mobile Safari/Chrome. " +
        "Meanwhile, drag the cube above to inspect it.",
    );
    return;
  }

  renderPaths(paths);

  const labels = paths.map((p) => p.label).join(" · ");
  setStatus(`${paths.length} AR path${paths.length === 1 ? "" : "s"} available: ${labels}.`);
}

init();

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  if (!Capacitor.isNativePlatform()) {
    navigator.serviceWorker.register("./sw.js");
  }
}
