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
    async imuState() {
        return {
            live: false,
            hasAccel: false,
            hasGyro: false,
            gravityMag: -1,
            kind: "ok",
            denied: false,
            placed: false,
        };
    }
}
