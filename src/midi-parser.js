import { Midi } from '@tonejs/midi';

export function parseMidi(arrayBuffer) {
  const midi = new Midi(arrayBuffer);

  const tracks = midi.tracks
    .map((track, index) => {
      const notes = track.notes.map(note => ({
        midi: note.midi,
        time: note.time,
        duration: note.duration,
        velocity: note.velocity,
        name: note.name,
      }));

      return {
        index,
        name: track.name || `Track ${index + 1}`,
        channel: track.channel,
        notes,
        visible: track.channel !== 9,
        color: null,
      };
    })
    .filter(track => track.notes.length > 0);

  const duration = midi.duration;
  const name = midi.name || 'Untitled';

  return { tracks, duration, name };
}

export async function loadMidiFromUrl(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`MIDI 파일 로드 실패: ${url}`);
  const arrayBuffer = await response.arrayBuffer();
  return parseMidi(arrayBuffer);
}

export async function loadMidiFromFile(file) {
  const arrayBuffer = await file.arrayBuffer();
  return parseMidi(arrayBuffer);
}
