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
const { register: registerParty, leadGuardian, sendGuardianHome, inviteGuardian } = await import('../src/ui/party.js');
const { makeGuardian } = await import('../src/battle/species.js');
const Missions = await import('../src/missions/missions.js');
initInput(window);
buildFont();
registerPause();
registerMissionUI();
registerParty();
Scenes.register('title', () => ({}));
Scenes.register('overworld', () => ({}));
const drawn = [], said = [], notices = [];
Frame.panel = () => {};
Frame.write = (text, x, y, style, opts = {}) => drawn.push({ text: String(text), x, y, ...opts });
R.layer = (_, draw) => draw();
R.rect = R.stroke = R.blit = R.glow = () => {};
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
  UIx.install({ async ask() { return -1; } });
});

const companion = (id, opts = {}) => makeGuardian('embercub', 5, { id, ...opts });

test('a ready Guardian can become the travelling lead in one action without changing anyone else', () => {
  const team = ['one', 'two', 'three'].map(id => companion(id));
  S.party.push(...team);
  const hp = team[2].hp, focus = team[2].moves.map(m => m.focus);
  assert.equal(leadGuardian(2).ok, true);
  assert.deepEqual(S.party.map(g => g.id), ['three', 'one', 'two']);
  assert.equal(S.party[0], team[2]);
  assert.equal(S.party[0].hp, hp);
  assert.deepEqual(S.party[0].moves.map(m => m.focus), focus);
  S.party[1].hp = 0;
  assert.equal(leadGuardian(1).ok, false);
  assert.equal(S.party[0].id, 'three');
  assert.equal(leadGuardian(0).ok, false);
});

test('sending a Guardian home preserves the last ready companion and every roster member', () => {
  S.party.push(companion('one'));
  assert.equal(sendGuardianHome(0).ok, false);
  const resting = companion('two'); resting.hp = 0;
  S.party.push(resting);
  assert.equal(sendGuardianHome(0).ok, false);
  assert.equal(sendGuardianHome(1).ok, true);
  assert.deepEqual(S.party.map(g => g.id), ['one']);
  assert.deepEqual(S.box.map(g => g.id), ['two']);
  assert.equal(S.box[0].hp, 0, 'moving home does not silently heal or reset the Guardian');
});

test('a full team can exchange home Guardians without losing health, focus, identity or roster capacity', () => {
  S.party.push(...Array.from({ length: 6 }, (_, i) => companion(`travel${i}`)));
  const visitor = companion('home'); visitor.hp = 1; visitor.moves[0].focus = 0;
  S.box.push(visitor);
  const resting = S.party[3];
  assert.equal(inviteGuardian(0).ok, false, 'a full team needs an explicit replacement');
  assert.equal(inviteGuardian(0, 3).ok, true);
  assert.equal(S.party.length, 6); assert.equal(S.box.length, 1);
  assert.equal(S.party[3], visitor); assert.equal(S.box[0], resting);
  assert.equal(S.party[3].hp, 1); assert.equal(S.party[3].moves[0].focus, 0);
  assert.equal(new Set([...S.party, ...S.box].map(g => g.id)).size, 7);
  S.party.forEach((g, i) => { g.hp = i === 0 ? 1 : 0; });
  S.box[0].hp = 0;
  assert.equal(inviteGuardian(0, 0).ok, false, 'a resting Guardian cannot replace the last ready one');
});

test('roster tabs and home pagination work with the same direction and action controls as mobile menus', async () => {
  S.party.push(companion('lead'));
  S.box.push(...Array.from({ length: 8 }, (_, i) => companion(`home${i}`, { nick: `Friend ${i}` })));
  const choices = [];
  UIx.install({ async ask(text, options) { choices.push({ text, options }); return 0; } });
  Scenes.push('party');
  await press('up'); await press('right'); await press('down');
  await press('down'); await press('down'); await press('down');
  Scenes.render();
  assert.ok(drawn.some(row => row.text.includes('Page 2/2')));
  assert.ok(drawn.some(row => row.text === 'Friend 6'));
  await press('b');
  drawn.length = 0; Scenes.render();
  assert.ok(drawn.some(row => row.text.includes('choose a roster')), 'Back reaches roster tabs from any home page');
  await press('down');
  await press('a');
  assert.equal(choices[0].options[0], 'Join the adventure');
  assert.deepEqual(S.party.map(g => g.id), ['lead', 'home6']);
  assert.equal(S.box.length, 7);
  drawn.length = 0; Scenes.render();
  assert.ok(drawn.some(row => row.text === 'LEAD'));
  assert.ok(drawn.some(row => row.text === 'Friend 6 joins your adventure.'));
});

