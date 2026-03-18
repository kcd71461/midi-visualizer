// 피아노 건반 설정
export const PIANO = {
  TOTAL_KEYS: 88,
  FIRST_NOTE: 21, // A0 (MIDI note number)
  WHITE_KEY_WIDTH: 0.24,
  WHITE_KEY_HEIGHT: 0.15,
  WHITE_KEY_DEPTH: 1.5,
  BLACK_KEY_WIDTH: 0.14,
  BLACK_KEY_HEIGHT: 0.25,
  BLACK_KEY_DEPTH: 1.0,
  KEY_GAP: 0.04,
};

// 노트 블록 설정
export const NOTES = {
  SPEED: 10,
  LOOK_AHEAD: 5,
  BLOCK_HEIGHT: 0.12,
  MIN_BLOCK_DEPTH: 0.1,
};

// 트랙 색상 팔레트 (최대 16 트랙)
export const TRACK_COLORS = [
  0x4ecdc4, 0xff6b6b, 0xa78bfa, 0xffe66d,
  0xf472b6, 0x34d399, 0x60a5fa, 0xfbbf24,
  0xc084fc, 0xf87171, 0x2dd4bf, 0xfb923c,
  0x818cf8, 0xa3e635, 0xe879f9, 0x38bdf8,
];

// 카메라 프리셋
export const CAMERA_PRESETS = {
  default: { x: 0, y: 12, z: 18, lookAt: [0, 0, -5] },
  front:   { x: 0, y: 3,  z: 20, lookAt: [0, 0, 0] },
  top:     { x: 0, y: 25, z: 0,  lookAt: [0, 0, -5] },
  side:    { x: 25, y: 8, z: 5,  lookAt: [0, 0, -5] },
};

// 오디오 스케줄러
export const AUDIO = {
  SCHEDULE_AHEAD: 0.15, // 실시간 lookahead (초)
};

// 앱 상태
export const AppState = {
  IDLE: 'idle',
  LOADING: 'loading',
  READY: 'ready',
  PLAYING: 'playing',
  PAUSED: 'paused',
  SEEKING: 'seeking',
};
