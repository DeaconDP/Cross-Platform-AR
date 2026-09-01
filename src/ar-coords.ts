/** Native backends expect different tap spaces. */
export type NativeTapPlatform = "ios" | "android" | "web";

export type NativeTapInput = {
  clientX: number;
  clientY: number;
  platform: NativeTapPlatform;
  devicePixelRatio?: number;
};

/**
 * Map CSS pointer coords to the native AR view.
 * ARKit raycastQuery uses UIKit points (≈ CSS px).
 * ARCore SceneView hitTest uses view pixels (CSS × devicePixelRatio).
 */
export function screenToNativeTap(input: NativeTapInput): { x: number; y: number } {
  const dpr = input.devicePixelRatio ?? 1;
  if (input.platform === "android") {
    return { x: input.clientX * dpr, y: input.clientY * dpr };
  }
  return { x: input.clientX, y: input.clientY };
}

export function platformFromCapacitor(platform: string): NativeTapPlatform {
  if (platform === "ios" || platform === "android") return platform;
  return "web";
}
