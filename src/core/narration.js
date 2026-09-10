// Read the visible caption with the device's speech engine. No microphone,
// account, or audio upload is needed; installed voices differ between devices.
import { S } from '../state.js';
import { Audio } from './audio.js';

let initialized = false, synthesis = null, Utterance = null, installedVoices = [];
let unlocked = false, caption = null, utterance = null, generation = 0;
let revision = 0, attemptedRevision = -1, watchdog = null, state = 'off';
let configuration = '', progress = 0;
const listeners = new Set();

const number = (value, fallback, min, max) => Math.max(min, Math.min(max,
  Number.isFinite(value) ? value : fallback));
const settings = () => S.settings || {};
const masterVolume = () => number(settings().volume, 0.7, 0, 1);
const speechVolume = () => number(settings().voiceVolume, 0.9, 0, 1) * masterVolume();
const enabled = () => settings().readAloud === true;
const hidden = () => typeof document !== 'undefined' && document.hidden === true;
const muted = () => settings().muted === true || Audio.muted || speechVolume() <= 0;
const supported = () => !!synthesis && typeof Utterance === 'function';
const stamp = () => JSON.stringify([enabled(), settings().voiceURI || '', settings().voiceRate,
  settings().voiceVolume, settings().muted, Audio.muted, masterVolume()]);

function snapshot() {
  return { status: state, active: !!utterance, currentText: caption?.text || '',
    speaker: caption?.speaker || '', supported: supported(), charIndex: progress };
}
function notify() {
  const value = snapshot();
  for (const listener of listeners) {
    // A detached UI listener must not interrupt dialogue or leave music ducked.
    try { listener(value); } catch { /* presentation is optional */ }
  }
}
function status(value) { state = value; notify(); }
function duck(value) { Audio.setNarrating?.(value); }
function clearWatchdog() {
  if (watchdog !== null) clearTimeout(watchdog);
  watchdog = null;
}
function cancel() {
  generation++;
  clearWatchdog();
  const wasActive = !!utterance;
  utterance = null; progress = 0;
  // Increment the token before cancel(), which may synchronously dispatch error.
  if (wasActive && synthesis) {
    try { synthesis.cancel(); } catch { /* an unavailable device remains playable */ }
  }
  duck(false);
}
function restingStatus() {
  if (!supported()) return 'unsupported';
  if (muted()) return 'muted';
  if (!enabled()) return 'off';
  if (caption && !unlocked) return 'waiting';
  return 'ready';
}
function rank(voice) {
  const name = String(voice.name || '');
  return (/^en(?:[-_]|$)/i.test(voice.lang || '') ? 1000 : 0)
    + (voice.localService ? 100 : 0)
    + (/natural|enhanced|premium/i.test(name) ? 50 : 0)
    + (/samantha|serena|zira|aria|jenny|susan|karen|moira/i.test(name) ? 30 : 0)
    + (voice.default ? 10 : 0);
}
function refreshVoices() {
  try {
    installedVoices = Array.from(synthesis?.getVoices?.() || [])
      .filter(voice => voice && typeof voice.name === 'string')
      .sort((a, b) => rank(b) - rank(a) || a.name.localeCompare(b.name));
  } catch { installedVoices = []; }
}
function selectedVoice() {
  return installedVoices.find(voice => voice.voiceURI === settings().voiceURI)
    || installedVoices.find(voice => /^en(?:[-_]|$)/i.test(voice.lang || ''))
    || installedVoices.find(voice => voice.default) || installedVoices[0] || null;
}
function normalizeText(text) { return String(text ?? '').replace(/\s+/g, ' ').trim(); }

