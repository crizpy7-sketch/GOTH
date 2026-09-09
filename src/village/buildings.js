// Building definitions, keyed 1:1 to art/names.js BUILDINGS.
//
// Footprints, overhang and tier counts are NOT defined here — they come from names.js
// and are treated as fixed. This file adds the game design on top: what a building
// costs at each tier, what unlocks it, what it *does for the player*, where it may
// stand, and who moves in when it's finished.
//
// Design rules that keep the build menu legible:
//   * every entry has a one-line `blurb` (what it is) and per-tier `gives` (what you
//     get). Never show a cost without showing a benefit.
//   * every lock has exactly one human sentence: "Needs Village Level 3."
//   * a few buildings unlock from REAL-WORLD missions, so the family loop visibly
//     feeds the village. Those say so out loud.

import { BUILDINGS, buildingById } from '../art/names.js';
import { S } from '../state.js';
import { Economy } from './economy.js';

// --- design data (id must exist in names.js) ----------------------------------
const DESIGN = {
  hearthstone: {
    cat: 'core', weight: 3, villager: 'gran', order: 0,
    blurb: 'The heart of the village. Everything grows outward from here.',
    costs: [{ coins: 0, hearth: 0 }, { coins: 60, hearth: 8 }, { coins: 180, hearth: 24 }, { coins: 400, hearth: 50 }],
    gives: [
      ['The village exists', 'Ground finishing spreads around it'],
      ['Plaza stones replace bare dirt', 'Room for two more buildings'],
      ['Lanterns light the plaza at night', 'Banners and planters unlocked'],
      ['A grand hearth: full plaza', 'Villagers gather here every evening'],
    ],
    unlock: {}, place: { rule: 'any' },
    doorLine: 'The Hearthstone is warm to the touch. The whole village leans toward it.',
  },
  cottage: {
    cat: 'home', weight: 2, villager: 'farmer', order: 1,
    blurb: 'A small house with a crooked chimney. Somebody will want to live here.',
    costs: [{ coins: 40, hearth: 2 }, { coins: 120, hearth: 8 }, { coins: 260, hearth: 18 }],
    gives: [
      ['A villager moves in', 'Smoke from the chimney'],
      ['A second villager joins them', 'A laundry line appears'],
      ['A window box and a porch light', 'The whole lane feels lived-in'],
    ],
    unlock: {}, place: { rule: 'any' },
    doorLine: 'Somebody is humming inside.',
  },
  kitchen: {
    cat: 'home', weight: 2, villager: 'baker', order: 2,
    blurb: 'A shared kitchen with one very good soup pot.',
    costs: [{ coins: 60, hearth: 4 }, { coins: 150, hearth: 10 }, { coins: 300, hearth: 20 }],
    gives: [
      ['Cook daily: restore the whole party', 'A warm light in the window'],
      ['Meals restore focus and raise bond', 'A second stove; bread on the sill'],
      ['The daily feast gives more bond', 'The market smells wonderful'],
    ],
    unlock: { mission: 'cook-together' }, place: { rule: 'any' },
    doorLine: 'Something is simmering. It smells like being looked after.',
  },
  garden: {
    cat: 'garden', weight: 1, villager: 'farmer', order: 3,
    blurb: 'Four tidy rows of soil. Things grow if you remember them.',
    costs: [{ coins: 30, hearth: 1 }, { coins: 90, hearth: 6 }, { coins: 200, hearth: 14 }],
    gives: [
      ['Gather one salve herb each morning', 'Sprouts you can watch grow'],
      ['Gather two salve herbs', 'Flowers along the edges'],
      ['Gather three salve herbs', 'Bees, and a scarecrow with a hat'],
    ],
    unlock: { level: 2, mission: 'water-plants' },
    place: { rule: 'openGround', note: 'Needs sun: keep one tile clear around it.' },
    doorLine: 'The soil is dark and damp. Something is definitely coming up.',
  },
  workshop: {
    cat: 'work', weight: 2, villager: 'smith', order: 4,
    blurb: 'A bench, a vice, and a satisfying amount of sawdust.',
    costs: [{ coins: 90, hearth: 6 }, { coins: 220, hearth: 14 }, { coins: 420, hearth: 26 }],
    gives: [
      ['Craft one charm daily', 'Building costs drop by 5%'],
      ['Craft two charms daily', 'Building costs drop by 10%'],
      ['Craft three charms daily', 'Building costs drop by 15%'],
    ],
    unlock: { level: 2, built: ['cottage'], mission: 'make-something' },
    place: { rule: 'any' },
    doorLine: 'Hammering, then a pause, then quieter hammering.',
  },
  market: {
    cat: 'work', weight: 2, villager: 'peddler', order: 5,
    blurb: 'A striped awning and a peddler who knows everyone\'s name.',
    costs: [{ coins: 80, hearth: 5 }, { coins: 190, hearth: 12 }, { coins: 360, hearth: 22 }],
    gives: [
      ['Buy charms and warm salves', 'A peddler joins the plaza'],
      ['Two stalls and a fruit crate', 'More villagers gather nearby'],
      ['A striped roof and full shelves', 'The plaza becomes a proper market'],
    ],
    unlock: { level: 3 }, place: { rule: 'nearHearth', maxDist: 9, note: 'Wants to be on the plaza.' },
    doorLine: '"Fresh in this morning!" Everything is, apparently, fresh in this morning.',
  },
  library: {
    cat: 'civic', weight: 2, villager: 'kid', order: 6,
    blurb: 'A reading nook with too many cushions and exactly enough books.',
    costs: [{ coins: 100, hearth: 8 }, { coins: 240, hearth: 16 }, { coins: 460, hearth: 28 }],
    gives: [
      ['Daily study restores move focus', 'A reading lamp glows at night'],
      ['Study also raises guardian bond', 'Story hour: villagers gather'],
      ['A stronger daily bond lesson', 'A star chart on the ceiling'],
    ],
    unlock: { level: 3, mission: 'read-aloud' }, place: { rule: 'any' },
    doorLine: 'Someone is reading out loud, doing all the voices.',
  },
  infirmary: {
    cat: 'civic', weight: 2, villager: 'gran', order: 7,
    blurb: 'The Warmhouse: blankets, broth, and somebody keeping watch.',
    costs: [{ coins: 120, hearth: 10 }, { coins: 280, hearth: 18 }, { coins: 520, hearth: 30 }],
    gives: [
      ['Daily rest fully heals the party', 'A lantern left on all night'],
      ['Rest also revives and restores focus', 'Herbs drying under the eaves'],
      ['Rest clears every status', 'The kindest room in the valley'],
    ],
    unlock: { level: 4 }, place: { rule: 'any' },
    doorLine: '"Sit down, you look tired. Both of you."',
  },
  fountain: {
    cat: 'core', weight: 1, villager: null, order: 8,
    blurb: 'Stone basin, three spouts, one extremely confident duck.',
    costs: [{ coins: 70, hearth: 6 }, { coins: 180, hearth: 14 }],
    gives: [
      ['A small daily gift in the basin', 'Villagers stop and chat here'],
      ['A larger daily gift', 'Lit water at night'],
    ],
    unlock: { level: 4 }, place: { rule: 'nearHearth', maxDist: 8, note: 'Belongs in the plaza.' },
    doorLine: 'The water is very cold and the duck is very unimpressed.',
  },
  gate: {
    cat: 'civic', weight: 1, villager: 'ranger', order: 9,
    blurb: 'A timber arch that says: this is a place, and you are welcome in it.',
    costs: [{ coins: 110, hearth: 8 }, { coins: 260, hearth: 16 }],
    gives: [
      ['A ranger joins the village', 'Travellers start arriving'],
      ['Lanterns mark the village edge', 'A taller welcome arch'],
    ],
    unlock: { level: 5 }, place: { rule: 'farFromHearth', minDist: 6, note: 'Marks the village edge.' },
    doorLine: 'The road north climbs out of sight. Not today, maybe.',
  },
  bathhouse: {
    cat: 'civic', weight: 3, villager: 'fisher', order: 10,
    blurb: 'The Spring House. Hot water, cold stone, absolutely no hurrying.',
    costs: [{ coins: 200, hearth: 16 }, { coins: 460, hearth: 32 }],
    gives: [
      ['Daily rest: full heal and bond', 'Steam drifts across the plaza'],
      ['A stronger bond boost', 'An outdoor pool under the stars'],
    ],
    unlock: { level: 5, mission: 'rest-together' }, place: { rule: 'any' },
    doorLine: 'Steam, and the sound of somebody sighing happily.',
  },
  belltower: {
    cat: 'core', weight: 3, villager: 'mayor', order: 11,
    blurb: 'Tall, slightly crooked, and audible from the far ridge.',
    costs: [{ coins: 260, hearth: 22 }, { coins: 600, hearth: 40 }],
    gives: [
      ['Ring it from the building menu', 'Rings when the village grows'],
      ['A fuller two-note peal', 'Visible from the far ridge'],
    ],
    unlock: { level: 6 }, place: { rule: 'nearHearth', maxDist: 11, note: 'Should be heard from the plaza.' },
    doorLine: 'The rope is worn smooth. It would be very easy to pull.',
  },
};

