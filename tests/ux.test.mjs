import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';

let now = 0;
Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => now } });
const listeners = new Map();
globalThis.window = { addEventListener: (name, fn) => listeners.set(name, fn) };
globalThis.document = {
  addEventListener() {}, getElementById() { return null; },
  body: { classList: { contains() { return false; } } },
  createElement() { return { width: 1, height: 1, getContext() { return { fillRect() {} }; } }; },
};
globalThis.localStorage = { setItem() {}, getItem() { return null; } };
const { Input, initInput } = await import('../src/core/input.js');
const { Scenes } = await import('../src/core/scene.js');
const { S, adopt, defaults } = await import('../src/state.js');
const { R } = await import('../src/core/renderer.js');
const { Frame } = await import('../src/ui/frame.js');
const { buildFont, Font } = await import('../src/core/font.js');
const { Hooks, UIx } = await import('../src/core/bridge.js');
const { HUD, journeyGoal } = await import('../src/ui/hud.js');
const { register: registerPause } = await import('../src/ui/pause.js');
const { register: registerMissionUI } = await import('../src/missions/missionui.js');
const Missions = await import('../src/missions/missions.js');
initInput(window);
buildFont();
registerPause();
registerMissionUI();
Scenes.register('title', () => ({}));
Scenes.register('overworld', () => ({}));
const drawn = [], said = [], notices = [];
Frame.panel = () => {};
Frame.write = (text, x, y, style, opts = {}) => drawn.push({ text: String(text), x, y, ...opts });
R.layer = (_, draw) => draw();
R.rect = R.stroke = R.blit = () => {};
R.text = (text, x, y, opts = {}) => drawn.push({ text: String(text), x, y, ...opts });
UIx.install({
  panel() {},
  async say(text) { said.push(text); },
  async confirm() { return true; },
  async fade() {},
  toast(text) { notices.push(text); },
});
Hooks.install('missions', { list: Missions.list });

function key(type, code, extra = {}) {
  let prevented = false;
  const event = { code, preventDefault() { prevented = true; }, ...extra };
  listeners.get(type)(event);
  return prevented;
}

async function press(btn) {
  Input.script(btn, 1);
  Input.runScripted();
  Scenes.update(1 / 60);
  Input.endFrame();
  await Promise.resolve();
}

beforeEach(() => {
  while (Scenes.stack.length) Scenes.pop();
  adopt(defaults());
  Input.reset(); Input.enabled = true;
  now = 0;
  drawn.length = said.length = notices.length = 0;
  localStorage.setItem = () => {};
});

test('E interacts, mixed physical keys release independently, browser fields and shortcuts keep their keys', () => {
  assert.equal(key('keydown', 'KeyE'), true);
  assert.equal(Input.label('a'), 'E');
  key('keydown', 'Space');
  key('keyup', 'KeyE');
  assert.equal(Input.held('a'), true);
  key('keyup', 'Space');
  assert.equal(Input.held('a'), false);
  Input.endFrame();
  assert.equal(key('keydown', 'KeyS', { ctrlKey: true }), false);
  assert.equal(key('keydown', 'KeyW', { target: { tagName: 'INPUT' } }), false);
  assert.equal(key('keydown', 'Enter', { target: { tagName: 'BUTTON' } }), false);
  assert.equal(key('keydown', 'Tab', { target: { tagName: 'BUTTON' } }), false);
  assert.equal(Input.anyPressed(), false);
});

test('held menu navigation has an initial delay and steady repeat; blur clears held input', () => {
  key('keydown', 'ArrowDown');
  assert.equal(Input.nav('down'), true);
  Input.endFrame();
  now = 359; assert.equal(Input.nav('down'), false);
  now = 360; assert.equal(Input.nav('down'), true);
  now = 420; assert.equal(Input.nav('down'), false);
  now = 470; assert.equal(Input.nav('down'), true);
  listeners.get('blur')();
  assert.equal(Input.held('down'), false);
  assert.equal(Input.dir(), null);
});

test('journey guidance leads to Gran, then respects a chosen family mission', () => {
  const gran = { who: 'gran', x: 18, y: 11 };
  const map = { id: 'village', npcs: [gran] };
  assert.equal(journeyGoal(map).target, gran);
  S.party.push({ species: 'embercub' });
  Missions.track('three-homes');
  assert.equal(journeyGoal(map).title, 'Find Homes for Three Things');
  assert.match(journeyGoal(map).hint, /^0\/3 complete/);
});

