// Nine-slice window frames and the shared chrome vocabulary for every UI screen.
//
// Two rules drive this file:
//  1. Chrome must look intentional even with zero atlas art. Every `ui.*` sprite is
//     optional (Atlas.tryGet) and has a hand-drawn procedural fallback, so text feel
//     and menu feel are judgeable before ART lands.
//  2. Readability is not a judgement call. A style owns its ink + shadow colours and
//     `Frame.write` uses them, so light-on-light text can't creep in. When atlas art
//     IS present we sample the frame's centre pixel and flip ink to match, which means
//     a dark `ui.frame` from ART still gets light text.

import { R } from '../core/renderer.js';
import { Atlas } from '../art/atlas.js';
import { P, TYPE_COLOR, mix, Px } from '../art/palette.js';
import { Scenes } from '../core/scene.js';
import { Input } from '../core/input.js';
import { clamp } from '../core/util.js';
import { UIx } from '../core/bridge.js';

const CORNER = 8;                       // nine-slice corner size (ui.frame is 24x24)

// ---- style table -----------------------------------------------------------------
// ink/sub/shadow are the text tokens; everything else is procedural chrome.
const STYLES = {
  paper: {
    atlas: 'ui.frame',
    border: '#3e2b1f', mid: '#b77942', fill: '#fff4d8', hi: '#fffef3', lo: '#d8b77a',
    ink: P.ink2, sub: P.ink3, shadow: false, accent: P.gold3, sel: P.gold0, selEdge: P.gold2,
  },
  dark: {
    atlas: 'ui.frame.dark',
    border: '#0f0a07', mid: P.ink3, fill: P.ui4, hi: '#4a3826', lo: '#150e09',
    ink: P.ui0, sub: P.ui1, shadow: P.black, accent: P.gold1, sel: P.ink3, selEdge: P.gold2,
  },
  gold: {
    atlas: 'ui.frame.gold',
    border: P.ink, mid: P.gold3, fill: P.gold1, hi: P.gold0, lo: P.gold2,
    ink: P.ink, sub: P.ink2, shadow: false, accent: P.ink, sel: P.gold0, selEdge: P.ink2,
  },
  // Translucent plaque for the overworld HUD — never covers the world, always readable.
  hud: {
    atlas: null,
    border: '#0d0a12', mid: '#241c2c', fill: '#191320', hi: '#3a2f46', lo: '#100b16',
    ink: P.ui0, sub: P.ui1, shadow: P.black, accent: P.gold1, sel: P.ink3, selEdge: P.gold2,
    alpha: 0.74,
  },
};

const inkCache = new Map();

// Centre-pixel luminance of an atlas frame decides its text colours. This is the
// guard against light-on-light: whatever ART ships, the ink follows the fill.
function sampledInk(name) {
  if (inkCache.has(name)) return inkCache.get(name);
  let out = null;
  try {
    const img = Atlas.tryGet(name);
    if (img && img.width >= 3 && img.height >= 3) {
      const d = img.getContext('2d')
        .getImageData(img.width >> 1, img.height >> 1, 1, 1).data;
      if (d[3] > 40) {
        const lum = (0.299 * d[0] + 0.587 * d[1] + 0.114 * d[2]) / 255;
        out = lum > 0.55
          ? { ink: P.ink2, sub: P.ink3, shadow: false }
          : { ink: P.ui0, sub: P.ui1, shadow: P.ink };
      }
    }
  } catch { /* tainted or missing: keep the declared tokens */ }
  inkCache.set(name, out);
  return out;
}

// 1px-cut corners: three rects instead of one give a soft "rounded" pixel edge.
function rrect(x, y, w, h, color) {
  if (w <= 0 || h <= 0) return;
  R.rect(x, y + 1, w, h - 2, color);
  R.rect(x + 1, y, w - 2, 1, color);
  R.rect(x + 1, y + h - 1, w - 2, 1, color);
}

function procPanel(x, y, w, h, s) {
  rrect(x, y, w, h, s.border);
  rrect(x + 1, y + 1, w - 2, h - 2, s.mid);
  rrect(x + 2, y + 2, w - 4, h - 4, s.fill);
  // inner bevel: light top, shaded bottom-right — reads as a raised card
  R.rect(x + 3, y + 2, w - 6, 1, s.hi);
  R.rect(x + 2, y + 3, 1, h - 6, s.hi);
  R.rect(x + 3, y + h - 3, w - 6, 1, s.lo);
  R.rect(x + w - 3, y + 3, 1, h - 6, s.lo);
}

