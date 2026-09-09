import test from 'node:test';
import assert from 'node:assert/strict';

// Exercise the real map/scene modules. Only the drawing boundary is replaced:
// these checks run in Node without a browser or a canvas implementation.
globalThis.window = {};
globalThis.document = { body: { classList: { contains: () => false } } };

const [{ R, LAYER }, { Atlas }, { S, defaults }, { Scenes }, { MAPS },
  { clearMapCache }, world, lighting] = await Promise.all([
  import('../src/core/renderer.js'), import('../src/art/atlas.js'),
  import('../src/state.js'), import('../src/core/scene.js'),
  import('../src/world/maps.js'), import('../src/world/map.js'),
  import('../src/world/overworld.js'), import('../src/world/daynight.js'),
]);

let fixtureCount = 0;

async function harness(t, { tile = 'p', rows, indoor = false, season = 'spring' } = {}) {
  const rectangles = [], sprites = [], tints = [], recolors = new Map();
  const layers = new Map();
  const id = `world-test-${++fixtureCount}`;
  MAPS[id] = {
    name: 'World test', indoor, rows: rows || Array(12).fill(tile.repeat(20)),
    npcs: [], structures: [], warps: [],
  };
  t.after(() => { delete MAPS[id]; clearMapCache(); });
  Object.assign(S, defaults());
  S.clock.season = season;
  S.clock.hour = 12;
  R.cinematicFx = false;

  t.mock.method(R, 'layer', (layer, fn) => {
    if (!layers.has(layer)) layers.set(layer, []);
    layers.get(layer).push(fn);
  });
  t.mock.method(R, 'sortEntity', () => {});
  t.mock.method(R, 'rect', (x, y, w, h, color) => rectangles.push({ x, y, w, h, color }));
  t.mock.method(R, 'blit', (img, x, y, options) => sprites.push({ name: img.name, x, y, options }));
  t.mock.method(R, 'tintScreen', (color, alpha, mode) => tints.push({ color, alpha, mode }));
  t.mock.method(R, 'glow', () => {});
  t.mock.method(Atlas, 'has', () => true);
  t.mock.method(Atlas, 'tryGet', name => name ? { name, width: 16, height: 16 } : null);
  t.mock.method(Atlas, 'recolor', (name, suffix, recolor) => {
    const key = `${name}:${suffix}`;
    recolors.set(key, recolor);
    return key;
  });

  world.register();
  const scene = Scenes.make('overworld');
  await scene.enter({ map: id, x: 2, y: 2 });
  function render(...wantedLayers) {
    rectangles.length = 0; sprites.length = 0; tints.length = 0; layers.clear();
    scene.render();
    for (const layer of wantedLayers) for (const draw of layers.get(layer) || []) draw();
  }
  return { render, rectangles, sprites, tints, recolors, map: world.currentMap };
}

test('roads remain clear of meadow decorations and false object shadows', async t => {
  const h = await harness(t);
  h.render(LAYER.GROUND);
  assert.ok(h.sprites.length > 100, 'the fixture must actually render its road tiles');
  assert.ok(h.sprites.every(s => s.name.startsWith('t.path.')));
  const dressing = h.rectangles.filter(r => r.w !== R.viewW || r.h !== R.viewH);
  assert.deepEqual(dressing, [], 'road cells must not receive flowers, blades or block shadows');
});

test('solid water receives reflections without inheriting solid-object shadows', async t => {
  const h = await harness(t, { tile: 'w' });
  assert.equal(h.map.solid(5, 5), true, 'fixture must reproduce non-walkable water');
  h.render(LAYER.GROUND);
  const dressing = h.rectangles.filter(r => r.w !== R.viewW || r.h !== R.viewH);
  assert.ok(dressing.length > 0, 'ponds should have visible reflection strokes');
  assert.ok(dressing.every(r => r.h === 1), 'water dressing should remain thin reflected light');
  assert.ok(dressing.every(r => r.color.startsWith('rgba(223,248,248,')),
    'water must not inherit the green shadow rectangles used for props');
});

test('winter foliage preserves wood and alpha while roads retain their identity', async t => {
  const rows = Array(12).fill('.'.repeat(20));
  rows[3] = '...T......pppp......';
  const h = await harness(t, { rows, season: 'winter' });
  h.render(LAYER.GROUND, LAYER.OVER);
  const tree = h.sprites.find(s => s.name.startsWith('t.tree.canopy.nw:'));
  assert.ok(tree, 'winter must select seasonal tree art');
  const recolor = h.recolors.get(tree.name);
  const trunk = [140, 80, 45, 255];
  assert.deepEqual(recolor(trunk), trunk, 'wood should retain its material colour');
  const leaf = recolor([70, 150, 55, 127]);
  assert.equal(leaf[3], 127, 'season changes must preserve partial transparency');
  assert.ok(leaf[2] > 150 && leaf[0] > 100, 'winter leaves should be visibly frosted');
  const roads = h.sprites.filter(s => s.name.startsWith('t.path.'));
  assert.ok(roads.length > 0);
  assert.ok(roads.every(s => !s.name.includes(':')), 'roads must not be recoloured into foliage');
});

