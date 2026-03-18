import pkg from '@tonejs/midi';
const { Midi } = pkg;
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper: note name to MIDI number
const NOTE_MAP = {
  'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3,
  'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8,
  'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11,
};

function noteToMidi(name) {
  const match = name.match(/^([A-G][#b]?)(\d+)$/);
  if (!match) throw new Error(`Invalid note: ${name}`);
  return NOTE_MAP[match[1]] + (parseInt(match[2]) + 1) * 12;
}

function generatePachelbelCanon() {
  const midi = new Midi();
  midi.header.setTempo(70); // BPM
  midi.header.timeSignatures.push({ ticks: 0, timeSignature: [4, 4] });

  // --- Track 1: Chord accompaniment (left hand) ---
  const chordTrack = midi.addTrack();
  chordTrack.name = 'Chords';
  chordTrack.channel = 0;

  // Canon chord progression: D - A - Bm - F#m - G - D - G - A
  // Each chord lasts 2 beats (half a bar at 4/4)
  const chords = [
    ['D3', 'F#3', 'A3'],   // D
    ['A2', 'C#3', 'E3'],   // A
    ['B2', 'D3', 'F#3'],   // Bm
    ['F#2', 'A2', 'C#3'],  // F#m
    ['G2', 'B2', 'D3'],    // G
    ['D3', 'F#3', 'A3'],   // D
    ['G2', 'B2', 'D3'],    // G
    ['A2', 'C#3', 'E3'],   // A
  ];

  const beatsPerChord = 2;
  const secondsPerBeat = 60 / 70;
  const repetitions = 5; // 5 repetitions of the 8-chord progression

  for (let rep = 0; rep < repetitions; rep++) {
    for (let i = 0; i < chords.length; i++) {
      const startTime = (rep * chords.length + i) * beatsPerChord * secondsPerBeat;
      const duration = beatsPerChord * secondsPerBeat * 0.95;
      for (const note of chords[i]) {
        chordTrack.addNote({
          midi: noteToMidi(note),
          time: startTime,
          duration: duration,
          velocity: 0.5,
        });
      }
    }
  }

  // --- Track 2: Melody (right hand) ---
  const melodyTrack = midi.addTrack();
  melodyTrack.name = 'Melody';
  melodyTrack.channel = 0;

  // Famous Canon melody (simplified, quarter notes mostly)
  // First pass: the iconic descending pattern
  const melodyPatterns = [
    // Pattern 1 (first 2 repetitions): simple long notes
    [
      { note: 'F#5', beats: 2 },
      { note: 'E5', beats: 2 },
      { note: 'D5', beats: 2 },
      { note: 'C#5', beats: 2 },
      { note: 'B4', beats: 2 },
      { note: 'A4', beats: 2 },
      { note: 'B4', beats: 2 },
      { note: 'C#5', beats: 2 },
    ],
    // Pattern 2: eighth note movement
    [
      { note: 'D5', beats: 1 }, { note: 'F#5', beats: 1 },
      { note: 'A5', beats: 1 }, { note: 'G5', beats: 1 },
      { note: 'F#5', beats: 1 }, { note: 'D5', beats: 1 },
      { note: 'E5', beats: 1 }, { note: 'C#5', beats: 1 },
      { note: 'D5', beats: 1 }, { note: 'B4', beats: 1 },
      { note: 'A4', beats: 1 }, { note: 'G4', beats: 1 },
      { note: 'A4', beats: 1 }, { note: 'B4', beats: 1 },
      { note: 'C#5', beats: 1 }, { note: 'E5', beats: 1 },
    ],
    // Pattern 3: more elaborate
    [
      { note: 'F#5', beats: 0.5 }, { note: 'E5', beats: 0.5 }, { note: 'F#5', beats: 0.5 }, { note: 'G5', beats: 0.5 },
      { note: 'A5', beats: 0.5 }, { note: 'G5', beats: 0.5 }, { note: 'A5', beats: 0.5 }, { note: 'B5', beats: 0.5 },
      { note: 'G5', beats: 0.5 }, { note: 'F#5', beats: 0.5 }, { note: 'G5', beats: 0.5 }, { note: 'E5', beats: 0.5 },
      { note: 'F#5', beats: 0.5 }, { note: 'E5', beats: 0.5 }, { note: 'D5', beats: 0.5 }, { note: 'C#5', beats: 0.5 },
      { note: 'B4', beats: 0.5 }, { note: 'A4', beats: 0.5 }, { note: 'B4', beats: 0.5 }, { note: 'C#5', beats: 0.5 },
      { note: 'D5', beats: 0.5 }, { note: 'C#5', beats: 0.5 }, { note: 'B4', beats: 0.5 }, { note: 'A4', beats: 0.5 },
      { note: 'B4', beats: 0.5 }, { note: 'C#5', beats: 0.5 }, { note: 'D5', beats: 0.5 }, { note: 'E5', beats: 0.5 },
      { note: 'C#5', beats: 0.5 }, { note: 'D5', beats: 0.5 }, { note: 'E5', beats: 0.5 }, { note: 'F#5', beats: 0.5 },
    ],
  ];

  // Start melody after 1 full chord cycle (16 beats) as in the original
  let currentTime = 16 * secondsPerBeat;

  for (let patIdx = 0; patIdx < melodyPatterns.length; patIdx++) {
    const pattern = melodyPatterns[patIdx];
    // Repeat pattern to fill remaining space
    const repeats = patIdx === 0 ? 1 : 1;
    for (let r = 0; r < repeats; r++) {
      for (const { note, beats } of pattern) {
        const dur = beats * secondsPerBeat * 0.9;
        melodyTrack.addNote({
          midi: noteToMidi(note),
          time: currentTime,
          duration: dur,
          velocity: 0.7 + Math.random() * 0.15,
        });
        currentTime += beats * secondsPerBeat;
      }
    }
  }

  // Add one more repetition of pattern 3 to extend duration
  for (const { note, beats } of melodyPatterns[2]) {
    const dur = beats * secondsPerBeat * 0.9;
    melodyTrack.addNote({
      midi: noteToMidi(note),
      time: currentTime,
      duration: dur,
      velocity: 0.65 + Math.random() * 0.15,
    });
    currentTime += beats * secondsPerBeat;
  }

  return midi;
}

function generateSummer() {
  const midi = new Midi();
  midi.header.setTempo(120); // BPM
  midi.header.timeSignatures.push({ ticks: 0, timeSignature: [4, 4] });

  const secondsPerBeat = 60 / 120; // 0.5s

  // --- Track 1: Left hand arpeggiated chords ---
  const chordTrack = midi.addTrack();
  chordTrack.name = 'Accompaniment';
  chordTrack.channel = 0;

  // "Summer" uses Am-based progressions
  // Simplified chord progression: Am - F - C - G (repeated), then Em - Am - Dm - E
  const chordProgressions = [
    // Intro/verse pattern (repeated)
    [
      ['A2', 'C3', 'E3'],   // Am
      ['F2', 'A2', 'C3'],   // F
      ['C3', 'E3', 'G3'],   // C
      ['G2', 'B2', 'D3'],   // G
    ],
    // Variant
    [
      ['A2', 'C3', 'E3'],   // Am
      ['E2', 'G#2', 'B2'],  // E
      ['A2', 'C3', 'E3'],   // Am
      ['D2', 'F2', 'A2'],   // Dm
    ],
  ];

  const beatsPerChord = 4;
  let chordTime = 0;
  const totalRepetitions = 5;

  for (let rep = 0; rep < totalRepetitions; rep++) {
    const prog = chordProgressions[rep % chordProgressions.length];
    for (const chord of prog) {
      // Arpeggiate the chord (broken chord pattern)
      for (let beat = 0; beat < 4; beat++) {
        const noteIdx = beat % chord.length;
        const t = chordTime + beat * secondsPerBeat;
        chordTrack.addNote({
          midi: noteToMidi(chord[noteIdx]),
          time: t,
          duration: secondsPerBeat * 0.8,
          velocity: 0.45 + (beat === 0 ? 0.1 : 0),
        });
        // Add octave above on off-beats
        if (beat === 1 || beat === 3) {
          chordTrack.addNote({
            midi: noteToMidi(chord[noteIdx]) + 12,
            time: t,
            duration: secondsPerBeat * 0.7,
            velocity: 0.35,
          });
        }
      }
      chordTime += beatsPerChord * secondsPerBeat;
    }
  }

  // --- Track 2: Melody ---
  const melodyTrack = midi.addTrack();
  melodyTrack.name = 'Melody';
  melodyTrack.channel = 0;

  // "Summer" main theme (simplified, in A minor)
  // The recognizable bouncy melody
  const melodyPhrases = [
    // Phrase 1: opening motif
    [
      { note: 'E5', beats: 0.5 },
      { note: 'A5', beats: 0.5 },
      { note: 'B5', beats: 0.5 },
      { note: 'C6', beats: 1.5 },
      { note: 'B5', beats: 0.5 },
      { note: 'A5', beats: 0.5 },
      { note: 'E5', beats: 0.5 },
      { note: 'A5', beats: 0.5 },
      { note: 'B5', beats: 0.5 },
      { note: 'C6', beats: 1 },
      { note: 'D6', beats: 0.5 },
      { note: 'C6', beats: 0.5 },
      { note: 'B5', beats: 1 },
      { note: 'A5', beats: 1 },
      { note: null, beats: 2 }, // rest
      { note: 'E5', beats: 0.5 },
      { note: 'A5', beats: 0.5 },
      { note: 'B5', beats: 0.5 },
      { note: 'C6', beats: 1.5 },
      { note: 'D6', beats: 0.5 },
      { note: 'E6', beats: 0.5 },
      { note: 'D6', beats: 0.5 },
      { note: 'C6', beats: 0.5 },
      { note: 'B5', beats: 0.5 },
      { note: 'A5', beats: 1 },
      { note: 'G5', beats: 0.5 },
      { note: 'A5', beats: 1.5 },
      { note: null, beats: 2 }, // rest
    ],
    // Phrase 2: second part
    [
      { note: 'A5', beats: 0.5 },
      { note: 'C6', beats: 0.5 },
      { note: 'B5', beats: 0.5 },
      { note: 'A5', beats: 0.5 },
      { note: 'G5', beats: 1 },
      { note: 'E5', beats: 1 },
      { note: 'F5', beats: 0.5 },
      { note: 'G5', beats: 0.5 },
      { note: 'A5', beats: 1 },
      { note: 'G5', beats: 0.5 },
      { note: 'F5', beats: 0.5 },
      { note: 'E5', beats: 1 },
      { note: 'D5', beats: 1 },
      { note: null, beats: 1 },
      { note: 'D5', beats: 0.5 },
      { note: 'E5', beats: 0.5 },
      { note: 'F5', beats: 0.5 },
      { note: 'G5', beats: 0.5 },
      { note: 'A5', beats: 1 },
      { note: 'B5', beats: 0.5 },
      { note: 'C6', beats: 1 },
      { note: 'B5', beats: 0.5 },
      { note: 'A5', beats: 1.5 },
      { note: null, beats: 1.5 },
    ],
    // Phrase 3: climax / repeat of opening higher
    [
      { note: 'E5', beats: 0.5 },
      { note: 'A5', beats: 0.5 },
      { note: 'B5', beats: 0.5 },
      { note: 'C6', beats: 1.5 },
      { note: 'B5', beats: 0.5 },
      { note: 'A5', beats: 0.5 },
      { note: 'E5', beats: 0.5 },
      { note: 'A5', beats: 0.5 },
      { note: 'B5', beats: 0.5 },
      { note: 'C6', beats: 1 },
      { note: 'D6', beats: 0.5 },
      { note: 'E6', beats: 1 },
      { note: 'D6', beats: 0.5 },
      { note: 'C6', beats: 0.5 },
      { note: 'B5', beats: 0.5 },
      { note: 'A5', beats: 1 },
      { note: 'E6', beats: 1 },
      { note: 'D6', beats: 0.5 },
      { note: 'C6', beats: 0.5 },
      { note: 'B5', beats: 0.5 },
      { note: 'A5', beats: 0.5 },
      { note: 'G5', beats: 0.5 },
      { note: 'A5', beats: 2 },
      { note: null, beats: 1 },
    ],
  ];

  // Start melody after a 4-beat intro
  let melTime = 4 * secondsPerBeat;

  for (const phrase of melodyPhrases) {
    for (const { note, beats } of phrase) {
      if (note !== null) {
        melodyTrack.addNote({
          midi: noteToMidi(note),
          time: melTime,
          duration: beats * secondsPerBeat * 0.85,
          velocity: 0.65 + Math.random() * 0.15,
        });
      }
      melTime += beats * secondsPerBeat;
    }
  }

  return midi;
}

// --- Generate and write files ---
const outDir = path.join(__dirname, '..', 'public', 'midi');

const canon = generatePachelbelCanon();
fs.writeFileSync(path.join(outDir, 'pachelbel-canon.mid'), Buffer.from(canon.toArray()));
console.log('Created: public/midi/pachelbel-canon.mid');

const summer = generateSummer();
fs.writeFileSync(path.join(outDir, 'summer.mid'), Buffer.from(summer.toArray()));
console.log('Created: public/midi/summer.mid');

// Print durations
const canonDur = Math.max(...canon.tracks.flatMap(t => t.notes.map(n => n.time + n.duration)));
const summerDur = Math.max(...summer.tracks.flatMap(t => t.notes.map(n => n.time + n.duration)));
console.log(`Canon duration: ~${canonDur.toFixed(1)}s`);
console.log(`Summer duration: ~${summerDur.toFixed(1)}s`);
