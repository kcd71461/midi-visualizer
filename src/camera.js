import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as THREE from 'three';
import { CAMERA_PRESETS } from './constants.js';

let controls = null;
let camera = null;
let freeMode = false;

export function setupCamera(cam, domElement) {
  camera = cam;

  controls = new OrbitControls(camera, domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.enabled = false;

  applyPreset('default');

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
