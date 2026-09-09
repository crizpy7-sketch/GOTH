import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = {};
globalThis.localStorage = { setItem() {}, getItem() { return null; } };
const [{ Npc }, { S, defaults }, { UIx, Hooks }, { Audio }] = await Promise.all([
  import('../src/world/npc.js'), import('../src/state.js'),
  import('../src/core/bridge.js'), import('../src/core/audio.js'),
]);

function harness(t, who, { flags = {}, level = 1, party = [], box = [] } = {}) {
  Object.assign(S, defaults());
  Object.assign(S.flags, flags);
  S.party = party; S.box = box;
  const scenes = [], says = [], asks = [], saves = [], grants = [], talks = [];
  let perform = async () => ({ completed: true, choice: -1 });
  t.mock.method(Audio, 'sfx', () => {});
  t.mock.method(Hooks.village, 'level', () => level);
  t.mock.method(Hooks.missions, 'note', (...args) => { talks.push(args); });
  t.mock.method(Hooks.battle, 'grantStarter', id => {
    grants.push(id);
    const guardian = { id: 'g1', species: id, hp: 20, maxhp: 20 };
    S.party.push(guardian);
    return guardian;
  });
  t.mock.method(UIx, 'say', async (text, options) => { says.push({ text, options }); });
  t.mock.method(UIx, 'ask', async (...args) => { asks.push(args); return -1; });
  const priorStory = Object.getOwnPropertyDescriptor(UIx, 'story');
  Object.defineProperty(UIx, 'story', { configurable: true, writable: true, value: async options => {
    scenes.push(options);
    return await perform(options);
  } });
  t.after(() => {
    if (priorStory) Object.defineProperty(UIx, 'story', priorStory);
    else delete UIx.story;
  });
  t.mock.method(localStorage, 'setItem', (key, raw) => { saves.push(JSON.parse(raw)); });
  const npc = new Npc({ who, x: 5, y: 4 }, { solid: () => false });
  return { npc, scenes, says, asks, saves, grants, talks,
    perform(fn) { perform = fn; },
  };
}

test('Gran keeps introduction, starter choice and welcome in one story, granting and persisting exactly once', async t => {
  const h = harness(t, 'gran');
  h.perform(async options => {
    assert.deepEqual(options.choices.map(c => c.id), ['embercub', 'leafowl', 'aquarabbit']);
    assert.ok(options.choices.every(c => c.label && c.detail));
    const welcome = await options.onChoose(2);
    assert.equal(S.flags.gotStarter, true, 'the committed gift exists before its welcome is presented');
    assert.equal(S.flags['story.granHearth'], undefined, 'reading the welcome still remains');
    assert.equal(h.saves.at(-1).party[0].species, 'aquarabbit');
    assert.equal(welcome.guardian, 'aquarabbit');
    assert.ok(welcome.lines.some(line => line.includes('Aquarabbit')));
    assert.deepEqual(await options.onChoose(2), welcome, 'a repeated callback reuses its receipt');
    return { completed: true, choice: 2 };
  });
  await h.npc.interact();
  assert.equal(h.scenes.length, 1);
  assert.deepEqual(h.grants, ['aquarabbit']);
  assert.equal(S.party.length, 1);
  assert.equal(S.flags['story.granHearth'], true);
  assert.equal(h.saves.at(-1).flags['story.granHearth'], true);
  assert.deepEqual(h.says, []);
  assert.deepEqual(h.asks, []);
  assert.deepEqual(h.talks, [['talk', { who: 'gran' }]]);
  assert.equal(h.npc.talking, false);

  await h.npc.interact();
  assert.equal(h.scenes.length, 1, 'repeat Gran chats are ordinary dialogue');
  assert.equal(h.says.length, 2);
  assert.equal(h.grants.length, 1);
});

test('cancelling before choosing gives nothing, leaves the welcome unfinished and permits retry', async t => {
  const h = harness(t, 'gran');
  h.perform(async () => ({ completed: false, choice: -1 }));
  await h.npc.interact();
  assert.deepEqual(S.party, []);
  assert.deepEqual(S.flags, {});
  assert.equal(h.grants.length, 0);
  assert.equal(h.saves.length, 0);
  assert.equal(h.talks.length, 1);
  h.perform(async options => {
    await options.onChoose(0);
    return { completed: true, choice: 0 };
  });
  await h.npc.interact();
  assert.deepEqual(h.grants, ['embercub']);
  assert.equal(S.flags.gotStarter, true);
  assert.equal(S.flags['story.granHearth'], true);
});

test('interrupting after a committed starter preserves the gift and resumes as a reunion without another gift', async t => {
  const h = harness(t, 'gran');
  h.perform(async options => {
    await options.onChoose(1);
    return { completed: false, choice: 1 };
  });
  await h.npc.interact();
  assert.equal(S.flags.gotStarter, true);
  assert.equal(S.flags['story.granHearth'], undefined);
  h.perform(async options => {
    assert.equal(options.choices, undefined);
    assert.equal(options.title, 'Room for you both');
    return { completed: true, choice: -1 };
  });
  await h.npc.interact();
  assert.deepEqual(h.grants, ['leafowl']);
  assert.equal(S.party.length, 1);
  assert.equal(S.flags['story.granHearth'], true);
});

