import * as THREE from 'three';
import { PIANO } from './constants.js';

// ─────────────────────────────────────────────
// 파티클 시스템
// - 건반 히트 파티클: 건반이 눌릴 때 위로 퍼지는 빛나는 입자
// - 앰비언트 먼지 파티클: 피아노 주변에 항상 떠다니는 빛 입자
// - 히트 웨이브: 건반이 눌릴 때 원형으로 퍼지는 파동 링
// ─────────────────────────────────────────────

// === 상수 ===

// 히트 파티클 풀 크기 (최대 동시 파티클 수)
const HIT_POOL_SIZE = 2000;
// 히트 파티클 수명 (초)
const HIT_LIFETIME = 1.5;
// 중력 가속도
const HIT_GRAVITY = -4.0;
// 기본 발사 속도
const HIT_BASE_SPEED = 3.0;
// velocity 1.0 기준 파티클 수
const HIT_BASE_COUNT = 20;
// 최대 파티클 수 (한 번 발사 시)
const HIT_MAX_COUNT = 50;

// 앰비언트 파티클 수
const AMBIENT_COUNT = 500;
// 앰비언트 분포 범위
const AMBIENT_RANGE_X = 20;
const AMBIENT_RANGE_Y = 12;
const AMBIENT_RANGE_Z = 15;
// 앰비언트 이동 속도
const AMBIENT_DRIFT_SPEED = 0.3;
// 앰비언트 반짝임 속도
const AMBIENT_TWINKLE_SPEED = 1.5;

// 히트 웨이브 설정
const WAVE_POOL_SIZE = 20;
const WAVE_DURATION = 0.6;        // 파동 지속 시간 (초)
const WAVE_RADIUS_START = 0.1;    // 시작 반지름
const WAVE_RADIUS_END = 2.0;      // 최종 반지름
const WAVE_OPACITY_START = 0.8;   // 시작 투명도
const WAVE_Y = PIANO.WHITE_KEY_HEIGHT / 2 + 0.12 / 2 + 0.02; // NOTE_Y + 0.02

// === 히트 웨이브 관련 변수 ===
let wavePool = [];                // { mesh, lifetime, maxLifetime, x, z, color }
let waveGeometry;
let waveScene;                    // scene 참조 저장

// === 히트 파티클 관련 변수 ===
let hitGeometry, hitMaterial, hitPoints;
// 각 파티클 상태 배열
let hitPositions;    // Float32Array (pool * 3)
let hitColors;       // Float32Array (pool * 3)
let hitAlphas;       // Float32Array (pool)
let hitVelocities;   // Array of {vx, vy, vz}
let hitLifetimes;    // Float32Array (pool) — 남은 수명
let hitActiveCount = 0;
// 풀에서 다음 사용 인덱스 (순환)
let hitNextIndex = 0;

// === 앰비언트 파티클 관련 변수 ===
let ambientGeometry, ambientMaterial, ambientPoints;
let ambientPositions;
let ambientBaseAlphas; // 각 파티클의 기본 opacity
let ambientAlphas;
let ambientDriftOffsets; // 이동 오프셋 (위상 차이)
let ambientTime = 0;