export const CATEGORY = {
  core: { name: 'Heart', color: '#f5c877' },
  home: { name: 'Homes', color: '#f0836a' },
  work: { name: 'Work', color: '#7fb6d9' },
  civic: { name: 'Care', color: '#a98ada' },
  garden: { name: 'Growing', color: '#8cc055' },
};

// --- the merged table ---------------------------------------------------------
export const DEFS = BUILDINGS.map(b => {
  const d = DESIGN[b.id] || {};
  return {
    ...b,                          // id, name, w, h, overhang, tiers  (fixed, from names.js)
    cat: d.cat || 'core',
    weight: d.weight ?? 1,
    villager: d.villager ?? null,
    order: d.order ?? 99,
    blurb: d.blurb || 'A building.',
    costs: d.costs || Array.from({ length: b.tiers }, (_, i) => ({ coins: 50 * (i + 1), hearth: 4 * (i + 1) })),
    gives: d.gives || Array.from({ length: b.tiers }, () => ['Helps the village grow']),
    unlock: d.unlock || {},
    place: d.place || { rule: 'any' },
    doorLine: d.doorLine || 'The door is shut, but kindly.',
    sprite: t => `b.${b.id}.t${Math.max(1, Math.min(b.tiers, t | 0))}`,
  };
}).sort((a, b) => a.order - b.order);