function nineSlice(img, x, y, w, h, c = CORNER) {
  const ctx = R.ctx, sw = img.width, sh = img.height;
  const mw = sw - c * 2, mh = sh - c * 2;
  if (mw <= 0 || mh <= 0 || w < c * 2 || h < c * 2) return false;
  const iw = w - c * 2, ih = h - c * 2;
  ctx.drawImage(img, 0, 0, c, c, x, y, c, c);
  ctx.drawImage(img, sw - c, 0, c, c, x + w - c, y, c, c);
  ctx.drawImage(img, 0, sh - c, c, c, x, y + h - c, c, c);
  ctx.drawImage(img, sw - c, sh - c, c, c, x + w - c, y + h - c, c, c);
  for (let dx = 0; dx < iw; dx += mw) {
    const tw = Math.min(mw, iw - dx);
    ctx.drawImage(img, c, 0, tw, c, x + c + dx, y, tw, c);
    ctx.drawImage(img, c, sh - c, tw, c, x + c + dx, y + h - c, tw, c);
  }
  for (let dy = 0; dy < ih; dy += mh) {
    const th = Math.min(mh, ih - dy);
    ctx.drawImage(img, 0, c, c, th, x, y + c + dy, c, th);
    ctx.drawImage(img, sw - c, c, c, th, x + w - c, y + c + dy, c, th);
    for (let dx = 0; dx < iw; dx += mw) {
      const tw = Math.min(mw, iw - dx);
      ctx.drawImage(img, c, c, tw, th, x + c + dx, y + c + dy, tw, th);
    }
  }
  return true;
}

let backdropCache = null;

