import test from 'node:test';
import assert from 'node:assert/strict';
import { S, defaults } from '../src/state.js';
import { Audio } from '../src/core/audio.js';

let instance = 0;
const localVoice = { name: 'Samantha Enhanced', voiceURI: 'local-samantha', lang: 'en-US', localService: true };
const remoteVoice = { name: 'Natural English', voiceURI: 'network-en', lang: 'en-US', localService: false };

async function setup(t, { supported = true, voices = [localVoice], enabled = true } = {}) {
  Object.assign(S, defaults());
  Object.assign(S.settings, { readAloud: enabled, voiceURI: '', voiceRate: 0.88, voiceVolume: 0.9, volume: 0.7 });
  const originalWindow = globalThis.window, originalDocument = globalThis.document;
  const originalDuck = Audio.setNarrating, originalMuted = Audio.muted;
  const scheduled = new Map(), events = new Map(), synthesisEvents = new Map();
  const spoken = [], ducked = [];
  let nextTimer = 0, available = voices, canceled = 0, speakHook = null;
  const synth = {
    speak(line) { spoken.push(line); speakHook?.(line); },
    cancel() { canceled++; },
    getVoices() { return available; },
    addEventListener(name, listener) { synthesisEvents.set(name, listener); },
  };
  globalThis.window = {
    addEventListener(name, listener) { events.set(name, listener); },
    ...(supported ? { speechSynthesis: synth, SpeechSynthesisUtterance: class {
      constructor(text) { this.text = text; }
    } } : {}),
  };
  globalThis.document = { hidden: false, addEventListener(name, listener) { events.set(name, listener); } };
  Audio.muted = false;
  Audio.setNarrating = active => ducked.push(active);
  t.mock.method(globalThis, 'setTimeout', (fn, milliseconds) => {
    const id = ++nextTimer; scheduled.set(id, { fn, milliseconds }); return id;
  });
  t.mock.method(globalThis, 'clearTimeout', id => scheduled.delete(id));
  const { Narration } = await import(`../src/core/narration.js?test=${++instance}`);
  t.after(() => {
    Narration.clear();
    Audio.setNarrating = originalDuck; Audio.muted = originalMuted;
    globalThis.window = originalWindow; globalThis.document = originalDocument;
  });
  return { N: Narration, spoken, ducked, scheduled, events,
    get canceled() { return canceled; },
    onSpeak(fn) { speakHook = fn; },
    voices(next) { available = next; synthesisEvents.get('voiceschanged')?.(); },
  };
}

test('the visible caption waits for a gesture, speaks synchronously, and deduplicates repeated renders', async t => {
  const h = await setup(t), N = h.N;
  N.set('Welcome home,\n brave guardian.', { key: 'gran-1', speaker: 'Gran' });
  assert.equal(N.status, 'waiting');
  assert.equal(h.spoken.length, 0);
  let inGesture = true;
  h.onSpeak(() => assert.equal(inGesture, true));
  assert.equal(N.unlock(), true);
  inGesture = false;
  assert.equal(h.spoken[0].text, 'Welcome home, brave guardian.');
  assert.equal(h.spoken[0].voice, localVoice);
  assert.equal(N.speaker, 'Gran');
  assert.equal(N.active, true);
  assert.equal(h.ducked.at(-1), true);
  N.set('Welcome home,\n brave guardian.', { key: 'gran-1', speaker: 'Gran' });
  N.unlock();
  assert.equal(h.spoken.length, 1);
  h.spoken[0].onstart(); h.spoken[0].onend();
  assert.equal(N.active, false);
  assert.equal(N.status, 'ready');
  assert.equal(h.ducked.at(-1), false);
  assert.equal(h.scheduled.size, 0);
});

test('a replacement cancels the old line; late start, end, boundary, and error cannot disturb its successor', async t => {
  const h = await setup(t), N = h.N;
  N.unlock(); N.set('First line.');
  const old = h.spoken[0]; old.onstart();
  N.set('Second line.');
  const next = h.spoken[1]; next.onstart();
  assert.equal(h.canceled, 1);
  old.onstart(); old.onboundary({ charIndex: 5 }); old.onend(); old.onerror({ error: 'interrupted' });
  assert.equal(N.currentText, 'Second line.');
  assert.equal(N.active, true);
  assert.equal(N.charIndex, 0);
  assert.equal(N.status, 'speaking');
  assert.equal(h.ducked.at(-1), true);
  next.onend();
  assert.equal(h.ducked.at(-1), false);
});

