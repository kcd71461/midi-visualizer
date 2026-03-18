import GUI from 'lil-gui';
import { TRACK_COLORS } from './constants.js';

let gui = null;
let trackFolder = null;

export function createControls(state, callbacks) {
  gui = new GUI({ title: '🎹 MIDI Visualizer' });

  const playback = gui.addFolder('재생');
  const playObj = {
    '재생/일시정지': () => callbacks.onPlayPause(),
    '곡 선택': () => callbacks.onSelectFile(),
  };
  playback.add(playObj, '재생/일시정지');
  playback.add(playObj, '곡 선택');
  playback.add(state, 'playbackSpeed', 0.25, 2.0, 0.25).name('속도').onChange(callbacks.onSpeedChange);
  playback.open();

  const audio = gui.addFolder('오디오');
  audio.add(state, 'muted').name('음소거').onChange(callbacks.onMuteToggle);
  audio.add(state, 'volume', 0, 100, 1).name('볼륨').onChange(callbacks.onVolumeChange);
  audio.open();

  const visual = gui.addFolder('비주얼');
  const visualObj = {
    hitPoint: '앞쪽',
  };
  visual.add(visualObj, 'hitPoint', ['앞쪽', '뒤쪽']).name('히트 포인트').onChange(v => {
    callbacks.onHitPoint(v === '앞쪽' ? 'front' : 'back');
  });
  visual.open();

  const cam = gui.addFolder('카메라');
  const camObj = {
    freeMode: false,
    '정면': () => callbacks.onCameraPreset('front'),
    '위에서': () => callbacks.onCameraPreset('top'),
    '측면': () => callbacks.onCameraPreset('side'),
    '기본': () => callbacks.onCameraPreset('default'),
  };
  cam.add(camObj, 'freeMode').name('자유 시점').onChange(callbacks.onCameraMode);
  cam.add(camObj, '기본');
  cam.add(camObj, '정면');
  cam.add(camObj, '위에서');
  cam.add(camObj, '측면');
  cam.open();

  return gui;
}

export function createTrackControls(midiData, callbacks) {
  if (trackFolder) {
    trackFolder.destroy();
  }

  trackFolder = gui.addFolder('트랙');

  midiData.tracks.forEach((track, index) => {
    const folder = trackFolder.addFolder(track.name);
    const obj = {
      visible: track.visible,
      color: '#' + (track.color || TRACK_COLORS[index % TRACK_COLORS.length]).toString(16).padStart(6, '0'),
    };
    folder.add(obj, 'visible').name('표시').onChange(v => callbacks.onTrackVisibility(index, v));
    folder.addColor(obj, 'color').name('색상').onChange(v => {
      callbacks.onTrackColor(index, parseInt(v.replace('#', ''), 16));
    });
  });

  trackFolder.open();
}

export function setupFileUI(onFileLoaded) {
  const fileOverlay = document.getElementById('file-overlay');
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const sampleBtns = document.querySelectorAll('.sample-btn');

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });
  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
  });
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) onFileLoaded({ type: 'file', file });
  });

  dropZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) onFileLoaded({ type: 'file', file });
  });

  sampleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const url = btn.dataset.midi;
      onFileLoaded({ type: 'url', url });
    });
  });
}

export function updateProgressBar(currentTime, duration) {
  const bar = document.getElementById('progress-bar');
  const timeDisplay = document.getElementById('progress-time');
  if (!bar || !timeDisplay) return;

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;
  bar.style.width = pct + '%';

  const fmt = (s) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };
  timeDisplay.textContent = `${fmt(currentTime)} / ${fmt(duration)}`;
}

export function setupProgressBar(onSeek) {
  const container = document.getElementById('progress-bar-container');
  container.addEventListener('click', (e) => {
    const rect = container.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    onSeek(ratio);
  });
}

export function showFileOverlay(show) {
  document.getElementById('file-overlay').classList.toggle('hidden', !show);
}

export function showLoadingOverlay(show) {
  document.getElementById('loading-overlay').classList.toggle('hidden', !show);
}

export function showProgressBar(show) {
  document.getElementById('progress-bar-container').classList.toggle('hidden', !show);
}
