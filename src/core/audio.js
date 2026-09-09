// Procedural audio: a tiny step-sequencer for music plus synthesised SFX.
// No audio files anywhere — songs are note strings, effects are envelopes.

const NOTES = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

function freq(token) {
  const m = /^([a-g])([#b]?)(-?\d)$/.exec(token);
  if (!m) return null;
  let semi = NOTES[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  const midi = (parseInt(m[3], 10) + 1) * 12 + semi;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

const songs = new Map();
const sfxDefs = new Map();

let ac = null, master = null, musicGain = null, sfxGain = null;
let current = null, step = 0, nextTime = 0, timer = null;
let volume = 0.7;

export const Audio = {
  get ready() { return !!ac; },
  muted: false,

  init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return ac; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ac = new AC();
    master = ac.createGain(); master.gain.value = this.muted ? 0 : volume; master.connect(ac.destination);
    musicGain = ac.createGain(); musicGain.gain.value = 0.5; musicGain.connect(master);
    sfxGain = ac.createGain(); sfxGain.gain.value = 0.9; sfxGain.connect(master);
    return ac;
  },

  setVolume(v) { volume = Math.max(0, Math.min(1, v)); if (master) master.gain.value = this.muted ? 0 : volume; },
  toggleMute() { this.muted = !this.muted; if (master) master.gain.value = this.muted ? 0 : volume; return this.muted; },

  defineSong(name, spec) { songs.set(name, spec); },
  defineSfx(name, spec) { sfxDefs.set(name, spec); },
  hasSong(name) { return songs.has(name); },
  get playing() { return current?.name || null; },

  play(name, { fade = 0.4 } = {}) {
    if (!ac) return;
    if (current?.name === name) return;
    const spec = songs.get(name);
    if (!spec) return;
    this.stop({ fade: 0.15 });
    current = { name, spec, div: spec.div || 4 };   // div = steps per beat
    step = 0;
    nextTime = ac.currentTime + 0.06;
    musicGain.gain.cancelScheduledValues(ac.currentTime);
    musicGain.gain.setValueAtTime(0.0001, ac.currentTime);
    musicGain.gain.linearRampToValueAtTime(0.5, ac.currentTime + fade);
    if (!timer) timer = setInterval(() => this._schedule(), 25);
  },

  stop({ fade = 0.25 } = {}) {
    if (!ac || !current) return;
    musicGain.gain.cancelScheduledValues(ac.currentTime);
    musicGain.gain.setValueAtTime(musicGain.gain.value, ac.currentTime);
    musicGain.gain.linearRampToValueAtTime(0.0001, ac.currentTime + fade);
    current = null;
  },

  duck(ms = 400) {
    if (!ac || !current) return;
    const t = ac.currentTime;
    musicGain.gain.cancelScheduledValues(t);
    musicGain.gain.setValueAtTime(musicGain.gain.value, t);
    musicGain.gain.linearRampToValueAtTime(0.12, t + 0.05);
    musicGain.gain.linearRampToValueAtTime(0.5, t + ms / 1000);
  },

  _schedule() {
    if (!current || !ac) return;
    const { spec } = current;
    const stepDur = 60 / spec.bpm / (spec.div || 4);
    const ahead = ac.currentTime + 0.18;
    let guard = 0;
    while (nextTime < ahead && guard++ < 64) {
      for (const [tname, tr] of Object.entries(spec.tracks)) {
        const seq = tr.notes.trim().split(/\s+/);
        const tok = seq[step % seq.length];
        if (!tok || tok === '.' || tok === '-') continue;
        if (tok === 'x' || tr.wave === 'noise') { this._drum(tr, nextTime, tok); continue; }
        const f = freq(tok);
        if (f) this._voice(tr, f, nextTime, stepDur, seq, step);
      }
      nextTime += stepDur;
      step++;
    }
  },

  _voice(tr, f, t, stepDur, seq, s) {
    // Sustain across following '-' tokens so melodies can breathe.
    let hold = 1, i = s + 1;
    while (seq[i % seq.length] === '-' && hold < 16) { hold++; i++; }
    const dur = stepDur * hold * (tr.legato ?? 0.92);
    const o = ac.createOscillator();
    o.type = tr.wave || 'square';
    o.frequency.setValueAtTime(f, t);
    if (tr.vibrato) {
      const lfo = ac.createOscillator(), lg = ac.createGain();
      lfo.frequency.value = tr.vibrato.rate || 5.5;
      lg.gain.value = tr.vibrato.depth || 3;
      lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(t + dur);
    }
    const g = ac.createGain();
    const peak = (tr.gain ?? 0.22);
    const atk = tr.env?.a ?? 0.008, dec = tr.env?.d ?? 0.06, sus = tr.env?.s ?? 0.6, rel = tr.env?.r ?? 0.08;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + atk);
    g.gain.linearRampToValueAtTime(peak * sus, t + atk + dec);
    g.gain.setValueAtTime(peak * sus, t + Math.max(dur - rel, atk + dec));
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (tr.filter) {
      const bq = ac.createBiquadFilter();
      bq.type = 'lowpass'; bq.frequency.value = tr.filter;
      node.connect(bq); node = bq;
    }
    node.connect(g); g.connect(musicGain);
    o.start(t); o.stop(t + dur + 0.02);
  },

  _drum(tr, t, tok) {
    const dur = tr.decay ?? 0.09;
    const buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * dur), ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = ac.createBufferSource(); src.buffer = buf;
    const bq = ac.createBiquadFilter();
    bq.type = tok === 'X' ? 'lowpass' : 'highpass';
    bq.frequency.value = tok === 'X' ? 220 : 3800;
    const g = ac.createGain(); g.gain.value = tr.gain ?? 0.14;
    src.connect(bq); bq.connect(g); g.connect(musicGain);
    src.start(t);
  },

  // ---- SFX ----
  sfx(name, { rate = 1, gain = 1 } = {}) {
    if (!ac) return;
    const spec = sfxDefs.get(name);
    if (!spec) return;
    const t = ac.currentTime;
    for (const v of (spec.voices || [spec])) {
      const start = t + (v.at || 0) / rate;
      if (v.noise) {
        const dur = (v.dur || 0.1) / rate;
        const buf = ac.createBuffer(1, Math.max(1, Math.ceil(ac.sampleRate * dur)), ac.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, v.curve || 1.5);
        const src = ac.createBufferSource(); src.buffer = buf;
        const bq = ac.createBiquadFilter();
        bq.type = v.hp ? 'highpass' : 'lowpass';
        bq.frequency.value = v.hp || v.lp || 1200;
        const g = ac.createGain(); g.gain.value = (v.gain ?? 0.2) * gain;
        src.connect(bq); bq.connect(g); g.connect(sfxGain);
        src.start(start);
      } else {
        const dur = (v.dur || 0.08) / rate;
        const o = ac.createOscillator();
        o.type = v.wave || 'square';
        const f0 = (v.f || 440) * rate, f1 = (v.f2 ?? v.f ?? 440) * rate;
        o.frequency.setValueAtTime(f0, start);
        if (f1 !== f0) o.frequency[v.exp ? 'exponentialRampToValueAtTime' : 'linearRampToValueAtTime'](Math.max(1, f1), start + dur);
        const g = ac.createGain();
        const peak = (v.gain ?? 0.16) * gain;
        g.gain.setValueAtTime(0.0001, start);
        g.gain.linearRampToValueAtTime(peak, start + Math.min(0.01, dur * .3));
        g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
        o.connect(g); g.connect(sfxGain);
        o.start(start); o.stop(start + dur + 0.02);
      }
    }
  },
};

// A small default kit so every system has something to play from day one.
// Feature builders add their own via defineSfx.
export function defineCoreSfx() {
  Audio.defineSfx('cursor', { voices: [{ wave: 'square', f: 880, f2: 1180, dur: 0.045, gain: 0.10 }] });
  Audio.defineSfx('confirm', { voices: [{ wave: 'square', f: 660, f2: 990, dur: 0.07, gain: 0.13 }, { at: 0.06, wave: 'square', f: 1320, dur: 0.06, gain: 0.09 }] });
  Audio.defineSfx('cancel', { voices: [{ wave: 'square', f: 520, f2: 300, dur: 0.09, gain: 0.11 }] });
  Audio.defineSfx('deny', { voices: [{ wave: 'sawtooth', f: 200, f2: 140, dur: 0.16, gain: 0.11 }] });
  Audio.defineSfx('step', { voices: [{ noise: true, dur: 0.045, hp: 2600, gain: 0.05, curve: 2.4 }] });
  Audio.defineSfx('bump', { voices: [{ wave: 'triangle', f: 150, f2: 90, dur: 0.09, gain: 0.12 }] });
  Audio.defineSfx('door', { voices: [{ noise: true, dur: 0.18, lp: 900, gain: 0.10, curve: 1.1 }, { at: 0.02, wave: 'triangle', f: 260, f2: 180, dur: 0.16, gain: 0.07 }] });
  Audio.defineSfx('coin', { voices: [{ wave: 'square', f: 1046, dur: 0.05, gain: 0.10 }, { at: 0.05, wave: 'square', f: 1568, dur: 0.10, gain: 0.09 }] });
  Audio.defineSfx('chime', { voices: [{ wave: 'triangle', f: 1318, dur: 0.22, gain: 0.12 }, { at: 0.09, wave: 'triangle', f: 1976, dur: 0.30, gain: 0.09 }] });
  Audio.defineSfx('text', { voices: [{ wave: 'square', f: 1500, dur: 0.012, gain: 0.035 }] });
}
