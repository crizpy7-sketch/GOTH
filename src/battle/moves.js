// The move catalogue, the type chart, and the four statuses.
//
// PURE MODULE — no DOM, no imports outside battle/. Node-testable.
//
// ============================================================================
//  THE HEARTH TYPE CHART  (ours, not anybody else's)
// ============================================================================
//
//  Two rings and a rare ninth type. Everything below is 2.0x one way and 0.5x
//  the other way, so "the thing that beats me also shrugs off my attacks" is a
//  single rule the player can feel out in three battles.
//
//  PRIMARY RING (five, the workhorse cycle):
//
//      ember ─▶ leaf ─▶ stone ─▶ spark ─▶ tide ─▶ ember
//       fire burns the bough · roots split the rock · rock grounds the bolt
//       the bolt boils the water · the water drowns the fire
//
//  SECONDARY RING (three, the mood cycle):
//
//      gale ─▶ bloom ─▶ dusk ─▶ gale
//       the gale strips the petals · the blossom opens against the dark
//       the dark stills the wind
//
//  BRIDGES (the off-diagonal spice — this is where the chart gets interesting):
//      ember ─▶ gale     a breeze only ever feeds a fire
//      gale  ─▶ leaf     a hard wind strips the boughs bare
//      bloom ─▶ tide     roots drink the tide dry
//      stone ─▶ bloom    stony ground starves a blossom
//      leaf  ─▶ tide     the thicket soaks up the flood
//      tide  ─▶ hearth   water drowns a hearth
//
//  HEARTH (the village-affinity type — rare, only the Hearthling line has it):
//      hearth ◀─▶ dusk   MUTUAL 2.0x. This is deliberate: the Hearthling and the
//                        drake line are written as rivals, so that matchup is a
//                        coin-flip knife fight rather than a wall.
//      hearth resists ember, leaf and bloom (0.5x) — the homely elements can't
//      hurt a hearth. It is otherwise neutral into everything, which is what
//      makes it a safe, kind pick for a first guardian.
//
//  FLAVOUR RESISTANCES (0.5x, on top of the reverse-of-strong rule):
//      ember → stone   rock does not burn
//      gale  → stone   wind does not move a boulder
//      dusk  → dusk    shadows simply blend
//      spark → spark   a charged hide shrugs off a bolt
//      leaf  → leaf    bark against bark
//
//  There are NO immunities (0x). Being unable to act at all is not fun, and a
//  0.5x floor keeps every guardian usable in every fight.
//
//  Resulting balance — weaknesses per type:
//      ember 1 (tide)            leaf 2 (ember, gale)
//      tide 3 (leaf,spark,bloom) stone 2 (leaf, dusk)
//      gale 2 (ember, dusk)      spark 1 (stone)
//      bloom 3 (ember,stone,gale) dusk 3 (bloom, spark, hearth)
//      hearth 2 (tide, dusk)
//  ember / spark / hearth are the sturdy ones; tide / bloom / dusk hit hard and
//  bruise easily. The three starters form their own clean triangle:
//      ember ▶ leaf ▶ tide ▶ ember.
// ============================================================================

export const TYPES = ['ember', 'leaf', 'tide', 'stone', 'gale', 'spark', 'bloom', 'dusk', 'hearth'];

/** att -> defenders it hits for 2.0x. */
export const STRONG = {
  ember:  ['leaf', 'bloom', 'gale'],
  leaf:   ['stone', 'tide'],
  tide:   ['ember', 'hearth'],
  stone:  ['spark', 'bloom'],
  gale:   ['bloom', 'leaf'],
  spark:  ['tide', 'dusk'],
  bloom:  ['dusk', 'tide'],
  dusk:   ['gale', 'stone', 'hearth'],
  hearth: ['dusk'],
};

