# TODO

- [x] Scaffold Vite + TS + three.js, sticky port 5188, basic-ssl + LAN host
- [x] Shared cube factory + inline orbit preview fallback
- [x] WebXR immersive-ar path (hit-test reticle, tap to place, DOM overlay)
- [x] iOS AR Quick Look path (runtime USDZ export, rel=ar launch)
- [x] Landing screen with adaptive CTA + capability detection
- [x] PWA manifest, icons, service worker
- [x] run.bat / run.command, README
- [x] Capacitor android/ios shells + camera (and related) permissions
- [x] Android Cap → Chrome Custom Tabs handoff when WebXR unavailable
- [x] Native AR Cap plugin (ARKit iOS + ARCore Android) + showcase multi-path landing
- [x] Android native AR: runtime CAMERA permission + ARCore install gate before session start
- [x] Android 16 KB page size: arsceneview 2.3.0 + 16k Gradle packaging (Filament/ARCore native libs)
- [x] AR walk / ride steward: pause-to-place coach + block cubes in a vehicle (`src/ar-walk.ts`)
- [ ] Verify on a real ARCore Android phone over LAN (browser WebXR)
- [x] Verify Capacitor Android native AR path (ARCore tap-to-place) — IMU warmup + HIGH_SAMPLING_RATE_SENSORS; live camera on SM-A266B (Samsung sensor HAL / ARCore 1.54)
- [ ] Verify Capacitor Android build opens Chrome with VITE_AR_ORIGIN
- [ ] Verify on a real iPhone (Safari Quick Look + Cap native ARKit + Cap Quick Look)
- [ ] Set Xcode DEVELOPMENT_TEAM to d@worldbuild.io team ID and run on device
