// Build mode and the village board.
//
// Littlewood's standard is the target: you always know what to build next, what it
// costs, what it gives you, and what is still locked and why. Placement is tactile —
// a ghost of the real building follows the cursor, green when it fits and red when it
// does not, with the footprint outlined tile by tile. Upgrades show a literal
// before/after so the transformation is the reward, not a number going up.

import { R, LAYER } from '../core/renderer.js';
import { Input } from '../core/input.js';
import { Scenes } from '../core/scene.js';
import { Atlas } from '../art/atlas.js';
import { Audio } from '../core/audio.js';
import { UIx, Hooks } from '../core/bridge.js';
import { Font } from '../core/font.js';
import { S } from '../state.js';
import { P, mix, shade } from '../art/palette.js';
import { clamp, ease, TILE } from '../core/util.js';
import { Village } from './village.js';
import {
  DEFS, defFor, buildRow, costToBuild, costToUpgrade, benefitsFor, gainsFrom,
  builtList, builtOf, countOf, bestTier, unlockState, placeNote, discountPct, CATEGORY,
} from './buildings.js';
import { Economy } from './economy.js';

const money = c => `${c.coins || 0}c${c.hearth ? `  ${c.hearth}h` : ''}`;

// ============================================================ the village board
const TABS = [{ id: 'build', label: 'Build' }, { id: 'upgrade', label: 'Upgrade' }, { id: 'village', label: 'Village' }];