/** Extra 0.5x on top of the automatic reverse-of-STRONG resistances. */
export const EXTRA_RESIST = {
  ember: ['stone'],
  gale:  ['stone'],
  dusk:  ['dusk'],
  spark: ['spark'],
  leaf:  ['leaf'],
  hearth: [],
};
/** Defenders that soften these attacking types (the hearth's homely armour). */
const HEARTH_RESISTS = ['ember', 'leaf', 'bloom'];

// Realised once at load so the hot path is a two-key lookup, never a search.
const CHART = (() => {
  const m = {};
  for (const a of TYPES) {
    m[a] = {};
    for (const d of TYPES) m[a][d] = 1;
  }
  for (const a of TYPES) for (const d of STRONG[a] || []) m[a][d] = 2;
  // reverse-of-strong: attacking into your own predator is resisted
  for (const a of TYPES) for (const d of STRONG[a] || []) {
    if (m[d][a] === 1) m[d][a] = 0.5;
  }
  for (const a of TYPES) for (const d of EXTRA_RESIST[a] || []) m[a][d] = 0.5;
  for (const a of HEARTH_RESISTS) if (m[a].hearth === 1) m[a].hearth = 0.5;
  return m;
})();

export function typeMult(att, def) {
  const row = CHART[att];
  if (!row) return 1;
  const v = row[def];
  return v === undefined ? 1 : v;
}
/** Combined multiplier against a (possibly dual-typed) defender. */
export function effectiveness(att, defTypes) {
  let m = 1;
  for (const d of defTypes) m *= typeMult(att, d);
  return m;
}
export const effLabel = m =>
  m >= 2 ? 'super' : m > 1 ? 'good' : m === 1 ? 'neutral' : m > 0 ? 'weak' : 'none';

// ============================================================================
//  STATUSES — ours: scorch, tangle, soaked, dazzled.
//  All four are timed (3-5 turns) and all four clear when the battle ends. This
//  game is meant to feel kind: nothing follows you out of a fight.
// ============================================================================
export const STATUS = {
  scorch:  { id: 'scorch',  name: 'Scorch',  tag: 'SCH', color: '#ef6b2a',
             blurb: 'singed — loses a little heart each turn and hits softer' },
  tangle:  { id: 'tangle',  name: 'Tangle',  tag: 'TNG', color: '#4f8b31',
             blurb: 'bound up — much slower, and sometimes cannot move' },
  soaked:  { id: 'soaked',  name: 'Soaked',  tag: 'SOK', color: '#2b7fae',
             blurb: 'drenched — guards weakly and conducts spark' },
  dazzled: { id: 'dazzled', name: 'Dazzled', tag: 'DAZ', color: '#e8b52c',
             blurb: 'seeing spots — moves fizzle out about a third of the time' },
};
export const STATUS_IDS = Object.keys(STATUS);

/** Numbers the engine reads. Keep them here so tuning is one file. */
export const RULES = {
  scorchTick: 1 / 16,      // fraction of max HP lost at end of turn
  scorchAtk: 0.75,         // physical attack multiplier while scorched
  tangleSpeed: 0.5,
  tangleSkip: 0.25,        // chance to lose the turn
  soakedDef: 0.75,
  soakedSparkTaken: 1.25,
  dazzledFizzle: 1 / 3,
  statusTurns: [3, 5],     // inclusive range rolled on application
  critChance: 1 / 16,
  critHighChance: 1 / 8,
  critMult: 1.75,
  stab: 1.5,
  randLo: 0.85,
  minDamage: 1,
};

// ============================================================================
//  MOVES
//  cat: 'physical' (atk vs def) | 'spirit' (spa vs spd) | 'status'
//  focus: our PP. Running out of focus on every move falls back to Struggle.
//  anim.fx  — an fx.* name from art/names.js
//  anim.style — how battle/scene.js stages it:
//      'burst'      bloom of particles on the target
//      'projectile' particles travel attacker -> target
//      'slash'      a quick cross-cut over the target
//      'wave'       a horizontal sweep across the target
//      'self'       plays on the user (buffs, heals, charges)
//      'beam'       a bright line drawn from user to target
//  fx — declarative effects the engine interprets (see applyMoveEffects).
// ============================================================================
const M = [];
const move = (id, name, type, cat, o = {}) => {
  M.push({
    id, name, type, cat,
    power: o.power || 0,
    acc: o.acc === undefined ? 100 : o.acc,   // null = never misses
    pri: o.pri || 0,
    focus: o.focus || 20,
    anim: o.anim || { fx: 'fx.impact', style: 'burst', shake: 2 },
    fx: o.fx || null,
    desc: o.desc || '',
  });
};

