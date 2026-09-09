// The overworld HUD.
//
// It has to answer "when is it, what do I have, how is my team, where am I" without
// getting in the way of the world. So: small, cornered, semi-transparent, and it
// shrinks out of the way whenever dialogue is open.

import { R, LAYER } from '../core/renderer.js';
import { Input } from '../core/input.js';
import { Scenes } from '../core/scene.js';
import { Atlas } from '../art/atlas.js';
import { UIx, Hooks } from '../core/bridge.js';
import { Font } from '../core/font.js';
import { S } from '../state.js';
import { P } from '../art/palette.js';
import { clamp, ease } from '../core/util.js';
import { Frame, seasonIcon, skyIcon } from './frame.js';
import { clockText } from '../world/daynight.js';

const toasts = [];
let hide = 0;            // 0 = fully shown, 1 = fully tucked away
let t = 0;

const fit = (text, width) => {
  let out = String(text);
  if (Font.measure(out) <= width) return out;
  while (out && Font.measure(out + '…') > width) out = out.slice(0, -1);
  return out + '…';
};
const count = n => n >= 10000 ? `${Math.floor(n / 1000)}k` : String(n);

// The first steps are always discoverable. A chosen family mission takes over
// after the companion introduction, so the board stays connected to the world.
export function journeyGoal(map) {
  if (!S.party.length) return {
    title: 'Find your first Guardian',
    hint: map?.id === 'granhouse' ? 'Talk to Gran beside the table.'
      : map?.id === 'village' ? 'Gran waits north of the plaza.' : 'Return to Emberhollow for Gran.',
    target: map?.npcs?.find(n => n.who === 'gran'),
  };
  const tracked = Hooks.missions.list('today').find(row => row.tracked && !row.done);
  if (tracked) return {
    title: tracked.m.title,
    hint: `${tracked.progress}/${tracked.need} complete  ·  ${Input.label('start')} > Family missions`,
  };
  if (!S.flags.metMayor) return {
    title: 'Meet Mayor Bramble',
    hint: map?.id === 'village' ? 'Say hello at the village plaza.' : 'Meet the Mayor in Emberhollow.',
    target: map?.npcs?.find(n => n.who === 'mayor'),
  };
  if (!S.stats.bonded) return { title: 'A new friend in the valley', hint: 'Tall grass hides wild Guardians.' };
  if (!S.stats.built) return { title: 'Make Emberhollow your own', hint: `${Input.label('start')} > Village to build a home.` };
  return { title: 'Good things, done together', hint: `${Input.label('start')} > Family missions to choose one.` };
}

function drawJourney(map, goal) {
  if (hide > 0.15 || S.settings.showHints === false) return;
  const x = 4, y = 22, w = 186;
  Frame.panel(x, y, w, 35, { style: 'hud', alpha: 0.94 });
  R.rect(x + 4, y + 6, 2, 23, P.gold2);
  Frame.write(fit(map?.name || 'YOUR JOURNEY', w - 20), x + 11, y + 5, 'hud', { color: P.gold1 });
  Frame.write(fit(goal.title, w - 20), x + 11, y + 15, 'hud');
  Frame.write(fit(goal.hint, w - 20), x + 11, y + 25, 'hud', { color: P.ui1 });
  if (Input.device !== 'touch') {
    const text = `${Input.label('move')} move   ${Input.label('a')} interact   ${Input.label('start')} journal`;
    Frame.panel(4, R.H - 15, Font.measure(text) + 12, 12, { style: 'hud', alpha: 0.86 });
    Frame.write(text, 10, R.H - 12, 'hud', { color: P.ui1 });
  }
}

// --- minimap -----------------------------------------------------------------
// Rebuilt only when the map changes: 1px per tile, colour-coded by walkability so
// it reads as a map rather than a thumbnail of the tiles.
let miniFor = null, mini = null;

