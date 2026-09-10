// The single mutable game state, plus save/load.
//
// Rules: anything persistent lives here. Add fields with a default in defaults() and,
// if you rename or restructure, bump VERSION and add a migration. Saves must survive.

import { Bus, EV } from './core/events.js';

export const VERSION = 4;
const KEY = 'hearth.save.v1';
const PREFERENCES_KEY = 'hearth.preferences.v1';
const ACTIVE_KEY = 'hearth.family.active.v1';
const FAMILY_KEY = 'hearth.family.names.v1';
export const LEGACY_BACKUP_KEY = 'hearth.backup.legacy.v1';
export const FAMILY_SLOTS = Object.freeze(Array.from({ length: 7 }, (_, i) => Object.freeze({
  id: i < 5 ? `child${i + 1}` : `parent${i - 4}`,
  name: i < 5 ? `Child ${i + 1}` : `Parent ${i - 4}`,
})));
let activeProfile = 'legacy', protectedStorage = false, expectedSave, expectedPreferences;
let persistenceIssue = '';
const validProfile = id => id === 'legacy' || FAMILY_SLOTS.some(p => p.id === id);
export const profileSaveKey = (id = activeProfile) => id === 'legacy' ? KEY : `hearth.profile.${id}.save.v1`;
const preferenceKey = () => activeProfile === 'legacy' ? PREFERENCES_KEY : `hearth.profile.${activeProfile}.preferences.v1`;
export const currentProfileId = () => activeProfile;
export const saveIssue = () => persistenceIssue;

// Active ownership belongs to this tab, never to the latest active slot in another
// tab. Compare the exact last-loaded bytes before every write to catch stale saves.
export function initProfiles() {
  activeProfile = 'legacy'; protectedStorage = true; persistenceIssue = '';
  try {
    const selected = localStorage.getItem(ACTIVE_KEY);
    if (validProfile(selected)) activeProfile = selected;
    expectedSave = localStorage.getItem(profileSaveKey());
    expectedPreferences = localStorage.getItem(preferenceKey());
  } catch { expectedSave = expectedPreferences = undefined; persistenceIssue = 'unavailable'; }
}

function readSaved(raw) {
  if (!raw) return null;
  const value = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      !value.player || typeof value.player !== 'object' || Array.isArray(value.player) ||
      (value.version !== undefined && (!Number.isInteger(value.version) || value.version > VERSION))) return null;
  return normalizeState(deepMerge(defaults(), migrate(value)));
}

function checkWrite(key, expected) {
  if (!protectedStorage) return;
  if (persistenceIssue === 'conflict' || localStorage.getItem(key) !== expected) {
    persistenceIssue = 'conflict'; throw new Error('Journey changed in another tab');
  }
}

export function profileRows() {
  let names = {};
  try { const data = JSON.parse(localStorage.getItem(FAMILY_KEY) || '{}'); if (data && typeof data === 'object' && !Array.isArray(data)) names = data; } catch {}
  return [...FAMILY_SLOTS, {id:'legacy', name:'Original journey'}].map(slot => {
    let status = 'empty', summary = null;
    try {
      const raw = localStorage.getItem(profileSaveKey(slot.id));
      if (raw !== null) {
        try { const state = readSaved(raw); if (state) { status = 'saved'; summary = { name:state.player.name, level:state.village.level, day:state.clock.day }; } else status = 'invalid'; }
        catch { status = 'invalid'; }
      }
    } catch { status = 'unavailable'; }
    const custom = typeof names[slot.id] === 'string' ? names[slot.id].trim().slice(0,24) : '';
    return {...slot, name:slot.id === 'legacy' ? slot.name : custom || slot.name, status, summary, active:slot.id === activeProfile};
  });
}

export function renameProfile(id, name) {
  if (!validProfile(id) || id === 'legacy' || typeof name !== 'string' || !name.trim()) return false;
  try {
    const raw = localStorage.getItem(FAMILY_KEY);
    let names = {}; try { names = JSON.parse(raw || '{}'); } catch {}
    if (!names || typeof names !== 'object' || Array.isArray(names)) names = {};
    names[id] = name.trim().slice(0,24);
    localStorage.setItem(FAMILY_KEY, JSON.stringify(names)); return true;
  } catch { return false; }
}

// Only the title profile picker calls this. It reloads the page immediately so
// no old world, pending dialogue, map cache, or scene can write into a new slot.
export function selectProfile(id) {
  if (!validProfile(id)) return false;
  try { localStorage.getItem(profileSaveKey(id)); localStorage.setItem(ACTIVE_KEY, id); return true; }
  catch { persistenceIssue = 'unavailable'; return false; }
}

function backUpLegacy(raw) {
  if (raw === null) return;
  if (localStorage.getItem(LEGACY_BACKUP_KEY) === null) {
    localStorage.setItem(LEGACY_BACKUP_KEY, raw);
    if (localStorage.getItem(LEGACY_BACKUP_KEY) !== raw) throw new Error('Backup could not be verified');
  }
}

