import * as THREE from "three";
import { USDZExporter } from "three/addons/exporters/USDZExporter.js";
import { createCube } from "./scene";

/**
 * iOS Safari has no WebXR, but `<a rel="ar">` launches AR Quick Look,
 * Apple's native viewer, which does plane detection and tap-to-place.
 */
export function isQuickLookSupported(): boolean {
  const a = document.createElement("a");
  return a.relList.supports("ar");
}

/**
 * Exports the same cube used by the WebXR path to USDZ at runtime
 * (no bundled model asset) and wires it to the given Quick Look anchor.
 * The anchor must contain an <img> child, per Apple's Quick Look contract.
 */
export async function prepareQuickLook(anchor: HTMLAnchorElement): Promise<void> {
  const scene = new THREE.Scene();
  scene.add(createCube());

  const exporter = new USDZExporter();
  const data = await exporter.parseAsync(scene, {
    quickLookCompatible: true,
    ar: {
      anchoring: { type: "plane" },
      planeAnchoring: { alignment: "horizontal" },
    },
  });

  const blob = new Blob([data], { type: "model/vnd.usdz+zip" });
  anchor.href = URL.createObjectURL(blob);
  anchor.rel = "ar";
}