function buildMinimap(map) {
  const c = document.createElement('canvas');
  c.width = map.w; c.height = map.h;
  const x = c.getContext('2d');
  const img = x.createImageData(map.w, map.h);
  const put = (i, hex, a = 255) => {
    img.data[i] = parseInt(hex.slice(1, 3), 16);
    img.data[i + 1] = parseInt(hex.slice(3, 5), 16);
    img.data[i + 2] = parseInt(hex.slice(5, 7), 16);
    img.data[i + 3] = a;
  };
  for (let yy = 0; yy < map.h; yy++) {
    for (let xx = 0; xx < map.w; xx++) {
      const i = (yy * map.w + xx) * 4;
      const ground = map.ground(xx, yy) || '';
      if (map.isWater(xx, yy)) put(i, '#2b7fae');
      else if (map.tag(xx, yy) === 'door') put(i, '#f5c877');
      else if (/path|plaza|cobble|gravel|bridge/.test(ground)) put(i, '#c9aa6a');
      else if (map.over(xx, yy) || map.solid(xx, yy) || Hooks.village.solid(map, xx, yy)) put(i, '#203d24');
      else if (map.isGrass(xx, yy)) put(i, '#376d35');
      else put(i, '#5f9147');
    }
  }
  x.putImageData(img, 0, 0);
  return c;
}

function drawMinimap(map, x, y, w, h, goal) {
  if (!map) return;
  if (miniFor !== map.id) { mini = buildMinimap(map); miniFor = map.id; }
  Frame.panel(x, y, w, h, { style: 'dark', alpha: 0.82 });
  const iw = w - 6, ih = h - 6;
  const s = Math.min(iw / map.w, ih / map.h);
  const dw = Math.max(1, Math.round(map.w * s)), dh = Math.max(1, Math.round(map.h * s));
  const dx = Math.round(x + 3 + (iw - dw) / 2), dy = Math.round(y + 3 + (ih - dh) / 2);
  const ctx = R.ctx;
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = 0.85;
  ctx.drawImage(mini, dx, dy, dw, dh);
  ctx.globalAlpha = 1;
  // A steady white pip stays findable; gold marks the next story destination.
  if (goal?.target && S.settings.showHints !== false) {
    const gx = dx + Math.round(goal.target.x * s), gy = dy + Math.round(goal.target.y * s);
    R.rect(gx - 1, gy - 1, 3, 3, '#2a271b');
    R.rect(gx, gy - 2, 1, 5, P.gold0);
    R.rect(gx - 2, gy, 5, 1, P.gold0);
  }
  const px = dx + Math.round(S.player.x * s), py = dy + Math.round(S.player.y * s);
  R.rect(px - 2, py - 2, 5, 5, '#142926');
  R.rect(px - 1, py - 1, 3, 3, '#fff6c4');
  R.rect(px, py, 1, 1, P.ember1);
}

// --- the bar -----------------------------------------------------------------
function drawTop(map) {
  const y = Math.round(2 - hide * 24);
  if (y < -20) return;

  // time + season
  const w1 = 78;
  Frame.panel(4, y, w1, 16, { style: 'hud', alpha: 0.86 });
  skyIcon(8, y + 4, S.clock.hour);
  Frame.write(clockText(), 20, y + 5, 'hud');
  seasonIcon(48, y + 4, S.clock.season);
  Frame.write(`d${S.clock.day}`, 60, y + 5, 'hud');

  // currencies
  const coins = count(S.coins), hearth = count(S.hearth);
  const w2 = 38 + Font.measure(coins) + Font.measure(hearth);
  const x2 = 4 + w1 + 4;
  Frame.panel(x2, y, w2, 16, { style: 'hud', alpha: 0.86 });
  const ci = Atlas.tryGet('ui.coin');
  if (ci) R.blit(ci, x2 + 4, y + 3);
  Frame.write(coins, x2 + 16, y + 5, 'hud');
  const hi = Atlas.tryGet('ui.hearth');
  const hx = x2 + 20 + Font.measure(coins);
  if (hi) R.blit(hi, hx, y + 3);
  Frame.write(hearth, hx + 12, y + 5, 'hud');

  // party health pips
  if (S.party.length) {
    const pw = 8 + S.party.length * 10;
    const x3 = x2 + w2 + 4;
    Frame.panel(x3, y, pw, 16, { style: 'hud', alpha: 0.86 });
    S.party.forEach((g, i) => {
      const f = g.maxhp ? clamp(g.hp / g.maxhp, 0, 1) : 0;
      const px = x3 + 5 + i * 10;
      R.rect(px, y + 4, 6, 8, '#241a12');
      const col = f > 0.5 ? P.hpGood : f > 0.22 ? P.hpWarn : P.hpBad;
      const fh = Math.max(f > 0 ? 1 : 0, Math.round(6 * f));
      R.rect(px + 1, y + 10 - fh, 4, fh, col);
    });
  }
}

