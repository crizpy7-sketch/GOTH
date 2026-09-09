// The village model, and the Hooks.village implementation.
//
// The village is NOT a separate screen. Buildings live on the `village` overworld map
// at real tile coordinates and the player walks among them. World calls into us:
//
//   applyTo(map)                     on map load  — reserve tiles, rebuild layout
//   drawGround(map, cam)             GROUND/MID   — plaza, paths, planted decor
//   drawSprites(map, cam, sortEntity)             — buildings + villagers, y-sorted
//   solid(map, x, y)                 collision    — footprints block, doors don't
//   interact(map, x, y)              A pressed    — doors, plots, the Hearthstone
//
// Everything is drawn from S.village.buildings, so a save is the village.
//
// The headline feature is VISIBLE TRANSFORMATION. Village level drives:
//   * how far the ground finishing spreads from the Hearthstone (dirt -> gravel ->
//     cobble -> plaza), and how fine the material gets
//   * paths joining every door to the plaza
//   * lamps (which light at night), banners, planters, benches, laundry, beehives
//   * how many villagers walk around, and who they are
//   * chimney smoke and warm windows after dark
// A level-1 village and a level-6 village must not be mistakable for each other.

import { R, LAYER } from '../core/renderer.js';
import { Scenes } from '../core/scene.js';
import { Loop } from '../core/loop.js';
import { Atlas } from '../art/atlas.js';
import { P, mix, seasonize } from '../art/palette.js';
import { hash2, makeRng } from '../core/rng.js';
import { Bus, EV } from '../core/events.js';
import { UIx, Hooks } from '../core/bridge.js';
import { Audio } from '../core/audio.js';
import { S, save, setFlag } from '../state.js';
import { clamp, DIRS } from '../core/util.js';
import { Economy } from './economy.js';
import {
  DEFS, defFor, builtList, unlockState, costToBuild, costToUpgrade, maxCount,
  ruleOk, benefitsFor, CATEGORY, countOf,
} from './buildings.js';

export const VILLAGE_MAP = 'village';
const TILE = 16;

// Where the Hearthstone stands if the world map doesn't tell us otherwise. The
// default player spawn is (22,24), four tiles south of this door.
const DEFAULT_HEARTH = { x: 21, y: 19 };

// Suggested plots, as offsets from the Hearthstone origin. Build mode snaps its
// cursor to the first valid one, so "where do I put this?" is never a blank stare.
const PLOTS = [
  { dx: -7, dy: 0 }, { dx: 5, dy: 0 }, { dx: -8, dy: -4 }, { dx: 5, dy: -4 },
  { dx: -7, dy: 4 }, { dx: 5, dy: 4 }, { dx: -3, dy: 7 }, { dx: 2, dy: 7 },
  { dx: -11, dy: 2 }, { dx: 9, dy: 2 }, { dx: 0, dy: -7 }, { dx: -5, dy: -8 },
  { dx: 4, dy: -8 }, { dx: -11, dy: -3 }, { dx: 9, dy: -3 }, { dx: -1, dy: 10 },
];

// --- village level -----------------------------------------------------------
// Points come from what you have actually made: each building's weight times its
// tier, plus one point per two family missions finished. Thresholds are shown in
// the board so the number is never mysterious.
export const LEVEL_POINTS = [0, 0, 6, 14, 26, 42, 62, 88, 120, 160];
export const MAX_LEVEL = LEVEL_POINTS.length - 1;

export function points() {
  let p = 0;
  for (const b of builtList()) {
    const def = defFor(b.type);
    if (!def) continue;
    p += def.weight * Math.max(1, b.tier || 1);
  }
  const familyDone = (S.missions?.done || []).filter(d => {
    try { return Hooks.missions.catalogue?.find(m => m.id === d.id)?.kind === 'real'; }
    catch { return false; }
  }).length;
  p += Math.floor(familyDone / 2);
  return p;
}

export function levelFor(p) {
  let lv = 1;
  for (let i = 2; i <= MAX_LEVEL; i++) if (p >= LEVEL_POINTS[i]) lv = i;
  return lv;
}

export function level() { return levelFor(points()); }

export function progress() {
  const p = points(), lv = level();
  const at = LEVEL_POINTS[lv] || 0;
  const next = lv >= MAX_LEVEL ? null : LEVEL_POINTS[lv + 1];
  return {
    points: p, level: lv, from: at, next,
    frac: next === null ? 1 : clamp((p - at) / Math.max(1, next - at), 0, 1),
    remaining: next === null ? 0 : next - p,
  };
}

/** What opens up at a given level — used by the level-up banner and the build menu. */
export function unlocksAt(lv) {
  return DEFS.filter(d => (d.unlock?.level || 0) === lv).map(d => d.name);
}

// --- state ------------------------------------------------------------------
export function ensureState() {
  S.village ||= {};
  const v = S.village;
  if (!Array.isArray(v.buildings)) v.buildings = [];
  if (!Array.isArray(v.unlocked)) v.unlocked = ['hearthstone'];
  if (!Array.isArray(v.decor)) v.decor = [];
  if (!Array.isArray(v.paths)) v.paths = [];
  if (!Array.isArray(v.ledger)) v.ledger = [];
  if (!v.nextId) v.nextId = 1;
  // The village always has a heart.
  if (!v.buildings.some(b => b.type === 'hearthstone')) {
    v.buildings.unshift({
      id: 'b0', type: 'hearthstone', x: DEFAULT_HEARTH.x, y: DEFAULT_HEARTH.y,
      tier: 1, builtAt: 0, flip: false,
    });
  }
  for (const b of v.buildings) { b.tier = Math.max(1, b.tier || 1); b.id ||= 'b' + (v.nextId++); }
  v.level = level();
  return v;
}

export const hearth = () => {
  ensureState();
  return S.village.buildings.find(b => b.type === 'hearthstone')
    || { type: 'hearthstone', x: DEFAULT_HEARTH.x, y: DEFAULT_HEARTH.y, tier: 1 };
};

/** Plaza centre: the tile just in front of the Hearthstone door. */
export function plazaCentre() {
  const h = hearth(), d = defFor('hearthstone');
  return { x: h.x + Math.floor((d.w - 1) / 2), y: h.y + d.h };
}

export const doorOf = b => {
  const d = defFor(b.type);
  return { x: b.x + Math.floor((d.w - 1) / 2), y: b.y + d.h - 1 };
};
export const frontOf = b => { const dd = doorOf(b); return { x: dd.x, y: dd.y + 1 }; };
export const footprintOf = b => { const d = defFor(b.type); return { x: b.x, y: b.y, w: d.w, h: d.h }; };

export function buildingAt(x, y) {
  for (const b of builtList()) {
    const d = defFor(b.type);
    if (!d) continue;
    if (x >= b.x && x < b.x + d.w && y >= b.y && y < b.y + d.h) return b;
  }
  return null;
}

export function plotList() {
  const h = hearth();
  return PLOTS.map((p, i) => ({ i, x: h.x + p.dx, y: h.y + p.dy }));
}

// --- the map ----------------------------------------------------------------
let synth = null;
function synthMap() {
  synth ||= {
    id: VILLAGE_MAP, w: 46, h: 42, __synth: true,
    ground: () => null, over: () => null, tag: () => null, solid: () => false,
    bounds: { w: 46, h: 42 }, music: null, indoor: false, npcs: [],
  };
  return synth;
}

/** The map the village lives on: the world's if it has loaded, else a stand-in. */
export const isVillageMap = m => !!m && (m.id === VILLAGE_MAP || m.village);

function liveVillageMap() {
  let m = null;
  try { m = Hooks.world.currentMap?.(); } catch { m = null; }
  return isVillageMap(m) ? m : null;
}

export function activeMap() {
  return liveVillageMap() || synthMap();
}

const inBounds = (map, x, y) => x >= 0 && y >= 0 && x < (map.w || 46) && y < (map.h || 42);

function baseSolid(map, x, y) {
  if (!map || map.__synth) return false;
  try { return !!map.solid(x, y) && !buildingAt(x, y); } catch { return false; }
}