// 원형 파티클 텍스처 생성 (소프트 글로우)
function createParticleTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // 방사형 그라데이션 — 중심이 밝고 가장자리가 투명
  const gradient = ctx.createRadialGradient(
    size / 2, size / 2, 0,
    size / 2, size / 2, size / 2
  );
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.3, 'rgba(255,255,255,0.6)');
  gradient.addColorStop(0.7, 'rgba(255,255,255,0.15)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/**
 * 파티클 시스템 초기화
 * @param {THREE.Scene} scene - Three.js 씬
 */
export function createParticles(scene) {
  const particleTexture = createParticleTexture();

  // ── 히트 파티클 초기화 ──
  hitGeometry = new THREE.BufferGeometry();
  hitPositions = new Float32Array(HIT_POOL_SIZE * 3);
  hitColors = new Float32Array(HIT_POOL_SIZE * 3);
  hitAlphas = new Float32Array(HIT_POOL_SIZE);
  hitLifetimes = new Float32Array(HIT_POOL_SIZE);
  hitVelocities = new Array(HIT_POOL_SIZE);

  // 모든 파티클을 비활성 상태로 초기화
  for (let i = 0; i < HIT_POOL_SIZE; i++) {
    hitLifetimes[i] = 0;
    hitAlphas[i] = 0;
    hitVelocities[i] = { vx: 0, vy: 0, vz: 0 };
  }

  hitGeometry.setAttribute('position', new THREE.BufferAttribute(hitPositions, 3));
  hitGeometry.setAttribute('color', new THREE.BufferAttribute(hitColors, 3));
  hitGeometry.setAttribute('alpha', new THREE.BufferAttribute(hitAlphas, 1));

  hitMaterial = new THREE.PointsMaterial({
    size: 0.15,
    map: particleTexture,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
    sizeAttenuation: true,
  });

  // opacity를 alpha 속성으로 직접 제어하기 위해 onBeforeCompile 사용
  hitMaterial.onBeforeCompile = (shader) => {
    // vertex shader: alpha attribute를 varying으로 전달
    shader.vertexShader = shader.vertexShader.replace(
      'void main() {',
      'attribute float alpha;\nvarying float vAlpha;\nvoid main() {\n  vAlpha = alpha;'
    );
    // fragment shader: vAlpha로 투명도 조절
    shader.fragmentShader = shader.fragmentShader.replace(
      'void main() {',
      'varying float vAlpha;\nvoid main() {'
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <premultiplied_alpha_fragment>',
      'gl_FragColor.a *= vAlpha;\n#include <premultiplied_alpha_fragment>'
    );
  };

  hitPoints = new THREE.Points(hitGeometry, hitMaterial);
  hitPoints.frustumCulled = false;
  scene.add(hitPoints);

  // ── 앰비언트 먼지 파티클 초기화 ──
  ambientGeometry = new THREE.BufferGeometry();
  ambientPositions = new Float32Array(AMBIENT_COUNT * 3);
  ambientAlphas = new Float32Array(AMBIENT_COUNT);
  ambientBaseAlphas = new Float32Array(AMBIENT_COUNT);
  ambientDriftOffsets = new Float32Array(AMBIENT_COUNT * 3);

  for (let i = 0; i < AMBIENT_COUNT; i++) {
    // 피아노 주변 공간에 랜덤 배치
    ambientPositions[i * 3] = (Math.random() - 0.5) * AMBIENT_RANGE_X;
    ambientPositions[i * 3 + 1] = Math.random() * AMBIENT_RANGE_Y - 1;
    ambientPositions[i * 3 + 2] = (Math.random() - 0.5) * AMBIENT_RANGE_Z;

    // 기본 밝기 (0.1 ~ 0.5)
    ambientBaseAlphas[i] = Math.random() * 0.4 + 0.1;
    ambientAlphas[i] = ambientBaseAlphas[i];

    // 이동 위상 오프셋 (각 파티클이 다른 타이밍으로 움직이도록)
    ambientDriftOffsets[i * 3] = Math.random() * Math.PI * 2;
    ambientDriftOffsets[i * 3 + 1] = Math.random() * Math.PI * 2;
    ambientDriftOffsets[i * 3 + 2] = Math.random() * Math.PI * 2;
  }

  ambientGeometry.setAttribute('position', new THREE.BufferAttribute(ambientPositions, 3));
  ambientGeometry.setAttribute('alpha', new THREE.BufferAttribute(ambientAlphas, 1));

  ambientMaterial = new THREE.PointsMaterial({
    size: 0.06,
    map: particleTexture,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    color: 0xaabbdd,
    sizeAttenuation: true,
  });

  // 앰비언트도 개별 alpha 제어
  ambientMaterial.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      'void main() {',
      'attribute float alpha;\nvarying float vAlpha;\nvoid main() {\n  vAlpha = alpha;'
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      'void main() {',
      'varying float vAlpha;\nvoid main() {'
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <premultiplied_alpha_fragment>',
      'gl_FragColor.a *= vAlpha;\n#include <premultiplied_alpha_fragment>'
    );
  };

  ambientPoints = new THREE.Points(ambientGeometry, ambientMaterial);
  ambientPoints.frustumCulled = false;
  scene.add(ambientPoints);

  // ── 히트 웨이브 풀 초기화 ──
  waveScene = scene;
  waveGeometry = new THREE.RingGeometry(0.8, 1.0, 32); // 정규화된 링, 스케일로 크기 조절

  for (let i = 0; i < WAVE_POOL_SIZE; i++) {
    const waveMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const waveMesh = new THREE.Mesh(waveGeometry, waveMaterial);
    waveMesh.rotation.x = -Math.PI / 2; // 수평으로 눕힘
    waveMesh.position.y = WAVE_Y;
    waveMesh.visible = false;
    scene.add(waveMesh);

    wavePool.push({
      mesh: waveMesh,
      material: waveMaterial,
      lifetime: 0,
      maxLifetime: WAVE_DURATION,
      active: false,
    });
  }
}

/**
 * 건반 히트 시 파티클 발사
 * @param {number} x - 발사 위치 X
 * @param {number} y - 발사 위치 Y
 * @param {number} z - 발사 위치 Z
 * @param {number|THREE.Color} color - 파티클 색상 (hex 또는 THREE.Color)
 * @param {number} intensity - 강도 (0~1), velocity에 비례
 */
