import * as THREE from 'three';
import { NOTES, PIANO, TRACK_COLORS } from './constants.js';
import { getKeyX, getKeyWidth } from './piano.js';

const trackMeshes = [];
const dummy = new THREE.Object3D();
const tempColor = new THREE.Color();

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

    // 크리스탈/유리 느낌 머티리얼 — NormalBlending으로 건반 가시성 확보
    const material = new THREE.MeshPhysicalMaterial({
      color: color,
      emissive: color,
      emissiveIntensity: 0.35,
      transparent: true,
      opacity: 0.82,
      transmission: 0.15,
      roughness: 0.05,
      metalness: 0.0,
      ior: 1.5,
      thickness: 0.5,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1,
      reflectivity: 0.9,
      envMapIntensity: 0.8,
      blending: THREE.NormalBlending,
      depthWrite: true,
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
      if (trailData && trailIndex < trailData.instancedMesh.count + 500) {
        // 노트의 시작 시점이 건반을 통과했고, 아직 트레일 시간 내
        if (note.time <= currentTime && note.time > currentTime - TRAIL_DURATION) {
          const elapsed = currentTime - note.time;
          // 급감쇠 + 긴 꼬리: 초반 밝게 번쩍 → 빠르게 감쇠 → 여운
          const opacity = Math.pow(1.0 - elapsed / TRAIL_DURATION, 2.5);

          if (opacity > 0 && trailIndex < trailData.instancedMesh.instanceMatrix.count) {
            const x = getKeyX(note.midi);
            const width = getKeyWidth(note.midi);

            trailDummy.position.set(x, NOTE_Y + TRAIL_Y_OFFSET, hitZ);
            trailDummy.scale.set(width, TRAIL_DEPTH, 1);
            trailDummy.updateMatrix();
            trailData.instancedMesh.setMatrixAt(trailIndex, trailDummy.matrix);

            // 색상에 opacity를 곱해 페이드 표현 (AdditiveBlending이므로 색상 밝기 = 가시 강도)
            tempColor.setHex(trailData.color);
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

      // 히트 모먼트 스케일 펄스: 건반 도달 직전 0.15초간 Y 스케일 확대
      const timeToHit = note.time - currentTime;
      let scaleY = 1;
      if (timeToHit >= 0 && timeToHit < 0.15) {
        const hitProgress = 1 - timeToHit / 0.15; // 0→1 as approaching hit
        scaleY = 1 + 0.3 * Math.sin(hitProgress * Math.PI); // 1→1.3→1 bell curve
      }

      dummy.position.set(x, NOTE_Y, z - depth / 2);
      dummy.scale.set(width, scaleY, depth);
      dummy.updateMatrix();
      trackMesh.instancedMesh.setMatrixAt(instanceIndex, dummy.matrix);

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
