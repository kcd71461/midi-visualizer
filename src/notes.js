import * as THREE from 'three';
import { NOTES, PIANO, TRACK_COLORS } from './constants.js';
import { getKeyX, getKeyWidth } from './piano.js';

const trackMeshes = [];
const dummy = new THREE.Object3D();
const tempColor = new THREE.Color();
const _scratchColor = new THREE.Color(); // 트레일 플래시용 스크래치 컬러 (GC 방지)

// ─────────────────────────────────────────────
// 트레일(잔상) 시스템
// - 노트가 건반을 지나간 후 0.5초간 발광 잔상
// ─────────────────────────────────────────────
const TRAIL_DURATION = 0.5;       // 트레일 지속 시간 (초)
const TRAIL_DEPTH = 0.3;          // 트레일 Z 크기 (얇은 플레인)
const TRAIL_Y_OFFSET = 0.01;     // 노트보다 살짝 위

const trailMeshes = [];           // 트랙별 트레일 InstancedMesh
const trailDummy = new THREE.Object3D();

export function createNoteBlocks(scene, midiData) {
  disposeNotes(scene);

  const geometry = new THREE.BoxGeometry(1, NOTES.BLOCK_HEIGHT, 1);

  // 트레일 전용 PlaneGeometry (얇은 수평 플레인)
  const trailGeometry = new THREE.PlaneGeometry(1, 1);
  // 플레인을 수평으로 눕힘 (기본은 XY면 → XZ면으로)
  trailGeometry.rotateX(-Math.PI / 2);

  midiData.tracks.forEach((track, trackIndex) => {
    if (!track.visible || track.notes.length === 0) return;

    const color = track.color || TRACK_COLORS[trackIndex % TRACK_COLORS.length];

    // MeshStandardMaterial + emissive — 씬 조명에 반응하면서 자체 발광
    // 키라이트/림라이트가 노트 표면을 조각하여 3D 깊이감 생성
    const material = new THREE.MeshStandardMaterial({
      color: color,
      emissive: color,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.78,
      roughness: 0.15,
      metalness: 0.0,
      depthWrite: false,
    });

    const maxVisible = track.notes.length;
    const instancedMesh = new THREE.InstancedMesh(geometry, material, maxVisible);
    instancedMesh.count = 0;
    instancedMesh.frustumCulled = false;

    scene.add(instancedMesh);

    // ── 트레일 InstancedMesh 생성 ──
    const trailMaterial = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    // 트레일 최대 수 = 동시에 표시 가능한 트레일 수 (최근 0.5초 내 히트한 노트)
    const trailMaxVisible = Math.min(track.notes.length, 500);
    const trailInstancedMesh = new THREE.InstancedMesh(trailGeometry, trailMaterial, trailMaxVisible);
    trailInstancedMesh.count = 0;
    trailInstancedMesh.frustumCulled = false;

    scene.add(trailInstancedMesh);

    trackMeshes.push({
      instancedMesh,
      notes: track.notes,
      trackIndex,
      color,
      visible: track.visible,
    });

    trailMeshes.push({
      instancedMesh: trailInstancedMesh,
      material: trailMaterial,
      notes: track.notes,
      trackIndex,
      color,
      visible: track.visible,
    });
  });
}

const NOTE_Y = PIANO.WHITE_KEY_HEIGHT / 2 + NOTES.BLOCK_HEIGHT / 2 + 0.15;
const KEY_FRONT_Z = PIANO.WHITE_KEY_DEPTH / 2;   // 앞쪽 가장자리
const KEY_BACK_Z = -PIANO.WHITE_KEY_DEPTH / 2;    // 뒤쪽 가장자리

// 'front' = 앞쪽 가장자리, 'back' = 뒤쪽 가장자리
let hitPoint = 'front';

export function setHitPoint(point) {
  hitPoint = point;
}

export function getHitPoint() {
  return hitPoint;
}