// --- toasts ------------------------------------------------------------------
function drawToasts() {
  // A queued reward never expires underneath a dialogue or a menu. Long notices
  // wrap inside the playfield instead of extending beyond its left edge.
  if (hide > 0.1 || Scenes.topName !== 'overworld' || !toasts.length) return;
  const to = toasts[0];
  if (--to.life <= 0) { toasts.shift(); return; }
  const inset = to.icon ? 28 : 16;
  const maxW = R.W - 100;
  const lines = Font.wrap(to.text, maxW - inset);
  const visible = lines.slice(0, 3);
  if (lines.length > 3) visible[2] = fit(visible[2] + '…', maxW - inset);
  const w = Math.min(maxW, Math.max(...visible.map(l => Font.measure(l))) + inset);
  const h = visible.length * 10 + 8;
  const k = R.cinematicFx ? Math.min(
    ease.outCubic(clamp((to.total - to.life) / 8, 0, 1)),
    ease.outCubic(clamp(to.life / 8, 0, 1))) : 1;
  const x = Math.round((R.W - w) / 2), y = Input.device === 'touch' ? 77 : 61;
  Frame.panel(x, y, w, h, { style: 'gold', alpha: k });
  if (k < 0.75) return;
  let tx = x + 8;
  if (to.icon) {
    const im = Atlas.tryGet(to.icon);
    if (im) R.blit(im, tx, y + 5);
    tx += 12;
  }
  visible.forEach((line, i) => Frame.write(line, tx, y + 5 + i * 10, 'gold'));
}

// --- public ------------------------------------------------------------------
export const HUD = {
  toast(text, opts = {}) {
    const message = String(text).trim();
    if (!message) return;
    const life = Math.round(Math.max(opts.ms || 2200, Math.min(6500, message.length * 45)) / (1000 / 60));
    const existing = toasts.find(to => to.text === message);
    if (existing) { existing.life = life; existing.total = life; return; }
    toasts.push({ text: message, icon: opts.icon, life, total: life });
    if (toasts.length > 12) toasts.splice(1, 1);
  },

  draw(map) {
    t++;
    // Tuck away while anything is talking, so dialogue owns the screen.
    const want = UIx.busy ? 1 : 0;
    hide += clamp(want - hide, -0.14, 0.14);

    R.layer(LAYER.UI, () => {
      // The world also renders below pause, settings and dialogue. Those scenes
      // own their prompts; exploration chrome must not peek through underneath.
      const placing = document.body.classList.contains('build-active');
      if (Scenes.topName !== 'overworld') {
        if (placing) drawTop(map);
        return;
      }
      drawTop(map);
      const goal = journeyGoal(map);
      if (!placing) drawJourney(map, goal);
      if (hide < 0.5 && map && !map.indoor) {
        const mw = 54, mh = 44;
        // Touch action buttons occupy the lower-right. Keep the map directly
        // below the menu button instead of covering either control.
        const baseY = document.body.classList.contains('touch') ? 28 : R.H - mh - 4;
        drawMinimap(map, R.W - mw - 4, baseY + Math.round(hide * 60), mw, mh, goal);
      }
      drawToasts();
    });
  },

  invalidateMinimap() { miniFor = null; },
};

export function register() {
  Hooks.install('hud', {
    draw: map => HUD.draw(map),
    invalidateMinimap: () => HUD.invalidateMinimap(),
  });
  UIx.install({ toast: (text, opts) => HUD.toast(text, opts), drawToasts: () => {} });
}
