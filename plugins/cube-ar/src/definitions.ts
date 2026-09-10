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
  explore?: boolean;
}

export interface CubeARReaderState {
  kind?: string;
  explore?: boolean;
  speak?: boolean;
  valid?: boolean;
}

export interface CubeARTrackingEvent {
  state: "initializing" | "ready" | "limited" | "unavailable";
  message?: string;
}

export interface CubeARPlugin {
  isSupported(): Promise<CubeARSupportResult>;
  startSession(options: CubeARSessionOptions): Promise<void>;
  stopSession(): Promise<void>;
  onScreenTap(options: CubeARTapOptions): Promise<CubeARTapResult>;
  readerState(): Promise<CubeARReaderState>;
  addListener(
    eventName: "trackingChanged",
    listenerFunc: (event: CubeARTrackingEvent) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "sessionEnded",
    listenerFunc: () => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "readerChanged",
    listenerFunc: (event: CubeARReaderState) => void,
  ): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}
