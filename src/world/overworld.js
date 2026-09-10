// The overworld: movement, camera, layer composition, encounters, warps, interaction.
//
// Movement feel is the headline quality target, so the rules are explicit:
//   * tapping a direction you are not facing TURNS you, it does not move you
//   * holding it walks, one tile per step, with no pause between chained steps
//   * a step that has begun always completes, even if you let go mid-step
//   * running is the same grid, just faster, with dust
// Everything else in this file exists to keep that responsive.

import { R, LAYER } from '../core/renderer.js';
import { Input } from '../core/input.js';
import { Scenes } from '../core/scene.js';
import { Atlas } from '../art/atlas.js';
import { mix } from '../art/palette.js';
import { Audio } from '../core/audio.js';
import { UIx, Hooks } from '../core/bridge.js';
import { S, save } from '../state.js';
import { Bus, EV } from '../core/events.js';
import { TILE, DIR_VEC, clamp, ease } from '../core/util.js';
import { makeRng } from '../core/rng.js';
import { loadMap } from './map.js';
import { START } from './maps.js';
import { makeNpcs, nameOf } from './npc.js';
import { drawLighting, drawWeather, drawNightGlow, isNight, lampTile } from './daynight.js';

// --- timing constants: the whole feel lives here -----------------------------
const WALK = 8;          // frames per tile walking
const RUN = 5;           // frames per tile running
const TURN = 4;          // frames a turn-in-place takes before a step may begin
const HOP = 18;          // frames for a ledge hop
const ENCOUNTER_RATE = 0.11;
const ENCOUNTER_GRACE = 3;   // steps of safety after a battle or a map change

const rng = makeRng(90210);

let map = null;
let npcs = [];
let player = null;
let busy = false;          // a scene/transition owns the player
let grace = ENCOUNTER_GRACE;
let dust = [];
let rustle = [];
// The companion echoes completed player steps, never a straight line toward
// the player's current position. Two breadcrumbs are enough to preserve every
// corner, including the exact arc of a ledge hop, without touching collision.
let companionTrail = [];
let doorWarping = false;

function rememberCompanionStep(toX, toY, dir, hop = false) {
  companionTrail.push({ fromX: player.x, fromY: player.y, toX, toY, dir, hop });
  if (companionTrail.length > 2) companionTrail.shift();
}

function companionPose() {
  if (!companionTrail.length || doorWarping) return null;
  const progress = player.hop ? Math.min(1, player.hop.t / HOP)
    : player.moving ? Math.min(1, player.t / player.dur) : 1;
  const step = companionTrail[0];
  const first = companionTrail.length === 1;
  // Emerge gently from the player's starting tile after a warp/first meeting.
  // The very first departure has no older traversed tile to spawn onto safely.
  const alpha = first ? clamp((progress - .25) / .5, 0, 1) : 1;
  if (alpha <= 0) return null;
  const k = first ? 0 : progress;
  const px = (step.fromX + (step.toX - step.fromX) * k) * TILE;
  const groundY = (step.fromY + (step.toY - step.fromY) * k) * TILE;
  const hopping = !first && step.hop && progress < 1;
  return {
    px, py: groundY - (hopping ? Math.sin(k * Math.PI) * 14 : 0), groundY,
    x: Math.round(px / TILE), y: Math.round(groundY / TILE),
    dir: step.dir, alpha, hopping,
    moving: !first && (player.moving || !!player.hop),
  };
}

function makePlayer() {
  return {
    x: S.player.x, y: S.player.y, dir: S.player.dir || 'down',
    px: S.player.x * TILE, py: S.player.y * TILE,
    fx: S.player.x, fy: S.player.y,
    moving: false, t: 0, dur: WALK, anim: 0, running: false,
    turn: 0, bump: 0, hop: null,
  };
}

function syncState() {
  S.player.x = player.x; S.player.y = player.y; S.player.dir = player.dir;
  S.player.map = map.id;
}

// --- collision ---------------------------------------------------------------
function occupied(x, y) {
  for (const n of npcs) {
    if (n.x === x && n.y === y) return true;
    if (n.moving && n.fx === x && n.fy === y) return true;
  }
  return false;
}

function blockedFor(x, y) {
  if (map.solid(x, y)) return true;
  try { if (Hooks.village.solid(map, x, y)) return true; } catch {}
  return false;
}

function canWalk(x, y) { return !blockedFor(x, y) && !occupied(x, y); }

