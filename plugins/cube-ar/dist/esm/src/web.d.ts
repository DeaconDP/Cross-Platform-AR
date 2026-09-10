import { WebPlugin } from "@capacitor/core";
import type { CubeARPalmState, CubeARPlugin, CubeARSessionOptions, CubeARSupportResult, CubeARTapOptions, CubeARTapResult } from "./definitions";
export declare class CubeARWeb extends WebPlugin implements CubeARPlugin {
    isSupported(): Promise<CubeARSupportResult>;
    startSession(_options: CubeARSessionOptions): Promise<void>;
    stopSession(): Promise<void>;
    onScreenTap(_options: CubeARTapOptions): Promise<CubeARTapResult>;
    palmState(): Promise<CubeARPalmState>;
    notePalm(): Promise<CubeARPalmState>;
}
