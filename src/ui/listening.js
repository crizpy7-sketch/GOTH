// A native, touch-friendly reading companion. The game owns page advancement;
// speech only follows the current caption and never changes earned progress.
import { Narration } from '../core/narration.js';
import { Audio } from '../core/audio.js';
import { Scenes } from '../core/scene.js';
import { Input } from '../core/input.js';
import { R } from '../core/renderer.js';
import { S, save, hasSave, savePreferences } from '../state.js';
import { Hooks, UIx } from '../core/bridge.js';
import { journeyGoal } from './hud.js';

let rail, panel, titleButton, listen, status, previousTop, previousText = '', lastEnabled;
let controls = {}, previousFocus = null, initialized = false;
const SAMPLE = 'Hello, little guardian. Take your time. We can read this adventure together.';
const percent = v => `${Math.round(v * 100)}%`;
const statusLabel = () => ({
  unsupported: 'Reading voice is unavailable in this browser.',
  unavailable: 'Voice unavailable. Try another voice in Sound & reading.',
  waiting: 'Tap Listen to start the voice.', speaking: 'Reading with you…',
  muted: 'Sound is off.', stopped: 'Take your time. Listen again when you like.',
  off: 'Read to me is off.', ready: 'Take your time. The page waits for you.',
}[Narration.status] || 'Take your time. The page waits for you.');

export function applySoundPreferences() {
  Audio.muted = !!S.settings.muted;
  Audio.setVolume(S.settings.volume);
  Audio.setMix({ music: S.settings.musicVolume, effects: S.settings.effectsVolume });
  Narration.configure();
  sync();
}

function sync() {
  if (!initialized) return;
  const enabled = !!S.settings.readAloud;
  if (lastEnabled !== enabled) {
    lastEnabled = enabled;
    document.body.classList.toggle('reading-enabled', enabled);
    R.resize();
  }
  rail.hidden = !enabled;
  status.textContent = statusLabel();
  listen.textContent = Narration.active ? '■ Stop' : '▶ Listen';
  listen.setAttribute('aria-label', Narration.active ? 'Stop reading' : 'Read this caption again');
  listen.disabled = !Narration.supported || !Narration.currentText || S.settings.muted || S.settings.volume === 0;
  titleButton.textContent = `Read to me: ${enabled ? 'On' : 'Off'}`;
  titleButton.setAttribute('aria-pressed', String(enabled));
  if (controls.voiceStatus) controls.voiceStatus.textContent = Narration.supported
    ? 'Uses a voice available on this device. No microphone is used.'
    : 'This browser has no reading voice. Captions and controls still work.';
}

function fillVoices() {
  const select = controls.voiceURI;
  if (!select) return;
  const signature = Narration.voices().map(v => `${v.voiceURI}|${v.name}`).join('\n');
  if (select.dataset.voices === signature) return;
  select.dataset.voices = signature;
  const automatic = document.createElement('option'); automatic.value = ''; automatic.textContent = 'Warm automatic (device voice)';
  const options = Narration.voices().map(v => {
    const option = document.createElement('option'); option.value = v.voiceURI;
    option.textContent = `${v.name} · ${v.lang}`; return option;
  });
  if (S.settings.voiceURI && !options.some(o => o.value === S.settings.voiceURI)) {
    const missing = document.createElement('option'); missing.value = S.settings.voiceURI;
    missing.textContent = 'Saved voice unavailable · using automatic'; options.push(missing);
  }
  select.replaceChildren(automatic, ...options); select.value = S.settings.voiceURI;
}

function syncForm() {
  for (const key of ['readAloud', 'muted']) controls[key].checked = !!S.settings[key];
  for (const key of ['volume','musicVolume','effectsVolume','voiceVolume']) {
    controls[key].value = Math.round(S.settings[key] * 100);
    document.getElementById(`${key}Value`).textContent = percent(S.settings[key]);
  }
  controls.voiceRate.value = String(S.settings.voiceRate);
  fillVoices(); controls.voiceURI.value = S.settings.voiceURI;
  sync();
}

function openSound() {
  if (Scenes.topName !== 'sound-settings') Scenes.push('sound-settings');
}

function persist() {
  applySoundPreferences();
  const saved = savePreferences();
  const journeySaved = !hasSave() || save();
  controls.saved.textContent = saved && journeySaved ? 'Saved on this device.' : 'Changed for this session. Saving is unavailable.';
}

