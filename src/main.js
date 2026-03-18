import * as THREE from 'three';
import { AppState, TRACK_COLORS, PIANO } from './constants.js';
import { createScene, setupPostProcessing, updateScene, renderScene, handleResize, updateDynamicBloom, updateDOF, updateGodRaysLightPosition } from './scene.js';
import { createPiano, pressKey, getKeyX } from './piano.js';
import { createNoteBlocks, updateNotePositions, setTrackVisible, setTrackColor, disposeNotes, setHitPoint, getHitPoint } from './notes.js';
import { loadMidiFromUrl, loadMidiFromFile } from './midi-parser.js';
import {
  loadSampler, loadNotes, tickAudio, resetScheduleIndex,
  startAudioContext, releaseAll, setMuted, setVolume, disposeAudio
} from './audio.js';
import { setupCamera, updateCamera, setFreeMode, applyPreset, setCinematicMode, updateCinematicCamera, isCinematicMode as getCinematicCameraMode, startOutroAtTime, isOutroPlaying } from './camera.js';
import { createParticles, emitHitParticles, emitHitWave, updateParticles } from './particles.js';
import {
  createControls, createTrackControls, setupFileUI,
  updateProgressBar, setupProgressBar,
  showFileOverlay, showLoadingOverlay, showProgressBar
} from './controls.js';
import { PlaybackClock } from './playback-clock.js';

// 시네마틱 프레젠테이션 모드 감지
const isCinematicMode = new URLSearchParams(window.location.search).has('cinematic');

const state = {
  current: AppState.IDLE,
  midiData: null,
  playbackSpeed: 1.0,
  volume: 80,
  muted: false,
};

let camera, scene;
const clock = new PlaybackClock();
const sceneClock = new THREE.Clock();

// 음악 에너지 EMA (Exponential Moving Average) — 급격한 변화 방지
let smoothedEnergy = 0;
const ENERGY_EMA_ALPHA = 0.08; // 낮을수록 더 부드럽게

function setState(newState) {
  state.current = newState;
}

function showCinematicTitle(title) {
  const el = document.getElementById('cinematic-title');
  if (!el) return;
  el.innerHTML = `${title}<span class="subtitle">3D MIDI Visualizer</span>`;
  el.classList.add('visible');
  setTimeout(() => el.classList.remove('visible'), 5000);
}

function getNoteHitCallback() {
  return (midiNote, trackIndex, velocity) => {
    const color = state.midiData?.tracks[trackIndex]?.color || 0xffffff;
    pressKey(midiNote, color);
    // 건반 히트 파티클
    const x = getKeyX(midiNote);
    emitHitParticles(x, 0.2, 0.75, color, velocity);
    // 히트 웨이브
    const hitZ = getHitPoint() === 'front'
      ? PIANO.WHITE_KEY_DEPTH / 2
      : -PIANO.WHITE_KEY_DEPTH / 2;
    emitHitWave(x, hitZ, color);
  };
}

function handleSelectFile() {
  if (state.current === AppState.PLAYING) {
    clock.pause();
    releaseAll();
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
      clock.stop();
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

    // 오디오 노트 로딩 (롤링 스케줄러용)
    loadNotes(midiData, getNoteHitCallback());

    // 트랙 컨트롤 UI 생성 (일반 모드만)
    if (!isCinematicMode) createTrackControls(midiData, {
      onTrackVisibility: (index, visible) => {
        midiData.tracks[index].visible = visible;
        setTrackVisible(index, visible);
        // 오디오도 재로딩
        loadNotes(midiData, getNoteHitCallback());
        resetScheduleIndex(clock.now());
      },
      onTrackColor: (index, color) => {
        midiData.tracks[index].color = color;
        setTrackColor(index, color);
      },
    });

    showLoadingOverlay(false);
    if (!isCinematicMode) showProgressBar(true);
    setState(AppState.READY);

  } catch (err) {
    console.error('MIDI 로드 실패:', err);
    showLoadingOverlay(false);
    showFileOverlay(true);
    setState(AppState.IDLE);
    alert('MIDI 파일을 로드할 수 없습니다: ' + err.message);
  }
}

async function togglePlayPause() {
  if (state.current === AppState.READY || state.current === AppState.PAUSED) {
    await startAudioContext();
    clock.play();
    setState(AppState.PLAYING);
  } else if (state.current === AppState.PLAYING) {
    clock.pause();
    releaseAll();
    setState(AppState.PAUSED);
  }
}

