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

// ===== 조명 프리셋 정의 =====
const LIGHTING_PRESETS = {
  // A) 소프트 스포트라이트 — 은은한 위쪽 스포트라이트, 부드러운 그림자
  softSpotlight: {
    name: 'A. Soft Spotlight',
    description: '은은한 스포트라이트가 피아노를 비추는 콘서트 느낌',
    background: 0x08081a,
    exposure: 1.0,
    bloom: { strength: 0.6, radius: 0.3, threshold: 0.8 },
    ambient: { color: 0x202040, intensity: 0.3 },
    lights: [
      // 위에서 부드럽게 내려오는 스포트라이트 (메인)
      { type: 'spot', color: 0xfff5e6, intensity: 1.5, position: [0, 12, 2], angle: 0.4, penumbra: 0.8, target: [0, 0, 0] },
      // 은은한 후면 림 (아주 약하게)
      { type: 'directional', color: 0x4466aa, intensity: 0.15, position: [-2, 3, -6] },
      // 약한 필 라이트
      { type: 'directional', color: 0x667799, intensity: 0.15, position: [4, 2, 3] },
    ],
  },

  // B) 따뜻한 콘서트홀 — 클래식 공연장 느낌
  warmConcert: {
    name: 'B. Warm Concert Hall',
    description: '따뜻한 앰버 톤의 클래식 공연장 조명',
    background: 0x0a0808,
    exposure: 1.1,
    bloom: { strength: 0.4, radius: 0.2, threshold: 0.85 },
    ambient: { color: 0x302820, intensity: 0.35 },
    lights: [
      // 따뜻한 메인 조명 (약간 앞쪽 위)
      { type: 'directional', color: 0xffe0b2, intensity: 1.2, position: [1, 10, 5] },
      // 은은한 사이드 워시
      { type: 'directional', color: 0xffcc88, intensity: 0.3, position: [-6, 5, 0] },
      // 아주 약한 백라이트
      { type: 'directional', color: 0x553322, intensity: 0.1, position: [0, 3, -8] },
    ],
  },

  // C) 네온 라운지 — 쿨한 블루/퍼플 네온 분위기
  neonLounge: {
    name: 'C. Neon Lounge',
    description: '쿨한 블루/퍼플 네온 바 분위기, 강한 글로우',
    background: 0x050510,
    exposure: 1.3,
    bloom: { strength: 1.0, radius: 0.4, threshold: 0.5 },
    ambient: { color: 0x101030, intensity: 0.2 },
    lights: [
      // 위에서 약한 백색 조명
      { type: 'directional', color: 0xccccff, intensity: 0.6, position: [0, 8, 4] },
      // 왼쪽에서 블루 악센트
      { type: 'spot', color: 0x4488ff, intensity: 0.8, position: [-5, 4, 2], angle: 0.5, penumbra: 0.9, target: [0, 0, 0] },
      // 오른쪽에서 퍼플 악센트
      { type: 'spot', color: 0xaa44ff, intensity: 0.6, position: [5, 4, -2], angle: 0.5, penumbra: 0.9, target: [0, 0, 0] },
    ],
  },

  // D) 미니멀 다크 — 극도로 어둡고 드라마틱한 그림자
  minimalDark: {
    name: 'D. Minimal Dark',
    description: '어두운 공간에서 최소한의 빛만, 드라마틱한 그림자',
    background: 0x030308,
    exposure: 0.9,
    bloom: { strength: 0.3, radius: 0.2, threshold: 0.9 },
    ambient: { color: 0x0a0a15, intensity: 0.15 },
    lights: [
      // 유일한 메인 조명 — 좁은 스포트라이트
      { type: 'spot', color: 0xeeeeff, intensity: 2.0, position: [0, 15, 0], angle: 0.25, penumbra: 0.5, target: [0, 0, 0] },
    ],
  },

  // F) 햇빛 — 멀리서 건반 전체를 비추는 자연광 느낌
  sunlight: {
    name: 'F. Sunlight',
    description: '멀리서 건반 전체를 비추는 따뜻한 햇빛, 자연광 느낌',
    background: 0x0c1020,
    exposure: 1.2,
    bloom: { strength: 0.35, radius: 0.3, threshold: 0.85 },
    ambient: { color: 0x1a2040, intensity: 0.2 },
    lights: [
      // 햇빛 — 멀리 높은 곳에서 건반 방향으로 비추는 디렉셔널
      { type: 'directional', color: 0xffeedd, intensity: 1.4, position: [8, 20, 15] },
      // 하늘색 반사광 (약한 필)
      { type: 'directional', color: 0x88aadd, intensity: 0.2, position: [-4, 6, 3] },
    ],
  },

  // E) 시네마틱 — 영화적 3점 조명, 적절한 대비
  cinematic: {
    name: 'E. Cinematic',
    description: '영화적 3점 조명 (키/필/림), 균형 잡힌 대비',
    background: 0x0a0a18,
    exposure: 1.1,
    bloom: { strength: 0.5, radius: 0.25, threshold: 0.75 },
    ambient: { color: 0x1a1a30, intensity: 0.25 },
    lights: [
      // 키 라이트 — 45도 각도, 약간 따뜻한 백색
      { type: 'directional', color: 0xfff8f0, intensity: 1.0, position: [4, 8, 5] },
      // 필 라이트 — 반대편 약한 보조, 쿨 톤
      { type: 'directional', color: 0x8899bb, intensity: 0.25, position: [-5, 4, 3] },
      // 림 라이트 — 뒤쪽 아래, 아주 은은한 윤곽선
      { type: 'directional', color: 0x4466aa, intensity: 0.2, position: [0, 2, -8] },
    ],
  },
};

