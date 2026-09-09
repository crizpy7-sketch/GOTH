import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const listeners = new Map();
const attributes = new Map();
globalThis.window = {};
const screen = {
  addEventListener(name, fn) { listeners.set(name, fn); },
  removeEventListener(name, fn) { if (listeners.get(name) === fn) listeners.delete(name); },
  getBoundingClientRect() { return { left: 10, top: 20, width: 640, height: 360 }; },
  getAttribute(name) { return attributes.get(name) ?? null; },
  setAttribute(name, value) { attributes.set(name, value); },
  removeAttribute(name) { attributes.delete(name); },
};
globalThis.document = {
  getElementById: id => id === 'screen' ? screen : null,
  createElement: () => ({ width: 1, height: 1, getContext: () => ({ fillRect() {} }) }),
};
globalThis.localStorage = { setItem() {}, getItem() { return null; } };
const [{ register }, { R }, { Input }, { Scenes }, { UIx }, { Atlas }, { Audio }, { S, adopt, defaults }, { buildFont }] = await Promise.all([
  import('../src/ui/story.js'), import('../src/core/renderer.js'), import('../src/core/input.js'),
  import('../src/core/scene.js'), import('../src/core/bridge.js'), import('../src/art/atlas.js'),
  import('../src/core/audio.js'), import('../src/state.js'), import('../src/core/font.js'),
]);
buildFont(); register();

const texts = [], sprites = [], rects = [], music = [];
let song = 'village', worldTicks = 0, worldInteractions = 0;
const ctx = { globalAlpha: 1, save() {}, restore() {}, beginPath() {}, rect() {}, clip() {} };
Object.defineProperty(R, 'ctx', { configurable: true, get: () => ctx });
Object.defineProperty(Audio, 'playing', { configurable: true, get: () => song });
Audio.play = (name, options) => { song = name; music.push({ name, options }); };
Audio.stop = () => { song = null; music.push({ name: null }); };
Audio.sfx = () => {};
Audio.hasSong = name => name === 'story';
R.layer = (_, fn) => fn();
R.rect = (x, y, w, h, color) => rects.push({ x, y, w, h, color });
R.stroke = () => {};
R.text = (text, x, y, options) => texts.push({ text: String(text), x, y, ...options });
R.blit = (image, x, y, options) => sprites.push({ id: image.id, x, y, ...options });
Atlas.tryGet = id => ({ id, width: 320, height: 180 });
Scenes.register('overworld', () => ({ update() { worldTicks++; if (Input.pressed('a')) worldInteractions++; } }));

const choices = [
  { id: 'embercub', label: 'Embercub', detail: 'A brave spark, with warmth enough to share.' },
  { id: 'leafowl', label: 'Leafowl', detail: 'A watchful friend, at home beneath the branches.' },
  { id: 'aquarabbit', label: 'Aquarabbit', detail: 'A playful spirit, happiest beside running water.' },
];
const options = more => ({
  title: 'A place beside the fire', speaker: 'Gran Willow', portrait: 'gran',
  setting: 'cottage', lines: ['There is a place for you here, by our hearth.'], ...more,
});
const frame = () => { Input.runScripted(); Scenes.update(1 / 60); Input.endFrame(); };
const frames = n => { for (let i = 0; i < n; i++) frame(); };
const press = button => { Input.script(button, 1); frame(); };
const draw = () => { texts.length = sprites.length = rects.length = 0; Scenes.render(); return { texts, sprites, rects }; };
const visibleText = () => draw().texts.filter(t => t.limit !== undefined).map(t => t.text.slice(0, t.limit)).join('');
const touch = (x, y, extra = {}) => {
  let prevented = false;
  listeners.get('pointerdown')?.({ clientX: x * 2 + 10, clientY: y * 2 + 20, button: 0,
    preventDefault() { prevented = true; }, ...extra });
  return prevented;
};
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };

beforeEach(() => {
  while (Scenes.stack.length) Scenes.pop();
  adopt(defaults()); S.settings.reducedMotion = true;
  Input.reset(); Input.enabled = true;
  song = 'village'; worldTicks = worldInteractions = 0;
  attributes.set('aria-label', 'Explore Emberhollow');
  music.length = texts.length = sprites.length = rects.length = 0;
  Scenes.push('overworld');
});

