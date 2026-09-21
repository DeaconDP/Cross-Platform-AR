import { WebPlugin } from "@capacitor/core";
import type { CubeARPlugin, CubeARPointOptions, CubeARSessionOptions, CubeARSupportResult, CubeARTapResult } from "./definitions";
export declare class CubeARWeb extends WebPlugin implements CubeARPlugin {
    isSupported(): Promise<CubeARSupportResult>;
    startSession(_options: CubeARSessionOptions): Promise<void>;
    stopSession(): Promise<void>;
    onScreenTap(_options: CubeARPointOptions): Promise<CubeARTapResult>;
    moveScreen(_options: CubeARPointOptions): Promise<{
        moved: boolean;
    }>;
    reposition(): Promise<void>;
    recenter(): Promise<void>;
    rotate(_options: {
        dx: number;
        dy: number;
    }): Promise<void>;
    setScale(_options: {
        factor: number;
    }): Promise<void>;
    debugPlaceFront(): Promise<{
        placed: boolean;
        error?: string;
    }>;
}
