import { WebPlugin } from "@capacitor/core";
import type {
  CubeARPlugin,
  CubeARSessionOptions,
  CubeARSupportResult,
  CubeARTapOptions,
  CubeARTapResult,
  CubeARFreezeState,
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

  async freezeState(): Promise<CubeARFreezeState> {
    return {
      live: false,
      ageMs: -1,
      sessionMs: -1,
      stuck: false,
      kind: "ok",
      blockPlace: false,
      placed: false,
    };
  }
}
