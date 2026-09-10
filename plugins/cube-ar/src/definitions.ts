import type { PluginListenerHandle } from "@capacitor/core";

export type CubeARBackend = "arkit" | "arcore" | "none";

export interface CubeARSupportResult {
  supported: boolean;
  backend: CubeARBackend;
}

export interface CubeARSessionOptions {
  cubeSizeM: number;
  colorHex: string;
}

export interface CubeARTapOptions {
  x: number;
  y: number;
}

export interface CubeARTapResult {
  placed: boolean;
  count: number;
}

export interface CubeARTrackingEvent {
  state: "initializing" | "ready" | "limited" | "unavailable";
  message?: string;
}

export interface CubeARDimState {
  kind: string;
  night: boolean;
  extraDim: boolean;
  reduceWhite: boolean;
  brightness: number;
  valid: boolean;
}

export interface CubeARPlugin {
  isSupported(): Promise<CubeARSupportResult>;
  startSession(options: CubeARSessionOptions): Promise<void>;
  stopSession(): Promise<void>;
  onScreenTap(options: CubeARTapOptions): Promise<CubeARTapResult>;
  dimState(): Promise<CubeARDimState>;
  addListener(
    eventName: "trackingChanged",
    listenerFunc: (event: CubeARTrackingEvent) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "sessionEnded",
    listenerFunc: () => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "dimChanged",
    listenerFunc: (event: CubeARDimState) => void,
  ): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}