test('an important conversation pauses the world and first tap reveals without advancing', async () => {
  const pending = UIx.story(options({ lines: ['Stay a little while.', 'Our hearth has room for you.'] }));
  const scene = Scenes.top;
  frame();
  assert.equal(scene.touchPhase, 'reveal');
  assert.equal(UIx.busy, true);
  press('a');
  assert.equal(visibleText(), 'Stay a little while.');
  assert.equal(scene.touchPhase, 'narrative');
  frames(600);
  assert.equal(worldTicks, 0, 'NPC movement, clock and encounters remain paused');
  assert.equal(Scenes.top, scene, 'reading never advances on a timer');
  press('a');
  assert.equal(visibleText(), '');
  press('b');
  assert.equal(visibleText(), 'Our hearth has room for you.');
  press('b'); frame();
  assert.deepEqual(await pending, { completed: true, choice: -1 });
  assert.equal(UIx.busy, false);
  assert.equal(Scenes.topName, 'overworld');
  assert.equal(listeners.size, 0);
  assert.equal(song, 'village');
  assert.equal(attributes.get('aria-label'), 'Explore Emberhollow');
  frame(); assert.equal(worldTicks, 1);
});

test('long dialogue wraps into player-controlled pages that remain inside the mobile safe band', () => {
  const longLine = 'The warm windows of Emberhollow are a promise to every traveller: there is always a place to rest, always a bowl to share, and always someone who will be glad to see you return. And when the first snow falls, we will light the lanterns and wait for our friends by the fire.';
  UIx.story(options({ lines: [longLine] }));
  frame(); press('a');
  const first = visibleText();
  assert.ok(first.length < longLine.length);
  const lines = draw().texts.filter(t => t.limit !== undefined);
  assert.ok(lines.length <= 3);
  assert.ok(lines.every(t => t.y >= 118 && t.y + 8 <= 150));
  press('a'); press('a');
  assert.notEqual(visibleText(), first);
  assert.equal(Scenes.topName, 'story');
});

test('text speed changes reveal rate without changing page or auto-advancing', () => {
  S.settings.textSpeed = 1;
  UIx.story(options()); frame(); frames(10);
  const slow = visibleText().length;
  Scenes.pop();
  S.settings.textSpeed = 3;
  UIx.story(options()); frame(); frames(10);
  assert.ok(visibleText().length > slow * 2);
  assert.equal(Scenes.topName, 'story');
});

test('a starter choice commits exactly once and its welcome remains in the same scene', async () => {
  let grant, calls = 0, index;
  const pending = UIx.story(options({ choices, onChoose: i => {
    calls++; index = i; return new Promise(resolve => { grant = resolve; });
  } }));
  frame(); press('a'); press('a');
  const scene = Scenes.top;
  assert.equal(scene.touchPhase, 'choices');
  press('right'); press('a');
  assert.equal(index, 1);
  assert.equal(scene.touchPhase, 'pending');
  press('a'); press('b'); touch(160, 60); frames(20);
  assert.equal(calls, 1);
  assert.equal(Scenes.top, scene);
  grant({ guardian: 'leafowl', lines: ['Leafowl settles beside your shoulder.'] });
  await settle();
  assert.equal(Scenes.top, scene);
  assert.equal(scene.touchPhase, 'reveal');
  assert.ok(draw().sprites.some(s => s.id === 'g.leafowl.front'));
  press('a'); press('a'); frame();
  assert.deepEqual(await pending, { completed: true, choice: 1 });
  assert.equal(calls, 1);
});

test('leaving a pending choice gives no Guardian and reports an incomplete story', async () => {
  let calls = 0;
  const pending = UIx.story(options({ choices, onChoose: () => { calls++; } }));
  frame(); press('a'); press('a'); press('b'); frame();
  assert.equal(calls, 0);
  assert.deepEqual(await pending, { completed: false, choice: -1 });
  assert.equal(Scenes.topName, 'overworld');
  assert.equal(song, 'village');
});

test('canvas taps reveal and advance, preview a choice, then confirm the selected card', async () => {
  let chosen = -1;
  const pending = UIx.story(options({ choices, onChoose: i => { chosen = i; } }));
  frame();
  assert.equal(touch(130, 135), true);
  assert.equal(Scenes.top.touchPhase, 'narrative');
  touch(130, 135);
  assert.equal(Scenes.top.touchPhase, 'choices');
  touch(270, 60, { isPrimary: false });
  assert.equal(chosen, -1, 'secondary touches cannot confirm');
  assert.equal(touch(160, 165), false, 'empty footer space is not an invisible confirmation target');
  assert.equal(chosen, -1);
  touch(270, 60);
  assert.equal(chosen, -1, 'a new card previews before committing');
  assert.ok(visibleText().includes('playful spirit'));
  touch(270, 60);
  await settle(); frame();
  assert.equal(chosen, 2);
  assert.deepEqual(await pending, { completed: true, choice: 2 });
});