function init() {
  const container = document.getElementById('canvas-container');

  // 카메라
  camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 500);

  // 씬
  const sceneResult = createScene(container);
  scene = sceneResult.scene;

  setupPostProcessing(camera);
  setupCamera(camera, sceneResult.renderer.domElement);
  createPiano(scene);
  createParticles(scene);

  // 리사이즈
  window.addEventListener('resize', () => handleResize(camera, container));

  if (isCinematicMode) {
    // 시네마틱 모드: 모든 UI 숨기고 자동 재생
    showFileOverlay(false);
    showProgressBar(false);
    showLoadingOverlay(false);

    // 자동으로 첫 번째 샘플 로드 후 재생
    const defaultMidi = 'midi/chopin-nocturne-op9-no2.mid';
    // 시네마틱 카메라 활성화
    setCinematicMode(true);

    handleFileLoaded({ type: 'url', url: defaultMidi }).then(() => {
      if (state.midiData) {
        showCinematicTitle(state.midiData.name || 'Chopin Nocturne Op.9 No.2');
      }
      // 3초 후 자동 재생 시작 (인트로 시퀀스 대기)
      setTimeout(() => togglePlayPause(), 3000);
    });

  } else {
    // 일반 모드: 기존 UI 유지
    createControls(state, {
      onPlayPause: togglePlayPause,
      onSelectFile: handleSelectFile,
      onSpeedChange: (speed) => clock.setRate(speed),
      onHitPoint: (point) => setHitPoint(point),
      onMuteToggle: (muted) => setMuted(muted),
      onVolumeChange: (vol) => setVolume(vol),
      onCameraMode: (free) => setFreeMode(free),
      onCameraPreset: (preset) => applyPreset(preset),
    });

    setupFileUI(handleFileLoaded);

    setupProgressBar((ratio) => {
      if (state.midiData) {
        const targetTime = ratio * state.midiData.duration;
        clock.seek(targetTime);
        resetScheduleIndex(targetTime);
        releaseAll();
      }
    });
  }

  // 키보드 단축키 (두 모드 모두)
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') { e.preventDefault(); togglePlayPause(); }
    if (e.code === 'KeyM') { state.muted = !state.muted; setMuted(state.muted); }
    // F11: 시네마틱 모드 전환
    if (e.code === 'F11' && !isCinematicMode) {
      e.preventDefault();
      window.location.href = window.location.pathname + '?cinematic';
    }
  });

  // 초기 볼륨 설정
  setVolume(state.volume);

  // 렌더 루프
  animate();
}

function animate() {
  requestAnimationFrame(animate);
  const delta = sceneClock.getDelta();

  updateScene(delta);
  updateParticles(delta);

  if (state.current === AppState.PLAYING) {
    const t = clock.now();
    tickAudio(clock);
    updateNotePositions(t);

    // 음악 에너지 계산 (시네마틱 카메라용)
    let rawEnergy = 0;
    if (state.midiData) {
      let activeCount = 0;
      state.midiData.tracks.forEach(track => {
        if (!track.visible) return;
        track.notes.forEach(note => {
          if (note.time <= t && note.time + note.duration >= t) activeCount++;
        });
      });
      rawEnergy = Math.min(activeCount / 15, 1.0);
    }
    // EMA 스무딩 — 급격한 에너지 변화를 완화
    smoothedEnergy += ENERGY_EMA_ALPHA * (rawEnergy - smoothedEnergy);

    // 다이나믹 블룸 업데이트
    updateDynamicBloom(smoothedEnergy);

    // 동적 DOF — 카메라에서 피아노까지 실거리에 초점 맞춤
    if (getCinematicCameraMode()) {
      const distToPiano = camera.position.length();
      updateDOF(distToPiano * 0.95);
    }

    // God Rays 광원 위치를 카메라 기준으로 갱신
    updateGodRaysLightPosition(camera);

    // 카메라 업데이트
    if (getCinematicCameraMode()) {
      updateCinematicCamera(t, smoothedEnergy);
    } else {
      updateCamera();
    }

    if (state.midiData) {
      updateProgressBar(t, state.midiData.duration);
    }

    // 아웃트로 시퀀스: 곡 종료 3초 전 시작
    if (state.midiData && t >= state.midiData.duration - 3 && !isOutroPlaying()) {
      startOutroAtTime(t);
    }

    // 재생 완료 체크
    if (state.midiData && t >= state.midiData.duration) {
      clock.stop();
      releaseAll();
      setState(AppState.READY);
    }
  } else if (state.current === AppState.PAUSED || state.current === AppState.READY) {
    updateNotePositions(clock.now());
    updateCamera();
    if (state.midiData) {
      updateProgressBar(clock.now(), state.midiData.duration);
    }
  } else {
    updateCamera();
  }

  renderScene();
}

init();
