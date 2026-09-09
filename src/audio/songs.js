// The score. Every song is note data played through core/audio.js — no audio files,
// no samples, nothing borrowed. Warm folk modes, small ensembles, short loops that
// are meant to sit under play for a long time without wearing out.
//
// Note tokens: `c4` pitch, `-` hold the previous note, `.` rest.
// Percussion tracks use `X` (low thump) and `x` (brush).
// `div` is steps per beat, so div:2 means each token is an eighth note.

import { Audio } from '../core/audio.js';

const LEAD = { wave: 'square', gain: 0.13, legato: 0.88, env: { a: 0.012, d: 0.07, s: 0.62, r: 0.07 }, filter: 2600 };
const SOFT = { wave: 'triangle', gain: 0.15, legato: 0.94, env: { a: 0.02, d: 0.10, s: 0.7, r: 0.12 } };
const BASS = { wave: 'triangle', gain: 0.20, legato: 0.96, env: { a: 0.01, d: 0.08, s: 0.8, r: 0.08 } };
const PAD = { wave: 'sawtooth', gain: 0.045, legato: 1, filter: 900, env: { a: 0.18, d: 0.3, s: 0.7, r: 0.3 } };
const PERC = { wave: 'noise', gain: 0.085, decay: 0.055 };

const song = (bpm, div, tracks) => ({ bpm, div, tracks });
const t = (base, notes, extra = {}) => ({ ...base, ...extra, notes });

export function register() {
  // ---- title: banked embers, nobody in a hurry ----------------------------------
  Audio.defineSong('title', song(70, 2, {
    lead: t(SOFT, `
      a4 - - .  c5 - - .  e5 - - -  d5 - - .
      c5 - - .  a4 - - .  g4 - - -  - - - .
      a4 - - .  c5 - - .  f5 - - -  e5 - - .
      d5 - - .  c5 - - .  a4 - - -  - - - .`, { gain: 0.17, vibrato: { rate: 4.5, depth: 2 } }),
    pad: t(PAD, `
      a3 - - - - - - -  f3 - - - - - - -
      c4 - - - - - - -  e3 - - - - - - -`),
    bass: t(BASS, `
      a2 - - - - - - .  f2 - - - - - - .
      c3 - - - - - - .  e2 - - - - - - .`, { gain: 0.16 }),
  }));

  // ---- village: pastoral, a little proud -----------------------------------------
  Audio.defineSong('village', song(104, 2, {
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
  }));

  // ---- field: walking pace, open sky ---------------------------------------------
  Audio.defineSong('field', song(126, 2, {
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
  }));

  // ---- forest: the path forgets itself --------------------------------------------
  Audio.defineSong('forest', song(88, 2, {
    lead: t(SOFT, `
      a4 - . . e4 - . .  a4 - b4 - c5 - - .
      b4 - . . g4 - . .  e4 - - - - - - .
      c5 - . . b4 - . .  a4 - g4 - e4 - - .
      d4 - . . e4 - . .  a4 - - - - - - .`, { gain: 0.13, vibrato: { rate: 5, depth: 3 } }),
    pad: t(PAD, `a3 - - - - - - - e3 - - - - - - -  f3 - - - - - - - e3 - - - - - - -`),
    bass: t(BASS, `a2 - - - - - . .  e2 - - - - - . .  f2 - - - - - . .  e2 - - - - - . .`, { gain: 0.17 }),
  }));

  // ---- river: flowing, never lands ------------------------------------------------
  Audio.defineSong('river', song(108, 4, {
    lead: t(SOFT, `
      c5 e5 g5 e5 c5 e5 g5 e5  a4 c5 e5 c5 a4 c5 e5 c5
      f4 a4 c5 a4 f4 a4 c5 a4  g4 b4 d5 b4 g4 b4 d5 b4`, { gain: 0.10, legato: 0.7 }),
    harm: t(LEAD, `. . . . g5 - - .  . . . . e5 - - .  . . . . c5 - - .  . . . . d5 - - .`, { gain: 0.09 }),
    bass: t(BASS, `c3 - - - - - - .  a2 - - - - - - .  f2 - - - - - - .  g2 - - - - - - .`),
  }));

  // ---- home: the kettle is on ------------------------------------------------------
  Audio.defineSong('home', song(78, 2, {
    lead: t(SOFT, `
      e4 - g4 - c5 - - .  b4 - g4 - e4 - - .
      f4 - a4 - c5 - - .  g4 - e4 - c4 - - .`, { gain: 0.14 }),
    pad: t(PAD, `c4 - - - - - - - g3 - - - - - - -  f3 - - - - - - - c4 - - - - - - -`),
    bass: t(BASS, `c3 - - - - - - .  g2 - - - - - - .  f2 - - - - - - .  c3 - - - - - - .`, { gain: 0.15 }),
  }));

  // ---- shop / workshop: busy hands --------------------------------------------------
  Audio.defineSong('shop', song(132, 2, {
    lead: t(LEAD, `
      g4 a4 b4 . g4 . d5 .  c5 b4 a4 . g4 - - .
      f4 g4 a4 . f4 . c5 .  b4 a4 g4 . f4 - - .`, { gain: 0.12 }),
    bass: t(BASS, `g2 . d3 . g2 . b2 .  c3 . g2 . c3 . e3 .`),
    perc: t(PERC, `x . x x . x . x`),
  }));

  // ---- battle: urgent, but never mean -----------------------------------------------
  Audio.defineSong('battle', song(152, 2, {
    lead: t(LEAD, `
      a4 . a4 . c5 . e5 .  d5 . c5 . b4 - - .
      g4 . g4 . b4 . d5 .  c5 . b4 . a4 - - .
      a4 . c5 . e5 . a5 .  g5 . e5 . d5 - - .
      f5 . e5 . d5 . c5 .  b4 . c5 . a4 - - .`, { gain: 0.14, filter: 3200 }),
    harm: t(SOFT, `e4 - c4 - e4 - a4 -  d4 - b3 - d4 - g4 -`, { gain: 0.075 }),
    bass: t(BASS, `
      a2 a2 . a2 a2 . a2 .  g2 g2 . g2 g2 . g2 .
      f2 f2 . f2 f2 . f2 .  e2 e2 . e2 e2 . e2 .`, { gain: 0.22, legato: 0.6 }),
    perc: t(PERC, `X . x . X x x .  X . x . X x x x`, { gain: 0.1 }),
  }));

  // ---- victory: short, warm, over quickly ---------------------------------------------
  Audio.defineSong('victory', song(140, 2, {
    lead: t(LEAD, `c5 e5 g5 c6 - - - .  a5 g5 e5 g5 - - - .`, { gain: 0.16 }),
    bass: t(BASS, `c3 - g2 - c3 - - .  f2 - c3 - g2 - - .`),
  }));

  defineExtraSfx();
}

