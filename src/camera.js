import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as THREE from 'three';
import { CAMERA_PRESETS } from './constants.js';

let controls = null;
let camera = null;
let freeMode = false;

// ── 시네마틱 카메라 상태 ──
let cinematicEnabled = false;

// ── 인트로 / 아웃트로 상태 ──
const INTRO_DURATION = 3.0;
const OUTRO_DURATION = 3.0;
const introStartPos = new THREE.Vector3(0, 40, 0);
const introStartTarget = new THREE.Vector3(0, 0, -5);

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
    // 기본: 피아노 주변을 천천히 원형 궤도로 회전
    name: 'orbit',
    evaluate(t, _energy) {
      const angle = t * 0.15;           // 느린 회전 속도
      const radius = 22;
      const height = 12;
      return {
        position: new THREE.Vector3(
          Math.sin(angle) * radius,
          height,
          Math.cos(angle) * radius
        ),
        target: new THREE.Vector3(0, 0, -5),
      };
    },
  },
  {
    // 곡 시작: 위에서 천천히 내려옴
    name: 'descend',
    evaluate(t, _energy) {
      const progress = Math.min(t / 10, 1); // 10초에 걸쳐 하강
      const easedProgress = easeOutQuad(progress);
      const startY = 35;
      const endY = 12;
      const y = startY + (endY - startY) * easedProgress;
      const z = 5 + 13 * easedProgress;
      return {
        position: new THREE.Vector3(0, y, z),
        target: new THREE.Vector3(0, 0, -5),
      };
    },
  },
  {
    // 활발한 구간: 줌인 + 빠른 회전
    name: 'energetic',
    evaluate(t, energy) {
      const angle = t * 0.35;           // 더 빠른 회전
      const radius = 12 - energy * 4;   // 에너지 높을수록 줌인
      const height = 6 + energy * 3;
      return {
        position: new THREE.Vector3(
          Math.sin(angle) * radius,
          height,
          Math.cos(angle) * radius
        ),
        target: new THREE.Vector3(0, 1, -3),
      };
    },
  },
  {
    // 차분한 구간: 멀리서 바라보기
    name: 'calm',
    evaluate(t, _energy) {
      const angle = t * 0.08;           // 매우 느린 회전
      const radius = 30;
      const height = 18;
      return {
        position: new THREE.Vector3(
          Math.sin(angle) * radius,
          height,
          Math.cos(angle) * radius
        ),
        target: new THREE.Vector3(0, 0, -5),
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

  // ── 아웃트로 시퀀스 ──
  if (outroActive) {
    const elapsed = currentTime - outroStartTime;
    const progress = THREE.MathUtils.clamp(elapsed / OUTRO_DURATION, 0, 1);
    const easedProgress = easeInCubic(progress); // 느리게 시작, 가속

    const goalPos = outroStartPos.clone().add(
      new THREE.Vector3(0, 20 * easedProgress, 10 * easedProgress)
    );
    const goalTarget = outroStartTarget.clone();

    cinematicPos.copy(goalPos);
    cinematicTarget.copy(goalTarget);

    camera.position.copy(cinematicPos);
    camera.lookAt(cinematicTarget);
    if (controls) controls.target.copy(cinematicTarget);
    return;
  }

  // ── 인트로 시퀀스 (0~3초) ──
  if (currentTime < INTRO_DURATION) {
    const firstPath = cinematicPaths[0].evaluate(currentTime, 0);

    if (currentTime < 1.0) {
      // 0~1초: 탑뷰 유지
      cinematicPos.copy(introStartPos);
      cinematicTarget.copy(introStartTarget);
    } else {
      // 1~3초: 탑뷰에서 첫 번째 경로 위치로 이동
      const t = (currentTime - 1.0) / (INTRO_DURATION - 1.0); // 0→1
      const eased = easeInOutCubic(t);
      cinematicPos.lerpVectors(introStartPos, firstPath.position, eased);
      cinematicTarget.lerpVectors(introStartTarget, firstPath.target, eased);
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
