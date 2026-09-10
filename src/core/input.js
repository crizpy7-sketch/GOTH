// Input: keyboard + gamepad + touch -> logical buttons.
// Responsiveness is a headline quality target, so presses are edge-buffered: a tap
// that starts and ends inside one logical frame still registers.

import { Scenes } from './scene.js';

const BTNS = ['up', 'down', 'left', 'right', 'a', 'b', 'start', 'select', 'run'];

const KEYMAP = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  KeyZ: 'a', KeyE: 'a', Space: 'a', Enter: 'a', NumpadEnter: 'a',
  KeyX: 'b', Escape: 'b', Backspace: 'b',
  ShiftLeft: 'run', ShiftRight: 'run',
  Tab: 'select', KeyC: 'select',
  KeyM: 'start', Slash: 'start',
};

const PAD = { 12: 'up', 13: 'down', 14: 'left', 15: 'right', 0: 'a', 1: 'b', 2: 'run', 9: 'start', 8: 'select' };

const down = new Set();
const heldBy = new Map();        // logical button -> physical/scripted source tokens
const pressed = new Set();
const released = new Set();
const consumed = new Set();
const dirStack = [];             // most recently pressed direction wins
let padPrev = new Set();
let anyPress = false;
let lastInputAt = 0;
let tickTouch = () => {};
let resetTouch = () => {};
let syncTouchLayout = () => {};
let device = 'keyboard';
const repeatAt = new Map();

const LABELS = {
  keyboard: { a: 'E', b: 'Esc', start: 'M', select: 'C', run: 'Shift', move: 'WASD' },
  gamepad: { a: 'A', b: 'B', start: 'Menu', select: 'View', run: 'X', move: 'Stick' },
  touch: { a: 'A', b: 'B', start: 'Menu', select: 'Village', run: 'Outer stick', move: 'Stick' },
};

function setDown(btn, source = 'legacy') {
  if (!BTNS.includes(btn)) return;
  if (source.startsWith('key:')) device = 'keyboard';
  else if (source === 'gamepad') device = 'gamepad';
  else if (source.startsWith('touch:')) device = 'touch';
  let sources = heldBy.get(btn);
  if (!sources) heldBy.set(btn, sources = new Set());
  if (sources.has(source)) return;
  const alreadyDown = sources.size > 0;
  sources.add(source);
  if (alreadyDown) return;
  // A new physical gesture is never consumed by the previous one. A buffered
  // tap can be consumed after its keyup, so clearing only in setUp is too early.
  consumed.delete(btn);
  down.add(btn); pressed.add(btn); anyPress = true;
  lastInputAt = performance.now();
  if (btn === 'up' || btn === 'down' || btn === 'left' || btn === 'right') {
    const i = dirStack.indexOf(btn); if (i >= 0) dirStack.splice(i, 1);
    dirStack.push(btn);
  }
}
function setUp(btn, source = 'legacy') {
  if (!btn) return;
  const sources = heldBy.get(btn);
  if (!sources || !sources.has(source)) return;
  sources.delete(source);
  if (sources.size) return;
  heldBy.delete(btn);
  if (!down.has(btn)) return;
  down.delete(btn); released.add(btn); consumed.delete(btn);
  const i = dirStack.indexOf(btn); if (i >= 0) dirStack.splice(i, 1);
}

function resetAll() {
  resetTouch();
  for (const b of down) released.add(b);
  heldBy.clear(); down.clear(); pressed.clear(); consumed.clear();
  dirStack.length = 0; padPrev.clear(); repeatAt.clear(); anyPress = false;
  if (Input?._scripted) Input._scripted.length = 0;
}