/** Recover old/corrupt save coordinates to the nearest usable tile. */
function safeSpawn(x, y) {
  const fallback = map.id === START.map ? START : { x: 1, y: 1 };
  const ox = clamp(Number.isFinite(Number(x)) ? Math.round(Number(x)) : fallback.x, 0, map.w - 1);
  const oy = clamp(Number.isFinite(Number(y)) ? Math.round(Number(y)) : fallback.y, 0, map.h - 1);
  const key = (xx, yy) => `${xx},${yy}`;
  const staticClear = (xx, yy) => xx >= 0 && yy >= 0 && xx < map.w && yy < map.h && !blockedFor(xx, yy);

  // A locally empty tile can still be a one-cell pocket between expanded tree
  // canopies. Accept only components connected to a real map entrance/exit.
  const reachable = new Set();
  const queue = [];
  const seed = (xx, yy) => {
    const k = key(xx, yy);
    if (!staticClear(xx, yy) || reachable.has(k)) return;
    reachable.add(k); queue.push([xx, yy]);
  };
  for (const w of map.warps || []) seed(w.x, w.y);
  if (map.id === START.map) seed(START.x, START.y);
  if (!queue.length) {
    seed(fallback.x, fallback.y);
    if (!queue.length) {
      outer: for (let yy = 0; yy < map.h; yy++) for (let xx = 0; xx < map.w; xx++) {
        if (staticClear(xx, yy)) { seed(xx, yy); break outer; }
      }
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const [xx, yy] = queue[head];
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) seed(xx + dx, yy + dy);
  }
  const clear = (xx, yy) => reachable.has(key(xx, yy)) && !occupied(xx, yy);
  if (clear(ox, oy)) return { x: ox, y: oy };
  const maxR = Math.max(map.w, map.h);
  for (let r = 1; r <= maxR; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (const yy of [oy - r, oy + r]) if (clear(ox + dx, yy)) return { x: ox + dx, y: yy };
    }
    for (let dy = -r + 1; dy < r; dy++) {
      for (const xx of [ox - r, ox + r]) if (clear(xx, oy + dy)) return { x: xx, y: oy + dy };
    }
  }
  if (clear(fallback.x, fallback.y)) return { x: fallback.x, y: fallback.y };
  for (let yy = 0; yy < map.h; yy++) for (let xx = 0; xx < map.w; xx++) {
    if (clear(xx, yy)) return { x: xx, y: yy };
  }
  return { x: 0, y: 0 };
}

// --- entering a tile ---------------------------------------------------------
function onArrive() {
  syncState();
  S.stats.steps++;
  try { Hooks.missions.note('step', { map: map.id, x: player.x, y: player.y }); } catch {}

  if (grace > 0) grace--;

  if (map.isGrass(player.x, player.y)) {
    rustle.push({ x: player.x, y: player.y, t: 0 });
    Audio.sfx('step', { rate: 0.8 });
    maybeEncounter();
  } else {
    Audio.sfx('step', { rate: player.running ? 1.25 : 1 });
  }

  if (player.running) dust.push({ x: player.px, y: player.py, t: 0 });

  const w = map.warpAt(player.x, player.y);
  if (w) { doWarp(w); return; }
}

function maybeEncounter() {
  if (grace > 0) return;
  const table = map.encounterTable(player.x, player.y);
  if (!table || !table.length) return;
  if (rng.float() > ENCOUNTER_RATE) return;
  const entry = rng.weighted(table.map(e => [e, e.w]));
  const level = rng.int(entry.lo, entry.hi);
  startBattle({ speciesId: entry.id, level, kind: 'wild' });
}

async function startBattle(params) {
  let can = false;
  try { can = Hooks.battle.canBattle(); } catch {}
  if (!can) { UIx.toast('A Guardian watches from the grass…'); grace = 6; return; }
  busy = true;
  try {
    S.stats.battles++;
    await UIx.battleFx();
    const result = await Hooks.battle.start(params);
    if (result === 'won') {
      S.stats.wins++;
      try { Hooks.missions.note('win', params); } catch {}
      Bus.emit(EV.BATTLE_WON, { result, ...params });
    } else if (result === 'bonded') {
      S.stats.bonded++;
      try { Hooks.missions.note('bond', params); } catch {}
    } else if (result === 'lost') {
      Bus.emit(EV.BATTLE_LOST, { result, ...params });
    }
    if (result === 'lost') await recover();
    grace = ENCOUNTER_GRACE;
    await UIx.fade('in', 12);
  } finally { busy = false; }
}

async function recover() {
  await UIx.say('Your Guardians are worn out. Gran Willow tucks them by the hearth until morning.');
  for (const g of S.party) g.hp = g.maxhp;
  await enterMap('village', 17, 10, 'down', { fade: false });
}

// --- warps -------------------------------------------------------------------
async function doWarp(w) {
  busy = true;
  const door = !!w.door || map.tag(player.x, player.y) === 'door';
  doorWarping = door;
  try {
    if (door) Audio.sfx('door');
    await (door ? UIx.doorway('out') : UIx.fade('out', 12));
    await enterMap(w.to, w.tx, w.ty, w.dir || player.dir, { fade: false });
    await (door ? UIx.doorway('in') : UIx.fade('in', 12));
  } finally { busy = false; doorWarping = false; }
}

export async function enterMap(id, x, y, dir = 'down', { fade = true } = {}) {
  if (fade) await UIx.fade('out', 12);
  map = loadMap(id);
  npcs = makeNpcs(map);
  S.player.map = id;
  try { Hooks.village.applyTo(map); } catch (e) { console.warn('[world] village.applyTo', e); }
  const spawn = safeSpawn(x, y);
  S.player.x = spawn.x; S.player.y = spawn.y;
  player = makePlayer();
  player.x = spawn.x; player.y = spawn.y; player.dir = dir;
  player.px = spawn.x * TILE; player.py = spawn.y * TILE;
  player.fx = spawn.x; player.fy = spawn.y;
  companionTrail = [];
  grace = ENCOUNTER_GRACE;
  dust.length = 0; rustle.length = 0;
  syncState();
  try { Hooks.missions.note('enter-map', { map: id }); } catch {}
  Bus.emit(EV.MAP_ENTERED, { map: id });
  if (map.music && Audio.hasSong(map.music)) Audio.play(map.music);
  R.worldZoom = map.indoor ? 1 : 0.75;
  R.centerOn(player.px + 8, player.py + 8, map.bounds);
  if (fade) await UIx.fade('in', 12);
}

