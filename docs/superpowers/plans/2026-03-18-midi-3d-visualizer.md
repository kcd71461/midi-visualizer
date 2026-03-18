# 3D MIDI Visualizer 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 웹 브라우저에서 MIDI 파일을 3D 피아노 롤 스타일로 시각화하고 사운드폰트로 재생하는 애플리케이션 구현

**Architecture:** Vite 기반 바닐라 JS 프로젝트. Three.js로 3D 씬(우주 배경 + 피아노 건반 + 네온 글로우 노트 블록)을 렌더링하고, Tone.js Transport를 단일 시간 소스로 사용하여 오디오-비주얼을 동기화한다. 각 모듈(scene, piano, notes, audio, camera, controls, midi-parser)이 단일 책임을 갖고 main.js에서 조합한다.

**Tech Stack:** Vite, Three.js, @tonejs/midi, Tone.js, lil-gui

**Spec:** `docs/superpowers/specs/2026-03-18-midi-3d-visualizer-design.md`

---

## 파일 구조

| 파일 | 역할 |
|------|------|
| `package.json` | 의존성, 스크립트 |
| `vite.config.js` | Vite 설정 |
| `index.html` | 진입점, 캔버스 + 오버레이 UI |
| `src/main.js` | 앱 초기화, 상태 관리, 이벤트 바인딩, 메인 루프 |
| `src/scene.js` | Three.js 씬, 렌더러, 조명, 우주 배경, 블룸 후처리 |
| `src/piano.js` | 88건반 3D 모델, 건반 눌림 애니메이션 |
| `src/notes.js` | 트랙별 InstancedMesh 노트 블록, 시간 기반 컬링 |
| `src/midi-parser.js` | MIDI 파일 파싱, 내부 데이터 구조 변환 |
| `src/audio.js` | Tone.js Sampler 로딩, Transport 스케줄링, 음소거/볼륨 |
| `src/camera.js` | 고정/자유 시점, OrbitControls, 카메라 프리셋 |
| `src/controls.js` | lil-gui 패널, 시간 탐색 바, 파일 선택 UI |
| `src/constants.js` | 공유 상수 (건반 크기, 색상 팔레트, 카메라 위치 등) |
| `public/midi/pachelbel-canon.mid` | 내장 샘플 MIDI |
| `public/midi/summer.mid` | 내장 샘플 MIDI |

---

## Task 1: 프로젝트 스캐폴딩

**Files:**
- Create: `package.json`
- Create: `vite.config.js`
- Create: `index.html`
- Create: `src/main.js`
- Create: `src/constants.js`

- [ ] **Step 1: package.json 생성**

```json
{
  "name": "midi-visualizer",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  }
}
```

- [ ] **Step 2: 의존성 설치**

Run: `npm install three tone @tonejs/midi lil-gui`
Run: `npm install -D vite`

- [ ] **Step 3: vite.config.js 생성**

```js
import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  publicDir: 'public',
});
```

- [ ] **Step 4: index.html 생성**

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>3D MIDI Visualizer</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { overflow: hidden; background: #000; }
    #canvas-container { width: 100vw; height: 100vh; }
    canvas { display: block; }

    #loading-overlay {
      position: fixed; inset: 0;
      display: flex; align-items: center; justify-content: center;
      background: rgba(0, 0, 0, 0.85);
      color: #fff; font-family: sans-serif; font-size: 1.2rem;
      z-index: 100;
    }
    #loading-overlay.hidden { display: none; }

    #file-overlay {
      position: fixed; inset: 0;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      background: rgba(0, 0, 10, 0.9);
      color: #fff; font-family: sans-serif;
      z-index: 50;
    }
    #file-overlay.hidden { display: none; }

    #drop-zone {
      width: 400px; height: 200px;
      border: 2px dashed rgba(255, 255, 255, 0.3);
      border-radius: 16px;
      display: flex; align-items: center; justify-content: center;
      font-size: 1rem; color: rgba(255, 255, 255, 0.6);
      transition: border-color 0.2s, background 0.2s;
      cursor: pointer;
    }
    #drop-zone.drag-over {
      border-color: #4ecdc4;
      background: rgba(78, 205, 196, 0.1);
    }

    .sample-buttons {
      display: flex; gap: 12px; margin-top: 24px;
    }
    .sample-btn {
      padding: 10px 24px;
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 8px;
      color: #fff; font-size: 0.9rem;
      cursor: pointer;
      transition: background 0.2s;
    }
    .sample-btn:hover { background: rgba(255, 255, 255, 0.2); }

    #progress-bar-container {
      position: fixed; bottom: 0; left: 0; right: 0;
      height: 32px;
      background: rgba(0, 0, 0, 0.6);
      cursor: pointer;
      z-index: 30;
    }
    #progress-bar-container.hidden { display: none; }
    #progress-bar {
      height: 100%;
      background: linear-gradient(90deg, #4ecdc4, #a78bfa);
      width: 0%;
      transition: width 0.1s linear;
    }
    #progress-time {
      position: absolute; right: 8px; top: 50%;
      transform: translateY(-50%);
      color: rgba(255, 255, 255, 0.7);
      font-family: monospace; font-size: 0.75rem;
    }
  </style>
</head>
<body>
  <div id="canvas-container"></div>

  <div id="loading-overlay" class="hidden">
    <span>로딩 중...</span>
  </div>

  <div id="file-overlay">
    <h1 style="margin-bottom: 32px; font-weight: 300; letter-spacing: 2px;">
      3D MIDI Visualizer
    </h1>
    <div id="drop-zone">
      MIDI 파일을 여기에 드래그하거나 클릭하세요
    </div>
    <input type="file" id="file-input" accept=".mid,.midi" style="display:none" />
    <div class="sample-buttons">
      <button class="sample-btn" data-midi="midi/pachelbel-canon.mid">
        파헬벨 캐논
      </button>
      <button class="sample-btn" data-midi="midi/summer.mid">
        Summer (기쿠지로의 여름)
      </button>
    </div>
  </div>

  <div id="progress-bar-container" class="hidden">
    <div id="progress-bar"></div>
    <span id="progress-time">0:00 / 0:00</span>
  </div>

  <script type="module" src="/src/main.js"></script>
