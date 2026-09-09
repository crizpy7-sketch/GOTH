import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = {};
globalThis.document = { body: { classList: { contains: () => false } } };
const [{ R }, { Atlas }, { S, defaults }, { Scenes }, { MAPS }, { clearMapCache },
  { Input }, { Audio }, { UIx, Hooks }, world] = await Promise.all([
  import('../src/core/renderer.js'), import('../src/art/atlas.js'), import('../src/state.js'),
  import('../src/core/scene.js'), import('../src/world/maps.js'), import('../src/world/map.js'),
  import('../src/core/input.js'), import('../src/core/audio.js'), import('../src/core/bridge.js'),
  import('../src/world/overworld.js'),
]);

let fixtures = 0;
async function harness(t, { obstacles = [], warps = [] } = {}) {
  const id = `companion-test-${++fixtures}`, inside = `${id}-inside`;
  const rows = Array(16).fill('.'.repeat(20));
  for (const [x, y, tile] of obstacles) rows[y] = rows[y].slice(0, x) + tile + rows[y].slice(x + 1);
  MAPS[id] = { name: 'Trail fixture', rows, npcs: [], structures: [], warps: warps.map(w => ({ ...w, to: inside })) };
  MAPS[inside] = { name: 'Indoor fixture', indoor: true, rows: Array(16).fill('_'.repeat(20)), npcs: [], structures: [], warps: [] };
  t.after(() => { delete MAPS[id]; delete MAPS[inside]; clearMapCache(); });
  Object.assign(S, defaults());
  S.party = [{ species: 'embercub', hp: 20 }];
  R.camera.x = 0; R.camera.y = 0;
  let dir = null, running = false, placing = false;
  const draws = [];
  t.mock.method(Input, 'pressed', () => false);
  t.mock.method(Input, 'held', name => name === 'run' && running);
  t.mock.method(Input, 'dir', () => dir);
  t.mock.method(Audio, 'sfx', () => {});
  t.mock.method(R, 'centerOn', () => {});
  t.mock.method(R, 'layer', () => {});
  t.mock.method(R, 'sortEntity', (depth, draw) => draw());
  t.mock.method(R, 'blit', (img, x, y, options) => draws.push({ name: img.name, x, y, options }));
  t.mock.method(Atlas, 'has', () => true);
  t.mock.method(Atlas, 'tryGet', name => ({ name, width: 16, height: name.startsWith('c.') ? 24 : 16 }));
  t.mock.method(document.body.classList, 'contains', name => name === 'build-active' && placing);
  world.register();
  const scene = Scenes.make('overworld');
  await scene.enter({ map: id, x: 5, y: 5, dir: 'down' });
  function advance(frames) { for (let i = 0; i < frames; i++) scene.update(); }
  function beginStep(direction, run = false) {
    const before = Hooks.world.playerTile();
    dir = direction; running = run;
    for (let i = 0; i < 12; i++) {
      scene.update();
      const tile = Hooks.world.playerTile();
      if (tile.x !== before.x || tile.y !== before.y) { dir = null; return; }
    }
    dir = null;
    throw new Error(`Fixture could not begin a step ${direction}`);
  }
  function step(direction, run = false) { beginStep(direction, run); advance(run ? 5 : 8); }
  function companion() {
    draws.length = 0; scene.render();
    return draws.find(d => /^g\..+\.ow$/.test(d.name));
  }
  return { id, inside, beginStep, step, advance, companion,
    place(value) { placing = value; },
    bump(direction) { dir = direction; advance(20); dir = null; },
  };
}

test('companion follows the traversed corner and never cuts across an adjacent wall', async t => {
  const h = await harness(t, { obstacles: [[5, 6, '#']] });
  assert.equal(h.companion(), undefined, 'no stale trail before the first departure');
  h.step('right');
  assert.deepEqual([h.companion().x, h.companion().y], [80, 80]);
  h.beginStep('down'); h.advance(4);
  assert.deepEqual([h.companion().x, h.companion().y], [88, 80],
    'halfway through the leader turn, companion is still on the previous horizontal segment');
  h.advance(4);
  assert.deepEqual([h.companion().x, h.companion().y], [96, 80]);
  const steps = S.stats.steps;
  h.bump('left');
  assert.equal(S.stats.steps, steps, 'the wall still blocks the leader');
  assert.deepEqual([h.companion().x, h.companion().y], [96, 80], 'failed steps add no breadcrumb');
  h.step('up');
  assert.deepEqual([S.player.x, S.player.y], [6, 5], 'a decorative companion never blocks the player');
});

test('running retains a one-step gap, respects placement visibility and follows the chosen lead', async t => {
  const h = await harness(t);
  h.step('right', true); h.step('right', true);
  assert.deepEqual([h.companion().x, h.companion().y], [96, 80]);
  assert.equal(h.companion().name, 'g.embercub.ow');
  S.party.unshift({ species: 'leafowl', hp: 18 });
  assert.equal(h.companion().name, 'g.leafowl.ow', 'party order selects the walking companion');
  h.place(true); assert.equal(h.companion(), undefined);
  h.place(false); assert.equal(h.companion().name, 'g.leafowl.ow');
  S.party = []; assert.equal(h.companion(), undefined);
});

test('map entry clears old breadcrumbs and reveals the companion only after departing the new doorway', async t => {
  const h = await harness(t);
  h.step('right'); h.step('down');
  assert.ok(h.companion());
  await world.enterMap(h.inside, 10, 9, 'down', { fade: false });
  assert.equal(h.companion(), undefined, 'no interpolation from the old map across the room');
  h.step('down');
  assert.deepEqual([h.companion().x, h.companion().y], [160, 144]);
});

test('door transitions hide the companion while both sides of the doorway change maps', async t => {
  const h = await harness(t, { warps: [{ x: 7, y: 5, tx: 2, ty: 2, door: true }] });
  let releaseDoor;
  t.mock.method(UIx, 'doorway', direction => direction === 'out'
    ? new Promise(resolve => { releaseDoor = resolve; }) : Promise.resolve());
  h.step('right'); assert.ok(h.companion());
  h.step('right');
  assert.equal(typeof releaseDoor, 'function', 'fixture actually entered the door transition');
  assert.equal(h.companion(), undefined, 'companion cannot linger outside a closing doorway');
  releaseDoor();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(S.player.map, h.inside);
  assert.equal(h.companion(), undefined, 'the new room has no stale breadcrumb');
});

test('a companion repeats the player ledge hop instead of sliding through the cliff face', async t => {
  const h = await harness(t, { obstacles: [[5, 6, 'v']] });
  h.beginStep('down'); h.advance(18);
  assert.equal(S.player.y, 7);
  h.beginStep('down'); h.advance(4);
  assert.deepEqual([h.companion().x, h.companion().y], [80, 82],
    'halfway through the recorded hop the companion is 14px above the ledge');
  h.advance(4);
  assert.deepEqual([h.companion().x, h.companion().y], [80, 112]);
});