export function initListening() {
  if (initialized) return;
  initialized = true;
  Narration.init();
  rail = document.getElementById('readingRail');
  panel = document.getElementById('soundPanel');
  titleButton = document.getElementById('titleReading');
  listen = document.getElementById('listenCaption');
  status = document.getElementById('readingStatus');
  controls = Object.fromEntries(['readAloud','muted','volume','musicVolume','effectsVolume','voiceVolume','voiceURI','voiceRate','voiceStatus','saved'].map(key => [key, document.getElementById(`sound-${key}`)]));
  titleButton.addEventListener('click', () => {
    S.settings.readAloud = !S.settings.readAloud;
    persist();
    Narration.unlock();
  });
  listen.addEventListener('click', () => {
    // Called directly in the trusted click: iPad Safari requires user activation.
    if (Narration.active) Narration.stop(); else Narration.replay();
  });
  document.getElementById('readingOptions').addEventListener('click', openSound);
  document.getElementById('soundClose').addEventListener('click', () => Scenes.pop());
  document.getElementById('voicePreview').addEventListener('click', () => {
    Narration.set(SAMPLE, { key: 'voice-preview', utterance: '', owner: Scenes.top }); Narration.replay();
  });
  for (const key of ['readAloud','muted']) controls[key].addEventListener('change', () => {
    S.settings[key] = controls[key].checked; persist(); Narration.unlock();
  });
  for (const key of ['volume','musicVolume','effectsVolume','voiceVolume']) controls[key].addEventListener('input', () => {
    S.settings[key] = Number(controls[key].value) / 100;
    document.getElementById(`${key}Value`).textContent = percent(S.settings[key]); persist();
  });
  for (const key of ['voiceURI','voiceRate']) controls[key].addEventListener('change', () => {
    S.settings[key] = key === 'voiceRate' ? Number(controls[key].value) : controls[key].value; persist();
  });
  panel.addEventListener('keydown', e => {
    // Native form controls retain arrows/space; no keystroke leaks into the game.
    if (e.key === 'Escape') { e.preventDefault(); Scenes.pop(); }
    if (e.key === 'Tab') {
      const focusable = [...panel.querySelectorAll('button,input,select')].filter(el => !el.disabled);
      const first = focusable[0], last = focusable.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    e.stopPropagation();
  });
  // The opening gate and subsequent taps resume the audio engine. Reading starts
  // only after the player has enabled it and a real caption exists.
  const gesture = e => {
    if (!e.isTrusted) return;
    Audio.init();
    if (e.type === 'keydown' && e.code === 'KeyL' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey
      && !/^(INPUT|SELECT|TEXTAREA)$/.test(e.target?.tagName || '')) {
      e.preventDefault(); if (Narration.active) Narration.stop(); else Narration.replay();
      return;
    }
    // A Stop/Listen button owns its gesture; don't restart speech before its click.
    if (!e.target?.closest?.('#readingRail,#soundPanel,#titleReading')) Narration.unlock();
  };
  document.addEventListener('pointerdown', gesture, true);
  document.addEventListener('keydown', gesture, true);
  Narration.subscribe(() => { sync(); fillVoices(); });
  Scenes.register('sound-settings', () => ({
    pausesBelow: true, drawsBelow: true,
    enter() {
      previousFocus = document.activeElement; Input.reset();
      Narration.clear(); panel.hidden = false;
      document.body.classList.add('sound-panel-open');
      syncForm(); controls.readAloud.focus({ preventScroll: true });
    },
    update() { if (Input.pressed('b')) Scenes.pop(); },
    exit() {
      Narration.clear(); panel.hidden = true;
      document.body.classList.remove('sound-panel-open');
      // Keep gamepad edges intact: a held Back must not close the restored story.
      for (const button of ['a','b','up','down','left','right','start','select','run']) Input.consume(button);
      const target = previousFocus?.isConnected && !previousFocus.closest?.('[hidden]') ? previousFocus : document.getElementById('screen');
      target?.focus({ preventScroll: true });
    },
  }));
  applySoundPreferences();
}

export function tickListening() {
  if (!initialized) return;
  const top = Scenes.top;
  if (top !== previousTop) {
    Narration.clear(previousTop);
    previousTop = top; previousText = '';
    top?.refreshNarration?.();
  }
  if (!top || ['__say','story','sound-settings'].includes(Scenes.topName)) return;
  let text = top.readingText || '';
  if (Scenes.topName === 'overworld') {
    // Awaited story pages briefly uncover the world while the next page opens.
    // Only offer the journey hint once the player actually has control again.
    if (Hooks.world.inputLocked || UIx.busy || UIx.transitioning) text = '';
    else {
      const goal = journeyGoal(Hooks.world.currentMap());
      text = `Next on your journey. ${goal.title}. ${goal.hint}`;
    }
  }
  if (text !== previousText) {
    previousText = text;
    if (text) Narration.set(text, { key: text, owner: top });
    else Narration.clear(top);
  }
}