export const Frame = {
  CORNER,

  /** Resolved style tokens: {ink, sub, shadow, accent, sel, ...}. */
  style(name = 'paper') {
    const s = STYLES[name] || STYLES.paper;
    const sampled = s.atlas ? sampledInk(s.atlas) : null;
    return sampled ? { ...s, ...sampled } : s;
  },

  /**
   * Nine-slice window. `style` is 'paper'|'dark'|'gold'|'hud' or
   * {style, alpha, shadow:false}. Returns the resolved style tokens.
   */
  panel(x, y, w, h, style) {
    const o = (style && typeof style === 'object') ? style : { style };
    const s = this.style(o.style);
    const ctx = R.ctx, prev = ctx.globalAlpha;
    const alpha = (o.alpha === undefined ? (s.alpha === undefined ? 1 : s.alpha) : o.alpha);
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    if (o.shadow !== false) {
      ctx.globalAlpha = prev * 0.2;
      rrect(x + 2, y + 3, w, h, '#05040a');
      ctx.globalAlpha = prev;
    }
    ctx.globalAlpha = prev * alpha;
    const img = s.atlas ? Atlas.tryGet(s.atlas) : null;
    if (!(img && nineSlice(img, x, y, w, h))) procPanel(x, y, w, h, s);
    ctx.globalAlpha = prev;
    return s;
  },

  /** Speech bubble: a paper panel with a tail. tailX is absolute screen x. */
  bubble(x, y, w, h, tailX) {
    const s = this.panel(x, y, w, h, 'paper');
    if (tailX === undefined) return s;
    const tx = Math.round(clamp(tailX, x + 6, x + w - 12));
    const img = Atlas.tryGet('ui.tail');
    if (img) { R.blit(img, tx - (img.width >> 1), y + h - 1); return s; }
    // procedural tail: 6 rows narrowing, in the panel's own colours
    for (let i = 0; i < 6; i++) {
      const half = 4 - Math.floor(i * 0.7);
      if (half <= 0) break;
      R.rect(tx - half, y + h - 2 + i, half * 2, 1, i > 3 ? s.mid : s.fill);
      R.rect(tx - half - 1, y + h - 2 + i, 1, 1, s.border);
      R.rect(tx + half, y + h - 2 + i, 1, 1, s.border);
    }
    return s;
  },

  /** Small nameplate tab (speaker names, screen titles). Returns its width. */
  tab(x, y, label, style = 'gold', opts = {}) {
    const w = opts.w || R.measure(label) + 14;
    const h = opts.h || 14;
    const s = this.panel(x, y, w, h, { style, shadow: opts.shadow });
    R.text(label, x + 7, y + Math.round((h - 7) / 2), { color: opts.color || s.ink, shadow: s.shadow });
    return w;
  },

  /** Title row inside a panel: label plus a hairline divider. */
  title(x, y, w, label, style = 'paper', right) {
    const s = this.style(style);
    R.text(label, x, y, { color: s.accent, shadow: s.shadow });
    if (right) R.text(right, x + w, y, { color: s.sub, shadow: s.shadow, align: 'right' });
    R.rect(x, y + 10, w, 1, s.mid);
    return s;
  },

  /** Text in a style's own ink. Use this instead of R.text on panels. */
  write(str, x, y, style = 'paper', o = {}) {
    const s = typeof style === 'object' ? style : this.style(style);
    const opt = {
      color: o.color || s.ink,
      shadow: o.shadow !== undefined ? o.shadow : s.shadow,
    };
    if (o.align) opt.align = o.align;
    if (o.limit !== undefined) opt.limit = o.limit;
    if (o.alpha !== undefined) opt.alpha = o.alpha;
    return R.text(str, x, y, opt);
  },

  /**
   * Value bar with pixel end-caps. colorSet: 'hp'|'xp'|'bond' or a colour string.
   * opts: {h, bg, ease (0..1 drawn fraction override)}
   */
  bar(x, y, w, value, max, colorSet = 'hp', opts = {}) {
    const h = opts.h || 6;
    const t = clamp(max > 0 ? value / max : 0, 0, 1);
    let c = colorSet;
    if (colorSet === 'hp') c = t > 0.5 ? P.hpGood : t > 0.21 ? P.hpWarn : P.hpBad;
    else if (colorSet === 'xp') c = P.xp;
    else if (colorSet === 'bond') c = P.bloom1;
    x = Math.round(x); y = Math.round(y); w = Math.round(w);
    rrect(x, y, w, h, P.ink);
    R.rect(x + 1, y + 1, w - 2, h - 2, opts.bg || '#5a4a3a');
    const fw = Math.round((w - 2) * t);
    if (fw > 0) {
      R.rect(x + 1, y + 1, fw, h - 2, c);
      R.rect(x + 1, y + 1, fw, 1, mix(c, '#ffffff', 0.45));
      R.rect(x + 1, y + h - 2, fw, 1, mix(c, '#000000', 0.28));
    }
    return t;
  },

  /** Menu cursor. Bobs 1px on a 16-frame cycle so it always looks alive. */
  cursor(x, y, t = 0, color = P.gold2) {
    const bob = (Math.floor(t / 16) % 2) ? 1 : 0;
    const img = Atlas.tryGet('ui.cursor');
    if (img) { R.blit(img, x + bob, y); return; }
    R.text('▶', x + bob, y, { color, shadow: P.ink });
  },

  /** Scroll affordances for a list. */
  arrows(cx, top, bottom, up, down, t = 0) {
    const blink = (Math.floor(t / 20) % 2) === 0;
    if (up) R.text('▲', cx, top + (blink ? 0 : 1), { color: P.gold2, shadow: P.ink, align: 'center' });
    if (down) R.text('▼', cx, bottom - (blink ? 0 : 1), { color: P.gold2, shadow: P.ink, align: 'center' });
  },

  /** Full-screen dim, for menus that float over the world. */
  dim(alpha = 0.45, color = '#0b0e14') {
    const ctx = R.ctx, prev = ctx.globalAlpha;
    ctx.globalAlpha = prev * alpha;
    R.rect(0, 0, R.W, R.H, color);
    ctx.globalAlpha = prev;
  },

  /** Warm storybook backdrop for full-screen UI screens. Cached canvas, one blit. */
  backdrop() {
    if (!backdropCache) {
      const c = document.createElement('canvas');
      c.width = R.W; c.height = R.H;
      const x = c.getContext('2d');
      for (let y = 0; y < R.H; y++) {
        x.fillStyle = mix('#3b2c22', '#221a16', y / R.H);
        x.fillRect(0, y, R.W, 1);
      }
      x.fillStyle = 'rgba(255,232,180,0.045)';
      for (let y = 0; y < R.H; y += 4) for (let i = (y / 4) % 2 ? 0 : 2; i < R.W; i += 4) x.fillRect(i, y, 1, 1);
      x.fillStyle = 'rgba(255,180,90,0.05)';
      for (let i = 0; i < 26; i++) {
        const r = 10 + (i * 7) % 26;
        x.beginPath(); x.arc((i * 53) % R.W, (i * 37) % R.H, r, 0, Math.PI * 2); x.fill();
      }
      backdropCache = c;
    }
    R.blit(backdropCache, 0, 0);
  },

  /** Type badge. Uses ui.type.* when ART has it, else a legible pill. */
  typePill(x, y, type, opts = {}) {
    const img = Atlas.tryGet('ui.type.' + type);
    if (img && !opts.noAtlas) { R.blit(img, x, y); return img.width; }
    const label = (type || '?').toUpperCase();
    const w = opts.w || R.measure(label) + 8;
    const c = TYPE_COLOR[type] || P.rock3;
    rrect(x, y, w, 11, P.ink);
    rrect(x + 1, y + 1, w - 2, 9, c);
    R.rect(x + 2, y + 1, w - 4, 1, mix(c, '#ffffff', 0.4));
    const lum = lumOf(c);
    R.text(label, x + 4, y + 2, { color: lum > 0.55 ? P.ink : P.ui0, shadow: false });
    return w;
  },

  /** 8x8 icons. Atlas first, hand-drawn fallback second. */
  icon(name, x, y, opts = {}) {
    const img = Atlas.tryGet(name, opts.frame || 0);
    if (img) { R.blit(img, x, y, opts.alpha !== undefined ? { alpha: opts.alpha } : undefined); return img.width; }
    const f = ICONS[name];
    if (!f) return 0;
    const ctx = R.ctx, prev = ctx.globalAlpha;
    if (opts.alpha !== undefined) ctx.globalAlpha = prev * opts.alpha;
    f(Math.round(x), Math.round(y), opts);
    ctx.globalAlpha = prev;
    return 8;
  },

  /** Inset well (portraits, sprite cells, minimap interiors). */
  well(x, y, w, h, style = 'paper') {
    const s = this.style(style);
    rrect(x, y, w, h, s.border);
    rrect(x + 1, y + 1, w - 2, h - 2, style === 'paper' ? P.paper2 : s.lo);
    R.rect(x + 2, y + 1, w - 4, 1, style === 'paper' ? P.paper3 : '#000');
    return s;
  },

  rrect,
  lum: lumOf,
};