</body>
</html>
```

- [ ] **Step 5: src/constants.js 생성**

```js
// 피아노 건반 설정
export const PIANO = {
  TOTAL_KEYS: 88,
  FIRST_NOTE: 21, // A0 (MIDI note number)
  WHITE_KEY_WIDTH: 0.24,
  WHITE_KEY_HEIGHT: 0.15,
  WHITE_KEY_DEPTH: 1.5,
  BLACK_KEY_WIDTH: 0.14,
  BLACK_KEY_HEIGHT: 0.25,
  BLACK_KEY_DEPTH: 1.0,
  KEY_GAP: 0.02,
};

// 노트 블록 설정
export const NOTES = {
  SPEED: 10,           // 노트 이동 속도 (units/sec)
  LOOK_AHEAD: 5,       // 앞으로 몇 초 분량을 보여줄지
  BLOCK_HEIGHT: 0.12,
  MIN_BLOCK_DEPTH: 0.1,
};

// 트랙 색상 팔레트 (최대 16 트랙)
export const TRACK_COLORS = [
  0x4ecdc4, // 민트
  0xff6b6b, // 코랄
  0xa78bfa, // 보라
  0xffe66d, // 노랑
  0xf472b6, // 핑크
  0x34d399, // 초록
  0x60a5fa, // 파랑
  0xfbbf24, // 오렌지
  0xc084fc, // 라벤더
  0xf87171, // 빨강
  0x2dd4bf, // 청록
  0xfb923c, // 주황
  0x818cf8, // 인디고
  0xa3e635, // 라임
  0xe879f9, // 마젠타
  0x38bdf8, // 하늘
];

// 카메라 프리셋
export const CAMERA_PRESETS = {
  default: { x: 0, y: 12, z: 18, lookAt: [0, 0, -5] },
  front:   { x: 0, y: 3,  z: 20, lookAt: [0, 0, 0] },
  top:     { x: 0, y: 25, z: 0,  lookAt: [0, 0, -5] },
  side:    { x: 25, y: 8, z: 5,  lookAt: [0, 0, -5] },
};

// 앱 상태
export const AppState = {
  IDLE: 'idle',
  LOADING: 'loading',
  READY: 'ready',
  PLAYING: 'playing',
  PAUSED: 'paused',
  SEEKING: 'seeking',
};
```

- [ ] **Step 6: src/main.js 최소 진입점 생성**

```js
import { AppState } from './constants.js';

const state = {
  current: AppState.IDLE,
  midiData: null,
  playbackSpeed: 1.0,
  volume: 80,
  muted: false,
};

function init() {
  console.log('3D MIDI Visualizer initialized');
}

init();
```

- [ ] **Step 7: 브라우저에서 확인**

Run: `npx vite --open`
Expected: 브라우저에서 검정 배경 + 파일 선택 오버레이 표시, 콘솔에 "3D MIDI Visualizer initialized" 출력

- [ ] **Step 8: 커밋**

```bash
git add package.json package-lock.json vite.config.js index.html src/main.js src/constants.js
git commit -m "feat: scaffold Vite project with dependencies and HTML shell"
```

---

## Task 2: Three.js 씬 + 우주 배경

**Files:**
- Create: `src/scene.js`
- Modify: `src/main.js`

- [ ] **Step 1: src/scene.js 생성 — 렌더러, 씬, 조명**

```js
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

  // 렌더러
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  container.appendChild(renderer.domElement);

  // 씬
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020010);
  scene.fog = new THREE.FogExp2(0x020010, 0.008);

  // 조명
  const ambientLight = new THREE.AmbientLight(0x404060, 0.5);
  scene.add(ambientLight);

  // 우주 배경 — 별 파티클
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
    1.5,  // strength
    0.4,  // radius
    0.85  // threshold
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
```

- [ ] **Step 2: main.js 수정 — 씬 초기화 + 렌더 루프**

```js
import { AppState } from './constants.js';
import { createScene, setupPostProcessing, updateScene, renderScene, handleResize } from './scene.js';
import * as THREE from 'three';

const state = {
  current: AppState.IDLE,
  midiData: null,
  playbackSpeed: 1.0,
  volume: 80,
  muted: false,
};

let camera;
const clock = new THREE.Clock();

function init() {
  const container = document.getElementById('canvas-container');

  // 카메라
  camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 500);
  camera.position.set(0, 12, 18);
  camera.lookAt(0, 0, -5);

  // 씬
  const { scene } = createScene(container);
  scene.userData.camera = camera;
  setupPostProcessing(camera);

  // 리사이즈
  window.addEventListener('resize', () => handleResize(camera, container));

  // 렌더 루프
  animate();
}

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  updateScene(delta);
  renderScene();
}

init();
```

- [ ] **Step 3: 브라우저에서 확인**

Run: `npx vite --open`
Expected: 검정~짙은 남색 배경에 별이 천천히 회전하며 반짝이는 3D 씬, 블룸 효과 적용됨

- [ ] **Step 4: 커밋**

```bash
git add src/scene.js src/main.js
git commit -m "feat: add Three.js scene with starfield background and bloom"
```

---

## Task 3: 3D 피아노 건반

**Files:**
- Create: `src/piano.js`
- Modify: `src/main.js`

- [ ] **Step 1: src/piano.js 생성**

```js
import * as THREE from 'three';
import { PIANO } from './constants.js';

