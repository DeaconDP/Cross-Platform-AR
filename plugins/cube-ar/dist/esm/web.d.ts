import { WebPlugin } from "@capacitor/core";
import type { CubeARLiftState, CubeARPlugin, CubeARSessionOptions, CubeARSupportResult, CubeARTapOptions, CubeARTapResult } from "./definitions";
export declare class CubeARWeb extends WebPlugin implements CubeARPlugin {
    isSupported(): Promise<CubeARSupportResult>;
    startSession(_options: CubeARSessionOptions): Promise<void>;
    stopSession(): Promise<void>;
    onScreenTap(_options: CubeARTapOptions): Promise<CubeARTapResult>;
    liftState(): Promise<CubeARLiftState>;
}
