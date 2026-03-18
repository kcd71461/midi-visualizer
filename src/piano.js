import * as THREE from 'three';
import { PIANO } from './constants.js';

const keys = [];
const activeKeys = {};
const keyXLookup = {};
const keyWidthLookup = {};

function isWhiteKey(midiNote) {
  const n = midiNote % 12;
  return [0, 2, 4, 5, 7, 9, 11].includes(n);
}

export function createPiano(scene) {
  // 이전 키 초기화 (Storybook 스토리 전환 등에서 중복 방지)
  keys.length = 0;
  Object.keys(activeKeys).forEach(k => delete activeKeys[k]);

  const whiteKeyGeo = new THREE.BoxGeometry(
    PIANO.WHITE_KEY_WIDTH, PIANO.WHITE_KEY_HEIGHT, PIANO.WHITE_KEY_DEPTH
  );
  const blackKeyGeo = new THREE.BoxGeometry(
    PIANO.BLACK_KEY_WIDTH, PIANO.BLACK_KEY_HEIGHT, PIANO.BLACK_KEY_DEPTH
  );

  const whiteMat = new THREE.MeshStandardMaterial({
    color: 0xeeeeee, roughness: 0.3, metalness: 0.1,
  });
  const blackMat = new THREE.MeshStandardMaterial({
    color: 0x111111, roughness: 0.4, metalness: 0.2,
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
      const x = (whiteIndex - 26 - 0.5) * (PIANO.WHITE_KEY_WIDTH + PIANO.KEY_GAP);
      mesh.position.set(x, PIANO.BLACK_KEY_HEIGHT / 2, -0.25);
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
      keyXLookup[mn] = (wi - 26 - 0.5) * (PIANO.WHITE_KEY_WIDTH + PIANO.KEY_GAP);
      keyWidthLookup[mn] = PIANO.BLACK_KEY_WIDTH;
    }
  }

  return keys;
}

export function getKeyX(midiNote) {
  return keyXLookup[midiNote] ?? 0;
}

export function pressKey(midiNote, color) {
  const key = keys.find(k => k.midiNote === midiNote);
  if (!key) return;

  if (activeKeys[midiNote]) clearTimeout(activeKeys[midiNote]);

  key.mesh.position.y = key.baseY - 0.1;
  key.mesh.material.emissive.setHex(color);
  key.mesh.material.emissiveIntensity = 1.5;

  activeKeys[midiNote] = setTimeout(() => {
    key.mesh.position.y = key.baseY;
    key.mesh.material.emissive.setHex(0x000000);
    key.mesh.material.emissiveIntensity = 0;
    delete activeKeys[midiNote];
  }, 300);
}

export function getKeyWidth(midiNote) {
  return keyWidthLookup[midiNote] ?? PIANO.WHITE_KEY_WIDTH;
}
