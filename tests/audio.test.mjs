import test from 'node:test';
import assert from 'node:assert/strict';

let moduleId = 0;

async function setup(t) {
  const original = Object.fromEntries(['window', 'document', 'setInterval', 'clearInterval'].map(key => [key, globalThis[key]]));
  const timers = new Map(), windowEvents = new Map(), documentEvents = new Map();
  let timerId = 0, context;
  class Param {
    value = 0;
    events = [];
    setValueAtTime(value, time) { this.events.push({ kind: 'set', value, time }); this.value = value; }
    linearRampToValueAtTime(value, time) { this.events.push({ kind: 'linear', value, time }); }
    exponentialRampToValueAtTime(value, time) { this.events.push({ kind: 'exponential', value, time }); }
    cancelScheduledValues(time) { this.events = this.events.filter(event => event.time < time); }
    cancelAndHoldAtTime(time) { this.cancelScheduledValues(time); }
  }
  class Node {
    constructor(kind) { this.kind = kind; this.gain = new Param(); this.frequency = new Param(); this.Q = new Param(); this.connections = []; this.disconnected = false; }
    connect(node) { this.connections.push(node); }
    disconnect() { this.disconnected = true; this.connections = []; }
    start(time) { this.started = time; }
    stop(time) { this.stopped = time; }
  }
  class Context {
    state = 'running'; currentTime = 0; sampleRate = 8000; destination = {}; nodes = []; sources = []; gains = []; events = new Map(); buffers = 0;
    constructor() { context = this; }
    node(kind) { const node = new Node(kind); this.nodes.push(node); return node; }
    createGain() { const node = this.node('gain'); this.gains.push(node); return node; }
    createOscillator() { const node = this.node('oscillator'); this.sources.push(node); return node; }
    createBiquadFilter() { return this.node('filter'); }
    createBufferSource() { const node = this.node('buffer'); this.sources.push(node); return node; }
    createBuffer(channels, length) { this.buffers++; return { getChannelData: () => new Float32Array(length) }; }
    addEventListener(name, listener) { this.events.set(name, listener); }
    async suspend() { this.state = 'suspended'; this.events.get('statechange')?.(); }
    async resume() { this.state = 'running'; this.events.get('statechange')?.(); }
    advance(time) {
      this.currentTime = time;
      for (const source of this.sources) if (!source.ended && source.stopped <= time) { source.ended = true; source.onended?.(); }
    }
  }
  globalThis.window = { AudioContext: Context, addEventListener: (name, listener) => windowEvents.set(name, listener) };
  globalThis.document = { hidden: false, addEventListener: (name, listener) => documentEvents.set(name, listener) };
  globalThis.setInterval = fn => { const id = ++timerId; timers.set(id, fn); return id; };
  globalThis.clearInterval = id => timers.delete(id);
  const module = await import(`../src/core/audio.js?test=${++moduleId}`);
  t.after(() => {
    module.Audio.stop({ fade: 0 });
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  });
  return { ...module, get context() { return context; }, timers, windowEvents, documentEvents };
}

