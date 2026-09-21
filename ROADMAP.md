# Roadmap

## v0.1 — Cube demo

Tap-to-place cube on Android (WebXR) and iOS (AR Quick Look), inline preview elsewhere. Local HTTPS dev server on sticky port 5188. Capacitor shells with camera permissions; Android Cap routes WebXR into Chrome because System WebView lacks `immersive-ar`.

## v0.2 — AR path showcase

Landing screen lists every available AR route with labels (Native ARKit/ARCore, WebXR, Quick Look, Chrome handoff). Local `cube-ar` Capacitor plugin for in-app native tap-to-place on iOS and Android.

## v0.3 — CoH placement + manipulate parity

Port Cradle of Humankind 2026 plane-AR techniques while keeping the procedural green cube:

- Single-object place-then-manipulate (rotate / pinch-scale / two-finger move / reposition / recenter)
- Android Instant Placement (`LOCAL_Y_UP`) + ready on camera TRACKING
- iOS estimated → infinite → geometry raycast cascade + ready on tracking `.normal`
- WebXR viewer-space `offsetRay` place/move + shared overlay gesture chrome
- Transparent WebView `is-ar-native` hardening; `debugPlaceFront` for QA

## v0.4 — Android technique parity (shipped)

Five ARCore teaching techniques on Capacitor Android via one `CubeARTechnique` enum (`place` | `points` | `depth` | `light` | `image` | `face`): feature-point HUD, depth heatmap, ambient light on the cube, bundled image marker, front-camera face mesh + nose cube. iOS native remains place-only.

## Ideas / later

- Deploy to a public HTTPS host so phones don't need the LAN + self-signed cert dance (also unblocks Cap Android `VITE_AR_ORIGIN` without LAN certs)
- Cube color/size picker before placing
- Persist placed cube across sessions (WebXR anchors + native anchor APIs)

## Deferred

- **iOS counterparts for points / depth / light / image / face** (2026-09-21) — Native-Android-AR deferred the same; iOS `startSession` rejects non-`place` techniques. Backlink: `plugins/cube-ar/ios/Sources/CubeArPlugin/CubeArPlugin.swift` (`startSession`).
- **WebXR polyfill inside Capacitor Android WebView** (2026-08-27) — no mature Cap 7 plugin; Chrome handoff + native ARCore cover the showcase. Revisit if WebView gains `immersive-ar` or a stable polyfill lands.
- **Native WebXR inside Capacitor Android WebView via cordova-plugin-webxr port** — experimental; documented as future option only.
- **GLB dual pipeline / meshopt content packs** (2026-09-16) — CoH museum content; Cube AR stays a procedural-cube technique showcase unless Dale asks for a demo GLB.