// --- interaction -------------------------------------------------------------
const TAG_HINTS = {
  sign: ['Read', 'Sign'], well: ['Inspect', 'Well'], bench: ['Inspect', 'Bench'],
  mail: ['Check', 'Post box'], hearthfire: ['Inspect', 'Hearth'], stove: ['Inspect', 'Stove'],
  painting: ['Look at', 'Painting'], anvil: ['Inspect', 'Anvil'], loom: ['Inspect', 'Loom'],
};

// Prompts and button presses resolve the same target, in the same priority order.
// Preview only reads village geometry; merely facing a chest never opens it.
function interactionTarget({ preview = false } = {}) {
  if (!map || !player) return null;
  const v = DIR_VEC[player.dir];
  const tx = player.x + v.x, ty = player.y + v.y;

  const npc = npcs.find(n => n.x === tx && n.y === ty);
  if (npc) return {
    tx, ty, hint: npc.moving ? null : ['Talk to', nameOf(npc.who)],
    run: () => npc.interact(),
  };

  let handler = null;
  try { handler = Hooks.village.interact(map, tx, ty, { preview }); } catch {}
  if (handler) return { tx, ty, hint: handler.hint || ['Inspect', ''], run: handler };

  const tag = map.tag(tx, ty);
  if (tag) {
    const hint = tag === 'chest'
      ? [S.flags[`chest.${map.id}.${tx}.${ty}`] ? 'Check' : 'Open', 'Chest']
      : TAG_HINTS[tag];
    return { tx, ty, hint, run: () => interactTag(tag, tx, ty) };
  }

  // Facing water with nothing to do reads better as a beat than as silence.
  if (map.isWater(tx, ty)) return {
    tx, ty, hint: ['Look at', 'Water'],
    run: () => UIx.say('The water is clear all the way to the stones.'),
  };
  return null;
}

async function interact() {
  const target = interactionTarget();
  if (!target) return;
  busy = true;
  try { await target.run(); } finally { busy = false; }
}

async function interactTag(tag, tx, ty) {
  switch (tag) {
    case 'sign': return UIx.say(signText(tx, ty));
    case 'well': return UIx.say('The well is deep and cold. Someone has tied a ribbon to the rope.');
    case 'bench': return UIx.say('A bench worn smooth by a hundred evenings.');
    case 'mail': return UIx.say('The post box is empty. Someone has already been by.');
    case 'hearthfire': return UIx.say('The fire is banked low and warm. It could burn all night like this.');
    case 'stove': return UIx.say('Something is simmering. It smells like a reason to stay.');
    case 'painting': return UIx.say('A painting of Emberhollow, from before the roofs went quiet.');
    case 'chest': {
      const key = `chest.${map.id}.${tx}.${ty}`;
      if (S.flags[key]) return UIx.say('The chest is empty now.');
      S.flags[key] = true;
      S.bag.charm = (S.bag.charm || 0) + 5;
      Audio.sfx('chime');
      save();
      return UIx.say('Someone left five charms here, wrapped in waxed cloth. For whoever came looking.');
    }
    case 'anvil': return UIx.say('The anvil rings faintly when you touch it, as if it remembers being struck.');
    case 'loom': return UIx.say('Half a banner, waiting for the rest of the year.');
    case 'exit': case 'door': return;
    default: return UIx.say('Nothing here but the wind.');
  }
}

function signText(x, y) {
  const key = `${map.id}:${x},${y}`;
  const signs = {
    'village:20,30': 'EMBERHOLLOW — Population: growing again.\nSouth: Gladewind Meadow.',
    'meadow:18,3': 'GLADEWIND MEADOW — Mind the tall grass. It minds you.',
    'meadow:21,12': 'Guardians rest in the grass. Walk softly and offer a charm, not a fright.',
    'forest:1,15': 'HOLLOWPINE WOOD — The path forgets itself. Follow it anyway.',
    'riverside:11,12': 'STILLWATER REACH — The bridge holds. The railing does not.',
  };
  return signs[key] || 'The lettering has weathered away.';
}

// --- update ------------------------------------------------------------------
function tryStep(dir) {
  const v = DIR_VEC[dir];
  const nx = player.x + v.x, ny = player.y + v.y;

  // A ledge below you is a one-way hop down, not a wall.
  if (dir === 'down' && map.ledge(nx, ny) === 'down' && canWalk(nx, ny + 1)) {
    rememberCompanionStep(nx, ny + 1, dir, true);
    player.hop = { fromX: player.x, fromY: player.y, toX: nx, toY: ny + 1, t: 0 };
    player.x = nx; player.y = ny + 1;
    Audio.sfx('bump', { rate: 1.6 });
    return true;
  }
  if (!canWalk(nx, ny)) {
    if (player.bump <= 0) { Audio.sfx('bump'); player.bump = 10; }
    return false;
  }
  rememberCompanionStep(nx, ny, dir);
  player.fx = player.x; player.fy = player.y;
  player.x = nx; player.y = ny;
  player.moving = true; player.t = 0;
  player.dur = player.running ? RUN : WALK;
  return true;
}