function boardScene(params) {
  let tab = Math.max(0, TABS.findIndex(t => t.id === (params?.tab || 'build')));
  let sel = 0, scroll = 0, t = 0, busy = false;
  let rows = [];

  function refresh() {
    const lv = Village.level();
    if (TABS[tab].id === 'build') {
      rows = DEFS.map(d => ({ kind: 'build', def: d, ...buildRow(d.id, lv) }));
    } else if (TABS[tab].id === 'upgrade') {
      rows = builtList()
        .map(b => ({ kind: 'upgrade', b, def: defFor(b.type) }))
        .filter(r => r.def && (r.b.tier || 1) < r.def.tiers)
        .map(r => ({ ...r, cost: costToUpgrade(r.b.type, r.b.tier || 1) }));
    } else rows = [];
    sel = clamp(sel, 0, Math.max(0, rows.length - 1));
    const vis = 5;
    if (sel < scroll) scroll = sel;
    if (sel >= scroll + vis) scroll = sel - vis + 1;
  }

  async function activate() {
    const row = rows[sel];
    if (!row) return;
    busy = true;
    try {
      if (row.kind === 'build') {
        const liveMap = Hooks.world.currentMap?.() || null;
        if (!Village.isVillageMap(liveMap)) {
          Audio.sfx('deny');
          await UIx.say('Return to Emberhollow to choose the ground for a new building.', { speaker: 'Village Board' });
          return;
        }
        if (row.state === 'locked') {
          await UIx.say(row.lock.reason || `Not yet. ${row.def.name} opens up later.`, { speaker: row.def.name });
          return;
        }
        if (row.state === 'full') {
          await UIx.say(`You already have as many as Emberhollow can support right now.`, { speaker: row.def.name });
          return;
        }
        if (!row.affordable) {
          Audio.sfx('deny');
          await UIx.say(`That needs ${money(row.cost)}. Not yet — but soon.`, { speaker: row.def.name });
          return;
        }
        Scenes.replace('build', { type: row.def.id });
        return;
      }
      // upgrade
      const ok = await Scenes.pushAsync('upgradecard', { b: row.b });
      if (ok) refresh();
    } finally { busy = false; }
  }

  function update() {
    t++;
    if (busy || UIx.busy) return;
    if (Input.pressed('b')) { Audio.sfx('cancel'); Scenes.pop(); return; }
    if (Input.pressed('left')) { tab = (tab + TABS.length - 1) % TABS.length; sel = 0; scroll = 0; Audio.sfx('cursor'); refresh(); }
    if (Input.pressed('right')) { tab = (tab + 1) % TABS.length; sel = 0; scroll = 0; Audio.sfx('cursor'); refresh(); }
    if (rows.length) {
      if (Input.pressed('down')) { sel = (sel + 1) % rows.length; Audio.sfx('cursor'); refresh(); }
      if (Input.pressed('up')) { sel = (sel + rows.length - 1) % rows.length; Audio.sfx('cursor'); refresh(); }
    }
    if (Input.pressed('a')) activate();
  }

  function render() {
    R.layer(LAYER.GROUND, () => {
      R.rect(0, 0, R.W, R.H, mix(P.wood4, P.ink, 0.45));
      R.rect(0, 0, R.W, 24, mix(P.ink, P.wood4, 0.5));
      R.rect(0, 23, R.W, 1, P.gold3);
    });
    R.layer(LAYER.UI, () => {
      header();
      if (TABS[tab].id === 'village') villagePage();
      else { list(); detail(); }
      R.rect(0, R.H - 12, R.W, 12, mix(P.ink, P.wood4, 0.5));
      R.text('◀ ▶ tabs    A select    B back', 6, R.H - 10, { color: P.ui1 });
    });
  }

  function header() {
    const lv = Village.level();
    R.text('EMBERHOLLOW', 8, 6, { color: P.gold1 });
    R.text(`Level ${lv}`, 96, 6, { color: P.gold0 });
    const c = Atlas.tryGet('ui.coin'); if (c) R.blit(c, R.W - 108, 5);
    R.text(String(S.coins), R.W - 95, 6, { color: P.gold0 });
    const h = Atlas.tryGet('ui.hearth'); if (h) R.blit(h, R.W - 56, 5);
    R.text(String(S.hearth), R.W - 43, 6, { color: P.ember0 });

    let tx = 8;
    TABS.forEach((tb, i) => {
      const w = Font.measure(tb.label), on = i === tab;
      if (on) R.rect(tx - 3, 24, w + 6, 10, P.gold3);
      R.text(tb.label, tx, 25, { color: on ? P.gold0 : P.ui2 });
      tx += w + 12;
    });
  }

  function list() {
    const X = 8, Y = 38, W = 150, H = 118;
    UIx.panel(X - 2, Y - 2, W + 4, H + 4, 'paper');
    if (!rows.length) {
      R.text(TABS[tab].id === 'upgrade' ? 'Nothing to upgrade yet.' : 'Nothing available.',
        X + 8, Y + 14, { color: P.ink3, shadow: false });
      return;
    }
    for (let i = 0; i < 5; i++) {
      const idx = scroll + i, row = rows[idx];
      if (!row) break;
      const y = Y + 2 + i * 23, on = idx === sel;
      const locked = row.kind === 'build' && row.state === 'locked';
      const poor = row.kind === 'build' && row.state === 'poor';
      R.rect(X, y, W - 4, 21, on ? mix(P.gold1, P.paper0, 0.5) : P.paper1);
      R.rect(X, y, 2, 21, CATEGORY?.[row.def.cat]?.color || P.gold2);
      if (on) {
        const c = Atlas.tryGet('ui.cursor');
        if (c) R.blit(c, X - 8, y + 5 + Math.sin(t / 9) * 0.6);
      }
      const label = row.kind === 'upgrade'
        ? `${row.def.name}  ${row.b.tier}→${row.b.tier + 1}` : row.def.name;
      R.text(label, X + 7, y + 2, { color: locked ? P.ui2 : P.ink2, shadow: false });
      if (locked) {
        const b = Atlas.tryGet('ui.badge.lock'); if (b) R.blit(b, X + W - 18, y + 2);
        // Say WHY it is locked — a grey row with no explanation is the thing
        // Littlewood never does.
        const why = row.lock.reason || 'locked';
        R.text(why.length > 30 ? why.slice(0, 29) + '…' : why, X + 7, y + 11,
          { color: P.ui2, shadow: false });
      } else {
        R.text(money(row.cost || { coins: 0 }), X + W - 8, y + 11,
          { color: poor ? P.hpBad : P.ink3, shadow: false, align: 'right' });
        if (row.kind === 'build' && row.have > 0) {
          R.text(`have ${row.have}/${row.cap}`, X + 7, y + 11, { color: P.ui2, shadow: false });
        }
      }
    }
  }

  function detail() {
    const X = 164, W = R.W - X - 8, Y = 38, H = 118;
    UIx.panel(X, Y, W, H, 'paper');
    const row = rows[sel];
    if (!row) return;
    const def = row.def;
    const tier = row.kind === 'upgrade' ? (row.b.tier || 1) + 1 : 1;

    // Preview of what you'd actually get.
    const img = Atlas.tryGet(`b.${def.id}.t${Math.min(def.tiers, tier)}`);
    if (img) {
      const s = Math.min(1, 46 / Math.max(img.width, img.height));
      R.blit(img, X + W / 2 - (img.width * s) / 2, Y + 6, { w: img.width * s, h: img.height * s });
    }
    let y = Y + 56;
    R.text(def.name, X + W / 2, y, { color: P.ink, shadow: false, align: 'center' }); y += 12;
    for (const l of Font.wrap(def.blurb || placeNote(def.id), W - 14).slice(0, 3)) {
      R.text(l, X + 7, y, { color: P.ink3, shadow: false }); y += 10;
    }
    y += 2;
    R.rect(X + 6, y, W - 12, 1, P.ui1); y += 4;
    R.text(row.kind === 'upgrade' ? 'Gains' : 'Gives you', X + 7, y, { color: P.ui2, shadow: false }); y += 11;
    const gains = row.kind === 'upgrade' ? gainsFrom(def.id, row.b.tier || 1) : benefitsFor(def.id, 1);
    const bottom = Y + H - 4;
    for (const g of (gains || [])) {
      // Wrap and clip to the panel — benefit text runs long and used to spill off-screen.
      for (const l of Font.wrap('· ' + g, W - 14)) {
        if (y + 9 > bottom) return;
        R.text(l, X + 7, y, { color: P.leaf3, shadow: false });
        y += 9;
      }
    }
  }

  function villagePage() {
    const X = 8, Y = 38, W = R.W - 16, H = 118;
    UIx.panel(X, Y, W, H, 'paper');
    const lv = Village.level();
    const prog = Village.progress ? Village.progress() : null;
    R.text(`Emberhollow, Level ${lv}`, X + 8, Y + 6, { color: P.ink, shadow: false });

    // Progress toward the next level — never a mystery number.
    const bw = W - 20;
    R.rect(X + 8, Y + 20, bw, 6, P.ui1);
    const frac = prog ? clamp(prog.frac ?? 0, 0, 1) : 0;
    R.rect(X + 8, Y + 20, Math.round(bw * frac), 6, P.gold2);
    R.rect(X + 8, Y + 20, Math.round(bw * frac), 1, P.gold0);
    R.text(prog ? `${prog.points} / ${prog.next ?? prog.points} toward level ${Math.min(lv + 1, Village.MAX_LEVEL)}`
      : `${Village.points()} points`, X + 8, Y + 30, { color: P.ink3, shadow: false });

    const stats = [
      ['Buildings', String(builtList().length)],
      ['Missions done', String((S.missions?.done || []).length)],
      ['Guardians bonded', String(S.stats?.bonded || 0)],
      ['Workshop discount', discountPct() ? discountPct() + '%' : '—'],
    ];
    stats.forEach(([k, v], i) => {
      const yy = Y + 46 + i * 12;
      R.text(k, X + 10, yy, { color: P.ink3, shadow: false });
      R.text(v, X + W - 10, yy, { color: P.ink2, shadow: false, align: 'right' });
    });

    const next = Village.unlocksAt ? Village.unlocksAt(lv + 1) : null;
    if (next && next.length) {
      R.text('Next level opens: ' + next.slice(0, 3).join(', '), X + 10, Y + H - 18,
        { color: P.gold3, shadow: false });
    }
  }

  return { enter() { Village.ensureState(); refresh(); }, update, render };
}