function baseTile(map, x, y, which = 'ground') {
  if (!map || map.__synth) return null;
  try {
    const g = map[which]?.(x, y);
    if (typeof g === 'string') return g;
    if (g && typeof g.name === 'string') return g.name;
  } catch { /* world still landing */ }
  return null;
}

// --- layout cache -----------------------------------------------------------
// Rebuilt only when the village actually changes. Nothing here allocates per frame.
const cache = {
  sig: null, mapId: null, lv: 1,
  finish: [], finishSet: new Map(),
  paths: [], pathSet: new Set(),
  decor: [], lamps: [],
  solid: new Set(), doors: new Map(),
  plots: [],
};

function signature() {
  const v = S.village;
  let s = `${level()}|${S.clock?.season || 'spring'}|`;
  for (const b of v.buildings) s += `${b.type},${b.x},${b.y},${b.tier},${b.flip ? 1 : 0};`;
  return s;
}

export function invalidate() {
  cache.sig = null;
  try { Hooks.hud.invalidateMinimap(); } catch {}
}

function ensureLayout(map) {
  const sig = signature() + '|' + (map?.id || '-');
  if (cache.sig === sig) return cache;
  cache.sig = sig;
  cache.lv = level();
  cache.mapId = map?.id || '-';
  buildSolids();
  buildFinish(map);
  buildPaths(map);
  buildDecor(map);
  buildVillagers();
  return cache;
}

function buildSolids() {
  cache.solid.clear();
  cache.doors.clear();
  for (const b of builtList()) {
    const d = defFor(b.type);
    if (!d) continue;
    const dd = doorOf(b);
    for (let yy = b.y; yy < b.y + d.h; yy++) {
      for (let xx = b.x; xx < b.x + d.w; xx++) {
        if (xx === dd.x && yy === dd.y) continue;      // doors are walkable
        cache.solid.add(xx + ',' + yy);
      }
    }
    cache.doors.set(dd.x + ',' + dd.y, b);
  }
}

// Radius of finished ground, by village level. This one array is the single most
// visible expression of progress in the whole game.
// Deliberately smaller than the screen even at max level: a village that has paved
// every tile in view has stopped reading as a village in a landscape.
const FINISH_R = [0, 2.2, 3.4, 4.6, 5.8, 7.0, 8.2, 9.4, 10.6, 11.6];

function finishRadius(lv) { return FINISH_R[clamp(lv, 0, MAX_LEVEL)] || 0; }

function buildFinish(map) {
  cache.finish.length = 0;
  cache.finishSet.clear();
  const lv = cache.lv;
  const c = plazaCentre();
  const r = finishRadius(lv);
  if (r <= 0) return;
  const R2 = Math.ceil(r) + 1;
  for (let y = c.y - R2; y <= c.y + R2; y++) {
    for (let x = c.x - R2 - 3; x <= c.x + R2 + 3; x++) {
      if (!inBounds(map, x, y)) continue;
      // Wider than tall: the plaza reads better on a 16:9 screen.
      const d = Math.hypot((x - c.x) * 0.72, (y - c.y) * 1.0);
      // A soft, hashed edge so the boundary never looks like a compass circle.
      const wobble = (hash2(x, y, 11) - 0.5) * 1.4;
      const edge = (d + wobble) / r;
      if (edge > 1) continue;
      // The outer fifth dissolves into the grass instead of stopping at a hard ring,
      // so the village looks like it grew outward rather than being stamped on.
      if (edge > 0.78 && hash2(x, y, 29) < (edge - 0.78) / 0.22 * 0.9) continue;
      if (baseSolid(map, x, y)) continue;
      let mat;
      if (lv >= 3 && d < r * 0.42) mat = 'plaza';
      else if (lv >= 2 && d < r * 0.74) mat = 'cobble';
      else mat = 'gravel';
      cache.finish.push({ x, y, mat });
      cache.finishSet.set(x + ',' + y, mat);
    }
  }
  // Mark the outer ring of plaza as edge stones.
  for (const t of cache.finish) {
    if (t.mat !== 'plaza') continue;
    const n = ['0,-1', '1,0', '0,1', '-1,0'].some(o => {
      const [ox, oy] = o.split(',').map(Number);
      return cache.finishSet.get((t.x + ox) + ',' + (t.y + oy)) !== 'plaza';
    });
    if (n) t.mat = 'plazaEdge';
  }
}

function buildPaths(map) {
  cache.paths.length = 0;
  cache.pathSet.clear();
  const lv = cache.lv;
  const c = plazaCentre();
  const add = (x, y) => {
    if (!inBounds(map, x, y)) return;
    if (cache.solid.has(x + ',' + y)) return;
    if (baseSolid(map, x, y)) return;
    const k = x + ',' + y;
    if (cache.pathSet.has(k)) return;
    cache.pathSet.add(k);
    cache.paths.push({ x, y, mask: 0 });
  };
  // A door-to-plaza path for every building.
  for (const b of builtList()) {
    if (b.type === 'hearthstone') continue;
    const f = frontOf(b);
    const horizFirst = ((b.x + b.y) & 1) === 0;
    let x = f.x, y = f.y;
    add(x, y);
    if (horizFirst) {
      for (; x !== c.x; x += Math.sign(c.x - x)) add(x, y);
      for (; y !== c.y; y += Math.sign(c.y - y)) add(x, y);
    } else {
      for (; y !== c.y; y += Math.sign(c.y - y)) add(x, y);
      for (; x !== c.x; x += Math.sign(c.x - x)) add(x, y);
    }
    add(c.x, c.y);
  }
  // The road out of the village, once there's a village to leave.
  if (lv >= 2) {
    const len = Math.min(14, 4 + lv * 2);
    for (let i = 0; i <= len; i++) add(c.x, c.y + i);
  }
  // Autotile masks: 1=N 2=E 4=S 8=W
  for (const t of cache.paths) {
    let m = 0;
    if (cache.pathSet.has(t.x + ',' + (t.y - 1))) m |= 1;
    if (cache.pathSet.has((t.x + 1) + ',' + t.y) ) m |= 2;
    if (cache.pathSet.has(t.x + ',' + (t.y + 1))) m |= 4;
    if (cache.pathSet.has((t.x - 1) + ',' + t.y) ) m |= 8;
    t.mask = m;
  }
}

// Cumulative: every plan at or below the current level is applied, in order, so
// decor stays put as the village grows and simply gets *more*.
const DECOR_PLAN = [
  { lv: 2, name: 't.planter', n: 2, where: 'edge' },
  { lv: 2, name: 't.bench', n: 1, where: 'path' },
  { lv: 3, name: 't.lamp', n: 3, where: 'path', lamp: true },
  { lv: 3, name: 't.flowerpot', n: 2, where: 'door' },
  { lv: 4, name: 't.banner', n: 4, where: 'path', anim: 3 },
  { lv: 4, name: 't.lamp', n: 2, where: 'edge', lamp: true },
  { lv: 4, name: 't.laundry', n: 1, where: 'edge', anim: 3 },
  { lv: 4, name: 't.bench', n: 1, where: 'path' },
  { lv: 5, name: 't.planter', n: 3, where: 'edge' },
  { lv: 5, name: 't.lamp', n: 3, where: 'path', lamp: true },
  { lv: 5, name: 't.cart', n: 1, where: 'edge' },
  { lv: 5, name: 't.mailbox', n: 1, where: 'door' },
  { lv: 6, name: 't.banner', n: 4, where: 'edge', anim: 3 },
  { lv: 6, name: 't.flowerpot', n: 4, where: 'door' },
  { lv: 6, name: 't.bench', n: 2, where: 'path' },
  { lv: 6, name: 't.beehive', n: 1, where: 'edge', anim: 2 },
  { lv: 7, name: 't.lamp', n: 4, where: 'edge', lamp: true },
  { lv: 7, name: 't.planter', n: 4, where: 'edge' },
  { lv: 7, name: 't.well', n: 1, where: 'edge' },
  { lv: 8, name: 't.banner', n: 6, where: 'path', anim: 3 },
];

