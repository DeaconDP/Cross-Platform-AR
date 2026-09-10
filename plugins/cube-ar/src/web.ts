import { WebPlugin } from "@capacitor/core";
import type {
  CubeARPlugin,
  CubeARSessionOptions,
  CubeARSupportResult,
  CubeARPalmState,
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

  async palmState(): Promise<CubeARPalmState> {
    return { kind: "ok", fat: false, smear: false, valid: false };
  }

  async notePalm(): Promise<CubeARPalmState> {
    return { kind: "ok", fat: false, smear: false, valid: false };
  }
}
