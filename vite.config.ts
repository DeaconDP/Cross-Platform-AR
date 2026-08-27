import { defineConfig } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";

// Sticky project port — do not change without updating README/run scripts.
// HTTPS (self-signed) is required: WebXR + camera need a secure context,
// including when testing from a phone over LAN.
const PORT = 5188;

export default defineConfig({
  // Relative asset paths so Capacitor (file/capacitor scheme) resolves bundles.
  base: "./",
  plugins: [basicSsl()],
  server: {
    port: PORT,
    strictPort: true,
    host: true,
  },
  preview: {
    port: PORT,
    strictPort: true,
    host: true,
  },
});
