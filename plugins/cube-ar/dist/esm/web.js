import { WebPlugin } from "@capacitor/core";
export class CubeARWeb extends WebPlugin {
    async isSupported() {
        return { supported: false, backend: "none" };
    }
    async startSession(_options) {
        throw this.unavailable("Native AR is only available inside Capacitor shells.");
    }
    async stopSession() {
        // no-op
    }
    async onScreenTap(_options) {
        return { placed: false, count: 0 };
    }
    async dimState() {
        return {
            kind: "ok",
            night: false,
            extraDim: false,
            reduceWhite: false,
            brightness: 1,
            valid: false,
        };
    }
}