const keys = [];         // { mesh, midiNote, isBlack, baseY }
const activeKeys = {};   // midiNote -> timeout handle
const keyXLookup = {};   // midiNote -> X position (precomputed)
const keyWidthLookup = {}; // midiNote -> width (precomputed)

// 흰 건반인지 판별 (C, D, E, F, G, A, B 중 흰 건반)
function isWhiteKey(midiNote) {
  const n = midiNote % 12;
  return [0, 2, 4, 5, 7, 9, 11].includes(n);
}

export function createPiano(scene) {
  const whiteKeyGeo = new THREE.BoxGeometry(
    PIANO.WHITE_KEY_WIDTH, PIANO.WHITE_KEY_HEIGHT, PIANO.WHITE_KEY_DEPTH
  );
  const blackKeyGeo = new THREE.BoxGeometry(
    PIANO.BLACK_KEY_WIDTH, PIANO.BLACK_KEY_HEIGHT, PIANO.BLACK_KEY_DEPTH
  );

  const whiteMat = new THREE.MeshStandardMaterial({
    color: 0xeeeeee,
    roughness: 0.3,
    metalness: 0.1,
  });
  const blackMat = new THREE.MeshStandardMaterial({
    color: 0x111111,
    roughness: 0.4,
    metalness: 0.2,
  });

  let whiteIndex = 0;

  for (let i = 0; i < PIANO.TOTAL_KEYS; i++) {
    const midiNote = PIANO.FIRST_NOTE + i;
    const white = isWhiteKey(midiNote);

    if (white) {
      const mesh = new THREE.Mesh(whiteKeyGeo, whiteMat.clone());
      const x = (whiteIndex - 26) * (PIANO.WHITE_KEY_WIDTH + PIANO.KEY_GAP);
      mesh.position.set(x, 0, 0);
      scene.add(mesh);
      keys.push({ mesh, midiNote, isBlack: false, baseY: 0 });
      whiteIndex++;
    } else {
      const mesh = new THREE.Mesh(blackKeyGeo, blackMat.clone());
      // 검은 건반은 이전 흰 건반과 다음 흰 건반 사이에 위치
      const x = (whiteIndex - 26 - 0.5) * (PIANO.WHITE_KEY_WIDTH + PIANO.KEY_GAP);
      mesh.position.set(x, PIANO.BLACK_KEY_HEIGHT / 2, -0.25);
      scene.add(mesh);
      keys.push({ mesh, midiNote, isBlack: true, baseY: PIANO.BLACK_KEY_HEIGHT / 2 });
    }
  }

  // X 좌표 룩업 테이블 사전 계산
  let wi = 0;
  for (let i = 0; i < PIANO.TOTAL_KEYS; i++) {
    const mn = PIANO.FIRST_NOTE + i;
    if (isWhiteKey(mn)) {
      keyXLookup[mn] = (wi - 26) * (PIANO.WHITE_KEY_WIDTH + PIANO.KEY_GAP);
      keyWidthLookup[mn] = PIANO.WHITE_KEY_WIDTH;
      wi++;
    } else {
      keyXLookup[mn] = (wi - 26 - 0.5) * (PIANO.WHITE_KEY_WIDTH + PIANO.KEY_GAP);
      keyWidthLookup[mn] = PIANO.BLACK_KEY_WIDTH;
    }
  }

  return keys;
}

// 건반 X 좌표 (사전 계산된 룩업 테이블 사용, O(1))
export function getKeyX(midiNote) {
  return keyXLookup[midiNote] ?? 0;
}

// 건반 눌림 애니메이션 + 글로우
export function pressKey(midiNote, color) {
  const key = keys.find(k => k.midiNote === midiNote);
  if (!key) return;

  // 이전 타이머 해제
  if (activeKeys[midiNote]) clearTimeout(activeKeys[midiNote]);

  key.mesh.position.y = key.baseY - 0.05;
  key.mesh.material.emissive.setHex(color);
  key.mesh.material.emissiveIntensity = 0.8;

  activeKeys[midiNote] = setTimeout(() => {
    key.mesh.position.y = key.baseY;
    key.mesh.material.emissive.setHex(0x000000);
    key.mesh.material.emissiveIntensity = 0;
    delete activeKeys[midiNote];
  }, 200);
}

export function getKeyWidth(midiNote) {
  return keyWidthLookup[midiNote] ?? PIANO.WHITE_KEY_WIDTH;
}
```

- [ ] **Step 2: main.js에 피아노 추가**

`main.js`의 `init()` 함수에서 씬 생성 후 추가:

```js
import { createPiano } from './piano.js';
```

`init()` 내부, `setupPostProcessing(camera)` 뒤에 추가:

```js
createPiano(scene);
```

- [ ] **Step 3: 브라우저에서 확인**

Expected: 우주 배경 앞에 88건반 피아노가 가로로 배치되어 보임. 흰 건반과 검은 건반이 올바르게 구분됨.

- [ ] **Step 4: 커밋**

```bash
git add src/piano.js src/main.js
git commit -m "feat: add 3D piano keyboard with 88 keys"
```

---

## Task 4: MIDI 파서

**Files:**
- Create: `src/midi-parser.js`

- [ ] **Step 1: src/midi-parser.js 생성**

```js
import { Midi } from '@tonejs/midi';

/**
 * MIDI 파일을 파싱하여 내부 데이터 구조로 변환
 * @param {ArrayBuffer} arrayBuffer - MIDI 파일 바이너리
 * @returns {{ tracks: Array, duration: number, name: string }}
 */
export function parseMidi(arrayBuffer) {
  const midi = new Midi(arrayBuffer);

  const tracks = midi.tracks
    .map((track, index) => {
      const notes = track.notes.map(note => ({
        midi: note.midi,
        time: note.time,
        duration: note.duration,
        velocity: note.velocity,
        name: note.name,
      }));

      return {
        index,
        name: track.name || `Track ${index + 1}`,
        channel: track.channel,
        notes,
        visible: track.channel !== 9, // 채널 10(인덱스 9) 퍼커션 기본 숨김
        color: null, // controls.js에서 설정
      };
    })
    .filter(track => track.notes.length > 0);

  const duration = midi.duration;
  const name = midi.name || 'Untitled';

  return { tracks, duration, name };
}