export const Input = {
  enabled: true,

  held(b) { return this.enabled && down.has(b) && !consumed.has(b); },
  pressed(b) { return this.enabled && pressed.has(b) && !consumed.has(b); },
  released(b) { return this.enabled && released.has(b); },
  consume(b) { if (down.has(b)) consumed.add(b); pressed.delete(b); },
  anyPressed() { return this.enabled && anyPress; },
  get idleMs() { return performance.now() - lastInputAt; },
  get device() { return device; },
  label(b) { return LABELS[device][b] || b; },
  reset: resetAll,

  // A deliberate first press, then a steady repeat for keyboard and controllers.
  // Touch already supplies its own flick/repeat edges.
  nav(b) {
    const now = performance.now();
    if (this.pressed(b)) { repeatAt.set(b, now + 360); return true; }
    if (!this.held(b)) { repeatAt.delete(b); return false; }
    if (heldBy.get(b)?.has('touch:stick')) return false;
    if (!repeatAt.has(b)) { repeatAt.set(b, now + 360); return false; }
    if (now < repeatAt.get(b)) return false;
    repeatAt.set(b, now + 110);
    return true;
  },

  dir() {
    if (!this.enabled) return null;
    for (let i = dirStack.length - 1; i >= 0; i--) {
      if (!consumed.has(dirStack[i])) return dirStack[i];
    }
    return null;
  },

  // A press/release can occur between logical frames. Keep that gesture for a
  // facing change, without treating a released key as continued movement.
  tappedDir() {
    if (!this.enabled) return null;
    const directions = [...pressed].filter(b => ['up','down','left','right'].includes(b) && !consumed.has(b));
    return directions.at(-1) || null;
  },

  axis() {
    const x = (this.held('right') ? 1 : 0) - (this.held('left') ? 1 : 0);
    const y = (this.held('down') ? 1 : 0) - (this.held('up') ? 1 : 0);
    return { x, y };
  },

  // Called once per logical frame, at the very end.
  endFrame() {
    pressed.clear(); released.clear(); anyPress = false;
    for (const b of repeatAt.keys()) if (!down.has(b)) repeatAt.delete(b);
  },

  pollGamepad() {
    if (!navigator.getGamepads) return;
    const pads = navigator.getGamepads();
    const now = new Set();
    for (const p of pads) {
      if (!p) continue;
      p.buttons.forEach((b, i) => { if (b.pressed && PAD[i]) now.add(PAD[i]); });

      const ax = Number.isFinite(p.axes?.[0]) ? p.axes[0] : 0;
      const ay = Number.isFinite(p.axes?.[1]) ? p.axes[1] : 0;
      const mag = Math.hypot(ax, ay);
      const ENTER = 0.34, EXIT = 0.24, DOMINANCE = 1.16;
      const previousDir = ['up', 'down', 'left', 'right'].find(d => padPrev.has(d));
      const threshold = previousDir ? EXIT : ENTER;
      let stickDir = null;
      if (mag >= threshold) {
        const x = Math.abs(ax), y = Math.abs(ay);
        if (previousDir === 'left' || previousDir === 'right') {
          stickDir = y > x * DOMINANCE ? (ay > 0 ? 'down' : 'up') : (ax > 0 ? 'right' : 'left');
        } else if (previousDir === 'up' || previousDir === 'down') {
          stickDir = x > y * DOMINANCE ? (ax > 0 ? 'right' : 'left') : (ay > 0 ? 'down' : 'up');
        } else {
          stickDir = x > y ? (ax > 0 ? 'right' : 'left') : (ay > 0 ? 'down' : 'up');
        }
      }
      if (stickDir) now.add(stickDir);
    }
    for (const b of now) if (!padPrev.has(b)) setDown(b, 'gamepad');
    for (const b of padPrev) if (!now.has(b)) setUp(b, 'gamepad');
    padPrev = now;
  },

  // Test/automation hook: hold a button for `frames` logical frames.
  _scripted: [],
  _scriptSeq: 0,
  script(btn, frames = 2) { this._scripted.push({ btn, frames, source: `script:${++this._scriptSeq}`, active: false }); },
  runScripted() {
    syncTouchLayout();
    tickTouch();
    for (let i = this._scripted.length - 1; i >= 0; i--) {
      const s = this._scripted[i];
      if (s.frames === undefined) continue;
      if (!s.active) { setDown(s.btn, s.source); s.active = true; }
      if (--s.frames <= 0) { setUp(s.btn, s.source); this._scripted.splice(i, 1); }
    }
  },
};

