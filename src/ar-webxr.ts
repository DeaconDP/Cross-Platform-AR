import * as THREE from "three";
import { createCube, createLights } from "./scene";

export async function isWebXRSupported(): Promise<boolean> {
  if (!navigator.xr) return false;
  try {
    return await navigator.xr.isSessionSupported("immersive-ar");
  } catch {
    return false;
  }
}

interface OverlayElements {
  root: HTMLElement;
  count: HTMLElement;
  hint: HTMLElement;
  exit: HTMLElement;
}

/**
 * Android path: immersive-ar session with hit-testing.
 * A reticle tracks real-world surfaces; each screen tap drops a cube there.
 * Resolves when the session ends.
 */
export async function startWebXR(overlay: OverlayElements): Promise<void> {
  const session = await navigator.xr!.requestSession("immersive-ar", {
    requiredFeatures: ["hit-test"],
    optionalFeatures: ["dom-overlay"],
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

  let placed = 0;
  overlay.count.textContent = "0";
  overlay.hint.hidden = false;
  overlay.hint.textContent = "Move your phone to find a surface";

  session.addEventListener("select", () => {
    if (!reticle.visible) return;
    const cube = createCube();
    reticle.matrix.decompose(cube.position, cube.quaternion, cube.scale);
    cube.rotateY(Math.random() * Math.PI * 2);
    scene.add(cube);
    placed++;
    overlay.count.textContent = String(placed);
    overlay.hint.hidden = true;
  });

  const onExit = () => session.end();
  overlay.exit.addEventListener("click", onExit);

  const viewerSpace = await session.requestReferenceSpace("viewer");
  const hitTestSource = await session.requestHitTestSource!({ space: viewerSpace });
  if (!hitTestSource) {
    await session.end();
    renderer.domElement.remove();
    renderer.dispose();
    throw new Error("Hit testing unavailable on this device");
  }

  let surfaceFound = false;
  renderer.setAnimationLoop((_time, frame?: XRFrame) => {
    if (!frame) return;
    const referenceSpace = renderer.xr.getReferenceSpace();
    if (referenceSpace) {
      const hits = frame.getHitTestResults(hitTestSource);
      if (hits.length > 0) {
        const pose = hits[0].getPose(referenceSpace);
        if (pose) {
          reticle.visible = true;
          reticle.matrix.fromArray(pose.transform.matrix);
          if (!surfaceFound) {
            surfaceFound = true;
            if (placed === 0) overlay.hint.textContent = "Tap to place a cube";
          }
        }
      } else {
        reticle.visible = false;
      }
    }
    renderer.render(scene, camera);
  });

  await renderer.xr.setSession(session);

  await new Promise<void>((resolve) => {
    session.addEventListener("end", () => resolve(), { once: true });
  });

  overlay.exit.removeEventListener("click", onExit);
  renderer.setAnimationLoop(null);
  renderer.domElement.remove();
  renderer.dispose();
}
