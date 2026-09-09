import test from 'node:test';
import assert from 'node:assert/strict';
import { makeGuardian } from '../src/battle/species.js';
import { newBattle, chooseAction, stepTurn, presentationOf, forceSwitch, previewEffect, aiAction } from '../src/battle/engine.js';
import { Bus, EV } from '../src/core/events.js';
import { bondPreview } from '../src/battle/capture.js';

test('battle presentation snapshots retain the HP and focus the player has seen', () => {
  const g = makeGuardian('embercub', 6);
  const shown = presentationOf(g);
  g.hp = 0;
  g.lvl++;
  g.moves[0].focus = 0;
  g.types[0] = 'tide';
  g.stats.atk = 999;
  assert.ok(shown.hp > 0);
  assert.equal(shown.lvl, 6);
  assert.ok(shown.moves[0].focus > 0);
  assert.equal(shown.types[0], 'ember');
  assert.notEqual(shown.stats.atk, 999);
});

test('a switch carries the incoming HP before the opponent attacks it', () => {
  const party = [makeGuardian('embercub', 6), makeGuardian('aquarabbit', 6)];
  const foe = makeGuardian('leafowl', 6);
  const hp = party[1].hp;
  const B = newBattle({ party, foe, seed: 5 });
  chooseAction(B, 'player', { type: 'switch', i: 1 });
  chooseAction(B, 'foe', { type: 'move', id: 'leaf_dart' });
  const events = stepTurn(B);
  const replacement = events.find(e => e.k === 'switch');
  const hit = events.find(e => e.k === 'damage' && e.target === 'player' && !e.missed);
  assert.ok(hit, 'fixture must land its hit');
  assert.ok(events.indexOf(replacement) < events.indexOf(hit));
  assert.equal(replacement.guardian.hp, hp);
  assert.equal(hit.hp, party[1].hp);
  assert.ok(hit.hp < replacement.guardian.hp);
  party[1].hp = 0;
  assert.equal(replacement.guardian.hp, hp);
});

test('forced replacement snapshots do not mutate with later turns', () => {
  const party = [makeGuardian('embercub', 6), makeGuardian('aquarabbit', 6)];
  const B = newBattle({ party, foe: makeGuardian('leafowl', 6) });
  party[0].hp = 0;
  B.needSwitch = 'player';
  const event = forceSwitch(B, 1)[0];
  party[1].hp = 1;
  assert.ok(event.guardian.hp > 1);
  assert.equal(B.needSwitch, null);
});

test('tactical move hints use the battle type chart', () => {
  const B = newBattle({ party: [makeGuardian('embercub', 6)], foe: makeGuardian('leafowl', 6) });
  assert.equal(previewEffect(B, 'cinder_nip').eff, 2);
  assert.equal(previewEffect(B, 'bristle').label, 'status');
});

// These scene tests exercise the actual input/event sequence without a browser.
// Drawing is recorded so the regression is the visible beat, not a private flag.
globalThis.window = {};
globalThis.document = { body: { classList: { add() {}, remove() {} } } };
globalThis.localStorage = { setItem() {} };
const [{ register, gridCursor, commandCursor }, { R, LAYER }, { Scenes }, { Input }, { Atlas }, { Audio }, { UIx }, { S, defaults }] = await Promise.all([
  import('../src/battle/scene.js'), import('../src/core/renderer.js'), import('../src/core/scene.js'),
  import('../src/core/input.js'), import('../src/art/atlas.js'), import('../src/core/audio.js'),
  import('../src/core/bridge.js'), import('../src/state.js'),
]);

