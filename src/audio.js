import * as Tone from 'tone';

let sampler = null;
let scheduledEvents = [];
let isLoaded = false;
let lastMidiData = null;
let lastNoteHitCallback = null;

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

export function scheduleNotes(midiData, onNoteHit) {
  clearSchedule();
  lastMidiData = midiData;
  lastNoteHitCallback = onNoteHit;

  midiData.tracks.forEach((track, trackIndex) => {
    if (!track.visible) return;

    track.notes.forEach(note => {
      const eventId = Tone.Transport.schedule((time) => {
        if (sampler && isLoaded) {
          sampler.triggerAttackRelease(
            Tone.Frequency(note.midi, 'midi').toNote(),
            note.duration,
            time,
            note.velocity
          );
        }
        Tone.Draw.schedule(() => {
          if (onNoteHit) onNoteHit(note.midi, trackIndex, note.velocity);
        }, time);
      }, note.time);

      scheduledEvents.push(eventId);
    });
  });
}

export function clearSchedule() {
  scheduledEvents.forEach(id => Tone.Transport.clear(id));
  scheduledEvents = [];
}

export async function startPlayback() {
  await Tone.start();
  Tone.Transport.start();
}

export function pausePlayback() {
  Tone.Transport.pause();
}

export function stopPlayback() {
  Tone.Transport.stop();
  Tone.Transport.position = 0;
}

export function seekTo(seconds) {
  const wasPlaying = Tone.Transport.state === 'started';
  Tone.Transport.pause();
  Tone.Transport.seconds = seconds;

  if (lastMidiData && lastNoteHitCallback) {
    clearSchedule();
    scheduleNotes(lastMidiData, lastNoteHitCallback);
  }

  if (wasPlaying) Tone.Transport.start();
}

export function setPlaybackSpeed(rate) {
  Tone.Transport.playbackRate = rate;
}

export function setMuted(muted) {
  Tone.Destination.mute = muted;
}

export function setVolume(value) {
  const db = value <= 0 ? -Infinity : (value / 100) * 60 - 60;
  Tone.Destination.volume.value = db;
}

export function getCurrentTime() {
  return Tone.Transport.seconds;
}

export function getTransportState() {
  return Tone.Transport.state;
}

export function disposeAudio() {
  clearSchedule();
  Tone.Transport.stop();
  Tone.Transport.cancel();
}
