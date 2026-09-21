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
        return { placed: false };
    }
    async moveScreen(_options) {
        return { moved: false };
    }
    async reposition() {
        // no-op
    }
    async recenter() {
        // no-op
    }
    async rotate(_options) {
        // no-op
    }
    async setScale(_options) {
        // no-op
    }
    async debugPlaceFront() {
        return { placed: false, error: "unavailable" };
    }
}
