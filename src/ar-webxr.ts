import * as THREE from "three";
import { createCube, createLights } from "./scene";
import {
  type CompatSnapshot,
  DebugCollector,
  resetDebugOverlay,
  wireDebugToggle,
} from "./ar-debug";
import {
  bindArGestures,
  type OverlayChrome,
} from "./ar-gestures";
import {
  EMERGE_TOTAL_MS,
  emergeIntroAt,
  emergeRiseY,
} from "./emerge";

export async function isWebXRSupported(): Promise<boolean> {
  if (!navigator.xr) return false;
  try {
    return await navigator.xr.isSessionSupported("immersive-ar");
  } catch {
    return false;
  }
}

/** Viewer-space ray for overlay-normalized coords (y down, 0–1). */
function offsetRayFromNorm(
  nx: number,
  ny: number,
  aspect: number,
  fovYRad: number,
): XRRay {
  const ndcX = nx * 2 - 1;
  const ndcY = -(ny * 2 - 1);
  const tanY = Math.tan(fovYRad / 2);
  const tanX = tanY * aspect;
  let dx = ndcX * tanX;
  let dy = ndcY * tanY;
  let dz = -1;
  const len = Math.hypot(dx, dy, dz) || 1;
  dx /= len;
  dy /= len;
  dz /= len;
  return new XRRay(
    { x: 0, y: 0, z: 0, w: 1 },
    { x: dx, y: dy, z: dz, w: 0 },
  );
}

function overlayNorm(
  clientX: number,
  clientY: number,
  rect: DOMRect,
): { x: number; y: number } | null {
  if (!(rect.width > 0) || !(rect.height > 0)) return null;
  return {
    x: (clientX - rect.left) / rect.width,
    y: (clientY - rect.top) / rect.height,
  };
}

/**
 * Browser path: immersive-ar + hit-test.
 * Center reticle for surface preview; finger offsetRay for place/move.
 * One cube, then rotate / scale / move / reposition / recenter.
 */
