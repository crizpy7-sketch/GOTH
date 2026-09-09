// Interface chrome: window frames, cursors, bars, icons, and type badges.
//
// The frames are 24x24 nine-slice sources with 8px corners. They should read as a
// crafted wooden window with a paper face — dark keyline, warm bevel, light face,
// 1px top highlight — because every line of dialogue in the game sits on one.

import { Atlas } from './atlas.js';
import { UI } from './names.js';
import { P, TYPE_COLOR, mix, shade } from './palette.js';

const fill = (ctx, x, y, c, w = 1, h = 1) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };

function ellipse(ctx, cx, cy, rx, ry, c) {
  ctx.fillStyle = c;
  for (let y = Math.ceil(cy - ry); y <= cy + ry; y++) {
    const t = (y + 0.5 - cy) / ry;
    if (Math.abs(t) > 1) continue;
    const half = Math.sqrt(1 - t * t) * rx;
    const x0 = Math.round(cx - half), x1 = Math.round(cx + half);
    if (x1 > x0) ctx.fillRect(x0, y, x1 - x0, 1);
  }
}

/** 24x24 nine-slice source: 8px corners, 8px stretchable middles. */
function frame(ctx, w, h, { line, bevel, face, hi, stud }) {
  fill(ctx, 0, 0, face, w, h);
  // face
  fill(ctx, 2, 2, face, w - 4, h - 4);
  // bevel ring
  fill(ctx, 1, 1, bevel, w - 2, 1);
  fill(ctx, 1, h - 2, bevel, w - 2, 1);
  fill(ctx, 1, 1, bevel, 1, h - 2);
  fill(ctx, w - 2, 1, bevel, 1, h - 2);
  // outer keyline
  fill(ctx, 0, 0, line, w, 1);
  fill(ctx, 0, h - 1, line, w, 1);
  fill(ctx, 0, 0, line, 1, h);
  fill(ctx, w - 1, 0, line, 1, h);
  // inner top highlight — this is what makes it look lit rather than flat
  fill(ctx, 2, 2, hi, w - 4, 1);
  fill(ctx, 2, 2, hi, 1, h - 4);
  // corner studs
  if (stud) {
    for (const [x, y] of [[3, 3], [w - 5, 3], [3, h - 5], [w - 5, h - 5]]) {
      fill(ctx, x, y, stud, 2, 2);
      fill(ctx, x, y, shade(stud, 0.3), 1, 1);
    }
  }
}

function bar(ctx, w, h, track, rim) {
  fill(ctx, 0, 0, rim, w, h);
  fill(ctx, 1, 1, track, w - 2, h - 2);
  fill(ctx, 1, 1, shade(track, -0.2), w - 2, 1);
}

function typeBadge(ctx, w, h, color) {
  fill(ctx, 0, 0, shade(color, -0.5), w, h);
  fill(ctx, 1, 1, color, w - 2, h - 2);
  fill(ctx, 1, 1, shade(color, 0.28), w - 2, 1);
  fill(ctx, 1, h - 2, shade(color, -0.25), w - 2, 1);
}