function finalGain(node) { return node.gain.events.at(-1)?.value ?? node.gain.value; }
function close(actual, expected) { assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} should equal ${expected}`); }
function song(Audio) { Audio.defineSong('village', { bpm: 90, div: 2, tracks: { melody: { wave: 'sine', notes: 'c4 e4 g4 e4', harmonic: 0.15, vibrato: { rate: 4, depth: 1 } } } }); }

test('a song selected before the first gesture starts once after audio unlock', async t => {
  const env = await setup(t), { Audio } = env;
  song(Audio); Audio.play('village');
  assert.equal(Audio.ready, false);
  assert.equal(Audio.playing, 'village');
  Audio.init();
  assert.equal(Audio.ready, true);
  assert.equal(env.timers.size, 1);
  assert.ok(env.context.sources.length > 0);
  const initial = env.context.sources.length;
  Audio.init(); Audio.play('village');
  assert.equal(env.timers.size, 1);
  assert.equal(env.context.sources.length, initial);
  Audio.stop({ fade: 0 });
  assert.equal(Audio.playing, null);
  assert.equal(env.timers.size, 0);
  assert.ok(env.context.sources.every(source => source.disconnected));
});

test('narration lowers both buses and restores the latest player mix without unmuting', async t => {
  const env = await setup(t), { Audio } = env;
  Audio.setMix({ music: 0.4, effects: 0.8 }); Audio.setVolume(0.6); Audio.init();
  const [master, music, effects] = env.context.gains;
  Audio.setNarrating(true);
  close(finalGain(music), 0.4 * 0.22); close(finalGain(effects), 0.8 * 0.48); close(finalGain(master), 0.6);
  Audio.setMix({ music: 0.2, effects: 0.5 });
  close(finalGain(music), 0.2 * 0.22); close(finalGain(effects), 0.5 * 0.48);
  Audio.setNarrating(false);
  close(finalGain(music), 0.2); close(finalGain(effects), 0.5);
  Audio.muted = true; Audio.setNarrating(true); Audio.setVolume(0.9); Audio.setNarrating(false);
  close(finalGain(master), 0);
  Audio.toggleMute(); close(finalGain(master), 0.9);
  const settings = Audio.mix; settings.music = 100;
  assert.deepEqual(Audio.mix, { music: 0.2, effects: 0.5 });
  Audio.setMix({ music: NaN, effects: -1 });
  assert.deepEqual(Audio.mix, { music: 0.2, effects: 0 });
});

test('short transition ducking respects speech and never restores an obsolete music volume', async t => {
  const env = await setup(t), { Audio } = env;
  song(Audio); Audio.init(); Audio.play('village'); Audio.setNarrating(true); Audio.duck(500);
  const music = env.context.gains[1];
  close(finalGain(music), 0.5 * 0.22);
  const ramps = music.gain.events.filter(event => event.kind === 'linear');
  close(ramps.at(-2).value, 0.5 * 0.22 * 0.24);
  Audio.setMix({ music: 0.3 }); close(finalGain(music), 0.3 * 0.22);
  Audio.setNarrating(false); close(finalGain(music), 0.3);
  env.context.advance(1); Audio.setNarrating(true); Audio.setNarrating(false);
  close(finalGain(music), 0.3);
});

test('hidden tabs stop nodes, retain the chosen song, and resume without a backlog', async t => {
  const env = await setup(t), { Audio } = env;
  song(Audio); env.defineCoreSfx(); Audio.init(); Audio.play('village'); Audio.sfx('door');
  const previous = env.context.sources.length;
  document.hidden = true; env.documentEvents.get('visibilitychange')();
  assert.equal(env.context.state, 'suspended'); assert.equal(env.timers.size, 0);
  assert.ok(env.context.nodes.slice(3).every(node => node.disconnected));
  env.context.advance(300); Audio._schedule(); Audio.sfx('confirm');
  assert.equal(env.context.sources.length, previous);
  assert.equal(Audio.playing, 'village');
  document.hidden = false; env.documentEvents.get('visibilitychange')(); await Promise.resolve();
  assert.equal(env.context.state, 'running'); assert.equal(env.timers.size, 1);
  const resumed = env.context.sources.slice(previous);
  assert.equal(resumed.length, 3, 'one new note with its harmonic and vibrato, not five minutes of notes');
  assert.ok(resumed.every(source => source.started >= 300));
  const beforeBusyFrame = env.context.sources.length;
  env.context.advance(600); Audio._schedule();
  assert.equal(env.context.sources.length - beforeBusyFrame, 3);
  assert.ok(env.context.sources.slice(beforeBusyFrame).every(source => source.started >= 600));
});

test('natural endings disconnect harmonics and filters, and repeated effects stay bounded', async t => {
  const env = await setup(t), { Audio } = env;
  song(Audio); env.defineCoreSfx(); Audio.init(); Audio.play('village');
  env.context.advance(5);
  assert.ok(env.context.nodes.slice(3).every(node => node.disconnected));
  Audio.stop({ fade: 0 });
  for (let i = 0; i < 100; i++) Audio.sfx('door');
  const connectedSources = env.context.sources.filter(source => !source.disconnected);
  assert.equal(connectedSources.length, 24);
  assert.equal(env.context.buffers, 1, 'identical soft noise reuses a bounded audio buffer cache');
  env.context.advance(10);
  assert.ok(env.context.nodes.slice(3).every(node => node.disconnected));
});

test('speech suppresses typewriter ticks while confirmation feedback remains available', async t => {
  const env = await setup(t), { Audio } = env;
  env.defineCoreSfx(); Audio.init(); Audio.setNarrating(true);
  Audio.sfx('text'); assert.equal(env.context.sources.length, 0);
  Audio.sfx('confirm'); assert.equal(env.context.sources.length, 2);
  Audio.setNarrating(false); Audio.sfx('text'); assert.equal(env.context.sources.length, 3);
  Audio.sfx('text'); assert.equal(env.context.sources.length, 3, 'a duplicate tick in the same audio frame is ignored');
  Audio.muted = true; Audio.sfx('confirm'); assert.equal(env.context.sources.length, 3);
});

test('an interrupted context can recover on a new gesture without duplicate schedulers', async t => {
  const env = await setup(t), { Audio } = env;
  song(Audio); Audio.init(); Audio.play('village');
  env.context.state = 'interrupted'; env.context.events.get('statechange')();
  assert.equal(env.timers.size, 0);
  env.windowEvents.get('pointerdown')(); await Promise.resolve();
  assert.equal(env.context.state, 'running'); assert.equal(env.timers.size, 1);
  env.windowEvents.get('keydown')();
  assert.equal(env.timers.size, 1);
  env.windowEvents.get('pagehide')(); assert.equal(env.timers.size, 0);
  env.windowEvents.get('pageshow')(); await Promise.resolve(); assert.equal(env.timers.size, 1);
});
