import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { PIANO } from './constants.js';

const keys = [];
const activeKeys = {};
const keyXLookup = {};
const keyWidthLookup = {};

// 활성 애니메이션 관리 맵 (중복 입력 처리)
const activeAnimations = new Map();

function isWhiteKey(midiNote) {
  const n = midiNote % 12;
  return [0, 2, 4, 5, 7, 9, 11].includes(n);
}

// 옥타브 내 검은 건반 오프셋 — 실제 피아노 크로매틱 레이아웃 기반
// C#: C와 D 사이에서 왼쪽으로 치우침, D#: 중심에서 오른쪽으로 치우침
// F#, G#, A#: 3개 그룹 내에서 각각 고유한 위치
const BLACK_KEY_OFFSETS = {
  1: -0.55,  // C# — C쪽으로 약간 치우침
  3: -0.42,  // D# — D쪽으로 약간 치우침
  6: -0.55,  // F# — F쪽으로 치우침
  8: -0.50,  // G# — 거의 중앙
  10: -0.42, // A# — A쪽으로 치우침
};

// 검은 건반 per-key 미세 변화 생성
function createBlackKeyMaterial(keyIndex) {
  // 색상을 완전한 흑에 가깝게 (이전: 0x18~0x22 → 0x08~0x10)
  // 흰건반과의 명도 대비를 극대화
  const baseR = 0x08 + Math.floor(Math.random() * 0x06);
  const baseG = 0x08 + Math.floor(Math.random() * 0x05);
  const baseB = 0x0c + Math.floor(Math.random() * 0x06);
  const color = (baseR << 16) | (baseG << 8) | baseB;

  // roughness를 낮춰 clearcoat 반사가 강하게 맺히도록 (에보니 고광택 피아노)
  // 이전: 0.2~0.35 → 0.05~0.12 (거울에 가까운 매끄러운 흑건)
  const roughness = 0.05 + Math.random() * 0.07;

  return new THREE.MeshPhysicalMaterial({
    color,
    emissive: 0x000000,           // pressKey에서 동적으로 설정
    emissiveIntensity: 0.0,       // 대기 상태에서 0 — clearcoat 콘트라스트 유지
    roughness,
    metalness: 0.0,
    reflectivity: 1.0,
    clearcoat: 1.0,
    clearcoatRoughness: 0.02 + Math.random() * 0.02,
    envMapIntensity: 3.5,  // 코히어런트 env맵으로 더 높은 캐치라이트 가능
  });
}

function createWhiteKeyMaterial(keyIndex) {
  // per-key 미세 변화: 사용 흔적, 미세한 황변, 결 차이 시뮬레이션
  const warmShift = (Math.random() - 0.5) * 0.02; // 약간의 따뜻한/차가운 편차
  const r = Math.min(1.0, 1.0 + warmShift);
  const g = Math.min(1.0, 0.99 + warmShift * 0.5);
  const b = Math.min(1.0, 0.97 - Math.abs(warmShift));
  const color = new THREE.Color(r, g, b);
  const roughness = 0.06 + Math.random() * 0.06; // 0.06~0.12

  return new THREE.MeshPhysicalMaterial({
    color,
    // 상시 emissive 제거 — clearcoat 스페큘러가 흰건반 광택 담당
    // 상시 emissive는 블룸 위로 번져 idle/active 건반 대비를 죽임
    emissive: 0x000000,
    emissiveIntensity: 0.0,
    roughness,
    metalness: 0.0,
    reflectivity: 1.0,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04 + Math.random() * 0.04,
    envMapIntensity: 1.8,
  });
}

export function createPiano(scene) {
  // 이전 키 초기화 (Storybook 스토리 전환 등에서 중복 방지)
  keys.length = 0;
  Object.keys(activeKeys).forEach(k => delete activeKeys[k]);

  // RoundedBoxGeometry — 그레이징 앵글 조명에서 부드러운 하이라이트 모서리
  const whiteKeyGeo = new RoundedBoxGeometry(
    PIANO.WHITE_KEY_WIDTH, PIANO.WHITE_KEY_HEIGHT, PIANO.WHITE_KEY_DEPTH,
    2, 0.02  // segments=2, radius=0.02
  );
  const blackKeyGeo = new RoundedBoxGeometry(
    PIANO.BLACK_KEY_WIDTH, PIANO.BLACK_KEY_HEIGHT, PIANO.BLACK_KEY_DEPTH,
    2, 0.015
  );

  let whiteIndex = 0;
  let blackIndex = 0;

  for (let i = 0; i < PIANO.TOTAL_KEYS; i++) {
    const midiNote = PIANO.FIRST_NOTE + i;
    const white = isWhiteKey(midiNote);

    if (white) {
      const mesh = new THREE.Mesh(whiteKeyGeo, createWhiteKeyMaterial(whiteIndex));
      const x = (whiteIndex - 26) * (PIANO.WHITE_KEY_WIDTH + PIANO.KEY_GAP);
      mesh.position.set(x, 0, 0);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      keys.push({ mesh, midiNote, isBlack: false, baseY: 0 });
      whiteIndex++;
    } else {
      // per-key 색상/roughness 변화
      const mat = createBlackKeyMaterial(blackIndex++);
      const mesh = new THREE.Mesh(blackKeyGeo, mat);
      const chromaticPos = midiNote % 12;
      const offset = BLACK_KEY_OFFSETS[chromaticPos] || -0.5;
      const x = (whiteIndex - 26 + offset) * (PIANO.WHITE_KEY_WIDTH + PIANO.KEY_GAP);
      mesh.position.set(x, PIANO.BLACK_KEY_HEIGHT / 2, -0.25);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      keys.push({ mesh, midiNote, isBlack: true, baseY: PIANO.BLACK_KEY_HEIGHT / 2 });
    }
  }

  // Precompute lookup tables
  let wi = 0;
  for (let i = 0; i < PIANO.TOTAL_KEYS; i++) {
    const mn = PIANO.FIRST_NOTE + i;
    if (isWhiteKey(mn)) {
      keyXLookup[mn] = (wi - 26) * (PIANO.WHITE_KEY_WIDTH + PIANO.KEY_GAP);
      keyWidthLookup[mn] = PIANO.WHITE_KEY_WIDTH;
      wi++;
    } else {
      const cp = mn % 12;
      const bkOffset = BLACK_KEY_OFFSETS[cp] || -0.5;
      keyXLookup[mn] = (wi - 26 + bkOffset) * (PIANO.WHITE_KEY_WIDTH + PIANO.KEY_GAP);
      keyWidthLookup[mn] = PIANO.BLACK_KEY_WIDTH;
    }
  }

  return keys;
}

