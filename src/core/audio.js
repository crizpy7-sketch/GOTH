// Original, procedural music and effects. A small warm ensemble, no audio downloads.
// Scheduling follows the audio clock; suspended tabs never accumulate old notes.
const NOTES = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const clamp = (value, fallback, min = 0, max = 1) => Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
const songs = new Map(), sfxDefs = new Map(), voices = new Set(), noiseBuffers = new Map(), lastEffects = new Map();
let ac = null, master = null, musicGain = null, sfxGain = null;
let current = null, step = 0, nextTime = 0, timer = null;
let volume = 0.7, muted = false, narrating = false, pageHidden = false, duckUntil = 0;
let mix = { music: 0.5, effects: 0.9 };

function freq(token) {
  const m = /^([a-g])([#b]?)(-?\d)$/.exec(token);
  if (!m) return null;
  const semi = NOTES[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return 440 * Math.pow(2, ((parseInt(m[3], 10) + 1) * 12 + semi - 69) / 12);
}

function hidden() { return pageHidden || (typeof document !== 'undefined' && document.hidden); }
function canSound() { return ac && ac.state === 'running' && !hidden() && !muted; }
function ramp(param, target, duration = 0.12) {
  if (!ac || !param) return;
  const now = ac.currentTime;
  if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(now);
  else { param.cancelScheduledValues(now); param.setValueAtTime(param.value, now); }
  param.linearRampToValueAtTime(target, now + duration);
}

function applyMix(duration = 0.18) {
  if (!ac) return;
  const music = mix.music * (narrating ? 0.22 : 1);
  const effects = mix.effects * (narrating ? 0.48 : 1);
  const remainingDuck = Math.max(0, duckUntil - ac.currentTime);
  ramp(musicGain.gain, music * (remainingDuck ? 0.24 : 1), remainingDuck ? Math.min(0.05, duration) : duration);
  if (remainingDuck) musicGain.gain.linearRampToValueAtTime(music, ac.currentTime + Math.max(0.06, remainingDuck));
  ramp(sfxGain.gain, effects, duration);
}

function clearTimer() { if (timer !== null) { clearInterval(timer); timer = null; } }

function finishVoice(voice) {
  if (!voices.delete(voice)) return;
  for (const node of voice.nodes) { try { node.disconnect(); } catch {} }
}

function stopVoice(voice, fade = 0) {
  if (!voices.has(voice)) return;
  if (fade) ramp(voice.envelope.gain, 0, fade);
  for (const source of voice.sources) { try { source.stop(ac.currentTime + fade + (fade ? 0.01 : 0)); } catch {} }
  // Suspended audio can delay ended callbacks. Release the graph immediately.
  if (!fade) finishVoice(voice);
}

function trackVoice(sources, nodes, envelope, bus) {
  const peers = [...voices].filter(v => v.bus === bus);
  if (peers.length >= (bus === 'music' ? 48 : 24)) stopVoice(peers[0]);
  const voice = { sources, nodes, envelope, bus };
  voices.add(voice);
  sources[0].onended = () => finishVoice(voice);
  return voice;
}

function pauseClock() {
  clearTimer();
  for (const voice of [...voices]) stopVoice(voice);
  lastEffects.clear();
}

function restartClock() {
  if (!canSound() || !current || timer !== null) return;
  nextTime = ac.currentTime + 0.06;
  timer = setInterval(() => Audio._schedule(), 25);
  Audio._schedule();
}

function resumeContext() {
  if (!ac || hidden() || ac.state === 'closed') return;
  if (ac.state === 'running') { restartClock(); return; }
  // Safari may require another gesture after a call or tab interruption.
  // A rejected resume leaves the requested song intact for that gesture.
  try { Promise.resolve(ac.resume()).then(() => { if (!hidden()) restartClock(); }).catch(() => {}); } catch {}
}

function visibilityChanged() {
  if (hidden()) {
    pauseClock();
    if (ac?.state === 'running') { try { Promise.resolve(ac.suspend()).catch(() => {}); } catch {} }
  } else resumeContext();
}

function noiseBuffer(duration, curve = 1.5) {
  const key = `${duration.toFixed(3)}:${curve}`;
  if (noiseBuffers.has(key)) return noiseBuffers.get(key);
  const buf = ac.createBuffer(1, Math.max(1, Math.ceil(ac.sampleRate * duration)), ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, curve);
  if (noiseBuffers.size >= 16) noiseBuffers.delete(noiseBuffers.keys().next().value);
  noiseBuffers.set(key, buf);
  return buf;
}

export const Audio = {
  get ready() { return !!ac && ac.state !== 'closed'; },
  get muted() { return muted; },
  set muted(value) {
    muted = !!value;
    if (master) ramp(master.gain, muted ? 0 : volume, 0.08);
    if (muted) pauseClock(); else restartClock();
  },
  get mix() { return { ...mix }; },
  get narrating() { return narrating; },

  init() {
    if (ac) { resumeContext(); return ac; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ac = new AC(); } catch { return null; }
    master = ac.createGain(); master.gain.value = muted ? 0 : volume; master.connect(ac.destination);
    musicGain = ac.createGain(); musicGain.gain.value = mix.music * (narrating ? 0.22 : 1); musicGain.connect(master);
    sfxGain = ac.createGain(); sfxGain.gain.value = mix.effects * (narrating ? 0.48 : 1); sfxGain.connect(master);
    if (typeof document !== 'undefined') document.addEventListener?.('visibilitychange', visibilityChanged);
    window.addEventListener?.('pagehide', () => { pageHidden = true; visibilityChanged(); });
    window.addEventListener?.('pageshow', () => { pageHidden = false; visibilityChanged(); });
    window.addEventListener?.('pointerdown', resumeContext, { passive: true });
    window.addEventListener?.('keydown', resumeContext);
    ac.addEventListener?.('statechange', () => {
      if (ac.state !== 'running') pauseClock(); else restartClock();
    });
    resumeContext();
    return ac;
  },

  setVolume(value) { volume = clamp(value, volume); if (master) ramp(master.gain, muted ? 0 : volume); },
  toggleMute() { this.muted = !muted; return muted; },
  setMix(values = {}) {
    mix = { music: clamp(values.music, mix.music), effects: clamp(values.effects, mix.effects) };
    applyMix();
  },
  setNarrating(value) {
    if (narrating === !!value) return;
    narrating = !!value;
    applyMix(narrating ? 0.12 : 0.4);
  },

  defineSong(name, spec) {
    songs.set(name, { ...spec, tracks: Object.values(spec.tracks).map(tr => ({ ...tr, sequence: tr.notes.trim().split(/\s+/) })) });
  },
  defineSfx(name, spec) { sfxDefs.set(name, spec); },
  hasSong(name) { return songs.has(name); },
  get playing() { return current?.name || null; },

  play(name, { fade = 0.4 } = {}) {
    const spec = songs.get(name);
    if (!spec) return;
    if (current?.name === name) { restartClock(); return; }
    this.stop({ fade: 0.12 });
    current = { name, spec };
    step = 0;
    // Remember this selection even before the first browser audio gesture.
    if (ac) { applyMix(Math.max(0.04, fade)); restartClock(); }
  },

  stop({ fade = 0.25 } = {}) {
    current = null;
    clearTimer();
    if (!ac) return;
    for (const voice of [...voices]) if (voice.bus === 'music') stopVoice(voice, Math.max(0, fade));
  },

  duck(ms = 400) {
    if (!ac || !current) return;
    duckUntil = ac.currentTime + clamp(ms, 400, 60, 3000) / 1000;
    applyMix(0.05);
  },

  _schedule() {
    if (!current || !canSound()) return;
    const { spec } = current;
    const stepDur = 60 / clamp(spec.bpm, 80, 30, 240) / clamp(spec.div, 4, 1, 8);
    // A busy frame or suspended tab must never play a backlog in one burst.
    if (nextTime < ac.currentTime - 0.04) nextTime = ac.currentTime + 0.03;
    const ahead = ac.currentTime + 0.12;
    let guard = 0;
    while (nextTime < ahead && guard++ < 16) {
      for (const tr of spec.tracks) {
        const seq = tr.sequence, tok = seq[step % seq.length];
        if (!tok || tok === '.' || tok === '-') continue;
        if (tok === 'x' || tok === 'X' || tr.wave === 'noise') { this._drum(tr, nextTime, tok); continue; }
        const f = freq(tok);
        if (f) this._voice(tr, f, nextTime, stepDur, seq, step);
      }
      nextTime += stepDur;
      step++;
    }
  },

  _voice(tr, f, time, stepDur, seq, s) {
    let hold = 1;
    while (seq[(s + hold) % seq.length] === '-' && hold < 16) hold++;
    const dur = Math.max(0.06, stepDur * hold * (tr.legato ?? 0.9) + (tr.tail || 0));
    const oscillator = ac.createOscillator(), envelope = ac.createGain();
    const sources = [oscillator], nodes = [oscillator, envelope];
    oscillator.type = tr.wave || 'sine';
    oscillator.frequency.setValueAtTime(f, time);
    if (tr.glide) oscillator.frequency.exponentialRampToValueAtTime(f * tr.glide, time + dur * 0.75);
    if (tr.vibrato) {
      const lfo = ac.createOscillator(), amount = ac.createGain();
      lfo.frequency.value = tr.vibrato.rate || 4.5;
      amount.gain.value = tr.vibrato.depth || 1.5;
      lfo.connect(amount); amount.connect(oscillator.frequency);
      sources.push(lfo); nodes.push(lfo, amount);
    }
    let output = oscillator;
    if (tr.filter) {
      const filter = ac.createBiquadFilter();
      filter.type = 'lowpass'; filter.frequency.value = tr.filter;
      oscillator.connect(filter); output = filter; nodes.push(filter);
    }
    output.connect(envelope);
    if (tr.harmonic) {
      const overtone = ac.createOscillator(), level = ac.createGain();
      overtone.type = 'sine'; overtone.frequency.setValueAtTime(f * 2, time);
      level.gain.value = tr.harmonic;
      overtone.connect(level); level.connect(envelope);
      sources.push(overtone); nodes.push(overtone, level);
    }
    const peak = tr.gain ?? 0.14;
    const attack = Math.min(tr.env?.a ?? 0.016, dur * 0.2);
    const decay = Math.min(tr.env?.d ?? 0.12, dur * 0.35);
    const sustain = tr.env?.s ?? 0.2;
    const release = Math.min(tr.env?.r ?? 0.16, dur * 0.4);
    envelope.gain.setValueAtTime(0.0001, time);
    envelope.gain.linearRampToValueAtTime(peak, time + attack);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * sustain), time + attack + decay);
    envelope.gain.setValueAtTime(Math.max(0.0001, peak * sustain), time + Math.max(attack + decay, dur - release));
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    envelope.connect(musicGain);
    trackVoice(sources, nodes, envelope, 'music');
    for (const source of sources) { source.start(time); source.stop(time + dur + 0.02); }
  },

  _drum(tr, time, token) {
    const dur = tr.decay ?? 0.07;
    const source = ac.createBufferSource(), filter = ac.createBiquadFilter(), envelope = ac.createGain();
    source.buffer = noiseBuffer(dur, tr.curve ?? 1.5);
    filter.type = tr.filterType || (token === 'X' ? 'lowpass' : 'bandpass');
    filter.frequency.value = tr.filter || (token === 'X' ? 240 : 1500);
    filter.Q.value = tr.q ?? 0.65;
    envelope.gain.setValueAtTime(0.0001, time);
    envelope.gain.linearRampToValueAtTime(tr.gain ?? 0.055, time + Math.min(0.03, dur * 0.1));
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    source.connect(filter); filter.connect(envelope); envelope.connect(musicGain);
    trackVoice([source], [source, filter, envelope], envelope, 'music');
    source.start(time); source.stop(time + dur + 0.02);
  },

  sfx(name, { rate = 1, gain = 1 } = {}) {
    if (!canSound() || (narrating && name === 'text')) return;
    const spec = sfxDefs.get(name);
    if (!spec) return;
    const time = ac.currentTime;
    const cooldown = { cursor: 0.045, text: 0.04, step: 0.06 }[name] || 0;
    if (time - (lastEffects.get(name) ?? -Infinity) < cooldown) return;
    lastEffects.set(name, time);
    rate = clamp(rate, 1, 0.25, 4); gain = clamp(gain, 1, 0, 2);
    for (const voice of (spec.voices || [spec]).slice(0, 16)) {
      const start = time + clamp(voice.at, 0, 0, 4) / rate;
      const dur = clamp((voice.dur || 0.1) / rate, 0.1, 0.015, 4);
      const envelope = ac.createGain();
      const peak = Math.max(0.0001, (voice.gain ?? 0.14) * gain);
      envelope.gain.setValueAtTime(0.0001, start);
      envelope.gain.linearRampToValueAtTime(peak, start + Math.min(0.014, dur * 0.25));
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      let source, nodes = [envelope];
      if (voice.noise) {
        source = ac.createBufferSource(); source.buffer = noiseBuffer(dur, voice.curve || 1.5);
        const filter = ac.createBiquadFilter();
        filter.type = voice.hp ? 'highpass' : 'lowpass';
        filter.frequency.value = voice.hp || voice.lp || 1200;
        source.connect(filter); filter.connect(envelope); nodes.push(source, filter);
      } else {
        source = ac.createOscillator(); source.type = voice.wave || 'sine';
        const f0 = (voice.f || 440) * rate, f1 = (voice.f2 ?? voice.f ?? 440) * rate;
        source.frequency.setValueAtTime(f0, start);
        if (f1 !== f0) source.frequency[voice.exp ? 'exponentialRampToValueAtTime' : 'linearRampToValueAtTime'](Math.max(1, f1), start + dur);
        // Keep older feature-specific square effects from piercing a quiet mix.
        if (voice.lp || source.type === 'square' || source.type === 'sawtooth') {
          const filter = ac.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = voice.lp || 1800;
          source.connect(filter); filter.connect(envelope); nodes.push(filter);
        } else source.connect(envelope);
        nodes.push(source);
      }
      envelope.connect(sfxGain);
      trackVoice([source], nodes, envelope, 'effects');
      source.start(start); source.stop(start + dur + 0.02);
    }
  },
};

export function defineCoreSfx() {
  Audio.defineSfx('cursor', { wave: 'sine', f: 660, f2: 740, dur: 0.075, gain: 0.085 });
  Audio.defineSfx('confirm', { voices: [
    { wave: 'sine', f: 523.25, dur: 0.16, gain: 0.12 },
    { at: 0.07, wave: 'sine', f: 783.99, dur: 0.23, gain: 0.09 },
  ] });
  Audio.defineSfx('cancel', { wave: 'sine', f: 440, f2: 330, dur: 0.16, gain: 0.10 });
  Audio.defineSfx('deny', { voices: [
    { wave: 'triangle', f: 220, dur: 0.10, gain: 0.07, lp: 900 },
    { at: 0.10, wave: 'sine', f: 196, dur: 0.16, gain: 0.08 },
  ] });
  Audio.defineSfx('step', { noise: true, dur: 0.075, lp: 760, gain: 0.10, curve: 2.2 });
  Audio.defineSfx('bump', { voices: [
    { wave: 'sine', f: 185, f2: 85, dur: 0.14, gain: 0.14 },
    { noise: true, dur: 0.06, lp: 1100, gain: 0.035 },
  ] });
  Audio.defineSfx('door', { voices: [
    { noise: true, dur: 0.20, lp: 640, gain: 0.12, curve: 1.8 },
    { at: 0.03, wave: 'triangle', f: 170, f2: 125, dur: 0.22, gain: 0.065, lp: 600 },
    { at: 0.15, wave: 'sine', f: 660, dur: 0.32, gain: 0.05 },
  ] });
  Audio.defineSfx('coin', { voices: [
    { wave: 'sine', f: 1046.5, dur: 0.18, gain: 0.10 },
    { at: 0.075, wave: 'sine', f: 1568, dur: 0.30, gain: 0.065 },
  ] });
  Audio.defineSfx('chime', { voices: [
    { wave: 'sine', f: 659.25, dur: 0.48, gain: 0.10 },
    { at: 0.09, wave: 'sine', f: 987.77, dur: 0.56, gain: 0.075 },
    { at: 0.18, wave: 'sine', f: 1318.5, dur: 0.62, gain: 0.04 },
  ] });
  Audio.defineSfx('text', { wave: 'sine', f: 560, dur: 0.025, gain: 0.012 });
}
