// The eighteen guardians: stats, growth, learnsets, evolutions, bond rates, dex text,
// and the factory that turns a species id + level into a party member.
//
// PURE MODULE — no DOM. The only import outside battle/ is art/names.js, which is the
// canonical (foundation-owned) roster; reading it means battle can never invent an id
// or a sprite name that art doesn't know about.

import { GUARDIANS } from '../art/names.js';
import { getMove, makeMoveSlot, moveExists } from './moves.js';

// ---------------------------------------------------------------------------
//  stat + xp maths
// ---------------------------------------------------------------------------
// Level 5 starter: ~21 HP, ~10 attack.  Level 50 final stage: ~155 HP, ~110 attack.
// Those two anchors are what keep a level-5 fight at 3-5 turns and stop a level-50
// hit from one-shotting.
export const maxLevel = 100;

export const hpAt = (base, lvl) => Math.floor((2 * base + 30) * lvl / 100) + lvl + 10;
export const statAt = (base, lvl) => Math.floor((2 * base + 10) * lvl / 100) + 5;

const CURVE = { fast: 0.8, medium: 1, slow: 1.25 };
/** Total xp needed to *reach* `lvl` from level 1. */
export const xpTotal = (lvl, growth = 'medium') =>
  Math.floor((CURVE[growth] || 1) * Math.pow(Math.max(1, lvl), 3));
/** XP needed to go from `lvl` to `lvl+1`. `g.xp` counts up to this, then resets. */
export const xpNeeded = (lvl, growth = 'medium') =>
  lvl >= maxLevel ? Infinity : Math.max(1, xpTotal(lvl + 1, growth) - xpTotal(lvl, growth));