export function getKeyX(midiNote) {
  return keyXLookup[midiNote] ?? 0;
}

// --- 이징 함수 ---
// 빠르게 하강: easeOutCubic (처음 빠르고 끝에서 감속)
function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

// 복귀: easeOutQuart — 빠른 초기 복귀 + 부드럽게 안착 (실제 피아노 키 물리)
function easeOutQuart(t) {
  return 1 - Math.pow(1 - t, 4);
}

export function pressKey(midiNote, color) {
  const key = keys.find(k => k.midiNote === midiNote);
  if (!key) return;

  // 기존 애니메이션이 있으면 취소
  if (activeAnimations.has(midiNote)) {
    cancelAnimationFrame(activeAnimations.get(midiNote));
    activeAnimations.delete(midiNote);
  }

  const PRESS_DURATION = 80;    // 하강 시간 (ms) — 빠른 응답
  const RELEASE_DURATION = 500;  // 복귀 시간 (ms) — 느린 복귀로 여운
  const PRESS_DEPTH = 0.18;     // 하강 깊이 (증가)
  const PRESS_ROTATION = 0.04;  // 앞쪽 기울기 (라디안) — 피봇 느낌

  // emissive 색상 설정
  key.mesh.material.emissive.setHex(color);

  let startTime = null;

  // --- 하강 애니메이션 (easeOutCubic) ---
  function animatePress(timestamp) {
    if (!startTime) startTime = timestamp;
    const elapsed = timestamp - startTime;
    const progress = Math.min(elapsed / PRESS_DURATION, 1);
    const eased = easeOutCubic(progress);

    // 위치 하강 + 미세 회전 (피봇 시뮬레이션)
    key.mesh.position.y = key.baseY - PRESS_DEPTH * eased;
    key.mesh.rotation.x = -PRESS_ROTATION * eased;
    // emissive 강도 증가 — 피크를 높여 시각적 임팩트
    key.mesh.material.emissiveIntensity = 2.5 * eased;

    if (progress < 1) {
      activeAnimations.set(midiNote, requestAnimationFrame(animatePress));
    } else {
      // 하강 완료 → 복귀 애니메이션 시작
      startTime = null;
      activeAnimations.set(midiNote, requestAnimationFrame(animateRelease));
    }
  }

  // --- 복귀 애니메이션 (easeOutQuart — 빠른 초기 복귀) ---
  function animateRelease(timestamp) {
    if (!startTime) startTime = timestamp;
    const elapsed = timestamp - startTime;
    const progress = Math.min(elapsed / RELEASE_DURATION, 1);
    const eased = easeOutQuart(progress);

    // 위치/회전 복귀
    key.mesh.position.y = key.baseY - PRESS_DEPTH * (1 - eased);
    key.mesh.rotation.x = -PRESS_ROTATION * (1 - eased);
    // 글로우 빠르게 차단 (40% 시점에 완전 소멸) — 기계적 복귀와 분리
    const glowProgress = Math.min(progress / 0.4, 1.0);
    key.mesh.material.emissiveIntensity = 2.5 * (1.0 - glowProgress);

    if (progress < 1) {
      activeAnimations.set(midiNote, requestAnimationFrame(animateRelease));
    } else {
      // 애니메이션 완료 → 깔끔하게 리셋
      key.mesh.position.y = key.baseY;
      key.mesh.rotation.x = 0;
      key.mesh.material.emissive.setHex(0x000000);
      key.mesh.material.emissiveIntensity = 0;
      activeAnimations.delete(midiNote);
    }
  }

  // 하강 애니메이션 시작
  activeAnimations.set(midiNote, requestAnimationFrame(animatePress));
}

export function getKeyWidth(midiNote) {
  return keyWidthLookup[midiNote] ?? PIANO.WHITE_KEY_WIDTH;
}
