# Cube AR

Cross-platform Augmented Reality demo: tap to place a 3D cube in your room. One PWA codebase, optional Capacitor shells for iOS/Android packaging.

| Platform | How it works |
| --- | --- |
| Android (Chrome) | WebXR `immersive-ar` + hit-testing — a reticle tracks real surfaces, every tap places a cube |
| Android (Capacitor app) | System WebView **cannot** run WebXR AR — CTA opens the HTTPS experience in Chrome Custom Tabs |
| iPhone / iPad (Safari or Cap) | AR Quick Look — the same cube is exported to USDZ at runtime and opened in Apple's native AR viewer |
| Desktop / other | Inline 3D preview with orbit controls |

iOS Safari has no WebXR AR support, so the Quick Look path is the standard cross-platform pattern.

## Run (PWA / browser)

- **Windows:** double-click `run.bat`
- **macOS:** double-click `run.command`
- Or manually: `npm install && npm run dev`

The app runs at **https://localhost:5188** (sticky port, strict — it will not silently hop). HTTPS is self-signed via `@vitejs/plugin-basic-ssl` because WebXR and camera access require a secure context. Accept the browser's certificate warning once.

## Test on a phone (browser)

1. Start the dev server (`run.bat` / `run.command`). Vite prints a `Network:` URL like `https://192.168.x.x:5188`.
2. Make sure the phone is on the same Wi-Fi network (and the OS firewall allows Node on port 5188).
3. Open that URL on the phone and accept the self-signed certificate warning (Advanced → Proceed).
4. **Android:** tap **Start AR**, allow camera access, sweep the phone across a floor or table until the green reticle appears, then tap to place cubes. Requires an [ARCore-capable device](https://developers.google.com/ar/devices).
5. **iPhone:** tap **View in AR** — AR Quick Look opens; move the phone to find a surface and the cube places itself (drag to reposition, pinch to scale).

### Desktop testing of the Android path

Chrome's [Immersive Web Emulator](https://chromewebstore.google.com/detail/immersive-web-emulator/cgffilbpcibhmcfbgggfhfolhkfbhmik) extension can fake an `immersive-ar` session with synthetic hit-tests, useful for smoke-testing the session flow without a phone.

## Capacitor (native shells)

Native projects live in `android/` and `ios/`. Web assets come from `dist/` (`webDir`).

```bash
npm run cap:sync      # build + cap sync
npm run cap:android   # sync + open Android Studio
npm run cap:ios       # sync + open Xcode (macOS only)
```

### Env for Android → Chrome handoff

Copy [`.env.example`](.env.example) to `.env` and set:

```bash
VITE_AR_ORIGIN=https://192.168.x.x:5188
```

Use your LAN HTTPS URL while developing, or the public HTTPS URL once deployed. The Capacitor Android shell opens that origin in Chrome because WebXR `immersive-ar` is not available in Android System WebView.

### Native permissions

| Platform | Declared | Purpose |
| --- | --- | --- |
| Android | `CAMERA` | Camera access for AR (Chrome / future WebView use) |
| Android | `camera` / `camera.ar` features (`required=false`) | Play Store device filtering without excluding non-AR phones |
| Android | `com.google.ar.core` = `optional` | ARCore when present |
| iOS | `NSCameraUsageDescription` | Camera for AR placement |
| iOS | `NSMicrophoneUsageDescription` | Required for WebView camera APIs on iOS; app does not record audio |

No photo library, location, or storage permissions.

### iOS signing

In Xcode → **Signing & Capabilities**, select the Apple Developer team for **d@worldbuild.io** (not a personal free team). Set `DEVELOPMENT_TEAM` on the App target accordingly. Building/running the iOS app requires a Mac with Xcode and CocoaPods (`pod install` under `ios/App` after sync).

## Project layout

- `src/main.ts` — capability detection, routes WebXR / Quick Look / Android Chrome handoff
- `src/scene.ts` — the shared cube definition + inline preview
- `src/ar-webxr.ts` — Android WebXR session (hit-test reticle, tap to place, DOM overlay)
- `src/ar-quicklook.ts` — iOS USDZ export + Quick Look launch
- `public/` — PWA manifest, icons, service worker (offline shell cache, production browser only)
- `capacitor.config.json` — Cap app id `io.worldbuild.cubear`, `webDir: dist`, HTTPS Android scheme
- `android/` / `ios/` — native shells + permission strings