// ---------------------------------------------------------------------------
//  the roster
// ---------------------------------------------------------------------------
// base: [hp, atk, def, spa, spd, spe]
// bondRate: 0-255, the raw trust ceiling. High = takes to you easily.
// xpBase: how much a foe of this species is worth.
// evo: { to, level } | { to, level, bond } | { to, condition:'…' }
const S = [
  {
    id: 'embercub', base: [45, 52, 43, 60, 50, 65], growth: 'medium',
    bondRate: 100, xpBase: 62, evo: { to: 'emberlynx', level: 16 },
    dex: 'Sleeps curled in the ashes of a cold hearth. Its fur is always a little too warm to hold for long.',
    learn: {
      1: ['cinder_nip', 'bristle'], 4: ['pebble_toss'], 8: ['flare'],
      12: ['scorch_mark'], 16: ['quickstep'], 21: ['blaze_rush'], 27: ['sunflare'],
    },
  },
  {
    id: 'emberlynx', base: [60, 70, 55, 80, 65, 85], growth: 'medium',
    bondRate: 45, xpBase: 142, evo: { to: 'pyrelion', level: 34 },
    dex: 'Runs the ridge lines at dusk. Villagers leave a bowl of milk out and find it warm at dawn.',
    learn: {
      1: ['cinder_nip', 'bristle', 'flare'], 12: ['scorch_mark'], 16: ['quickstep'],
      22: ['blaze_rush'], 29: ['sunflare'], 36: ['stonecall'], 42: ['sunspire'],
    },
  },
  {
    id: 'pyrelion', base: [82, 95, 75, 105, 85, 100], growth: 'slow',
    bondRate: 25, xpBase: 232, evo: null,
    dex: 'The old bonfire-keeper of the high country. Where it lies down, spring comes early.',
    learn: {
      1: ['cinder_nip', 'flare', 'scorch_mark', 'sunspire'], 22: ['blaze_rush'],
      29: ['sunflare'], 36: ['stonecall'], 44: ['bedrock_vow'], 50: ['sunspire'],
    },
  },
  {
    id: 'leafowl', base: [50, 45, 50, 58, 55, 62], growth: 'medium',
    bondRate: 120, xpBase: 60, evo: { to: 'grovewing', level: 18 },
    dex: 'Its feathers are shaped like young beech leaves, so it vanishes the moment it stops moving.',
    learn: {
      1: ['leaf_dart', 'gust_nip'], 5: ['bindvine'], 9: ['thornlash'],
      13: ['swiftshift'], 18: ['wingflurry'], 24: ['canopy_crash'], 30: ['skyshear'],
    },
  },
  {
    id: 'grovewing', base: [72, 68, 75, 85, 80, 80], growth: 'medium',
    bondRate: 45, xpBase: 168, evo: null,
    dex: 'Nests only in trees older than the village. It remembers every path through the wood.',
    learn: {
      1: ['leaf_dart', 'gust_nip', 'bindvine', 'thornlash'], 18: ['wingflurry'],
      25: ['canopy_crash'], 31: ['skyshear'], 38: ['bough_embrace'], 45: ['hush_of_wings'],
    },
  },
  {
    id: 'aquarabbit', base: [52, 50, 48, 55, 58, 60], growth: 'medium',
    bondRate: 120, xpBase: 61, evo: { to: 'torrentide', level: 18 },
    dex: 'Drums on the surface of a pond with its hind feet to call the rain in.',
    learn: {
      1: ['droplet', 'warm_nuzzle'], 5: ['undertow'], 9: ['brinespray'],
      14: ['quickstep'], 18: ['sunbask'], 24: ['tidebreak'], 31: ['tidal_lull'],
    },
  },
  {
    id: 'torrentide', base: [78, 72, 78, 88, 85, 72], growth: 'medium',
    bondRate: 45, xpBase: 172, evo: null,
    dex: 'Carries a whole tide-pool in the hollow of its back, small crabs and all.',
    learn: {
      1: ['droplet', 'undertow', 'brinespray', 'tidal_lull'], 18: ['sunbask'],
      25: ['tidebreak'], 32: ['bloomburst'], 40: ['tidal_lull'], 46: ['bedrock_vow'],
    },
  },
  {
    id: 'terranox', base: [58, 60, 68, 40, 45, 35], growth: 'medium',
    bondRate: 140, xpBase: 58, evo: { to: 'cragnox', level: 20 },
    dex: 'Sits so still that moss grows on its shoulders. It is not asleep. It is thinking.',
    learn: {
      1: ['pebble_toss', 'shell_up'], 6: ['warm_nuzzle'], 10: ['stonecall'],
      15: ['bristle'], 20: ['dim_veil'], 26: ['boulder_dive'], 33: ['bedrock_vow'],
    },
  },
  {
    id: 'cragnox', base: [85, 90, 105, 52, 62, 45], growth: 'slow',
    bondRate: 40, xpBase: 178, evo: null,
    dex: 'A walking piece of the ridge. Children are allowed to draw on it with chalk.',
    learn: {
      1: ['pebble_toss', 'shell_up', 'stonecall', 'bedrock_vow'], 20: ['dim_veil'],
      27: ['boulder_dive'], 34: ['bristle'], 41: ['bedrock_vow'], 48: ['boulder_dive'],
    },
  },
  {
    id: 'wisplet', base: [42, 40, 38, 55, 50, 78], growth: 'fast',
    bondRate: 190, xpBase: 52, evo: { to: 'zephyrix', level: 20 },
    dex: 'Barely there. You mostly notice it by the way the washing on the line lifts.',
    learn: {
      1: ['gust_nip', 'swiftshift'], 5: ['quickstep'], 9: ['wingflurry'],
      14: ['glimmer'], 20: ['skyshear'], 27: ['undertow'], 34: ['hush_of_wings'],
    },
  },
  {
    id: 'zephyrix', base: [66, 62, 58, 84, 74, 110], growth: 'fast',
    bondRate: 45, xpBase: 158, evo: null,
    dex: 'Outruns its own sound. The hush that arrives before it is how you know it is coming.',
    learn: {
      1: ['gust_nip', 'swiftshift', 'quickstep', 'hush_of_wings'], 20: ['skyshear'],
      28: ['wingflurry'], 35: ['glimmer'], 42: ['voltlash'], 48: ['hush_of_wings'],
    },
  },
  {
    id: 'voltkit', base: [45, 48, 42, 62, 50, 72], growth: 'medium',
    bondRate: 150, xpBase: 56, evo: { to: 'voltmane', level: 22 },
    dex: 'Sheds sparks when it is pleased. It is pleased very often.',
    learn: {
      1: ['static_nip', 'glimmer'], 5: ['quickstep'], 10: ['arcbolt'],
      15: ['swiftshift'], 22: ['skyshear'], 28: ['voltlash'], 35: ['thundermane'],
    },
  },
  {
    id: 'voltmane', base: [68, 66, 58, 92, 72, 102], growth: 'medium',
    bondRate: 45, xpBase: 166, evo: null,
    dex: 'Its mane holds a whole afternoon of sunlight and gives it back after dark.',
    learn: {
      1: ['static_nip', 'glimmer', 'arcbolt', 'thundermane'], 22: ['skyshear'],
      29: ['voltlash'], 36: ['swiftshift'], 43: ['hush_of_wings'], 49: ['thundermane'],
    },
  },
  {
    id: 'florabloom', base: [55, 42, 52, 62, 68, 50], growth: 'medium',
    bondRate: 170, xpBase: 57, evo: { to: 'floradiant', level: 24, bond: 140 },
    dex: 'Opens at the sound of a familiar voice and closes for strangers. It is not shy, only careful.',
    learn: {
      1: ['petal_brush', 'sunbask'], 6: ['pollen_haze'], 11: ['leaf_dart'],
      16: ['bloomburst'], 22: ['kindle_song'], 28: ['bindvine'], 35: ['radiant_bloom'],
    },
  },
  {
    id: 'floradiant', base: [80, 58, 72, 95, 95, 62], growth: 'medium',
    bondRate: 40, xpBase: 174, evo: null,
    dex: 'Its crown turns to follow whoever it likes best in the room. Bees follow it everywhere.',
    learn: {
      1: ['petal_brush', 'sunbask', 'pollen_haze', 'radiant_bloom'], 24: ['bloomburst'],
      30: ['kindle_song'], 37: ['mend'], 44: ['bough_embrace'], 50: ['radiant_bloom'],
    },
  },
  {
    id: 'drakindle', base: [50, 58, 50, 55, 48, 55], growth: 'slow',
    bondRate: 60, xpBase: 66, evo: { to: 'drakember', level: 26 },
    dex: 'Hatches in the cold ash of a lightning-struck tree. Keeps one wing over its eyes in daylight.',
    learn: {
      1: ['shade_nip', 'bristle'], 6: ['dim_veil'], 11: ['nightbite'],
      17: ['cinder_nip'], 23: ['gloomsurge'], 30: ['blaze_rush'], 38: ['duskbrand'],
    },
  },
  {
    id: 'drakember', base: [78, 88, 72, 82, 70, 78], growth: 'slow',
    bondRate: 30, xpBase: 204, evo: null,
    dex: 'Flies the boundary between the last light and the first dark, and will not be hurried across it.',
    learn: {
      1: ['shade_nip', 'dim_veil', 'nightbite', 'duskbrand'], 26: ['gloomsurge'],
      33: ['blaze_rush'], 40: ['sunflare'], 46: ['duskbrand'], 52: ['gloomsurge'],
    },
  },
  {
    id: 'hearthling', base: [70, 60, 70, 80, 88, 60], growth: 'medium',
    bondRate: 8, xpBase: 190, evo: null,
    dex: 'Only ever found where a fire has been kept alight for a hundred years. It counts the village as its own body.',
    learn: {
      1: ['warm_nuzzle', 'mend'], 7: ['kindle_song'], 13: ['hearthlight'],
      19: ['glimmer'], 25: ['sunbask'], 32: ['hearthbond'], 40: ['sunspire'],
    },
  },
];

