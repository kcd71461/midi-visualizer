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
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020010);
  scene.fog = new THREE.FogExp2(0x020010, 0.008);

  // 환경맵 (건반 반사용)
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x020010);
  const envHemi = new THREE.HemisphereLight(0x8899bb, 0x222233, 0.5);
  envScene.add(envHemi);
  scene.environment = pmremGenerator.fromScene(envScene, 0.04).texture;
  pmremGenerator.dispose();

  // --- 조명 ---
  // HemisphereLight (AO 시뮬레이션)
  const hemiLight = new THREE.HemisphereLight(0x8899bb, 0x111118, 0.15);
  scene.add(hemiLight);

  // 앰비언트 (약한 기본)
  const ambientLight = new THREE.AmbientLight(0x1a1a30, 0.2);
  scene.add(ambientLight);

  // 키 라이트 — 대각선 위에서 (그림자 포함)
  const keyLight = new THREE.DirectionalLight(0xfff8f0, 1.0);
  keyLight.position.set(4, 10, 6);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.width = 4096;
  keyLight.shadow.mapSize.height = 4096;
  keyLight.shadow.camera.left = -8;
  keyLight.shadow.camera.right = 8;
  keyLight.shadow.camera.top = 2;
  keyLight.shadow.camera.bottom = -2;
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far = 50;
  keyLight.shadow.bias = -0.0005;
  keyLight.shadow.normalBias = 0.02;
  scene.add(keyLight);

  // 필 라이트
  const fillLight = new THREE.DirectionalLight(0x8899bb, 0.25);
  fillLight.position.set(-5, 4, 3);
  scene.add(fillLight);

  // 림 라이트 (은은)
  const rimLight = new THREE.DirectionalLight(0x4466aa, 0.2);
  rimLight.position.set(0, 2, -8);
  scene.add(rimLight);

  // Edge graze light (건반 모서리 하이라이트)
  const grazeLight = new THREE.DirectionalLight(0xaabbcc, 0.3);
  grazeLight.position.set(3, 0.5, 6);
  scene.add(grazeLight);

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
    0.6,   // strength — 은은한 글로우
    0.3,   // radius
    0.75   // threshold
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