test('autumn trees turn warm while spring uses the original art', async t => {
  const rows = Array(12).fill('.'.repeat(20));
  rows[3] = '...T................';
  const h = await harness(t, { rows, season: 'autumn' });
  h.render(LAYER.OVER);
  const tree = h.sprites.find(s => s.name.startsWith('t.tree.canopy.nw:'));
  assert.ok(tree);
  const leaf = h.recolors.get(tree.name)([70, 150, 55, 255]);
  assert.ok(leaf[0] > leaf[1] && leaf[1] > leaf[2], 'autumn foliage should read as gold/ochre');
  S.clock.season = 'spring';
  h.render(LAYER.OVER);
  assert.ok(h.sprites.some(s => s.name === 't.tree.canopy.nw'));
  assert.ok(h.sprites.every(s => !s.name.includes(':season-')));
});

test('an indoor scene stays dry during an outdoor storm', async t => {
  const h = await harness(t, { tile: '_', indoor: true });
  S.clock.weather = 'storm';
  h.render(LAYER.WEATHER);
  assert.deepEqual(h.sprites, [], 'rain and snow must not be painted inside the room');
  assert.equal(h.tints.length, 1, 'interior lighting still applies');
});

test('interior furniture shadows are cached beneath props without treating walls or doors as furniture', async t => {
  const rows = Array(12).fill('_'.repeat(20));
  rows[2] = '__]__E__d__U________';
  rows[5] = '____t_______R_______';
  const h = await harness(t, { rows, indoor: true });
  const mid = t.mock.method(h.map, 'mid', h.map.mid.bind(h.map));
  h.render(LAYER.GROUND);
  const shadows = h.rectangles.filter(r => r.color.startsWith('rgba(44,30,20,'));
  assert.ok(shadows.length > 0, 'table and plant have a ground contact shadow');
  assert.ok(shadows.every(r => r.y >= 5 * 16 + 12 && r.y < 6 * 16 + 3),
    'wall, window, door and hanging art receive no furniture footprint');
  assert.ok(shadows.some(r => r.x < 5 * 16) && shadows.some(r => r.x > 12 * 16),
    'both solid floor props receive a shadow');
  assert.ok(mid.mock.callCount() > 0, 'furniture geometry was discovered on the first render');
  mid.mock.resetCalls();
  h.render(LAYER.GROUND);
  assert.equal(mid.mock.callCount(), 0, 'subsequent ground draws reuse cached furniture positions');
  h.render(LAYER.MID);
  assert.ok(h.rectangles.every(r => !r.color.startsWith('rgba(44,30,20,')),
    'the shadow never draws over the furniture art');
});

test('large oak casts one broad canopy shadow anchored to its roots', async t => {
  const rows = Array(12).fill('p'.repeat(20));
  rows[3] = 'ppppppTppppppppppppp';
  const h = await harness(t, { rows });
  t.mock.method(Atlas, 'tryGet', name => name ? {
    name, width: name === 't.tree.oak' ? 96 : 16, height: name === 't.tree.oak' ? 128 : 16,
    logicalWidth: name === 't.tree.oak' ? 48 : 16,
  } : null);
  h.render(LAYER.GROUND);
  const canopy = h.rectangles.filter(r => r.color === 'rgba(32,65,45,0.12)');
  const root = h.rectangles.filter(r => r.color === 'rgba(25,47,33,0.16)');
  assert.ok(canopy.some(r => r.w >= 40), '48px crown has a broader cast shadow than a small pine');
  assert.equal(root.length, 1, 'a whole oak has one root contact shadow, not one per solid canopy cell');
  assert.ok(canopy.every(r => r.y >= root[0].y - 2 && r.y <= root[0].y + 13),
    'the crown shadow stays near the roots instead of darkening the full canopy height');
});

test('reduced motion lowers weather density and rain-to-snow changes reset particle speeds', async t => {
  const h = await harness(t);
  S.clock.weather = 'rain';
  R.cinematicFx = true;
  lighting.drawWeather(h.map);
  const normalCount = h.sprites.length;
  h.sprites.length = 0;
  R.cinematicFx = false;
  lighting.drawWeather(h.map);
  assert.ok(h.sprites.length > 0 && h.sprites.length < normalCount,
    'reduced motion should retain weather cues with fewer moving particles');

  R.cinematicFx = true;
  S.clock.weather = 'snow';
  h.sprites.length = 0;
  lighting.drawWeather(h.map);
  const first = h.sprites.map(s => ({ ...s }));
  h.sprites.length = 0;
  lighting.drawWeather(h.map);
  assert.equal(h.sprites.length, first.length);
  const downwardSteps = h.sprites.map((s, i) => s.y - first[i].y).filter(d => d >= 0);
  assert.ok(downwardSteps.length > 0);
  assert.ok(downwardSteps.every(d => d < 1), 'snow must not inherit the faster rain velocities');
});

test('deep night remains blue and readable outside the reach of lamps', async t => {
  const h = await harness(t);
  S.clock.hour = 22;
  lighting.drawLighting(h.map);
  assert.equal(h.tints.length, 1);
  assert.equal(h.tints[0].mode, 'multiply');
  assert.ok(h.tints[0].alpha > 0.3 && h.tints[0].alpha <= 0.58,
    'night must be visible without hiding the world beneath a heavy tint');
});