test('automatic choice announcements are concise while replay retains the whole visible page', async t => {
  const h = await setup(t), N = h.N;
  N.unlock();
  N.set('Choose a friend. Embercub: warm and brave.', { key: 'starter-0' });
  N.set('Choose a friend. Leafowl: wise and gentle.', {
    key: 'starter-1', utterance: 'Leafowl: wise and gentle.',
  });
  assert.equal(h.spoken.at(-1).text, 'Leafowl: wise and gentle.');
  N.replay();
  assert.equal(h.spoken.at(-1).text, 'Choose a friend. Leafowl: wise and gentle.');
  assert.equal(h.spoken.length, 3);
  assert.equal(h.canceled, 2);
});

test('automatic reading can stay off while a child chooses to listen once', async t => {
  const h = await setup(t, { enabled: false }), N = h.N;
  N.set('We can do this together.'); N.unlock();
  assert.equal(N.status, 'off'); assert.equal(h.spoken.length, 0);
  assert.equal(N.replay(), true);
  N.configure();
  assert.equal(N.active, true, 'unrelated unchanged configuration does not stop manual playback');
  h.spoken[0].onend();
  assert.equal(N.status, 'off');
  N.set('Another page.'); assert.equal(h.spoken.length, 1);
});

test('turning automatic reading on reads the waiting caption; changing it off cancels immediately', async t => {
  const h = await setup(t, { enabled: false }), N = h.N;
  N.unlock(); N.set('Your adventure begins.');
  S.settings.readAloud = true; N.configure();
  assert.equal(h.spoken.length, 1);
  S.settings.readAloud = false; N.configure();
  assert.equal(N.active, false); assert.equal(N.status, 'off'); assert.equal(h.canceled, 1);
  N.unlock(); assert.equal(h.spoken.length, 1);
});

test('voice volume follows master volume and both kinds of global mute cancel narration', async t => {
  const h = await setup(t), N = h.N;
  S.settings.volume = 0.5; S.settings.voiceVolume = 0.8;
  N.unlock(); N.set('A softer voice.');
  assert.equal(h.spoken[0].volume, 0.4);
  S.settings.muted = true; N.configure();
  assert.equal(N.active, false); assert.equal(N.status, 'muted');
  assert.equal(N.replay(), false);
  S.settings.muted = false; Audio.muted = true; N.configure();
  assert.equal(N.replay(), false);
  Audio.muted = false; S.settings.volume = 0; N.configure();
  assert.equal(N.replay(), false);
  assert.equal(h.spoken.length, 1);
  assert.equal(h.ducked.at(-1), false);
});

test('selected voice URI survives asynchronous voice loading and warm local English is preferred automatically', async t => {
  const french = { name: 'Default French', voiceURI: 'fr', lang: 'fr-FR', localService: true, default: true };
  const h = await setup(t, { voices: [french, remoteVoice, localVoice] }), N = h.N;
  N.unlock(); N.set('Hello.');
  assert.equal(h.spoken.at(-1).voice, localVoice);
  S.settings.voiceURI = 'network-en'; N.configure();
  assert.equal(h.spoken.at(-1).voice, remoteVoice);
  h.voices([localVoice]);
  assert.equal(S.settings.voiceURI, 'network-en', 'temporarily missing a selected voice must not erase the preference');
  N.replay(); assert.equal(h.spoken.at(-1).voice, localVoice);
  const count = h.spoken.length;
  h.voices([localVoice, remoteVoice]);
  assert.equal(h.spoken.length, count, 'voiceschanged never interrupts a caption');
  N.replay(); assert.equal(h.spoken.at(-1).voice, remoteVoice);
  assert.equal(N.voices()[0], localVoice);
});

test('an empty voice list can use the browser default in the gesture and a missing engine fails silently', async t => {
  const h = await setup(t, { voices: [] }), N = h.N;
  N.set('Stay curious.'); N.unlock();
  assert.equal(h.spoken[0].voice, undefined);
  assert.equal(h.spoken[0].lang, 'en-US');
  h.spoken[0].onerror({ error: 'synthesis-unavailable' });
  assert.equal(N.status, 'unavailable'); assert.equal(N.active, false);
  assert.equal(h.ducked.at(-1), false);
  assert.equal(h.scheduled.size, 0);
});

