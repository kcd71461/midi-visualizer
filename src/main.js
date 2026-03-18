import { AppState } from './constants.js';
import { createScene, setupPostProcessing, updateScene, renderScene, handleResize } from './scene.js';
import * as THREE from 'three';

const state = {
  current: AppState.IDLE,
  midiData: null,
  playbackSpeed: 1.0,
  volume: 80,
  muted: false,
};

let camera;
const clock = new THREE.Clock();

function init() {
  const container = document.getElementById('canvas-container');

  camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 500);
  camera.position.set(0, 12, 18);
  camera.lookAt(0, 0, -5);

  const { scene } = createScene(container);
  scene.userData.camera = camera;
  setupPostProcessing(camera);

  window.addEventListener('resize', () => handleResize(camera, container));

  animate();
}

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  updateScene(delta);
  renderScene();
}

init();
