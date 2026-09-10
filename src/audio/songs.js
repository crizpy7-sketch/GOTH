// The score. Every song is note data played through core/audio.js — no audio files,
// no samples, nothing borrowed. Warm folk modes, small ensembles, short loops that
// are meant to sit under play for a long time without wearing out.
//
// Note tokens: `c4` pitch, `-` hold the previous note, `.` rest.
// Percussion tracks use `X` (low thump) and `x` (brush).
// `div` is steps per beat, so div:2 means each token is an eighth note.

import { Audio } from '../core/audio.js';

// Rounded plucks, a breathy wooden melody and a soft low string. The quiet
// second harmonic adds body without the sharp buzz of a square-wave lead.
const LEAD = { wave: 'sine', harmonic: 0.20, gain: 0.15, legato: 0.76, tail: 0.22, env: { a: 0.014, d: 0.19, s: 0.15, r: 0.23 } };
const SOFT = { wave: 'triangle', gain: 0.13, legato: 0.94, filter: 1400, env: { a: 0.055, d: 0.16, s: 0.42, r: 0.22 } };
const BASS = { wave: 'sine', harmonic: 0.09, gain: 0.16, legato: 0.86, env: { a: 0.025, d: 0.14, s: 0.32, r: 0.16 } };
const PAD = { wave: 'sine', gain: 0.047, legato: 1, env: { a: 0.30, d: 0.35, s: 0.65, r: 0.45 } };
const PERC = { wave: 'noise', gain: 0.055, decay: 0.08 };
const BREEZE = { wave: 'noise', gain: 0.014, decay: 1.6, filterType: 'bandpass', filter: 850, q: 0.45, curve: 0.7 };
const BIRD = { wave: 'sine', gain: 0.016, glide: 1.2, legato: 0.25, env: { a: 0.025, d: 0.03, s: 0.3, r: 0.06 } };

const song = (bpm, div, tracks) => ({ bpm, div, tracks });
const t = (base, notes, extra = {}) => ({ ...base, ...extra, notes });