function buildDecor(map) {
  cache.decor.length = 0;
  cache.lamps.length = 0;
  const lv = cache.lv;
  const c = plazaCentre();
  const used = new Set();

  // Candidate tiles, ordered by distance from the plaza then by a stable hash, so
  // the inner spots are always chosen first and never move.
  const cands = [];
  for (const t of cache.finish) {
    const k = t.x + ',' + t.y;
    if (cache.solid.has(k)) continue;
    if (cache.pathSet.has(k)) continue;
    if (t.x === c.x && t.y === c.y) continue;
    const d = Math.hypot(t.x - c.x, t.y - c.y);
    const nearPath = ['0,-1', '1,0', '0,1', '-1,0'].some(o => {
      const [ox, oy] = o.split(',').map(Number);
      return cache.pathSet.has((t.x + ox) + ',' + (t.y + oy));
    });
    cands.push({ x: t.x, y: t.y, d, nearPath, h: hash2(t.x, t.y, 3) });
  }
  cands.sort((a, b) => a.d - b.d || a.h - b.h);

  const doorSpots = [];
  for (const b of builtList()) {
    const dd = doorOf(b);
    for (const ox of [-1, 1]) {
      const x = dd.x + ox, y = dd.y + 1;
      if (!inBounds(map, x, y)) continue;
      const k = x + ',' + y;
      if (cache.solid.has(k) || cache.pathSet.has(k) || baseSolid(map, x, y)) continue;
      doorSpots.push({ x, y, d: 0, nearPath: true, h: hash2(x, y, 5) });
    }
  }
  doorSpots.sort((a, b) => a.h - b.h);

  const pick = (where) => {
    const pool = where === 'door' ? doorSpots : cands;
    for (const s of pool) {
      const k = s.x + ',' + s.y;
      if (used.has(k)) continue;
      if (where === 'path' && !s.nearPath) continue;
      if (where === 'edge' && s.d < 2.2) continue;
      used.add(k);
      return s;
    }
    // Fall back to any free candidate rather than silently dropping decor.
    for (const s of cands) {
      const k = s.x + ',' + s.y;
      if (!used.has(k)) { used.add(k); return s; }
    }
    return null;
  };

  for (const plan of DECOR_PLAN) {
    if (plan.lv > lv) continue;
    for (let i = 0; i < plan.n; i++) {
      const s = pick(plan.where);
      if (!s) break;
      const item = { x: s.x, y: s.y, name: plan.name, lamp: !!plan.lamp, anim: plan.anim || 1 };
      cache.decor.push(item);
      if (item.lamp) cache.lamps.push(item);
    }
  }
  // Player-placed decor from state (kept for future decorating tools).
  for (const d of (S.village.decor || [])) {
    if (d && typeof d.x === 'number') cache.decor.push({ x: d.x, y: d.y, name: d.name, lamp: !!d.lamp, anim: d.anim || 1 });
  }
}

// --- villagers ---------------------------------------------------------------
// Who lives here is derived from what's built: every building that attracts
// somebody puts them on the street. More buildings + higher tiers = a busier village.
const villagers = [];
let villagerSig = null;
let villagerTick = -1;

function rosterFor() {
  const lv = cache.lv;
  const out = [];
  for (const b of builtList()) {
    const def = defFor(b.type);
    if (!def?.villager) continue;
    const n = def.id === 'cottage' ? Math.min(3, b.tier) : (b.tier >= 2 ? 2 : 1);
    for (let i = 0; i < n; i++) out.push({ who: def.villager, home: frontOf(b), idx: i });
  }
  if (lv >= 2) out.push({ who: 'mayor', home: plazaCentre(), idx: 0 });
  if (lv >= 2) out.push({ who: 'kid', home: plazaCentre(), idx: 1 });
  if (lv >= 4) out.push({ who: 'twin', home: plazaCentre(), idx: 2 });
  if (lv >= 5) out.push({ who: 'weaver', home: plazaCentre(), idx: 3 });
  return out.slice(0, 12);
}

function buildVillagers() {
  const roster = rosterFor();
  const sig = roster.map(r => r.who + r.home.x + ',' + r.home.y + r.idx).join('|');
  if (sig === villagerSig) return;
  villagerSig = sig;
  villagers.length = 0;
  const rng = makeRng(1337);
  roster.forEach((r, i) => {
    const ox = rng.int(-2, 2), oy = rng.int(-1, 2);
    villagers.push({
      who: r.who,
      x: r.home.x + ox, y: r.home.y + oy,
      px: (r.home.x + ox) * TILE, py: (r.home.y + oy) * TILE,
      tx: r.home.x + ox, ty: r.home.y + oy,
      dir: DIRS[rng.int(0, 3)], moving: 0, wait: rng.int(20, 140),
      home: r.home, radius: 3 + (i % 3), seed: 500 + i * 37, frame: 0,
    });
  });
}

function syncVillagers(map) {
  const t = Loop.tick;
  if (villagerTick === t) return;
  const steps = villagerTick < 0 ? 1 : clamp(t - villagerTick, 0, 4);
  villagerTick = t;
  for (let s = 0; s < steps; s++) stepVillagers(map);
}

function stepVillagers(map) {
  const STEP_FRAMES = 22;
  for (const v of villagers) {
    if (v.moving > 0) {
      v.moving--;
      const f = 1 - v.moving / STEP_FRAMES;
      v.px = (v.x + (v.tx - v.x) * f) * TILE;
      v.py = (v.y + (v.ty - v.y) * f) * TILE;
      v.frame = Math.floor((1 - v.moving / STEP_FRAMES) * 4) % 4;
      if (v.moving === 0) { v.x = v.tx; v.y = v.ty; v.px = v.x * TILE; v.py = v.y * TILE; v.frame = 0; }
      continue;
    }
    if (v.wait > 0) { v.wait--; v.frame = 0; continue; }
    // Choose a neighbouring tile inside the wander radius that isn't blocked.
    const r = makeRng(v.seed = (v.seed * 1103515245 + 12345) >>> 0);
    const order = r.shuffle(['up', 'down', 'left', 'right']);
    for (const dir of order) {
      const dx = dir === 'left' ? -1 : dir === 'right' ? 1 : 0;
      const dy = dir === 'up' ? -1 : dir === 'down' ? 1 : 0;
      const nx = v.x + dx, ny = v.y + dy;
      if (Math.hypot(nx - v.home.x, ny - v.home.y) > v.radius) continue;
      if (!inBounds(map, nx, ny)) continue;
      if (cache.solid.has(nx + ',' + ny)) continue;
      if (baseSolid(map, nx, ny)) continue;
      v.dir = dir; v.tx = nx; v.ty = ny; v.moving = STEP_FRAMES;
      break;
    }
    if (v.moving === 0) v.wait = 30 + (v.seed % 90);
  }
}

// --- fallback art (so everything is judgeable before art lands) --------------
const fbCache = new Map();
function fbCanvas(key, w, h, paint) {
  let c = fbCache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  paint(ctx, w, h);
  fbCache.set(key, c);
  return c;
}

function groundFallback(kind, season) {
  return fbCanvas('g:' + kind + ':' + season, TILE, TILE, (ctx) => {
    const speck = (col, n, seed) => {
      ctx.fillStyle = col;
      for (let i = 0; i < n; i++) {
        const h1 = hash2(i, seed, 1), h2 = hash2(seed, i, 2);
        ctx.fillRect(Math.floor(h1 * 16), Math.floor(h2 * 16), 1, 1);
      }
    };
    if (kind === 'grass') {
      ctx.fillStyle = seasonize(P.grass1, season); ctx.fillRect(0, 0, 16, 16);
      speck(seasonize(P.grass2, season), 26, 7);
      speck(seasonize(P.grass0, season), 14, 9);
    } else if (kind === 'gravel') {
      ctx.fillStyle = P.soil0; ctx.fillRect(0, 0, 16, 16);
      speck(P.soil1, 40, 3); speck(P.sand1, 22, 4); speck(P.soil2, 12, 8);
    } else if (kind === 'cobble') {
      ctx.fillStyle = P.rock3; ctx.fillRect(0, 0, 16, 16);
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        const o = (y % 2) * 2;
        const cx = ((x * 4 + o) % 16), cy = y * 4;
        ctx.fillStyle = hash2(cx, cy, 6) > 0.5 ? P.rock1 : P.rock2;
        ctx.fillRect(cx, cy, 3, 3);
        ctx.fillStyle = P.rock0;
        ctx.fillRect(cx, cy, 3, 1);
      }
    } else if (kind === 'plaza' || kind === 'plazaEdge') {
      ctx.fillStyle = P.sand3; ctx.fillRect(0, 0, 16, 16);
      for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
        ctx.fillStyle = (x + y) % 2 ? P.sand1 : P.sand0;
        ctx.fillRect(x * 8, y * 8, 7, 7);
        ctx.fillStyle = P.sand2;
        ctx.fillRect(x * 8, y * 8 + 6, 7, 1);
      }
      if (kind === 'plazaEdge') { ctx.fillStyle = P.sand3; ctx.fillRect(0, 14, 16, 2); }
    } else { // path
      ctx.fillStyle = P.sand2; ctx.fillRect(0, 0, 16, 16);
      speck(P.sand1, 30, 5); speck(P.sand3, 16, 6);
    }
  });
}