export function emitHitParticles(x, y, z, color, intensity = 0.8) {
  const col = color instanceof THREE.Color ? color : new THREE.Color(color);
  const clampedIntensity = Math.max(0.1, Math.min(1.0, intensity));

  // velocity에 비례한 파티클 수 (최소 5개, 최대 HIT_MAX_COUNT)
  const count = Math.min(
    HIT_MAX_COUNT,
    Math.max(5, Math.floor(HIT_BASE_COUNT * clampedIntensity))
  );

  // velocity에 비례한 발사 속도
  const speed = HIT_BASE_SPEED * (0.5 + clampedIntensity * 0.8);

  for (let i = 0; i < count; i++) {
    const idx = hitNextIndex;
    hitNextIndex = (hitNextIndex + 1) % HIT_POOL_SIZE;

    // 구형 랜덤 방향 (위쪽 반구 편향)
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI * 0.6; // 0~108도, 위쪽 편향
    const r = speed * (0.4 + Math.random() * 0.6);

    const vx = r * Math.sin(phi) * Math.cos(theta);
    const vy = r * Math.cos(phi) + 0.5; // 위쪽 추가 부스트
    const vz = r * Math.sin(phi) * Math.sin(theta);

    // 위치 초기화 (약간의 랜덤 오프셋)
    hitPositions[idx * 3] = x + (Math.random() - 0.5) * 0.1;
    hitPositions[idx * 3 + 1] = y + (Math.random() - 0.5) * 0.05;
    hitPositions[idx * 3 + 2] = z + (Math.random() - 0.5) * 0.1;

    // 색상 설정 (밝기 변화 추가)
    const brightness = 0.7 + Math.random() * 0.3;
    hitColors[idx * 3] = col.r * brightness;
    hitColors[idx * 3 + 1] = col.g * brightness;
    hitColors[idx * 3 + 2] = col.b * brightness;

    // 속도, 수명, 투명도 초기화
    hitVelocities[idx] = { vx, vy, vz };
    hitLifetimes[idx] = HIT_LIFETIME * (0.6 + Math.random() * 0.4);
    hitAlphas[idx] = 1.0;
  }
}

/**
 * 건반 히트 시 파동 링 발사
 * @param {number} x - 발사 위치 X
 * @param {number} z - 발사 위치 Z
 * @param {number|THREE.Color} color - 파동 색상 (hex)
 */
export function emitHitWave(x, z, color) {
  // 비활성 슬롯 찾기
  let slot = null;
  for (let i = 0; i < WAVE_POOL_SIZE; i++) {
    if (!wavePool[i].active) {
      slot = wavePool[i];
      break;
    }
  }
  // 모두 활성이면 가장 오래된(lifetime이 가장 큰 = 남은 시간이 가장 적은) 것을 재사용
  if (!slot) {
    let minRemaining = Infinity;
    for (let i = 0; i < WAVE_POOL_SIZE; i++) {
      const remaining = wavePool[i].maxLifetime - wavePool[i].lifetime;
      if (remaining < minRemaining) {
        minRemaining = remaining;
        slot = wavePool[i];
      }
    }
  }

  slot.active = true;
  slot.lifetime = 0;
  slot.mesh.position.x = x;
  slot.mesh.position.z = z;
  slot.mesh.visible = true;

  const col = color instanceof THREE.Color ? color : new THREE.Color(color);
  slot.material.color.copy(col);
  slot.material.opacity = WAVE_OPACITY_START;

  // 초기 스케일
  const s = WAVE_RADIUS_START;
  slot.mesh.scale.set(s, s, s);
}

/**
 * 히트 웨이브 매 프레임 업데이트
 * @param {number} dt - 프레임 시간 (초)
 */
function updateHitWaves(dt) {
  for (let i = 0; i < WAVE_POOL_SIZE; i++) {
    const wave = wavePool[i];
    if (!wave.active) continue;

    wave.lifetime += dt;
    const progress = wave.lifetime / wave.maxLifetime; // 0→1

    if (progress >= 1.0) {
      // 파동 종료
      wave.active = false;
      wave.mesh.visible = false;
      wave.material.opacity = 0;
      continue;
    }

    // 반지름: 0.1 → 2.0 (선형 보간)
    const radius = WAVE_RADIUS_START + (WAVE_RADIUS_END - WAVE_RADIUS_START) * progress;
    wave.mesh.scale.set(radius, radius, radius);

    // 투명도: 0.8 → 0.0 (이징: 후반에 빠르게)
    wave.material.opacity = WAVE_OPACITY_START * (1.0 - progress * progress);
  }
}

/**
 * 매 프레임 파티클 업데이트
 * @param {number} delta - 이전 프레임과의 시간 차이 (초)
 */
