import * as THREE from 'three';
import { AppState, TRACK_COLORS } from './constants.js';
import { createScene, setupPostProcessing, updateScene, renderScene, handleResize, getScene } from './scene.js';
import { createPiano, pressKey } from './piano.js';
import { createNoteBlocks, updateNotePositions, setTrackVisible, setTrackColor, disposeNotes } from './notes.js';
import { loadMidiFromUrl, loadMidiFromFile } from './midi-parser.js';
import {
  loadSampler, scheduleNotes, clearSchedule,
  startPlayback, pausePlayback, stopPlayback, seekTo,
  setPlaybackSpeed, setMuted, setVolume, getCurrentTime, disposeAudio
} from './audio.js';
import { setupCamera, updateCamera, setFreeMode, applyPreset } from './camera.js';
import {
  createControls, createTrackControls, setupFileUI,
  updateProgressBar, setupProgressBar,
  showFileOverlay, showLoadingOverlay, showProgressBar
} from './controls.js';

const state = {
  current: AppState.IDLE,
  midiData: null,
  playbackSpeed: 1.0,
  volume: 80,
  muted: false,
};

let camera, scene;
const clock = new THREE.Clock();

function setState(newState) {
  state.current = newState;
}

function getNoteHitCallback() {
  return (midiNote, trackIndex, velocity) => {
    const color = state.midiData?.tracks[trackIndex]?.color || 0xffffff;
    pressKey(midiNote, color);
  };
}

function handleSelectFile() {
  if (state.current === AppState.PLAYING) {
    pausePlayback();
    setState(AppState.PAUSED);
  }
  showProgressBar(false);
  showFileOverlay(true);
}

async function handleFileLoaded(source) {
  try {
    setState(AppState.LOADING);
    showFileOverlay(false);
    showLoadingOverlay(true);
    showProgressBar(false);

    // 기존 리소스 정리
    if (state.midiData) {
      disposeNotes(scene);
      disposeAudio();
    }

    // MIDI 파싱
    let midiData;
    if (source.type === 'url') {
      midiData = await loadMidiFromUrl(source.url);
    } else {
      midiData = await loadMidiFromFile(source.file);
    }

    // 트랙 색상 할당
    midiData.tracks.forEach((track, i) => {
      track.color = TRACK_COLORS[i % TRACK_COLORS.length];
    });

    state.midiData = midiData;

    // 사운드폰트 로딩 (최초 1회, 실패 시 음소거 폴백)
    try {
      await loadSampler();
    } catch (err) {
      console.warn('사운드폰트 로딩 실패, 음소거 모드로 전환:', err);
      state.muted = true;
      setMuted(true);
    }

    // 노트 블록 생성
    createNoteBlocks(scene, midiData);

    // 오디오 스케줄링
    scheduleNotes(midiData, getNoteHitCallback());

    // 트랙 컨트롤 UI 생성
    createTrackControls(midiData, {
      onTrackVisibility: (index, visible) => {
        midiData.tracks[index].visible = visible;
        setTrackVisible(index, visible);
        // 오디오도 재스케줄링
        clearSchedule();
        scheduleNotes(midiData, getNoteHitCallback());
      },
      onTrackColor: (index, color) => {
        midiData.tracks[index].color = color;
        setTrackColor(index, color);
      },
    });

    showLoadingOverlay(false);
    showProgressBar(true);
    setState(AppState.READY);

  } catch (err) {
    console.error('MIDI 로드 실패:', err);
    showLoadingOverlay(false);
    showFileOverlay(true);
    setState(AppState.IDLE);
    alert('MIDI 파일을 로드할 수 없습니다: ' + err.message);
  }
}

function togglePlayPause() {
  if (state.current === AppState.READY || state.current === AppState.PAUSED) {
    startPlayback();
    setState(AppState.PLAYING);
  } else if (state.current === AppState.PLAYING) {
    pausePlayback();
    setState(AppState.PAUSED);
  }
}

function init() {
  const container = document.getElementById('canvas-container');

  // 카메라
  camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 500);

  // 씬
  const sceneResult = createScene(container);
  scene = sceneResult.scene;

  setupPostProcessing(camera);
  setupCamera(camera, sceneResult.renderer.domElement);
  createPiano(scene);

  // 리사이즈
  window.addEventListener('resize', () => handleResize(camera, container));

  // UI 컨트롤
  createControls(state, {
    onPlayPause: togglePlayPause,
    onSelectFile: handleSelectFile,
    onSpeedChange: (speed) => setPlaybackSpeed(speed),
    onMuteToggle: (muted) => setMuted(muted),
    onVolumeChange: (vol) => setVolume(vol),
    onCameraMode: (free) => setFreeMode(free),
    onCameraPreset: (preset) => applyPreset(preset),
  });

  // 파일 선택 UI
  setupFileUI(handleFileLoaded);

  // 프로그레스 바 탐색
  setupProgressBar((ratio) => {
    if (state.midiData) {
      seekTo(ratio * state.midiData.duration);
    }
  });

  // 키보드 단축키
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') { e.preventDefault(); togglePlayPause(); }
    if (e.code === 'KeyM') { state.muted = !state.muted; setMuted(state.muted); }
  });

  // 초기 볼륨 설정
  setVolume(state.volume);

  // 렌더 루프
  animate();
}

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();

  updateScene(delta);
  updateCamera();

  if (state.current === AppState.PLAYING || state.current === AppState.PAUSED) {
    const t = getCurrentTime();
    updateNotePositions(t);
    if (state.midiData) {
      updateProgressBar(t, state.midiData.duration);
    }

    // 재생 완료 체크
    if (state.current === AppState.PLAYING && state.midiData && t >= state.midiData.duration) {
      stopPlayback();
      setState(AppState.READY);
    }
  }

  renderScene();
}

init();
