// The single mutable game state, plus save/load.
//
// Rules: anything persistent lives here. Add fields with a default in defaults() and,
// if you rename or restructure, bump VERSION and add a migration. Saves must survive.

import { Bus, EV } from './core/events.js';

export const VERSION = 4;
const KEY = 'hearth.save.v1';

export function defaults() {
  return {
    version: VERSION,
    seed: (Math.random() * 0x7fffffff) | 0,
    createdAt: Date.now(),
    playtime: 0,                       // logical frames

    player: { name: 'Wren', x: 22, y: 24, map: 'village', dir: 'down', sprite: 'hero' },

    party: [],                         // [{id, species, nick, lvl, xp, hp, maxhp, moves:[], stats:{}, bond}]
    box: [],
    bag: { charm: 5, salve: 2 },
    seen: {},                          // species id -> 'seen'|'bonded'
    dex: {},

    coins: 120,
    hearth: 0,                         // village currency earned from missions & bonds

    village: {
      level: 1,
      buildings: [],                   // [{id, type, x, y, tier, builtAt}]
      unlocked: ['hearthstone'],
      paths: [],
      decor: [],
    },

    missions: {
      active: [],                      // [{id, progress, need, acceptedAt}]
      done: [],                        // [{id, at}]
      completed: {},                   // permanent record for one-time missions
      streak: 0,
      lastDay: null,
      dailyPool: [],
      poolDay: null,
    },

    clock: { day: 1, hour: 8, minute: 0, season: 'spring', weather: 'clear' },

    flags: {},
    settings: { volume: 0.7, muted: false, textSpeed: 2, showGrid: false, showHints: true, reducedMotion: false, graphics: 'balanced' },

    stats: { steps: 0, battles: 0, wins: 0, bonded: 0, built: 0, missionsDone: 0 },
  };
}

export let S = defaults();

export function setFlag(name, value = true) {
  S.flags[name] = value;
  Bus.emit(EV.FLAG_SET, { name, value });
}
export const flag = name => !!S.flags[name];

export function addCoins(n) {
  S.coins = Math.max(0, S.coins + n);
  Bus.emit(EV.COINS_CHANGED, { coins: S.coins, delta: n });
  return S.coins;
}
export function addHearth(n) {
  S.hearth = Math.max(0, S.hearth + n);
  Bus.emit(EV.HEARTH_CHANGED, { hearth: S.hearth, delta: n });
  return S.hearth;
}

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(S));
    return true;
  } catch (err) { console.warn('[save] failed', err); return false; }
}

export function hasSave() {
  try { return !!localStorage.getItem(KEY); } catch { return false; }
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    const data = migrate(JSON.parse(raw));
    S = normalizeState(deepMerge(defaults(), data));
    return true;
  } catch (err) { console.warn('[load] failed', err); return false; }
}

export function resetSave() {
  try { localStorage.removeItem(KEY); } catch {}
  S = defaults();
  return S;
}

export function exportSave() { return JSON.stringify(S); }
export function importSave(json) {
  const data = migrate(typeof json === 'string' ? JSON.parse(json) : json);
  S = normalizeState(deepMerge(defaults(), data));
  return S;
}

// Replace the live object's contents without breaking imported references to S.
export function adopt(next) {
  next = normalizeState(deepMerge(defaults(), next || {}));
  for (const k of Object.keys(S)) delete S[k];
  Object.assign(S, next);
  return S;
}

function migrate(data) {
  if (!data || typeof data !== 'object') return defaults();
  let v = data.version || 1;
  if (v < 2) { data.stats ||= defaults().stats; v = 2; }
  if (v < 3) { data.clock ||= defaults().clock; data.clock.weather ||= 'clear'; v = 3; }
  if (v < 4) {
    data.missions ||= {};
    data.missions.completed ||= {};
    // v3 only kept a capped history. Preserve every mission still present while
    // we have the chance; repeatable missions ignore this permanent map, whereas
    // one-time missions can never relock or pay twice after history pruning.
    for (const row of Array.isArray(data.missions.done) ? data.missions.done : []) {
      if (row?.id) data.missions.completed[String(row.id)] = row.day ?? 1;
    }
    v = 4;
  }
  data.version = VERSION;
  return data;
}

const finite = (v, fallback, lo = -Infinity, hi = Infinity) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback;
};

