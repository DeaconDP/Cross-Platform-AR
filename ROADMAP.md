# Roadmap

## v0.1 — Cube demo (current)

Tap-to-place cube on Android (WebXR) and iOS (AR Quick Look), inline preview elsewhere. Local HTTPS dev server on sticky port 5188. Capacitor shells package the same web app with native camera permission strings; Android native routes AR into Chrome because System WebView lacks `immersive-ar`.

## Ideas / later

- Deploy to a public HTTPS host so phones don't need the LAN + self-signed cert dance (also unblocks Cap Android `VITE_AR_ORIGIN` without LAN certs)
- Cube color/size picker before placing
- Persist placed cubes across sessions (WebXR anchors)

## Deferred

- **Native WebXR inside Capacitor Android WebView** (2026-08-27) — Android System WebView does not expose WebXR `immersive-ar`; Cap shell uses Chrome Custom Tabs instead. Revisit if/when WebView gains AR. See `src/main.ts` Android Chrome handoff.
