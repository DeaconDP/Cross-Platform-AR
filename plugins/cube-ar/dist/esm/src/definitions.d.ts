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
    major?: number;
    pointers?: number;
}
export interface CubeARTapResult {
    placed: boolean;
    count: number;
    fat?: boolean;
    smear?: boolean;
}
export interface CubeARPalmState {
    kind: string;
    fat: boolean;
    smear: boolean;
    valid: boolean;
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
    palmState(): Promise<CubeARPalmState>;
    notePalm(options: { major?: number; pointers?: number }): Promise<CubeARPalmState>;
    addListener(eventName: "trackingChanged", listenerFunc: (event: CubeARTrackingEvent) => void): Promise<PluginListenerHandle>;
    addListener(eventName: "palmChanged", listenerFunc: (event: CubeARPalmState) => void): Promise<PluginListenerHandle>;
    addListener(eventName: "sessionEnded", listenerFunc: () => void): Promise<PluginListenerHandle>;
    removeAllListeners(): Promise<void>;
}