test('command and move cursors follow their visible grid, including short rows', () => {
  assert.equal(commandCursor(0, 'right'), 1, 'Bond is beside Fight');
  assert.equal(commandCursor(4, 'right'), 0);
  assert.equal(commandCursor(0, 'left'), 4);
  assert.equal(gridCursor(0, 4, 'down'), 2);
  assert.equal(gridCursor(2, 4, 'right'), 3);
  assert.equal(gridCursor(3, 4, 'up'), 1);
  assert.equal(gridCursor(1, 3, 'down'), 2);
  assert.equal(gridCursor(1, 2, 'down'), 0);
  assert.equal(gridCursor(0, 1, 'right'), 0);
});

function harness() {
  const texts = [], sprites = [];
  R.layer = (layer, draw) => { if (layer === LAYER.UI || layer === LAYER.ENTITY) draw(); };
  R.text = (s, x, y, options) => texts.push({ s: String(s), x, y, options });
  R.blit = (img, x, y, options) => sprites.push({ id: img.id, x, y, options });
  R.rect = R.stroke = R.glow = R.shake = R.silhouette = () => {};
  Object.defineProperty(R, 'ctx', { configurable: true, get: () => ({ save() {}, restore() {}, globalAlpha: 1 }) });
  Atlas.tryGet = name => name.startsWith('g.') ? { id: name, width: 80, height: 80 } : null;
  Atlas.has = () => false;
  UIx.panel = () => ({ ink: '#fff', sub: '#ccc', shadow: '#000' });
  UIx.fade = () => new Promise(() => {});
  Audio.sfx = () => {};
  Audio.hasSong = () => false;
  Object.assign(S, defaults());
  Bus.clear();
  Input.reset();
  while (Scenes.stack.length) Scenes.pop();
  register();
  const frame = scene => { Input.runScripted(); scene.update(); Input.endFrame(); };
  const press = (scene, key) => { Input.script(key, 1); frame(scene); };
  const draw = scene => { texts.length = 0; sprites.length = 0; scene.render(); return { texts, sprites }; };
  return { frame, press, draw };
}

test('a knockout stays standing until its damage and faint events are presented', () => {
  const { frame, press, draw } = harness();
  const player = makeGuardian('embercub', 6), foe = makeGuardian('leafowl', 5);
  player.stats.atk = 999; player.stats.spe = 999; foe.hp = 1;
  S.party = [player];
  const scene = Scenes.push('battle', { foeGuardian: foe });
  for (let i = 0; i < 100; i++) frame(scene);
  press(scene, 'a'); // Fight
  press(scene, 'a'); // Cinder Nip, resolved immediately by the engine
  assert.equal(foe.hp, 0);
  let sprite = draw(scene).sprites.find(s => s.id === 'g.leafowl.front');
  assert.equal(sprite.options.alpha, 1, 'the foe must still be standing before the hit is shown');
  let sawHit = false, sawFaint = false;
  for (let i = 0; i < 150; i++) {
    frame(scene);
    const rendered = draw(scene);
    if (rendered.texts.some(line => /^-\d+$/.test(line.s))) sawHit = true;
    sprite = rendered.sprites.find(s => s.id === 'g.leafowl.front');
    if (sprite?.options?.alpha < 1) { sawFaint = true; break; }
  }
  assert.ok(sawHit, 'damage gets visible numeric feedback');
  assert.ok(sawFaint, 'the faint animation follows that damage');
  Scenes.pop();
});

// Pick real deterministic engine outcomes, then drive the scene's public inputs.
// No presentation-only outcome override or guaranteed-capture path is involved.
function bondFixture(ok, beats) {
  for (let seed = 1; seed < 1000; seed++) {
    const player = makeGuardian('embercub', 6), foe = makeGuardian('leafowl', 5);
    foe.hp = 1;
    const B = newBattle({ party: [player], foe, seed });
    chooseAction(B, 'player', { type: 'bond', charm: 'charm' });
    chooseAction(B, 'foe', aiAction(B, 'foe'));
    const events = stepTurn(B);
    const attempt = events.find(e => e.k === 'bond-try');
    if (events.some(e => e.k === 'bond-ok') === ok && (beats === undefined || attempt.beats === beats)) {
      return { seed, result: events.find(e => e.k === (ok ? 'bond-ok' : 'bond-fail')) };
    }
  }
  throw Error('No deterministic bonding fixture found');
}