/**
 * URL에서 MIDI 파일을 로드하고 파싱
 */
export async function loadMidiFromUrl(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`MIDI 파일 로드 실패: ${url}`);
  const arrayBuffer = await response.arrayBuffer();
  return parseMidi(arrayBuffer);
}

/**
 * File 객체에서 MIDI 파일을 파싱
 */
export async function loadMidiFromFile(file) {
  const arrayBuffer = await file.arrayBuffer();
  return parseMidi(arrayBuffer);
}
```

- [ ] **Step 2: 콘솔에서 파싱 테스트**

`main.js`에 임시 테스트 코드 추가:

```js
import { loadMidiFromUrl } from './midi-parser.js';
// init() 내부에 임시 추가:
loadMidiFromUrl('midi/pachelbel-canon.mid').then(data => {
  console.log('MIDI parsed:', data.name, data.tracks.length, 'tracks', data.duration.toFixed(1) + 's');
});
```

Expected: 콘솔에 트랙 수와 곡 길이가 출력됨. (샘플 MIDI 파일이 아직 없으면 다음 Task에서 추가 후 테스트)

- [ ] **Step 3: 커밋**

```bash
git add src/midi-parser.js
git commit -m "feat: add MIDI file parser with track/note extraction"
```

---

## Task 5: 샘플 MIDI 파일 준비

**Files:**
- Create: `public/midi/pachelbel-canon.mid`
- Create: `public/midi/summer.mid`

- [ ] **Step 1: public/midi/ 디렉토리 생성**

Run: `mkdir -p public/midi`

- [ ] **Step 2: 샘플 MIDI 파일 배치**

파헬벨 캐논과 Summer MIDI 파일을 `public/midi/` 에 배치한다.
무료 MIDI 소스에서 다운로드하거나 직접 준비한다.

> 참고: MIDI 파일은 바이너리이므로 코드로 생성하기 어렵다.
> 사용자가 직접 MIDI 파일을 준비하여 `public/midi/` 에 넣어야 한다.
> 테스트용으로 `@tonejs/midi`를 사용해 간단한 MIDI를 프로그래밍 방식으로 생성할 수도 있다.

- [ ] **Step 3: 파싱 테스트 실행**

브라우저에서 `npx vite --open` 실행 후 콘솔에서 파싱 결과 확인.

- [ ] **Step 4: 커밋**

```bash
git add public/midi/
git commit -m "feat: add sample MIDI files"
```

---

## Task 6: 오디오 엔진 (Tone.js)

**Files:**
- Create: `src/audio.js`

- [ ] **Step 1: src/audio.js 생성**

```js
import * as Tone from 'tone';

let sampler = null;
let scheduledEvents = [];
let isLoaded = false;

const SOUNDFONT_URL = 'https://tonejs.github.io/audio/salamander/';

/**
 * 피아노 사운드폰트 로딩
 * @returns {Promise<void>}
 */
export async function loadSampler() {
  if (sampler) return;

  sampler = new Tone.Sampler({
    urls: {
      A0: 'A0.mp3', C1: 'C1.mp3', 'D#1': 'Ds1.mp3', 'F#1': 'Fs1.mp3',
      A1: 'A1.mp3', C2: 'C2.mp3', 'D#2': 'Ds2.mp3', 'F#2': 'Fs2.mp3',
      A2: 'A2.mp3', C3: 'C3.mp3', 'D#3': 'Ds3.mp3', 'F#3': 'Fs3.mp3',
      A3: 'A3.mp3', C4: 'C4.mp3', 'D#4': 'Ds4.mp3', 'F#4': 'Fs4.mp3',
      A4: 'A4.mp3', C5: 'C5.mp3', 'D#5': 'Ds5.mp3', 'F#5': 'Fs5.mp3',
      A5: 'A5.mp3', C6: 'C6.mp3', 'D#6': 'Ds6.mp3', 'F#6': 'Fs6.mp3',
      A6: 'A6.mp3', C7: 'C7.mp3', 'D#7': 'Ds7.mp3', 'F#7': 'Fs7.mp3',
      A7: 'A7.mp3', C8: 'C8.mp3',
    },
    release: 1,
    baseUrl: SOUNDFONT_URL,
  }).toDestination();

  return new Promise((resolve) => {
    Tone.loaded().then(() => {
      isLoaded = true;
      resolve();
    });
  });
}

/**
 * MIDI 데이터의 모든 노트를 Tone.Transport에 스케줄링
 * @param {{ tracks: Array }} midiData
 * @param {Function} onNoteHit - (midiNote, trackIndex, velocity) 콜백 (비주얼용)
 */
export function scheduleNotes(midiData, onNoteHit) {
  clearSchedule();
  lastMidiData = midiData;
  lastNoteHitCallback = onNoteHit;

  midiData.tracks.forEach((track, trackIndex) => {
    if (!track.visible) return;

    track.notes.forEach(note => {
      const eventId = Tone.Transport.schedule((time) => {
        if (sampler && isLoaded) {
          sampler.triggerAttackRelease(
            Tone.Frequency(note.midi, 'midi').toNote(),
            note.duration,
            time,
            note.velocity
          );
        }
        // 비주얼 콜백은 Draw를 통해 rAF에 맞춤
        Tone.Draw.schedule(() => {
          if (onNoteHit) onNoteHit(note.midi, trackIndex, note.velocity);
        }, time);
      }, note.time);

      scheduledEvents.push(eventId);
    });
  });
}

/**
 * 스케줄 초기화
 */