const BY_ID = new Map(DEFS.map(d => [d.id, d]));
export const defFor = id => BY_ID.get(id) || null;
export const allDefs = () => DEFS;

// --- built-state queries (read S directly; no cross-module imports) -----------
export const builtList = () => (S.village?.buildings || []);
export const builtOf = id => builtList().filter(b => b.type === id);
export const countOf = id => builtOf(id).length;
export const isBuilt = id => countOf(id) > 0;
export const bestTier = id => builtOf(id).reduce((m, b) => Math.max(m, b.tier || 1), 0);
export const missionDone = id => !!S.missions?.completed?.[id]
  || !!(S.missions?.done || []).some(d => (d.id || d) === id);

/** How many of a type you may own. Cottages and gardens scale with village level. */
export function maxCount(id, level) {
  if (id === 'cottage') return Math.max(1, Math.min(6, level));
  if (id === 'garden') return Math.max(1, Math.min(4, Math.floor(level / 2) + 1));
  if (id === 'hearthstone') return 1;
  return 1;
}

// --- unlocking ---------------------------------------------------------------
// Returns exactly one reason string when locked, so the menu never shows a grey
// row with no explanation.
export function unlockState(id, level = S.village?.level || 1) {
  const def = defFor(id);
  if (!def) return { unlocked: false, reason: 'Unknown building.' };
  const u = def.unlock || {};

  if (u.level && level < u.level) {
    return { unlocked: false, reason: `Needs Village Level ${u.level}.`, kind: 'level', need: u.level };
  }
  if (u.built) {
    for (const need of u.built) {
      if (!isBuilt(need)) {
        return { unlocked: false, reason: `Needs a ${defFor(need)?.name || need} first.`, kind: 'built' };
      }
    }
  }
  if (u.mission && !missionDone(u.mission)) {
    const m = MISSION_HINT[u.mission] || 'a family mission';
    return { unlocked: false, reason: `Unlocks when your family does: ${m}`, kind: 'mission', mission: u.mission };
  }
  if (u.flag && !S.flags?.[u.flag]) {
    return { unlocked: false, reason: 'Not yet — the village isn\'t ready.', kind: 'flag' };
  }
  return { unlocked: true, reason: '' };
}

// Short, warm phrasing of the mission that gates a building. Kept here (not in
// missions.js) so buildings.js has zero cross-module imports.
const MISSION_HINT = {
  'cook-together': 'cook a meal together',
  'read-aloud': 'read a chapter out loud',
  'make-something': 'make something with your hands',
  'rest-together': 'twenty quiet minutes together',
  'water-plants': 'water the plants',
};
export const missionHint = id => MISSION_HINT[id] || null;

/** Full row of info the build menu needs, in one call. */
export function buildRow(id, level) {
  const def = defFor(id);
  const lock = unlockState(id, level);
  const have = countOf(id);
  const cap = maxCount(id, level);
  const c = costToBuild(id, level);
  const affordable = Economy.canAfford(c);
  let state = 'ready';
  if (!lock.unlocked) state = 'locked';
  else if (have >= cap) state = 'full';
  else if (!affordable) state = 'poor';
  return { def, lock, have, cap, cost: c, affordable, state };
}

/** Cost of a fresh tier-1 build (with the workshop discount applied). */
export function costToBuild(id) {
  const def = defFor(id);
  if (!def) return { coins: 0, hearth: 0 };
  return discount(def.costs[0]);
}

