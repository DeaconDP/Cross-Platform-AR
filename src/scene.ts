import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

/** Edge length of the demo cube in meters (real-world scale in AR). */
export const CUBE_SIZE = 0.12;

const ACCENT = 0x30d158;

/**
 * The one cube definition shared by every path:
 * WebXR placement (Android), USDZ export (iOS Quick Look), and the inline preview.
 */
export function createCube(): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);
  const material = new THREE.MeshStandardMaterial({
    color: ACCENT,
    roughness: 0.35,
    metalness: 0.15,
  });
  const cube = new THREE.Mesh(geometry, material);
  // Sit on the surface instead of intersecting it.
  cube.geometry.translate(0, CUBE_SIZE / 2, 0);
  return cube;
}

export function createLights(): THREE.Group {
  const group = new THREE.Group();
  const hemi = new THREE.HemisphereLight(0xffffff, 0x334455, 1.2);
  const dir = new THREE.DirectionalLight(0xffffff, 1.6);
  dir.position.set(0.5, 1, 0.8);
  group.add(hemi, dir);
  return group;
}

/**
 * Inline 3D preview: the landing screen's visual anchor and the fallback
 * experience for browsers with no AR path. Orbit to inspect the cube.
 */
export function startPreview(container: HTMLElement): void {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.add(createLights());

  const cube = createCube();
  cube.position.y = -CUBE_SIZE / 2;
  scene.add(cube);

  const camera = new THREE.PerspectiveCamera(
    45,
    container.clientWidth / container.clientHeight,
    0.01,
    10,
  );
  camera.position.set(0.22, 0.16, 0.28);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 0);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 0.18;
  controls.maxDistance = 0.6;

  new ResizeObserver(() => {
    const { clientWidth: w, clientHeight: h } = container;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }).observe(container);

  renderer.setAnimationLoop(() => {
    cube.rotation.y += 0.004;
    controls.update();
    renderer.render(scene, camera);
  });
}