function buildingPlaceholder(def, tier) {
  const w = def.w * TILE, h = (def.h + def.overhang) * TILE;
  return fbCanvas(`b:${def.id}:${tier}`, w, h, (ctx) => {
    ctx.fillStyle = '#ff33cc';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#9c0072';
    for (let y = 0; y < h; y += 4) for (let x = (y / 4 % 2) * 4; x < w; x += 8) ctx.fillRect(x, y, 4, 2);
    ctx.fillStyle = '#2b2118';
    ctx.fillRect(0, 0, w, 1); ctx.fillRect(0, h - 1, w, 1);
    ctx.fillRect(0, 0, 1, h); ctx.fillRect(w - 1, 0, 1, h);
    // Footprint / overhang divider so the sort origin is obvious while art is missing.
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 0.55;
    ctx.fillRect(0, def.overhang * TILE, w, 1);
    ctx.globalAlpha = 1;
  });
}

const DECOR_FB = {
  't.lamp': (ctx, lit) => {
    ctx.fillStyle = P.wood3; ctx.fillRect(7, 5, 2, 11);
    ctx.fillStyle = P.rock3; ctx.fillRect(6, 15, 4, 1);
    ctx.fillStyle = lit ? P.gold0 : P.rock1; ctx.fillRect(5, 2, 6, 4);
    ctx.fillStyle = P.wood4; ctx.fillRect(5, 1, 6, 1);
  },
  't.planter': (ctx) => {
    ctx.fillStyle = P.wood2; ctx.fillRect(2, 8, 12, 7);
    ctx.fillStyle = P.wood1; ctx.fillRect(2, 8, 12, 2);
    ctx.fillStyle = P.soil2; ctx.fillRect(3, 10, 10, 2);
    ctx.fillStyle = P.leaf1; ctx.fillRect(4, 6, 2, 4); ctx.fillRect(8, 5, 2, 5); ctx.fillRect(11, 7, 2, 3);
    ctx.fillStyle = P.bloom1; ctx.fillRect(8, 3, 2, 2); ctx.fillRect(4, 4, 2, 2);
  },
  't.bench': (ctx) => {
    ctx.fillStyle = P.wood1; ctx.fillRect(1, 9, 14, 3);
    ctx.fillStyle = P.wood2; ctx.fillRect(1, 5, 14, 2);
    ctx.fillStyle = P.wood3; ctx.fillRect(2, 12, 2, 3); ctx.fillRect(12, 12, 2, 3);
    ctx.fillStyle = P.wood3; ctx.fillRect(2, 6, 1, 4); ctx.fillRect(13, 6, 1, 4);
  },
  't.banner': (ctx, lit, f) => {
    const sway = [0, 1, 0, -1][f % 4] || 0;
    ctx.fillStyle = P.wood3; ctx.fillRect(3, 0, 2, 16);
    ctx.fillStyle = P.roof1; ctx.fillRect(5 + sway, 2, 8, 8);
    ctx.fillStyle = P.roof0; ctx.fillRect(5 + sway, 2, 8, 2);
    ctx.fillStyle = P.gold1; ctx.fillRect(8 + sway, 5, 2, 2);
    ctx.fillStyle = P.roof2;
    ctx.fillRect(5 + sway, 10, 3, 2); ctx.fillRect(10 + sway, 10, 3, 2);
  },
  't.flowerpot': (ctx) => {
    ctx.fillStyle = P.soil1; ctx.fillRect(5, 10, 6, 5);
    ctx.fillStyle = P.soil0; ctx.fillRect(4, 9, 8, 2);
    ctx.fillStyle = P.leaf2; ctx.fillRect(7, 6, 2, 4);
    ctx.fillStyle = P.bloom1; ctx.fillRect(6, 4, 4, 3);
    ctx.fillStyle = P.bloom0; ctx.fillRect(7, 5, 2, 1);
  },
  't.laundry': (ctx, lit, f) => {
    const s = [0, 1, 1, 0][f % 4] || 0;
    ctx.fillStyle = P.wood3; ctx.fillRect(0, 3, 16, 1);
    ctx.fillStyle = P.paper0; ctx.fillRect(2, 4, 4, 6 + s);
    ctx.fillStyle = P.roofB0; ctx.fillRect(7, 4, 3, 5 - s);
    ctx.fillStyle = P.bloom0; ctx.fillRect(11, 4, 4, 6);
  },
  't.mailbox': (ctx) => {
    ctx.fillStyle = P.wood3; ctx.fillRect(7, 8, 2, 8);
    ctx.fillStyle = P.roofB1; ctx.fillRect(4, 4, 8, 5);
    ctx.fillStyle = P.roofB0; ctx.fillRect(4, 4, 8, 1);
    ctx.fillStyle = P.gold2; ctx.fillRect(11, 5, 1, 3);
  },
  't.cart': (ctx) => {
    ctx.fillStyle = P.wood2; ctx.fillRect(1, 6, 14, 6);
    ctx.fillStyle = P.wood1; ctx.fillRect(1, 6, 14, 2);
    ctx.fillStyle = P.wood4; ctx.fillRect(3, 12, 4, 4); ctx.fillRect(9, 12, 4, 4);
    ctx.fillStyle = P.sand1; ctx.fillRect(4, 3, 8, 3);
  },
  't.beehive': (ctx, lit, f) => {
    ctx.fillStyle = P.gold3; ctx.fillRect(3, 5, 10, 10);
    ctx.fillStyle = P.gold2; ctx.fillRect(3, 5, 10, 3); ctx.fillRect(3, 11, 10, 2);
    ctx.fillStyle = P.ink; ctx.fillRect(7, 12, 2, 2);
    ctx.fillStyle = P.spark1; ctx.fillRect(2 + (f % 3), 3, 1, 1); ctx.fillRect(13 - (f % 2), 6, 1, 1);
  },
  't.well': (ctx) => {
    ctx.fillStyle = P.rock2; ctx.fillRect(2, 8, 12, 7);
    ctx.fillStyle = P.rock1; ctx.fillRect(2, 8, 12, 2);
    ctx.fillStyle = P.water3; ctx.fillRect(4, 10, 8, 3);
    ctx.fillStyle = P.wood3; ctx.fillRect(3, 1, 1, 8); ctx.fillRect(12, 1, 1, 8);
    ctx.fillStyle = P.roof2; ctx.fillRect(1, 0, 14, 3);
  },
};

function decorFallback(name, lit, frame) {
  const painter = DECOR_FB[name];
  return fbCanvas(`d:${name}:${lit ? 1 : 0}:${frame}`, TILE, TILE, (ctx) => {
    if (painter) { painter(ctx, lit, frame); return; }
    ctx.fillStyle = P.wood2; ctx.fillRect(3, 6, 10, 9);
    ctx.fillStyle = P.wood1; ctx.fillRect(3, 6, 10, 2);
    ctx.fillStyle = P.wood4; ctx.fillRect(3, 10, 10, 1);
  });
}

const CHAR_TINT = {
  mayor: P.violet2, gran: P.bloom2, kid: P.spark2, farmer: P.leaf2, smith: P.rock3,
  baker: P.roof1, fisher: P.water3, ranger: P.leaf3, weaver: P.violet1,
  peddler: P.gold2, twin: P.roofB1, hero: P.roof2, rival: P.ink2,
};

