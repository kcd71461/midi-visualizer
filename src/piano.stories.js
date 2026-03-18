import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import GUI from 'lil-gui';
import { createPiano, pressKey } from './piano.js';
import { PIANO, TRACK_COLORS } from './constants.js';

export default {
  title: 'Components/Piano',
};

function createPianoScene(container) {
  const width = container.clientWidth || 900;
  const height = container.clientHeight || 500;

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a1a);

  const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 500);
  camera.position.set(0, 5, 10);
  camera.lookAt(0, 0, -0.3);

  // --- 조명 ---
  const ambientLight = new THREE.AmbientLight(0x303050, 0.4);
  scene.add(ambientLight);

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
  keyLight.position.set(2, 8, 6);
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0x6688cc, 0.5);
  rimLight.position.set(-3, 4, -8);
  scene.add(rimLight);

  const fillLight = new THREE.DirectionalLight(0x8888aa, 0.3);
  fillLight.position.set(-5, 3, 4);
  scene.add(fillLight);

  // --- 바닥 반사면 (기본 OFF) ---
  const floorGeo = new THREE.PlaneGeometry(30, 10);
  const floorMat = new THREE.MeshPhysicalMaterial({
    color: 0x111122, roughness: 0.3, metalness: 0.6, reflectivity: 0.5,
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.08;
  floor.visible = false;
  scene.add(floor);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  createPiano(scene);

  // --- 블룸 후처리 ---
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(width, height),
    1.2, 0.4, 0.6
  );
  composer.addPass(bloomPass);

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    composer.render();
  }
  animate();

  const resizeObserver = new ResizeObserver(() => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  });
  resizeObserver.observe(container);

  return {
    scene, renderer, camera, composer, bloomPass,
    lights: { ambientLight, keyLight, rimLight, fillLight },
    floor, floorMat,
  };
}

// --- lil-gui 조명/블룸 컨트롤 패널 ---
function createLightingGui(container, sceneRefs) {
  const { bloomPass, lights, floor, floorMat } = sceneRefs;
  const { ambientLight, keyLight, rimLight, fillLight } = lights;

  const gui = new GUI({ container, title: '🔧 조명 / 블룸 설정' });
  gui.domElement.style.position = 'absolute';
  gui.domElement.style.top = '8px';
  gui.domElement.style.right = '8px';

  // 블룸
  const bloomFolder = gui.addFolder('블룸 (Bloom)');
  bloomFolder.add(bloomPass, 'strength', 0, 3, 0.1).name('강도');
  bloomFolder.add(bloomPass, 'radius', 0, 1, 0.05).name('반경');
  bloomFolder.add(bloomPass, 'threshold', 0, 1, 0.05).name('임계값');
  bloomFolder.open();

  // 키 라이트
  const keyFolder = gui.addFolder('키 라이트 (Key)');
  keyFolder.add(keyLight, 'visible').name('켜기/끄기');
  keyFolder.add(keyLight, 'intensity', 0, 3, 0.1).name('밝기');
  keyFolder.addColor({ color: '#' + keyLight.color.getHexString() }, 'color')
    .name('색상').onChange(v => keyLight.color.set(v));
  keyFolder.add(keyLight.position, 'x', -10, 10, 0.5).name('위치 X');
  keyFolder.add(keyLight.position, 'y', 0, 15, 0.5).name('위치 Y');
  keyFolder.add(keyLight.position, 'z', -10, 10, 0.5).name('위치 Z');
  keyFolder.open();

  // 림 라이트
  const rimFolder = gui.addFolder('림 라이트 (Rim)');
  rimFolder.add(rimLight, 'visible').name('켜기/끄기');
  rimFolder.add(rimLight, 'intensity', 0, 3, 0.1).name('밝기');
  rimFolder.addColor({ color: '#' + rimLight.color.getHexString() }, 'color')
    .name('색상').onChange(v => rimLight.color.set(v));
  rimFolder.add(rimLight.position, 'x', -10, 10, 0.5).name('위치 X');
  rimFolder.add(rimLight.position, 'y', 0, 15, 0.5).name('위치 Y');
  rimFolder.add(rimLight.position, 'z', -15, 5, 0.5).name('위치 Z');

  // 필 라이트
  const fillFolder = gui.addFolder('필 라이트 (Fill)');
  fillFolder.add(fillLight, 'visible').name('켜기/끄기');
  fillFolder.add(fillLight, 'intensity', 0, 3, 0.1).name('밝기');
  fillFolder.addColor({ color: '#' + fillLight.color.getHexString() }, 'color')
    .name('색상').onChange(v => fillLight.color.set(v));
  fillFolder.add(fillLight.position, 'x', -10, 10, 0.5).name('위치 X');
  fillFolder.add(fillLight.position, 'y', 0, 15, 0.5).name('위치 Y');
  fillFolder.add(fillLight.position, 'z', -10, 10, 0.5).name('위치 Z');

  // 앰비언트
  const ambientFolder = gui.addFolder('앰비언트 (Ambient)');
  ambientFolder.add(ambientLight, 'intensity', 0, 2, 0.05).name('밝기');
  ambientFolder.addColor({ color: '#' + ambientLight.color.getHexString() }, 'color')
    .name('색상').onChange(v => ambientLight.color.set(v));

  // 바닥
  const floorFolder = gui.addFolder('바닥 반사면');
  floorFolder.add(floor, 'visible').name('켜기/끄기');
  floorFolder.add(floorMat, 'roughness', 0, 1, 0.05).name('거칠기');
  floorFolder.add(floorMat, 'metalness', 0, 1, 0.05).name('금속질');
  floorFolder.add(floorMat, 'reflectivity', 0, 1, 0.05).name('반사도');

  return gui;
}

