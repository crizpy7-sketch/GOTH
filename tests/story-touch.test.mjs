import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';

let now = 0;
Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => now } });
const listeners = new Map();
const controls = new Map();
function control(id) {
  const el = {
    textContent: '', disabled: false, events: new Map(), attributes: new Map(),
    style: {}, classList: { add() {}, remove() {} },
    addEventListener(type, fn) { this.events.set(type, fn); },
    setAttribute(name, value) { this.attributes.set(name, value); },
    getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 }; },
    querySelector() { return { style: {} }; },
  };
  controls.set(id, el);
  return el;
}
for (const id of ['tpad', 'tA', 'tB', 'tM', 'tup', 'tdown', 'tleft', 'tright']) control(id);
globalThis.window = {
  addEventListener(name, fn) { listeners.set(name, fn); },
  matchMedia() { return { matches: true }; },
};
globalThis.document = {
  body: { dataset: {}, style: { setProperty() {} }, classList: { contains() { return false; } } },
  addEventListener() {},
  getElementById(id) { return controls.get(id) || null; },
};
const { Scenes } = await import('../src/core/scene.js');
const { Input, initInput } = await import('../src/core/input.js');
Scenes.register('overworld', () => ({}));
Scenes.register('story', () => ({ touchPhase: 'reveal' }));
Scenes.register('pause', () => ({}));
initInput(window);

const dispatch = (id, type, extra = {}) => controls.get(id).events.get(type)({
  pointerId: 1, clientX: 92, clientY: 50, preventDefault() {}, ...extra,
});
beforeEach(() => {
  Scenes.reset('overworld');
  Input.reset();
  Input.enabled = true;
  now = 0;
  Input.runScripted();
  Input.endFrame();
});

test('entering a story releases movement, running and held action controls', () => {
  dispatch('tpad', 'pointerdown');
  now = 130; Input.runScripted();
  now = 600; Input.runScripted();
  assert.equal(Input.held('right'), true);
  assert.equal(Input.held('run'), true);
  dispatch('tA', 'pointerdown');
  assert.equal(Input.held('a'), true);
  Scenes.push('story');
  Input.runScripted();
  assert.equal(document.body.dataset.touchMode, 'story');
  assert.equal(Input.held('right'), false);
  assert.equal(Input.held('run'), false);
  assert.equal(Input.held('a'), false);
  assert.equal(window.__touchStickState.active, false);
});

test('story controls describe revealing, advancing and selecting, and lock during an outcome', () => {
  const story = Scenes.push('story');
  Input.runScripted();
  assert.equal(controls.get('tA').textContent, 'Reveal');
  assert.equal(controls.get('tB').attributes.get('aria-label'), 'Reveal dialogue');
  assert.equal(document.body.dataset.storyChoices, 'no');
  story.touchPhase = 'narrative'; Input.runScripted();
  assert.equal(controls.get('tA').textContent, 'Next');
  story.touchPhase = 'choices'; Input.runScripted();
  assert.equal(document.body.dataset.storyChoices, 'yes');
  assert.equal(controls.get('tA').textContent, 'Choose');
  assert.equal(controls.get('tB').textContent, 'Back');
  dispatch('tright', 'pointerdown');
  assert.equal(Input.nav('right'), true, 'choice directions use a deliberate press');
  dispatch('tright', 'pointerup');
  story.touchPhase = 'pending'; Input.runScripted();
  assert.equal(controls.get('tA').disabled, true);
  assert.equal(controls.get('tB').disabled, true);
  Scenes.pop(); Input.runScripted();
  assert.equal(controls.get('tA').disabled, false);
  assert.equal(controls.get('tA').textContent, 'A');
  assert.equal(controls.get('tB').attributes.get('aria-label'), 'Back or cancel');
});

test('assistive action activation works in a story, and orientation changes clear its input', () => {
  Scenes.push('story'); Input.runScripted();
  dispatch('tA', 'click', { detail: 0 });
  Input.runScripted();
  assert.equal(Input.pressed('a'), true);
  listeners.get('orientationchange')();
  assert.equal(Input.held('a'), false);
  assert.equal(Input.pressed('a'), false);
  assert.deepEqual(Input._scripted, []);
});

test('an action held on a gamepad stays consumed as the story dock returns to the world', () => {
  let held = false;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {
    getGamepads() { return [{ buttons: [{ pressed: held }], axes: [0, 0] }]; },
  } });
  Scenes.push('story'); Input.runScripted();
  held = true; Input.pollGamepad();
  assert.equal(Input.pressed('a'), true);
  Input.consume('a');
  Scenes.pop(); Input.runScripted(); Input.endFrame();
  Input.pollGamepad();
  assert.equal(Input.pressed('a'), false, 'closing a conversation cannot create another interaction press');
  assert.equal(Input.held('a'), false);
  held = false; Input.pollGamepad(); Input.endFrame();
  held = true; Input.pollGamepad();
  assert.equal(Input.pressed('a'), true, 'releasing and pressing again restores the action');
});