// ====================================================== upgrade before/after card
function upgradeCardScene(params) {
  const b = params?.b;
  let t = 0, sel = 0, busy = false;
  const def = b ? defFor(b.type) : null;
  const tier = b?.tier || 1;
  const cost = def ? costToUpgrade(b.type, tier) : null;
  const can = cost ? Economy.canAfford(cost) : false;

  async function confirm() {
    if (!can) { Audio.sfx('deny'); return; }
    busy = true;
    try {
      const ok = Village.upgrade(b);
      if (ok) {
        Audio.sfx('build.done');
        R.flash('#fff6c4', 8);
        UIx.toast(`${def.name} is now tier ${b.tier}`, { ms: 2200 });
        await UIx.say(`${def.name} has grown. ${(gainsFrom(def.id, tier) || [])[0] || 'The village feels warmer.'}`,
          { speaker: 'Emberhollow' });
      }
      Scenes.pop(ok);
    } finally { busy = false; }
  }

  return {
    drawsBelow: true,
    update() {
      t++;
      if (busy || UIx.busy) return;
      if (Input.pressed('b')) { Audio.sfx('cancel'); Scenes.pop(false); }
      if (Input.pressed('left') || Input.pressed('right')) { sel = 1 - sel; Audio.sfx('cursor'); }
      if (Input.pressed('a')) { if (sel === 0) confirm(); else { Audio.sfx('cancel'); Scenes.pop(false); } }
    },
    render() {
      R.layer(LAYER.UI, () => {
        R.rect(0, 0, R.W, R.H, 'rgba(12,10,18,0.62)');
        const W = 244, H = 132, X = (R.W - W) / 2, Y = (R.H - H) / 2;
        UIx.panel(X, Y, W, H, 'paper');
        if (!def) { R.text('Nothing to upgrade.', X + 12, Y + 12, { color: P.ink2, shadow: false }); return; }

        R.text(def.name, X + W / 2, Y + 8, { color: P.ink, shadow: false, align: 'center' });
        R.text(`Level ${tier}  →  Level ${tier + 1}`, X + W / 2, Y + 20,
          { color: P.gold3, shadow: false, align: 'center' });

        // The literal before/after — this is the whole point of the card.
        const before = Atlas.tryGet(`b.${def.id}.t${tier}`);
        const after = Atlas.tryGet(`b.${def.id}.t${Math.min(def.tiers, tier + 1)}`);
        const box = 52;
        const drawAt = (img, cx) => {
          if (!img) return;
          const s = Math.min(1, box / Math.max(img.width, img.height));
          R.blit(img, cx - (img.width * s) / 2, Y + 34 + (box - img.height * s),
            { w: img.width * s, h: img.height * s });
        };
        drawAt(before, X + 56);
        drawAt(after, X + W - 56);
        const pulse = 0.6 + 0.4 * Math.sin(t / 10);
        R.text('▶', X + W / 2 - 4, Y + 58, { color: P.gold2, shadow: false, alpha: pulse });
        R.text('now', X + 56, Y + 90, { color: P.ui2, shadow: false, align: 'center' });
        R.text('next', X + W - 56, Y + 90, { color: P.gold3, shadow: false, align: 'center' });

        let y = Y + 100;
        for (const g of (gainsFrom(def.id, tier) || []).slice(0, 2)) {
          R.text('· ' + g, X + 12, y, { color: P.leaf3, shadow: false }); y += 10;
        }
        R.text(money(cost || { coins: 0 }), X + W - 12, Y + 100,
          { color: can ? P.ink2 : P.hpBad, shadow: false, align: 'right' });

        ['Upgrade', 'Not now'].forEach((label, i) => {
          const bx = X + 14 + i * 78, by = Y + H - 18;
          const on = i === sel;
          R.rect(bx - 4, by - 3, 72, 14, on ? mix(P.gold1, P.paper0, 0.4) : P.paper1);
          R.stroke(bx - 4, by - 3, 72, 14, on ? P.gold3 : P.ui1);
          R.text(label, bx + 32, by, {
            color: i === 0 && !can ? P.ui2 : P.ink2, shadow: false, align: 'center',
          });
        });
      });
    },
  };
}

