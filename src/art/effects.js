// Effects: shadows, footfalls, weather, hit flashes, bonding, evolution.
// Small, cheap, and animated — these are what make actions feel like they landed.

import { Atlas } from './atlas.js';
import { FX, ANIM_FX } from './names.js';
import { P, RAMP, mix, shade } from './palette.js';

const fill = (ctx, x, y, c, w = 1, h = 1) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); };

function ellipse(ctx, cx, cy, rx, ry, c) {
  if (rx <= 0 || ry <= 0) return;
  ctx.fillStyle = c;
  for (let y = Math.ceil(cy - ry); y <= cy + ry; y++) {
    const t = (y + 0.5 - cy) / ry;
    if (Math.abs(t) > 1) continue;
    const half = Math.sqrt(1 - t * t) * rx;
    const x0 = Math.round(cx - half), x1 = Math.round(cx + half);
    if (x1 > x0) ctx.fillRect(x0, y, x1 - x0, 1);
  }
}

function ring(ctx, cx, cy, r, c, thick = 1) {
  ctx.fillStyle = c;
  const steps = Math.max(10, Math.round(r * 7));
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    ctx.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r * 0.62), thick, thick);
  }
}

// A small kit of per-effect painters. Anything not listed gets a sane default so a
// missing painter degrades to "faint sparkle" rather than a magenta box.
const FXP = {
  'fx.shadow': (ctx, w, h) => { ellipse(ctx, w / 2, h / 2, w / 2 - 1, h / 2 - 0.5, 'rgba(24,18,12,0.42)'); },
  'fx.shadow.big': (ctx, w, h) => { ellipse(ctx, w / 2, h / 2, w / 2 - 2, h / 2 - 1, 'rgba(24,18,12,0.36)'); },

  'fx.grass.rustle': (ctx, w, h, f) => {
    const lean = [0, 2, 0, -2][f];
    for (let i = 0; i < 5; i++) {
      const x = 2 + i * 3;
      ctx.fillStyle = i % 2 ? RAMP.grass[1] : RAMP.grass[2];
      for (let j = 0; j < 6; j++) ctx.fillRect(x + Math.round(lean * j / 6), h - 2 - j, 1, 1);
    }
    if (f === 1 || f === 3) { fill(ctx, 3, h - 9, RAMP.grass[0]); fill(ctx, 12, h - 8, RAMP.grass[0]); }
  },

  'fx.dust': (ctx, w, h, f) => {
    const r = 1.5 + f * 1.6, a = 0.5 - f * 0.11;
    ellipse(ctx, w / 2 - 2, h - 4, r, r * 0.55, `rgba(226,208,170,${Math.max(0, a)})`);
    ellipse(ctx, w / 2 + 3, h - 3, r * 0.7, r * 0.4, `rgba(226,208,170,${Math.max(0, a * 0.8)})`);
  },

  'fx.splash': (ctx, w, h, f) => {
    ring(ctx, w / 2, h - 5, 2 + f * 2.6, RAMP.water[0]);
    for (let i = 0; i < 4; i++) {
      const a = -0.3 - i * 0.6;
      fill(ctx, w / 2 + Math.cos(a) * (3 + f * 3), h - 6 - Math.sin(a) * (3 + f * 2.2), RAMP.water[1], 1, 1);
    }
  },

  'fx.sparkle': (ctx, w, h, f) => {
    const r = [1, 3, 5, 3][f];
    const c = [P.spark0, P.spark1, P.gold1, P.spark2][f];
    for (const [dx, dy] of [[0, 0], [-5, -4], [5, 3], [4, -5], [-4, 4]]) {
      fill(ctx, w / 2 + dx, h / 2 + dy - r, c, 1, r);
      fill(ctx, w / 2 + dx - Math.floor(r / 2), h / 2 + dy, c, r, 1);
    }
  },

  'fx.impact': (ctx, w, h, f) => {
    const r = 2 + f * 3.4;
    ring(ctx, w / 2, h / 2, r, f < 2 ? '#ffffff' : P.gold1, f < 3 ? 2 : 1);
    if (f < 2) ellipse(ctx, w / 2, h / 2, r * 0.5, r * 0.34, '#fffdf0');
  },

  'fx.slash': (ctx, w, h, f) => {
    ctx.fillStyle = f < 2 ? '#ffffff' : P.paper2;
    for (let i = 0; i < w; i++) {
      const y = h / 2 + (i - w / 2) * 0.55 + (f - 1.5) * 3;
      ctx.fillRect(i, Math.round(y), 1, f < 2 ? 3 : 2);
    }
  },

  'fx.ring': (ctx, w, h, f) => {
    ring(ctx, w / 2, h / 2, 2 + f * 3.2, f < 2 ? P.gold0 : P.gold2, f < 2 ? 2 : 1);
  },

  'fx.charm': (ctx, w, h, f) => {
    // A woven charm, tumbling. Our capture object — nothing thrown, something offered.
    const cy = h / 2 - Math.sin((f / 6) * Math.PI) * 4;
    ellipse(ctx, w / 2, cy, 5, 5, P.gold2);
    ellipse(ctx, w / 2 - 1, cy - 1, 3.4, 3.4, P.gold1);
    ellipse(ctx, w / 2 - 1.5, cy - 1.5, 1.6, 1.6, P.gold0);
    ctx.fillStyle = P.wood3;
    for (let i = 0; i < 4; i++) fill(ctx, w / 2 - 4 + i * 2.4, cy + 4 + (i % 2), P.wood2, 1, 3);
  },

  'fx.charm.open': (ctx, w, h, f) => {
    ring(ctx, w / 2, h / 2, 2 + f * 3, P.gold0, 2);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + f * 0.4;
      fill(ctx, w / 2 + Math.cos(a) * (4 + f * 3), h / 2 + Math.sin(a) * (4 + f * 3), P.gold1, 2, 2);
    }
  },

  'fx.heart': (ctx, w, h, f) => {
    const y = h / 2 - f * 2;
    const c = [P.bloom0, P.bloom1, P.bloom1, P.bloom2][f];
    for (const dx of [-2, 2]) ellipse(ctx, w / 2 + dx, y, 2.4, 2.2, c);
    ctx.fillStyle = c;
    for (let i = 0; i < 5; i++) ctx.fillRect(w / 2 - 4 + i, y + 2 + i * 0.6, 9 - i * 2, 1);
  },

  'fx.star': (ctx, w, h, f) => {
    const r = 3 + f;
    ctx.fillStyle = P.spark0;
    for (let i = -r; i <= r; i++) {
      ctx.fillRect(w / 2 + i, h / 2, 1, 1);
      ctx.fillRect(w / 2, h / 2 + i, 1, 1);
      if (Math.abs(i) < r * 0.6) { ctx.fillRect(w / 2 + i, h / 2 + i, 1, 1); ctx.fillRect(w / 2 + i, h / 2 - i, 1, 1); }
    }
    ellipse(ctx, w / 2, h / 2, 2, 2, '#ffffff');
  },

  'fx.evolve': (ctx, w, h, f) => {
    const a = 0.2 + f * 0.13;
    ellipse(ctx, w / 2, h / 2, w / 2 - f, h / 2 - f, `rgba(255,246,196,${a})`);
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2 + f * 0.3;
      fill(ctx, w / 2 + Math.cos(ang) * (6 + f * 3), h / 2 + Math.sin(ang) * (6 + f * 3), P.gold0, 2, 2);
    }
  },

  'fx.exclaim': (ctx, w, h) => {
    ellipse(ctx, w / 2, h / 2, 6, 6, P.paper0);
    ring(ctx, w / 2, h / 2, 6, P.ink2, 1);
    fill(ctx, w / 2 - 1, h / 2 - 4, P.ember2, 2, 5);
    fill(ctx, w / 2 - 1, h / 2 + 3, P.ember2, 2, 2);
  },
  'fx.emote.happy': (ctx, w, h) => {
    ellipse(ctx, w / 2, h / 2, 6, 6, P.paper0); ring(ctx, w / 2, h / 2, 6, P.ink2, 1);
    fill(ctx, w / 2 - 3, h / 2 - 1, P.ink2, 2, 1); fill(ctx, w / 2 + 2, h / 2 - 1, P.ink2, 2, 1);
    fill(ctx, w / 2 - 2, h / 2 + 2, P.ink2, 5, 1);
  },
  'fx.emote.think': (ctx, w, h) => {
    ellipse(ctx, w / 2, h / 2, 6, 6, P.paper0); ring(ctx, w / 2, h / 2, 6, P.ink2, 1);
    fill(ctx, w / 2 - 3, h / 2, P.ink2, 2, 2); fill(ctx, w / 2, h / 2, P.ink2, 2, 2); fill(ctx, w / 2 + 3, h / 2, P.ink2, 2, 2);
  },
  'fx.emote.sleep': (ctx, w, h) => {
    ellipse(ctx, w / 2, h / 2, 6, 6, P.paper0); ring(ctx, w / 2, h / 2, 6, P.ink2, 1);
    fill(ctx, w / 2 - 3, h / 2 - 2, P.ink2, 5, 1); fill(ctx, w / 2 - 3, h / 2 + 2, P.ink2, 5, 1);
    fill(ctx, w / 2 - 1, h / 2, P.ink2, 3, 1);
  },

  'fx.rain': (ctx, w, h, f) => { ctx.fillStyle = 'rgba(159,201,232,0.85)'; ctx.fillRect(w / 2, f, 1, 4); },
  'fx.snow': (ctx, w, h, f) => { ellipse(ctx, w / 2 + (f % 2), h / 2, 1.2, 1.2, '#f2f8ff'); },
  'fx.smoke': (ctx, w, h, f) => {
    ellipse(ctx, w / 2 + Math.sin(f) * 2, h - 4 - f * 3, 2 + f * 0.8, 2 + f * 0.7, `rgba(226,222,214,${0.5 - f * 0.1})`);
  },

  'fx.build.frame': (ctx, w, h) => {
    ctx.fillStyle = P.wood2;
    ctx.fillRect(0, 0, 1, h); ctx.fillRect(w - 1, 0, 1, h);
    ctx.fillRect(0, 0, w, 1); ctx.fillRect(0, h - 1, w, 1);
    for (let i = 0; i < w; i += 4) ctx.fillRect(i, h - 1 - i * (h / w), 2, 1);
  },
};