// --- 기본 피아노 뷰 ---
export const Default = () => {
  const wrapper = document.createElement('div');
  wrapper.style.width = '100%';
  wrapper.style.height = '500px';
  wrapper.style.position = 'relative';
  setTimeout(() => {
    const refs = createPianoScene(wrapper);
    createLightingGui(wrapper, refs);
  }, 0);
  return wrapper;
};

// --- 건반 눌림 테스트 ---
export const KeyPressTest = () => {
  const wrapper = document.createElement('div');
  wrapper.style.display = 'flex';
  wrapper.style.flexDirection = 'column';
  wrapper.style.height = '100vh';
  wrapper.style.background = '#1a1a2e';

  const sceneContainer = document.createElement('div');
  sceneContainer.style.flex = '1';
  sceneContainer.style.position = 'relative';
  wrapper.appendChild(sceneContainer);

  // 노트 버튼 패널
  const panel = document.createElement('div');
  panel.style.cssText = 'padding:12px;display:flex;flex-wrap:wrap;gap:8px;background:#111;';
  wrapper.appendChild(panel);

  const testNotes = [
    { midi: 60, name: 'C4 (도)' },
    { midi: 62, name: 'D4 (레)' },
    { midi: 64, name: 'E4 (미)' },
    { midi: 65, name: 'F4 (파)' },
    { midi: 67, name: 'G4 (솔)' },
    { midi: 69, name: 'A4 (라)' },
    { midi: 71, name: 'B4 (시)' },
    { midi: 61, name: 'C#4' },
    { midi: 63, name: 'D#4' },
    { midi: 66, name: 'F#4' },
    { midi: 68, name: 'G#4' },
    { midi: 70, name: 'A#4' },
  ];

  testNotes.forEach(({ midi, name }, i) => {
    const btn = document.createElement('button');
    btn.textContent = name;
    btn.style.cssText = 'padding:8px 16px;border:1px solid #444;border-radius:6px;background:#222;color:#fff;cursor:pointer;font-size:13px;';
    btn.addEventListener('click', () => {
      pressKey(midi, TRACK_COLORS[i % TRACK_COLORS.length]);
    });
    panel.appendChild(btn);
  });

  // 화음 + 랜덤 버튼
  const chords = [
    { name: 'C 메이저', notes: [60, 64, 67] },
    { name: 'A 마이너', notes: [57, 60, 64] },
    { name: 'G 메이저', notes: [55, 59, 62] },
    { name: 'F 메이저', notes: [53, 57, 60] },
  ];

  const chordPanel = document.createElement('div');
  chordPanel.style.cssText = 'padding:8px 12px;display:flex;gap:8px;background:#111;border-top:1px solid #333;';
  wrapper.appendChild(chordPanel);

  const chordLabel = document.createElement('span');
  chordLabel.textContent = '화음: ';
  chordLabel.style.cssText = 'color:#888;font-size:13px;line-height:36px;';
  chordPanel.appendChild(chordLabel);

  chords.forEach(({ name, notes }, ci) => {
    const btn = document.createElement('button');
    btn.textContent = name;
    btn.style.cssText = 'padding:8px 16px;border:1px solid #666;border-radius:6px;background:#333;color:#fff;cursor:pointer;font-size:13px;';
    btn.addEventListener('click', () => {
      notes.forEach((midi, ni) => {
        pressKey(midi, TRACK_COLORS[(ci + ni) % TRACK_COLORS.length]);
      });
    });
    chordPanel.appendChild(btn);
  });

  const randomBtn = document.createElement('button');
  randomBtn.textContent = '🎲 랜덤 노트';
  randomBtn.style.cssText = 'padding:8px 16px;border:1px solid #4ecdc4;border-radius:6px;background:#1a3a38;color:#4ecdc4;cursor:pointer;font-size:13px;';
  randomBtn.addEventListener('click', () => {
    const randomMidi = Math.floor(Math.random() * 61) + 30;
    pressKey(randomMidi, TRACK_COLORS[Math.floor(Math.random() * TRACK_COLORS.length)]);
  });
  chordPanel.appendChild(randomBtn);

  setTimeout(() => {
    const refs = createPianoScene(sceneContainer);
    createLightingGui(sceneContainer, refs);
  }, 0);
  return wrapper;
};
