import { WebPlugin } from "@capacitor/core";
import type {
  CubeARPlugin,
  CubeARPointOptions,
  CubeARSessionOptions,
  CubeARSupportResult,
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

  async onScreenTap(_options: CubeARPointOptions): Promise<CubeARTapResult> {
    return { placed: false };
  }

  async moveScreen(_options: CubeARPointOptions): Promise<{ moved: boolean }> {
    return { moved: false };
  }

  async reposition(): Promise<void> {
    // no-op
  }

  async recenter(): Promise<void> {
    // no-op
  }

  async rotate(_options: { dx: number; dy: number }): Promise<void> {
    // no-op
  }

  async setScale(_options: { factor: number }): Promise<void> {
    // no-op
  }

  async debugPlaceFront(): Promise<{ placed: boolean; error?: string }> {
    return { placed: false, error: "unavailable" };
  }
}