// A few effects the world and battle reach for that the core kit doesn't cover.
function defineExtraSfx() {
  Audio.defineSfx('grass', { voices: [{ noise: true, dur: 0.09, hp: 2200, gain: 0.06, curve: 1.8 }] });
  Audio.defineSfx('ledge', { voices: [
    { wave: 'triangle', f: 300, f2: 520, dur: 0.10, gain: 0.10 },
    { at: 0.14, noise: true, dur: 0.07, lp: 900, gain: 0.08 },
  ] });
  Audio.defineSfx('bond', { voices: [
    { wave: 'triangle', f: 523, dur: 0.12, gain: 0.11 },
    { at: 0.11, wave: 'triangle', f: 659, dur: 0.12, gain: 0.11 },
    { at: 0.22, wave: 'triangle', f: 880, dur: 0.26, gain: 0.13 },
  ] });
  Audio.defineSfx('evolve', { voices: [
    { wave: 'sawtooth', f: 220, f2: 880, dur: 0.7, gain: 0.08, exp: true },
    { at: 0.6, wave: 'square', f: 1046, dur: 0.3, gain: 0.10 },
  ] });
  Audio.defineSfx('faint', { voices: [{ wave: 'square', f: 400, f2: 90, dur: 0.5, gain: 0.11, exp: true }] });
  Audio.defineSfx('levelup', { voices: [
    { wave: 'square', f: 659, dur: 0.08, gain: 0.10 },
    { at: 0.08, wave: 'square', f: 880, dur: 0.08, gain: 0.10 },
    { at: 0.16, wave: 'square', f: 1318, dur: 0.24, gain: 0.12 },
  ] });
}