// ---- EMBER ----------------------------------------------------------------
move('cinder_nip', 'Cinder Nip', 'ember', 'physical', {
  power: 40, focus: 30, anim: { fx: 'fx.ember', style: 'burst', shake: 2 },
  desc: 'A quick singeing nip.' });
move('bristle', 'Bristle', 'ember', 'status', {
  focus: 25, anim: { fx: 'fx.sparkle', style: 'self' },
  fx: { stat: [{ stat: 'atk', delta: 1, target: 'self' }] },
  desc: 'Fluffs up. Raises the user\'s Attack.' });
move('flare', 'Flare', 'ember', 'spirit', {
  power: 60, acc: 95, focus: 20, anim: { fx: 'fx.ember', style: 'projectile', shake: 3 },
  fx: { status: { id: 'scorch', chance: 0.15 } },
  desc: 'A curl of flame that sometimes scorches.' });
move('scorch_mark', 'Scorch Mark', 'ember', 'status', {
  acc: 90, focus: 15, anim: { fx: 'fx.ember', style: 'burst' },
  fx: { status: { id: 'scorch', chance: 1 } },
  desc: 'Brands the foe. Always scorches.' });
move('blaze_rush', 'Blaze Rush', 'ember', 'physical', {
  power: 95, acc: 90, focus: 10, anim: { fx: 'fx.ember', style: 'slash', shake: 5 },
  fx: { recoil: 0.25 },
  desc: 'A headlong charge. The user takes a quarter of the damage dealt.' });
move('sunflare', 'Sun Flare', 'ember', 'spirit', {
  power: 115, acc: 90, focus: 5, anim: { fx: 'fx.ring', style: 'beam', shake: 6 },
  fx: { charge: 'basks in the light' },
  desc: 'Gathers light for a turn, then lets go.' });
move('sunspire', 'Sunspire', 'ember', 'spirit', {
  power: 100, acc: 95, focus: 5, anim: { fx: 'fx.ring', style: 'burst', shake: 6 },
  fx: { status: { id: 'scorch', chance: 0.3 } },
  desc: 'PYRELION\'S OWN. A pillar of dawn-fire.' });

// ---- LEAF -----------------------------------------------------------------
move('leaf_dart', 'Leaf Dart', 'leaf', 'physical', {
  power: 40, focus: 30, anim: { fx: 'fx.leaf', style: 'projectile', shake: 2 },
  desc: 'Flicks a stiff leaf like a blade.' });
move('thornlash', 'Thornlash', 'leaf', 'physical', {
  power: 65, acc: 95, focus: 20, anim: { fx: 'fx.slash', style: 'slash', shake: 3 },
  fx: { status: { id: 'tangle', chance: 0.1 } },
  desc: 'A whipping vine that can snag.' });
move('bindvine', 'Bindvine', 'leaf', 'status', {
  acc: 90, focus: 20, anim: { fx: 'fx.leaf', style: 'burst' },
  fx: { status: { id: 'tangle', chance: 1 } },
  desc: 'Roots wind round the foe. Always tangles.' });
move('canopy_crash', 'Canopy Crash', 'leaf', 'physical', {
  power: 90, acc: 85, focus: 10, anim: { fx: 'fx.leaf', style: 'burst', shake: 5 },
  fx: { stat: [{ stat: 'def', delta: -1, target: 'self' }] },
  desc: 'Drops the whole canopy. Leaves the user open.' });