function lumOf(c) {
  const s = String(c).replace('#', '');
  const n = s.length === 3 ? s.split('').map(x => x + x).join('') : s;
  const r = parseInt(n.slice(0, 2), 16), g = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

// ---- procedural icon fallbacks (8x8) ---------------------------------------------
const ICONS = {
  'ui.coin'(x, y) {
    R.rect(x + 2, y, 4, 1, P.gold3); R.rect(x + 2, y + 7, 4, 1, P.gold3);
    R.rect(x, y + 2, 1, 4, P.gold3); R.rect(x + 7, y + 2, 1, 4, P.gold3);
    R.rect(x + 1, y + 1, 1, 1, P.gold3); R.rect(x + 6, y + 1, 1, 1, P.gold3);
    R.rect(x + 1, y + 6, 1, 1, P.gold3); R.rect(x + 6, y + 6, 1, 1, P.gold3);
    R.rect(x + 2, y + 1, 4, 6, P.gold1); R.rect(x + 1, y + 2, 6, 4, P.gold1);
    R.rect(x + 2, y + 2, 2, 1, P.gold0); R.rect(x + 2, y + 3, 1, 1, P.gold0);
    R.rect(x + 3, y + 3, 2, 2, P.gold2);
  },
  'ui.hearth'(x, y) {
    R.rect(x + 3, y, 2, 1, P.ember0);
    R.rect(x + 2, y + 1, 4, 2, P.ember1);
    R.rect(x + 1, y + 3, 6, 3, P.ember2);
    R.rect(x + 3, y + 2, 2, 3, P.ember0);
    R.rect(x + 2, y + 6, 4, 1, P.ember3);
    R.rect(x + 1, y + 7, 6, 1, P.ink);
  },
  'ui.heart'(x, y, o) {
    const c = o?.color || P.bloom1;
    R.rect(x + 1, y + 2, 2, 1, c); R.rect(x + 5, y + 2, 2, 1, c);
    R.rect(x + 1, y + 3, 6, 2, c); R.rect(x + 2, y + 5, 4, 1, c); R.rect(x + 3, y + 6, 2, 1, c);
    R.rect(x + 2, y + 3, 1, 1, mix(c, '#fff', 0.5));
  },
  'ui.star'(x, y, o) { R.text('★', x, y - 1, { color: o?.color || P.spark1, shadow: P.ink }); },
  'ui.ball'(x, y, o) {
    const c = o?.color || P.ember2;
    R.rect(x + 2, y, 4, 1, P.ink); R.rect(x + 2, y + 7, 4, 1, P.ink);
    R.rect(x, y + 2, 1, 4, P.ink); R.rect(x + 7, y + 2, 1, 4, P.ink);
    R.rect(x + 1, y + 1, 1, 1, P.ink); R.rect(x + 6, y + 1, 1, 1, P.ink);
    R.rect(x + 1, y + 6, 1, 1, P.ink); R.rect(x + 6, y + 6, 1, 1, P.ink);
    R.rect(x + 2, y + 1, 4, 3, c); R.rect(x + 1, y + 2, 6, 2, c);
    R.rect(x + 1, y + 4, 6, 2, P.paper0); R.rect(x + 2, y + 4, 4, 3, P.paper0);
    R.rect(x + 1, y + 3, 6, 1, P.ink);
    R.rect(x + 3, y + 3, 2, 2, P.gold0); R.stroke(x + 3, y + 3, 2, 2, P.ink);
  },
  'ui.ball.empty'(x, y) {
    R.rect(x + 2, y, 4, 1, P.ink3); R.rect(x + 2, y + 7, 4, 1, P.ink3);
    R.rect(x, y + 2, 1, 4, P.ink3); R.rect(x + 7, y + 2, 1, 4, P.ink3);
    R.rect(x + 1, y + 1, 1, 1, P.ink3); R.rect(x + 6, y + 1, 1, 1, P.ink3);
    R.rect(x + 1, y + 6, 1, 1, P.ink3); R.rect(x + 6, y + 6, 1, 1, P.ink3);
  },
  'ui.badge.check'(x, y) {
    R.rect(x + 1, y + 4, 2, 2, P.hpGood); R.rect(x + 2, y + 5, 2, 2, P.hpGood);
    R.rect(x + 3, y + 4, 2, 2, P.hpGood); R.rect(x + 4, y + 2, 2, 2, P.hpGood);
    R.rect(x + 5, y + 1, 2, 2, P.hpGood);
  },
  'ui.badge.lock'(x, y) {
    R.rect(x + 2, y + 1, 4, 2, P.rock1); R.rect(x + 3, y + 2, 2, 1, P.ink);
    R.rect(x + 1, y + 3, 6, 5, P.gold2); R.stroke(x + 1, y + 3, 6, 5, P.ink);
    R.rect(x + 3, y + 5, 2, 2, P.ink);
  },
  'ui.badge.new'(x, y) {
    R.rect(x, y + 1, 8, 6, P.roof1); R.stroke(x, y + 1, 8, 6, P.ink);
    R.rect(x + 1, y + 2, 1, 4, P.paper0); R.rect(x + 2, y + 3, 1, 1, P.paper0);
    R.rect(x + 3, y + 2, 1, 4, P.paper0);
    R.rect(x + 5, y + 2, 3, 1, P.paper0); R.rect(x + 5, y + 4, 2, 1, P.paper0); R.rect(x + 5, y + 6, 3, 1, P.paper0);
  },
  'ui.arrow.up'(x, y) { R.text('▲', x, y - 1, { color: P.gold2, shadow: P.ink }); },
  'ui.arrow.down'(x, y) { R.text('▼', x, y - 1, { color: P.gold2, shadow: P.ink }); },
};

// ---- season / sky icons used by the HUD and the title ----------------------------
export function seasonIcon(x, y, season) {
  x = Math.round(x); y = Math.round(y);
  if (season === 'summer') {
    R.rect(x + 2, y + 2, 4, 4, P.spark1); R.rect(x + 3, y + 1, 2, 6, P.spark1); R.rect(x + 1, y + 3, 6, 2, P.spark1);
    R.rect(x + 3, y + 3, 2, 2, P.gold0);
    R.rect(x, y, 1, 1, P.spark2); R.rect(x + 7, y, 1, 1, P.spark2); R.rect(x, y + 7, 1, 1, P.spark2); R.rect(x + 7, y + 7, 1, 1, P.spark2);
  } else if (season === 'autumn') {
    R.rect(x + 3, y + 1, 3, 1, P.ember1); R.rect(x + 2, y + 2, 5, 2, P.ember2);
    R.rect(x + 1, y + 4, 5, 2, P.ember1); R.rect(x + 1, y + 6, 3, 1, P.ember3);
    R.rect(x + 4, y + 3, 1, 3, P.soil2);
  } else if (season === 'winter') {
    R.rect(x + 3, y, 2, 8, P.water0); R.rect(x, y + 3, 8, 2, P.water0);
    R.rect(x + 1, y + 1, 1, 1, P.water1); R.rect(x + 6, y + 1, 1, 1, P.water1);
    R.rect(x + 1, y + 6, 1, 1, P.water1); R.rect(x + 6, y + 6, 1, 1, P.water1);
  } else {
    R.rect(x + 3, y + 1, 2, 2, P.bloom0); R.rect(x + 1, y + 3, 2, 2, P.bloom1);
    R.rect(x + 5, y + 3, 2, 2, P.bloom1); R.rect(x + 3, y + 5, 2, 2, P.bloom0);
    R.rect(x + 3, y + 3, 2, 2, P.spark1);
  }
}

export function skyIcon(x, y, hour) {
  x = Math.round(x); y = Math.round(y);
  const day = hour >= 6 && hour < 19;
  if (day) {
    R.rect(x + 2, y + 2, 4, 4, P.gold0); R.rect(x + 3, y + 1, 2, 6, P.gold0); R.rect(x + 1, y + 3, 6, 2, P.gold0);
    R.rect(x + 3, y + 3, 2, 2, '#fffbe8');
  } else {
    R.rect(x + 2, y + 1, 4, 6, P.paper1); R.rect(x + 1, y + 2, 6, 4, P.paper1);
    R.rect(x + 4, y, 4, 8, '#00000000');
    R.rect(x + 4, y + 1, 4, 6, P.shade); R.rect(x + 5, y, 3, 8, P.shade);
    R.rect(x + 2, y + 2, 1, 1, '#ffffff');
  }
}

// ---- the chrome showcase scene (dev/capture only) --------------------------------
// Registered as `__panels`: proves the readability rule on every style we support.
function panelsScene() {
  let t = 0;
  return {
    update() { t++; if (Input.pressed('b') && Scenes.stack.length > 1) Scenes.pop(); },
    render() {
      R.layer(5, () => {
        Frame.backdrop();
        const body = 'Text on this panel style, at size.';
        let x = 6;
        for (const st of ['paper', 'dark', 'gold']) {
          const s = Frame.panel(x, 6, 100, 84, st);
          Frame.title(x + 6, 12, 88, st.toUpperCase(), st, 'Aa');
          Frame.write(body, x + 6, 26, s);
          Frame.write('Lv 12  24/31 HP', x + 6, 38, s);
          Frame.bar(x + 6, 50, 60, 24, 31, 'hp');
          Frame.bar(x + 6, 58, 60, 8, 20, 'xp');
          Frame.typePill(x + 6, 68, 'ember');
          Frame.icon('ui.coin', x + 46, 69); Frame.icon('ui.hearth', x + 58, 69);
          Frame.icon('ui.ball', x + 70, 69); Frame.icon('ui.badge.check', x + 82, 69);
          x += 104;
        }
        const s = Frame.panel(6, 96, 150, 34, 'hud');
        Frame.write('hud plaque - translucent', 12, 102, s);
        Frame.write('over the world, still legible', 12, 114, s, { color: s.sub });
        Frame.bubble(164, 96, 148, 40, 210);
        Frame.write('A bubble with a tail, for signs', 170, 104, 'paper');
        Frame.write('and little asides.', 170, 116, 'paper');
        Frame.tab(6, 138, 'Speaker tab', 'gold');
        Frame.tab(96, 138, 'paper tab', 'paper');
        Frame.tab(186, 138, 'dark tab', 'dark');
        Frame.write('B backs out - t' + t, 6, 160, 'dark', { color: P.ui1 });
      });
    },
  };
}

export function register() {
  globalThis.__R = R;                    // keeps bridge's own fallback panel working
  // Make the real nine-slice renderer available to modules that intentionally use
  // the late-bound UI facade (battle, missions, build and party screens).
  UIx.install({ panel: (x, y, w, h, style) => Frame.panel(x, y, w, h, style) }, { real: false });
  Scenes.register('__panels', panelsScene);
}

export default Frame;