test('party and home cards, tabs and instructions fit on the complete playfield', async () => {
  S.party.push(...Array.from({ length: 6 }, (_, i) => companion(`g${i}`, { nick: 'A deliberately long name' })));
  S.box.push(...Array.from({ length: 7 }, (_, i) => companion(`h${i}`)));
  Scenes.push('party');
  for (const step of [null, 'up', 'right', 'down']) {
    if (step) await press(step);
    drawn.length = 0; Scenes.render();
    for (const row of drawn) {
      const width = Font.measure(row.text);
      const left = row.align === 'right' ? row.x - width : row.align === 'center' ? row.x - width / 2 : row.x;
      assert.ok(left >= 0 && left + width <= R.W, `${row.text} exceeds horizontal bounds`);
      assert.ok(row.y >= 0 && row.y + 8 <= R.H, `${row.text} exceeds vertical bounds`);
    }
  }
});

test('roster tabs and cards accept direct screen taps, ignore overlays and clean up their listener', async () => {
  const priorGet = document.getElementById;
  const handlers = new Map();
  const screen = {
    addEventListener: (event, fn) => handlers.set(event, fn),
    removeEventListener: event => handlers.delete(event),
    getBoundingClientRect: () => ({ left: 50, top: 40, width: 640, height: 360 }),
  };
  document.getElementById = id => id === 'screen' ? screen : null;
  const requests = [];
  UIx.install({ async ask(text, options) { requests.push({ text, options }); return -1; } });
  const tap = (x, y) => handlers.get('pointerdown')({ clientX: 50 + x * 2, clientY: 40 + y * 2, preventDefault() {} });
  try {
    S.party.push(companion('travelling')); S.box.push(companion('home', { nick: 'Home friend' }));
    Scenes.push('party');
    tap(220, 26);
    Scenes.render();
    assert.ok(drawn.some(row => row.text === 'Home friend'));
    tap(40, 55); await Promise.resolve();
    assert.equal(requests[0].options[0], 'Join the adventure');
    Scenes.push('pause');
    tap(40, 55); await Promise.resolve();
    assert.equal(requests.length, 1, 'an overlay owns its inputs');
    Scenes.pop(); Scenes.pop();
    assert.equal(handlers.size, 0);
  } finally { document.getElementById = priorGet; }
});

test('battle selection never exposes home management or changes the travelling roster', async () => {
  const active = companion('active'), rested = companion('rested'), ready = companion('ready');
  rested.hp = 0;
  S.party.push(active, rested, ready); S.box.push(companion('home'));
  const picked = Scenes.pushAsync('party', { picking: true, active: 0 });
  Scenes.render();
  assert.ok(!drawn.some(row => row.text.includes('AT HOME')));
  await press('a');
  assert.equal(await picked, 2);
  assert.deepEqual(S.party.map(g => g.id), ['active', 'rested', 'ready']);
});

test('first-journey guidance counts wild friends and actual cottages rather than the starter or any decoration', () => {
  S.party.push(companion('starter'));
  S.flags.metMayor = true;
  const map = { id: 'village', npcs: [] };
  assert.equal(journeyGoal(map).title, 'A new friend in the valley');
  S.bag.charm = 0;
  assert.equal(journeyGoal(map).hint, 'Find Cobb in Gladewind Meadow for charms.');
  const cobb = { who: 'peddler', x: 24, y: 20 };
  assert.equal(journeyGoal({ id: 'meadow', npcs: [cobb] }).target, cobb);
  S.box.push(companion('newfriend'));
  S.stats.built = 4;
  S.village.buildings.push({ type: 'garden' });
  assert.equal(journeyGoal(map).title, 'A first home in Emberhollow');
  assert.equal(journeyGoal({ id: 'forest' }).hint, 'Return to Emberhollow to build a cottage.');
  S.village.buildings.push({ type: 'cottage' });
  assert.equal(journeyGoal(map).title, 'Good things, done together');
  S.box.push(...S.party.splice(0));
  assert.equal(journeyGoal(map).title, 'A companion for the road', 'existing home Guardians do not send players back to an exhausted starter gift');
});