function speak(text) {
  cancel();
  if (!text || hidden()) { status(restingStatus()); return false; }
  if (!supported()) { status('unsupported'); return false; }
  if (muted()) { status('muted'); return false; }
  if (!unlocked) { status('waiting'); return false; }
  attemptedRevision = revision;
  const token = generation;
  let line;
  try {
    refreshVoices();
    line = new Utterance(text);
    const voice = selectedVoice();
    if (voice) line.voice = voice;
    // Empty getVoices() is common before voiceschanged. Let the browser try its
    // English default synchronously inside the gesture, without a blank utterance.
    line.lang = voice?.lang || 'en-US';
    line.rate = number(settings().voiceRate, 0.88, 0.65, 1.15);
    line.pitch = 1;
    line.volume = speechVolume();
    utterance = line; // Keep a strong reference for WebKit until completion.
    const current = () => token === generation && utterance === line;
    const failed = (reason = 'unavailable') => {
      if (!current()) return;
      cancel();
      if (reason === 'waiting') { unlocked = false; attemptedRevision = -1; }
      status(reason);
    };
    const armWatchdog = milliseconds => {
      clearWatchdog();
      watchdog = setTimeout(() => failed('unavailable'), milliseconds);
    };
    line.onstart = () => {
      if (!current()) return;
      if (hidden() || muted()) { cancel(); status(restingStatus()); return; }
      // Bound a stalled engine's music ducking. This comfortably exceeds normal
      // reading time while a new page, stop, mute, or hidden tab cancels sooner.
      const words = text.split(/\s+/).length;
      armWatchdog(Math.min(180000, Math.max(15000, words / (1.5 * line.rate) * 1000 + 10000)));
      status('speaking');
    };
    line.onboundary = event => {
      if (!current()) return;
      progress = number(event.charIndex, 0, 0, text.length);
      notify();
    };
    line.onend = () => {
      if (!current()) return;
      clearWatchdog(); utterance = null; progress = text.length;
      duck(false); status(restingStatus());
    };
    line.onerror = event => {
      const code = event?.error || '';
      failed(code === 'not-allowed' ? 'waiting'
        : code === 'canceled' || code === 'interrupted' ? 'stopped' : 'unavailable');
    };
    duck(true);
    status('speaking');
    armWatchdog(6000);
    synthesis.speak(line);
    return utterance === line;
  } catch {
    if (token === generation) { cancel(); status('unavailable'); }
    return false;
  }
}

function autoRead() {
  if (enabled() && caption && attemptedRevision !== revision) return speak(caption.automatic);
  return false;
}

export const Narration = {
  init() {
    if (initialized) return supported();
    initialized = true;
    if (typeof window !== 'undefined') {
      try {
        synthesis = window.speechSynthesis || null;
        Utterance = window.SpeechSynthesisUtterance || null;
      } catch { synthesis = null; }
    }
    refreshVoices();
    synthesis?.addEventListener?.('voiceschanged', () => {
      refreshVoices(); notify(); // Do not interrupt a line or replay a stale page.
    });
    if (typeof document !== 'undefined') document.addEventListener?.('visibilitychange', () => {
      if (hidden()) this.stop(); // Returning to a tab never starts unsolicited speech.
    });
    if (typeof window !== 'undefined') window.addEventListener?.('pagehide', () => this.stop());
    configuration = stamp(); state = restingStatus();
    return supported();
  },

  // Call directly from the real pointer/key event, before awaiting or scheduling.
  unlock() {
    this.init(); unlocked = true;
    const started = autoRead();
    if (!utterance && state === 'waiting') status(restingStatus());
    return started;
  },

  set(text, { key = '', speaker = '', utterance: automatic, owner = null } = {}) {
    this.init();
    text = normalizeText(text);
    if (!text) { this.clear(owner || undefined); return; }
    const next = { text, key, speaker: String(speaker || ''), owner,
      automatic: normalizeText(automatic === undefined ? text : automatic) };
    if (caption && Object.keys(next).every(field => caption[field] === next[field])) return;
    cancel(); caption = next; revision++;
    status(restingStatus());
    autoRead();
  },

  clear(owner) {
    if (owner !== undefined && caption?.owner !== owner) return;
    cancel(); caption = null; revision++; attemptedRevision = revision;
    status(restingStatus());
  },

  replay() {
    this.init(); unlocked = true;
    return !!caption && speak(caption.text);
  },

  stop() {
    cancel(); attemptedRevision = revision;
    status(supported() && !muted() ? 'stopped' : restingStatus());
  },

  configure() {
    this.init();
    const next = stamp(), changed = next !== configuration;
    configuration = next;
    if (muted() || !enabled()) {
      // Explicitly changing the automatic-reading setting also stops manual speech.
      if (changed || muted()) cancel();
      if (!utterance) status(restingStatus());
      return;
    }
    if (changed) { cancel(); attemptedRevision = -1; }
    if (!utterance) { status(restingStatus()); autoRead(); }
  },

  voices() { this.init(); return installedVoices.slice(); },
  subscribe(listener) {
    this.init();
    if (typeof listener !== 'function') return () => {};
    listeners.add(listener); listener(snapshot());
    return () => listeners.delete(listener);
  },
  get supported() { this.init(); return supported(); },
  get active() { return !!utterance; },
  get currentText() { return caption?.text || ''; },
  get speaker() { return caption?.speaker || ''; },
  get status() { this.init(); return state; },
  get charIndex() { return progress; },
};
