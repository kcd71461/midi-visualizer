import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as THREE from 'three';
import { CAMERA_PRESETS } from './constants.js';

let controls = null;
let camera = null;
let freeMode = false;

// ── 시네마틱 카메라 상태 ──
let cinematicEnabled = false;

// ── 인트로 / 아웃트로 상태 ──
const INTRO_DURATION = 5.0;   // 이전: 3.0 → 5.0 (여유로운 달리 백)
const OUTRO_DURATION = 3.0;
// 인트로: 건반 바로 앞 저앙각에서 시작 (첫 프레임부터 건반이 꽉 차게)
const introStartPos = new THREE.Vector3(0, 1.5, 5);
const introStartTarget = new THREE.Vector3(0, 0.1, 0);
// 인트로 종착점
const introEndPos = new THREE.Vector3(5, 3, 12);
const introEndTarget = new THREE.Vector3(0, 0.1, -1);

let outroActive = false;
let outroStartTime = 0;
const outroStartPos = new THREE.Vector3();
const outroStartTarget = new THREE.Vector3();

// 현재 보간 중인 카메라 위치/타겟
const cinematicPos = new THREE.Vector3();
const cinematicTarget = new THREE.Vector3();

// 경로 전환 보간용
let pathBlend = 0;            // 0→1 전환 진행도
let pathTransitionDur = 2.0;  // 전환에 걸리는 시간(초)
let pathTransitionTime = 0;   // 전환 시작 시각
let prevPathIndex = -1;
let currPathIndex = 0;