export function register() {
  // Spacious, quiet phrases let an important conversation set its own pace.
  Audio.defineSong('story', song(66, 2, {
    lead: t(SOFT, `
      e4 - - . g4 - - .  a4 - - - g4 - - .
      e4 - - . d4 - - .  c4 - - - - - - .
      f4 - - . a4 - - .  g4 - - - e4 - - .
      d4 - - . e4 - - .  c4 - - - - - - .`, { gain: 0.10, legato: 0.82 }),
    pad: t(SOFT, `c3 - - - - - - . a2 - - - - - - . f3 - - - - - - . g3 - - - - - - .`, { gain: 0.05 }),
  }));

  // ---- title: banked embers, nobody in a hurry ----------------------------------
  Audio.defineSong('title', song(70, 2, {
    lead: t(SOFT, `
      a4 - - .  c5 - - .  e5 - - -  d5 - - .
      c5 - - .  a4 - - .  g4 - - -  - - - .
      a4 - - .  c5 - - .  f5 - - -  e5 - - .
      d5 - - .  c5 - - .  a4 - - -  - - - .`, { gain: 0.13, vibrato: { rate: 4.5, depth: 1.2 } }),
    pad: t(PAD, `
      a3 - - - - - - -  f3 - - - - - - -
      c4 - - - - - - -  e3 - - - - - - -`),
    bass: t(BASS, `
      a2 - - - - - - .  f2 - - - - - - .
      c3 - - - - - - .  e2 - - - - - - .`, { gain: 0.16 }),
  }));

  // ---- village: pastoral, a little proud -----------------------------------------
  Audio.defineSong('village', song(92, 2, {
    lead: t(LEAD, `
      g4 . c5 . e5 . d5 .  c5 . a4 . g4 - - .
      f4 . a4 . c5 . b4 .  a4 . g4 . f4 - - .
      g4 . c5 . e5 . g5 .  f5 . e5 . d5 - - .
      e5 . d5 . c5 . a4 .  g4 - - - - - - .`),
    harm: t(SOFT, `
      e4 - - - c4 - - -  a3 - - - c4 - - -
      d4 - - - f4 - - -  c4 - - - e4 - - -`, { gain: 0.085 }),
    bass: t(BASS, `
      c3 . c3 . g2 . g2 .  f2 . f2 . c3 . c3 .
      f2 . f2 . c3 . c3 .  g2 . g2 . c3 . c3 .`),
    perc: t(PERC, `. . x . . . x .  . . x . . x x .`),
    birds: t(BIRD, `. . . . . . . . . . . . e6 . g6 . . . . . . . . . . . . . . . . .`),
  }));

  // ---- field: walking pace, open sky ---------------------------------------------
  Audio.defineSong('field', song(108, 2, {
    lead: t(LEAD, `
      c5 . d5 . e5 . g5 .  e5 . d5 . c5 - - .
      d5 . e5 . f5 . a5 .  g5 . e5 . d5 - - .
      e5 . g5 . a5 . g5 .  e5 . d5 . c5 - - .
      a4 . c5 . d5 . e5 .  d5 - c5 - - - - .`),
    harm: t(SOFT, `g4 - e4 - c5 - g4 -  f4 - a4 - e4 - c4 -`, { gain: 0.07 }),
    bass: t(BASS, `
      c3 . g2 . c3 . e3 .  f2 . c3 . f2 . a2 .
      c3 . g2 . c3 . e3 .  g2 . d3 . g2 . b2 .`),
    perc: t(PERC, `X . x . X . x x  X . x . X x x .`),
    breeze: t(BREEZE, `x . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .`),
    birds: t(BIRD, `. . . . . . . . g6 . e6 . . . . . . . . . . . . . . . . . . . . .`),
  }));

  // ---- forest: the path forgets itself --------------------------------------------
  Audio.defineSong('forest', song(76, 2, {
    lead: t(SOFT, `
      a4 - . . e4 - . .  a4 - b4 - c5 - - .
      b4 - . . g4 - . .  e4 - - - - - - .
      c5 - . . b4 - . .  a4 - g4 - e4 - - .
      d4 - . . e4 - . .  a4 - - - - - - .`, { gain: 0.12, vibrato: { rate: 4.3, depth: 1.5 } }),
    pad: t(PAD, `a3 - - - - - - - e3 - - - - - - -  f3 - - - - - - - e3 - - - - - - -`),
    bass: t(BASS, `a2 - - - - - . .  e2 - - - - - . .  f2 - - - - - . .  e2 - - - - - . .`, { gain: 0.17 }),
    breeze: t(BREEZE, `x . . . . . . . . . . . . . . . . . . . x . . . . . . . . . . .`),
    birds: t(BIRD, `. . . . e6 . a6 . . . . . . . . . . . . . . . . . . . . . . . . .`, { gain: 0.019 }),
  }));

  // ---- river: flowing, never lands ------------------------------------------------
  Audio.defineSong('river', song(88, 4, {
    lead: t(SOFT, `
      c5 e5 g5 e5 c5 e5 g5 e5  a4 c5 e5 c5 a4 c5 e5 c5
      f4 a4 c5 a4 f4 a4 c5 a4  g4 b4 d5 b4 g4 b4 d5 b4`, { gain: 0.10, legato: 0.7 }),
    harm: t(LEAD, `. . . . g5 - - .  . . . . e5 - - .  . . . . c5 - - .  . . . . d5 - - .`, { gain: 0.09 }),
    bass: t(BASS, `c3 - - - - - - .  a2 - - - - - - .  f2 - - - - - - .  g2 - - - - - - .`),
    water: t(BREEZE, `x . . . . . . . . . . . . . . .`, { gain: 0.022, filter: 1500, decay: 2.1 }),
  }));

  // ---- home: the kettle is on ------------------------------------------------------
  Audio.defineSong('home', song(78, 2, {
    lead: t(SOFT, `
      e4 - g4 - c5 - - .  b4 - g4 - e4 - - .
      f4 - a4 - c5 - - .  g4 - e4 - c4 - - .`, { gain: 0.14 }),
    pad: t(PAD, `c4 - - - - - - - g3 - - - - - - -  f3 - - - - - - - c4 - - - - - - -`),
    bass: t(BASS, `c3 - - - - - - .  g2 - - - - - - .  f2 - - - - - - .  c3 - - - - - - .`, { gain: 0.15 }),
    hearth: t(PERC, `. . . . . . x . . . . . . . . . . . . . . . . . . . x . . . . .`, { gain: 0.027, filter: 560, decay: 0.22 }),
  }));

  // ---- shop / workshop: busy hands --------------------------------------------------
  Audio.defineSong('shop', song(110, 2, {
    lead: t(LEAD, `
      g4 a4 b4 . g4 . d5 .  c5 b4 a4 . g4 - - .
      f4 g4 a4 . f4 . c5 .  b4 a4 g4 . f4 - - .`, { gain: 0.12 }),
    bass: t(BASS, `g2 . d3 . g2 . b2 .  c3 . g2 . c3 . e3 .`),
    perc: t(PERC, `x . x x . x . x`),
  }));

  // ---- battle: urgent, but never mean -----------------------------------------------
  Audio.defineSong('battle', song(132, 2, {
    lead: t(LEAD, `
      a4 . a4 . c5 . e5 .  d5 . c5 . b4 - - .
      g4 . g4 . b4 . d5 .  c5 . b4 . a4 - - .
      a4 . c5 . e5 . a5 .  g5 . e5 . d5 - - .
      f5 . e5 . d5 . c5 .  b4 . c5 . a4 - - .`, { gain: 0.16, harmonic: 0.24 }),
    harm: t(SOFT, `e4 - c4 - e4 - a4 -  d4 - b3 - d4 - g4 -`, { gain: 0.075 }),
    bass: t(BASS, `
      a2 a2 . a2 a2 . a2 .  g2 g2 . g2 g2 . g2 .
      f2 f2 . f2 f2 . f2 .  e2 e2 . e2 e2 . e2 .`, { gain: 0.18, legato: 0.6 }),
    perc: t(PERC, `X . x . X x x .  X . x . X x x x`, { gain: 0.075 }),
  }));

  // ---- victory: short, warm, over quickly ---------------------------------------------
  Audio.defineSong('victory', song(112, 2, {
    lead: t(LEAD, `c5 e5 g5 c6 - - - .  a5 g5 e5 g5 - - - .`, { gain: 0.14 }),
    bass: t(BASS, `c3 - g2 - c3 - - .  f2 - c3 - g2 - - .`),
  }));

  defineExtraSfx();
}