function charFallback(who, dir, frame) {
  const col = CHAR_TINT[who] || P.wood2;
  return fbCanvas(`c:${who}:${dir}:${frame}`, 16, 24, (ctx) => {
    const bob = frame === 1 ? -1 : frame === 3 ? 1 : 0;
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(4, 22, 8, 2);
    ctx.fillStyle = col;
    ctx.fillRect(4, 12 + bob, 8, 10);
    ctx.fillStyle = mix(col, '#ffffff', 0.25);
    ctx.fillRect(4, 12 + bob, 8, 2);
    ctx.fillStyle = P.sand0;
    ctx.fillRect(4, 5 + bob, 8, 8);
    ctx.fillStyle = P.ink;
    if (dir !== 'up') { ctx.fillRect(6, 9 + bob, 1, 1); ctx.fillRect(9, 9 + bob, 1, 1); }
    ctx.fillStyle = mix(col, '#000000', 0.35);
    ctx.fillRect(3, 3 + bob, 10, 3);
    ctx.fillStyle = P.ink2;
    ctx.fillRect(4, 22 + Math.min(0, bob), 3, 2); ctx.fillRect(9, 22 + Math.min(0, bob), 3, 2);
  });
}

// --- immediate-mode painters -------------------------------------------------
// These draw straight to a ctx so both the Hooks (via R.layer) and my own scenes
// (which need clipping and a camera they control) can use exactly the same code.

const season = () => S.clock?.season || 'spring';
export const isNight = () => { const h = S.clock?.hour ?? 12; return h >= 19 || h < 6; };
const nightAmount = () => {
  const h = S.clock?.hour ?? 12;
  if (h >= 20 || h < 5) return 1;
  if (h >= 18) return (h - 18) / 2;
  if (h < 6) return 1 - (h - 5);
  return 0;
};

function tileImg(name, frame = 0) { return Atlas.tryGet(name, frame); }

export function paintBase(ctx, map, cam, view) {
  const x0 = Math.floor(cam.x / TILE) - 1, y0 = Math.floor(cam.y / TILE) - 1;
  const x1 = Math.ceil((cam.x + view.w) / TILE) + 1, y1 = Math.ceil((cam.y + view.h) / TILE) + 1;
  const sea = season();
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const sx = x * TILE - cam.x, sy = y * TILE - cam.y;
      if (!inBounds(map, x, y)) { ctx.fillStyle = P.leaf4; ctx.fillRect(sx, sy, TILE, TILE); continue; }
      const real = baseTile(map, x, y, 'ground');
      let img = real ? tileImg(real) : null;
      if (!img) {
        const v = hash2(x, y, 21);
        const alt = v > 0.86 ? 't.grass.c' : v > 0.68 ? 't.grass.b' : v > 0.42 ? 't.grass.a' : 't.grass';
        img = tileImg(alt);
      }
      if (img) ctx.drawImage(img, sx, sy, img.logicalWidth || img.width, img.logicalHeight || img.height);
      else ctx.drawImage(groundFallback('grass', sea), sx, sy);
    }
  }
}

export function paintFinish(ctx, map, cam, view) {
  const sea = season();
  for (const t of cache.finish) {
    const sx = t.x * TILE - cam.x, sy = t.y * TILE - cam.y;
    if (sx < -TILE || sy < -TILE || sx > view.w || sy > view.h) continue;
    const name = t.mat === 'plaza' ? 't.plaza' : t.mat === 'plazaEdge' ? 't.plaza.edge'
      : t.mat === 'cobble' ? 't.cobble' : 't.gravel';
    const img = tileImg(name);
    if (img) ctx.drawImage(img, sx, sy, img.logicalWidth || img.width, img.logicalHeight || img.height);
    else ctx.drawImage(groundFallback(t.mat, sea), sx, sy);
  }
}

export function paintPaths(ctx, map, cam, view) {
  const lv = cache.lv;
  for (const t of cache.paths) {
    const sx = t.x * TILE - cam.x, sy = t.y * TILE - cam.y;
    if (sx < -TILE || sy < -TILE || sx > view.w || sy > view.h) continue;
    let img = lv >= 2 ? tileImg(`t.path.m${t.mask}`) : null;
    if (!img) img = tileImg('t.path.m15');
    if (img) ctx.drawImage(img, sx, sy, img.logicalWidth || img.width, img.logicalHeight || img.height);
    else ctx.drawImage(groundFallback(lv >= 3 ? 'plaza' : 'path', season()), sx, sy);
  }
}

export function paintDecor(ctx, map, cam, view) {
  const lit = isNight();
  const f = Math.floor(Loop.tick / 14);
  for (const d of cache.decor) {
    const sx = d.x * TILE - cam.x, sy = d.y * TILE - cam.y;
    if (sx < -TILE || sy < -TILE * 2 || sx > view.w || sy > view.h) continue;
    const name = d.lamp && lit ? 't.lamp.lit' : d.name;
    let img = tileImg(name, d.anim > 1 ? f % d.anim : 0);
    if (!img && d.lamp) img = tileImg('t.lamp');
    if (img) ctx.drawImage(img, sx, sy, img.logicalWidth || img.width, img.logicalHeight || img.height);
    else ctx.drawImage(decorFallback(d.name, d.lamp && lit, f % 4), sx, sy);
  }
}

/** One building, drawn with its bottom row on tile row (b.y + h - 1). */
export function drawBuilding(ctx, b, sx, sy, opts = {}) {
  const def = defFor(b.type);
  if (!def) return;
  const tier = clamp(b.tier || 1, 1, def.tiers);
  const img = Atlas.tryGet(def.sprite(tier));
  const alpha = opts.alpha ?? 1;
  const prev = ctx.globalAlpha;
  if (alpha < 1) ctx.globalAlpha = alpha;
  if (img) {
    if (b.flip) {
      ctx.save();
      ctx.translate(sx + (img.logicalWidth || img.width), sy);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0, img.logicalWidth || img.width, img.logicalHeight || img.height);
      ctx.restore();
    } else ctx.drawImage(img, sx, sy, img.logicalWidth || img.width, img.logicalHeight || img.height);
  } else {
    ctx.drawImage(buildingPlaceholder(def, tier), sx, sy);
    ctx.globalAlpha = alpha;
    R.text(def.id, sx + (def.w * TILE) / 2, sy + 3, { align: 'center', color: '#fff', shadow: '#000' });
    R.text('t' + tier, sx + (def.w * TILE) / 2, sy + 13, { align: 'center', color: '#ffd0f4', shadow: '#000' });
  }
  ctx.globalAlpha = prev;
}

function chimneyOf(b, def) {
  return {
    x: b.x * TILE + (b.flip ? 4 : def.w * TILE - 10),
    y: (b.y - def.overhang) * TILE - 6,
  };
}

export function paintBuildingExtras(ctx, b, cam, view) {
  const def = defFor(b.type);
  if (!def) return;
  const lv = cache.lv;
  // Chimney smoke: homes always, everything else once the village is properly alive.
  const smokey = b.type === 'cottage' || b.type === 'kitchen' || b.type === 'bathhouse'
    || (lv >= 4 && (b.type === 'workshop' || b.type === 'infirmary'));
  if (smokey) {
    const c = chimneyOf(b, def);
    const sx = c.x - cam.x, sy = c.y - cam.y;
    if (sx > -20 && sy > -24 && sx < view.w && sy < view.h) {
      const f = Math.floor(Loop.tick / 9);
      const img = Atlas.tryGet('fx.smoke', f % 4);
      if (img) ctx.drawImage(img, sx - 8, sy - 8, img.logicalWidth || img.width, img.logicalHeight || img.height);
      else {
        const prev = ctx.globalAlpha;
        for (let i = 0; i < 3; i++) {
          const t = ((Loop.tick / 3 + i * 12) % 36) / 36;
          ctx.globalAlpha = (1 - t) * 0.45;
          ctx.fillStyle = P.rock0;
          const r = 2 + t * 3;
          ctx.fillRect(Math.round(sx + Math.sin(t * 5 + i) * 3 - r / 2), Math.round(sy - t * 18), Math.round(r), Math.round(r));
        }
        ctx.globalAlpha = prev;
      }
    }
  }
}