function updatePlayer() {
  if (player.bump > 0) player.bump--;

  if (player.hop) {
    const h = player.hop;
    h.t++;
    const k = Math.min(1, h.t / HOP);
    player.px = (h.fromX + (h.toX - h.fromX) * k) * TILE;
    player.py = (h.fromY + (h.toY - h.fromY) * k) * TILE - Math.sin(k * Math.PI) * 14;
    player.anim += 2;
    if (k >= 1) {
      player.hop = null;
      player.px = player.x * TILE; player.py = player.y * TILE;
      dust.push({ x: player.px, y: player.py, t: 0 });
      onArrive();
    }
    return;
  }

  if (player.moving) {
    player.t++;
    const k = Math.min(1, player.t / player.dur);
    player.px = (player.fx + (player.x - player.fx) * k) * TILE;
    player.py = (player.fy + (player.y - player.fy) * k) * TILE;
    player.anim++;
    if (k >= 1) {
      player.moving = false;
      player.fx = player.x; player.fy = player.y;
      player.px = player.x * TILE; player.py = player.y * TILE;
      onArrive();
      // Chain immediately so held movement never stutters between tiles.
      if (!busy) {
        const d = Input.dir();
        if (d) {
          player.running = Input.held('run');
          if (d === player.dir) tryStep(d);
          else { player.dir = d; player.turn = TURN; }
        }
      }
    }
    return;
  }

  player.px = player.x * TILE; player.py = player.y * TILE;
  if (busy) { player.anim = 0; return; }

  const d = Input.dir();
  player.running = Input.held('run');

  if (!d) {
    const tap = Input.tappedDir();
    if (tap) player.dir = tap;
    player.turn = 0; player.anim = 0; return;
  }

  if (d !== player.dir) {
    // Turn in place first — a tap should never move you.
    player.dir = d;
    player.turn = TURN;
    player.anim = 0;
    return;
  }
  if (player.turn > 0) { player.turn--; return; }
  tryStep(d);
}

function update() {
  if (!map) return;

  if (!busy) {
    if (Input.pressed('a') && !player.moving && !player.hop) { Input.consume('a'); interact(); }
    else if (Input.pressed('start')) { Input.consume('start'); Scenes.push('pause'); }
    else if (Input.pressed('select')) { Input.consume('select'); Scenes.push('village'); }
  }

  if (!busy) updatePlayer();
  else player.running = false;
  S.player.dir = player.dir;

  for (const n of npcs) {
    n.notice(player.x, player.y);
    n.update((x, y) => (x === player.x && y === player.y) || occupied(x, y));
  }

  for (let i = dust.length - 1; i >= 0; i--) if (++dust[i].t > 22) dust.splice(i, 1);
  for (let i = rustle.length - 1; i >= 0; i--) if (++rustle[i].t > 20) rustle.splice(i, 1);

  R.worldZoom = map.indoor ? 1 : 0.75;
  R.centerOn(player.px + 8, player.py + 8, map.bounds);
}

// --- render ------------------------------------------------------------------
// Seasonal colours are cached atlas derivatives: no pixel processing in the
// frame loop, and trunks, stone, flowers and wooden props keep their own colours.
function worldSprite(name, frame = 0) {
  if (!name) return null;
  const season = S.clock?.season;
  if (map.indoor || (season !== 'autumn' && season !== 'winter') ||
      !/^t\.(grass|tallgrass|tree|pine|bush|hedge|reed|cattail|trail)(\.|$)/.test(name)) {
    return Atlas.tryGet(name, frame);
  }
  if (!Atlas.has(name)) return null;
  const foliage = /^t\.(tree|pine|bush|hedge)/.test(name);
  const key = Atlas.recolor(name, `season-${season}`, ([r, g, b, a]) => {
    if (g < r * 1.09 || g < b * 1.2) return [r, g, b, a];
    const light = Math.min(1, Math.max(0, (g - 35) / 165));
    if (season === 'autumn') {
      return foliage
        ? [Math.round(102 + light * 139), Math.round(59 + light * 114), Math.round(33 + light * 38), a]
        : [Math.round(103 + light * 79), Math.round(112 + light * 68), Math.round(52 + light * 39), a];
    }
    return foliage
      ? [Math.round(61 + light * 176), Math.round(91 + light * 154), Math.round(96 + light * 154), a]
      : [Math.round(174 + light * 67), Math.round(198 + light * 48), Math.round(209 + light * 42), a];
  });
  return Atlas.tryGet(key, frame);
}

// One map-sized ground surface replaces hundreds of filtered tile draws per
// frame. Keep only the current map/season: about 13 MB for the largest opening
// map. Village additions remain in their live overlay; actors, water shimmer
// and every animated tile continue to render each frame.
let groundSurface = null;
function cachedGround() {
  if (!document.createElement) return null;
  const season=S.clock.season;
  if(groundSurface?.map===map && groundSurface.season===season)return groundSurface;
  const canvas=document.createElement('canvas'),ratio=3;
  canvas.width=map.w*TILE*ratio;canvas.height=map.h*TILE*ratio;
  const ctx=canvas.getContext('2d');
  if(!ctx?.drawImage)return null;
  ctx.setTransform(ratio,0,0,ratio,0,0);ctx.imageSmoothingEnabled=true;
  const animated=[];
  for(let y=0;y<map.h;y++)for(let x=0;x<map.w;x++) {
    const name=map.ground(x,y);
    if(Atlas.frames(name)>1){animated.push({x,y,name});continue;}
    const img=worldSprite(name,0);
    if(img)ctx.drawImage(img,x*TILE,y*TILE,TILE,TILE);
  }
  groundSurface={map,season,canvas,ratio,animated};
  return groundSurface;
}

