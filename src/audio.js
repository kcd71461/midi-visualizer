import * as Tone from 'tone';
import { AUDIO } from './constants.js';

let sampler = null;
let isLoaded = false;

// 롤링 스케줄러 상태
let allNotes = [];       // 시간순 정렬된 flat 노트 배열
let scheduleIndex = 0;   // 다음 스케줄할 노트의 인덱스
let noteHitCallback = null;

const SOUNDFONT_URL = 'https://tonejs.github.io/audio/salamander/';

export async function loadSampler() {
  if (sampler) return;

  sampler = new Tone.Sampler({
    urls: {
      A0: 'A0.mp3', C1: 'C1.mp3', 'D#1': 'Ds1.mp3', 'F#1': 'Fs1.mp3',
      A1: 'A1.mp3', C2: 'C2.mp3', 'D#2': 'Ds2.mp3', 'F#2': 'Fs2.mp3',
      A2: 'A2.mp3', C3: 'C3.mp3', 'D#3': 'Ds3.mp3', 'F#3': 'Fs3.mp3',
      A3: 'A3.mp3', C4: 'C4.mp3', 'D#4': 'Ds4.mp3', 'F#4': 'Fs4.mp3',
      A4: 'A4.mp3', C5: 'C5.mp3', 'D#5': 'Ds5.mp3', 'F#5': 'Fs5.mp3',
      A5: 'A5.mp3', C6: 'C6.mp3', 'D#6': 'Ds6.mp3', 'F#6': 'Fs6.mp3',
      A6: 'A6.mp3', C7: 'C7.mp3', 'D#7': 'Ds7.mp3', 'F#7': 'Fs7.mp3',
      A7: 'A7.mp3', C8: 'C8.mp3',
    },
    release: 1,
    baseUrl: SOUNDFONT_URL,
  }).toDestination();

  return new Promise((resolve) => {
    Tone.loaded().then(() => {
      isLoaded = true;
      resolve();
    });
  });
}

/**
 * 전체 노트를 시간순 flat 배열로 저장하고 커서를 초기화
 */
export function loadNotes(midiData, onNoteHit) {
  allNotes = [];
  noteHitCallback = onNoteHit;

  midiData.tracks.forEach((track, trackIndex) => {
    if (!track.visible) return;
    track.notes.forEach(note => {
      allNotes.push({
        time: note.time,
        duration: note.duration,
        midi: note.midi,
        velocity: note.velocity,
        trackIndex,
      });
    });
  });

  // 시간순 정렬
  allNotes.sort((a, b) => a.time - b.time);
  scheduleIndex = 0;
}

/**
 * 매 프레임 호출 — lookahead 윈도우 내 노트를 Web Audio에 직접 스케줄링
 */
export function tickAudio(clock) {
  if (!sampler || !isLoaded || allNotes.length === 0) return;

  const logicalNow = clock.now();
  const rate = clock.getRate();
  // 논리적 시간 기준 lookahead 범위
  const horizon = logicalNow + AUDIO.SCHEDULE_AHEAD * rate;
  const audioNow = Tone.getContext().currentTime;

  while (scheduleIndex < allNotes.length) {
    const note = allNotes[scheduleIndex];

    if (note.time > horizon) break; // 아직 스케줄할 시간 아님
    if (note.time < logicalNow) {
      // 이미 지나간 노트 — 스킵
      scheduleIndex++;
      continue;
    }

    // 논리적 시간 → Web Audio 시간 변환
    const deltaWall = (note.time - logicalNow) / rate;
    const audioTime = audioNow + deltaWall;

    // 오디오 재생
    const noteName = Tone.Frequency(note.midi, 'midi').toNote();
    const audioDuration = note.duration / rate;
    sampler.triggerAttackRelease(noteName, audioDuration, audioTime, note.velocity);

    // 시각적 콜백 (건반 눌림 효과)
    if (noteHitCallback) {
      const cb = noteHitCallback;
      const { midi, trackIndex, velocity } = note;
      Tone.Draw.schedule(() => {
        cb(midi, trackIndex, velocity);
      }, audioTime);
    }

    scheduleIndex++;
  }
}

/**
 * seek 시 이진탐색으로 커서 위치 재설정
 */
export function resetScheduleIndex(musicalTime) {
  if (sampler) sampler.releaseAll();

  let lo = 0, hi = allNotes.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (allNotes[mid].time < musicalTime) lo = mid + 1;
    else hi = mid;
  }
  scheduleIndex = lo;
}

export async function startAudioContext() {
  await Tone.start();
}

export function releaseAll() {
  if (sampler) sampler.releaseAll();
}

export function setMuted(muted) {
  Tone.Destination.mute = muted;
}

export function setVolume(value) {
  const db = value <= 0 ? -Infinity : (value / 100) * 60 - 60;
  Tone.Destination.volume.value = db;
}

export function disposeAudio() {
  allNotes = [];
  scheduleIndex = 0;
  noteHitCallback = null;
  if (sampler) sampler.releaseAll();
}
