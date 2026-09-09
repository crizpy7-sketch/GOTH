import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = {};
globalThis.localStorage = { setItem() {}, getItem() { return null; } };
const [{ Npc }, { S, defaults }, { UIx, Hooks }, { Audio }] = await Promise.all([
  import('../src/world/npc.js'), import('../src/state.js'),
  import('../src/core/bridge.js'), import('../src/core/audio.js'),
]);

function shop(t, picks, coins = 120) {
  Object.assign(S, defaults()); S.coins = coins;
  const asks = [], says = [], saves = [];
  const npc = new Npc({ who: 'peddler', x: 24, y: 20 }, { solid: () => false });
  t.mock.method(Audio, 'sfx', () => {});
  t.mock.method(Hooks.missions, 'note', () => {});
  t.mock.method(UIx, 'ask', async (text, choices, options) => {
    asks.push({ text, choices, options });
    assert.ok(picks.length, 'the shop must stop after cancellation');
    return picks.shift();
  });
  t.mock.method(UIx, 'say', async (text, options) => { says.push({ text, options }); });
  t.mock.method(localStorage, 'setItem', (key, raw) => { saves.push(JSON.parse(raw)); });
  return { npc, asks, says, saves };
}

for (const [pick, item, cost] of [[0, 'charm', 12], [1, 'salve', 18]]) {
  test(`Cobb adds one ${item}, charges its price once, and saves the completed purchase once`, async t => {
    const h = shop(t, [pick, 2]);
    const before = S.bag[item];
    await h.npc.interact();
    assert.equal(S.coins, 120 - cost);
    assert.equal(S.bag[item], before + 1);
    assert.equal(S.village.ledger.length, 1);
    assert.equal(S.village.ledger[0].coins, -cost);
    assert.equal(h.saves.length, 1);
    assert.equal(h.saves[0].bag[item], before + 1);
    assert.equal(h.saves[0].coins, 120 - cost);
    assert.ok(h.asks[0].choices[pick].includes(`${before} in bag`));
    assert.ok(h.asks[1].choices[pick].includes(`${before + 1} in bag`));
    assert.ok(h.asks[1].text.includes(`${120 - cost} coins`));
    assert.equal(h.npc.talking, false);
  });
}

test('leaving or cancelling Cobb’s stall changes no inventory or money and does not save', async t => {
  for (const pick of [-1, 2]) {
    await t.test(String(pick), async sub => {
      const h = shop(sub, [pick]);
      const before = JSON.stringify({ coins: S.coins, bag: S.bag, village: S.village });
      await h.npc.interact();
      assert.equal(JSON.stringify({ coins: S.coins, bag: S.bag, village: S.village }), before);
      assert.equal(h.saves.length, 0);
    });
  }
});

test('insufficient coins explain the exact shortfall and leave the player’s money and inventory intact', async t => {
  const h = shop(t, [0, 2], 11);
  const before = { ...S.bag };
  await h.npc.interact();
  assert.equal(S.coins, 11);
  assert.deepEqual(S.bag, before);
  assert.equal(S.village.ledger, undefined);
  assert.equal(h.saves.length, 0);
  assert.ok(h.says.some(row => row.text === 'Woven Charm costs 12 coins. You need 1 more.'));
});

test('each explicit repeat purchase refreshes stock and charges exactly once', async t => {
  const h = shop(t, [0, 0, -1], 24);
  const before = S.bag.charm;
  await h.npc.interact();
  assert.equal(S.coins, 0);
  assert.equal(S.bag.charm, before + 2);
  assert.equal(h.saves.length, 2);
  assert.equal(S.village.ledger.length, 2);
  assert.ok(h.asks.at(-1).text.includes('0 coins'));
});
