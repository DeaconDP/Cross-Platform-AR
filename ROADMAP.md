# Roadmap

## v0.1 — Cube demo

Tap-to-place cube on Android (WebXR) and iOS (AR Quick Look), inline preview elsewhere. Local HTTPS dev server on sticky port 5188. Capacitor shells with camera permissions; Android Cap routes WebXR into Chrome because System WebView lacks `immersive-ar`.

## v0.2 — AR path showcase (current)

Landing screen lists every available AR route with labels (Native ARKit/ARCore, WebXR, Quick Look, Chrome handoff). Local `cube-ar` Capacitor plugin for in-app native tap-to-place on iOS and Android. Session health 2026-09-02: wall + table planes, memory-pressure reticle drop, slipped-cube coaching.

## Ideas / later

- Deploy to a public HTTPS host so phones don't need the LAN + self-signed cert dance (also unblocks Cap Android `VITE_AR_ORIGIN` without LAN certs)
- Cube color/size picker before placing
- Persist placed cubes across sessions (WebXR anchors + native anchor APIs)

## Deferred

- **WebXR polyfill inside Capacitor Android WebView** (2026-08-27) — no mature Cap 7 plugin; Chrome handoff + native ARCore cover the showcase. Revisit if WebView gains `immersive-ar` or a stable polyfill lands.
- **Native WebXR inside Capacitor Android WebView via cordova-plugin-webxr port** — experimental; documented as future option only.
