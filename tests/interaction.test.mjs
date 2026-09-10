import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = {};
globalThis.document = { body: { classList: { contains: () => false } } };
globalThis.localStorage = { setItem() {}, getItem() { return null; } };
const [{ R, LAYER }, { Atlas }, { S, defaults }, { Scenes }, { MAPS }, { clearMapCache },
  { Input }, { Audio }, { UIx, Hooks }, { Npc }, world] = await Promise.all([
  import('../src/core/renderer.js'), import('../src/art/atlas.js'), import('../src/state.js'),
  import('../src/core/scene.js'), import('../src/world/maps.js'), import('../src/world/map.js'),
  import('../src/core/input.js'), import('../src/core/audio.js'), import('../src/core/bridge.js'),
  import('../src/world/npc.js'), import('../src/world/overworld.js'),
]);

let fixtures = 0;
async function harness(t, { tile = '.', npcs = [], indoor = false, village = null } = {}) {
  const id = `interaction-${++fixtures}`;
  const rows = Array(16).fill('.'.repeat(20));
  rows[4] = rows[4].slice(0, 5) + tile + rows[4].slice(6);
  MAPS[id] = { name: 'Interaction fixture', indoor, rows, npcs, structures: [], warps: [] };
  Object.assign(S, defaults());
  R.camera.x = 0; R.camera.y = 0;
  let placing = false, uiBusy = false, transitioning = false, dir = null, key = 'E';
  const buttons = new Set(), layers = [], texts = [], rectangles = [], says = [];
  const priorBusy = Object.getOwnPropertyDescriptor(UIx, 'busy');
  const priorTransition = Object.getOwnPropertyDescriptor(UIx, 'transitioning');
  Object.defineProperty(UIx, 'busy', { configurable: true, get: () => uiBusy });
  Object.defineProperty(UIx, 'transitioning', { configurable: true, get: () => transitioning });
  t.after(() => {
    Scenes.stack.length = 0; delete MAPS[id]; clearMapCache();
    Object.defineProperty(UIx, 'busy', priorBusy);
    Object.defineProperty(UIx, 'transitioning', priorTransition);
  });
  t.mock.method(Input, 'pressed', name => buttons.has(name));
  t.mock.method(Input, 'consume', name => buttons.delete(name));
  t.mock.method(Input, 'held', () => false);
  t.mock.method(Input, 'dir', () => dir);
  t.mock.method(Input, 'label', () => key);
  t.mock.method(Audio, 'sfx', () => {});
  t.mock.method(R, 'centerOn', () => {});
  t.mock.method(R, 'layer', (layer, draw) => { if (layer === LAYER.UI) layers.push(draw); });
  t.mock.method(R, 'sortEntity', () => {});
  t.mock.method(R, 'measure', text => String(text).length * 4);
  t.mock.method(R, 'text', (text, x, y, options) => texts.push({ text, x, y, options }));
  t.mock.method(R, 'rect', (x, y, w, h, color) => rectangles.push({ x, y, w, h, color }));
  t.mock.method(R, 'stroke', () => {});
  t.mock.method(Atlas, 'tryGet', () => null);
  t.mock.method(Hooks.village, 'interact', village || (() => null));
  t.mock.method(UIx, 'say', async (text, options) => { says.push({ text, options }); });
  world.register();
  const scene = Scenes.make('overworld');
  Scenes.stack.length = 0; Scenes.stack.push(scene);
  await scene.enter({ map: id, x: 5, y: 5, dir: 'up' });
  function render() {
    layers.length = 0; texts.length = 0; rectangles.length = 0;
    scene.render(); for (const draw of layers) draw();
    return texts.map(row => row.text);
  }
  return { id, scene, render, texts, rectangles, says,
    async act() { buttons.add('a'); scene.update(); await new Promise(resolve => setImmediate(resolve)); },
    place(value) { placing = value; },
    ui(value) { uiBusy = value; },
    transition(value) { transitioning = value; },
    key(value) { key = value; },
    move(value) { dir = value; },
    init() { t.mock.method(document.body.classList, 'contains', name => name === 'build-active' && placing); },
  };
}

test('a named NPC prompt matches the dialogue target and takes priority over a prop or village action', async t => {
  let villageCalls = 0;
  const h = await harness(t, {
    tile: 'i', npcs: [{ who: 'smith', x: 5, y: 4 }],
    village: () => { villageCalls++; return async () => {}; },
  });
  h.init();
  assert.deepEqual(h.render(), ['E', 'Talk to Hesta']);
  assert.equal(villageCalls, 0, 'an NPC claims the target before the village is queried');
  await h.act();
  assert.ok(h.says.length > 0);
  assert.ok(h.says.every(row => row.options.speaker === 'Hesta'));
  assert.equal(villageCalls, 0);
});