move('bough_embrace', 'Bough Embrace', 'leaf', 'physical', {
  power: 85, focus: 10, anim: { fx: 'fx.leaf', style: 'wave', shake: 4 },
  fx: { stat: [{ stat: 'def', delta: 1, target: 'self' }] },
  desc: 'GROVEWING\'S OWN. Strikes and settles into a guard.' });

// ---- TIDE -----------------------------------------------------------------
move('droplet', 'Droplet', 'tide', 'spirit', {
  power: 40, focus: 30, anim: { fx: 'fx.bubble', style: 'projectile', shake: 2 },
  desc: 'A single well-aimed bead of water.' });
move('undertow', 'Undertow', 'tide', 'status', {
  focus: 20, anim: { fx: 'fx.bubble', style: 'wave' },
  fx: { stat: [{ stat: 'spe', delta: -1, target: 'foe' }] },
  desc: 'Drags at the foe\'s footing. Lowers Speed.' });
move('brinespray', 'Brine Spray', 'tide', 'spirit', {
  power: 60, focus: 20, anim: { fx: 'fx.splash', style: 'wave', shake: 3 },
  fx: { status: { id: 'soaked', chance: 0.2 } },
  desc: 'A stinging spray that can soak.' });
move('tidebreak', 'Tidebreak', 'tide', 'spirit', {
  power: 90, acc: 90, focus: 10, anim: { fx: 'fx.splash', style: 'burst', shake: 5 },
  desc: 'A wave that folds over the foe.' });
move('tidal_lull', 'Tidal Lull', 'tide', 'spirit', {
  power: 85, focus: 10, anim: { fx: 'fx.bubble', style: 'wave', shake: 4 },
  fx: { status: { id: 'soaked', chance: 1 } },
  desc: 'TORRENTIDE\'S OWN. A slow swell that always soaks.' });

// ---- STONE ----------------------------------------------------------------
move('pebble_toss', 'Pebble Toss', 'stone', 'physical', {
  power: 40, focus: 30, anim: { fx: 'fx.rock', style: 'projectile', shake: 2 },
  desc: 'Lobs a well-chosen pebble.' });
move('shell_up', 'Shell Up', 'stone', 'status', {
  focus: 20, anim: { fx: 'fx.sparkle', style: 'self' },
  fx: { stat: [{ stat: 'def', delta: 2, target: 'self' }] },
  desc: 'Tucks in hard. Raises Defence sharply.' });
move('stonecall', 'Stonecall', 'stone', 'physical', {
  power: 65, acc: 95, focus: 20, anim: { fx: 'fx.rock', style: 'burst', shake: 4 },
  desc: 'Calls loose stone down on the foe.' });
move('boulder_dive', 'Boulder Dive', 'stone', 'physical', {
  power: 100, acc: 85, focus: 10, anim: { fx: 'fx.rock', style: 'slash', shake: 6 },
  fx: { recoil: 1 / 3 },
  desc: 'A whole-body slam. Hurts to throw.' });
move('bedrock_vow', 'Bedrock Vow', 'stone', 'physical', {
  power: 95, focus: 10, anim: { fx: 'fx.rock', style: 'burst', shake: 6 },
  fx: { stat: [{ stat: 'def', delta: 1, target: 'self' }, { stat: 'spd', delta: 1, target: 'self' }] },
  desc: 'CRAGNOX\'S OWN. Strike, then set like bedrock.' });

// ---- GALE -----------------------------------------------------------------
move('gust_nip', 'Gust Nip', 'gale', 'physical', {
  power: 40, focus: 30, anim: { fx: 'fx.wind', style: 'wave', shake: 2 },
  desc: 'A snapping little crosswind.' });
move('quickstep', 'Quickstep', 'gale', 'physical', {
  power: 40, pri: 1, focus: 25, anim: { fx: 'fx.wind', style: 'slash', shake: 2 },
  desc: 'Always strikes first.' });
move('swiftshift', 'Swiftshift', 'gale', 'status', {
  focus: 20, anim: { fx: 'fx.wind', style: 'self' },
  fx: { stat: [{ stat: 'spe', delta: 2, target: 'self' }] },
  desc: 'Finds the draught. Raises Speed sharply.' });
