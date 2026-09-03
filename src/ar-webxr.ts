import * as THREE from "three";
import { createCube, createLights } from "./scene";
import {
  type CompatSnapshot,
  DebugCollector,
  resetDebugOverlay,
  wireDebugToggle,
} from "./ar-debug";
import { arClassifyMediaError, arOccupy, arOccupyCoach } from "./ar-occupy";

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
  let session: XRSession | undefined;
  const occupy = arOccupy({
    onYield: () => {
      try {
        void session?.end();
      } catch {
        /* already ending */
      }
    },
  });
  try {
    session = await navigator.xr!.requestSession("immersive-ar", {
      requiredFeatures: ["hit-test"],
      optionalFeatures: ["dom-overlay", "plane-detection"],
      domOverlay: { root: overlay.root },
    });
  } catch (err) {
    occupy.release();
    throw new Error(arOccupyCoach(arClassifyMediaError(err), "camera"));
  }
  const xrSession = session;
  if (!xrSession) {
    occupy.release();
    throw new Error(arOccupyCoach("failed", "camera"));
  }

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
    domOverlayActive: xrSession.domOverlayState?.type === "screen",
    hitTestActive: false,
    referenceSpaceType: "local",
  });
  debug.logEvent("session start");

  resetDebugOverlay(overlay.debugToggle, overlay.debugPanel);
  const unwireDebug = wireDebugToggle(overlay.debugToggle, overlay.debugPanel, debug);
  const unbindSession = debug.bindSession(xrSession);

  let placed = 0;
  overlay.count.textContent = "0";
  overlay.hint.hidden = false;
  overlay.hint.textContent = "Move your phone to find a surface";

  xrSession.addEventListener("select", () => {
    if (!reticle.visible) return;
    const cube = createCube();
    reticle.matrix.decompose(cube.position, cube.quaternion, cube.scale);
    cube.rotateY(Math.random() * Math.PI * 2);
    scene.add(cube);
    placed++;
    overlay.count.textContent = String(placed);
    overlay.hint.hidden = true;
    debug.logEvent(`cube placed (#${placed})`);
  });

  const onExit = () => void xrSession.end();
  overlay.exit.addEventListener("click", onExit);

  const viewerSpace = await xrSession.requestReferenceSpace("viewer");
  const hitTestSource = await xrSession.requestHitTestSource!({ space: viewerSpace });
  if (!hitTestSource) {
    occupy.release();
    unwireDebug();
    unbindSession();
    await xrSession.end();
    renderer.domElement.remove();
    renderer.dispose();
    throw new Error("Hit testing unavailable on this device");
  }

  debug.setSessionMeta({
    domOverlayActive: xrSession.domOverlayState?.type === "screen",
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
        session: xrSession,
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

  await renderer.xr.setSession(xrSession);

  await new Promise<void>((resolve) => {
    xrSession.addEventListener("end", () => resolve(), { once: true });
  });

  occupy.release();
  overlay.exit.removeEventListener("click", onExit);
  unwireDebug();
  unbindSession();
  resetDebugOverlay(overlay.debugToggle, overlay.debugPanel);
  renderer.setAnimationLoop(null);
  renderer.domElement.remove();
  renderer.dispose();
}