function startBondBattle(h, fixture, size = 1) {
  S.party = Array.from({ length: size }, (_, i) => makeGuardian('embercub', 6, { id: `g${i + 1}` }));
  const foe = makeGuardian('leafowl', 5); foe.hp = 1;
  const now = Date.now;
  let scene;
  try {
    Date.now = () => fixture.seed ^ S.seed;
    scene = Scenes.push('battle', { foeGuardian: foe });
  } finally { Date.now = now; }
  for (let i = 0; i < 100; i++) h.frame(scene);
  h.press(scene, 'right'); h.press(scene, 'a');
  assert.ok(h.draw(scene).texts.some(line => line.s.includes('Offer charm')));
  return scene;
}

test('Bond is discoverable, reports the real chance, and cannot spend an empty bag', () => {
  const h = harness();
  const scene = startBondBattle(h, bondFixture(true));
  const foe = makeGuardian('leafowl', 5, { hp: 1 });
  const expected = bondPreview(foe, { playerLevel: 6, charm: 'charm', villageLevel: 1, streak: 0 });
  assert.ok(h.draw(scene).texts.some(line => line.s === `${expected.percent}% chance`));
  S.bag.charm = 0;
  h.press(scene, 'a');
  for (let i = 0; i < 100; i++) h.frame(scene);
  assert.equal(S.bag.charm, 0);
  assert.equal(S.party.length, 1);
  assert.ok(h.draw(scene).texts.some(line => line.s === 'No Woven Charms left'));
  h.press(scene, 'b');
  assert.deepEqual(h.draw(scene).texts.slice(-5).map(line => line.s), ['Fight', 'Bond', 'Team', 'Bag', 'Run']);
  Scenes.pop();
});

for (const size of [1, 6]) test(`a new bond stays visible and joins the ${size === 1 ? 'travelling team' : 'home roster'} once`, () => {
  const h = harness(), fixture = bondFixture(true);
  const scene = startBondBattle(h, fixture, size);
  const caught = [];
  Bus.on(EV.GUARDIAN_CAUGHT, event => caught.push(event));
  const charms = S.bag.charm;
  h.press(scene, 'a');
  let waiting = 0, welcome = 0;
  for (let i = 0; i < 400; i++) {
    h.frame(scene);
    const rendered = h.draw(scene);
    if (rendered.texts.some(line => line.s.includes('considering your offer'))) waiting++;
    if (rendered.texts.some(line => line.s.startsWith('Welcome,'))) {
      welcome++;
      const sprite = rendered.sprites.find(s => s.id === 'g.leafowl.front');
      assert.ok(sprite, 'the Guardian stays in the clearing after accepting');
      assert.equal(sprite.options.alpha, 1);
      assert.ok(rendered.texts.some(line => line.s.includes(size === 1 ? 'travelling' : 'Guardians > At home')));
    }
  }
  assert.ok(waiting >= 60, 'the offer has time for its four heartbeat cues');
  assert.ok(welcome >= 40, 'the new companion and its destination are readable');
  assert.equal(S.bag.charm, charms - 1);
  assert.equal(S.hearth, fixture.result.hearth);
  assert.equal(caught.length, 1);
  assert.equal(caught[0].destination, size === 1 ? 'party' : 'box');
  const roster = size === 1 ? S.party : S.box;
  assert.equal(roster.at(-1).species, 'leafowl');
  assert.equal(roster.at(-1).hp, roster.at(-1).maxhp);
  assert.equal(S.party.length, size === 1 ? 2 : 6);
  assert.equal(S.seen.leafowl, 'bonded');
  Scenes.pop();
});

