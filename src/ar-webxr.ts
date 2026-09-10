import * as THREE from "three";
import { createCube, createLights } from "./scene";
import {
  type CompatSnapshot,
  DebugCollector,
  resetDebugOverlay,
  wireDebugToggle,
} from "./ar-debug";
import {
  arArmLift,
  arLiftPaPerSecFromHpa,
  arParseLiftMotion,
} from "./ar-lift";

export async function isWebXRSupported(): Promise<boolean> {
  if (!navigator.xr) return false;
  try {
    return await navigator.xr.isSessionSupported("immersive-ar");
  } catch {
    return false;
  }
}

export interface OverlayElements {
  root: HTMLElement;
  count: HTMLElement;
  hint: HTMLElement;
  exit: HTMLButtonElement;
  debugToggle: HTMLButtonElement;
  debugPanel: HTMLElement;
}

/**
 * Android path: immersive-ar session with hit-testing.
 * A reticle tracks real-world surfaces; each screen tap drops a cube there.
 * Resolves when the session ends.
 */
export async function startWebXR(
  overlay: OverlayElements,
  snapshot: CompatSnapshot,
): Promise<void> {
  const session = await navigator.xr!.requestSession("immersive-ar", {
    requiredFeatures: ["hit-test"],
    optionalFeatures: ["dom-overlay", "plane-detection"],
    domOverlay: { root: overlay.root },
  });

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType("local");
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.add(createLights());
  const camera = new THREE.PerspectiveCamera();

  const reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.06, 0.075, 48).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x30d158 }),
  );
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  const reticlePos = new THREE.Vector3();
  const debug = new DebugCollector(overlay.debugPanel, snapshot);
  debug.setSessionMeta({
    domOverlayActive: session.domOverlayState?.type === "screen",
    hitTestActive: false,
    referenceSpaceType: "local",
  });
  debug.logEvent("session start");

  resetDebugOverlay(overlay.debugToggle, overlay.debugPanel);
  const unwireDebug = wireDebugToggle(overlay.debugToggle, overlay.debugPanel, debug);
  const unbindSession = debug.bindSession(session);

  let placed = 0;
  overlay.count.textContent = "0";
  overlay.hint.hidden = false;
  overlay.hint.textContent = "Move your phone to find a surface";
  const sessionStart = performance.now();
  let lastHpa = -1;
  let lastHpaAt = 0;
  let liftPa = -1;
  let liftLive = false;
  const Barometer = (
    window as unknown as {
      Barometer?: new (opts: { frequency: number }) => {
        start: () => void;
        stop: () => void;
        pressure: number;
        addEventListener: (name: string, cb: () => void) => void;
      };
    }
  ).Barometer;
  let baro: InstanceType<NonNullable<typeof Barometer>> | null = null;
  if (Barometer) {
    try {
      baro = new Barometer({ frequency: 8 });
      baro.addEventListener("reading", () => {
        const now = performance.now();
        const hpa = baro?.pressure ?? -1;
        if (lastHpa > 0) {
          const rate = arLiftPaPerSecFromHpa(lastHpa, hpa, now - lastHpaAt);
          if (rate >= 0) {
            liftLive = true;
            liftPa = rate;
          }
        }
        lastHpa = hpa;
        lastHpaAt = now;
      });
      baro.start();
    } catch {
      baro = null;
    }
  }
  const lift = arArmLift({
    product: "cubes",
    useWeb: true,
    getWebSample: () =>
      arParseLiftMotion({
        live: liftLive,
        paPerSec: liftPa,
        sessionMs: performance.now() - sessionStart,
        placed: placed > 0,
      }),
    onChange: (judge) => {
      if (placed === 0 && judge.coach) {
        overlay.hint.hidden = false;
        overlay.hint.textContent = judge.coach;
      }
    },
  });

  session.addEventListener("select", () => {
    const lifting = lift.snapshot();
    if (lifting.blockPlace) {
      overlay.hint.hidden = false;
      overlay.hint.textContent =
        lifting.coach || "Wait until the lift stops. Then find the table.";
      return;
    }
    if (!reticle.visible) return;
    const cube = createCube();
    reticle.matrix.decompose(cube.position, cube.quaternion, cube.scale);
    cube.rotateY(Math.random() * Math.PI * 2);
    scene.add(cube);
    placed++;
    overlay.count.textContent = String(placed);
    overlay.hint.hidden = true;
    lift.setPlaced(true);
    debug.logEvent(`cube placed (#${placed})`);
  });

  const onExit = () => session.end();
  overlay.exit.addEventListener("click", onExit);

  const viewerSpace = await session.requestReferenceSpace("viewer");
  const hitTestSource = await session.requestHitTestSource!({ space: viewerSpace });
  if (!hitTestSource) {
    unwireDebug();
    unbindSession();
    await session.end();
    renderer.domElement.remove();
    renderer.dispose();
    throw new Error("Hit testing unavailable on this device");
  }

  debug.setSessionMeta({
    domOverlayActive: session.domOverlayState?.type === "screen",
    hitTestActive: true,
    referenceSpaceType: "local",
  });

  let surfaceFound = false;
  renderer.setAnimationLoop((_time, frame?: XRFrame) => {
    if (!frame) return;
    const referenceSpace = renderer.xr.getReferenceSpace();
    let hits: XRHitTestResult[] = [];
    if (referenceSpace) {
      hits = frame.getHitTestResults(hitTestSource);
      if (hits.length > 0) {
        const pose = hits[0].getPose(referenceSpace);
        if (pose) {
          reticle.visible = true;
          reticle.matrix.fromArray(pose.transform.matrix);
          reticle.matrix.decompose(reticlePos, reticle.quaternion, reticle.scale);
          if (!surfaceFound) {
            surfaceFound = true;
            debug.logEvent("surface found");
            if (placed === 0) overlay.hint.textContent = "Tap to place a cube";
          }
        }
      } else {
        reticle.visible = false;
      }
    }

    if (debug.isEnabled()) {
      debug.tick({
        frame,
        session,
        renderer,
        scene,
        reticle,
        hits,
        placed,
        surfaceFound,
        referenceSpace,
        reticlePos,
      });
    }

    renderer.render(scene, camera);
  });

  await renderer.xr.setSession(session);

  await new Promise<void>((resolve) => {
    session.addEventListener("end", () => resolve(), { once: true });
  });

  overlay.exit.removeEventListener("click", onExit);
  lift.dispose();
  try {
    baro?.stop();
  } catch {
    /* already stopped */
  }
  unwireDebug();
  unbindSession();
  resetDebugOverlay(overlay.debugToggle, overlay.debugPanel);
  renderer.setAnimationLoop(null);
  renderer.domElement.remove();
  renderer.dispose();
}