export function updateNotePositions(currentTime) {
  const lookAhead = NOTES.LOOK_AHEAD;

  trackMeshes.forEach((trackMesh, idx) => {
    if (!trackMesh.visible) {
      trackMesh.instancedMesh.count = 0;
      if (trailMeshes[idx]) trailMeshes[idx].instancedMesh.count = 0;
      return;
    }

    let instanceIndex = 0;
    let trailIndex = 0;
    const trailData = trailMeshes[idx];
    const hitZ = hitPoint === 'front' ? KEY_FRONT_Z : KEY_BACK_Z;

    for (const note of trackMesh.notes) {
      const noteEnd = note.time + note.duration;

      // ── 트레일 체크: 노트가 건반을 지나간 후 TRAIL_DURATION 이내 ──
      // 플래시 페이즈 (0~80ms): 히트 순간 Z 확장 + 백열 화이트
      // 디케이 페이즈 (80ms~500ms): pow(2.5) 급감쇠
      const FLASH_END = 0.08;
      if (trailData && trailIndex < trailData.instancedMesh.count + 500) {
        if (note.time <= currentTime && note.time > currentTime - TRAIL_DURATION) {
          const elapsed = currentTime - note.time;

          let opacity, zScale;
          if (elapsed < FLASH_END) {
            // 플래시: Z 확장 + 밝은 백열
            const flashT = elapsed / FLASH_END;
            opacity = 1.0;
            zScale = 1.0 + 3.0 * (1 - flashT * flashT);
          } else {
            // 디케이: pow(2.5) 감쇠
            const decayT = (elapsed - FLASH_END) / (TRAIL_DURATION - FLASH_END);
            opacity = Math.pow(1.0 - decayT, 2.5);
            zScale = 1.0;
          }

          if (opacity > 0 && trailIndex < trailData.instancedMesh.instanceMatrix.count) {
            const x = getKeyX(note.midi);
            const width = getKeyWidth(note.midi);

            trailDummy.position.set(x, NOTE_Y + TRAIL_Y_OFFSET, hitZ);
            trailDummy.scale.set(width, TRAIL_DEPTH, zScale);
            trailDummy.updateMatrix();
            trailData.instancedMesh.setMatrixAt(trailIndex, trailDummy.matrix);

            // 플래시 페이즈: 백열→원색 전환
            if (elapsed < FLASH_END) {
              const flashT = elapsed / FLASH_END;
              tempColor.setRGB(1, 1, 1);
              _scratchColor.setHex(trailData.color);
              tempColor.lerp(_scratchColor, flashT);
            } else {
              tempColor.setHex(trailData.color);
            }
            tempColor.multiplyScalar(opacity * (0.5 + note.velocity * 0.5));
            trailData.instancedMesh.setColorAt(trailIndex, tempColor);

            trailIndex++;
          }
        }
      }

      // ── 기존 노트 블록 렌더링 ──
      // 완전히 지나갔거나 너무 먼 노트 스킵
      if (noteEnd <= currentTime || note.time > currentTime + lookAhead) {
        continue;
      }

      // 건반 앞쪽 가장자리(KEY_FRONT_Z) 뒤로 지나간 부분 클리핑
      const visibleStart = Math.max(note.time, currentTime);
      const visibleDuration = noteEnd - visibleStart;
      const depth = Math.max(visibleDuration * NOTES.SPEED, NOTES.MIN_BLOCK_DEPTH);

      const z = -(visibleStart - currentTime) * NOTES.SPEED + hitZ;
      const x = getKeyX(note.midi);
      const width = getKeyWidth(note.midi);

      // ── 노트 비행 중 애니메이션 ──
      const timeToHit = note.time - currentTime;
      const proximity = lookAhead > 0 ? 1 - Math.max(0, timeToHit) / lookAhead : 1; // 0→1 as approaching hit

      // 근접 시 Y 스케일 팽창 (존재감 증가) — 0.8→1.0 범위
      const scaleY = 0.8 + proximity * 0.2;

      // 히트 직전 0.3초: 글로우 증폭 — 관객의 시선 집중
      let glowBoost = 1.0;
      if (timeToHit >= 0 && timeToHit < 0.3) {
        glowBoost = 1.0 + 0.5 * Math.pow(1 - timeToHit / 0.3, 2);
      }

      dummy.position.set(x, NOTE_Y, z - depth / 2);
      dummy.scale.set(width, scaleY, depth);
      dummy.updateMatrix();
      trackMesh.instancedMesh.setMatrixAt(instanceIndex, dummy.matrix);

      // velocity 기반 밝기 + 근접 글로우 부스트
      tempColor.setHex(trackMesh.color);
      tempColor.multiplyScalar((0.5 + note.velocity * 0.5) * glowBoost);
      trackMesh.instancedMesh.setColorAt(instanceIndex, tempColor);

      instanceIndex++;
    }

    trackMesh.instancedMesh.count = instanceIndex;
    trackMesh.instancedMesh.instanceMatrix.needsUpdate = true;
    if (trackMesh.instancedMesh.instanceColor) {
      trackMesh.instancedMesh.instanceColor.needsUpdate = true;
    }

    // 트레일 메시 업데이트
    if (trailData) {
      trailData.instancedMesh.count = trailIndex;
      trailData.instancedMesh.instanceMatrix.needsUpdate = true;
      if (trailData.instancedMesh.instanceColor) {
        trailData.instancedMesh.instanceColor.needsUpdate = true;
      }
    }
  });
}

export function setTrackVisible(trackIndex, visible) {
  const tm = trackMeshes.find(t => t.trackIndex === trackIndex);
  if (tm) tm.visible = visible;
  const trail = trailMeshes.find(t => t.trackIndex === trackIndex);
  if (trail) trail.visible = visible;
}

export function setTrackColor(trackIndex, color) {
  const tm = trackMeshes.find(t => t.trackIndex === trackIndex);
  if (tm) {
    tm.color = color;
    tm.instancedMesh.material.color.setHex(color);
    tm.instancedMesh.material.emissive.setHex(color);
  }
  const trail = trailMeshes.find(t => t.trackIndex === trackIndex);
  if (trail) {
    trail.color = color;
    trail.material.color.setHex(color);
  }
}

export function disposeNotes(scene) {
  trackMeshes.forEach(tm => {
    scene.remove(tm.instancedMesh);
    tm.instancedMesh.geometry.dispose();
    tm.instancedMesh.material.dispose();
  });
  trackMeshes.length = 0;

  trailMeshes.forEach(tm => {
    scene.remove(tm.instancedMesh);
    tm.instancedMesh.geometry.dispose();
    tm.instancedMesh.material.dispose();
  });
  trailMeshes.length = 0;
}
