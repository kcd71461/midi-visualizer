import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as THREE from 'three';
import { CAMERA_PRESETS } from './constants.js';

let controls = null;
let camera = null;
let freeMode = false;

// ── 시네마틱 카메라 상태 ──
let cinematicEnabled = false;

// ── 인트로 / 아웃트로 상태 ──
const INTRO_DURATION = 6.0;
const OUTRO_DURATION = 3.0;
// 인트로: God's Eye 확립 숏 → 낮은 앵글 시네마틱 포지션으로 하강
// "오, 피아노다" 모먼트를 만드는 넓은 시작 → 친밀한 끝
const introStartPos = new THREE.Vector3(0, 14, 22);
const introStartTarget = new THREE.Vector3(0, 0, -2);
const introEndPos = new THREE.Vector3(3, 3.5, 13);
const introEndTarget = new THREE.Vector3(0, 0.2, -1);

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

// ── 비트 반응 카메라 임펄스 ──
let impulseOffset = new THREE.Vector3();
let impulseDecay = 0;
const IMPULSE_ATTACK = 0.15;  // 임펄스 발동 시간 (초)
const IMPULSE_RELEASE = 0.6;  // 임펄스 감쇠 시간 (초)
let prevEnergy = 0;

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
      const radius = 7 - energy * 2;    // 5~7 범위
      const height = 3 + energy * 2;
      return {
        position: new THREE.Vector3(
          Math.sin(angle) * radius,
          height,
          (Math.cos(angle) * 0.5 + 0.5) * radius + 4  // C2 연속 — V자 불연속 제거
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

// ── 숏 홀드 타임 — 경로 전환 후 최소 유지 시간 (잦은 전환 방지) ──
let lastPathSwitchTime = 0;
const MIN_SHOT_HOLD = 4.0;

// ── 곡 위치 + 에너지 기반 2축 경로 선택 ──
function selectPathIndex(currentTime, musicEnergy, songDuration) {
  // 최소 홀드 타임 미달이면 현재 경로 유지
  if (currentTime - lastPathSwitchTime < MIN_SHOT_HOLD) return currPathIndex;

  const songProgress = songDuration > 0 ? currentTime / songDuration : 0;

  // 곡 초반 10초: 하강 경로 (인트로 직후 전환 숏)
  if (currentTime < 10) return 1;
  // 아웃트로 구간 (곡의 마지막 15%): 멀리서 전체를 보는 차분한 뷰
  if (songProgress > 0.85) return 3;
  // 클라이맥스 직전 (60~80%) + 에너지 낮음: 의도적 친밀한 클로즈업
  if (songProgress > 0.6 && songProgress < 0.8 && musicEnergy < 0.35) return 0;
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
 * @param {number} delta        - 프레임 시간 (초)
 */
export function updateCinematicCamera(currentTime, musicEnergy, delta = 0.016, songDuration = 0) {
  if (!cinematicEnabled || !camera) return;

  // ── 아웃트로 시퀀스 — 크레인 업 + 풀백 (피아노가 점점 작아지는 영화적 엔딩) ──
  if (outroActive) {
    const elapsed = currentTime - outroStartTime;
    const progress = THREE.MathUtils.clamp(elapsed / OUTRO_DURATION, 0, 1);
    const eased = easeInOutCubic(progress);

    // 현재 위치 → 높이 올라가며 뒤로 빠지는 크레인 샷
    const outroGoalPos = new THREE.Vector3(0, 18, 28);
    const outroGoalTarget = new THREE.Vector3(0, 0, -3);

    cinematicPos.lerpVectors(outroStartPos, outroGoalPos, eased);
    cinematicTarget.lerpVectors(outroStartTarget, outroGoalTarget, eased);

    camera.position.copy(cinematicPos);
    camera.lookAt(cinematicTarget);
    if (controls) controls.target.copy(cinematicTarget);
    return;
  }

  // ── 인트로 시퀀스 (0~6초) — God's Eye 확립 숏에서 시네마틱 포지션으로 하강 ──
  if (currentTime < INTRO_DURATION) {
    const t = THREE.MathUtils.clamp(currentTime / INTRO_DURATION, 0, 1);

    if (t < 0.08) {
      // 처음 0.5초: 확립 숏 홀드 — 타이틀이 깨끗한 구도 위에 표시
      cinematicPos.copy(introStartPos);
      cinematicTarget.copy(introStartTarget);
    } else {
      // 0.5~6초: 피아노를 향해 느리고 의도적인 하강
      const pullT = (t - 0.08) / 0.92;
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

  // 적절한 경로 선택 (곡 위치 + 에너지 2축)
  const desiredIndex = selectPathIndex(currentTime, energy, songDuration);

  // 경로가 바뀌면 전환 시작 + 홀드 타임 리셋
  if (desiredIndex !== currPathIndex) {
    lastPathSwitchTime = currentTime;
    prevPathIndex = currPathIndex;
    currPathIndex = desiredIndex;
    pathTransitionTime = currentTime;
    pathBlend = 0;
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

  // 프레임독립적 지수 감쇠 댐핑 — 에너지에 비례하여 반응 속도 증가
  const baseSmoothRate = 2.0 + energy * 4.0; // 낮은 에너지 2.0, 높은 에너지 6.0
  const smoothFactor = 1 - Math.pow(Math.E, -baseSmoothRate * delta);
  cinematicPos.lerp(goalPos, smoothFactor);
  cinematicTarget.lerp(goalTarget, smoothFactor);

  // ── 비트 반응 카메라 임펄스 ──
  const energyDelta = energy - prevEnergy;
  prevEnergy = energy;

  if (energyDelta > 0.15) {
    // 공격: 세게 당기고 위로 리프트 + 약간의 랜덤 측면 흔들림
    impulseOffset.set(
      (Math.random() - 0.5) * 0.3,
      0.2,
      -energyDelta * 6  // 이전 3→6: 실제 체감되는 수준
    );
    impulseDecay = 1.0;
  } else if (energyDelta < -0.2) {
    impulseOffset.set(0, -0.1, -energyDelta * 3);
    impulseDecay = 1.0;
  }

  // 임펄스 감쇠
  if (impulseDecay > 0) {
    impulseDecay = Math.max(0, impulseDecay - delta / IMPULSE_RELEASE);
  }

  const impulseEased = impulseDecay * impulseDecay; // quadratic falloff

  // 카메라 브리딩 — 에너지에 비례하는 진폭 (음악적 호흡)
  const breathAmp = 0.04 + energy * 0.08;
  const breathX = Math.sin(currentTime * 0.7) * breathAmp;
  const breathY = Math.sin(currentTime * 0.5 + 1.0) * breathAmp * 0.6;

  // 비트 임펄스 — 스무딩 바이패스, 카메라에 직접 적용
  const beatX = impulseOffset.x * impulseEased;
  const beatY = impulseOffset.y * impulseEased;
  const beatZ = impulseOffset.z * impulseEased;

  camera.position.set(
    cinematicPos.x + breathX + beatX,
    cinematicPos.y + breathY + beatY,
    cinematicPos.z + beatZ
  );
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
