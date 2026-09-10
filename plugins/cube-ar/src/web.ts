import { WebPlugin } from "@capacitor/core";
import type {
  CubeARMemState,
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

  async memState(): Promise<CubeARMemState> {
    return {
      live: false,
      bytesAvail: -1,
      bytesTotal: -1,
      usedRatio: -1,
      warned: false,
      kind: "ok",
      lowFx: false,
      placed: false,
    };
  }
}