// ===== 씬 생성 (프리셋 기반) =====
function createPianoScene(container, preset) {
  const width = container.clientWidth || 900;
  const height = container.clientHeight || 500;

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = preset.exposure;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(preset.background);

  const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 500);
  camera.position.set(0, 5, 10);
  camera.lookAt(0, 0, -0.3);

  // 환경맵 생성 (검은 건반 반사용)
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(preset.background);
  // 약한 빛을 가진 환경맵으로 건반 반사에 미세한 하이라이트 부여
  const envLight = new THREE.HemisphereLight(0x8899bb, 0x222233, 0.5);
  envScene.add(envLight);
  const envTexture = pmremGenerator.fromScene(envScene, 0.04).texture;
  scene.environment = envTexture;
  pmremGenerator.dispose();

  // HemisphereLight — 위(밝은 하늘색)/아래(어두운 갈색)로 자연스러운 AO 시뮬레이션
  const hemiLight = new THREE.HemisphereLight(
    0x8899bb, // 위: 밝은 하늘색
    0x111118, // 아래: 거의 검정 (건반 하단/접촉부가 자연스럽게 어두워짐)
    preset.ambient.intensity * 0.6,
  );
  scene.add(hemiLight);

  // 앰비언트 라이트 (HemisphereLight 보조)
  const ambientLight = new THREE.AmbientLight(preset.ambient.color, preset.ambient.intensity * 0.5);
  scene.add(ambientLight);

  // 프리셋 조명 생성
  const sceneLights = [];
  for (const cfg of preset.lights) {
    let light;
    if (cfg.type === 'spot') {
      light = new THREE.SpotLight(cfg.color, cfg.intensity, 50, cfg.angle, cfg.penumbra);
      light.position.set(...cfg.position);
      if (cfg.target) {
        light.target.position.set(...cfg.target);
        scene.add(light.target);
      }
    } else {
      light = new THREE.DirectionalLight(cfg.color, cfg.intensity);
      light.position.set(...cfg.position);
      // 디렉셔널 라이트 그림자 범위 (피아노에 맞게 타이트하게)
      light.shadow.camera.left = -8;
      light.shadow.camera.right = 8;
      light.shadow.camera.top = 2;
      light.shadow.camera.bottom = -2;
      light.shadow.camera.near = 0.5;
      light.shadow.camera.far = 50;
    }
    light.castShadow = true;
    light.shadow.mapSize.width = 4096;
    light.shadow.mapSize.height = 4096;
    light.shadow.bias = -0.0005;
    light.shadow.normalBias = 0.02;
    scene.add(light);
    sceneLights.push(light);
  }

  // Edge graze light — 매우 낮은 각도로 건반 모서리를 스치는 조명
  // 검은 건반 측면에 하이라이트를 만들어 분리감 강조
  const grazeLight = new THREE.DirectionalLight(0xaabbcc, 0.35);
  grazeLight.position.set(3, 0.5, 6); // 거의 수평, 측면에서
  grazeLight.castShadow = false; // 그림자는 메인 라이트에 위임
  scene.add(grazeLight);
  sceneLights.push(grazeLight);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  createPiano(scene);

  // 블룸 후처리
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(width, height),
    preset.bloom.strength, preset.bloom.radius, preset.bloom.threshold
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

  return { scene, renderer, camera, composer, bloomPass, ambientLight, hemiLight, sceneLights };
}

// ===== lil-gui 컨트롤 패널 =====
function createLightingGui(container, sceneRefs, preset) {
  const { bloomPass, ambientLight, hemiLight, sceneLights } = sceneRefs;

  const gui = new GUI({ container, title: `${preset.name} 설정` });
  gui.domElement.style.position = 'absolute';
  gui.domElement.style.top = '8px';
  gui.domElement.style.right = '8px';

  const bloomFolder = gui.addFolder('블룸');
  bloomFolder.add(bloomPass, 'strength', 0, 2, 0.05).name('강도');
  bloomFolder.add(bloomPass, 'radius', 0, 1, 0.05).name('반경');
  bloomFolder.add(bloomPass, 'threshold', 0, 1, 0.05).name('임계값');
  bloomFolder.open();

  const ambFolder = gui.addFolder('앰비언트');
  ambFolder.add(ambientLight, 'intensity', 0, 1, 0.05).name('밝기');

  const hemiFolder = gui.addFolder('헤미스피어 (AO)');
  hemiFolder.add(hemiLight, 'intensity', 0, 1, 0.05).name('밝기');

  sceneLights.forEach((light, i) => {
    const cfg = preset.lights[i];
    const isGraze = !cfg;
    const label = isGraze ? 'Edge Graze' : cfg.type === 'spot' ? `스포트 ${i + 1}` : `디렉셔널 ${i + 1}`;
    const folder = gui.addFolder(label);
    folder.add(light, 'visible').name('켜기/끄기');
    folder.add(light, 'intensity', 0, 3, 0.05).name('밝기');
    folder.addColor({ color: '#' + light.color.getHexString() }, 'color')
      .name('색상').onChange(v => light.color.set(v));
    folder.add(light.position, 'x', -15, 15, 0.5).name('X');
    folder.add(light.position, 'y', 0, 20, 0.5).name('Y');
    folder.add(light.position, 'z', -15, 15, 0.5).name('Z');
    if (cfg && cfg.type === 'spot') {
      folder.add(light, 'angle', 0.1, 1.2, 0.05).name('각도');
      folder.add(light, 'penumbra', 0, 1, 0.05).name('페넘브라');
    }
  });

  return gui;
}