export function clearSchedule() {
  scheduledEvents.forEach(id => Tone.Transport.clear(id));
  scheduledEvents = [];
}

/**
 * 재생 시작 (AudioContext 활성화 포함)
 */
export async function startPlayback() {
  await Tone.start();
  Tone.Transport.start();
}

/**
 * 일시정지
 */
export function pausePlayback() {
  Tone.Transport.pause();
}

/**
 * 정지 및 처음으로
 */
export function stopPlayback() {
  Tone.Transport.stop();
  Tone.Transport.position = 0;
}

// 재스케줄링에 필요한 참조 보관
let lastMidiData = null;
let lastNoteHitCallback = null;

/**
 * 특정 시간으로 이동 (오디오 재스케줄링 포함)
 */
export function seekTo(seconds) {
  const wasPlaying = Tone.Transport.state === 'started';
  Tone.Transport.pause();
  Tone.Transport.seconds = seconds;

  // 기존 스케줄 제거 후 재스케줄링 (지나간 노트 다시 재생 가능하도록)
  if (lastMidiData && lastNoteHitCallback) {
    clearSchedule();
    scheduleNotes(lastMidiData, lastNoteHitCallback);
  }

  if (wasPlaying) Tone.Transport.start();
}

/**
 * 재생 속도 설정 (1.0 = 기본)
 * 노트가 절대 시간(초)으로 스케줄링되므로 playbackRate 사용
 */
export function setPlaybackSpeed(rate) {
  Tone.Transport.playbackRate = rate;
}

/**
 * 음소거 토글
 */
export function setMuted(muted) {
  Tone.Destination.mute = muted;
}

/**
 * 볼륨 설정 (0~100)
 */
export function setVolume(value) {
  // 0~100 -> -60dB ~ 0dB
  const db = value <= 0 ? -Infinity : (value / 100) * 60 - 60;
  Tone.Destination.volume.value = db;
}

/**
 * 현재 재생 시간 (초)
 */
export function getCurrentTime() {
  return Tone.Transport.seconds;
}

/**
 * Transport 상태
 */
export function getTransportState() {
  return Tone.Transport.state; // 'started' | 'stopped' | 'paused'
}

/**
 * 리소스 해제
 */