export function paintVillagers(ctx, map, cam, view, sortEntity) {
  syncVillagers(map);
  for (const v of villagers) {
    const sx = Math.round(v.px - cam.x), sy = Math.round(v.py - cam.y) - 8;
    if (sx < -20 || sy < -28 || sx > view.w + 4 || sy > view.h + 4) continue;
    const img = Atlas.tryGet(`c.${v.who}.${v.dir}`, v.frame)
      || Atlas.tryGet(`c.${v.who}.down`, v.frame);
    const draw = (c) => {
      const sh = Atlas.tryGet('fx.shadow');
      if (sh) { const p = c.globalAlpha; c.globalAlpha = 0.5; c.drawImage(sh, sx, sy + 18); c.globalAlpha = p; }
      if (img) c.drawImage(img, sx, sy, img.logicalWidth || img.width, img.logicalHeight || img.height);
      else c.drawImage(charFallback(v.who, v.dir, v.frame), sx, sy);
    };
    if (sortEntity) sortEntity(v.py + 16, draw);
    else draw(ctx);
  }
}

/** Warm windows and lamp pools after dark. Drawn additively, above everything. */
export function paintLights(ctx, map, cam, view) {
  const n = nightAmount();
  if (n <= 0.02) return;
  const saveCtx = ctx;
  for (const l of cache.lamps) {
    const sx = l.x * TILE - cam.x + 8, sy = l.y * TILE - cam.y + 4;
    if (sx < -30 || sy < -30 || sx > view.w + 30 || sy > view.h + 30) continue;
    glowAt(saveCtx, sx, sy, 26, '#ffd79a', 0.4 * n);
  }
  for (const b of builtList()) {
    const def = defFor(b.type);
    if (!def) continue;
    const sx = b.x * TILE - cam.x + def.w * TILE / 2;
    const sy = (b.y - def.overhang * 0.4) * TILE - cam.y + 8;
    if (sx < -40 || sy < -40 || sx > view.w + 40 || sy > view.h + 40) continue;
    glowAt(saveCtx, sx, sy, 12 + def.w * 5 + (b.tier || 1) * 3, '#ffca7a', (0.22 + 0.075 * (b.tier || 1)) * n);

  }
}

function glowAt(ctx, x, y, r, color, alpha) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = alpha;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
}

// Reusable sort buffer — no per-frame allocation in the draw path.
const sortBuf = [];

/**
 * Paint the whole village world immediately into `ctx`. Used by the build scene and
 * by the board's backdrop; the Hooks use the individual painters instead so the
 * world's own y-sorting stays in charge.
 */
export function paintVillage(ctx, cam, view, opts = {}) {
  const map = opts.map || activeMap();
  ensureState();
  ensureLayout(map);
  if (opts.base !== false) paintBase(ctx, map, cam, view);
  paintFinish(ctx, map, cam, view);
  paintPaths(ctx, map, cam, view);
  paintDecor(ctx, map, cam, view);

  sortBuf.length = 0;
  for (const b of builtList()) {
    const def = defFor(b.type);
    if (!def) continue;
    const sx = b.x * TILE - cam.x;
    const sy = (b.y - def.overhang) * TILE - cam.y;
    if (sx > view.w || sy > view.h || sx + def.w * TILE < 0 || sy + (def.h + def.overhang) * TILE < 0) continue;
    sortBuf.push({ y: (b.y + def.h) * TILE, b, sx, sy });
  }
  sortBuf.sort((a, b) => a.y - b.y);
  for (const it of sortBuf) {
    drawBuilding(ctx, it.b, it.sx, it.sy, { alpha: opts.buildingAlpha ?? 1 });
    paintBuildingExtras(ctx, it.b, cam, view);
  }
  paintVillagers(ctx, map, cam, view, null);
  if (opts.lights !== false) paintLights(ctx, map, cam, view);
  return map;
}

// --- placement validation ----------------------------------------------------
const vTiles = [];

/**
 * Can `type` stand with its origin at (x, y)?
 * Returns { ok, reason, tiles:[{x,y,ok}] } — the per-tile flags drive the tile-by-tile
 * footprint outline in build mode, which is what makes placement feel tactile.
 */
export function validate(type, x, y, opts = {}) {
  const def = defFor(type);
  const map = opts.map || activeMap();
  ensureState();
  ensureLayout(map);
  vTiles.length = 0;
  if (!def) return { ok: false, reason: 'Unknown building.', tiles: vTiles };

  let ok = true, reason = '';
  const ignore = opts.ignoreId || null;
  const player = opts.player || null;

  const blockedBy = (xx, yy) => {
    const b = buildingAt(xx, yy);
    return b && b.id !== ignore ? b : null;
  };

  for (let yy = y; yy < y + def.h; yy++) {
    for (let xx = x; xx < x + def.w; xx++) {
      let tileOk = true, why = '';
      if (!inBounds(map, xx, yy) || xx < 1 || yy < 1 || xx > (map.w - 2) || yy > (map.h - 2)) {
        tileOk = false; why = 'Too close to the edge of the map.';
      } else if (blockedBy(xx, yy)) {
        tileOk = false; why = `A ${defFor(blockedBy(xx, yy).type)?.name || 'building'} is already here.`;
      } else if (baseSolid(map, xx, yy)) {
        tileOk = false; why = 'The ground here is taken — try a clear patch.';
      } else if (player && player.x === xx && player.y === yy) {
        tileOk = false; why = 'You are standing there!';
      }
      vTiles.push({ x: xx, y: yy, ok: tileOk });
      if (!tileOk) { ok = false; if (!reason) reason = why; }
    }
  }
  // Roof overhang must fit on the map too.
  if (y - def.overhang < 0) { ok = false; reason = reason || 'The roof would hang off the map.'; }

  // The door needs somewhere to open onto.
  const dx = x + Math.floor((def.w - 1) / 2), dy = y + def.h;
  if (ok) {
    if (!inBounds(map, dx, dy) || blockedBy(dx, dy) || baseSolid(map, dx, dy)) {
      ok = false; reason = 'The door needs a clear tile in front of it.';
    }
  }
  if (ok) {
    const r = ruleOk(type, x, y, {
      hearth: plazaCentre(),
      neighbours: (bx, by, bw, bh) => {
        let n = 0;
        for (let yy = by - 1; yy <= by + bh; yy++) {
          for (let xx = bx - 1; xx <= bx + bw; xx++) {
            if (xx >= bx && xx < bx + bw && yy >= by && yy < by + bh) continue;
            const b = blockedBy(xx, yy);
            if (b) n++;
          }
        }
        return n;
      },
    });
    if (!r.ok) { ok = false; reason = r.reason; }
  }
  return { ok, reason, tiles: vTiles, door: { x: dx, y: dy } };
}

/** First plot where `type` fits — where build mode starts its cursor. */
export function firstValidPlot(type, opts = {}) {
  const def = defFor(type);
  for (const p of plotList()) {
    if (validate(type, p.x, p.y, opts).ok) return { x: p.x, y: p.y };
  }
  // Spiral out from the plaza looking for anywhere at all.
  const c = plazaCentre();
  for (let r = 2; r < 16; r++) {
    for (let a = 0; a < 24; a++) {
      const th = (a / 24) * Math.PI * 2;
      const x = Math.round(c.x + Math.cos(th) * r * 1.3) - Math.floor(def.w / 2);
      const y = Math.round(c.y + Math.sin(th) * r) - Math.floor(def.h / 2);
      if (validate(type, x, y, opts).ok) return { x, y };
    }
  }
  return { x: c.x - Math.floor(def.w / 2), y: c.y - def.h - 2 };
}

// --- mutation ----------------------------------------------------------------
let lastLevel = null;

export function recompute({ celebrate = true } = {}) {
  ensureState();
  const lv = level();
  const prev = lastLevel === null ? (S.village.level || lv) : lastLevel;
  S.village.level = lv;
  lastLevel = lv;
  invalidate();
  if (celebrate && lv > prev) celebrateLevel(prev, lv);
  return lv;
}

