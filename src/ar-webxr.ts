import * as THREE from "three";
import { comfortScale } from "./ar-comfort";
import { createCube, createLights } from "./scene";
import {
  type CompatSnapshot,
  DebugCollector,
  resetDebugOverlay,
  wireDebugToggle,
} from "./ar-debug";

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
  let lastCube: THREE.Mesh | null = null;
  overlay.count.textContent = "0";
  overlay.hint.hidden = false;
  overlay.hint.textContent = "Move your phone to find a surface";

  const TAP_SLOP = 12;
  let down: { x: number; y: number } | null = null;
  let dragging = false;

  const placeOrMoveAtReticle = (moveLast: boolean) => {
    if (!reticle.visible) return;
    if (moveLast && lastCube) {
      const yaw = lastCube.rotation.y;
      const kept = lastCube.scale.clone();
      reticle.matrix.decompose(lastCube.position, lastCube.quaternion, lastCube.scale);
      lastCube.scale.copy(kept);
      lastCube.rotation.y = yaw;
      return;
    }
    const cube = createCube();
    reticle.matrix.decompose(cube.position, cube.quaternion, cube.scale);
    const dist = cube.position.length();
    cube.scale.multiplyScalar(comfortScale(dist));
    cube.rotateY(Math.random() * Math.PI * 2);
    scene.add(cube);
    lastCube = cube;
    placed++;
    overlay.count.textContent = String(placed);
    overlay.hint.hidden = false;
    overlay.hint.textContent = "Tap to place more · drag to slide the last cube";
    debug.logEvent(`cube placed (#${placed})`);
  };

  session.addEventListener("select", () => {
    if (dragging) return;
    placeOrMoveAtReticle(false);
  });

  const onPointerDown = (event: PointerEvent) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest(".ar-exit, .ar-debug-toggle, .ar-debug-col, .ar-debug-rail")) return;
    down = { x: event.clientX, y: event.clientY };
    dragging = false;
  };
  const onPointerMove = (event: PointerEvent) => {
    if (!down || placed === 0) return;
    const travel = Math.hypot(event.clientX - down.x, event.clientY - down.y);
    if (travel <= TAP_SLOP) return;
    dragging = true;
    placeOrMoveAtReticle(true);
  };
  const onPointerUp = () => {
    down = null;
    window.setTimeout(() => {
      dragging = false;
    }, 0);
  };
  overlay.root.addEventListener("pointerdown", onPointerDown);
  overlay.root.addEventListener("pointermove", onPointerMove);
  overlay.root.addEventListener("pointerup", onPointerUp);
  overlay.root.addEventListener("pointercancel", onPointerUp);

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

  overlay.root.removeEventListener("pointerdown", onPointerDown);
  overlay.root.removeEventListener("pointermove", onPointerMove);
  overlay.root.removeEventListener("pointerup", onPointerUp);
  overlay.root.removeEventListener("pointercancel", onPointerUp);
  overlay.exit.removeEventListener("click", onExit);
  unwireDebug();
  unbindSession();
  resetDebugOverlay(overlay.debugToggle, overlay.debugPanel);
  renderer.setAnimationLoop(null);
  renderer.domElement.remove();
  renderer.dispose();
}