function drawTiles() {
  const cam = R.camera;
  const detailedTrees = Atlas.tryGet('t.tree.oak')?.logicalWidth === 48;
  const x0 = Math.max(0, Math.floor(cam.x / TILE) - 1);
  const y0 = Math.max(0, Math.floor(cam.y / TILE) - 1);
  const x1 = Math.min(map.w - 1, Math.ceil((cam.x + R.viewW) / TILE) + 1);
  const y1 = Math.min(map.h - 1, Math.ceil((cam.y + R.viewH) / TILE) + 1);
  const frame = S.settings.reducedMotion ? 0 : Math.floor(performance.now() / 180);

  R.layer(LAYER.GROUND, () => {
    // Outside the map edge reads as void otherwise; fill it with the map's own base.
    R.rect(0, 0, R.viewW, R.viewH, map.indoor ? '#171019' : '#2c3a22');
    const cached=cachedGround();
    if(cached) {
      const sx=Math.max(0,Math.floor(cam.x)),sy=Math.max(0,Math.floor(cam.y));
      const w=Math.min(map.w*TILE-sx,R.viewW+1),h=Math.min(map.h*TILE-sy,R.viewH+1);
      const ctx=R.ctx;ctx.save();ctx.imageSmoothingEnabled=true;
      if(w>0&&h>0)ctx.drawImage(cached.canvas,sx*cached.ratio,sy*cached.ratio,w*cached.ratio,h*cached.ratio,
        Math.round(sx-cam.x),Math.round(sy-cam.y),w,h);
      ctx.restore();
      for(const tile of cached.animated)if(tile.x>=x0&&tile.x<=x1&&tile.y>=y0&&tile.y<=y1){
        const img=worldSprite(tile.name,frame);if(img)R.blit(img,tile.x*TILE-cam.x,tile.y*TILE-cam.y);
      }
      return;
    }
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const img = worldSprite(map.ground(x, y), frame);
        if (img) R.blit(img, x * TILE - cam.x, y * TILE - cam.y);
      }
    }
  });

  R.layer(LAYER.MID, () => {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        let name = map.mid(x, y);
        if (!name) continue;
        if (name === 't.lamp') name = lampTile();
        const img = worldSprite(name, frame);
        if (img) R.blit(img, x * TILE - cam.x, y * TILE - cam.y);
      }
    }
    for (const r of rustle) {
      const img = Atlas.tryGet('fx.grass.rustle', Math.floor(r.t / 5));
      if (img) R.blit(img, r.x * TILE - cam.x, r.y * TILE - cam.y);
    }
  });

  R.layer(LAYER.OVER, () => {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const name = map.over(x, y);
        if (detailedTrees && name?.startsWith('t.tree.canopy.')) continue;
        if (Atlas.has('t.pine.illustrated') && (name === 't.pine.top' || name === 't.pine.trunk')) continue;
        const img = worldSprite(name, frame);
        if (img) R.blit(img, x * TILE - cam.x, y * TILE - cam.y);
      }
    }
  });
}

function drawTrees(cam) {
  if (map.indoor || Atlas.tryGet('t.tree.oak')?.logicalWidth !== 48) return;
  // Tree roots retain their authored two-tile collision. The larger artwork is
  // sorted by those roots, so walking in front and behind reads naturally.
  const x0 = Math.max(0, Math.floor(cam.x / TILE) - 3);
  const y0 = Math.max(0, Math.floor(cam.y / TILE) - 2);
  const x1 = Math.min(map.w - 1, Math.ceil((cam.x + R.viewW) / TILE) + 3);
  const y1 = Math.min(map.h - 1, Math.ceil((cam.y + R.viewH) / TILE) + 4);
  const img = worldSprite('t.tree.oak');
  const pine = worldSprite('t.pine.illustrated');
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const name = map.over(x, y), isPine = name === 't.pine.top' && pine;
    if (name !== 't.tree.canopy.nw' && !isPine) continue;
    const rootY = (y + 2) * TILE;
    const sx = x * TILE - cam.x - (isPine ? 12 : 8), sy = rootY - cam.y - 64;
    const behind = player.py + TILE < rootY
      && player.py + TILE > rootY - 58
      && player.px + 8 > x * TILE - 5 && player.px + 8 < x * TILE + 39;
    R.sortEntity(rootY, () => R.blit(isPine ? pine : img, sx, sy, {alpha: behind ? 0.52 : 1}));
  }
}

// Static furniture positions and shadow bands are prepared once. Shadow drawing
// never reads sprite pixels or builds a silhouette during the frame loop.
const interiorShadowCache = new WeakMap();
const INTERIOR_FURNITURE = /^t\.(?:table(?:\.set)?|chair\.[lrud]|bed\.foot|shelf(?:\.books)?|counter|stove|hearth\.(?:lit|cold)|cabinet|plant\.pot|chest|anvil|loom|basket|pot|barrel|crate|bench)$/;
const OAK_SHADOW_BANDS = [
  [-15, -7, 29, 2], [-20, -5, 40, 3], [-23, -2, 46, 4],
  [-21, 2, 42, 3], [-16, 5, 33, 2], [-10, 7, 22, 1],
];
const SMALL_TREE_SHADOW = [
  [-7, -4, 14, 1], [-8, -3, 16, 2], [-9, -1, 18, 3], [-8, 2, 16, 2], [-6, 4, 12, 1],
];