test('story guidance routes players back to Emberhollow when the character is on another map', () => {
  const woods = { id: 'forest', name: 'Hollowpine Wood', npcs: [] };
  assert.equal(journeyGoal(woods).hint, 'Return to Emberhollow for Gran.');
  assert.equal(journeyGoal(woods).target, undefined);
  const cottage = { id: 'granhouse', npcs: [{ who: 'gran', x: 10, y: 7 }] };
  assert.equal(journeyGoal(cottage).hint, 'Talk to Gran beside the table.');
  S.party.push({ species: 'embercub' });
  assert.equal(journeyGoal(woods).hint, 'Meet the Mayor in Emberhollow.');
});

test('exploration prompts disappear immediately below the pause and settings overlays', () => {
  const map = { id: 'home', name: 'Your Cottage', indoor: true, npcs: [] };
  Scenes.push('overworld');
  HUD.draw(map);
  assert.ok(drawn.some(row => row.text.includes('interact')));
  assert.ok(drawn.some(row => row.text === 'Find your first Guardian'));
  Scenes.push('pause');
  drawn.length = 0;
  HUD.draw(map);
  assert.deepEqual(drawn, []);
  Scenes.push('settings');
  HUD.draw(map);
  assert.deepEqual(drawn, []);
  Scenes.pop(); Scenes.pop();
  HUD.draw(map);
  assert.ok(drawn.some(row => row.text.includes('interact')));
});

test('settings adjust volume and persist hints and reduced motion without leaving the menu', async () => {
  Scenes.push('settings');
  await press('down');
  await press('right');
  assert.equal(S.settings.volume, 0.8);
  await press('down'); await press('down'); await press('a');
  assert.equal(S.settings.showHints, false);
  await press('down'); await press('a');
  assert.equal(S.settings.reducedMotion, true);
  assert.equal(R.cinematicFx, false);
  assert.equal(Scenes.topName, 'settings');
});

test('failed save never claims progress is saved or exits to title', async () => {
  localStorage.setItem = () => { throw new Error('storage full'); };
  const warn = console.warn;
  console.warn = () => {};
  try {
    Scenes.push('pause');
    for (let i = 0; i < 4; i++) await press('down');
    await press('a');
    Scenes.render();
    assert.ok(drawn.some(row => row.text.startsWith('Save failed.')));
    Scenes.push('settings');
    for (let i = 0; i < 5; i++) await press('down');
    await press('a');
    assert.equal(Scenes.topName, 'settings');
  } finally { console.warn = warn; }
});

test('tracking a mission keeps the chosen row selected and shows its complete instructions once', async () => {
  const rows = Missions.list('real');
  const index = rows.findIndex(row => row.id === 'three-homes');
  Scenes.push('missions', { tab: 'real' });
  for (let i = 0; i < index; i++) await press('down');
  await press('a');
  assert.equal(Missions.isTracked('three-homes'), true);
  assert.deepEqual(said, [Missions.byId('three-homes').desc]);
  assert.equal(notices.filter(text => text.startsWith('Tracking:')).length, 1);
  Scenes.render();
  assert.ok(drawn.some(row => row.x > 170 && row.text === 'Find Homes for Three'));
});

test('completed daily missions report completion instead of pretending to track again', async () => {
  Missions.complete('set-the-table');
  notices.length = 0;
  const index = Missions.list('real').findIndex(row => row.id === 'set-the-table');
  Scenes.push('missions', { tab: 'real' });
  for (let i = 0; i < index; i++) await press('down');
  const coins = S.coins, hearth = S.hearth;
  await press('a');
  assert.match(said[0], /Already done today/);
  assert.equal(Missions.isTracked('set-the-table'), false);
  assert.equal(S.coins, coins); assert.equal(S.hearth, hearth);
  assert.deepEqual(notices, []);
});

test('every mission card stays inside the playfield and descriptions clear the reward divider', async () => {
  Scenes.push('missions', { tab: 'real' });
  for (let i = 0; i < Missions.list('real').length; i++) {
    drawn.length = 0;
    Scenes.render();
    for (const row of drawn) {
      const width = Font.measure(row.text);
      const left = row.align === 'right' ? row.x - width : row.align === 'center' ? row.x - width / 2 : row.x;
      assert.ok(left >= 0 && left + width <= R.W, `${row.text} exceeds horizontal bounds`);
      assert.ok(row.y >= 0 && row.y + 8 <= R.H, `${row.text} exceeds vertical bounds`);
    }
    const detail = drawn.filter(row => row.x === 178 && row.y > 60 && row.y < 128);
    assert.ok(detail.every(row => row.y + 8 < 124), 'description overlaps the reward divider');
    await press('down');
  }
});