// A few effects the world and battle reach for that the core kit doesn't cover.
function defineExtraSfx() {
  Audio.defineSfx('grass', { voices: [{ noise: true, dur: 0.12, lp: 1400, gain: 0.07, curve: 1.8 }] });
  Audio.defineSfx('ledge', { voices: [
    { wave: 'triangle', f: 300, f2: 520, dur: 0.10, gain: 0.10 },
    { at: 0.14, noise: true, dur: 0.07, lp: 900, gain: 0.08 },
  ] });
  Audio.defineSfx('bond', { voices: [
    { wave: 'sine', f: 392, dur: 0.40, gain: 0.10 },
    { at: 0.14, wave: 'sine', f: 523.25, dur: 0.40, gain: 0.11 },
    { at: 0.28, wave: 'sine', f: 659.25, dur: 0.52, gain: 0.10 },
    { at: 0.43, wave: 'sine', f: 783.99, dur: 0.72, gain: 0.10 },
    { at: 0.43, wave: 'sine', f: 392, dur: 0.70, gain: 0.05 },
  ] });
  Audio.defineSfx('evolve', { voices: [
    { wave: 'sine', f: 220, f2: 660, dur: 0.7, gain: 0.07, exp: true },
    { at: 0.45, wave: 'sine', f: 659.25, dur: 0.55, gain: 0.10 },
    { at: 0.60, wave: 'sine', f: 1046.5, dur: 0.70, gain: 0.08 },
  ] });
  Audio.defineSfx('faint', { voices: [{ wave: 'sine', f: 330, f2: 130, dur: 0.5, gain: 0.10, exp: true }] });
  Audio.defineSfx('levelup', { voices: [
    { wave: 'sine', f: 659.25, dur: 0.24, gain: 0.10 },
    { at: 0.10, wave: 'sine', f: 783.99, dur: 0.24, gain: 0.10 },
    { at: 0.20, wave: 'sine', f: 1046.5, dur: 0.45, gain: 0.11 },
    { at: 0.20, wave: 'sine', f: 523.25, dur: 0.44, gain: 0.055 },
  ] });
}
