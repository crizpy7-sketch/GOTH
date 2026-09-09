import test from 'node:test';
import assert from 'node:assert/strict';
import { MAPS, START } from '../src/world/maps.js';
import { loadMap } from '../src/world/map.js';
globalThis.window = {};
const [{ Atlas }, { register: registerSprites }] = await Promise.all([
  import('../src/art/atlas.js'), import('../src/art/sprites.js'),
]);

const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function reachable(map, origin) {
  const queue = [[origin.x, origin.y]], seen = new Set([`${origin.x},${origin.y}`]);
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i];
    for (const [dx, dy] of directions) {
      const nx = x + dx, ny = y + dy, key = `${nx},${ny}`;
      if (!map.inside(nx, ny) || map.solid(nx, ny) || seen.has(key)) continue;
      queue.push([nx, ny]); seen.add(key);
    }
  }
  return seen;
}

test('scenery leaves every authored NPC, entrance and map connection reachable', () => {
  for (const [id, def] of Object.entries(MAPS)) {
    const map = loadMap(id);
    assert.ok(def.rows.every(row => row.length === map.w), `${id} must remain rectangular`);
    const arrival = map.warps[0];
    assert.equal(map.solid(arrival.x, arrival.y), false, `${id} entrance is walkable`);
    const connected = reachable(map, arrival);
    for (const npc of map.npcs) {
      assert.equal(map.solid(npc.x, npc.y), false, `${id}/${npc.id} cannot spawn inside scenery`);
      assert.ok(connected.has(`${npc.x},${npc.y}`), `${id}/${npc.id} must remain approachable`);
    }
    for (const warp of map.warps) {
      assert.ok(connected.has(`${warp.x},${warp.y}`), `${id} route to ${warp.to} must remain open`);
      const target = loadMap(warp.to);
      assert.ok(target.inside(warp.tx, warp.ty), `${id} arrival in ${warp.to} stays inside the map`);
      assert.equal(target.solid(warp.tx, warp.ty), false, `${id} arrival in ${warp.to} stays clear`);
    }
  }
  const village = loadMap(START.map);
  assert.equal(village.solid(START.x, START.y), false);
  assert.ok(reachable(village, START).has('6,9'), 'new players can still reach their cottage');
});

test('furnished rooms and the forest treasure retain reachable interaction sides', () => {
  for (const id of ['home', 'granhouse', 'workshop', 'forest']) {
    const map = loadMap(id), connected = reachable(map, map.warps[0]);
    for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
      if (!['chest', 'stove', 'anvil', 'hearthfire'].includes(map.tag(x, y))) continue;
      assert.ok(directions.some(([dx, dy]) => connected.has(`${x + dx},${y + dy}`)),
        `${id} ${map.tag(x, y)} at ${x},${y} needs an accessible interaction side`);
    }
  }
  // Chest flags use map/x/y in existing saves. Rearranging furniture must not
  // turn an already opened chest into a fresh reward.
  for (const [id, x, y] of [['home', 2, 7], ['workshop', 14, 5], ['forest', 28, 28]]) {
    assert.equal(loadMap(id).tag(x, y), 'chest', `${id} preserves its saved chest identity`);
  }
});

test('old saves inside an enlarged house recover to the connected village safely', async () => {
  const [{ S, defaults }, { enterMap }] = await Promise.all([
    import('../src/state.js'), import('../src/world/overworld.js'),
  ]);
  const map = loadMap('village'), connected = reachable(map, START);
  for (const [x, y] of [[4, 7], [7, 8], [15, 7], [25, 7]]) {
    Object.assign(S, defaults());
    assert.equal(map.solid(x, y), true, 'fixture reproduces an older save under the new facade');
    await enterMap('village', x, y, 'down', { fade: false });
    assert.equal(map.solid(S.player.x, S.player.y), false, 'the player is moved clear of the building');
    assert.ok(connected.has(`${S.player.x},${S.player.y}`), 'the recovered tile can reach the village exits');
  }
  await enterMap('village', START.x, START.y, 'down', { fade: false });
  assert.equal(S.player.x, START.x, 'an already safe save keeps its exact position');
  assert.equal(S.player.y, START.y);
});

test('authored building art bottoms meet their physical door row', t => {
  const art = new Map();
  t.mock.method(Atlas, 'defineHD', (name, w, h, ratio) => art.set(name, { w, h, ratio }));
  t.mock.method(Atlas, 'define', (name, w, h) => art.set(name, { w, h, ratio: 1 }));
  t.mock.method(Atlas, 'defineAnim', (name, w, h) => art.set(name, { w, h, ratio: 1 }));
  registerSprites();
  for (const structure of MAPS.village.structures) {
    const sprite = art.get(structure.sprite);
    assert.ok(sprite, `missing authored building ${structure.sprite}`);
    assert.equal(sprite.w, structure.w * 16, 'the art occupies the original collision width');
    assert.equal((structure.y - structure.overhang) * 16 + sprite.h,
      (structure.door.y + 1) * 16, 'the visible doorstep must end on the walkable door row');
  }
  for (const [name, sprite] of art) {
    if (!name.startsWith('c.')) continue;
    assert.equal(sprite.w, 16, `${name} retains the shared character width`);
    assert.equal(sprite.h, 24, `${name} retains the shared character height`);
  }
});