// Fold in the foundation-owned name / type / stage / line, so those never drift.
const ROSTER = {};
for (const g of GUARDIANS) {
  const own = S.find(s => s.id === g.id);
  if (!own) throw new Error(`[species] missing stats for roster id "${g.id}"`);
  ROSTER[g.id] = Object.freeze({
    ...own,
    name: g.name,
    type: g.type,
    types: Object.freeze([g.type]),
    stage: g.stage,
    line: g.line,
    front: `g.${g.id}.front`,
    back: `g.${g.id}.back`,
    ow: `g.${g.id}.ow`,
    stats: Object.freeze({
      hp: own.base[0], atk: own.base[1], def: own.base[2],
      spa: own.base[3], spd: own.base[4], spe: own.base[5],
    }),
  });
}
for (const s of S) {
  if (!ROSTER[s.id]) throw new Error(`[species] "${s.id}" is not in the canonical roster`);
}

export const SPECIES = Object.freeze(ROSTER);
export const SPECIES_IDS = Object.freeze(GUARDIANS.map(g => g.id));
export const getSpecies = id => SPECIES[id] || null;
export const speciesName = id => SPECIES[id]?.name || String(id);
/** The three the player is offered at the start. */
export const STARTERS = Object.freeze(['embercub', 'leafowl', 'aquarabbit']);

export const STAT_KEYS = Object.freeze(['hp', 'atk', 'def', 'spa', 'spd', 'spe']);
export const STAT_LABEL = Object.freeze({
  hp: 'HEART', atk: 'ATTACK', def: 'GUARD', spa: 'SPIRIT', spd: 'RESOLVE', spe: 'SPEED',
});