move('wingflurry', 'Wingflurry', 'gale', 'physical', {
  power: 22, acc: 90, focus: 20, anim: { fx: 'fx.wind', style: 'slash', shake: 2 },
  fx: { hits: [2, 5] },
  desc: 'Two to five quick beats.' });
move('skyshear', 'Skyshear', 'gale', 'spirit', {
  power: 75, acc: 95, focus: 15, anim: { fx: 'fx.wind', style: 'beam', shake: 4 },
  fx: { status: { id: 'dazzled', chance: 0.2 } },
  desc: 'A thin blade of moving air.' });
move('hush_of_wings', 'Hush of Wings', 'gale', 'spirit', {
  power: 80, pri: 1, focus: 10, anim: { fx: 'fx.wind', style: 'wave', shake: 3 },
  desc: 'ZEPHYRIX\'S OWN. Silent, and always first.' });

// ---- SPARK ----------------------------------------------------------------
move('static_nip', 'Static Nip', 'spark', 'physical', {
  power: 40, focus: 30, anim: { fx: 'fx.spark', style: 'burst', shake: 2 },
  desc: 'A prickle of stored charge.' });
move('glimmer', 'Glimmer', 'spark', 'status', {
  acc: 95, focus: 20, anim: { fx: 'fx.sparkle', style: 'burst' },
  fx: { status: { id: 'dazzled', chance: 1 } },
  desc: 'A burst of light. Always dazzles.' });
move('arcbolt', 'Arcbolt', 'spark', 'spirit', {
  power: 65, focus: 20, anim: { fx: 'fx.spark', style: 'beam', shake: 3 },
  fx: { status: { id: 'dazzled', chance: 0.15 } },
  desc: 'A clean arc from paw to foe.' });
move('voltlash', 'Voltlash', 'spark', 'spirit', {
  power: 95, acc: 90, focus: 10, anim: { fx: 'fx.spark', style: 'beam', shake: 5 },
  desc: 'Lets the whole charge go at once.' });
move('thundermane', 'Thundermane', 'spark', 'spirit', {
  power: 95, acc: 90, focus: 5, anim: { fx: 'fx.spark', style: 'burst', shake: 6 },
  fx: { status: { id: 'dazzled', chance: 0.3 } },
  desc: 'VOLTMANE\'S OWN. The mane stands and the air cracks.' });

// ---- BLOOM ----------------------------------------------------------------
move('petal_brush', 'Petal Brush', 'bloom', 'physical', {
  power: 40, focus: 30, anim: { fx: 'fx.petal', style: 'wave', shake: 2 },
  desc: 'Sweeps the foe with soft, sharp petals.' });
move('sunbask', 'Sunbask', 'bloom', 'status', {
  focus: 10, anim: { fx: 'fx.sparkle', style: 'self' },
  fx: { heal: 0.5 },
  desc: 'Drinks the sun. Restores half the user\'s heart.' });
move('pollen_haze', 'Pollen Haze', 'bloom', 'status', {
  acc: 90, focus: 20, anim: { fx: 'fx.petal', style: 'burst' },
  fx: { status: { id: 'tangle', chance: 1 } },
  desc: 'Heavy pollen. Always tangles.' });
move('bloomburst', 'Bloomburst', 'bloom', 'spirit', {
  power: 70, focus: 15, anim: { fx: 'fx.petal', style: 'burst', shake: 4 },
  fx: { stat: [{ stat: 'spd', delta: -1, target: 'foe', chance: 0.3 }] },
  desc: 'Opens all at once. May soften the foe\'s Spirit guard.' });
move('radiant_bloom', 'Radiant Bloom', 'bloom', 'spirit', {
  power: 100, acc: 95, focus: 5, anim: { fx: 'fx.petal', style: 'burst', shake: 6 },
  fx: { status: { id: 'dazzled', chance: 0.2 } },
  desc: 'FLORADIANT\'S OWN. Every bud opens at the same instant.' });