// ================================================================== build mode
function buildModeScene(params) {
  const moving = params?.mode === 'relocate'
    ? builtList().find(b => b.id === params?.movingId) || null
    : null;
  const relocating = !!moving;
  // Opened directly (?scene=build) there is no type; fall back to the first thing
  // that is actually buildable so the screen is always inspectable.
  const type = moving?.type || params?.type
    || DEFS.find(d => buildRow(d.id, Village.level()).state === 'ready')?.id
    || DEFS[1]?.id || DEFS[0]?.id;
  const def = defFor(type);
  let cx = 0, cy = 0, t = 0, busy = false;
  let valid = { ok: false, reason: '', tiles: [] };
  let raising = null;        // {t} construction animation

  function recheck() {
    if (!def) { valid = { ok: false, reason: 'Nothing to place.', tiles: [] }; return; }
    const map = Hooks.world.currentMap?.() || null;
    if (!Village.isVillageMap(map)) {
      valid = { ok: false, reason: 'Return to Emberhollow to place this building.', tiles: [] };
      return;
    }
    let player = null;
    try { player = Hooks.world.playerTile?.() || null; } catch {}
    try { valid = Village.validate(type, cx, cy, { map, player, ignoreId: moving?.id }); }
    catch { valid = { ok: false, reason: 'Step into the village to build.', tiles: [] }; }
  }

  function move(dx, dy) {
    cx = clamp(cx + dx, 0, 200);
    cy = clamp(cy + dy, 0, 200);
    recheck();
    Audio.sfx('cursor', { gain: 0.5 });
  }

  async function place() {
    if (!valid.ok) { Audio.sfx('deny'); UIx.toast(valid.reason || 'It will not fit here.'); return; }
    busy = true;
    try {
      raising = { t: 0 };
      Audio.sfx('build.saw');
      await waitFrames(14);
      Audio.sfx('build.hit');
      await waitFrames(14);
      Audio.sfx('build.hit');
      await waitFrames(12);
      const b = relocating ? (Village.relocate(moving, cx, cy) && moving) : Village.place(type, cx, cy);
      if (!b) { Audio.sfx('deny'); raising = null; UIx.toast('That spot is no longer available.'); return; }
      Audio.sfx('build.done');
      R.flash('#fff6c4', 6);
      R.shake(2, 8);
      await waitFrames(18);
      raising = null;
      UIx.toast(relocating ? `${def.name} moved` : `${def.name} raised`, { ms: 2200 });
      await UIx.say(relocating
        ? `${def.name} has a new place in Emberhollow.`
        : `${def.name} is standing. ${(benefitsFor(type, 1) || [])[0] || 'Emberhollow feels a little fuller.'}`,
        { speaker: 'Emberhollow' });
      Scenes.pop(true);
    } finally { busy = false; }
  }

  return {
    drawsBelow: true,
    enter() {
      document.body.classList.add('build-active');
      Village.ensureState();
      if (!def) { cx = 0; cy = 0; return; }
      const map = Hooks.world.currentMap?.() || null;
      let start = relocating ? { x: moving.x, y: moving.y } : null;
      try { start ||= Village.firstValidPlot(type, { map }); } catch { /* no map yet */ }
      start = start || Village.plazaCentre() || { x: 21, y: 19 };
      cx = start.x; cy = start.y;
      recheck();
    },
    exit() { document.body.classList.remove('build-active'); },
    update() {
      t++;
      if (raising) raising.t++;
      if (busy || UIx.busy) return;
      if (Input.pressed('b')) { Audio.sfx('cancel'); Scenes.pop(false); return; }
      if (!def) return;
      const d = Input.dir();
      if (Input.pressed('up')) move(0, -1);
      else if (Input.pressed('down')) move(0, 1);
      else if (Input.pressed('left')) move(-1, 0);
      else if (Input.pressed('right')) move(1, 0);
      if (Input.pressed('a')) place();
      if (Input.pressed('select')) {
        // Jump to the next suggested plot — never leave the player hunting.
        const plots = Village.plotList();
        const next = plots.find(p => p.x !== cx || p.y !== cy);
        if (next) { cx = next.x; cy = next.y; recheck(); Audio.sfx('confirm'); }
      }
      // Keep the camera on the cursor so placement always reads in context.
      R.centerOn(cx * TILE + (def ? def.w * 8 : 8), cy * TILE + (def ? def.h * 8 : 8),
        Hooks.world.currentMap?.()?.bounds);
    },
    render() {
      const cam = R.camera;
      R.layer(LAYER.OVER, () => {
        if (!def) return;
        // Footprint, tile by tile, so the player can count the space.
        for (let j = 0; j < def.h; j++) {
          for (let i = 0; i < def.w; i++) {
            const sx = (cx + i) * TILE - cam.x, sy = (cy + j) * TILE - cam.y;
            const blocked = valid.tiles?.some?.(tl => tl.x === cx + i && tl.y === cy + j && !tl.ok);
            const col = valid.ok && !blocked ? 'rgba(126,217,87,0.32)' : 'rgba(232,86,63,0.34)';
            R.rect(sx, sy, TILE, TILE, col);
            R.stroke(sx, sy, TILE, TILE, valid.ok ? '#9bea6b' : '#ff9a8a');
          }
        }
        // Ghost of the real building, so you see what you are actually placing.
        const img = Atlas.tryGet(`b.${def.id}.t1`);
        const gx = cx * TILE - cam.x, gy = (cy - def.overhang) * TILE - cam.y;
        if (img) {
          const bounce = raising ? Math.max(0, 1 - raising.t / 40) * 8 : Math.sin(t / 18) * 1;
          R.blit(img, gx, gy - bounce, { alpha: raising ? Math.min(1, raising.t / 30) : 0.62 });
        }
        if (raising) {
          const f = Atlas.tryGet('fx.build.frame');
          if (f && raising.t < 34) {
            for (let j = 0; j < def.h; j++) for (let i = 0; i < def.w; i++) {
              R.blit(f, (cx + i) * TILE - cam.x, (cy + j) * TILE - cam.y, { alpha: 0.8 });
            }
          }
          if (raising.t % 9 === 0) {
            const d = Atlas.tryGet('fx.dust', (raising.t / 9) % 4);
            if (d) R.blit(d, gx + def.w * 8 - 12, gy + def.h * 16);
          }
        }
      });

      R.layer(LAYER.UI, () => {
        if (!def) return;
        const H = 40;
        UIx.panel(6, R.H - H - 4, R.W - 12, H, 'paper');
        R.text(`${relocating ? 'Moving' : 'Placing'} ${def.name}`, 14, R.H - H + 1, { color: P.ink, shadow: false });
        R.text(relocating ? 'No cost' : money(costToBuild(def.id)), R.W - 14, R.H - H + 1,
          { color: P.ink2, shadow: false, align: 'right' });
        R.text(valid.ok ? 'Looks like a good spot.' : (valid.reason || 'It will not fit here.'),
          14, R.H - H + 13, { color: valid.ok ? P.leaf3 : P.hpBad, shadow: false });
        R.text('◀▲▼▶ move    A place    ⇥ next plot    B cancel', 14, R.H - H + 25,
          { color: P.ui2, shadow: false });
      });
    },
  };
}

const waitFrames = n => new Promise(res => {
  let left = n;
  const tick = () => (--left <= 0) ? res() : requestAnimationFrame(tick);
  requestAnimationFrame(tick);
});

export function register() {
  Scenes.register('village', p => boardScene(p));
  Scenes.register('build', p => buildModeScene(p));
  Scenes.register('upgradecard', p => upgradeCardScene(p));
}