function drawInteriorShadows(cam) {
  let furniture = interiorShadowCache.get(map);
  if (!furniture) {
    furniture = [];
    for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
      const name = map.mid(x, y);
      if (!map.solid(x, y) || !INTERIOR_FURNITURE.test(name || '')) continue;
      furniture.push({ x: x * TILE, y: y * TILE, narrow: /chair|plant|basket|pot/.test(name) });
    }
    interiorShadowCache.set(map, furniture);
  }
  if (!furniture.length) return;
  R.layer(LAYER.GROUND, () => {
    for (const item of furniture) {
      const sx = Math.round(item.x - cam.x), sy = Math.round(item.y - cam.y);
      if (sx < -20 || sy < -20 || sx > R.viewW || sy > R.viewH) continue;
      const inset = item.narrow ? 3 : 0;
      // A warm ambient footprint sits beneath the feet; the lighter extension
      // falls down/right in the same direction as the top-left painted light.
      R.rect(sx + 2 + inset, sy + 12, 14 - inset * 2, 4, 'rgba(44,30,20,0.12)');
      R.rect(sx + 4 + inset, sy + 15, 13 - inset * 2, 3, 'rgba(44,30,20,0.08)');
      R.rect(sx + 4 + inset, sy + 14, 10 - inset, 2, 'rgba(44,30,20,0.14)');
    }
  });
}

function drawWorldDetail(cam) {
  // Ground dressing follows the terrain. All decoration stays below objects and
  // never changes collision, so the readable road is also the usable road.
  if (map.indoor) { drawInteriorShadows(cam); return; }
  const x0 = Math.max(0, Math.floor(cam.x / TILE) - 2);
  const y0 = Math.max(0, Math.floor(cam.y / TILE) - 2);
  const x1 = Math.min(map.w - 1, Math.ceil((cam.x + R.viewW) / TILE) + 2);
  const y1 = Math.min(map.h - 1, Math.ceil((cam.y + R.viewH) / TILE) + 2);
  const season = S.clock?.season || 'spring';
  const winter = season === 'winter';
  const night = isNight();
  const now = R.cinematicFx ? performance.now() / 1000 : 0;
  const clear = S.clock?.weather === 'clear';
  const largeOak = Atlas.tryGet('t.tree.oak')?.logicalWidth === 48;
  const flowers = season === 'autumn' ? ['#efd17b', '#e69a67', '#dfba70']
    : season === 'summer' ? ['#ffdc73', '#f0a4b4', '#f5e6b7']
    : ['#f6d987', '#efb5c5', '#d0dfea'];

  R.layer(LAYER.GROUND, () => {
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      const seed = ((tx * 73856093) ^ (ty * 19349663) ^ (map.id.length * 83492791)) >>> 0;
      const sx = Math.round(tx * TILE - cam.x), sy = Math.round(ty * TILE - cam.y);
      const ground = map.ground(tx, ty) || '';
      const mid = map.mid(tx, ty), over = map.over(tx, ty);
      const solid = map.solid(tx, ty), water = map.isWater(tx, ty);

      if (water) {
        // Water is solid for walking; its reflections must be drawn before the
        // solid-object branch. The old branch covered ponds in block shadows.
        if (seed % 3 === 0) {
          const phase = now * 1.5 + (seed % 19);
          const x = sx + 3 + Math.round(Math.sin(phase) * 2);
          const alpha = (night ? 0.16 : 0.28) + Math.sin(phase * 0.7) * 0.08;
          R.rect(x, sy + 5 + (seed % 5), 5, 1, `rgba(223,248,248,${alpha})`);
          R.rect(x + 5, sy + 6 + (seed % 5), 2, 1, `rgba(223,248,248,${alpha * 0.7})`);
        }
        continue;
      }

      // One soft, directional footprint per whole tree, rather than one dark
      // rectangle per solid map cell. Pixel bands keep shadows crisp at 1x.
      if (over === 't.tree.canopy.nw' || over === 't.pine.top') {
        const oak = over === 't.tree.canopy.nw';
        const broad = oak && largeOak;
        const cx = sx + (broad ? 24 : oak ? 21 : 11), cy = sy + (broad ? 34 : 29);
        for (const [x, y, w, h] of broad ? OAK_SHADOW_BANDS : SMALL_TREE_SHADOW) {
          R.rect(cx + (oak && !largeOak ? x * 1.7 : x), cy + y,
            oak && !largeOak ? w * 1.7 : w, h, 'rgba(32,65,45,0.12)');
        }
        if (broad) R.rect(sx + 10, sy + 29, 14, 3, 'rgba(25,47,33,0.16)');
      } else if (solid && mid && !/fence|wall|hedge/.test(mid)) {
        R.rect(sx + 4, sy + 13, 11, 3, 'rgba(32,65,45,0.10)');
        R.rect(sx + 6, sy + 16, 7, 1, 'rgba(32,65,45,0.07)');
      }

      if (solid || mid || over || !/^t\.grass(?:\.|$)/.test(ground)) continue;
      // Accent only plain meadow. Paths, plazas, soil, beaches and encounter
      // patches retain their authored surfaces and their gameplay meaning.
      if (!winter && seed % 29 === 0) {
        for (let i = 0; i < 2; i++) {
          const x = sx + 4 + i * 6, y = sy + 7 + ((seed >>> (i + 2)) % 4);
          R.rect(x, y + 1, 1, 3, '#548345');
          R.rect(x - 1, y, 3, 1, flowers[(seed + i) % 3]);
          R.rect(x, y - 1, 1, 3, flowers[(seed + i) % 3]);
          R.rect(x, y, 1, 1, '#fff1bc');
        }
      }
      if (winter && seed % 11 === 0) {
        R.rect(sx + 4, sy + 10, 5, 1, '#b8d2de');
        R.rect(sx + 5, sy + 9, 4, 1, '#f1f7f7');
      }
    }
  });

  if (!R.cinematicFx || !clear) return;
  R.layer(LAYER.WEATHER, () => {
    // Ambient life is anchored to world space, so it never slides over the hero
    // like an overlay. Just a handful of flecks keeps the scene calm.
    const periodX = map.w * TILE, periodY = map.h * TILE;
    const count = night ? 20 : winter ? 0 : 12;
    for (let i = 0; i < count; i++) {
      const wx = (i * 113 + 31 + Math.sin(now * 0.25 + i) * 12 + periodX) % periodX;
      const wy = (i * 83 + 47 + Math.cos(now * 0.3 + i * 2) * 8 + periodY) % periodY;
      const x = Math.round(wx - cam.x), y = Math.round(wy - cam.y);
      if (x < 0 || y < 0 || x >= R.viewW || y >= R.viewH) continue;
      if (night) {
        const a = 0.25 + (Math.sin(now * 1.4 + i * 3) + 1) * 0.28;
        R.rect(x, y, 1, 1, `rgba(255,230,143,${a})`);
        R.rect(x - 1, y - 1, 3, 3, `rgba(255,217,105,${a * 0.08})`);
      } else R.rect(x, y, 1, 1, 'rgba(247,236,187,0.48)');
    }

    if (night || winter) return;
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      if (map.mid(tx, ty) !== 't.grass.flower2' || (tx + ty) % 4 !== 0) continue;
      const phase = now * 1.6 + tx;
      const x = tx * TILE + 7 - cam.x + Math.sin(phase) * 5;
      const y = ty * TILE + 3 - cam.y + Math.cos(phase * 0.7) * 3;
      const open = Math.sin(now * 12 + tx) > 0;
      R.rect(x, y, 1, 2, '#795d65');
      if (open) {
        R.rect(x - 2, y, 2, 2, '#edd2e4');
        R.rect(x + 1, y, 2, 2, '#d3d5ee');
      } else {
        R.rect(x, y - 1, 1, 3, '#edcce0');
      }
    }
  });
}
function drawStructures(cam) {
  for (const st of map.structures || []) {
    const img = Atlas.tryGet(st.sprite);
    const sx = st.x * TILE - cam.x;
    const sy = (st.y - st.overhang) * TILE - cam.y;
    if (sx > R.viewW || sy > R.viewH || sx + st.w * TILE < 0) continue;
    if (img) R.layer(LAYER.GROUND, () => {
      const ctx = R.ctx;
      ctx.save();
      ctx.translate(Math.round(sx + 5), Math.round((st.y + st.h) * TILE - cam.y + 4));
      ctx.scale(1, 0.24);
      R.silhouette(img, 0, -(img.logicalHeight || img.height), '#243d32', 0.18);
      ctx.restore();
    });
    R.sortEntity((st.y + st.h) * TILE, () => {
      if (img) R.blit(img, sx, sy);
      else R.rect(sx, sy, st.w * TILE, (st.h + st.overhang) * TILE, '#ff00ff');
    });
  }
}