test('the journal shows the next destination and accurate travelling, home and village counts', () => {
  S.party.push(companion('starter')); S.box.push(companion('home'));
  S.village.buildings.push({ type: 'cottage' }, { type: 'garden' });
  Scenes.push('pause'); Scenes.render();
  assert.ok(drawn.some(row => row.text === 'Meet Mayor Bramble'));
  assert.ok(drawn.some(row => row.text === '1/6 travelling  ·  1 at home'));
  assert.ok(drawn.some(row => row.text === 'Village Lv 1  ·  1 home'));
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
  const map = { id: 'granhouse', name: "Gran Willow's Warmhouse", indoor: true, npcs: [] };
  Scenes.push('overworld');
  HUD.draw(map);
  assert.ok(drawn.some(row => row.text.includes('interact')));
  assert.ok(drawn.some(row => row.text === 'Meet Gran Willow'));
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

test('arrival hints expire while standing still and the journal can recall the route', () => {
  const map = { id: 'granhouse', name: "Gran Willow's Warmhouse", indoor: true, npcs: [] };
  Scenes.push('overworld');
  HUD.draw(map);
  assert.ok(drawn.some(row => row.text === 'Talk to Gran beside the table.'));
  now = 5001;
  drawn.length = 0;
  HUD.draw(map);
  assert.ok(drawn.some(row => row.text === 'Meet Gran Willow'));
  assert.ok(!drawn.some(row => row.text === 'Talk to Gran beside the table.'));
  Scenes.push('pause'); HUD.draw(map); Scenes.pop();
  drawn.length = 0;
  HUD.draw(map);
  assert.ok(drawn.some(row => row.text === 'Talk to Gran beside the table.'));
  drawn.length = 0;
  HUD.draw({ id: 'home', name: 'Your Cottage', indoor: true, npcs: [] });
  assert.ok(!drawn.some(row => row.text === 'Meet Gran Willow'), 'ordinary interiors keep their scenery clear');
  S.settings.showHints = false;
  drawn.length = 0;
  HUD.draw(map);
  assert.ok(!drawn.some(row => row.text === 'Meet Gran Willow'));
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

test('touch menu arrows repeat deliberately and release when the scene layout changes', () => {
  const oldGet = document.getElementById, oldBody = document.body;
  const controls = new Map();
  for (const id of ['tA', 'tB', 'tM', 'tup', 'tdown', 'tleft', 'tright']) {
    controls.set(id, { events: new Map(), classList: { add() {}, remove() {} },
      addEventListener(type, fn) { this.events.set(type, fn); } });
  }
  document.getElementById = id => controls.get(id) || null;
  document.body = { dataset: {}, style: { setProperty() {} }, classList: { contains() { return false; } } };
  try {
    initInput(window);
    Scenes.push('overworld');
    Input.runScripted();
    assert.equal(document.body.dataset.touchMode, 'world');
    const downArrow = controls.get('tdown');
    downArrow.events.get('pointerdown')({ pointerId: 1, preventDefault() {} });
    assert.equal(Input.nav('down'), true);
    Input.endFrame();
    now = 359; assert.equal(Input.nav('down'), false);
    now = 360; assert.equal(Input.nav('down'), true);
    Scenes.push('pause');
    Input.runScripted();
    assert.equal(document.body.dataset.touchMode, 'menu');
    assert.equal(Input.held('down'), false, 'held navigation cannot spill into a different scene');
  } finally {
    document.getElementById = oldGet; document.body = oldBody;
    initInput(window);
    key('keydown', 'KeyE'); key('keyup', 'KeyE'); Input.reset();
  }
});
