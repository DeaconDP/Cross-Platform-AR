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
    async palmState() {
        return { kind: "ok", fat: false, smear: false, valid: false };
    }
    async notePalm() {
        return { kind: "ok", fat: false, smear: false, valid: false };
    }
}
