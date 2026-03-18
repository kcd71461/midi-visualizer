import { AppState } from './constants.js';

const state = {
  current: AppState.IDLE,
  midiData: null,
  playbackSpeed: 1.0,
  volume: 80,
  muted: false,
};

function init() {
  console.log('3D MIDI Visualizer initialized');
}

init();
