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

export type CubeARNetState = {
  supported?: boolean;
  online?: boolean;
  type?: "wifi" | "cellular" | "ethernet" | "none" | "unknown";
  downlinkMbps?: number | null;
  rttMs?: number | null;
  captive?: boolean;
  constrained?: boolean;
  kind?: string;
};

export interface CubeARPlugin {
  isSupported(): Promise<CubeARSupportResult>;
  startSession(options: CubeARSessionOptions): Promise<void>;
  stopSession(): Promise<void>;
  onScreenTap(options: CubeARTapOptions): Promise<CubeARTapResult>;
  netState(): Promise<CubeARNetState>;
  addListener(
    eventName: "trackingChanged",
    listenerFunc: (event: CubeARTrackingEvent) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "sessionEnded",
    listenerFunc: () => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "netChanged",
    listenerFunc: (event: CubeARNetState) => void,
  ): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}
