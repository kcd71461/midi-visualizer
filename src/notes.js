import * as THREE from 'three';
import { NOTES, TRACK_COLORS } from './constants.js';
import { getKeyX, getKeyWidth } from './piano.js';

const trackMeshes = [];
const dummy = new THREE.Object3D();
const tempColor = new THREE.Color();

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
    instancedMesh.count = 0;
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

      if (noteEnd < currentTime - 0.5 || note.time > currentTime + lookAhead) {
        continue;
      }

      const z = -(note.time - currentTime) * NOTES.SPEED;
      const x = getKeyX(note.midi);
      const depth = Math.max(note.duration * NOTES.SPEED, NOTES.MIN_BLOCK_DEPTH);
      const width = getKeyWidth(note.midi);

      dummy.position.set(x, 1.5, z - depth / 2);
      dummy.scale.set(width, 1, depth);
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
  });
}

export function setTrackVisible(trackIndex, visible) {
  const tm = trackMeshes.find(t => t.trackIndex === trackIndex);
  if (tm) tm.visible = visible;
}

export function setTrackColor(trackIndex, color) {
  const tm = trackMeshes.find(t => t.trackIndex === trackIndex);
  if (tm) {
    tm.color = color;
    tm.instancedMesh.material.color.setHex(color);
    tm.instancedMesh.material.emissive.setHex(color);
  }
}

export function disposeNotes(scene) {
  trackMeshes.forEach(tm => {
    scene.remove(tm.instancedMesh);
    tm.instancedMesh.geometry.dispose();
    tm.instancedMesh.material.dispose();
  });
  trackMeshes.length = 0;
}