// ---- DUSK -----------------------------------------------------------------
move('shade_nip', 'Shade Nip', 'dusk', 'physical', {
  power: 40, focus: 30, anim: { fx: 'fx.dusk', style: 'burst', shake: 2 },
  desc: 'Bites from the wrong side of the light.' });
move('dim_veil', 'Dim Veil', 'dusk', 'status', {
  focus: 20, anim: { fx: 'fx.dusk', style: 'wave' },
  fx: { stat: [{ stat: 'atk', delta: -1, target: 'foe' }] },
  desc: 'Draws the dark in. Lowers the foe\'s Attack.' });
move('nightbite', 'Nightbite', 'dusk', 'physical', {
  power: 65, focus: 20, anim: { fx: 'fx.slash', style: 'slash', shake: 3 },
  fx: { crit: 1 },
  desc: 'Finds the soft place. Lands critically often.' });
move('gloomsurge', 'Gloomsurge', 'dusk', 'spirit', {
  power: 90, acc: 90, focus: 10, anim: { fx: 'fx.dusk', style: 'beam', shake: 5 },
  fx: { drain: 0.5 },
  desc: 'Siphons half of what it deals back to the user.' });
move('duskbrand', 'Duskbrand', 'dusk', 'physical', {
  power: 95, focus: 5, anim: { fx: 'fx.dusk', style: 'slash', shake: 6 },
  fx: { status: { id: 'dazzled', chance: 0.2 } },
  desc: 'DRAKEMBER\'S OWN. A brand that leaves the eyes swimming.' });

// ---- HEARTH ---------------------------------------------------------------
move('warm_nuzzle', 'Warm Nuzzle', 'hearth', 'physical', {
  power: 40, focus: 30, anim: { fx: 'fx.heart', style: 'burst', shake: 2 },
  desc: 'A headbutt that somehow feels like a hug.' });
move('mend', 'Mend', 'hearth', 'status', {
  focus: 10, anim: { fx: 'fx.heart', style: 'self' },
  fx: { heal: 0.5, cure: true },
  desc: 'Restores half the user\'s heart and clears any ailment.' });
move('kindle_song', 'Kindle Song', 'hearth', 'status', {
  focus: 15, anim: { fx: 'fx.star', style: 'self' },
  fx: { stat: [{ stat: 'spa', delta: 1, target: 'self' }, { stat: 'spd', delta: 1, target: 'self' }] },
  desc: 'Hums the village song. Raises both Spirit stats.' });
move('hearthlight', 'Hearthlight', 'hearth', 'spirit', {
  power: 70, focus: 15, anim: { fx: 'fx.ring', style: 'beam', shake: 4 },
  desc: 'A steady, warm light with weight behind it.' });
move('hearthbond', 'Hearthbond', 'hearth', 'spirit', {
  power: 90, focus: 5, anim: { fx: 'fx.heart', style: 'beam', shake: 5 },
  fx: { drain: 0.5 },
  desc: 'HEARTHLING\'S OWN. Shares the warmth, and takes some back.' });

// ---- last resort ---------------------------------------------------------
move('struggle', 'Struggle', 'hearth', 'physical', {
  power: 40, acc: null, focus: 1, anim: { fx: 'fx.impact', style: 'slash', shake: 4 },
  fx: { recoil: 0.25, noStab: true, noType: true },
  desc: 'Thrown when there is no focus left for anything else.' });

export const MOVES = Object.freeze(Object.fromEntries(M.map(m => [m.id, Object.freeze(m)])));
export const MOVE_LIST = Object.freeze(M.map(m => m.id));
export const getMove = id => MOVES[id] || MOVES.struggle;
export const moveExists = id => !!MOVES[id];

/** Instance of a move as it lives on a guardian. */
export const makeMoveSlot = id => {
  const m = getMove(id);
  return { id: m.id, focus: m.focus, maxFocus: m.focus };
};
