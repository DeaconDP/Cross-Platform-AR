import { WebPlugin } from "@capacitor/core";
import type { CubeARPlugin, CubeARSessionOptions, CubeARSupportResult, CubeARTapOptions, CubeARTapResult } from "./definitions";
export declare class CubeARWeb extends WebPlugin implements CubeARPlugin {
    isSupported(): Promise<CubeARSupportResult>;
    startSession(_options: CubeARSessionOptions): Promise<void>;
    stopSession(): Promise<void>;
    onScreenTap(_options: CubeARTapOptions): Promise<CubeARTapResult>;
    status(): Promise<{
        tracking: "unavailable";
        planeCount: number;
        modelReady: boolean;
        placed: boolean;
    }>;
}