const PAINT = {
  'ui.frame': (ctx, w, h) => frame(ctx, w, h, {
    line: P.ui4, bevel: P.ui2, face: P.paper0, hi: '#fffdf2', stud: P.gold2,
  }),
  'ui.frame.dark': (ctx, w, h) => frame(ctx, w, h, {
    line: '#0b0908', bevel: '#5b4026', face: '#17120f', hi: '#8a6334', stud: '#e2ad49',
  }),
  'ui.frame.gold': (ctx, w, h) => frame(ctx, w, h, {
    line: '#4a3213', bevel: P.gold3, face: P.paper0, hi: '#fffaea', stud: P.gold1,
  }),

  'ui.cursor': (ctx, w, h) => {
    // A small pointing wedge with a shadow, so it reads on light and dark faces.
    ctx.fillStyle = P.ink;
    for (let i = 0; i < 7; i++) ctx.fillRect(1, 1 + i, Math.max(1, 5 - Math.abs(i - 3)), 1);
    ctx.fillStyle = P.gold1;
    for (let i = 0; i < 7; i++) ctx.fillRect(0, i, Math.max(1, 5 - Math.abs(i - 3)), 1);
    fill(ctx, 0, 2, P.gold0, 2, 1);
  },
  'ui.cursor.small': (ctx, w, h) => {
    ctx.fillStyle = P.gold2;
    for (let i = 0; i < 5; i++) ctx.fillRect(0, i, Math.max(1, 3 - Math.abs(i - 2)), 1);
  },
  'ui.tail': (ctx, w, h) => {
    for (let i = 0; i < h; i++) fill(ctx, i, i, P.paper0, w - i * 2, 1);
    fill(ctx, 0, 0, P.ui4, 1, 1);
    for (let i = 0; i < h; i++) { fill(ctx, i, i, P.ui4, 1, 1); fill(ctx, w - 1 - i, i, P.ui4, 1, 1); }
  },

  'ui.hpbar': (ctx, w, h) => bar(ctx, w, h, '#2c2418', P.ui4),
  'ui.xpbar': (ctx, w, h) => bar(ctx, w, h, '#1d2a34', P.ui4),

  'ui.coin': (ctx, w, h) => {
    ellipse(ctx, w / 2, h / 2, w / 2 - 1, h / 2 - 1, P.gold3);
    ellipse(ctx, w / 2, h / 2 - 0.5, w / 2 - 2, h / 2 - 2, P.gold1);
    ellipse(ctx, w / 2 - 1, h / 2 - 1.5, 1.5, 1.5, P.gold0);
  },
  'ui.hearth': (ctx, w, h) => {
    for (let i = 0; i < 3; i++) {
      ellipse(ctx, w / 2, h / 2 + 1 - i * 1.6, (w / 2 - 1) * (1 - i * 0.22), (h / 2) * (1 - i * 0.18),
        [P.ember3, P.ember2, P.ember0][i]);
    }
  },
  'ui.heart': (ctx, w, h) => {
    for (const dx of [-2, 2]) ellipse(ctx, w / 2 + dx, h / 2 - 1, 2.4, 2.2, P.bloom1);
    ctx.fillStyle = P.bloom1;
    for (let i = 0; i < 5; i++) ctx.fillRect(w / 2 - 4 + i, h / 2 + 1 + i * 0.6, 9 - i * 2, 1);
  },
  'ui.star': (ctx, w, h) => {
    ctx.fillStyle = P.spark1;
    for (let i = -4; i <= 4; i++) { ctx.fillRect(w / 2 + i, h / 2, 1, 1); ctx.fillRect(w / 2, h / 2 + i, 1, 1); }
    ellipse(ctx, w / 2, h / 2, 2.4, 2.4, P.spark0);
  },
  'ui.ball': (ctx, w, h) => {
    ellipse(ctx, w / 2, h / 2, w / 2 - 1, h / 2 - 1, P.gold2);
    ellipse(ctx, w / 2, h / 2, w / 2 - 2.5, h / 2 - 2.5, P.gold0);
    fill(ctx, 1, h / 2, P.wood3, w - 2, 1);
  },
  'ui.ball.empty': (ctx, w, h) => {
    ellipse(ctx, w / 2, h / 2, w / 2 - 1, h / 2 - 1, P.ui2);
    ellipse(ctx, w / 2, h / 2, w / 2 - 2.5, h / 2 - 2.5, P.ui1);
  },
  'ui.arrow.up': (ctx, w, h) => {
    ctx.fillStyle = P.gold2;
    for (let i = 0; i < 4; i++) ctx.fillRect(w / 2 - i, h / 2 + i - 1, i * 2 + 1, 1);
  },
  'ui.arrow.down': (ctx, w, h) => {
    ctx.fillStyle = P.gold2;
    for (let i = 0; i < 4; i++) ctx.fillRect(w / 2 - 3 + i, h / 2 - 2 + i, 7 - i * 2, 1);
  },
  'ui.badge.new': (ctx, w, h) => { fill(ctx, 0, 0, P.ember2, w, h); fill(ctx, 1, 1, P.ember1, w - 2, h - 2); },
  'ui.badge.lock': (ctx, w, h) => {
    fill(ctx, 2, h / 2 - 1, P.rock2, w - 4, h / 2); fill(ctx, 3, h / 2, P.rock1, w - 6, h / 2 - 2);
    ctx.fillStyle = P.rock2;
    for (let i = 0; i < 4; i++) ctx.fillRect(w / 2 - 2 + (i % 2) * 3, h / 2 - 4 + Math.floor(i / 2), 1, 2);
  },
  'ui.badge.check': (ctx, w, h) => {
    ctx.fillStyle = '#7ed957';
    for (let i = 0; i < 3; i++) ctx.fillRect(2 + i, h / 2 + i, 2, 2);
    for (let i = 0; i < 5; i++) ctx.fillRect(5 + i, h / 2 + 2 - i, 2, 2);
  },
  'ui.minimap.frame': (ctx, w, h) => frame(ctx, w, h, {
    line: '#0d1017', bevel: P.gold3, face: 'rgba(20,26,38,0.7)', hi: P.gold2, stud: null,
  }),
};

export function register() {
  for (const name of UI) {
    if (name.startsWith('ui.type.')) {
      const t = name.slice('ui.type.'.length);
      Atlas.define(name, 22, 9, (ctx, w, h) => typeBadge(ctx, w, h, TYPE_COLOR[t] || P.ui2));
      continue;
    }
    const size = name.startsWith('ui.frame') ? [24, 24]
      : name === 'ui.cursor' ? [6, 8]
      : name === 'ui.cursor.small' ? [4, 6]
      : name === 'ui.tail' ? [8, 6]
      : name === 'ui.hpbar' || name === 'ui.xpbar' ? [48, 6]
      : name === 'ui.minimap.frame' ? [24, 24]
      : name.startsWith('ui.badge') ? [10, 10]
      : name.startsWith('ui.arrow') ? [8, 6]
      : [10, 10];
    Atlas.define(name, size[0], size[1], PAINT[name] || ((ctx, w, h) => fill(ctx, 0, 0, P.ui2, w, h)));
  }
}
