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
    async memState() {
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
