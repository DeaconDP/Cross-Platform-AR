import { WebPlugin } from "@capacitor/core";
import type {
  CubeARFlickerState,
  CubeARPlugin,
  CubeARSessionOptions,
  CubeARSupportResult,
  CubeARTapOptions,
  CubeARTapResult,
} from "./definitions";

export class CubeARWeb extends WebPlugin implements CubeARPlugin {
  async isSupported(): Promise<CubeARSupportResult> {
    return { supported: false, backend: "none" };
  }

  async startSession(_options: CubeARSessionOptions): Promise<void> {
    throw this.unavailable("Native AR is only available inside Capacitor shells.");
  }

  async stopSession(): Promise<void> {
    // no-op
  }

  async onScreenTap(_options: CubeARTapOptions): Promise<CubeARTapResult> {
    return { placed: false, count: 0 };
  }

  async flickerState(): Promise<CubeARFlickerState> {
    return { kind: "ok", p2p: 0, valid: false };
  }
}
