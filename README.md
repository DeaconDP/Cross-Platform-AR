# Cube AR

Cross-platform Augmented Reality demo: place one 3D cube in your room, then rotate, scale, and move it. One PWA codebase, optional Capacitor shells for iOS/Android packaging.

This project is a **showcase of cross-platform AR options** — every supported path is listed on the landing screen with a short label explaining how it works. Placement/manipulate UX matches Cradle of Humankind 2026 (Instant Placement, shared gestures).

## AR paths explained

| Path | Where | How it works |
| --- | --- | --- |
| **Native · ARKit** | Capacitor iOS app | In-app ARKit — plane cascade + single cube place/manipulate (place-only) |
| **Native · ARCore** | Capacitor Android app | In-app ARCore (SceneView) — Instant Placement + single cube place/manipulate |
| **Native · ARCore techniques** | Capacitor Android app only | Feature points, depth peek, light estimate, image marker, and face mesh. Five teaching sessions via `technique` on `CubeAR.startSession`. iOS native stays place-only. |
| **WebXR · Chrome** | Android Chrome (browser or after Chrome handoff) | WebXR `immersive-ar` + offsetRay hit-test — place one cube, then manipulate |
| **WebXR · Chrome handoff** | Capacitor Android app | System WebView **cannot** run WebXR AR — opens the HTTPS PWA in Chrome Custom Tabs for the WebXR path |
| **Quick Look · USDZ** | iPhone / iPad Safari or Cap shell | Runtime USDZ export via three.js — opens Apple's native AR Quick Look viewer |
| **Inline preview** | Desktop / any browser | Orbit-controls 3D preview of the same cube definition |

### Why so many paths?

- **iOS Safari** has no WebXR AR — Quick Look (USDZ) is the standard web fallback; native ARKit adds a true in-app session in the Cap shell.
- **Android System WebView** has no `immersive-ar` — Chrome supports WebXR; the Cap shell offers native ARCore *and* a Chrome handoff for the web path.
- **One cube definition** in `src/scene.ts` feeds WebXR, USDZ export, and native placement params.

## Run (PWA / browser)

- **Windows:** double-click `run.bat`
- **macOS:** double-click `run.command`
- Or manually: `npm install && npm run dev`

The app runs at **https://localhost:5188** (sticky port, strict — it will not silently hop). HTTPS is self-signed via `@vitejs/plugin-basic-ssl` because WebXR and camera access require a secure context. Accept the browser's certificate warning once.

## Test on a phone (browser)

1. Start the dev server (`run.bat` / `run.command`). Vite prints a `Network:` URL like `https://192.168.x.x:5188`.
2. Make sure the phone is on the same Wi-Fi network (and the OS firewall allows Node on port 5188).
3. Open that URL on the phone and accept the self-signed certificate warning (Advanced → Proceed).
4. **Android Chrome:** tap **Start WebXR AR**, allow camera, move until ready, tap a flat surface to place one cube, then swipe/pinch. Requires an [ARCore-capable device](https://developers.google.com/ar/devices).
5. **iPhone Safari:** tap **View in AR** — AR Quick Look opens; move the phone to find a surface.

### Desktop testing of the Android path

Chrome's [Immersive Web Emulator](https://chromewebstore.google.com/detail/immersive-web-emulator/cgffilbpcibhmcfbgggfhfolhkfbhmik) extension can fake an `immersive-ar` session with synthetic hit-tests.

## Capacitor (native shells)

Native projects live in `android/` and `ios/`. Web assets come from `dist/` (`webDir`). The local **`cube-ar`** Capacitor plugin (`plugins/cube-ar/`) provides native ARKit/ARCore tap-to-place.

```bash
npm run cap:sync      # build plugin + web + cap sync
npm run cap:android   # sync + open Android Studio
npm run cap:ios       # sync + open Xcode (macOS only)
```

On device, the landing screen lists **all paths available on that platform** — typically Native AR + Quick Look on iOS, Native AR + Chrome handoff on Android Cap.

### Env for Android → Chrome handoff

Copy [`.env.example`](.env.example) to `.env` and set:

```bash
VITE_AR_ORIGIN=https://192.168.x.x:5188
```

Use your LAN HTTPS URL while developing, or the public HTTPS URL once deployed.

### Native permissions

| Platform | Declared | Purpose |
| --- | --- | --- |
| Android | `CAMERA` | Native ARCore + Chrome handoff |
| Android | `camera.ar` feature (`required=false`) | ARCore-capable devices |
| Android | `com.google.ar.core` = `optional` | ARCore when present |
| iOS | `NSCameraUsageDescription` | Native ARKit + Quick Look |
| iOS | `NSMicrophoneUsageDescription` | WebView camera APIs; app does not record audio |

### iOS signing

In Xcode → **Signing & Capabilities**, select the Apple Developer team for **d@worldbuild.io**. Building/running the iOS app requires a Mac with Xcode and CocoaPods (`pod install` under `ios/App` after sync).

## Documentation

- [`docs/arcore-c-api.md`](docs/arcore-c-api.md) — how the ARCore Android NDK (C) API relates to our Kotlin/SceneView native path (same runtime, different binding layer)

## Project layout

- `src/main.ts` — capability probe + multi-path showcase landing
- `src/scene.ts` — shared cube definition + inline preview
- `src/ar-gestures.ts` — shared overlay gesture controller (place / rotate / scale / move)
- `src/ar-native.ts` — Capacitor native AR session (ARKit / ARCore)
- `src/ar-webxr.ts` — WebXR session (offsetRay place/move, single-cube manipulate)
- `src/ar-quicklook.ts` — iOS USDZ export + Quick Look launch
- `src/ar-debug.ts` — session debug overlay (WebXR + native)
- `src/emerge.ts` — place emerge timing shared with native plugins
- `plugins/cube-ar/` — local Capacitor plugin (Swift + Kotlin); Android ARCore API map in [`plugins/cube-ar/android/ARCORE_API.md`](plugins/cube-ar/android/ARCORE_API.md)
- `public/` — PWA manifest, icons, service worker
- `android/` / `ios/` — Capacitor shells
