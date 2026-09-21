import type { PluginListenerHandle } from "@capacitor/core";

export type CubeARBackend = "arkit" | "arcore" | "none";

export type CubeARTechnique = "place" | "points" | "depth" | "light" | "image" | "face";

export interface CubeARSupportResult {
  supported: boolean;
  backend: CubeARBackend;
}

export interface CubeARSessionOptions {
  cubeSizeM: number;
  colorHex: string;
  /** Omitted defaults to `"place"`. Android ARCore only for non-place techniques. */
  technique?: CubeARTechnique;
}

export interface CubeARPointOptions {
  /** Native view pixels on Android; points on iOS. */
  x: number;
  /** Native view pixels on Android; points on iOS. */
  y: number;
}

export interface CubeARTapResult {
  placed: boolean;
}

export interface CubeARTrackingEvent {
  state: "initializing" | "ready" | "limited" | "unavailable";
  message?: string;
}

export interface CubeARPlugin {
  isSupported(): Promise<CubeARSupportResult>;
  startSession(options: CubeARSessionOptions): Promise<void>;
  stopSession(): Promise<void>;
  onScreenTap(options: CubeARPointOptions): Promise<CubeARTapResult>;
  moveScreen(options: CubeARPointOptions): Promise<{ moved: boolean }>;
  reposition(): Promise<void>;
  recenter(): Promise<void>;
  rotate(options: { dx: number; dy: number }): Promise<void>;
  setScale(options: { factor: number }): Promise<void>;
  /** QA: place cube ~0.55 m in front of camera without a plane hit. */
  debugPlaceFront(): Promise<{ placed: boolean; error?: string; tracking?: string }>;

  addListener(
    eventName: "trackingChanged",
    listenerFunc: (event: CubeARTrackingEvent) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "sessionEnded",
    listenerFunc: () => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "placed",
    listenerFunc: () => void,
  ): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}