function drawCompanion(cam) {
  const lead = S.party?.[0];
  if (!lead?.species) return;
  const pose = companionPose();
  if (!pose) return;
  const frame = pose.moving ? Math.floor(player.anim / (player.running ? RUN : WALK)) % 2 : 0;
  const img = Atlas.tryGet(`g.${lead.species}.ow`, frame);
  if (!img) return;
  const width = img.logicalWidth || img.width;
  const height = img.logicalHeight || img.height;
  const sx = pose.px - cam.x + (TILE - width) / 2;
  const sy = pose.py - cam.y + TILE - height;
  R.sortEntity(pose.groundY + TILE - .1, () => {
    if (map.isGrass(pose.x, pose.y) && !pose.hopping) {
      R.blit(img, sx, sy, { alpha: pose.alpha, clip: { x: 0, y: 0, w: width, h: Math.max(1, height - 4) } });
    } else R.blit(img, sx, sy, { alpha: pose.alpha, flipX: pose.dir === 'left' });
  });
}

function drawPlayer(cam) {
  const sx = Math.round(player.px - cam.x);
  const sy = Math.round(player.py - cam.y) - 8;
  const moving = player.moving || player.hop;
  const speed = player.running ? 5 : 8;
  const frame = moving ? Math.floor(player.anim / speed) % 4 : 0;
  const lean = player.bump > 0 ? Math.round(Math.sin(player.bump / 10 * Math.PI) * 2) : 0;
  const v = DIR_VEC[player.dir];

  R.sortEntity(player.py + TILE, () => {
    const shadow = Atlas.tryGet('fx.shadow');
    if (shadow) R.blit(shadow, sx, sy + 19, { alpha: 0.5 });
    const img = Atlas.tryGet(`c.${S.player.sprite || 'hero'}.${player.dir}`, frame);
    const dx = sx + lean * v.x, dy = sy + lean * v.y;
    if (img) {
      // The hero and villagers share the same native 16x24 pixel scale. Scaling
      // the hero to 24x36 made individual source pixels uneven and caused every
      // ordinary NPC to look like a child beside the player.
      if (map.isGrass(player.x, player.y) && !player.hop) {
        R.blit(img, dx, dy, { clip: { x: 0, y: 0, w: 16, h: 19 } });
      } else R.blit(img, dx, dy);
    } else R.rect(dx + 2, dy + 4, 12, 20, '#ff00ff');
  });
}