// ---------------------------------------------------------------------------
//  learnsets & evolution
// ---------------------------------------------------------------------------
/** Every move id this species knows by `level`, in learn order. */
export function movesUpTo(speciesId, level) {
  const sp = SPECIES[speciesId];
  if (!sp) return [];
  const out = [];
  for (const lv of Object.keys(sp.learn).map(Number).sort((a, b) => a - b)) {
    if (lv > level) break;
    for (const id of sp.learn[lv]) if (!out.includes(id)) out.push(id);
  }
  return out;
}
/** Moves newly available exactly at `level`. */
export function movesAt(speciesId, level) {
  return (SPECIES[speciesId]?.learn[level] || []).slice();
}

/**
 * Does this guardian meet its evolution condition right now?
 * Returns { to, toName, reason } or null. Never mutates.
 */
export function evolutionFor(g) {
  const sp = SPECIES[g.species];
  if (!sp || !sp.evo) return null;
  const e = sp.evo;
  if (e.level !== undefined && g.lvl < e.level) return null;
  if (e.bond !== undefined && (g.bond || 0) < e.bond) return null;
  return {
    to: e.to,
    toName: speciesName(e.to),
    reason: e.bond !== undefined ? 'bond' : 'level',
  };
}
export const evoHint = id => {
  const e = SPECIES[id]?.evo;
  if (!e) return 'This one is already all it means to be.';
  if (e.bond !== undefined) return `Grows into ${speciesName(e.to)} at Lv${e.level} once it trusts you.`;
  return `Grows into ${speciesName(e.to)} at Lv${e.level}.`;
};

/**
 * Apply an evolution in place. Keeps the nickname if the player set one, keeps HP
 * proportion, adds the new form's level-1 moves if there is room.
 */
export function commitEvolve(g) {
  const evo = evolutionFor(g);
  if (!evo) return null;
  const from = g.species;
  const frac = g.maxhp > 0 ? g.hp / g.maxhp : 1;
  const nicknamed = g.nick && g.nick !== speciesName(from);
  g.species = evo.to;
  g.types = SPECIES[evo.to].types.slice();
  if (!nicknamed) g.nick = speciesName(evo.to);
  recalcStats(g);
  g.hp = Math.max(1, Math.round(g.maxhp * frac));
  for (const id of movesAt(evo.to, 1)) {
    if (g.moves.length >= 4) break;
    if (!g.moves.some(m => m.id === id)) g.moves.push(makeMoveSlot(id));
  }
  return { from, to: evo.to, fromName: speciesName(from), toName: speciesName(evo.to) };
}

// ---------------------------------------------------------------------------
//  the party-member factory
// ---------------------------------------------------------------------------
let seq = 0;
/** Reset the instance counter — tests use this so ids are reproducible. */
export const resetGuardianIds = (n = 0) => { seq = n; };

export function computeStats(speciesId, lvl) {
  const sp = SPECIES[speciesId];
  const b = sp.stats;
  return {
    hp: hpAt(b.hp, lvl), atk: statAt(b.atk, lvl), def: statAt(b.def, lvl),
    spa: statAt(b.spa, lvl), spd: statAt(b.spd, lvl), spe: statAt(b.spe, lvl),
  };
}

/** Recompute stats after a level-up or an evolution, keeping HP sensible. */
export function recalcStats(g) {
  const before = g.maxhp || 0;
  g.stats = computeStats(g.species, g.lvl);
  g.maxhp = g.stats.hp;
  if (before === 0) g.hp = g.maxhp;
  else g.hp = Math.min(g.maxhp, g.hp + Math.max(0, g.maxhp - before));
  return g;
}