test('removing the scene during an async choice restores controls and never reopens the story', async () => {
  let resolveChoice;
  const pending = UIx.story(options({ choices, onChoose: () => new Promise(resolve => { resolveChoice = resolve; }) }));
  frame(); press('a'); press('a'); press('a');
  Scenes.pop();
  assert.deepEqual(await pending, { completed: false, choice: -1 });
  assert.equal(listeners.size, 0);
  assert.equal(song, 'village');
  resolveChoice({ lines: ['This line must not reopen a closed scene.'], guardian: 'embercub' });
  await settle();
  assert.equal(Scenes.topName, 'overworld');
  assert.equal(UIx.busy, false);
});

test('reduced motion keeps portraits still and removes drifting particles', () => {
  UIx.story(options()); frame();
  const first = draw().sprites.find(s => s.id === 'story.gran');
  assert.equal(rects.filter(r => r.w === 1 && r.h === 1).length, 0);
  frames(38);
  const second = draw().sprites.find(s => s.id === 'story.gran');
  assert.equal(first.y, second.y);
  assert.equal(first.x, second.x);
  Scenes.pop();
  S.settings.reducedMotion = false;
  UIx.story(options()); frames(20);
  draw();
  assert.equal(rects.filter(r => r.w === 1 && r.h === 1).length, 9);
});

test('story music stops when the conversation had no previous track', () => {
  song = null;
  UIx.story(options());
  assert.equal(song, 'story');
  Scenes.pop();
  assert.equal(song, null);
});

test('the touch action stays disabled throughout the opening and closing transitions', async () => {
  S.settings.reducedMotion = false;
  const pending = UIx.story(options());
  const scene = Scenes.top;
  assert.equal(scene.touchPhase, 'pending');
  frames(17);
  assert.equal(scene.touchPhase, 'pending');
  frame();
  assert.equal(scene.touchPhase, 'reveal');
  press('a'); press('a');
  assert.equal(scene.touchPhase, 'pending');
  frames(11);
  assert.equal(Scenes.top, scene);
  assert.equal(scene.touchPhase, 'pending');
  frame();
  assert.deepEqual(await pending, { completed: true, choice: -1 });
  assert.equal(Scenes.topName, 'overworld');
});

test('holding gamepad confirm across the choice boundary or scene exit never creates a second action', async () => {
  let held = false, grants = 0;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {
    getGamepads: () => [{ buttons: [{ pressed: held }], axes: [0, 0] }],
  } });
  const padFrame = () => { Input.pollGamepad(); frame(); };
  const pending = UIx.story(options({ choices, onChoose: () => { grants++; } }));
  padFrame();
  held = true; padFrame(); // reveal
  held = false; padFrame();
  held = true; padFrame(); // advance into the pending choice
  assert.equal(Scenes.top.touchPhase, 'choices');
  padFrame(); padFrame();
  assert.equal(grants, 0, 'the held advance press cannot choose the first Guardian');
  held = false; padFrame();
  held = true; padFrame();
  assert.equal(grants, 1);
  await settle(); padFrame();
  assert.deepEqual(await pending, { completed: true, choice: 0 });
  padFrame(); padFrame();
  assert.equal(worldInteractions, 0, 'the held choice press cannot reopen the NPC conversation');
  held = false; padFrame();
  held = true; padFrame();
  assert.equal(worldInteractions, 1, 'releasing restores normal world interaction');
});

test('missing premium art falls back to the existing NPC sprite without losing dialogue', () => {
  const original = Atlas.tryGet;
  try {
    Atlas.tryGet = id => id === 'c.gran.down' ? { id, width: 32, height: 48 } : null;
    UIx.story(options()); frame(); press('a');
    assert.ok(draw().sprites.some(sprite => sprite.id === 'c.gran.down'));
    assert.equal(visibleText(), options().lines[0]);
  } finally { Atlas.tryGet = original; }
});

test('a failed choice callback stays readable, never retries the grant, and can return to the world', async () => {
  let calls = 0;
  const report = console.error;
  console.error = () => {};
  try {
    const pending = UIx.story(options({ choices, onChoose: async () => { calls++; throw new Error('fixture'); } }));
    frame(); press('a'); press('a'); press('a');
    await settle();
    press('a');
    assert.ok(visibleText().includes('Please speak to me again'));
    press('a'); frame();
    assert.deepEqual(await pending, { completed: false, choice: 0 });
    assert.equal(calls, 1);
    assert.equal(Scenes.topName, 'overworld');
    assert.equal(listeners.size, 0);
  } finally { console.error = report; }
});