// ── 이징 함수 ──
function easeInOutCubic(t) {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function easeInCubic(t) {
  return t * t * t;
}

function easeOutQuad(t) {
  return 1 - (1 - t) * (1 - t);
}

// ── 시네마틱 카메라 경로 정의 ──
// 각 경로는 시간(t)과 에너지(energy)를 받아 { position, target }을 반환
const cinematicPaths = [
  {
    // 경로 0: 피아노 옆에서 저앙각 슬라이드 — 건반 모서리가 선명하게
    name: 'closeSlide',
    evaluate(t, _energy) {
      const slide = Math.sin(t * 0.08) * 6;
      return {
        position: new THREE.Vector3(slide + 6, 3, 10),
        target: new THREE.Vector3(slide * 0.3, 0.1, -1),
      };
    },
  },
  {
    // 경로 1: 인트로 후 — 정면에서 약간 올려보며 서서히 빠짐
    name: 'descend',
    evaluate(t, _energy) {
      const progress = Math.min(t / 12, 1);
      const easedProgress = easeOutQuad(progress);
      const y = 3 + 4 * easedProgress;
      const z = 10 + 6 * easedProgress;
      return {
        position: new THREE.Vector3(0, y, z),
        target: new THREE.Vector3(0, 0.1, -2),
      };
    },
  },
  {
    // 경로 2: 활발한 구간 — 가까이 줌인 + 빠른 회전
    name: 'energetic',
    evaluate(t, energy) {
      const angle = t * 0.35;
      const radius = 8 - energy * 3;    // 이전: 12-4 → 8-3 (더 가까이)
      const height = 3 + energy * 2;     // 이전: 6+3 → 3+2 (더 낮게)
      return {
        position: new THREE.Vector3(
          Math.sin(angle) * radius,
          height,
          Math.cos(angle) * radius + 3
        ),
        target: new THREE.Vector3(0, 0.1, -1),
      };
    },
  },
  {
    // 경로 3: 차분한 구간 — 콘서트홀 청중 시점 (멀지만 적당히)
    name: 'calm',
    evaluate(t, _energy) {
      const drift = Math.sin(t * 0.05) * 4;
      return {
        position: new THREE.Vector3(drift, 8, 18),
        target: new THREE.Vector3(0, 0.1, -3),
      };
    },
  },
];

// ── 에너지 기반으로 적절한 경로 인덱스 선택 ──
function selectPathIndex(currentTime, musicEnergy) {
  // 곡 초반 10초: 하강 경로
  if (currentTime < 10) return 1;
  // 에너지 0.6 이상: 활발한 경로
  if (musicEnergy >= 0.6) return 2;
  // 에너지 0.25 이하: 차분한 경로
  if (musicEnergy <= 0.25) return 3;
  // 그 외: 기본 궤도
  return 0;
}

// ── 기존 기능 ──

export function setupCamera(cam, domElement) {
  camera = cam;

  controls = new OrbitControls(camera, domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.enabled = false;

  applyPreset('default');

  // 시네마틱 초기 위치 동기화
  cinematicPos.copy(camera.position);
  cinematicTarget.set(0, 0, -5);

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
  // 자유 모드 진입 시 시네마틱 모드 해제
  if (free) cinematicEnabled = false;
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

// ── 시네마틱 모드 API ──

/**
 * 시네마틱 모드 토글
 * @param {boolean} enabled - true면 자동 카메라 활성화
 */
export function setCinematicMode(enabled) {
  cinematicEnabled = enabled;

  if (enabled) {
    // 시네마틱 진입: 자유 모드 해제, OrbitControls 비활성화
    freeMode = false;
    if (controls) controls.enabled = false;
    // 인트로 시작 위치(탑뷰)로 초기화
    cinematicPos.copy(introStartPos);
    cinematicTarget.copy(introStartTarget);
    camera.position.copy(introStartPos);
    camera.lookAt(introStartTarget);
    prevPathIndex = -1;
    currPathIndex = 0;
    pathBlend = 1;
    // 아웃트로 리셋
    outroActive = false;
  } else {
    // 시네마틱 해제: 기본 프리셋으로 복귀
    applyPreset('default');
  }
}

/**
 * 현재 시네마틱 모드 여부
 * @returns {boolean}
 */
export function isCinematicMode() {
  return cinematicEnabled;
}

/**
 * 매 프레임 호출 — 시네마틱 카메라 업데이트
 * @param {number} currentTime  - 곡의 현재 재생 시간(초)
 * @param {number} musicEnergy  - 0~1 사이의 음악 에너지 (활성 노트 비율)
 */
export function updateCinematicCamera(currentTime, musicEnergy) {
  if (!cinematicEnabled || !camera) return;

  // ── 아웃트로 시퀀스 — 건반 정면 클로즈업으로 줌인 ──
  if (outroActive) {
    const elapsed = currentTime - outroStartTime;
    const progress = THREE.MathUtils.clamp(elapsed / OUTRO_DURATION, 0, 1);
    const eased = easeInOutCubic(progress);

    // 현재 위치 → 건반 정면 클로즈업
    const outroGoalPos = new THREE.Vector3(0, 1.5, 6);
    const outroGoalTarget = new THREE.Vector3(0, 0.1, 0);

    cinematicPos.lerpVectors(outroStartPos, outroGoalPos, eased);
    cinematicTarget.lerpVectors(outroStartTarget, outroGoalTarget, eased);

    camera.position.copy(cinematicPos);
    camera.lookAt(cinematicTarget);
    if (controls) controls.target.copy(cinematicTarget);
    return;
  }

  // ── 인트로 시퀀스 (0~5초) — 건반 클로즈업에서 달리 백 ──
  if (currentTime < INTRO_DURATION) {
    const t = THREE.MathUtils.clamp(currentTime / INTRO_DURATION, 0, 1);

    if (t < 0.15) {
      // 0~0.75초: 건반 클로즈업 정지 (첫 프레임부터 건반이 화면에 꽉 참)
      cinematicPos.copy(introStartPos);
      cinematicTarget.copy(introStartTarget);
    } else {
      // 0.75~5초: 건반에서 천천히 빠지는 달리 백
      const pullT = (t - 0.15) / 0.85;
      const pulledEased = easeInOutCubic(pullT);
      cinematicPos.lerpVectors(introStartPos, introEndPos, pulledEased);
      cinematicTarget.lerpVectors(introStartTarget, introEndTarget, pulledEased);
    }

    camera.position.copy(cinematicPos);
    camera.lookAt(cinematicTarget);
    if (controls) controls.target.copy(cinematicTarget);
    return;
  }

  const energy = THREE.MathUtils.clamp(musicEnergy, 0, 1);

  // 적절한 경로 선택
  const desiredIndex = selectPathIndex(currentTime, energy);

  // 경로가 바뀌면 전환 시작
  if (desiredIndex !== currPathIndex) {
    prevPathIndex = currPathIndex;
    currPathIndex = desiredIndex;
    pathTransitionTime = currentTime;
    pathBlend = 0;
    // 에너지가 높을수록 전환이 약간 빠름
    pathTransitionDur = 2.0 - energy * 0.8;
  }

  // 전환 보간 진행도 계산
  if (pathBlend < 1) {
    const elapsed = currentTime - pathTransitionTime;
    pathBlend = Math.min(elapsed / pathTransitionDur, 1);
  }
  const easedBlend = easeInOutCubic(pathBlend);

  // 현재 경로의 위치/타겟
  const curr = cinematicPaths[currPathIndex].evaluate(currentTime, energy);

  let goalPos, goalTarget;

  if (prevPathIndex >= 0 && easedBlend < 1) {
    // 이전 경로와 현재 경로 사이를 보간
    const prev = cinematicPaths[prevPathIndex].evaluate(currentTime, energy);
    goalPos = new THREE.Vector3().lerpVectors(prev.position, curr.position, easedBlend);
    goalTarget = new THREE.Vector3().lerpVectors(prev.target, curr.target, easedBlend);
  } else {
    goalPos = curr.position;
    goalTarget = curr.target;
  }

  // 카메라가 피아노 뒤로 가지 않도록 Z 하한 설정
  if (goalPos.z < 2) goalPos.z = 2;
  // 카메라 높이 하한 (건반 아래로 내려가지 않도록)
  if (goalPos.y < 1) goalPos.y = 1;

  // 최종 위치로 부드럽게 이동 (추가 댐핑)
  const smoothFactor = 0.03;
  cinematicPos.lerp(goalPos, smoothFactor);
  cinematicTarget.lerp(goalTarget, smoothFactor);

  // 카메라에 적용
  camera.position.copy(cinematicPos);
  camera.lookAt(cinematicTarget);

  // OrbitControls 타겟도 동기화 (모드 전환 시 자연스럽게)
  if (controls) {
    controls.target.copy(cinematicTarget);
  }
}

/**
 * 아웃트로 시퀀스 시작 (곡 시간 기반)
 * 현재 카메라 위치에서 위로 올라가며 멀어짐
 */
export function startOutroSequence(currentTime) {
  if (outroActive) return;
  outroActive = true;
  outroStartTime = currentTime;
  outroStartPos.copy(cinematicPos);
  outroStartTarget.copy(cinematicTarget);
}

// startOutroAtTime은 startOutroSequence의 별칭
export const startOutroAtTime = startOutroSequence;

/**
 * 아웃트로 재생 중 여부
 */
export function isOutroPlaying() {
  return outroActive;
}