function drawFx(cam) {
  R.layer(LAYER.MID, () => {
    for (const d of dust) {
      const img = Atlas.tryGet('fx.dust', Math.floor(d.t / 6));
      if (img) R.blit(img, d.x - cam.x, d.y - cam.y + 6, { alpha: 1 - d.t / 22 });
    }
  });
}

function drawInteractionPrompt() {
  if (busy || doorWarping || UIx.busy || UIx.transitioning || Scenes.topName !== 'overworld'
      || S.settings.showHints === false || player.moving || player.hop
      || document.body.classList.contains('build-active')) return;
  const target = interactionTarget({ preview: true });
  if (!target?.hint) return;

  const [action, name] = target.hint;
  const key = Input.label('a');
  let label = [action, name].filter(Boolean).join(' ');
  const keyW = Math.max(12, R.measure(key) + 8);
  const maxText = 158 - keyW;
  while (R.measure(label) > maxText && label.length > 1) label = label.slice(0, -2) + '…';
  const w = R.measure(label) + keyW + 13, h = 15;
  // UI coordinates stay crisp at either world zoom. The plaque sits above both
  // people when facing down, so it never hides the player or a villager's face.
  const z = R.worldZoom;
  const cx = (target.tx * TILE + TILE / 2 - R.camera.x) * z;
  const top = (Math.min(target.ty * TILE, player.py) - 8 - R.camera.y) * z;
  const x = Math.round(clamp(cx - w / 2, 4, R.W - w - 4));
  const y = Math.round(clamp(top - h - 5, 23, R.H - h - 20));
  R.layer(LAYER.UI, () => {
    R.rect(x + 1, y + 1, w, h, 'rgba(7,18,17,0.3)');
    R.rect(x, y, w, h, 'rgba(17,34,30,0.95)');
    R.stroke(x, y, w, h, '#a49468');
    R.rect(x + 3, y + 3, keyW, 9, '#dbbd7a');
    R.text(key, x + 3 + keyW / 2, y + 4, { color: '#26392e', shadow: false, align: 'center' });
    R.text(label, x + keyW + 7, y + 4, { color: '#fff2cf', shadow: false });
    // A quiet pointer ties the compact label to the object it will act on.
    const tip = Math.round(clamp(cx, x + 6, x + w - 7));
    R.rect(tip - 2, y + h, 5, 1, '#a49468');
    R.rect(tip - 1, y + h + 1, 3, 1, '#a49468');
    R.rect(tip, y + h + 2, 1, 1, '#a49468');
  });
}

function render() {
  if (!map) return;
  R.worldZoom = map.indoor ? 1 : 0.75;
  const cam = R.camera;
  const placing = document.body.classList.contains('build-active');
  drawTiles();
  drawTrees(cam);
  drawWorldDetail(cam);
  drawFx(cam);
  drawStructures(cam);
  try { Hooks.village.drawSprites(map, cam, (y, fn) => R.sortEntity(y, fn)); } catch {}
  if (!placing) {
    for (const n of npcs) R.sortEntity(n.py + TILE, () => n.draw(cam));
    drawCompanion(cam);
    drawPlayer(cam);
  }

  R.layer(LAYER.WEATHER, () => {
    // Darken first, then punch the warm light through it. The other order lets an
    // additive glow saturate bright tiles to white before the tint can touch them,
    // which turned every bench near a lamp into a white rectangle after dark.
    drawLighting(map);
    drawNightGlow(map, cam);
    drawWeather(map);
  });

  // Village light callbacks must be registered after the world tint so their
  // additive pools remain warm at night. Its ground/decor callbacks still flush
  // in their own earlier layers.
  try { Hooks.village.drawGround(map, cam); } catch {}

  R.layer(LAYER.UI, () => {
    if (UIx.drawToasts) UIx.drawToasts();
  });
  try { Hooks.hud?.draw?.(map); } catch {}
  drawInteractionPrompt();
}

// --- scene -------------------------------------------------------------------
function overworldScene() {
  return {
    async enter(params) {
      const id = params?.map || S.player.map || START.map;
      const known = (() => { try { loadMap(id); return true; } catch { return false; } })();
      const startId = known ? id : START.map;
      const x = params?.x ?? (known ? S.player.x : START.x);
      const y = params?.y ?? (known ? S.player.y : START.y);
      await enterMap(startId, x, y, params?.dir || S.player.dir || START.dir, { fade: false });
    },
    exit() { syncState(); save(); },
    update,
    render,
  };
}

export function register() {
  Scenes.register('overworld', () => overworldScene());
  Hooks.install('world', {
    async warpTo(mapId, x, y, dir) { await enterMap(mapId, x, y, dir); },
    refresh() { if (map) { try { Hooks.village.applyTo(map); } catch {} } },
    playerTile() {
      return player
        ? { x: player.x, y: player.y, dir: player.dir, map: map?.id }
        : { x: S.player.x, y: S.player.y, dir: S.player.dir, map: S.player.map };
    },
    currentMap() { return map; },
    lockInput(v) { busy = !!v; },
  });
}

export { map as currentMap, nameOf };
