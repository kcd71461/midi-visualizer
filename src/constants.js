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

// 트랙 색상 팔레트 — 통일된 인디고-바이올렛 크로매틱 패밀리
// 단일 따뜻한 악센트(cream)로 콘트라스트
export const TRACK_COLORS = [
  0x8b9cf4, 0xc4a8ff, 0x6dd5fa, 0xf4b8d4,
  0xa8d8f0, 0xd4b8f4, 0x7ec8e3, 0xf0c8d4,
  0x9bb8ff, 0xc8e8f4, 0xe8b8ff, 0xb8d4f0,
  0xf4d8a8, 0xc0c8ff, 0xb0e8d8, 0xf8c8e8,
];

// 카메라 프리셋
export const CAMERA_PRESETS = {
  default: { x: 0, y: 7, z: 16, lookAt: [0, 0, 0] },
  front:   { x: 0, y: 2, z: 16, lookAt: [0, 0, 0] },
  top:     { x: 0, y: 22, z: 2, lookAt: [0, 0, -3] },
  side:    { x: 20, y: 6, z: 5, lookAt: [0, 0, 0] },
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