export function celebrateLevel(from, to) {
  Bus.emit(EV.VILLAGE_LEVEL, { level: to, from });
  R.flash(P.gold0, 8);
  R.shake(2, 12);
  try { Audio.sfx('chime'); } catch {}
  ringBell(3);
  try { UIx.toast(`Village Level ${to}!`, { ms: 2800, icon: 'ui.star' }); } catch {}
  if (Scenes.has('__villagelevel')) {
    try { Scenes.push('__villagelevel', { from, to }); } catch {}
  }
}

/** The bell tower answers when the village grows — if it's been built. */
export function ringBell(times = 1) {
  if (!countOf('belltower')) return false;
  for (let i = 0; i < times; i++) {
    setTimeout(() => { try { Audio.sfx('chime', { rate: 0.55, gain: 1.3 }); } catch {} }, i * 420);
  }
  return true;
}

/** Commit a placement. Assumes cost has already been checked; charges it here. */
export function place(type, x, y, { flip = false, free = false } = {}) {
  ensureState();
  const def = defFor(type);
  if (!def) return null;
  const access = unlockState(type, level());
  if (!access.unlocked || countOf(type) >= maxCount(type, level())) return null;
  const map = liveVillageMap();
  if (!map) return null;
  let player = null;
  try { player = Hooks.world.playerTile(); } catch {}
  const fit = validate(type, x, y, { map, player });
  if (!fit.ok) return null;
  const c = costToBuild(type);
  if (!free && !Economy.spend(c, `built ${def.name}`)) return null;
  const b = { id: 'b' + (S.village.nextId++), type, x, y, tier: 1, builtAt: S.clock?.day ?? 0, flip };
  S.village.buildings.push(b);
  S.stats && (S.stats.built = (S.stats.built || 0) + 1);
  if (!S.village.unlocked.includes(type)) S.village.unlocked.push(type);
  invalidate();
  Bus.emit(EV.BUILDING_PLACED, { building: b, type, cost: c });
  try { Hooks.missions.note('built', { type, tier: 1 }); } catch {}
  recompute();
  save();
  return b;
}

export function upgrade(b) {
  ensureState();
  if (!b || !S.village.buildings.includes(b)) return false;
  const def = defFor(b.type);
  if (!def) return false;
  const tier = b.tier || 1;
  if (tier >= def.tiers) return false;
  const c = costToUpgrade(b.type, tier);
  if (!Economy.spend(c, `upgraded ${def.name}`)) return false;
  b.tier = tier + 1;
  invalidate();
  Bus.emit(EV.BUILDING_UPGRADED, { building: b, type: b.type, tier: b.tier, cost: c });
  try { Hooks.missions.note('upgraded', { type: b.type, tier: b.tier }); } catch {}
  recompute();
  save();
  return true;
}

export function relocate(b, x, y) {
  ensureState();
  if (!b || !S.village.buildings.includes(b) || b.type === 'hearthstone') return false;
  const map = liveVillageMap();
  if (!map) return false;
  let player = null;
  try { player = Hooks.world.playerTile(); } catch {}
  const fit = validate(b.type, x, y, { map, player, ignoreId: b.id });
  if (!fit.ok) return false;
  b.x = x; b.y = y;
  invalidate();
  recompute({ celebrate: false });
  save();
  return true;
}

export function demolish(b) {
  const i = S.village.buildings.indexOf(b);
  if (i < 0 || b.type === 'hearthstone') return false;
  S.village.buildings.splice(i, 1);
  // Half the materials come back — never punish experimenting with the layout.
  const def = defFor(b.type);
  let coins = 0, hearth = 0;
  for (let t = 0; t < (b.tier || 1); t++) { coins += def.costs[t].coins; hearth += def.costs[t].hearth; }
  Economy.earn({ coins: Math.floor(coins / 2), hearth: Math.floor(hearth / 2) }, `salvaged ${def.name}`);
  invalidate();
  recompute({ celebrate: false });
  save();
  return true;
}

export function unlock(type) {
  ensureState();
  if (!S.village.unlocked.includes(type)) {
    S.village.unlocked.push(type);
    setFlag('unlock.' + type, true);
    invalidate();
    return true;
  }
  return false;
}

// --- interaction -------------------------------------------------------------
async function openBuildingMenu(b) {
  const def = defFor(b.type);
  const tier = b.tier || 1;
  await UIx.say(def.doorLine, { speaker: `${def.name}  Lv ${tier}` });
  const canUp = tier < def.tiers;
  const choices = [];
  if (canUp) choices.push(`Upgrade to Level ${tier + 1}`);
  choices.push('What does it do?');
  const action = buildingActionLabel(b.type);
  if (action) choices.push(action);
  if (b.type !== 'hearthstone') choices.push('Move it');
  choices.push('Leave it be');
  const pick = await UIx.ask('What would you like to do?', choices, { speaker: def.name });
  let i = 0;
  if (canUp && pick === i++) { Scenes.push('village', { tab: 'upgrade', focus: b.id }); return; }
  if (pick === i++) {
    const gives = benefitsFor(b.type, tier);
    await UIx.sayMany([def.blurb, ...gives.map(g => '- ' + g)], { speaker: def.name });
    return;
  }
  if (action && pick === i++) { await useBuilding(b); return; }
  if (b.type !== 'hearthstone' && pick === i++) {
    Scenes.push('build', { type: b.type, mode: 'relocate', movingId: b.id });
    return;
  }
}

const buildingActionLabel = type => ({
  kitchen: 'Cook a meal', garden: 'Gather herbs', workshop: 'Craft charms',
  market: 'Visit the stalls', library: 'Study together', infirmary: 'Rest and recover',
  fountain: 'Toss in a coin', bathhouse: 'Take a long rest', belltower: 'Ring the bell',
}[type] || null);

async function useBuilding(b) {
  const tier = Math.max(1, b.tier || 1);
  const dailyKey = `building.${b.id}.used`;
  const usedToday = () => S.flags[dailyKey] === (S.clock?.day || 1);
  const markDaily = () => { S.flags[dailyKey] = S.clock?.day || 1; };
  const needParty = async () => {
    if (S.party.length) return true;
    await UIx.say('Bring a Guardian with you next time.');
    return false;
  };
  const restParty = bond => {
    for (const g of S.party) {
      g.hp = g.maxhp; g.status = null; g.statusTurns = 0;
      for (const move of g.moves || []) move.focus = move.maxFocus;
      if (bond) g.bond = Math.min(255, (g.bond || 0) + bond);
    }
  };

  if (b.type === 'market') {
    const pick = await UIx.ask('What do you need?', ['Woven Charm — 12 coins', 'Warm Salve — 18 coins', 'Nothing today'], { speaker: 'Market Stall' });
    const item = pick === 0 ? { id: 'charm', name: 'Woven Charm', coins: 12 }
      : pick === 1 ? { id: 'salve', name: 'Warm Salve', coins: 18 } : null;
    if (!item) return;
    if (!Economy.spend({ coins: item.coins }, `bought ${item.name}`)) {
      await UIx.say('Not enough coins this time.', { speaker: 'Market Stall' }); return;
    }
    S.bag[item.id] = (S.bag[item.id] || 0) + 1;
    save();
    await UIx.say(`${item.name}, wrapped and ready.`, { speaker: 'Market Stall' });
    return;
  }

  if (b.type === 'belltower') {
    ringBell(tier);
    await UIx.say('The bell rolls across the roofs and out toward the ridge.', { speaker: 'Bell Tower' });
    return;
  }

  if (usedToday()) {
    await UIx.say('That is enough for today. It will be ready again tomorrow.', { speaker: defFor(b.type)?.name });
    return;
  }

  if (b.type === 'kitchen') {
    if (!await needParty()) return;
    restParty(tier);
    markDaily();
    await UIx.say('A shared meal puts every Guardian back on their feet.', { speaker: 'Kitchen' });
  } else if (b.type === 'garden') {
    S.bag.salve = (S.bag.salve || 0) + tier;
    markDaily();
    await UIx.say(`You gathered ${tier} bundle${tier === 1 ? '' : 's'} of salve herbs.`, { speaker: 'Garden Plot' });
  } else if (b.type === 'workshop') {
    S.bag.charm = (S.bag.charm || 0) + tier;
    markDaily();
    await UIx.say(`The scrap became ${tier} woven charm${tier === 1 ? '' : 's'}.`, { speaker: 'Workshop' });
  } else if (b.type === 'library') {
    if (!await needParty()) return;
    for (const move of S.party[0].moves || []) move.focus = move.maxFocus;
    S.party[0].bond = Math.min(255, (S.party[0].bond || 0) + tier);
    markDaily();
    await UIx.say(`${S.party[0].nick || 'Your Guardian'} remembers every move and leans closer for the story.`, { speaker: 'Story Nook' });
  } else if (b.type === 'infirmary') {
    if (!await needParty()) return;
    restParty(0); markDaily();
    await UIx.say('Blankets, broth, and time restore the whole party.', { speaker: 'Warmhouse' });
  } else if (b.type === 'fountain') {
    const gift = 4 + tier * 3;
    Economy.earn({ coins: gift }, 'fountain wish');
    markDaily();
    await UIx.say(`Something glints in the basin: ${gift} coins.`, { speaker: 'Fountain' });
  } else if (b.type === 'bathhouse') {
    if (!await needParty()) return;
    restParty(tier * 2); markDaily();
    await UIx.say('Everyone leaves warm, rested, and a little closer.', { speaker: 'Spring House' });
  }
  save();
}