export function disposeAudio() {
  clearSchedule();
  Tone.Transport.stop();
  Tone.Transport.cancel();
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/audio.js
git commit -m "feat: add Tone.js audio engine with Transport scheduling"
```

---

## Task 7: 노트 블록 렌더링

**Files:**
- Create: `src/notes.js`
- Modify: `src/main.js`

- [ ] **Step 1: src/notes.js 생성**

```js
import * as THREE from 'three';
import { NOTES, TRACK_COLORS } from './constants.js';
import { getKeyX, getKeyWidth } from './piano.js';

const trackMeshes = [];  // { instancedMesh, matrix, noteData[], color }
const dummy = new THREE.Object3D();
const tempColor = new THREE.Color(); // 재사용 Color 인스턴스 (GC 방지)

/**
 * 파싱된 MIDI 데이터로 트랙별 InstancedMesh 생성
 * @param {THREE.Scene} scene
 * @param {{ tracks: Array }} midiData
 */
export function createNoteBlocks(scene, midiData) {
  disposeNotes(scene);

  const geometry = new THREE.BoxGeometry(1, NOTES.BLOCK_HEIGHT, 1);

  midiData.tracks.forEach((track, trackIndex) => {
    if (!track.visible || track.notes.length === 0) return;

    const color = track.color || TRACK_COLORS[trackIndex % TRACK_COLORS.length];

    const material = new THREE.MeshStandardMaterial({
      color: color,
      emissive: color,
      emissiveIntensity: 0.6,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      roughness: 0.2,
      metalness: 0.1,
    });

    const maxVisible = track.notes.length;
    const instancedMesh = new THREE.InstancedMesh(geometry, material, maxVisible);
    instancedMesh.count = 0; // 시작시 0개
    instancedMesh.frustumCulled = false;

    scene.add(instancedMesh);

    trackMeshes.push({
      instancedMesh,
      notes: track.notes,
      trackIndex,
      color,
      visible: track.visible,
    });
  });
}

/**
 * 현재 시간 기준으로 노트 블록 위치 업데이트
 * @param {number} currentTime - 현재 재생 시간 (초)
 */
export function updateNotePositions(currentTime) {
  const lookAhead = NOTES.LOOK_AHEAD;

  trackMeshes.forEach(trackMesh => {
    if (!trackMesh.visible) {
      trackMesh.instancedMesh.count = 0;
      return;
    }

    let instanceIndex = 0;

    for (const note of trackMesh.notes) {
      const noteEnd = note.time + note.duration;

      // 시간 기반 컬링: 이미 지나갔거나 너무 먼 미래
      if (noteEnd < currentTime - 0.5 || note.time > currentTime + lookAhead) {
        continue;
      }

      // Z 위치: 현재 시간과의 차이 기반 (앞으로 이동)
      const z = -(note.time - currentTime) * NOTES.SPEED;

      // X 위치: 건반 위치에 맞춤
      const x = getKeyX(note.midi);

      // 블록 크기: 노트 길이에 비례
      const depth = Math.max(note.duration * NOTES.SPEED, NOTES.MIN_BLOCK_DEPTH);
      const width = getKeyWidth(note.midi);

      dummy.position.set(x, 1.5, z - depth / 2);
      dummy.scale.set(width, 1, depth);
      dummy.updateMatrix();
      trackMesh.instancedMesh.setMatrixAt(instanceIndex, dummy.matrix);

      // 벨로시티에 따른 색상 밝기 (tempColor 재사용으로 GC 방지)
      tempColor.setHex(trackMesh.color);
      tempColor.multiplyScalar(0.5 + note.velocity * 0.5);
      trackMesh.instancedMesh.setColorAt(instanceIndex, tempColor);

      instanceIndex++;
    }

    trackMesh.instancedMesh.count = instanceIndex;
    trackMesh.instancedMesh.instanceMatrix.needsUpdate = true;
    if (trackMesh.instancedMesh.instanceColor) {
      trackMesh.instancedMesh.instanceColor.needsUpdate = true;
    }
  });
}

/**
 * 트랙 가시성 설정
 */
export function setTrackVisible(trackIndex, visible) {
  const tm = trackMeshes.find(t => t.trackIndex === trackIndex);
  if (tm) tm.visible = visible;
}

/**
 * 트랙 색상 변경
 */
export function setTrackColor(trackIndex, color) {
  const tm = trackMeshes.find(t => t.trackIndex === trackIndex);
  if (tm) {
    tm.color = color;
    tm.instancedMesh.material.color.setHex(color);
    tm.instancedMesh.material.emissive.setHex(color);
  }
}

/**
 * 리소스 해제
 */
export function disposeNotes(scene) {
  trackMeshes.forEach(tm => {
    scene.remove(tm.instancedMesh);
    tm.instancedMesh.geometry.dispose();
    tm.instancedMesh.material.dispose();
  });
  trackMeshes.length = 0;
}
```

- [ ] **Step 2: main.js에 노트 업데이트 통합**

`main.js`에 import 추가:

```js
import { createNoteBlocks, updateNotePositions } from './notes.js';
import { getCurrentTime } from './audio.js';
```

`animate()` 함수 내에서 `updateScene(delta)` 뒤에 추가:

```js
if (state.current === AppState.PLAYING || state.current === AppState.PAUSED) {
  updateNotePositions(getCurrentTime());
}
```

- [ ] **Step 3: 브라우저에서 확인**

Expected: (아직 재생 로직 미연결이므로) 코드 에러 없이 동작. 다음 Task에서 전체 연결 후 확인.

- [ ] **Step 4: 커밋**

```bash
git add src/notes.js src/main.js
git commit -m "feat: add instanced note blocks with time-based culling"
```

---

## Task 8: 카메라 컨트롤

**Files:**
- Create: `src/camera.js`
- Modify: `src/main.js`

- [ ] **Step 1: src/camera.js 생성**

```js
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as THREE from 'three';
import { CAMERA_PRESETS } from './constants.js';

let controls = null;
let camera = null;
let freeMode = false;

export function setupCamera(cam, domElement) {
  camera = cam;

  controls = new OrbitControls(camera, domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.enabled = false; // 기본은 고정 모드

  applyPreset('default');

  return controls;
}

export function applyPreset(presetName) {
  const preset = CAMERA_PRESETS[presetName];
  if (!preset) return;

  camera.position.set(preset.x, preset.y, preset.z);
  camera.lookAt(...preset.lookAt);

  if (controls) {
    controls.target.set(...preset.lookAt);
    controls.update();
  }
}

export function setFreeMode(free) {
  freeMode = free;
  if (controls) {
    controls.enabled = free;
  }
  if (!free) {
    applyPreset('default');
  }
}

export function isFreeMode() {
  return freeMode;
}

export function updateCamera() {
  if (controls && controls.enabled) {
    controls.update();
  }
}
```

- [ ] **Step 2: main.js에 카메라 컨트롤 연결**

```js
import { setupCamera, updateCamera } from './camera.js';
```

`init()` 내부, 렌더러 생성 후:

```js
const { renderer, scene } = createScene(container);
setupCamera(camera, renderer.domElement);
```

`animate()` 내부에 추가:

```js
updateCamera();
```

- [ ] **Step 3: 커밋**

```bash
git add src/camera.js src/main.js
git commit -m "feat: add camera controls with fixed/free modes and presets"
```

---

## Task 9: UI 컨트롤 (lil-gui) + 파일 로딩

**Files:**
- Create: `src/controls.js`
- Modify: `src/main.js`

- [ ] **Step 1: src/controls.js 생성**

```js
import GUI from 'lil-gui';
import { TRACK_COLORS } from './constants.js';

let gui = null;
let trackFolder = null;

/**
 * lil-gui 패널 생성
 * @param {Object} callbacks - { onPlay, onPause, onSpeedChange, onMuteToggle, onVolumeChange, onCameraMode, onCameraPreset }
 */
export function createControls(state, callbacks) {
  gui = new GUI({ title: '🎹 MIDI Visualizer' });

  // 재생 컨트롤
  const playback = gui.addFolder('재생');
  const playObj = { '재생/일시정지': () => callbacks.onPlayPause() };
  playback.add(playObj, '재생/일시정지');
  playback.add(state, 'playbackSpeed', 0.25, 2.0, 0.25).name('속도').onChange(callbacks.onSpeedChange);
  playback.open();

  // 오디오 컨트롤
  const audio = gui.addFolder('오디오');
  audio.add(state, 'muted').name('음소거').onChange(callbacks.onMuteToggle);
  audio.add(state, 'volume', 0, 100, 1).name('볼륨').onChange(callbacks.onVolumeChange);
  audio.open();

  // 카메라 컨트롤
  const cam = gui.addFolder('카메라');
  const camObj = {
    freeMode: false,
    '정면': () => callbacks.onCameraPreset('front'),
    '위에서': () => callbacks.onCameraPreset('top'),
    '측면': () => callbacks.onCameraPreset('side'),
    '기본': () => callbacks.onCameraPreset('default'),
  };
  cam.add(camObj, 'freeMode').name('자유 시점').onChange(callbacks.onCameraMode);
  cam.add(camObj, '기본');
  cam.add(camObj, '정면');
  cam.add(camObj, '위에서');
  cam.add(camObj, '측면');
  cam.open();

  return gui;
}

/**
 * 트랙 폴더 생성 (MIDI 로드 후)
 * @param {{ tracks: Array }} midiData
 * @param {Object} callbacks - { onTrackVisibility, onTrackColor }
 */
export function createTrackControls(midiData, callbacks) {
  if (trackFolder) {
    trackFolder.destroy();
  }

  trackFolder = gui.addFolder('트랙');

  midiData.tracks.forEach((track, index) => {
    const folder = trackFolder.addFolder(track.name);
    const obj = {
      visible: track.visible,
      color: '#' + (track.color || TRACK_COLORS[index % TRACK_COLORS.length]).toString(16).padStart(6, '0'),
    };
    folder.add(obj, 'visible').name('표시').onChange(v => callbacks.onTrackVisibility(index, v));
    folder.addColor(obj, 'color').name('색상').onChange(v => {
      callbacks.onTrackColor(index, parseInt(v.replace('#', ''), 16));
    });
  });

  trackFolder.open();
}

/**
 * 파일 선택 UI 이벤트 바인딩
 */
export function setupFileUI(onFileLoaded) {
  const fileOverlay = document.getElementById('file-overlay');
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const sampleBtns = document.querySelectorAll('.sample-btn');

  // 드래그 앤 드롭
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });
  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
  });
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) onFileLoaded({ type: 'file', file });
  });

  // 클릭으로 파일 선택
  dropZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) onFileLoaded({ type: 'file', file });
  });

  // 샘플 버튼
  sampleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const url = btn.dataset.midi;
      onFileLoaded({ type: 'url', url });
    });
  });
}