test('a gesture rejection waits for another real gesture and does not spin or queue retries', async t => {
  const h = await setup(t), N = h.N;
  N.unlock(); N.set('Let us try together.');
  h.spoken[0].onerror({ error: 'not-allowed' });
  assert.equal(N.status, 'waiting'); assert.equal(N.active, false);
  N.set('Let us try together.');
  assert.equal(h.spoken.length, 1);
  N.unlock();
  assert.equal(h.spoken.length, 2);
  assert.equal(h.spoken.at(-1).text, 'Let us try together.');
});

test('owner-aware cleanup protects new overlays, while stop, clear, and hidden tabs never replay stale lines', async t => {
  const h = await setup(t), N = h.N, oldOwner = {}, nextOwner = {};
  N.unlock(); N.set('Gran is speaking.', { owner: oldOwner });
  N.set('Choose your answer.', { owner: nextOwner });
  N.clear(oldOwner);
  assert.equal(N.currentText, 'Choose your answer.'); assert.equal(N.active, true);
  globalThis.document.hidden = true; h.events.get('visibilitychange')();
  assert.equal(N.active, false);
  const count = h.spoken.length;
  globalThis.document.hidden = false; h.events.get('visibilitychange')(); N.unlock();
  assert.equal(h.spoken.length, count);
  N.replay(); assert.equal(h.spoken.length, count + 1);
  N.stop(); N.unlock(); assert.equal(h.spoken.length, count + 1);
  N.clear(nextOwner); assert.equal(N.currentText, ''); assert.equal(N.replay(), false);
  assert.equal(h.scheduled.size, 0);
});

test('a native engine that never starts or finishes releases the sound mix after a bounded wait', async t => {
  const h = await setup(t), N = h.N;
  N.unlock(); N.set('A quiet story.');
  const startup = [...h.scheduled.values()][0];
  assert.equal(startup.milliseconds, 6000);
  startup.fn();
  assert.equal(N.active, false); assert.equal(N.status, 'unavailable');
  assert.equal(h.ducked.at(-1), false);
  N.replay(); h.spoken.at(-1).onstart();
  const reading = [...h.scheduled.values()][0];
  assert.ok(reading.milliseconds >= 15000 && reading.milliseconds <= 180000);
  reading.fn();
  assert.equal(N.active, false); assert.equal(N.status, 'unavailable');
  assert.equal(h.ducked.at(-1), false);
});

test('unsupported browsers retain captions and subscribers without throwing or requesting audio', async t => {
  const h = await setup(t, { supported: false }), N = h.N, snapshots = [];
  const unsubscribe = N.subscribe(value => snapshots.push(value));
  N.set('You can still read this caption.'); N.unlock();
  assert.equal(N.supported, false); assert.equal(N.status, 'unsupported');
  assert.equal(N.replay(), false); assert.equal(h.spoken.length, 0);
  assert.equal(snapshots.at(-1).currentText, 'You can still read this caption.');
  unsubscribe(); const count = snapshots.length;
  N.clear(); assert.equal(snapshots.length, count);
});

test('synchronous native failures release ducking and malformed numeric settings use safe values', async t => {
  const h = await setup(t), N = h.N;
  S.settings.voiceRate = NaN; S.settings.voiceVolume = Infinity;
  h.onSpeak(() => { throw new Error('native engine unavailable'); });
  N.unlock(); N.set('A friendly voice.');
  assert.equal(h.spoken[0].rate, 0.88);
  assert.equal(h.spoken[0].volume, 0.63);
  assert.equal(N.active, false); assert.equal(N.status, 'unavailable');
  assert.equal(h.ducked.at(-1), false);
  assert.equal(h.scheduled.size, 0);
});

test('initialization and caption cleanup are safe without browser globals', async t => {
  const h = await setup(t, { supported: false }), N = h.N;
  delete globalThis.window; delete globalThis.document;
  assert.equal(N.init(), false);
  N.set('The written story stays available.');
  assert.equal(N.replay(), false);
  N.stop(); N.clear();
  assert.equal(N.status, 'unsupported');
  assert.deepEqual(N.voices(), []);
});