export function copyLegacyToProfile(id) {
  if (!FAMILY_SLOTS.some(p => p.id === id)) return {ok:false, message:'Choose a family profile.'};
  try {
    const destination = profileSaveKey(id), original = localStorage.getItem(KEY);
    if (localStorage.getItem(destination) !== null) return {ok:false, message:'This profile already has a journey. Choose an empty profile.'};
    if (!readSaved(original)) return {ok:false, message:'The original journey could not be read. It has been kept unchanged.'};
    backUpLegacy(original);
    if (localStorage.getItem(KEY) !== original || localStorage.getItem(destination) !== null) return {ok:false, message:'A journey changed in another tab. Try again after closing that tab.'};
    localStorage.setItem(destination, original);
    if (localStorage.getItem(destination) !== original) throw new Error('Copy could not be verified');
    // Do not authorize the old in-memory defaults to overwrite an active-slot
    // import. The picker must reload before this newly copied journey can write.
    return {ok:true, message:'Journey copied. The original and its backup are kept unchanged.'};
  } catch { return {ok:false, message:'Could not safely copy the journey. Your original is unchanged. Check device storage and try again.'}; }
}

// A confirmed new journey replaces one slot with one write, never delete-then-save.
export function startNewJourney(start) {
  const next = defaults(); next.settings = {...S.settings};
  if (start) Object.assign(next.player, start);
  if (activeProfile !== 'legacy') next.player.name = profileRows().find(p => p.id === activeProfile)?.name || next.player.name;
  try {
    checkWrite(profileSaveKey(), expectedSave);
    if (activeProfile === 'legacy') backUpLegacy(localStorage.getItem(KEY));
    const raw = JSON.stringify(next); localStorage.setItem(profileSaveKey(), raw);
    expectedSave = raw; persistenceIssue = ''; adopt(next); return true;
  } catch { if (persistenceIssue !== 'conflict') persistenceIssue = 'unavailable'; return false; }
}

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
    settings: { volume: 0.7, musicVolume: 0.5, effectsVolume: 0.9, muted: false,
      readAloud: false, voiceURI: '', voiceRate: 0.88, voiceVolume: 0.9,
      textSpeed: 2, showGrid: false, showHints: true, reducedMotion: false, graphics: 'balanced' },

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
    checkWrite(profileSaveKey(), expectedSave);
    const raw = JSON.stringify(S);
    localStorage.setItem(profileSaveKey(), raw); expectedSave = raw; persistenceIssue = '';
    return true;
  } catch (err) { if (persistenceIssue !== 'conflict') persistenceIssue = 'unavailable'; console.warn('[save] failed', err); return false; }
}

export function hasSave() {
  try { return !!readSaved(localStorage.getItem(profileSaveKey())); } catch { return false; }
}

// Choosing a reading voice on the title must not manufacture a journey save.
export function savePreferences() {
  try {
    checkWrite(preferenceKey(), expectedPreferences);
    const raw = JSON.stringify(S.settings);
    localStorage.setItem(preferenceKey(), raw); expectedPreferences = raw;
    if (expectedSave === null) persistenceIssue = '';
    return true;
  }
  catch { if (persistenceIssue !== 'conflict') persistenceIssue = 'unavailable'; return false; }
}

export function loadPreferences() {
  try {
    const raw = localStorage.getItem(preferenceKey());
    if (!raw) return false;
    const settings = JSON.parse(raw);
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return false;
    S.settings = normalizeState({ ...S, settings: { ...defaults().settings, ...settings } }).settings;
    expectedPreferences = raw;
    return true;
  } catch { return false; }
}

export function load() {
  try {
    const raw = localStorage.getItem(profileSaveKey());
    if (!raw) return false;
    const data = readSaved(raw); if (!data) return false;
    S = data; expectedSave = raw;
    return true;
  } catch (err) { console.warn('[load] failed', err); return false; }
}

export function resetSave() {
  try { checkWrite(profileSaveKey(), expectedSave); localStorage.removeItem(profileSaveKey()); expectedSave = null; } catch { return S; }
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
  state.settings.musicVolume = finite(state.settings.musicVolume, 0.5, 0, 1);
  state.settings.effectsVolume = finite(state.settings.effectsVolume, 0.9, 0, 1);
  state.settings.readAloud = state.settings.readAloud === true;
  state.settings.voiceURI = typeof state.settings.voiceURI === 'string' ? state.settings.voiceURI.slice(0, 300) : '';
  state.settings.voiceRate = finite(state.settings.voiceRate, 0.88, 0.65, 1.15);
  state.settings.voiceVolume = finite(state.settings.voiceVolume, 0.9, 0, 1);
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