async function openPlot(plot) {
  const yes = await UIx.confirm('An empty plot, waiting for something. Open the build menu?');
  if (yes) Scenes.push('village', { tab: 'build', plot });
}

// --- Hooks -------------------------------------------------------------------
const HOOKS = {
  applyTo(map) {
    if (!map) return;
    ensureState();
    if (map.id !== VILLAGE_MAP && !map.village) return;
    // Cooperate with the world if it has tagged a spot for the Hearthstone.
    try {
      if (map.tag && !S.village.__hearthPinned) {
        for (let y = 0; y < map.h; y++) {
          for (let x = 0; x < map.w; x++) {
            if (map.tag(x, y) === 'hearth') {
              const h = hearth();
              h.x = x; h.y = y;
              S.village.__hearthPinned = true;
              y = map.h; break;
            }
          }
        }
      }
    } catch { /* world still landing */ }
    invalidate();
    ensureLayout(map);
    recompute({ celebrate: false });
  },

  drawGround(map, cam) {
    if (!map || (map.id !== VILLAGE_MAP && !map.village)) return;
    ensureState();
    ensureLayout(map);
    const c = cam || R.camera;
    const view = { w: R.viewW, h: R.viewH };
    R.layer(LAYER.GROUND, ctx => {
      paintFinish(ctx, map, c, view);
      paintPaths(ctx, map, c, view);
    });
    R.layer(LAYER.MID, ctx => {
      paintDecor(ctx, map, c, view);
    });
    R.layer(LAYER.WEATHER, ctx => paintLights(ctx, map, c, view));
  },

  drawSprites(map, cam, sortEntity) {
    if (!map || (map.id !== VILLAGE_MAP && !map.village)) return;
    ensureState();
    ensureLayout(map);
    const c = cam || R.camera;
    const view = { w: R.viewW, h: R.viewH };
    const push = sortEntity || ((y, fn) => R.sortEntity(y, fn));
    for (const b of builtList()) {
      const def = defFor(b.type);
      if (!def) continue;
      const sx = b.x * TILE - c.x;
      const sy = (b.y - def.overhang) * TILE - c.y;
      if (sx > view.w || sy > view.h || sx + def.w * TILE < 0 || sy + (def.h + def.overhang) * TILE < 0) continue;
      push((b.y + def.h) * TILE, ctx => {
        drawBuilding(ctx, b, sx, sy);
        paintBuildingExtras(ctx, b, c, view);
      });
    }
    if (!document.body.classList.contains('build-active')) paintVillagers(null, map, c, view, push);
  },

  solid(map, x, y) {
    if (!map || (map.id !== VILLAGE_MAP && !map.village)) return false;
    ensureState();
    ensureLayout(map);
    return cache.solid.has(x + ',' + y);
  },

  interact(map, x, y) {
    if (!map || (map.id !== VILLAGE_MAP && !map.village)) return null;
    ensureState();
    ensureLayout(map);
    const b = cache.doors.get(x + ',' + y) || buildingAt(x, y);
    if (b) {
      if (b.type === 'hearthstone') {
        return async () => {
          await UIx.say(defFor('hearthstone').doorLine, { speaker: 'Hearthstone' });
          Scenes.push('village');
        };
      }
      return async () => openBuildingMenu(b);
    }
    const plot = plotList().find(p => p.x === x && p.y === y);
    if (plot) return async () => openPlot(plot);
    return null;
  },

  level() { ensureState(); return level(); },

  openBuildMode(type) {
    ensureState();
    if (!type) { Scenes.push('village', { tab: 'build' }); return; }
    Scenes.push('build', { type });
  },
};

// --- public model ------------------------------------------------------------
export const Village = {
  VILLAGE_MAP, TILE, PLOTS,
  ensureState, hearth, plazaCentre, doorOf, frontOf, footprintOf, buildingAt, plotList,
  activeMap, isVillageMap, level, levelFor, points, progress, unlocksAt, LEVEL_POINTS, MAX_LEVEL,
  finishRadius, invalidate, ensureLayout, cache,
  paintVillage, paintBase, paintFinish, paintPaths, paintDecor, paintVillagers,
  paintLights, drawBuilding, buildingPlaceholder, groundFallback, decorFallback,
  validate, firstValidPlot, place, upgrade, relocate, demolish, unlock,
  recompute, celebrateLevel, ringBell, isNight,
  get villagers() { return villagers; },
  openBoard(params) { Scenes.push('village', params); },
  openBuild(type, params) { Scenes.push('build', { type, ...params }); },
};

// --- register ---------------------------------------------------------------
export function register() {
  ensureState();
  lastLevel = level();
  S.village.level = lastLevel;

  defineVillageSfx();
  Hooks.install('village', HOOKS);

  // Missions and battles change the village's level; keep it honest and celebrate.
  Bus.on(EV.MISSION_DONE, () => recompute());
  Bus.on(EV.DAY_CHANGED, () => invalidate());
  Bus.on(EV.SEASON_CHANGED, () => invalidate());

  if (typeof window !== 'undefined') window.__village = Village;
  return Village;
}

function defineVillageSfx() {
  try {
    Audio.defineSfx('build.hit', { voices: [
      { noise: true, dur: 0.07, lp: 1400, gain: 0.16, curve: 2.2 },
      { wave: 'triangle', f: 190, f2: 120, dur: 0.09, gain: 0.10 },
    ] });
    Audio.defineSfx('build.saw', { voices: [{ noise: true, dur: 0.22, hp: 1800, gain: 0.09, curve: 1.1 }] });
    Audio.defineSfx('build.done', { voices: [
      { wave: 'triangle', f: 523, dur: 0.10, gain: 0.13 },
      { at: 0.09, wave: 'triangle', f: 659, dur: 0.10, gain: 0.13 },
      { at: 0.18, wave: 'triangle', f: 784, dur: 0.20, gain: 0.14 },
      { at: 0.18, wave: 'square', f: 1568, dur: 0.16, gain: 0.06 },
    ] });
    Audio.defineSfx('village.up', { voices: [
      { wave: 'square', f: 523, dur: 0.10, gain: 0.11 },
      { at: 0.10, wave: 'square', f: 659, dur: 0.10, gain: 0.11 },
      { at: 0.20, wave: 'square', f: 784, dur: 0.10, gain: 0.12 },
      { at: 0.30, wave: 'square', f: 1046, dur: 0.30, gain: 0.13 },
    ] });
    Audio.defineSfx('warm', { voices: [
      { wave: 'triangle', f: 392, dur: 0.24, gain: 0.10 },
      { at: 0.06, wave: 'triangle', f: 587, dur: 0.30, gain: 0.09 },
    ] });
  } catch { /* audio not ready is fine */ }
}

export default Village;
