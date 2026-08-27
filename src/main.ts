import "./style.css";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { startPreview } from "./scene";
import { isWebXRSupported, startWebXR } from "./ar-webxr";
import { isQuickLookSupported, prepareQuickLook } from "./ar-quicklook";

const $ = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

const cta = $<HTMLButtonElement>("cta");
const quickLookCta = $<HTMLAnchorElement>("cta-quicklook");
const quickLookLabel = $("cta-quicklook-label");
const status = $("status");
const overlay = {
  root: $("ar-overlay"),
  count: $("cube-count"),
  hint: $("ar-hint"),
  exit: $("exit-ar"),
};

startPreview($("preview"));

function setStatus(text: string, isError = false): void {
  status.textContent = text;
  status.classList.toggle("error", isError);
}

function arChromeOrigin(): string | null {
  const fromEnv = (import.meta.env.VITE_AR_ORIGIN as string | undefined)?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  // Already running in a real browser on HTTPS (LAN or public) — reuse it.
  if (
    !Capacitor.isNativePlatform() &&
    window.location.protocol === "https:" &&
    window.location.hostname !== "localhost"
  ) {
    return window.location.origin;
  }
  return null;
}

/** Android System WebView cannot run WebXR immersive-ar — open Chrome instead. */
async function initAndroidChromeFallback(): Promise<void> {
  const origin = arChromeOrigin();
  cta.hidden = false;
  cta.textContent = "Open in Chrome for AR";

  if (!origin) {
    setStatus(
      "Set VITE_AR_ORIGIN to your HTTPS URL (LAN or public), rebuild, then open Chrome for AR.",
      true,
    );
    cta.disabled = true;
    return;
  }

  setStatus(
    "This app shell can't run WebXR. Chrome will open the same experience with camera AR.",
  );

  cta.addEventListener("click", async () => {
    cta.disabled = true;
    cta.setAttribute("aria-busy", "true");
    cta.textContent = "Opening Chrome\u2026";
    try {
      await Browser.open({ url: origin });
      setStatus("Continue in Chrome — allow camera, then tap Start AR.");
    } catch {
      setStatus("Couldn't open Chrome. Open this URL yourself: " + origin, true);
    } finally {
      cta.disabled = false;
      cta.removeAttribute("aria-busy");
      cta.textContent = "Open in Chrome for AR";
    }
  });
}

async function initWebXRPath(): Promise<void> {
  cta.hidden = false;
  setStatus("Cubes place on real surfaces via your camera.");

  cta.addEventListener("click", async () => {
    cta.disabled = true;
    cta.setAttribute("aria-busy", "true");
    cta.textContent = "Starting camera\u2026";
    overlay.root.hidden = false;
    try {
      await startWebXR(overlay); // resolves when the AR session ends
      setStatus("AR session ended \u2014 start again anytime.");
    } catch {
      setStatus("Couldn't start AR. Allow camera access and try again.", true);
    } finally {
      overlay.root.hidden = true;
      cta.disabled = false;
      cta.removeAttribute("aria-busy");
      cta.textContent = "Start AR";
    }
  });
}

async function initQuickLookPath(): Promise<void> {
  quickLookCta.hidden = false;
  quickLookCta.setAttribute("aria-busy", "true");
  setStatus("Generating the cube model\u2026");
  try {
    await prepareQuickLook(quickLookCta);
    quickLookCta.removeAttribute("aria-disabled");
    quickLookCta.removeAttribute("aria-busy");
    quickLookLabel.textContent = "View in AR";
    setStatus("Opens AR Quick Look \u2014 tap a surface to place the cube.");
  } catch {
    quickLookCta.removeAttribute("aria-busy");
    setStatus("Couldn't prepare the AR model. Reload to try again.", true);
  }
}

async function init(): Promise<void> {
  if (await isWebXRSupported()) {
    await initWebXRPath();
    return;
  }

  // Capacitor Android WebView: no immersive-ar — hand off to Chrome.
  if (
    Capacitor.isNativePlatform() &&
    Capacitor.getPlatform() === "android"
  ) {
    await initAndroidChromeFallback();
    return;
  }

  if (isQuickLookSupported()) {
    await initQuickLookPath();
    return;
  }

  setStatus(
    "AR needs a phone \u2014 Android Chrome or iPhone Safari. " +
      "Meanwhile, drag the cube above to inspect it.",
  );
}

init();

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  // Skip SW inside native shells; Cap serves the bundle directly.
  if (!Capacitor.isNativePlatform()) {
    navigator.serviceWorker.register("./sw.js");
  }
}
