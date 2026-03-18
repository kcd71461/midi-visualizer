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

// 검은 건반 per-key 미세 변화 생성
function createBlackKeyMaterial(keyIndex) {
  // 기본 색상에 미세한 변화 (0x18~0x22 범위)
  const baseR = 0x18 + Math.floor(Math.random() * 0x0a);
  const baseG = 0x18 + Math.floor(Math.random() * 0x08);
  const baseB = 0x1e + Math.floor(Math.random() * 0x0a);
  const color = (baseR << 16) | (baseG << 8) | baseB;

  // roughness도 미세하게 변화 (에보니 질감)
  const roughness = 0.2 + Math.random() * 0.15;

  return new THREE.MeshPhysicalMaterial({
    color,
    roughness,
    metalness: 0.08,
    reflectivity: 0.9,
    clearcoat: 1.0,
    clearcoatRoughness: 0.03 + Math.random() * 0.04,
    // 환경광 차단 시뮬레이션 — 건반 접촉부를 어둡게
    envMapIntensity: 0.5,
  });
}

function createWhiteKeyMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: 0xfafafa,
    roughness: 0.15,
    metalness: 0.05,
    reflectivity: 0.8,
    clearcoat: 0.6,
    clearcoatRoughness: 0.2,
    envMapIntensity: 0.6,
  });
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

  const whiteMat = createWhiteKeyMaterial();

  let whiteIndex = 0;
  let blackIndex = 0;

  for (let i = 0; i < PIANO.TOTAL_KEYS; i++) {
    const midiNote = PIANO.FIRST_NOTE + i;
    const white = isWhiteKey(midiNote);

    if (white) {
      const mesh = new THREE.Mesh(whiteKeyGeo, whiteMat.clone());
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
      const x = (whiteIndex - 26 - 0.5) * (PIANO.WHITE_KEY_WIDTH + PIANO.KEY_GAP);
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
