import * as THREE from "three";
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
  let lastCube: THREE.Object3D | null = null;
  overlay.count.textContent = "0";
  overlay.hint.hidden = false;
  overlay.hint.textContent = "Move your phone to find a surface";

  session.addEventListener("select", () => {
    if (!reticle.visible) return;
    const cube = createCube();
    reticle.matrix.decompose(cube.position, cube.quaternion, cube.scale);
    cube.rotateY(Math.random() * Math.PI * 2);
    scene.add(cube);
    lastCube = cube;
    placed++;
    overlay.count.textContent = String(placed);
    overlay.hint.hidden = true;
    debug.logEvent(`cube placed (#${placed})`);
  });

  const fingers = new Map<number, { x: number; y: number }>();
  let lastTwist = 0;
  const onTwistDown = (event: PointerEvent) => {
    if ((event.target as HTMLElement | null)?.closest(".ar-exit, .ar-debug-toggle")) return;
    fingers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (fingers.size === 2) {
      const pts = [...fingers.values()];
      lastTwist = Math.atan2(pts[1]!.y - pts[0]!.y, pts[1]!.x - pts[0]!.x);
    }
  };
  const onTwistMove = (event: PointerEvent) => {
    if (!fingers.has(event.pointerId) || !lastCube) return;
    fingers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (fingers.size < 2) return;
    const pts = [...fingers.values()];
    const ang = Math.atan2(pts[1]!.y - pts[0]!.y, pts[1]!.x - pts[0]!.x);
    let d = ang - lastTwist;
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    lastTwist = ang;
    if (Math.abs(d) > 0.002) lastCube.rotateY(d);
  };
  const onTwistUp = (event: PointerEvent) => {
    fingers.delete(event.pointerId);
    if (fingers.size < 2) lastTwist = 0;
  };
  overlay.root.addEventListener("pointerdown", onTwistDown);
  overlay.root.addEventListener("pointermove", onTwistMove);
  overlay.root.addEventListener("pointerup", onTwistUp);
  overlay.root.addEventListener("pointercancel", onTwistUp);

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
            if (placed === 0) overlay.hint.textContent = "Tap to place · twist two fingers to turn";
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

  overlay.root.removeEventListener("pointerdown", onTwistDown);
  overlay.root.removeEventListener("pointermove", onTwistMove);
  overlay.root.removeEventListener("pointerup", onTwistUp);
  overlay.root.removeEventListener("pointercancel", onTwistUp);
  overlay.exit.removeEventListener("click", onExit);
  unwireDebug();
  unbindSession();
  resetDebugOverlay(overlay.debugToggle, overlay.debugPanel);
  renderer.setAnimationLoop(null);
  renderer.domElement.remove();
  renderer.dispose();
}