/**
 * 프로그레스 바 업데이트
 */
export function updateProgressBar(currentTime, duration) {
  const bar = document.getElementById('progress-bar');
  const timeDisplay = document.getElementById('progress-time');
  if (!bar || !timeDisplay) return;

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;
  bar.style.width = pct + '%';

  const fmt = (s) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };
  timeDisplay.textContent = `${fmt(currentTime)} / ${fmt(duration)}`;
}

/**
 * 프로그레스 바 클릭 탐색
 */
export function setupProgressBar(onSeek) {
  const container = document.getElementById('progress-bar-container');
  container.addEventListener('click', (e) => {
    const rect = container.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    onSeek(ratio);
  });
}

/**
 * 오버레이 표시/숨기기
 */
export function showFileOverlay(show) {
  document.getElementById('file-overlay').classList.toggle('hidden', !show);
}

export function showLoadingOverlay(show) {
  document.getElementById('loading-overlay').classList.toggle('hidden', !show);
}

export function showProgressBar(show) {
  document.getElementById('progress-bar-container').classList.toggle('hidden', !show);
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/controls.js
git commit -m "feat: add lil-gui controls, file upload UI, and progress bar"
```

---

## Task 10: 전체 통합 (main.js)

**Files:**
- Modify: `src/main.js`

- [ ] **Step 1: main.js 전체 통합 — 상태 관리 + 이벤트 연결**

```js
import * as THREE from 'three';
import { AppState, TRACK_COLORS } from './constants.js';
import { createScene, setupPostProcessing, updateScene, renderScene, handleResize, getScene } from './scene.js';
import { createPiano, pressKey } from './piano.js';
import { createNoteBlocks, updateNotePositions, setTrackVisible, setTrackColor, disposeNotes } from './notes.js';
import { loadMidiFromUrl, loadMidiFromFile } from './midi-parser.js';
import {
  loadSampler, scheduleNotes, clearSchedule,
  startPlayback, pausePlayback, stopPlayback, seekTo,
  setPlaybackSpeed, setMuted, setVolume, getCurrentTime, disposeAudio
} from './audio.js';
import { setupCamera, updateCamera, setFreeMode, applyPreset } from './camera.js';
import {
  createControls, createTrackControls, setupFileUI,
  updateProgressBar, setupProgressBar,
  showFileOverlay, showLoadingOverlay, showProgressBar
} from './controls.js';

const state = {
  current: AppState.IDLE,
  midiData: null,
  playbackSpeed: 1.0,
  volume: 80,
  muted: false,
};

let camera, scene;
const clock = new THREE.Clock();

function setState(newState) {
  state.current = newState;
}

async function handleFileLoaded(source) {
  try {
    setState(AppState.LOADING);
    showFileOverlay(false);
    showLoadingOverlay(true);
    showProgressBar(false);

    // 기존 리소스 정리
    if (state.midiData) {
      disposeNotes(scene);
      disposeAudio();
    }

    // MIDI 파싱
    let midiData;
    if (source.type === 'url') {
      midiData = await loadMidiFromUrl(source.url);
    } else {
      midiData = await loadMidiFromFile(source.file);
    }

    // 트랙 색상 할당
    midiData.tracks.forEach((track, i) => {
      track.color = TRACK_COLORS[i % TRACK_COLORS.length];
    });

    state.midiData = midiData;

    // 사운드폰트 로딩 (최초 1회, 실패 시 음소거 폴백)
    try {
      await loadSampler();
    } catch (err) {
      console.warn('사운드폰트 로딩 실패, 음소거 모드로 전환:', err);
      state.muted = true;
      setMuted(true);
    }

    // 노트 블록 생성
    createNoteBlocks(scene, midiData);

    // 오디오 스케줄링
    scheduleNotes(midiData, (midiNote, trackIndex, velocity) => {
      const color = midiData.tracks[trackIndex]?.color || 0xffffff;
      pressKey(midiNote, color);
    });

    // 트랙 컨트롤 UI 생성
    createTrackControls(midiData, {
      onTrackVisibility: (index, visible) => {
        midiData.tracks[index].visible = visible;
        setTrackVisible(index, visible);
        // 오디오도 재스케줄링
        clearSchedule();
        scheduleNotes(midiData, (midiNote, trackIndex, velocity) => {
          const color = midiData.tracks[trackIndex]?.color || 0xffffff;
          pressKey(midiNote, color);
        });
      },
      onTrackColor: (index, color) => {
        midiData.tracks[index].color = color;
        setTrackColor(index, color);
      },
    });

    showLoadingOverlay(false);
    showProgressBar(true);
    setState(AppState.READY);

  } catch (err) {
    console.error('MIDI 로드 실패:', err);
    showLoadingOverlay(false);
    showFileOverlay(true);
    setState(AppState.IDLE);
    alert('MIDI 파일을 로드할 수 없습니다: ' + err.message);
  }
}

function togglePlayPause() {
  if (state.current === AppState.READY || state.current === AppState.PAUSED) {
    startPlayback();
    setState(AppState.PLAYING);
  } else if (state.current === AppState.PLAYING) {
    pausePlayback();
    setState(AppState.PAUSED);
  }
}

function init() {
  const container = document.getElementById('canvas-container');

  // 카메라
  camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 500);

  // 씬
  const sceneResult = createScene(container);
  scene = sceneResult.scene;
  scene.userData.camera = camera;

  setupPostProcessing(camera);
  setupCamera(camera, sceneResult.renderer.domElement);
  createPiano(scene);

  // 리사이즈
  window.addEventListener('resize', () => handleResize(camera, container));

  // UI 컨트롤
  createControls(state, {
    onPlayPause: togglePlayPause,
    onSpeedChange: (speed) => setPlaybackSpeed(speed),
    onMuteToggle: (muted) => setMuted(muted),
    onVolumeChange: (vol) => setVolume(vol),
    onCameraMode: (free) => setFreeMode(free),
    onCameraPreset: (preset) => applyPreset(preset),
  });

  // 파일 선택 UI
  setupFileUI(handleFileLoaded);

  // 프로그레스 바 탐색
  setupProgressBar((ratio) => {
    if (state.midiData) {
      seekTo(ratio * state.midiData.duration);
    }
  });

  // 키보드 단축키
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') { e.preventDefault(); togglePlayPause(); }
    if (e.code === 'KeyM') { state.muted = !state.muted; setMuted(state.muted); }
  });

  // 렌더 루프
  animate();
}

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();

  updateScene(delta);
  updateCamera();

  if (state.current === AppState.PLAYING || state.current === AppState.PAUSED) {
    const t = getCurrentTime();
    updateNotePositions(t);
    if (state.midiData) {
      updateProgressBar(t, state.midiData.duration);
    }

    // 재생 완료 체크
    if (state.current === AppState.PLAYING && state.midiData && t >= state.midiData.duration) {
      stopPlayback();
      setState(AppState.READY);
    }
  }

  renderScene();
}