// ===== 건반 테스트 버튼 패널 =====
function createKeyButtons(container) {
  const panel = document.createElement('div');
  panel.style.cssText = 'padding:10px;display:flex;flex-wrap:wrap;gap:6px;background:#111;';
  container.appendChild(panel);

  const testNotes = [
    { midi: 60, name: 'C4' }, { midi: 62, name: 'D4' },
    { midi: 64, name: 'E4' }, { midi: 65, name: 'F4' },
    { midi: 67, name: 'G4' }, { midi: 69, name: 'A4' },
    { midi: 71, name: 'B4' }, { midi: 61, name: 'C#4' },
    { midi: 63, name: 'D#4' }, { midi: 66, name: 'F#4' },
    { midi: 68, name: 'G#4' }, { midi: 70, name: 'A#4' },
  ];

  testNotes.forEach(({ midi, name }, i) => {
    const btn = document.createElement('button');
    btn.textContent = name;
    btn.style.cssText = 'padding:6px 12px;border:1px solid #444;border-radius:4px;background:#222;color:#fff;cursor:pointer;font-size:12px;';
    btn.addEventListener('click', () => pressKey(midi, TRACK_COLORS[i % TRACK_COLORS.length]));
    panel.appendChild(btn);
  });

  // 화음
  const chordPanel = document.createElement('div');
  chordPanel.style.cssText = 'padding:6px 10px;display:flex;gap:6px;background:#111;border-top:1px solid #333;';
  container.appendChild(chordPanel);

  [
    { name: 'C maj', notes: [60, 64, 67] },
    { name: 'Am', notes: [57, 60, 64] },
    { name: 'G maj', notes: [55, 59, 62] },
  ].forEach(({ name, notes }, ci) => {
    const btn = document.createElement('button');
    btn.textContent = name;
    btn.style.cssText = 'padding:6px 12px;border:1px solid #666;border-radius:4px;background:#333;color:#fff;cursor:pointer;font-size:12px;';
    btn.addEventListener('click', () => {
      notes.forEach((midi, ni) => pressKey(midi, TRACK_COLORS[(ci + ni) % TRACK_COLORS.length]));
    });
    chordPanel.appendChild(btn);
  });
}

// ===== 스토리 생성 헬퍼 =====
function makePresetStory(presetKey) {
  return () => {
    const preset = LIGHTING_PRESETS[presetKey];
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;flex-direction:column;height:100vh;background:#111;';

    // 프리셋 이름 + 설명
    const header = document.createElement('div');
    header.style.cssText = 'padding:10px 14px;background:#1a1a2e;color:#ccc;font-size:14px;border-bottom:1px solid #333;';
    header.innerHTML = `<strong style="color:#fff">${preset.name}</strong> &mdash; ${preset.description}`;
    wrapper.appendChild(header);

    const sceneContainer = document.createElement('div');
    sceneContainer.style.cssText = 'flex:1;position:relative;';
    wrapper.appendChild(sceneContainer);

    createKeyButtons(wrapper);

    setTimeout(() => {
      const refs = createPianoScene(sceneContainer, preset);
      createLightingGui(sceneContainer, refs, preset);
    }, 0);
    return wrapper;
  };
}

// ===== 5개 조명 컨셉 스토리 =====
export const A_SoftSpotlight = makePresetStory('softSpotlight');
A_SoftSpotlight.storyName = 'A. Soft Spotlight';

export const B_WarmConcert = makePresetStory('warmConcert');
B_WarmConcert.storyName = 'B. Warm Concert Hall';

export const C_NeonLounge = makePresetStory('neonLounge');
C_NeonLounge.storyName = 'C. Neon Lounge';

export const D_MinimalDark = makePresetStory('minimalDark');
D_MinimalDark.storyName = 'D. Minimal Dark';

export const E_Cinematic = makePresetStory('cinematic');
E_Cinematic.storyName = 'E. Cinematic';

export const F_Sunlight = makePresetStory('sunlight');
F_Sunlight.storyName = 'F. Sunlight';