export function initInput(root = window) {
  const isEditing = e => e.target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '');
  const isNativeActivation = e => /^(BUTTON|A)$/.test(e.target?.tagName || '') && ['Enter', 'NumpadEnter', 'Space', 'Tab'].includes(e.code);
  if (window.matchMedia?.('(pointer: coarse)').matches) device = 'touch';
  root.addEventListener('keydown', e => {
    if (e.code === 'Tab' && document.body?.classList?.contains('title-active')) return;
    if (isEditing(e) || isNativeActivation(e) || e.ctrlKey || e.metaKey || e.altKey) return;
    const btn = KEYMAP[e.code];
    if (btn) { e.preventDefault(); if (!e.repeat) setDown(btn, `key:${e.code}`); }
  }, { passive: false });
  root.addEventListener('keyup', e => {
    const btn = KEYMAP[e.code];
    if (btn) {
      if (!isEditing(e) && !isNativeActivation(e) && !e.ctrlKey && !e.metaKey && !e.altKey) e.preventDefault();
      setUp(btn, `key:${e.code}`);
    }
  }, { passive: false });
  root.addEventListener('blur', resetAll);
  root.addEventListener('pagehide', resetAll);
  root.addEventListener('orientationchange', resetAll);
  document.addEventListener('visibilitychange', () => { if (document.hidden) resetAll(); });

  initTouch();

  // Expose for Playwright-driven gameplay tests.
  window.__press = (btn, frames = 3) => Input.script(btn, frames);
  window.__inputState = () => ({ down: [...down], dir: Input.dir() });
}