// Element bursts share one shape and differ only by palette — that keeps the type
// language consistent across the whole battle screen.
const BURSTS = {
  'fx.ember': RAMP.ember, 'fx.leaf': RAMP.leaf, 'fx.bubble': RAMP.water,
  'fx.rock': RAMP.rock, 'fx.wind': ['#f2fbff', '#cfeaf5', '#9fd8e8', '#6fb3cc'],
  'fx.spark': [P.spark0, P.spark1, P.spark2, P.gold3],
  'fx.petal': [P.bloom0, P.bloom1, P.bloom2, P.bloom3],
  'fx.dusk': [P.violet0, P.violet1, P.violet2, P.violet3],
};

function burst(ramp) {
  return (ctx, w, h, f) => {
    const n = 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + f * 0.35;
      const d = 2 + f * 3.2;
      const r = Math.max(1, 3 - f * 0.6);
      ellipse(ctx, w / 2 + Math.cos(a) * d, h / 2 + Math.sin(a) * d * 0.85, r, r, ramp[i % ramp.length]);
    }
    if (f < 2) ellipse(ctx, w / 2, h / 2, 4 - f, 4 - f, ramp[0]);
  };
}

export function register() {
  for (const name of FX) {
    const frames = ANIM_FX[name] || 1;
    const size = name === 'fx.shadow' ? [16, 6]
      : name === 'fx.shadow.big' ? [64, 12]
      : name.startsWith('fx.emote') || name === 'fx.exclaim' ? [16, 16]
      : name === 'fx.rain' || name === 'fx.snow' ? [4, 8]
      : [24, 24];
    const painter = FXP[name] || (BURSTS[name] ? burst(BURSTS[name]) : FXP['fx.sparkle']);
    Atlas.defineAnim(name, size[0], size[1], frames, painter);
  }
}