test('a chest preview grants nothing; opening changes its prompt and grants charms only once', async t => {
  const h = await harness(t, { tile: 'Z', indoor: true });
  h.init();
  const before = S.bag.charm;
  assert.deepEqual(h.render(), ['E', 'Open Chest']);
  h.render(); h.render();
  assert.equal(S.bag.charm, before);
  assert.equal(S.flags[`chest.${h.id}.5.4`], undefined);
  await h.act();
  assert.equal(S.bag.charm, before + 5);
  assert.deepEqual(h.render(), ['E', 'Check Chest']);
  await h.act();
  assert.equal(S.bag.charm, before + 5);
  assert.equal(h.says.at(-1).text, 'The chest is empty now.');
});

test('village hints use read-only preview metadata while a press invokes the actual action once', async t => {
  let runs = 0;
  const previews = [];
  const h = await harness(t, { village: (map, x, y, options) => {
    previews.push(options.preview);
    assert.deepEqual([x, y], [5, 4]);
    return Object.assign(async () => { runs++; }, { hint: ['Manage', 'Cottage'] });
  } });
  h.init();
  assert.deepEqual(h.render(), ['E', 'Manage Cottage']);
  assert.equal(runs, 0);
  await h.act();
  assert.equal(runs, 1);
  assert.deepEqual(previews, [true, false]);
});

test('prompts respect hints, menus, transition, placement, movement, and the active input label', async t => {
  const h = await harness(t, { tile: 'i' });
  h.init();
  assert.deepEqual(h.render(), ['E', 'Read Sign']);
  h.key('A'); assert.deepEqual(h.render(), ['A', 'Read Sign']);
  for (const toggle of [v => { S.settings.showHints = !v; }, h.ui, h.transition, h.place]) {
    toggle(true); assert.deepEqual(h.render(), []);
    toggle(false); assert.ok(h.render().includes('Read Sign'));
  }
  Scenes.stack.push({ __name: 'pause' }); assert.deepEqual(h.render(), []);
  Scenes.stack.pop(); assert.ok(h.render().includes('Read Sign'));
  h.move('left');
  for (let i = 0; i < 6; i++) h.scene.update();
  assert.deepEqual(h.render(), [], 'a walking player is not offered a stationary interaction');
});

test('interaction plaques retain readable UI size and follow both outdoor and indoor zoom', async t => {
  const h = await harness(t, { tile: 'i' });
  h.init();
  h.render();
  const outdoor = { ...h.rectangles.find(row => row.color === 'rgba(17,34,30,0.95)') };
  world.currentMap.indoor = true;
  h.render();
  const indoor = h.rectangles.find(row => row.color === 'rgba(17,34,30,0.95)');
  assert.deepEqual([outdoor.w, outdoor.h], [indoor.w, indoor.h], 'world zoom never shrinks the text');
  assert.ok(Math.abs(outdoor.x + outdoor.w / 2 - 66) <= .5);
  assert.ok(Math.abs(indoor.x + indoor.w / 2 - 88) <= .5);
  assert.ok(indoor.y > outdoor.y);
});

test('doors and objects with no useful action do not advertise a misleading button', async t => {
  for (const tile of ['D', 'd', 'l', '.']) {
    await t.test(tile, async sub => {
      const h = await harness(sub, { tile }); h.init();
      assert.deepEqual(h.render(), []);
    });
  }
});

test('wandering villagers keep a cottage entrance and approach available', () => {
  const map={solid:()=>false,structures:[{door:{x:17,y:9}}],warps:[{x:21,y:33}]};
  const gran=new Npc({who:'gran',x:18,y:11,wander:3},map);
  assert.equal(gran.canStep(17,10,()=>false),false,'Gran cannot camp in front of her door');
  assert.equal(gran.canStep(17,9,()=>false),false,'door tile stays clear');
  assert.equal(gran.canStep(18,10,()=>false),true,'nearby conversation space stays available');
  const ranger=new Npc({who:'ranger',x:21,y:32,wander:1},map);
  assert.equal(ranger.canStep(21,33,()=>false),false,'map exits stay clear');
});

test('a direction tapped between frames turns the player without taking a step', async t => {
  const h=await harness(t);
  t.mock.method(Input,'tappedDir',()=> 'left');
  h.scene.update();
  assert.deepEqual([S.player.x,S.player.y,S.player.dir],[5,5,'left']);
  t.mock.method(Input,'tappedDir',()=>null);
  for(let i=0;i<20;i++)h.scene.update();
  assert.deepEqual([S.player.x,S.player.y,S.player.dir],[5,5,'left']);
});

test('villagers pause beside the player and notice each approach only once', () => {
  const npc = new Npc({ who: 'smith', x: 5, y: 5, wander: 1 }, { solid: () => false });
  npc.cool = 0;
  for (let i = 0; i < 70; i++) { npc.notice(5, 6); npc.update(() => false); }
  assert.equal(npc.moving, false, 'a villager does not walk away from an adjacent conversation');
  assert.equal(npc.noticed, 0, 'the greeting expires without repeatedly flashing an exclamation');
  npc.notice(10, 10); npc.notice(5, 6);
  assert.equal(npc.noticed, 50, 'a later approach gets a fresh greeting');
});