export async function startWebXR(
  chrome: OverlayChrome,
  snapshot: CompatSnapshot,
): Promise<void> {
  const session = await navigator.xr!.requestSession("immersive-ar", {
    requiredFeatures: ["hit-test"],
    optionalFeatures: ["dom-overlay", "plane-detection"],
    domOverlay: { root: chrome.root },
  });

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType("local");
  renderer.domElement.style.pointerEvents = "none";
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.add(createLights());
  const camera = new THREE.PerspectiveCamera(70, 1, 0.01, 20);

  const reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.06, 0.075, 48).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x30d158 }),
  );
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  const contentRoot = new THREE.Group();
  contentRoot.visible = false;
  scene.add(contentRoot);

  const cube = createCube();
  const restY = cube.position.y;
  contentRoot.add(cube);

  const reticlePos = new THREE.Vector3();
  const debug = new DebugCollector(chrome.debugPanel, snapshot);
  debug.setSessionMeta({
    domOverlayActive: session.domOverlayState?.type === "screen",
    hitTestActive: false,
    referenceSpaceType: "local",
  });
  debug.logEvent("session start");

  resetDebugOverlay(chrome.debugToggle, chrome.debugPanel);
  const unwireDebug = wireDebugToggle(chrome.debugToggle, chrome.debugPanel, debug);
  const unbindSession = debug.bindSession(session);

  let placed = false;
  let surfaceReady = false;
  let scale = 1;
  let introMul = 1;
  let emerging = false;
  let emergeStart = 0;
  let spawning = false;

  let refSpace: XRReferenceSpace | null = null;
  let viewerSpace: XRReferenceSpace | null = null;
  let centerHitSource: XRHitTestSource | null = null;
  let fingerHitSource: XRHitTestSource | null = null;
  let fingerHitKey: string | null = null;
  let lastFingerMatrix: THREE.Matrix4 | null = null;
  let wantMoveApply = false;
  let pendingPlace: {
    resolve: (ok: boolean) => void;
    framesLeft: number;
    key: string;
  } | null = null;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const applyUserScale = () => {
    const m = scale * introMul;
    cube.scale.setScalar(m);
  };

  const faceCameraYaw = (alignViewpoint: boolean) => {
    if (!placed) return;
    camera.updateMatrixWorld(true);
    contentRoot.updateMatrixWorld(true);
    const cam = new THREE.Vector3();
    const pos = new THREE.Vector3();
    camera.getWorldPosition(cam);
    cube.getWorldPosition(pos);
    const localCam = contentRoot.worldToLocal(cam.clone());
    const localPos = contentRoot.worldToLocal(pos.clone());
    const dx = localCam.x - localPos.x;
    const dy = localCam.y - localPos.y;
    const dz = localCam.z - localPos.z;
    const horiz = Math.hypot(dx, dz);
    if (horiz < 1e-5) return;
    const yaw = Math.atan2(dx, dz);
    if (!alignViewpoint) {
      cube.rotation.set(0, yaw, 0);
      return;
    }
    const pitch = Math.max(-Math.PI / 4.5, Math.min(Math.PI / 4.5, -Math.atan2(dy, horiz)));
    cube.rotation.set(pitch, yaw, 0);
  };

  const placeAtMatrix = (matrix: THREE.Matrix4): boolean => {
    if (placed) return false;
    contentRoot.matrixAutoUpdate = true;
    contentRoot.matrix.copy(matrix);
    contentRoot.matrix.decompose(
      contentRoot.position,
      contentRoot.quaternion,
      contentRoot.scale,
    );
    contentRoot.scale.set(1, 1, 1);
    contentRoot.visible = true;
    placed = true;
    reticle.visible = false;
    introMul = reduceMotion ? 1 : 0.08;
    emerging = !reduceMotion;
    emergeStart = performance.now();
    spawning = true;
    applyUserScale();
    faceCameraYaw(false);
    gestures.setPlacedUi(true);
    debug.logEvent("cube placed");
    return true;
  };

  const ensureFingerHit = async (nx: number, ny: number) => {
    if (!viewerSpace || !session.requestHitTestSource) return;
    const key = `${nx.toFixed(3)},${ny.toFixed(3)}`;
    if (fingerHitKey === key && fingerHitSource) return;
    fingerHitSource?.cancel();
    fingerHitSource = null;
    fingerHitKey = key;
    const aspect = camera.aspect || window.innerWidth / Math.max(1, window.innerHeight);
    const fovY = THREE.MathUtils.degToRad(camera.fov);
    const ray = offsetRayFromNorm(nx, ny, aspect, fovY);
    try {
      fingerHitSource =
        (await session.requestHitTestSource({
          space: viewerSpace,
          offsetRay: ray,
        })) ?? null;
    } catch {
      fingerHitSource = null;
      fingerHitKey = null;
    }
  };

  const placeAtScreen = (clientX: number, clientY: number): Promise<boolean> => {
    const n = overlayNorm(clientX, clientY, chrome.root.getBoundingClientRect());
    if (!n || placed) return Promise.resolve(false);
    const key = `${n.x.toFixed(3)},${n.y.toFixed(3)}`;
    return new Promise((resolve) => {
      void ensureFingerHit(n.x, n.y).then(() => {
        pendingPlace = { resolve, framesLeft: 45, key };
      });
    });
  };

  const moveAtScreen = (clientX: number, clientY: number) => {
    if (!placed || emerging) return;
    const n = overlayNorm(clientX, clientY, chrome.root.getBoundingClientRect());
    if (!n) return;
    void ensureFingerHit(n.x, n.y).then(() => {
      wantMoveApply = true;
    });
  };

  const clearPlacement = () => {
    placed = false;
    emerging = false;
    spawning = false;
    introMul = 1;
    scale = 1;
    contentRoot.visible = false;
    cube.position.y = restY;
    cube.rotation.set(0, 0, 0);
    applyUserScale();
    gestures.setHint("TAP A FLAT SURFACE");
  };

  const gestures = bindArGestures(chrome, {
    cameraMode: true,
    isPlaced: () => placed,
    isSurfaceReady: () => surfaceReady,
    isSpawning: () => spawning || emerging,
    getScale: () => scale,
    setScaleState: (f) => {
      scale = f;
    },
    onTapPlace: (clientX, clientY) => placeAtScreen(clientX, clientY),
    onRotate: (dx, dy) => {
      if (!placed || emerging) return;
      cube.rotation.y += (dx * 0.45 * Math.PI) / 180;
      cube.rotation.x += (dy * 0.3 * Math.PI) / 180;
    },
    onScale: (factor) => {
      scale = factor;
      if (!emerging) applyUserScale();
    },
    onMoveScreen: (clientX, clientY) => moveAtScreen(clientX, clientY),
    onReposition: () => {
      clearPlacement();
      debug.logEvent("reposition");
    },
    onRecenter: () => {
      faceCameraYaw(true);
      debug.logEvent("recenter");
    },
    onExit: async () => {
      await session.end();
    },
  });

  chrome.root.hidden = false;

  viewerSpace = await session.requestReferenceSpace("viewer");
  centerHitSource =
    (await session.requestHitTestSource!({ space: viewerSpace })) ?? null;
  if (!centerHitSource) {
    gestures.destroy();
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

  renderer.setAnimationLoop((_time, frame?: XRFrame) => {
    if (!frame) return;
    refSpace = renderer.xr.getReferenceSpace();
    const now = performance.now();

    if (emerging) {
      const elapsed = now - emergeStart;
      if (elapsed < EMERGE_TOTAL_MS) {
        introMul = emergeIntroAt(elapsed);
        cube.position.y = emergeRiseY(elapsed, restY);
        applyUserScale();
      } else {
        introMul = 1;
        cube.position.y = restY;
        emerging = false;
        spawning = false;
        applyUserScale();
      }
    }

    if (refSpace && centerHitSource && !placed) {
      const hits = frame.getHitTestResults(centerHitSource);
      if (hits.length > 0) {
        const pose = hits[0].getPose(refSpace);
        if (pose) {
          reticle.visible = true;
          reticle.matrix.fromArray(pose.transform.matrix);
          reticle.matrix.decompose(reticlePos, reticle.quaternion, reticle.scale);
          if (!surfaceReady) {
            surfaceReady = true;
            gestures.setHint("TAP A FLAT SURFACE");
            debug.logEvent("surface found");
          }
        }
      } else {
        reticle.visible = false;
      }
    }

    if (refSpace && fingerHitSource) {
      const fingerHits = frame.getHitTestResults(fingerHitSource);
      if (fingerHits.length > 0) {
        const pose = fingerHits[0].getPose(refSpace);
        if (pose) {
          lastFingerMatrix = new THREE.Matrix4().fromArray(pose.transform.matrix);
          if (pendingPlace) {
            const ok = placeAtMatrix(lastFingerMatrix);
            pendingPlace.resolve(ok);
            pendingPlace = null;
          } else if (wantMoveApply && placed && !emerging) {
            contentRoot.matrix.copy(lastFingerMatrix);
            contentRoot.matrix.decompose(
              contentRoot.position,
              contentRoot.quaternion,
              contentRoot.scale,
            );
            contentRoot.scale.set(1, 1, 1);
            wantMoveApply = false;
          }
        }
      } else if (pendingPlace) {
        pendingPlace.framesLeft -= 1;
        if (pendingPlace.framesLeft <= 0) {
          pendingPlace.resolve(false);
          pendingPlace = null;
        }
      }
    } else if (pendingPlace) {
      pendingPlace.framesLeft -= 1;
      if (pendingPlace.framesLeft <= 0) {
        pendingPlace.resolve(false);
        pendingPlace = null;
      }
    }

    if (debug.isEnabled()) {
      debug.tick({
        frame,
        session,
        renderer,
        scene,
        reticle,
        hits: [],
        placed: placed ? 1 : 0,
        surfaceFound: surfaceReady,
        referenceSpace: refSpace,
        reticlePos,
      });
    }

    renderer.render(scene, camera);
  });

  await renderer.xr.setSession(session);

  await new Promise<void>((resolve) => {
    session.addEventListener("end", () => resolve(), { once: true });
  });

  gestures.destroy();
  const cancelHit = (source: XRHitTestSource | null) => {
    try {
      source?.cancel();
    } catch {
      /* session already ended */
    }
  };
  cancelHit(centerHitSource);
  cancelHit(fingerHitSource);
  centerHitSource = null;
  fingerHitSource = null;
  unwireDebug();
  unbindSession();
  resetDebugOverlay(chrome.debugToggle, chrome.debugPanel);
  renderer.setAnimationLoop(null);
  renderer.domElement.remove();
  renderer.dispose();
}
