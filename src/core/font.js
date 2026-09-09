// Pixel font engine. Glyph data lives in art/glyphs.js; this file turns it into
// tinted sheets and draws crisp, shadowed, wrapped text.
//
// Text quality is load-bearing for the whole game's feel, so: 1px offset shadow by
// default (reads on any background), integer positions only, per-colour sheet cache.

import { GLYPHS, FONT } from '../art/glyphs.js';

const SHEET_COLS = 24;
let sheet = null;                 // white master sheet
const rects = new Map();          // char -> {x,y,w,h}
const tinted = new Map();         // color -> canvas
let built = false;

function cv(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  return c;
}

export function buildFont() {
  if (built) return;
  const chars = Object.keys(GLYPHS);
  const cellW = 10, cellH = FONT.box;
  const rows = Math.ceil(chars.length / SHEET_COLS);
  sheet = cv(SHEET_COLS * cellW, rows * cellH);
  const ctx = sheet.getContext('2d');
  ctx.fillStyle = '#fff';

  chars.forEach((ch, i) => {
    const gx = (i % SHEET_COLS) * cellW, gy = Math.floor(i / SHEET_COLS) * cellH;
    const g = GLYPHS[ch];
    for (let r = 0; r < g.rows.length; r++) {
      const row = g.rows[r], py = gy + g.top + r;
      for (let c = 0; c < row.length; c++) {
        if (row[c] === '#') ctx.fillRect(gx + c, py, 1, 1);
      }
    }
    rects.set(ch, { x: gx, y: gy, w: g.w, h: cellH });
  });
  built = true;
}

function sheetFor(color) {
  if (color === '#fff' || color === '#ffffff') return sheet;
  let c = tinted.get(color);
  if (c) return c;
  c = cv(sheet.width, sheet.height);
  const x = c.getContext('2d');
  x.drawImage(sheet, 0, 0);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = color;
  x.fillRect(0, 0, c.width, c.height);
  tinted.set(color, c);
  return c;
}

const advance = ch => {
  if (ch === ' ') return FONT.space + FONT.gap;
  const r = rects.get(ch);
  return r ? r.w + FONT.gap : FONT.space + FONT.gap;
};

export const Font = {
  get lineHeight() { return FONT.lineHeight; },
  get box() { return FONT.box; },

  measure(str) {
    let w = 0;
    for (const ch of String(str)) w += advance(ch);
    return Math.max(0, w - FONT.gap);
  },

  // Greedy word wrap. Respects explicit \n. Never breaks mid-word unless a single
  // word is longer than the line, which would otherwise overflow the text box.
  wrap(str, maxW) {
    const out = [];
    for (const para of String(str).split('\n')) {
      let line = '';
      for (const word of para.split(' ')) {
        const test = line ? line + ' ' + word : word;
        if (this.measure(test) <= maxW || !line) {
          if (this.measure(test) > maxW && !line) {
            // hard-break an over-long single word
            let chunk = '';
            for (const ch of word) {
              if (this.measure(chunk + ch) > maxW) { out.push(chunk); chunk = ch; }
              else chunk += ch;
            }
            line = chunk;
          } else line = test;
        } else { out.push(line); line = word; }
      }
      out.push(line);
    }
    return out;
  },

  // Draws `str` at (x,y) where y is the TOP of the glyph box.
  // opts: {color, shadow (color|false), align:'left'|'center'|'right', alpha, limit}
  // `limit` renders only the first N visible characters (typewriter effect).
  draw(ctx, str, x, y, opts = {}) {
    if (!built) buildFont();
    const s = String(str);
    const color = opts.color || '#f4ecd8';
    const shadow = opts.shadow === undefined ? '#2b2118' : opts.shadow;
    const limit = opts.limit === undefined ? Infinity : opts.limit;
    let px = Math.round(x), py = Math.round(y);

    if (opts.align === 'center') px -= Math.round(this.measure(s) / 2);
    else if (opts.align === 'right') px -= this.measure(s);

    const prevAlpha = ctx.globalAlpha;
    if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;

    if (shadow) this._run(ctx, s, px, py + 1, shadow, limit);
    this._run(ctx, s, px, py, color, limit);

    ctx.globalAlpha = prevAlpha;
    return this.measure(s);
  },

  _run(ctx, s, x, y, color, limit) {
    const sh = sheetFor(color);
    let px = x, n = 0;
    for (const ch of s) {
      if (n >= limit) break;
      if (ch !== ' ') {
        const r = rects.get(ch);
        if (r) ctx.drawImage(sh, r.x, r.y, r.w, r.h, px, y, r.w, r.h);
        n++;
      } else n++;
      px += advance(ch);
    }
  },

  // Number of visible characters, used to drive typewriter timing.
  len(str) { return String(str).length; },
};