/** Defensive save boundary. Battle performs species-aware repair after loading. */
export function normalizeState(state) {
  const base = defaults();
  const known = new Set(Object.keys(base));
  for (const key of Object.keys(state)) if (!known.has(key)) delete state[key];

  state.version = VERSION;
  state.seed = finite(state.seed, base.seed, 1, 0x7fffffff) | 0;
  state.createdAt = finite(state.createdAt, Date.now(), 0);
  state.playtime = finite(state.playtime, 0, 0);
  state.player ||= { ...base.player };
  state.player.name = String(state.player.name || base.player.name).slice(0, 24);
  state.player.map = String(state.player.map || base.player.map);
  state.player.x = Math.round(finite(state.player.x, base.player.x, 0, 255));
  state.player.y = Math.round(finite(state.player.y, base.player.y, 0, 255));
  if (!['up', 'down', 'left', 'right'].includes(state.player.dir)) state.player.dir = 'down';

  state.party = normalizeGuardianList(state.party, 6);
  state.box = normalizeGuardianList(state.box, 200, state.party);
  state.bag = normalizeNumberMap(state.bag, base.bag);
  state.seen = state.seen && typeof state.seen === 'object' && !Array.isArray(state.seen) ? state.seen : {};
  state.dex = state.dex && typeof state.dex === 'object' && !Array.isArray(state.dex) ? state.dex : {};
  state.flags = state.flags && typeof state.flags === 'object' && !Array.isArray(state.flags) ? state.flags : {};
  state.coins = Math.round(finite(state.coins, base.coins, 0, 9999999));
  state.hearth = Math.round(finite(state.hearth, 0, 0, 9999999));

  state.village ||= base.village;
  state.village.buildings = Array.isArray(state.village.buildings) ? state.village.buildings.slice(0, 100) : [];
  state.village.unlocked = Array.isArray(state.village.unlocked) ? state.village.unlocked.slice(0, 100) : ['hearthstone'];
  state.village.paths = Array.isArray(state.village.paths) ? state.village.paths.slice(0, 2000) : [];
  state.village.decor = Array.isArray(state.village.decor) ? state.village.decor.slice(0, 1000) : [];

  state.missions ||= base.missions;
  state.missions.active = Array.isArray(state.missions.active) ? state.missions.active.slice(0, 100) : [];
  state.missions.done = Array.isArray(state.missions.done) ? state.missions.done.slice(-400) : [];
  state.missions.dailyPool = Array.isArray(state.missions.dailyPool) ? state.missions.dailyPool.slice(0, 20) : [];
  if (!state.missions.completed || typeof state.missions.completed !== 'object' || Array.isArray(state.missions.completed)) {
    state.missions.completed = {};
  }

  state.clock ||= { ...base.clock };
  state.clock.day = Math.round(finite(state.clock.day, 1, 1, 999999));
  state.clock.hour = Math.round(finite(state.clock.hour, 8, 0, 23));
  state.clock.minute = Math.round(finite(state.clock.minute, 0, 0, 59));
  if (!['spring', 'summer', 'autumn', 'winter'].includes(state.clock.season)) state.clock.season = 'spring';
  if (!['clear', 'rain', 'storm', 'snow'].includes(state.clock.weather)) state.clock.weather = 'clear';

  state.settings ||= { ...base.settings };
  state.settings.volume = finite(state.settings.volume, 0.7, 0, 1);
  state.settings.muted = !!state.settings.muted;
  state.settings.textSpeed = Math.round(finite(state.settings.textSpeed, 2, 1, 3));
  state.settings.showGrid = !!state.settings.showGrid;
  state.settings.showHints = state.settings.showHints !== false;
  state.settings.reducedMotion = !!state.settings.reducedMotion;
  state.settings.graphics = state.settings.graphics === 'high' ? 'high' : 'balanced';
  state.stats = normalizeNumberMap(state.stats, base.stats);
  return state;
}

function normalizeNumberMap(value, fallback) {
  const out = { ...fallback };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
  for (const [key, raw] of Object.entries(value)) out[key] = Math.round(finite(raw, out[key] || 0, 0, 9999999));
  return out;
}

function normalizeGuardianList(value, limit, prior = []) {
  if (!Array.isArray(value)) return [];
  const used = new Set(prior.map(g => g.id));
  let next = 1;
  return value.filter(g => g && typeof g === 'object' && typeof g.species === 'string').slice(0, limit).map(g => {
    g.lvl = Math.round(finite(g.lvl, 1, 1, 100));
    g.xp = Math.round(finite(g.xp, 0, 0));
    g.xpNext = Math.round(finite(g.xpNext, 1, 1));
    g.maxhp = Math.round(finite(g.maxhp, 1, 1));
    g.hp = Math.round(finite(g.hp, g.maxhp, 0, g.maxhp));
    g.bond = Math.round(finite(g.bond, 60, 0, 255));
    g.moves = Array.isArray(g.moves) ? g.moves.slice(0, 4).filter(Boolean).map(slot => {
      const s = typeof slot === 'string' ? { id: slot } : slot;
      s.id = String(s.id || 'struggle');
      s.maxFocus = Math.round(finite(s.maxFocus, finite(s.focus, 1, 0), 0, 999));
      s.focus = Math.round(finite(s.focus, s.maxFocus, 0, s.maxFocus));
      return s;
    }) : [];
    let id = String(g.id || '');
    while (!id || used.has(id)) id = `g${next++}`;
    g.id = id; used.add(id);
    return g;
  });
}

// Fills in newly-added defaults without clobbering saved values.
function deepMerge(base, over) {
  if (Array.isArray(base)) return Array.isArray(over) ? over : base;
  if (base && typeof base === 'object' && over && typeof over === 'object') {
    const out = { ...base };
    for (const k of Object.keys(over)) {
      out[k] = k in base ? deepMerge(base[k], over[k]) : over[k];
    }
    return out;
  }
  return over === undefined ? base : over;
}
