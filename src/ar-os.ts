/** OS + WebXR AR path picker. Does not start a session. */

export type ArOsKind = "place" | "scan" | "emily" | "cubes";

export type ArOsPath =
  | "native"
  | "webxr"
  | "quicklook"
  | "sceneviewer"
  | "orbit"
  | "camera";

export type ArOsFlags = {
  native: boolean;
  webxr: boolean;
  quicklook: boolean;
  sceneviewer: boolean;
  camera?: boolean;
  /** Image-track exhibits cannot place via WebXR / system viewers. */
  imageMode?: boolean;
  /** Capacitor WebView: immersive-ar usually fails — prefer other paths. */
  nativeShell?: boolean;
};

export function arOsHttpsFileUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    return /\.(glb|gltf|usdz)$/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

export function arOsQuickLookSupported(
  relList?: { supports?: (rel: string) => boolean } | null,
): boolean {
  return !!relList?.supports?.("ar");
}

export function arOsSceneViewerSupported(
  ua: string,
  platform?: string,
): boolean {
  const plat = (platform ?? "").toLowerCase();
  if (plat === "ios") return false;
  const hay = `${ua} ${plat}`.toLowerCase();
  if (/\b(iphone|ipad|ipod)\b/.test(hay)) return false;
  return /\bandroid\b/.test(hay);
}

export function arOsSceneViewerHref(fileUrl: string, title = "AR"): string {
  const next = new URL("https://arvr.google.com/scene-viewer/1.0");
  next.searchParams.set("file", fileUrl);
  next.searchParams.set("mode", "ar_preferred");
  if (title) next.searchParams.set("title", title);
  return next.toString();
}

export async function arOsWebXrSupported(
  xr?: { isSessionSupported?: (mode: string) => Promise<boolean> } | null,
): Promise<boolean> {
  if (!xr?.isSessionSupported) return false;
  try {
    return await xr.isSessionSupported("immersive-ar");
  } catch {
    return false;
  }
}

/**
 * Prefer in-app native, then browser immersive-ar, then the OS viewer,
 * then Emily's camera-plane, then orbit. Image mode stays orbit on web.
 */
export function arOsResolve(flags: ArOsFlags): ArOsPath {
  if (flags.native) return "native";
  if (flags.imageMode) return "orbit";
  if (!flags.nativeShell && flags.webxr) return "webxr";
  if (flags.quicklook) return "quicklook";
  if (flags.sceneviewer) return "sceneviewer";
  if (flags.camera) return "camera";
  if (flags.webxr) return "webxr";
  return "orbit";
}

/** After native start fails — next real AR path, or null to keep the error. */
export function arOsNativeFailFallback(
  flags: Omit<ArOsFlags, "native">,
): ArOsPath | null {
  const next = arOsResolve({ ...flags, native: false });
  return next === "orbit" ? null : next;
}

export function arOsCoach(path: ArOsPath, kind: ArOsKind): string {
  if (kind === "scan") {
    return path === "native"
      ? "Point at the plaque until it locks."
      : "Table-top scan is on the phone app.";
  }
  switch (path) {
    case "native":
      return kind === "cubes"
        ? "Move your phone to find a surface, then tap."
        : kind === "emily"
          ? "Look at the floor, then tap to place."
          : "Scan a flat surface, then tap to place.";
    case "webxr":
      return "Move the phone to find a surface, then tap to place.";
    case "quicklook":
      return "Opens Apple’s AR viewer — tap a table to place.";
    case "sceneviewer":
      return "Opens Google’s AR viewer — tap a table to place.";
    case "camera":
      return "Camera preview — tap the floor to place.";
    default:
      return kind === "cubes"
        ? "3D preview — table-top AR needs the phone app or Chrome."
        : "This is a 3D view. Table-top AR is on the phone app.";
  }
}