for (const destination of ['party', 'box']) {
  test(`a legacy save with a Guardian in ${destination} receives one reunion and preserves its companion`, async t => {
    const guardian = { id: 'old-companion', species: 'leafowl', hp: 7, maxhp: 20 };
    const h = harness(t, 'gran', { [destination]: [guardian] });
    await h.npc.interact();
    assert.equal(S.flags.gotStarter, true, 'old companion saves cannot receive a duplicate starter');
    assert.equal(S.flags['story.granHearth'], true);
    assert.equal(h.scenes[0].title, 'Room for you both');
    assert.equal(h.scenes[0].choices, undefined);
    assert.equal(S[destination][0], guardian);
    assert.equal(guardian.hp, 7, 'a reunion does not reset a saved companion');
    assert.equal(h.grants.length, 0);
    await h.npc.interact();
    assert.equal(h.scenes.length, 1);
    assert.ok(h.says.length > 0);
  });
}

test('failed starter creation does not consume the welcome or mark a starter granted', async t => {
  const h = harness(t, 'gran');
  t.mock.method(Hooks.battle, 'grantStarter', () => null);
  h.perform(async options => {
    const response = await options.onChoose(0);
    assert.equal(response.guardian, undefined);
    return { completed: true, choice: 0 };
  });
  await h.npc.interact();
  assert.deepEqual(S.flags, {});
  assert.deepEqual(S.party, []);
  assert.equal(h.saves.length, 0);
});

test('Mayor introduction and reflection retain old progress and only commit after a completed story', async t => {
  const h = harness(t, 'mayor');
  h.perform(async () => ({ completed: false, choice: -1 }));
  await h.npc.interact();
  assert.deepEqual(S.flags, {});
  assert.equal(h.saves.length, 0);
  h.perform(async options => {
    assert.ok(options.lines[0].includes('Welcome to Emberhollow'));
    return { completed: true, choice: -1 };
  });
  await h.npc.interact();
  assert.equal(S.flags.metMayor, true);
  assert.equal(S.flags['story.mayorWelcome'], true);
  await h.npc.interact();
  assert.equal(h.scenes.length, 2);
  assert.equal(h.says.length, 1);
  assert.equal(h.talks.length, 3, 'each interaction counts once regardless of story page count');
});

test('a Mayor already met on an older save reflects on progress once without reintroducing the player', async t => {
  const h = harness(t, 'mayor', { flags: { metMayor: true } });
  await h.npc.interact();
  assert.ok(h.scenes[0].lines[0].includes('empty windows'));
  assert.ok(h.scenes[0].lines.every(line => !line.includes('You must be')));
  assert.equal(S.flags.metMayor, true);
  assert.equal(S.flags['story.mayorWelcome'], true);
  await h.npc.interact();
  assert.equal(h.scenes.length, 1);
});

test('the village renewal scene is reserved for Level 4 and plays only once', async t => {
  for (const level of [3, 4]) {
    await t.test(`Level ${level}`, async sub => {
      const h = harness(sub, 'mayor', { level, flags: { metMayor: true, 'story.mayorWelcome': true } });
      await h.npc.interact();
      if (level === 3) {
        assert.equal(h.scenes.length, 0);
        assert.equal(S.flags['story.mayorRenewal'], undefined);
      } else {
        assert.equal(h.scenes[0].title, 'The windows are warm again');
        assert.equal(S.flags['story.mayorRenewal'], true);
        await h.npc.interact();
        assert.equal(h.scenes.length, 1);
      }
    });
  }
});

test('the first rival meeting is cinematic and completed progress prevents replay', async t => {
  const h = harness(t, 'rival');
  await h.npc.interact();
  assert.equal(h.scenes[0].portrait, 'rival');
  assert.equal(h.scenes[0].setting, 'forest');
  assert.ok(h.scenes[0].lines.every(line => !line.includes('your Guardian')),
    'a player who reaches the woods before choosing a starter is not assigned an imaginary companion');
  assert.equal(S.flags.metRival, true);
  assert.equal(S.flags['story.rivalMeeting'], true);
  await h.npc.interact();
  assert.equal(h.scenes.length, 1);
  assert.equal(h.says.length, 1);
});

test('ordinary NPCs and a previously met rival keep their quick conversations', async t => {
  for (const who of ['smith', 'kid', 'ranger', 'rival']) {
    await t.test(who, async sub => {
      const h = harness(sub, who, { flags: { metRival: true } });
      await h.npc.interact();
      assert.equal(h.scenes.length, 0);
      assert.ok(h.says.length > 0);
      assert.equal(h.talks.length, 1);
    });
  }
});

test('another interaction while a story is open cannot open a second scene or duplicate mission credit', async t => {
  const h = harness(t, 'gran', { flags: { gotStarter: true } });
  let finish;
  h.perform(() => new Promise(resolve => { finish = resolve; }));
  const first = h.npc.interact();
  assert.equal(h.npc.talking, true);
  await h.npc.interact();
  assert.equal(h.scenes.length, 1);
  finish({ completed: true, choice: -1 });
  await first;
  assert.equal(h.npc.talking, false);
  assert.equal(h.talks.length, 1);
});