/** Cost of taking an existing building from `tier` to `tier + 1`. */
export function costToUpgrade(id, tier) {
  const def = defFor(id);
  if (!def || tier >= def.tiers) return null;
  return discount(def.costs[tier] || def.costs[def.costs.length - 1]);
}

/** Workshop tiers shave build costs — a concrete, legible reason to upgrade it. */
export function discountPct() {
  const t = bestTier('workshop');
  return t ? [0, 5, 10, 15][Math.min(3, t)] : 0;
}
function discount(c) {
  const pct = discountPct();
  if (!pct) return { coins: c.coins | 0, hearth: c.hearth | 0 };
  return { coins: Math.max(0, Math.round(c.coins * (1 - pct / 100))), hearth: c.hearth | 0 };
}

export const benefitsFor = (id, tier) => {
  const def = defFor(id);
  if (!def) return [];
  return def.gives[Math.max(0, Math.min(def.gives.length - 1, (tier | 0) - 1))] || [];
};

/** Everything a building will *newly* give you at the next tier. */
export const gainsFrom = (id, tier) => benefitsFor(id, tier + 1);

// --- placement rules ---------------------------------------------------------
/** Human sentence describing where this can go — shown live in build mode. */
export function placeNote(id) {
  const def = defFor(id);
  const p = def?.place || {};
  if (p.note) return p.note;
  return 'Anywhere with room for its footprint.';
}

/**
 * Rule check only — geometry (overlap / bounds / solid tiles) lives in village.js.
 * `ctx` supplies { hearth: {x,y}, neighbours(x,y,w,h) -> count }.
 */
export function ruleOk(id, x, y, ctx) {
  const def = defFor(id);
  const p = def?.place || {};
  const hx = ctx.hearth?.x ?? x, hy = ctx.hearth?.y ?? y;
  const d = Math.hypot((x + def.w / 2) - hx, (y + def.h / 2) - hy);
  if (p.rule === 'nearHearth' && d > (p.maxDist ?? 9)) {
    return { ok: false, reason: `${def.name} belongs closer to the Hearthstone.` };
  }
  if (p.rule === 'farFromHearth' && d < (p.minDist ?? 6)) {
    return { ok: false, reason: `${def.name} marks the village edge — further out.` };
  }
  if (p.rule === 'openGround' && ctx.neighbours && ctx.neighbours(x, y, def.w, def.h) > 0) {
    return { ok: false, reason: `${def.name} needs a clear tile all around it.` };
  }
  return { ok: true, reason: '' };
}

// --- "what should I build next?" ---------------------------------------------
/**
 * The single most useful thing the board can tell you. Prefers: something you can
 * afford right now; else the cheapest unlocked thing; else the nearest lock and
 * exactly what would open it.
 */
export function suggestion(level) {
  const rows = DEFS.filter(d => d.id !== 'hearthstone').map(d => buildRow(d.id, level));
  const ready = rows.filter(r => r.state === 'ready');
  if (ready.length) {
    ready.sort((a, b) => (a.cost.coins + a.cost.hearth * 8) - (b.cost.coins + b.cost.hearth * 8));
    return { kind: 'build', row: ready[0], text: `Build a ${ready[0].def.name} — ${Economy.format(ready[0].cost)}` };
  }
  const poor = rows.filter(r => r.state === 'poor');
  if (poor.length) {
    poor.sort((a, b) => (a.cost.coins + a.cost.hearth * 8) - (b.cost.coins + b.cost.hearth * 8));
    const r = poor[0];
    return { kind: 'save', row: r, text: `Saving for a ${r.def.name}. ${Economy.shortfallText(r.cost)}` };
  }
  const locked = rows.filter(r => r.state === 'locked');
  if (locked.length) {
    const byMission = locked.find(r => r.lock.kind === 'mission');
    const r = byMission || locked[0];
    return { kind: 'locked', row: r, text: `${r.def.name}: ${r.lock.reason}` };
  }
  return { kind: 'upgrade', row: null, text: 'Everything is built — upgrade what you love most.' };
}

/** Buildings that can be upgraded right now, cheapest first. */
export function upgradeCandidates() {
  const out = [];
  for (const b of builtList()) {
    const def = defFor(b.type);
    if (!def) continue;
    const tier = b.tier || 1;
    if (tier >= def.tiers) continue;
    const c = costToUpgrade(b.type, tier);
    out.push({ b, def, tier, next: tier + 1, cost: c, affordable: Economy.canAfford(c) });
  }
  out.sort((a, b) => (a.cost.coins + a.cost.hearth * 8) - (b.cost.coins + b.cost.hearth * 8));
  return out;
}

export default { DEFS, defFor, unlockState, buildRow, costToBuild, costToUpgrade, suggestion };
