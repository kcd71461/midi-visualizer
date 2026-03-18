import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

let renderer, scene, composer, sceneCamera;
let stars;

export function createScene(container) {
  // WebGL2 지원 체크
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2');
  if (!gl) {
    container.innerHTML = '<div style="color:#fff;text-align:center;padding:40px;font-family:sans-serif;">' +
      '<h2>WebGL2를 지원하지 않는 브라우저입니다.</h2>' +
      '<p>Chrome, Firefox, Safari, Edge 최신 버전을 사용해주세요.</p></div>';
    throw new Error('WebGL2 not supported');
  }

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  container.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020010);
  scene.fog = new THREE.FogExp2(0x020010, 0.008);

  const ambientLight = new THREE.AmbientLight(0x404060, 0.5);
  scene.add(ambientLight);

  stars = createStars();
  scene.add(stars);

  return { renderer, scene };
}

function createStars() {
  const count = 3000;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 200;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 200;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 200;
    sizes[i] = Math.random() * 2 + 0.5;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  const material = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.3,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.8,
  });

  return new THREE.Points(geometry, material);
}

export function setupPostProcessing(camera) {
  sceneCamera = camera;
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    1.5,
    0.4,
    0.85
  );
  composer.addPass(bloomPass);

  return composer;
}

export function updateScene(delta) {
  if (stars) {
    stars.rotation.y += delta * 0.01;
    stars.rotation.x += delta * 0.005;
  }
}

export function renderScene() {
  if (composer) {
    composer.render();
  } else if (sceneCamera) {
    renderer.render(scene, sceneCamera);
  }
}

export function handleResize(camera, container) {
  const w = container.clientWidth;
  const h = container.clientHeight;
  renderer.setSize(w, h);
  if (composer) composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

export function getScene() { return scene; }
export function getRenderer() { return renderer; }