export function updateParticles(delta) {
  // delta가 너무 크면 무시 (탭 전환 등)
  const dt = Math.min(delta, 0.1);

  // ── 히트 파티클 업데이트 ──
  for (let i = 0; i < HIT_POOL_SIZE; i++) {
    if (hitLifetimes[i] <= 0) continue;

    hitLifetimes[i] -= dt;

    if (hitLifetimes[i] <= 0) {
      // 수명 종료 — 비활성화
      hitLifetimes[i] = 0;
      hitAlphas[i] = 0;
      // 화면 밖으로 이동
      hitPositions[i * 3 + 1] = -100;
      continue;
    }

    const vel = hitVelocities[i];

    // 중력 적용
    vel.vy += HIT_GRAVITY * dt;

    // 위치 갱신
    hitPositions[i * 3] += vel.vx * dt;
    hitPositions[i * 3 + 1] += vel.vy * dt;
    hitPositions[i * 3 + 2] += vel.vz * dt;

    // 속도 감쇠 (공기 저항)
    vel.vx *= 1.0 - 1.5 * dt;
    vel.vz *= 1.0 - 1.5 * dt;

    // 페이드아웃 (수명 비율 기반, 후반에 빠르게 사라짐)
    const lifeRatio = hitLifetimes[i] / HIT_LIFETIME;
    hitAlphas[i] = Math.pow(lifeRatio, 1.5);
  }

  // 버퍼 업데이트 플래그
  hitGeometry.attributes.position.needsUpdate = true;
  hitGeometry.attributes.alpha.needsUpdate = true;

  // ── 앰비언트 먼지 파티클 업데이트 ──
  ambientTime += dt;

  for (let i = 0; i < AMBIENT_COUNT; i++) {
    const ox = ambientDriftOffsets[i * 3];
    const oy = ambientDriftOffsets[i * 3 + 1];
    const oz = ambientDriftOffsets[i * 3 + 2];

    // 느린 사인파 이동 (각 축 독립)
    ambientPositions[i * 3] += Math.sin(ambientTime * AMBIENT_DRIFT_SPEED + ox) * dt * 0.15;
    ambientPositions[i * 3 + 1] += Math.sin(ambientTime * AMBIENT_DRIFT_SPEED * 0.7 + oy) * dt * 0.1;
    ambientPositions[i * 3 + 2] += Math.cos(ambientTime * AMBIENT_DRIFT_SPEED * 0.5 + oz) * dt * 0.12;

    // 범위 밖으로 나가면 반대쪽에서 재진입
    if (ambientPositions[i * 3] > AMBIENT_RANGE_X / 2) ambientPositions[i * 3] = -AMBIENT_RANGE_X / 2;
    if (ambientPositions[i * 3] < -AMBIENT_RANGE_X / 2) ambientPositions[i * 3] = AMBIENT_RANGE_X / 2;
    if (ambientPositions[i * 3 + 1] > AMBIENT_RANGE_Y) ambientPositions[i * 3 + 1] = -1;
    if (ambientPositions[i * 3 + 1] < -1) ambientPositions[i * 3 + 1] = AMBIENT_RANGE_Y;
    if (ambientPositions[i * 3 + 2] > AMBIENT_RANGE_Z / 2) ambientPositions[i * 3 + 2] = -AMBIENT_RANGE_Z / 2;
    if (ambientPositions[i * 3 + 2] < -AMBIENT_RANGE_Z / 2) ambientPositions[i * 3 + 2] = AMBIENT_RANGE_Z / 2;

    // 반짝임 효과 (사인파로 opacity 변화)
    const twinkle = Math.sin(ambientTime * AMBIENT_TWINKLE_SPEED + ox * 3.0) * 0.5 + 0.5;
    ambientAlphas[i] = ambientBaseAlphas[i] * (0.3 + twinkle * 0.7);
  }

  ambientGeometry.attributes.position.needsUpdate = true;
  ambientGeometry.attributes.alpha.needsUpdate = true;

  // ── 히트 웨이브 업데이트 ──
  updateHitWaves(dt);
}

/**
 * 파티클 시스템 정리
 * @param {THREE.Scene} scene - Three.js 씬
 */
export function disposeParticles(scene) {
  if (hitPoints) {
    scene.remove(hitPoints);
    hitGeometry.dispose();
    hitMaterial.dispose();
    hitPoints = null;
  }

  if (ambientPoints) {
    scene.remove(ambientPoints);
    ambientGeometry.dispose();
    ambientMaterial.dispose();
    ambientPoints = null;
  }

  // 히트 웨이브 정리
  wavePool.forEach(wave => {
    scene.remove(wave.mesh);
    wave.material.dispose();
  });
  if (waveGeometry) {
    waveGeometry.dispose();
    waveGeometry = null;
  }
  wavePool = [];
  waveScene = null;
}