test('a declined offer consumes one charm, preserves its near-miss reward, and returns to commands', () => {
  const h = harness(), fixture = bondFixture(false, 3);
  const scene = startBondBattle(h, fixture);
  const charms = S.bag.charm;
  h.press(scene, 'a');
  for (let i = 0; i < 500; i++) h.frame(scene);
  assert.equal(S.bag.charm, charms - 1);
  assert.equal(S.hearth, fixture.result.hearth);
  assert.equal(S.hearth, 1);
  assert.equal(S.party.length, 1);
  assert.equal(S.box.length, 0);
  assert.equal(S.seen.leafowl, 'seen');
  assert.deepEqual(h.draw(scene).texts.slice(-5).map(line => line.s), ['Fight', 'Bond', 'Team', 'Bag', 'Run']);
  Scenes.pop();
});

test('a full travelling and home roster blocks both Bond and Bag offers without spending a charm', () => {
  const h = harness();
  const scene = startBondBattle(h, bondFixture(true), 6);
  S.box = Array.from({ length: 200 }, (_, i) => makeGuardian('leafowl', 5, { id: `g${i + 7}` }));
  const guardians = JSON.stringify([...S.party, ...S.box]);
  const charms = S.bag.charm;
  let caught = 0;
  Bus.on(EV.GUARDIAN_CAUGHT, () => caught++);
  h.press(scene, 'a');
  for (let i = 0; i < 120; i++) h.frame(scene);
  assert.ok(h.draw(scene).texts.some(line => line.s === 'Roster full'));
  assert.equal(S.bag.charm, charms);
  assert.equal(JSON.stringify([...S.party, ...S.box]), guardians);
  h.press(scene, 'b'); // Bond -> commands, cursor stays at Bond
  h.press(scene, 'right'); h.press(scene, 'right'); h.press(scene, 'a'); // Bag
  assert.ok(h.draw(scene).texts.some(line => line.s === 'Woven Charm'));
  h.press(scene, 'a');
  assert.ok(h.draw(scene).texts.some(line => line.s.includes('No charm was used')));
  for (let i = 0; i < 200; i++) h.frame(scene);
  assert.equal(S.bag.charm, charms);
  assert.equal(JSON.stringify([...S.party, ...S.box]), guardians);
  assert.equal(S.hearth, 0);
  assert.equal(caught, 0);
  Scenes.pop();
});

test('reduced motion keeps Guardians still while the bond offer remains readable', () => {
  const h = harness();
  S.settings.reducedMotion = true;
  const scene = startBondBattle(h, bondFixture(true));
  h.press(scene, 'a');
  let first = null, samples = 0;
  for (let i = 0; i < 250; i++) {
    h.frame(scene);
    const rendered = h.draw(scene);
    if (!rendered.texts.some(line => line.s.includes('considering your offer'))) continue;
    const sprite = rendered.sprites.find(s => s.id === 'g.leafowl.front');
    const pose = [sprite.x, sprite.y, sprite.options.alpha];
    if (!first) first = pose;
    assert.deepEqual(pose, first);
    samples++;
  }
  assert.ok(samples >= 60);
  Scenes.pop();
});

test('an exhausted party can choose Struggle and complete another turn', () => {
  const { frame, press, draw } = harness();
  const player = makeGuardian('embercub', 6);
  player.moves.forEach(slot => { slot.focus = 0; });
  S.party = [player];
  const scene = Scenes.push('battle', { foeGuardian: makeGuardian('terranox', 6) });
  for (let i = 0; i < 100; i++) frame(scene);
  press(scene, 'a');
  assert.ok(draw(scene).texts.some(line => line.s === 'Struggle'));
  press(scene, 'a');
  let usedFallback = false;
  for (let i = 0; i < 100; i++) {
    frame(scene);
    if (draw(scene).texts.some(line => line.s.includes('used Struggle'))) { usedFallback = true; break; }
  }
  assert.ok(usedFallback, 'Fight must remain usable without focus');
  Scenes.pop();
});