function initTouch() {
  const pad = document.getElementById('tpad');
  const knob = pad?.querySelector('i');
  const buttonResetters = [];
  const bind = (el, btn) => {
    if (!el) return;
    const source = `touch:${btn}`;
    let owner = null;
    const on = e => {
      e.preventDefault();
      if (owner !== null) return;
      owner = e.pointerId;
      try { el.setPointerCapture?.(owner); } catch {}
      el.classList.add('on');
      setDown(btn, source);
    };
    const off = e => {
      if (e) e.preventDefault();
      if (e && owner !== e.pointerId) return;
      const held = owner;
      owner = null;
      if (held !== null) { try { el.releasePointerCapture?.(held); } catch {} }
      el.classList.remove('on');
      setUp(btn, source);
    };
    el.addEventListener('pointerdown', on);
    el.addEventListener('pointerup', off);
    el.addEventListener('pointercancel', off);
    el.addEventListener('lostpointercapture', off);
    // Keyboard and assistive activation produces a click without a pointer.
    // Pointer clicks already supplied their buffered press above.
    el.addEventListener('click', e => { if (e.detail === 0) Input.script(btn, 2); });
    buttonResetters.push(() => off(null));
  };
  bind(document.getElementById('tA'), 'a');
  bind(document.getElementById('tB'), 'b');
  bind(document.getElementById('tM'), 'start');
  for (const dir of ['up', 'down', 'left', 'right']) bind(document.getElementById(`t${dir}`), dir);

  const full = document.getElementById('tF');
  if (full) {
    full.hidden = !document.documentElement?.requestFullscreen;
    full.addEventListener('click', async e => {
      e.preventDefault();
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await document.documentElement.requestFullscreen();
      } catch { /* Some mobile browsers keep their own browser controls. */ }
    });
    document.addEventListener('fullscreenchange', () => {
      full.setAttribute('aria-label', document.fullscreenElement ? 'Exit fullscreen' : 'Enter fullscreen');
    });
  }

  let touchMode = '';
  syncTouchLayout = () => {
    if (!document.body?.dataset) return;
    const scene = Scenes.topName;
    const mode = scene === 'overworld' ? 'world' : scene === '__say' ? 'dialogue'
      : scene === 'story' ? 'story'
      : scene === 'battle' ? 'battle' : scene === 'build' ? 'build'
      : scene === 'title' ? 'title' : 'menu';
    if (mode !== touchMode) {
      if (touchMode) resetTouch();
      touchMode = mode;
      document.body.dataset.touchMode = mode;
      const a = document.getElementById('tA'), b = document.getElementById('tB');
      if (a) {
        a.disabled = false;
        a.textContent = mode === 'menu' ? 'Select' : 'A';
        a.setAttribute?.('aria-label', 'Interact or confirm');
      }
      if (b) {
        b.disabled = false;
        b.textContent = mode === 'menu' ? 'Back' : 'B';
        b.setAttribute?.('aria-label', 'Back or cancel');
      }
    }
    if (mode === 'story') {
      const phase = Scenes.top?.touchPhase || 'narrative';
      const choices = phase === 'choices';
      const pending = phase === 'pending';
      const next = phase === 'reveal' ? 'Reveal' : pending ? '…' : 'Next';
      document.body.dataset.storyChoices = choices ? 'yes' : 'no';
      for (const [id, label, description] of [
        ['tA', choices ? 'Choose' : next, choices ? 'Choose this response' : phase === 'reveal' ? 'Reveal dialogue' : 'Next dialogue'],
        ['tB', choices ? 'Back' : next, choices ? 'Back from choices' : phase === 'reveal' ? 'Reveal dialogue' : 'Next dialogue'],
      ]) {
        const el = document.getElementById(id);
        if (!el) continue;
        if (el.textContent !== label) {
          el.textContent = label;
          el.setAttribute?.('aria-label', description);
        }
        el.disabled = pending;
      }
    }
    if (mode === 'dialogue') {
      const choices = Scenes.top?.__params?.choices?.length || 0;
      document.body.dataset.dialogueChoices = choices ? 'yes' : 'no';
      // Dialogue grows upward when it has choices. Controls follow its top edge
      // so no paragraph or choice row is hidden behind a thumb target.
      const top = Math.max(18, (180 - 58 - choices * 12) / 180 * 100);
      document.body.style?.setProperty('--dialogue-top', `${top}%`);
    }
  };

  if (!pad) {
    resetTouch = () => { for (const reset of buttonResetters) reset(); };
    return;
  }

  // Touch-stick policy:
  // - menu navigation gets an immediate edge pulse on a deliberate flick;
  // - world movement engages only after a short hold, preventing accidental steps;
  // - held menu navigation repeats at a controlled cadence;
  // - direction changes use stronger hysteresis than the old implementation.
  let active = false, pointerId = null;
  let rawDir = null, logicalDir = null;
  let rawSince = 0, repeatAt = 0, outerSince = 0;
  let lastPoint = null;
  const DIRS4 = ['up', 'down', 'left', 'right'];
  const ENTER = 0.48;          // noticeably larger intentional-motion radius
  const EXIT = 0.29;           // return toward center stops promptly
  const SWITCH = 1.38;         // prevents diagonal wobble from swapping direction
  const MOVE_DELAY = 125;      // no accidental world step from a quick menu flick
  const REPEAT_DELAY = 360;    // menu initial repeat delay
  const REPEAT_RATE = 125;     // menu repeat cadence while held
  const RUN_RING = 0.98;       // running requires almost full extension
  const RUN_DELAY = 430;       // and a clearly intentional hold

  const pulse = dir => {
    if (!dir) return;
    device = 'touch';
    pressed.add(dir);
    anyPress = true;
    lastInputAt = performance.now();
  };

  const setLogicalDirection = want => {
    if (want === logicalDir) return;
    if (logicalDir) setUp(logicalDir, 'touch:stick');
    logicalDir = want;
    if (logicalDir) setDown(logicalDir, 'touch:stick');
  };

  const chooseDirection = (nx, ny, mag) => {
    if (mag < (rawDir ? EXIT : ENTER)) return null;
    const x = Math.abs(nx), y = Math.abs(ny);
    if (rawDir === 'left' || rawDir === 'right') {
      return y > x * SWITCH ? (ny > 0 ? 'down' : 'up') : (nx > 0 ? 'right' : 'left');
    }
    if (rawDir === 'up' || rawDir === 'down') {
      return x > y * SWITCH ? (nx > 0 ? 'right' : 'left') : (ny > 0 ? 'down' : 'up');
    }
    return x > y ? (nx > 0 ? 'right' : 'left') : (ny > 0 ? 'down' : 'up');
  };

  const update = (clientX, clientY) => {
    const r = pad.getBoundingClientRect();
    const dx = clientX - (r.left + r.width / 2);
    const dy = clientY - (r.top + r.height / 2);
    const len = Math.hypot(dx, dy);
    const max = Math.max(1, r.width / 2 - 18);
    const mag = Math.min(1, len / max);
    const nx = len ? dx / len : 0, ny = len ? dy / len : 0;
    const now = performance.now();

    if (knob) {
      // Give the thumb more physical travel before the game reacts.
      const visualLen = Math.min(len, max);
      const resistance = mag < ENTER ? 0.42 : 0.78;
      knob.style.transform = `translate(${(nx * visualLen * resistance).toFixed(1)}px,${(ny * visualLen * resistance).toFixed(1)}px)`;
    }

    const want = chooseDirection(nx, ny, mag);
    if (want !== rawDir) {
      rawDir = want;
      rawSince = now;
      repeatAt = now + REPEAT_DELAY;
      outerSince = 0;
      setLogicalDirection(null);
      // This pulse is what makes the joystick work in title/pause/party menus.
      pulse(rawDir);
    } else if (rawDir && now >= repeatAt) {
      pulse(rawDir);
      repeatAt = now + REPEAT_RATE;
    }

    // Continuous movement is deliberately slower to engage than menu navigation.
    if (rawDir && now - rawSince >= MOVE_DELAY) setLogicalDirection(rawDir);
    else if (!rawDir) setLogicalDirection(null);

    if (mag >= RUN_RING && logicalDir) {
      if (!outerSince) outerSince = now;
      if (now - outerSince >= RUN_DELAY) setDown('run', 'touch:stick');
    } else {
      outerSince = 0;
      setUp('run', 'touch:stick');
    }

    window.__touchStickState = {
      active, direction: rawDir, movementDirection: logicalDir,
      magnitude: mag, running: down.has('run'), moveDelay: MOVE_DELAY
    };
  };

  const end = e => {
    e?.preventDefault?.();
    active = false; pointerId = null;
    lastPoint = null;
    rawDir = null; rawSince = 0; repeatAt = 0; outerSince = 0;
    setLogicalDirection(null);
    setUp('run', 'touch:stick');
    if (knob) knob.style.transform = '';
    window.__touchStickState = {
      active: false, direction: null, movementDirection: null,
      magnitude: 0, running: false, moveDelay: MOVE_DELAY
    };
  };

  pad.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (active) return;
    active = true; pointerId = e.pointerId;
    try { pad.setPointerCapture?.(e.pointerId); } catch {}
    lastPoint = { x: e.clientX, y: e.clientY };
    update(lastPoint.x, lastPoint.y);
  });
  pad.addEventListener('pointermove', e => {
    if (active && e.pointerId === pointerId) {
      e.preventDefault();
      lastPoint = { x: e.clientX, y: e.clientY };
      update(lastPoint.x, lastPoint.y);
    }
  });
  pad.addEventListener('pointerup', e => { if (e.pointerId === pointerId) end(e); });
  pad.addEventListener('pointercancel', e => { if (e.pointerId === pointerId) end(e); });
  pad.addEventListener('lostpointercapture', e => { if (active && e.pointerId === pointerId) end(e); });
  tickTouch = () => { if (active && lastPoint) update(lastPoint.x, lastPoint.y); };
  resetTouch = () => {
    for (const reset of buttonResetters) reset();
    if (active || logicalDir || rawDir) end(null);
    else if (knob) knob.style.transform = '';
  };
  window.__touchStickState = {
    active: false, direction: null, movementDirection: null,
    magnitude: 0, running: false, moveDelay: MOVE_DELAY
  };
}