/** Repair a saved Guardian against the live species/move catalogues. */
export function normalizeGuardian(g) {
  if (!g || !SPECIES[g.species]) return null;
  g.lvl = Math.max(1, Math.min(maxLevel, Number(g.lvl) | 0 || 1));
  const oldMax = Math.max(1, Number(g.maxhp) || 1);
  const oldHp = Math.max(0, Math.min(oldMax, Number(g.hp) || 0));
  g.types = SPECIES[g.species].types.slice();
  g.nick = String(g.nick || speciesName(g.species)).slice(0, 24);
  g.stats = computeStats(g.species, g.lvl);
  g.maxhp = g.stats.hp;
  g.hp = Math.max(0, Math.min(g.maxhp, Math.round(g.maxhp * oldHp / oldMax)));
  g.xp = Math.max(0, Number(g.xp) | 0);
  g.xpNext = xpNeeded(g.lvl, SPECIES[g.species].growth);
  g.bond = Math.max(0, Math.min(255, Number(g.bond) | 0));
  const seen = new Set();
  g.moves = (Array.isArray(g.moves) ? g.moves : []).map(raw => {
    const id = typeof raw === 'string' ? raw : raw?.id;
    if (!moveExists(id) || seen.has(id)) return null;
    seen.add(id);
    const def = getMove(id);
    const maxFocus = Math.max(0, Math.min(999, Number(raw?.maxFocus) || def.focus));
    const savedFocus = Number(raw?.focus);
    const focus = Number.isFinite(savedFocus) ? savedFocus : maxFocus;
    return { id, maxFocus, focus: Math.max(0, Math.min(maxFocus, focus)) };
  }).filter(Boolean).slice(0, 4);
  if (!g.moves.length) {
    for (const id of movesUpTo(g.species, g.lvl).slice(-4)) g.moves.push(makeMoveSlot(id));
  }
  if (!g.moves.length) g.moves.push(makeMoveSlot('struggle'));
  g.status = STATUS_SAFE.has(g.status) ? g.status : null;
  g.statusTurns = g.status ? Math.max(0, Number(g.statusTurns) | 0) : 0;
  g.met = g.met && typeof g.met === 'object' ? g.met : { lvl: g.lvl, where: 'the valley', day: 0 };
  return g;
}

const STATUS_SAFE = new Set(['scorch', 'tangle', 'soaked', 'dazzled']);

/**
 * Build a party member. This is the shape state.js documents:
 *   {id, species, nick, lvl, xp, hp, maxhp, moves:[], stats:{}, bond}
 * plus the battle fields (types, status, met) that persist with it.
 */
export function makeGuardian(speciesId, level = 5, opts = {}) {
  const sp = SPECIES[speciesId];
  if (!sp) throw new Error(`[species] unknown guardian "${speciesId}"`);
  const lvl = Math.max(1, Math.min(maxLevel, level | 0));
  const g = {
    id: opts.id || `g${++seq}`,
    species: speciesId,
    nick: opts.nick || sp.name,
    types: sp.types.slice(),
    lvl,
    xp: 0,
    xpNext: xpNeeded(lvl, sp.growth),
    hp: 0, maxhp: 0,
    stats: null,
    moves: [],
    bond: opts.bond === undefined ? Math.min(255, 60 + Math.floor(sp.bondRate / 8)) : opts.bond,
    status: null,
    statusTurns: 0,
    met: { lvl, where: opts.where || 'the wild', day: opts.day || 0 },
  };
  recalcStats(g);
  g.hp = opts.hp === undefined ? g.maxhp : Math.max(0, Math.min(g.maxhp, opts.hp));
  const wanted = opts.moves && opts.moves.length ? opts.moves : movesUpTo(speciesId, lvl).slice(-4);
  for (const id of wanted.slice(0, 4)) g.moves.push(makeMoveSlot(id));
  if (!g.moves.length) g.moves.push(makeMoveSlot('warm_nuzzle'));
  return g;
}

/** A trainer's team from a compact spec: [['voltkit', 8], ['wisplet', 9]]. */
export const makeTeam = spec => spec.map(([id, lvl, o]) => makeGuardian(id, lvl, o));

/** Clear everything battle-scoped. Called when a battle ends — nothing follows you out. */
export function restEasy(g, { full = false } = {}) {
  g.status = null;
  g.statusTurns = 0;
  if (full) {
    g.hp = g.maxhp;
    for (const m of g.moves) m.focus = m.maxFocus;
  }
  return g;
}

export const isFainted = g => !g || g.hp <= 0;
export const displayName = g => g?.nick || speciesName(g?.species);
export const frontSprite = g => `g.${g.species}.front`;
export const backSprite = g => `g.${g.species}.back`;
export const owSprite = g => `g.${g.species}.ow`;

/** Dex row for ui/party.js and the dex screen. */
export function dexEntry(id) {
  const sp = SPECIES[id];
  if (!sp) return null;
  return {
    id, name: sp.name, type: sp.type, stage: sp.stage, line: sp.line,
    dex: sp.dex, base: sp.stats, evo: evoHint(id),
    moves: Object.entries(sp.learn).map(([lv, ids]) => ({ lv: +lv, moves: ids.map(i => getMove(i).name) })),
  };
}