init();
```

- [ ] **Step 2: 브라우저에서 전체 기능 확인**

Run: `npx vite --open`

확인 사항:
1. 파일 선택 오버레이 표시
2. 샘플 버튼 클릭 → 로딩 → 3D 씬에 노트 블록 표시
3. 재생/일시정지 동작 (Space 키 또는 GUI 버튼)
4. 노트가 뒤에서 앞으로 이동하며 건반 도달 시 소리 + 건반 애니메이션
5. 프로그레스 바 업데이트
6. 카메라 시점 전환
7. 트랙 표시/숨기기, 색상 변경
8. 음소거/볼륨 조절
9. 파일 드래그 앤 드롭

- [ ] **Step 3: 커밋**

```bash
git add src/main.js
git commit -m "feat: integrate all modules with state management and event wiring"
```

---

## Task 11: 폴리싱 및 마무리

**Files:**
- Modify: `src/scene.js` (블룸 파라미터 미세 조정)
- Modify: `src/notes.js` (건반 도달 시 빛 번쩍임 효과)
- Modify: `src/constants.js` (파라미터 미세 조정)
- Modify: `.gitignore` (node_modules, dist 추가)

- [ ] **Step 1: .gitignore 업데이트**

`.gitignore`에 추가:

```
node_modules/
dist/
.superpowers/
```

- [ ] **Step 2: 노트 도달 시 빛 번쩍임 효과 추가**

`src/notes.js`에서 노트가 Z=0 (건반 위치) 근처에 도달했을 때 emissiveIntensity를 잠시 높이는 로직 확인 및 조정. (pressKey 콜백이 이미 audio.js의 Tone.Draw.schedule을 통해 호출됨)

- [ ] **Step 3: 블룸 파라미터 미세 조정**

`src/scene.js`의 `UnrealBloomPass` 파라미터를 시각적으로 확인하며 조정:
- strength: 1.0 ~ 2.0 범위에서 시험
- radius: 0.3 ~ 0.6
- threshold: 0.7 ~ 0.9

- [ ] **Step 4: 전체 기능 최종 확인**

모든 기능이 정상 동작하는지 브라우저에서 확인:
- 두 샘플 곡 모두 재생
- 사용자 MIDI 파일 업로드
- 모든 UI 컨트롤
- 카메라 프리셋 전환
- 재생 속도 변경
- 프로그레스 바 탐색

- [ ] **Step 5: 최종 커밋**

```bash
git add -A
git commit -m "feat: polish bloom effects and finalize 3D MIDI visualizer"
```

---

## 요약

| Task | 내용 | 의존성 |
|------|------|--------|
| 1 | 프로젝트 스캐폴딩 | 없음 |
| 2 | Three.js 씬 + 우주 배경 | Task 1 |
| 3 | 3D 피아노 건반 | Task 2 |
| 4 | MIDI 파서 | Task 1 |
| 5 | 샘플 MIDI 파일 | Task 4 |
| 6 | 오디오 엔진 | Task 1 |
| 7 | 노트 블록 렌더링 | Task 3 |
| 8 | 카메라 컨트롤 | Task 2 |
| 9 | UI 컨트롤 + 파일 로딩 | Task 1 |
| 10 | 전체 통합 | Task 3~9 |
| 11 | 폴리싱 및 마무리 | Task 10 |
