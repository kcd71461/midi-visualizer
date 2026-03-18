import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createPiano, pressKey } from './piano.js';
import { PIANO, TRACK_COLORS } from './constants.js';

export default {
  title: 'Components/Piano',
};

function createPianoScene(container) {
  const width = container.clientWidth || 900;
  const height = container.clientHeight || 500;

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a2e);

  const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 500);
  camera.position.set(0, 8, 12);
  camera.lookAt(0, 0, 0);

  const ambientLight = new THREE.AmbientLight(0x404060, 0.8);
  scene.add(ambientLight);
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
  dirLight.position.set(5, 10, 5);
  scene.add(dirLight);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  createPiano(scene);

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();

  const resizeObserver = new ResizeObserver(() => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  });
  resizeObserver.observe(container);

  return { scene, renderer, camera };
}

export const Default = () => {
  const wrapper = document.createElement('div');
  wrapper.style.width = '100%';
  wrapper.style.height = '500px';
  setTimeout(() => createPianoScene(wrapper), 0);
  return wrapper;
};

export const KeyPressTest = () => {
  const wrapper = document.createElement('div');
  wrapper.style.display = 'flex';
  wrapper.style.flexDirection = 'column';
  wrapper.style.height = '100vh';
  wrapper.style.background = '#1a1a2e';

  const sceneContainer = document.createElement('div');
  sceneContainer.style.flex = '1';
  wrapper.appendChild(sceneContainer);

  const panel = document.createElement('div');
  panel.style.cssText = 'padding:12px;display:flex;flex-wrap:wrap;gap:8px;background:#111;';
  wrapper.appendChild(panel);

  const testNotes = [
    { midi: 60, name: 'C4 (도)' },
    { midi: 62, name: 'D4 (레)' },
    { midi: 64, name: 'E4 (미)' },
    { midi: 65, name: 'F4 (파)' },
    { midi: 67, name: 'G4 (솔)' },
    { midi: 69, name: 'A4 (라)' },
    { midi: 71, name: 'B4 (시)' },
    { midi: 61, name: 'C#4' },
    { midi: 63, name: 'D#4' },
    { midi: 66, name: 'F#4' },
    { midi: 68, name: 'G#4' },
    { midi: 70, name: 'A#4' },
  ];

  testNotes.forEach(({ midi, name }, i) => {
    const btn = document.createElement('button');
    btn.textContent = name;
    btn.style.cssText = 'padding:8px 16px;border:1px solid #444;border-radius:6px;background:#222;color:#fff;cursor:pointer;font-size:13px;';
    btn.addEventListener('click', () => {
      pressKey(midi, TRACK_COLORS[i % TRACK_COLORS.length]);
    });
    panel.appendChild(btn);
  });

  const chords = [
    { name: 'C 메이저', notes: [60, 64, 67] },
    { name: 'A 마이너', notes: [57, 60, 64] },
    { name: 'G 메이저', notes: [55, 59, 62] },
    { name: 'F 메이저', notes: [53, 57, 60] },
  ];

  const chordPanel = document.createElement('div');
  chordPanel.style.cssText = 'padding:8px 12px;display:flex;gap:8px;background:#111;border-top:1px solid #333;';
  wrapper.appendChild(chordPanel);

  const chordLabel = document.createElement('span');
  chordLabel.textContent = '화음: ';
  chordLabel.style.cssText = 'color:#888;font-size:13px;line-height:36px;';
  chordPanel.appendChild(chordLabel);

  chords.forEach(({ name, notes }, ci) => {
    const btn = document.createElement('button');
    btn.textContent = name;
    btn.style.cssText = 'padding:8px 16px;border:1px solid #666;border-radius:6px;background:#333;color:#fff;cursor:pointer;font-size:13px;';
    btn.addEventListener('click', () => {
      notes.forEach((midi, ni) => {
        pressKey(midi, TRACK_COLORS[(ci + ni) % TRACK_COLORS.length]);
      });
    });
    chordPanel.appendChild(btn);
  });

  const randomBtn = document.createElement('button');
  randomBtn.textContent = '🎲 랜덤 노트';
  randomBtn.style.cssText = 'padding:8px 16px;border:1px solid #4ecdc4;border-radius:6px;background:#1a3a38;color:#4ecdc4;cursor:pointer;font-size:13px;';
  randomBtn.addEventListener('click', () => {
    const randomMidi = Math.floor(Math.random() * 61) + 30;
    pressKey(randomMidi, TRACK_COLORS[Math.floor(Math.random() * TRACK_COLORS.length)]);
  });
  chordPanel.appendChild(randomBtn);

  setTimeout(() => createPianoScene(sceneContainer), 0);
  return wrapper;
};
