// ---------------------------------------------------------------------------
// Guardians of the Hearth — terrain, decor and autotile painters.
//
// Three rules govern every pixel in this file:
//   1. LIGHT COMES FROM THE TOP-LEFT. Highlights top/left, shade bottom/right.
//   2. WALKABLE IS LIGHT AND QUIET. Ground tiles stay inside a narrow value band
//      so a big field never strobes. Anything solid is darker and outlined.
//   3. OUTLINES ARE A DARK SHADE OF THE OBJECT'S OWN COLOUR — never black.
//
// This module also exports the small painting kit (`px`, `hash`, `shadedBlob`,
// `autoOutline`, …) that sprites.js / creatures.js / effects.js / uiart.js use, so
// the whole atlas shares one drawing language.
// ---------------------------------------------------------------------------

import { Atlas, makeCanvas } from './atlas.js';
import { P, RAMP, Px, mix, shade } from './palette.js';
import { AUTOTILE, ANIM_TILES, TILES } from './names.js';

// ===========================================================================
// painting kit
// ===========================================================================

export const px = (ctx, x, y, c, w = 1, h = 1) => {
  ctx.fillStyle = c; ctx.fillRect(x | 0, y | 0, w | 0, h | 0);
};

/** deterministic 0..1 noise — same pixels every boot, so art is diffable */
export function hash(x, y, s = 0) {
  let n = ((x | 0) * 374761393 + (y | 0) * 668265263 + (s | 0) * 2246822519) | 0;
  n = (n ^ (n >>> 13)) * 1274126177 | 0;
  n = n ^ (n >>> 16);
  return ((n >>> 0) % 65536) / 65536;
}

export const clampi = (i, n) => i < 0 ? 0 : i > n ? n : i;
export const tone = (ramp, i) => ramp[clampi(Math.round(i), ramp.length - 1)];

export function strokeRect(ctx, x, y, w, h, c) {
  px(ctx, x, y, c, w, 1); px(ctx, x, y + h - 1, c, w, 1);
  px(ctx, x, y, c, 1, h); px(ctx, x + w - 1, y, c, 1, h);
}

/** outlined block with top-left light — the workhorse for props and furniture */
export function panelBox(ctx, x, y, w, h, ramp, o = {}) {
  const out = o.outline || ramp[ramp.length - 1];
  strokeRect(ctx, x, y, w, h, out);
  px(ctx, x + 1, y + 1, ramp[1], w - 2, h - 2);
  px(ctx, x + 1, y + 1, ramp[0], w - 2, 1);
  px(ctx, x + 1, y + 1, ramp[0], 1, h - 2);
  px(ctx, x + w - 2, y + 1, ramp[2] || ramp[1], 1, h - 2);
  px(ctx, x + 1, y + h - 2, ramp[2] || ramp[1], w - 2, 1);
}

/** pixel ellipse; fn(x,y,dx,dy,d) -> colour|null */
export function ellipse(ctx, cx, cy, rx, ry, fn) {
  const x0 = Math.floor(cx - rx), x1 = Math.ceil(cx + rx);
  const y0 = Math.floor(cy - ry), y1 = Math.ceil(cy + ry);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      const d2 = dx * dx + dy * dy;
      if (d2 > 1) continue;
      const c = typeof fn === 'string' ? fn : fn(x, y, dx, dy, Math.sqrt(d2));
      if (c) px(ctx, x, y, c);
    }
  }
}

/** a round volume shaded in discrete bands, lit from the top-left */
export function shadedBlob(ctx, cx, cy, rx, ry, ramp, o = {}) {
  const lx = o.lx ?? -0.60, ly = o.ly ?? -0.80;
  const bias = o.bias ?? 0, edge = o.edge ?? 0.34, lit = o.lit ?? 0.62;
  ellipse(ctx, cx, cy, rx, ry, (x, y, dx, dy, d) => {
    const l = dx * lx + dy * ly;
    let t = 0.5 - l * lit + d * edge + bias;
    let i = t * (ramp.length - 1);
    if (d > 0.90 && !o.noRim) i += 0.7;
    return tone(ramp, i);
  });
}

/** vertical capsule / limb */
export function capsule(ctx, x, y, w, h, ramp) {
  for (let j = 0; j < h; j++) {
    const inset = (j === 0 || j === h - 1) && w > 2 ? 1 : 0;
    px(ctx, x + inset, y + j, ramp[1], w - inset * 2, 1);
    px(ctx, x + inset, y + j, ramp[0], 1, 1);
    px(ctx, x + w - 1 - inset, y + j, ramp[2] || ramp[1], 1, 1);
  }
}

/**
 * Wrap the opaque silhouette in a 1px outline made from a darker shade of the
 * pixels it touches. Costs one getImageData per sprite at boot; makes everything
 * pop against any background, which is most of what "readable" means.
 */
export function autoOutline(ctx, w, h, amt = 0.44, warm = 0.22) {
  const img = ctx.getImageData(0, 0, w, h);
  const s = img.data;
  const out = new Uint8ClampedArray(s);
  const N = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (s[i + 3] > 8) continue;
      let r = 0, g = 0, b = 0, n = 0;
      for (let k = 0; k < 8; k++) {
        const nx = x + N[k][0], ny = y + N[k][1];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = (ny * w + nx) * 4;
        if (s[j + 3] < 128) continue;
        const wgt = k < 4 ? 2 : 1;
        r += s[j] * wgt; g += s[j + 1] * wgt; b += s[j + 2] * wgt; n += wgt;
      }
      if (!n) continue;
      const k = amt, iw = 1 - warm;
      out[i] = (r / n) * k * iw + 43 * warm;
      out[i + 1] = (g / n) * k * iw + 33 * warm;
      out[i + 2] = (b / n) * k * iw + 24 * warm;
      out[i + 3] = 255;
    }
  }
  ctx.putImageData(new ImageData(out, w, h), 0, 0);
}

/** soft contact shadow — anything that stands up needs one */
export function contactShadow(ctx, cx, cy, rx, ry, o = {}) {
  const a = ctx.globalAlpha;
  ctx.globalAlpha = o.alpha ?? 0.30;
  ellipse(ctx, cx, cy, rx, ry, o.color || '#221a2a');
  ctx.globalAlpha = (o.alpha ?? 0.30) * 0.6;
  ellipse(ctx, cx, cy, rx + 1, ry + 0.7, o.color || '#221a2a');
  ctx.globalAlpha = a;
}

// handy ramps
const G = RAMP.grass, SD = RAMP.sand, RK = RAMP.rock, WT = RAMP.water,
  WD = RAMP.wood, LF = RAMP.leaf, SL = RAMP.soil;
const SNOW = ['#ffffff', '#f0f6ff', '#dbe7f6', '#bccee4', '#9fb4cf'];
const GLASS = ['#cfe7f2', '#8fbcd4', '#5c8ba8', '#3c5f78'];

// ===========================================================================
// ground: grass and its quiet variants
// ===========================================================================

// Deliberately tiny deltas. The four variants must average to the same value or
// a field of them reads as a checkerboard.
const GL = mix(P.grass1, P.grass0, 0.55);
const GD = mix(P.grass1, P.grass2, 0.55);
const GDD = mix(P.grass1, P.grass2, 0.85);

function grassBase(ctx, v = 0) {
  // A quiet, sunlit carpet. Equal-area patches keep all four variants at the
  // same average brightness, so the meadow never becomes a checkerboard.
  const base = mix(P.grass1, P.grass2, 0.35);
  px(ctx, 0, 0, base, 16, 16);
  const softLight = mix(base, P.grass0, 0.13);
  const softShade = mix(base, P.grass3, 0.09);
  const patches = [[2, 3, 5], [10, 8, 4], [4, 12, 3]];
  for (let i = 0; i < patches.length; i++) {
    const [x, y, w] = patches[(i + v) % patches.length];
    px(ctx, x, y, i % 2 ? softShade : softLight, w, 2);
  }

  // Three small blade groups leave enough restful space around the player.
  const spots = [
    [3, 6], [10, 4], [6, 12], [13, 9], [8, 15], [2, 13], [14, 14],
    [5, 3], [11, 11], [1, 8], [7, 8], [12, 2],
  ];
  for (let i = 0; i < 3; i++) {
    const [bx, by] = spots[(i * 5 + v * 3) % spots.length];
    tuft(ctx, bx, by, (i + v) % 3);
  }
}

/** A 2-3 blade clump, lighter at the tip, anchored at its base. */
function tuft(ctx, x, y, kind) {
  const tip = mix(P.grass0, P.grass1, 0.45), mid = P.grass1, root = P.grass2;
  if (kind === 0) {
    px(ctx, x, y - 2, tip); px(ctx, x, y - 1, mid); px(ctx, x, y, root);
    px(ctx, x + 1, y - 1, mid); px(ctx, x + 1, y, root);
  } else if (kind === 1) {
    px(ctx, x, y - 1, mid); px(ctx, x, y, root);
    px(ctx, x + 1, y - 2, tip); px(ctx, x + 1, y - 1, mid); px(ctx, x + 1, y, root);
    px(ctx, x + 2, y - 1, mid);
  } else {
    px(ctx, x, y - 1, tip); px(ctx, x, y, mid);
    px(ctx, x + 1, y, root);
  }
}

function blade(ctx, x, y, h, ramp, lean = 0) {
  for (let j = 0; j < h; j++) {
    const xx = x + Math.round(lean * j / Math.max(1, h - 1));
    px(ctx, xx, y - j, j > h - 2 ? ramp[0] : ramp[1]);
    if (j < h - 1) px(ctx, xx + 1, y - j, ramp[2]);
  }
}

// ===========================================================================
// autotiling
// ===========================================================================
// bit 1=N 2=E 4=S 8=W set when the neighbour is the SAME family.
// A cleared bit is a BOUNDARY: that side gets an edge treatment.

/** generic rim: tones drawn inward from the boundary, thickness wobbles by 1px */
function rimEdges(ctx, b, tones, seed, wob = 1) {
  const t0 = tones[0], t1 = tones[1] || tones[0];
  const bump = (x, s) => hash(x, s, seed) < 0.40;
  if (b.N) for (let x = 0; x < 16; x++) {
    px(ctx, x, 0, t0); px(ctx, x, 1, t1);
    if (wob && bump(x, 1)) { px(ctx, x, 1, t0); px(ctx, x, 2, t1); }
  }
  if (b.S) for (let x = 0; x < 16; x++) {
    px(ctx, x, 15, t0); px(ctx, x, 14, t1);
    if (wob && bump(x, 2)) { px(ctx, x, 14, t0); px(ctx, x, 13, t1); }
  }
  if (b.W) for (let y = 0; y < 16; y++) {
    px(ctx, 0, y, t0); px(ctx, 1, y, t1);
    if (wob && bump(y, 3)) { px(ctx, 1, y, t0); px(ctx, 2, y, t1); }
  }
  if (b.E) for (let y = 0; y < 16; y++) {
    px(ctx, 15, y, t0); px(ctx, 14, y, t1);
    if (wob && bump(y, 4)) { px(ctx, 14, y, t0); px(ctx, 13, y, t1); }
  }
  // round the outer corners so two boundaries meet in a curve, not a spike
  const corner = (cx, cy, sx, sy) => {
    px(ctx, cx, cy, t0); px(ctx, cx + sx, cy, t0); px(ctx, cx, cy + sy, t0);
    px(ctx, cx + sx * 2, cy, t1); px(ctx, cx, cy + sy * 2, t1);
    px(ctx, cx + sx, cy + sy, t1);
  };
  if (b.N && b.W) corner(0, 0, 1, 1);
  if (b.N && b.E) corner(15, 0, -1, 1);
  if (b.S && b.W) corner(0, 15, 1, -1);
  if (b.S && b.E) corner(15, 15, -1, -1);
}

const AT = {
  // ---- worn earth path: light, low contrast, soft irregular rim ----
  path: {
    body(ctx) {
      px(ctx, 0, 0, P.sand1, 16, 16);
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const n = hash(x, y, 3);
        if (n > 0.965) px(ctx, x, y, mix(P.sand1, P.sand0, 0.55));
        else if (n < 0.045) px(ctx, x, y, mix(P.sand1, P.sand2, 0.35));
      }
      // a couple of trodden pebbles
      for (const [x, y] of [[4, 6], [11, 11]]) {
        px(ctx, x, y, mix(P.sand0, P.rock0, 0.3), 2, 1);
        px(ctx, x + 1, y + 1, P.sand2);
      }
    },
    rim: [mix(P.sand2, P.sand3, 0.35), P.sand2],
  },
  // Forest-only trail: uses the same worn-earth body as civic paths, but lets
  // grass bite into exposed edges so bends do not reveal the 16px authoring grid.
  trail: {
    body(ctx) { AT.path.body(ctx); },
    rim: [P.sand3, P.sand2],
    after(ctx, b) {
      // A path boundary is grass intruding into the sand, not a perfectly
      // rectangular tan tile.  Irregular 2–4px cut-ins keep continuous paths
      // joined while rounding bends and isolated stepping patches.
      const grass = mix(P.grass1, P.grass2, 0.35);
      const root = P.grass3;
      const cut = (axis, side) => {
        for (let i = 0; i < 16; i++) {
          const depth = 2 + Math.floor(hash(i, side, 307) * 3);
          for (let d = 0; d < depth; d++) {
            const x = axis === 'x' ? i : (side === 1 ? d : 15 - d);
            const y = axis === 'x' ? (side === 1 ? d : 15 - d) : i;
            px(ctx, x, y, hash(i, d, 313 + side) > 0.78 ? root : grass);
          }
          const x = axis === 'x' ? i : (side === 1 ? depth : 15 - depth);
          const y = axis === 'x' ? (side === 1 ? depth : 15 - depth) : i;
          px(ctx, x, y, P.sand3);
        }
      };
      if (b.N) cut('x', 1);
      if (b.S) cut('x', 2);
      if (b.W) cut('y', 1);
      if (b.E) cut('y', 2);
    },
  },
  // ---- shallow water: foam rim on every shore side ----
  water: {
    body(ctx) {
      px(ctx, 0, 0, P.water2, 16, 16);
      for (const [x, y, w] of [[2, 3, 5], [9, 6, 4], [4, 10, 6], [11, 13, 3], [0, 7, 2]]) {
        px(ctx, x, y, P.water1, w, 1);
        px(ctx, x + 1, y + 1, mix(P.water2, P.water3, 0.5), w - 1, 1);
      }
      for (const [x, y] of [[6, 2], [13, 9], [3, 14]]) px(ctx, x, y, P.water0, 2, 1);
      for (const [x, y, w] of [[7, 8, 5], [1, 12, 4]]) px(ctx, x, y, P.water3, w, 1);
    },
    rim: [P.water0, P.water1],
    after(ctx, b) {
      // a darker lip just inside the foam sells the depth change
      if (b.N) for (let x = 0; x < 16; x++) if (hash(x, 9, 5) > 0.35) px(ctx, x, 3, mix(P.water2, P.water3, 0.4));
      if (b.S) for (let x = 0; x < 16; x++) if (hash(x, 8, 6) > 0.35) px(ctx, x, 12, mix(P.water2, P.water3, 0.4));
      if (b.W) for (let y = 0; y < 16; y++) if (hash(y, 7, 7) > 0.35) px(ctx, 3, y, mix(P.water2, P.water3, 0.4));
      if (b.E) for (let y = 0; y < 16; y++) if (hash(y, 6, 8) > 0.35) px(ctx, 12, y, mix(P.water2, P.water3, 0.4));
    },
  },
  // ---- deep water: darker, transitions up into shallow at the rim ----
  deepwater: {
    body(ctx) {
      px(ctx, 0, 0, P.water3, 16, 16);
      for (const [x, y, w] of [[3, 4, 6], [10, 9, 5], [1, 12, 5]]) {
        px(ctx, x, y, mix(P.water2, P.water3, 0.35), w, 1);
      }
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        if (hash(x, y, 21) < 0.06) px(ctx, x, y, P.water4);
      }
    },
    rim: [P.water2, mix(P.water2, P.water3, 0.5)],
  },
  // ---- beach sand ----
  sand: {
    body(ctx) {
      px(ctx, 0, 0, P.sand0, 16, 16);
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const n = hash(x, y, 13);
        if (n > 0.93) px(ctx, x, y, mix(P.sand0, '#fff', 0.35));
        else if (n < 0.09) px(ctx, x, y, P.sand1);
      }
      for (const [x, y] of [[5, 8], [12, 4]]) px(ctx, x, y, P.sand2, 2, 1);
    },
    rim: [P.sand2, P.sand1],
  },
  // ---- snow ----
  snow: {
    body(ctx) {
      px(ctx, 0, 0, SNOW[1], 16, 16);
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const n = hash(x, y, 29);
        if (n > 0.90) px(ctx, x, y, SNOW[0]);
        else if (n < 0.08) px(ctx, x, y, SNOW[2]);
      }
      for (const [x, y, w] of [[3, 6, 5], [9, 11, 4]]) px(ctx, x, y, SNOW[2], w, 1);
    },
    rim: [SNOW[3], SNOW[2]],
  },
  // ---- interior floorboards: rim is a skirting board ----
  floor: {
    body(ctx) {
      px(ctx, 0, 0, P.wood1, 16, 16);
      for (let r = 0; r < 4; r++) {
        const y = r * 4;
        px(ctx, 0, y, mix(P.wood1, P.wood0, 0.55), 16, 1);
        px(ctx, 0, y + 3, P.wood2, 16, 1);
        // stagger the plank joins so the floor doesn't read as a grid
        const jx = (r % 2 === 0) ? 5 : 11;
        px(ctx, jx, y, P.wood3, 1, 4);
        for (let x = 0; x < 16; x++) if (hash(x, r, 41) > 0.90) px(ctx, x, y + 1, mix(P.wood1, P.wood2, 0.4));
      }
    },
    rim: [P.wood3, P.wood2],
    wob: 0,
  },
};

function autotileTile(fam, m, ctx) {
  const b = { N: !(m & 1), E: !(m & 2), S: !(m & 4), W: !(m & 8) };
  if (fam === 'cliff') return cliffTile(ctx, b);
  const cfg = AT[fam];
  cfg.body(ctx, m);
  rimEdges(ctx, b, cfg.rim, 1 + fam.length, cfg.wob ?? 1);
  cfg.after?.(ctx, b);
}

/** cliff: solid lit top face, plus a shaded rock wall wherever the south drops away */
function cliffTile(ctx, b) {
  // top face
  px(ctx, 0, 0, P.rock1, 16, 16);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const n = hash(x, y, 51);
    if (n > 0.92) px(ctx, x, y, P.rock0);
    else if (n < 0.10) px(ctx, x, y, P.rock2);
  }
  for (const [x, y, w] of [[3, 5, 5], [9, 10, 4]]) px(ctx, x, y, P.rock2, w, 1);
  if (b.N) { px(ctx, 0, 0, P.rock0, 16, 1); px(ctx, 0, 1, mix(P.rock0, P.rock1, 0.5), 16, 1); }
  if (b.W) { px(ctx, 0, 0, P.rock2, 1, 16); px(ctx, 1, 0, mix(P.rock1, P.rock2, 0.5), 1, 16); }
  if (b.E) { px(ctx, 15, 0, P.rock3, 1, 16); px(ctx, 14, 0, P.rock2, 1, 16); }
  if (b.S) {
    // the wall you actually see: lip, then banded rock, then a base shadow
    const top = 6;
    px(ctx, 0, top, P.rock0, 16, 1);
    px(ctx, 0, top + 1, P.rock2, 16, 15 - top);
    for (let y = top + 1; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const n = hash(x, y, 67);
        if (n > 0.88) px(ctx, x, y, P.rock1);
        else if (n < 0.14) px(ctx, x, y, P.rock3);
      }
    }
    // vertical seams give the wall structure
    for (const sx of [4, 10]) px(ctx, sx, top + 2, P.rock3, 1, 14 - top);
    for (const [sy, sx, sw] of [[10, 0, 7], [12, 8, 8]]) px(ctx, sx, sy, P.rock3, sw, 1);
    px(ctx, 0, 15, P.rock4, 16, 1);
    px(ctx, 0, top + 1, mix(P.rock2, P.rock1, 0.5), 1, 15 - top);   // lit left edge
    px(ctx, 15, top + 1, P.rock3, 1, 15 - top);                      // shaded right edge
  } else if (b.E || b.W) {
    if (b.E) px(ctx, 15, 0, P.rock3, 1, 16);
    if (b.W) px(ctx, 0, 0, P.rock2, 1, 16);
  }
  if (!b.S) px(ctx, 0, 15, mix(P.rock1, P.rock2, 0.4), 16, 1);
}

// ===========================================================================
// prop sheets built once, then sliced into tiles
// ===========================================================================

let _canopy = null;
function canopySheet() {
  if (_canopy) return _canopy;
  const c = makeCanvas(32, 32), x = c.getContext('2d');
  // Paint the trunk and roots first so the crown naturally occludes their tops.
  // Keeping the lower 7px visible makes this read as a tree rather than a hedge ball.
  x.globalAlpha = 0.28; ellipse(x, 16, 30, 9, 2, '#17131a'); x.globalAlpha = 1;
  px(x, 13, 13, P.wood3, 7, 17);
  px(x, 13, 13, P.wood1, 2, 17); px(x, 19, 13, P.wood4, 1, 17);
  px(x, 15, 17, P.wood2, 2, 11); px(x, 17, 21, P.wood4, 2, 1);
  px(x, 10, 28, P.wood3, 4, 2); px(x, 19, 28, P.wood3, 4, 2);
  px(x, 9, 30, P.wood4, 15, 1);

  // Overlapping boughs have broad lit tops and a cool lower edge. The crown's
  // scalloped silhouette and leaf clusters read as foliage at the native scale.
  const crown = ['#a4c96b', '#78ae52', '#508d40', '#326d36', '#214d2d'];
  shadedBlob(x, 16, 15, 14.2, 10.8, crown, { edge: 0.22 });
  for (const [cx, cy, rx, ry] of [
    [8, 18, 6.5, 6], [23, 18, 7, 6], [6, 11, 5.3, 5.4],
    [25, 10, 5.8, 5.8], [17, 6, 8, 5.8], [11, 8, 6.4, 5.6],
  ]) shadedBlob(x, cx, cy, rx, ry, crown, { edge: 0.18, lit: 0.5, bias: -0.04 });
  for (const [cx, cy, rx] of [[7, 8, 3], [14, 4, 4], [22, 8, 3], [11, 15, 3.5], [22, 17, 3]]) {
    // Each leaf is a connected two-pixel brush stroke, never random glitter.
    px(x, cx - 2, cy, crown[0], rx | 0, 1);
    px(x, cx - 1, cy - 1, crown[0], 2, 1);
    px(x, cx + 1, cy + 2, crown[1], 3, 1);
  }
  for (const [cx, cy] of [[7, 21], [15, 22], [23, 21], [28, 15]]) {
    px(x, cx, cy, crown[3], 3, 1);
    px(x, cx + 1, cy + 1, crown[4], 2, 1);
  }
  autoOutline(x, 32, 32, 0.5);
  return (_canopy = c);
}

let _pine = null;
function pineSheet() {
  if (_pine) return _pine;
  // Pines occupy the documented 1x2 map footprint, so their source is a real
  // 16x32 sheet rather than a 48px sheet with its middle silently discarded.
  const c = makeCanvas(16, 32), x = c.getContext('2d');
  const R2 = ['#8dc069', '#5e9a49', '#3f7434', '#2b5426', '#1d3c1c'];
  // three skirts, widest at the bottom
  const tiers = [[2, 4.8, 3.6], [10, 6.2, 4.5], [18, 7.4, 4.6]];
  for (const [ty, tw, th] of tiers) {
    for (let j = 0; j < th * 2; j++) {
      const t = j / (th * 2 - 1);
      const w = Math.round(1 + tw * 2 * t);
      const xx = 8 - (w >> 1);
      for (let i = 0; i < w; i++) {
        const rel = (i - w / 2) / (w / 2);
        let idx = 1.4 + rel * 1.1 + t * 0.5;
        if (i === 0) idx = 0.4;
        px(x, xx + i, ty + j, tone(R2, idx));
      }
      // ragged needle tips along the skirt bottom
      if (j === th * 2 - 1) for (let i = 0; i < w; i += 2) px(x, xx + i, ty + j + 1, R2[3]);
    }
  }
  px(x, 8, 1, R2[0]); px(x, 8, 2, R2[1]);
  // trunk
  px(x, 7, 25, P.wood3, 3, 6);
  px(x, 7, 25, P.wood2, 1, 6);
  px(x, 9, 25, P.wood4, 1, 6);
  px(x, 6, 30, P.wood3, 5, 1);
  autoOutline(x, 16, 32, 0.5);
  return (_pine = c);
}

// ===========================================================================
// tile painters
// ===========================================================================

const TP = {};

// ---- ground cover -------------------------------------------------------
TP['t.grass'] = ctx => grassBase(ctx, 0);
TP['t.grass.a'] = ctx => grassBase(ctx, 1);
TP['t.grass.b'] = ctx => grassBase(ctx, 2);
TP['t.grass.c'] = ctx => grassBase(ctx, 3);

TP['t.grass.tuft'] = ctx => {
  grassBase(ctx, 1);
  blade(ctx, 6, 13, 5, [P.leaf0, P.leaf1, P.leaf2], -1);
  blade(ctx, 8, 14, 6, [P.leaf0, P.leaf1, P.leaf2], 1);
  blade(ctx, 10, 13, 4, [P.leaf1, P.leaf2, P.leaf3], 1);
  px(ctx, 6, 14, P.leaf3, 5, 1);
};
TP['t.grass.flower'] = ctx => {
  grassBase(ctx, 2);
  const petal = (x, y, c, mid) => {
    px(ctx, x, y - 1, c); px(ctx, x - 1, y, c); px(ctx, x + 1, y, c);
    px(ctx, x, y + 1, shade(c, -0.18)); px(ctx, x, y, mid);
  };
  px(ctx, 4, 6, P.leaf2, 1, 3); px(ctx, 10, 9, P.leaf2, 1, 3);
  petal(4, 5, P.paper0, P.gold2);
  petal(10, 8, P.paper0, P.gold2);
  petal(7, 12, P.gold0, P.gold3);
};
TP['t.grass.flower2'] = ctx => {
  grassBase(ctx, 3);
  const petal = (x, y, c, mid) => {
    px(ctx, x, y - 1, c); px(ctx, x - 1, y, c); px(ctx, x + 1, y, c);
    px(ctx, x, y + 1, shade(c, -0.2)); px(ctx, x, y, mid);
  };
  px(ctx, 5, 9, P.leaf2, 1, 3); px(ctx, 11, 6, P.leaf2, 1, 3);
  petal(5, 8, P.bloom0, P.bloom2);
  petal(11, 5, P.violet0, P.violet2);
  petal(8, 12, P.bloom1, P.bloom3);
};
TP['t.grass.pebble'] = ctx => {
  grassBase(ctx, 0);
  const stone = (x, y, w) => {
    px(ctx, x, y, P.rock1, w, 1); px(ctx, x, y + 1, P.rock2, w, 1);
    px(ctx, x, y, P.rock0, 1, 1); px(ctx, x + w - 1, y + 1, P.rock3);
  };
  stone(4, 7, 4); stone(10, 11, 3); stone(11, 4, 2);
};

TP['t.tallgrass'] = (ctx, w, h, f) => {
  // encounter grass: same value family as normal grass, but taller and busier
  px(ctx, 0, 0, mix(P.grass1, P.grass2, 0.35), 16, 16);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    if (hash(x, y, 71) < 0.08) px(ctx, x, y, P.grass3);
  }
  const lean = f ? 1 : -1;
  const clumps = [[2, 15, 7], [6, 16, 9], [10, 15, 8], [13, 16, 7], [0, 14, 5], [15, 14, 6]];
  for (const [bx, by, bh] of clumps) {
    blade(ctx, bx, by, bh, [P.leaf0, P.leaf1, P.leaf3], lean);
    blade(ctx, bx + 2, by - 1, bh - 2, [P.leaf1, P.leaf2, P.leaf3], -lean);
  }
  px(ctx, 0, 15, P.leaf3, 16, 1);
};

TP['t.crop.soil'] = ctx => soilBed(ctx);
TP['t.crop.sprout'] = (ctx, w, h, f) => {
  soilBed(ctx);
  const l = f ? 1 : 0;
  for (const [x, y] of [[4, 10], [8, 12], [12, 9]]) {
    px(ctx, x, y, P.leaf2, 1, 2);
    px(ctx, x - 1 - l, y - 1, P.leaf1); px(ctx, x + 1 + l, y - 1, P.leaf1);
    px(ctx, x, y - 2, P.leaf0);
  }
};
TP['t.crop.grown'] = ctx => {
  soilBed(ctx);
  for (const [x, y] of [[4, 12], [9, 14], [13, 11]]) {
    px(ctx, x, y - 5, P.leaf1, 1, 6);
    px(ctx, x - 2, y - 4, P.leaf2, 2, 1); px(ctx, x + 1, y - 5, P.leaf2, 2, 1);
    px(ctx, x - 2, y - 2, P.leaf1, 2, 1); px(ctx, x + 1, y - 3, P.leaf0, 2, 1);
    px(ctx, x - 1, y - 1, P.ember2, 2, 2); px(ctx, x - 1, y - 1, P.ember1);
    px(ctx, x, y + 1, P.leaf3, 1, 1);
  }
};
function soilBed(ctx) {
  px(ctx, 0, 0, P.soil1, 16, 16);
  for (let r = 0; r < 4; r++) {
    const y = r * 4;
    px(ctx, 0, y, P.soil0, 16, 1);
    px(ctx, 0, y + 2, P.soil2, 16, 1);
    px(ctx, 0, y + 3, P.soil3, 16, 1);
  }
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    if (hash(x, y, 83) > 0.94) px(ctx, x, y, P.soil0);
  }
}

TP['t.leaves'] = ctx => {
  px(ctx, 0, 0, mix(P.soil0, P.sand2, 0.5), 16, 16);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    if (hash(x, y, 97) < 0.08) px(ctx, x, y, P.soil1);
  }
  const cols = [P.ember1, P.ember2, P.gold1, P.gold2, '#c96a3a'];
  for (let i = 0; i < 11; i++) {
    const x = Math.floor(hash(i, 1, 5) * 14), y = Math.floor(hash(i, 2, 6) * 14);
    const c = cols[i % cols.length];
    px(ctx, x, y, c, 3, 1); px(ctx, x + 1, y + 1, shade(c, -0.22), 2, 1);
    px(ctx, x, y, shade(c, 0.2));
  }
};

TP['t.puddle'] = (ctx, w, h, f) => {
  px(ctx, 0, 0, mix(P.soil0, P.sand2, 0.4), 16, 16);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    if (hash(x, y, 101) > 0.93) px(ctx, x, y, P.soil1);
  }
  ellipse(ctx, 8, 9, 6.5, 4.5, (x, y, dx, dy, d) =>
    d > 0.85 ? P.water3 : (dx + dy < -0.4 ? P.water1 : P.water2));
  const r = f ? 3.2 : 4.4;
  ellipse(ctx, 8, 9, r, r * 0.65, (x, y, dx, dy, d) => d > 0.78 && d < 1 ? P.water0 : null);
  px(ctx, 5, 6, P.water0, 2, 1);
};

// ---- structure ---------------------------------------------------------
TP['t.cliff.face'] = ctx => {
  px(ctx, 0, 0, P.rock2, 16, 16);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const n = hash(x, y, 111);
    if (n > 0.90) px(ctx, x, y, P.rock1);
    else if (n < 0.14) px(ctx, x, y, P.rock3);
  }
  for (const [x, y, w, h] of [[0, 4, 7, 1], [8, 9, 8, 1], [4, 0, 1, 5], [11, 5, 1, 5], [6, 10, 1, 6]]) {
    px(ctx, x, y, P.rock3, w, h);
  }
  px(ctx, 0, 0, mix(P.rock1, P.rock2, 0.5), 1, 16);
  px(ctx, 15, 0, P.rock3, 1, 16);
  px(ctx, 0, 15, P.rock4, 16, 1);
};
TP['t.cliff.top'] = ctx => {
  grassBase(ctx, 2);
  px(ctx, 0, 11, P.rock0, 16, 1);
  px(ctx, 0, 12, P.rock1, 16, 2);
  px(ctx, 0, 14, P.rock2, 16, 2);
  for (let x = 0; x < 16; x++) if (hash(x, 3, 121) > 0.7) px(ctx, x, 12, P.rock0);
  px(ctx, 0, 10, P.grass3, 16, 1);
};
TP['t.stair.up'] = ctx => stairs(ctx, true);
TP['t.stair.down'] = ctx => stairs(ctx, false);
function stairs(ctx, up) {
  px(ctx, 0, 0, P.rock2, 16, 16);
  for (let s = 0; s < 4; s++) {
    const y = s * 4;
    px(ctx, 1, y, P.rock0, 14, 1);
    px(ctx, 1, y + 1, P.rock1, 14, 2);
    px(ctx, 1, y + 3, P.rock3, 14, 1);
  }
  px(ctx, 0, 0, P.rock3, 1, 16); px(ctx, 15, 0, P.rock4, 1, 16);
  if (up) { px(ctx, 7, 1, P.rock0, 2, 1); }
  else { px(ctx, 7, 14, P.rock3, 2, 1); }
}
TP['t.ledge'] = ctx => {
  grassBase(ctx, 1);
  px(ctx, 0, 5, P.grass4, 16, 1);
  px(ctx, 0, 6, P.rock0, 16, 1);
  px(ctx, 0, 7, P.rock1, 16, 2);
  px(ctx, 0, 9, P.rock2, 16, 2);
  px(ctx, 0, 11, P.rock3, 16, 1);
  for (const x of [4, 11]) { px(ctx, x, 7, P.rock2, 1, 4); px(ctx, x + 1, 7, P.rock1, 1, 4); }
  ctx.globalAlpha = 0.3; px(ctx, 0, 12, '#221a2a', 16, 2); ctx.globalAlpha = 1;
};
TP['t.bridge.h'] = ctx => bridge(ctx, true);
TP['t.bridge.v'] = ctx => bridge(ctx, false);
function bridge(ctx, horiz) {
  if (horiz) {
    px(ctx, 0, 0, P.wood1, 16, 16);
    for (let x = 0; x < 16; x += 3) {
      px(ctx, x, 0, mix(P.wood1, P.wood0, 0.5), 2, 16);
      px(ctx, x + 2, 0, P.wood3, 1, 16);
    }
    px(ctx, 0, 0, P.wood2, 16, 2); px(ctx, 0, 0, P.wood0, 16, 1);
    px(ctx, 0, 14, P.wood3, 16, 2); px(ctx, 0, 14, P.wood2, 16, 1);
  } else {
    px(ctx, 0, 0, P.wood1, 16, 16);
    for (let y = 0; y < 16; y += 3) {
      px(ctx, 0, y, mix(P.wood1, P.wood0, 0.5), 16, 2);
      px(ctx, 0, y + 2, P.wood3, 16, 1);
    }
    px(ctx, 0, 0, P.wood0, 1, 16); px(ctx, 1, 0, P.wood2, 1, 16);
    px(ctx, 15, 0, P.wood3, 1, 16); px(ctx, 14, 0, P.wood2, 1, 16);
  }
}
TP['t.fence.h'] = ctx => {
  px(ctx, 0, 5, P.wood2, 16, 1); px(ctx, 0, 6, P.wood1, 16, 1); px(ctx, 0, 7, P.wood3, 16, 1);
  px(ctx, 0, 10, P.wood2, 16, 1); px(ctx, 0, 11, P.wood1, 16, 1); px(ctx, 0, 12, P.wood3, 16, 1);
  post(ctx, 7, 3);
};
TP['t.fence.v'] = ctx => {
  px(ctx, 6, 0, P.wood0, 1, 16); px(ctx, 7, 0, P.wood1, 2, 16); px(ctx, 9, 0, P.wood3, 1, 16);
  post(ctx, 3, 6);
};
TP['t.fence.post'] = ctx => post(ctx, 6, 2);
function post(ctx, x, y) {
  px(ctx, x, y, P.wood2, 4, 13 - (y - 2));
  px(ctx, x, y, P.wood1, 3, 13 - (y - 2));
  px(ctx, x, y, P.wood0, 1, 13 - (y - 2));
  px(ctx, x + 3, y, P.wood4, 1, 13 - (y - 2));
  px(ctx, x, y, P.wood0, 4, 1);
  px(ctx, x - 1, 14, P.wood4, 6, 1);
}
TP['t.fence.gate'] = ctx => {
  px(ctx, 0, 4, P.wood3, 16, 1);
  px(ctx, 1, 5, P.wood1, 14, 8); px(ctx, 1, 5, P.wood0, 14, 1);
  px(ctx, 1, 12, P.wood3, 14, 1);
  for (let i = 0; i < 14; i += 3) px(ctx, 1 + i, 5, P.wood2, 1, 8);
  px(ctx, 2, 6, P.wood0, 12, 1);
  px(ctx, 12, 8, P.gold2, 2, 2); px(ctx, 12, 8, P.gold0);
  post(ctx, 0, 2); post(ctx, 12, 2);
};
TP['t.hedge'] = ctx => {
  px(ctx, 0, 2, P.leaf2, 16, 14);
  shadedBlob(ctx, 4, 6, 5, 4.5, LF, { edge: 0.2 });
  shadedBlob(ctx, 12, 6, 5, 4.5, LF, { edge: 0.2 });
  shadedBlob(ctx, 8, 8, 6, 5, LF, { edge: 0.2 });
  px(ctx, 0, 14, P.leaf4, 16, 2);
  for (let y = 2; y < 16; y++) for (let x = 0; x < 16; x++) {
    if (hash(x, y, 131) > 0.94) px(ctx, x, y, P.leaf0);
    else if (hash(x, y, 137) > 0.95) px(ctx, x, y, P.leaf3);
  }
  px(ctx, 0, 2, P.leaf3, 1, 14); px(ctx, 15, 2, P.leaf4, 1, 14);
};
TP['t.wall.stone'] = ctx => {
  px(ctx, 0, 0, P.rock2, 16, 16);
  const brick = (x, y, w) => {
    px(ctx, x, y, P.rock1, w, 3);
    px(ctx, x, y, P.rock0, w - 1, 1);
    px(ctx, x + w - 1, y, P.rock3, 1, 3);
    px(ctx, x, y + 2, P.rock2, w, 1);
  };
  for (let r = 0; r < 4; r++) {
    const y = r * 4, off = r % 2 ? -3 : 0;
    for (let x = off; x < 16; x += 7) brick(x, y, 6);
  }
  px(ctx, 0, 0, P.rock3, 16, 1); px(ctx, 0, 15, P.rock4, 16, 1);
};
TP['t.wall.plank'] = ctx => {
  px(ctx, 0, 0, P.wood2, 16, 16);
  for (let x = 0; x < 16; x += 4) {
    px(ctx, x, 0, P.wood1, 3, 16);
    px(ctx, x, 0, P.wood0, 1, 16);
    px(ctx, x + 3, 0, P.wood4, 1, 16);
    for (let y = 0; y < 16; y++) if (hash(x, y, 141) > 0.93) px(ctx, x + 1, y, P.wood2);
  }
  px(ctx, 0, 0, P.wood0, 16, 1); px(ctx, 0, 15, P.wood4, 16, 1);
};

// ---- trees & nature props ----------------------------------------------
TP['t.tree.canopy.nw'] = ctx => ctx.drawImage(canopySheet(), 0, 0);
TP['t.tree.canopy.ne'] = ctx => ctx.drawImage(canopySheet(), -16, 0);
TP['t.tree.canopy.sw'] = ctx => ctx.drawImage(canopySheet(), 0, -16);
TP['t.tree.canopy.se'] = ctx => ctx.drawImage(canopySheet(), -16, -16);
TP['t.tree.trunk'] = ctx => {
  px(ctx, 5, 0, P.wood3, 6, 14);
  px(ctx, 5, 0, P.wood2, 2, 14);
  px(ctx, 5, 0, mix(P.wood2, P.wood1, 0.5), 1, 14);
  px(ctx, 10, 0, P.wood4, 1, 14);
  for (const y of [3, 7, 11]) px(ctx, 7, y, P.wood4, 2, 1);
  // roots flaring into the ground
  px(ctx, 3, 11, P.wood3, 2, 3); px(ctx, 11, 11, P.wood3, 2, 3);
  px(ctx, 3, 13, P.wood4, 10, 1);
  px(ctx, 2, 13, P.wood4, 12, 1);
  ctx.globalAlpha = 0.28; ellipse(ctx, 8, 14, 7, 2.2, '#221a2a'); ctx.globalAlpha = 1;
};
TP['t.pine.top'] = ctx => ctx.drawImage(pineSheet(), 0, 0);
TP['t.pine.mid'] = ctx => ctx.drawImage(pineSheet(), 0, -8);
TP['t.pine.trunk'] = ctx => ctx.drawImage(pineSheet(), 0, -16);

TP['t.bush'] = ctx => {
  shadedBlob(ctx, 8, 9, 7, 6, LF, { edge: 0.28 });
  shadedBlob(ctx, 4, 8, 4, 3.5, LF, { edge: 0.28 });
  shadedBlob(ctx, 12, 9, 4, 3.5, LF, { edge: 0.28 });
  for (let y = 2; y < 16; y++) for (let x = 0; x < 16; x++) {
    if (hash(x, y, 151) > 0.95) px(ctx, x, y, P.leaf0);
  }
  autoOutline(ctx, 16, 16, 0.5);
  ctx.globalAlpha = 0.26; ellipse(ctx, 8, 15, 6, 1.6, '#221a2a'); ctx.globalAlpha = 1;
};
TP['t.bush.berry'] = ctx => {
  TP['t.bush'](ctx);
  for (const [x, y] of [[5, 7], [10, 6], [7, 11], [12, 10]]) {
    px(ctx, x, y, P.roof1); px(ctx, x + 1, y, P.roof2);
    px(ctx, x, y + 1, P.roof2); px(ctx, x + 1, y + 1, P.roof3);
    px(ctx, x, y, P.roof0);
  }
};
TP['t.rock.small'] = ctx => {
  shadedBlob(ctx, 8, 11, 5, 3.6, RK, { edge: 0.25 });
  px(ctx, 6, 9, P.rock0, 2, 1);
  autoOutline(ctx, 16, 16, 0.5);
  ctx.globalAlpha = 0.26; ellipse(ctx, 8, 15, 5, 1.4, '#221a2a'); ctx.globalAlpha = 1;
};
TP['t.rock.big'] = ctx => {
  shadedBlob(ctx, 8, 9, 7, 6.2, RK, { edge: 0.25 });
  shadedBlob(ctx, 4, 12, 3.4, 2.6, RK, { edge: 0.25 });
  px(ctx, 5, 5, P.rock0, 3, 1); px(ctx, 4, 6, P.rock0, 2, 1);
  px(ctx, 9, 11, P.rock3, 3, 1);
  autoOutline(ctx, 16, 16, 0.5);
  ctx.globalAlpha = 0.26; ellipse(ctx, 8, 15, 7, 1.6, '#221a2a'); ctx.globalAlpha = 1;
};
TP['t.stump'] = ctx => {
  px(ctx, 4, 8, P.wood3, 8, 6);
  px(ctx, 4, 8, P.wood2, 3, 6);
  px(ctx, 11, 8, P.wood4, 1, 6);
  ellipse(ctx, 8, 8, 4.5, 2.2, (x, y, dx, dy, d) => d > 0.6 ? P.wood2 : P.wood0);
  ellipse(ctx, 8, 8, 2.2, 1.1, (x, y, dx, dy, d) => d > 0.6 ? P.wood2 : P.wood1);
  px(ctx, 3, 12, P.wood3, 10, 2);
  autoOutline(ctx, 16, 16, 0.5);
  ctx.globalAlpha = 0.26; ellipse(ctx, 8, 15, 6, 1.5, '#221a2a'); ctx.globalAlpha = 1;
};
TP['t.log'] = ctx => {
  px(ctx, 1, 7, P.wood2, 14, 5);
  px(ctx, 1, 7, P.wood1, 14, 2);
  px(ctx, 1, 7, P.wood0, 14, 1);
  px(ctx, 1, 11, P.wood4, 14, 1);
  ellipse(ctx, 2, 9.5, 2, 2.6, (x, y, dx, dy, d) => d > 0.62 ? P.wood3 : P.wood0);
  for (const x of [6, 10]) px(ctx, x, 8, P.wood3, 1, 3);
  autoOutline(ctx, 16, 16, 0.5);
  ctx.globalAlpha = 0.24; ellipse(ctx, 8, 13, 7, 1.4, '#221a2a'); ctx.globalAlpha = 1;
};
TP['t.mushroom'] = ctx => {
  const cap = (x, y, c) => {
    ellipse(ctx, x, y, 3.4, 2.4, (px_, py, dx, dy, d) =>
      d > 0.8 ? shade(c, -0.3) : (dx + dy < -0.2 ? shade(c, 0.25) : c));
    px(ctx, x - 1, y + 2, P.paper1, 3, 3);
    px(ctx, x - 1, y + 2, P.paper0, 1, 3);
    px(ctx, x + 1, y + 2, P.paper3, 1, 3);
  };
  cap(5, 8, P.roof1); cap(11, 10, P.roof1);
  px(ctx, 4, 7, P.paper0); px(ctx, 11, 9, P.paper0);
  autoOutline(ctx, 16, 16, 0.5);
};
TP['t.reed'] = ctx => {
  px(ctx, 0, 0, P.water2, 16, 16);
  for (const [x, y, h] of [[3, 15, 11], [6, 16, 13], [9, 15, 10], [12, 16, 12]]) {
    blade(ctx, x, y, h, [P.leaf0, P.leaf1, P.leaf3], x % 4 === 0 ? -1 : 1);
  }
  px(ctx, 0, 14, P.water1, 16, 1);
};
TP['t.lilypad'] = ctx => {
  px(ctx, 0, 0, P.water2, 16, 16);
  for (const [x, y, w] of [[2, 4, 5], [9, 11, 4]]) px(ctx, x, y, P.water1, w, 1);
  const pad = (cx, cy, r) => {
    ellipse(ctx, cx, cy, r, r * 0.8, (x, y, dx, dy, d) =>
      (dx > 0.15 && dy > -0.25 && dy < 0.3 && d > 0.35) ? null
        : (d > 0.82 ? P.leaf3 : (dx + dy < -0.2 ? P.leaf0 : P.leaf1)));
  };
  pad(6, 8, 4.6); pad(12, 12, 3.2);
  px(ctx, 11, 4, P.bloom1, 2, 2); px(ctx, 11, 4, P.bloom0); px(ctx, 12, 5, P.bloom2);
  px(ctx, 11, 3, P.bloom0, 2, 1);
};
TP['t.cattail'] = ctx => {
  px(ctx, 0, 0, P.water2, 16, 16);
  for (const [x, top] of [[5, 2], [10, 4]]) {
    px(ctx, x, top + 3, P.leaf2, 1, 13 - top);
    px(ctx, x, top, P.soil2, 2, 4);
    px(ctx, x, top, P.soil1, 1, 4);
    px(ctx, x + 1, top + 3, P.soil3);
    blade(ctx, x - 2, 15, 8, [P.leaf0, P.leaf1, P.leaf3], -1);
  }
  px(ctx, 0, 14, P.water1, 16, 1);
};

// ---- village props -----------------------------------------------------
TP['t.sign'] = ctx => {
  px(ctx, 7, 9, P.wood3, 2, 6);
  panelBox(ctx, 2, 3, 12, 8, [P.wood0, P.wood1, P.wood2, P.wood4]);
  for (const y of [5, 7]) px(ctx, 4, y, P.wood3, 8, 1);
  px(ctx, 4, 9, P.wood3, 5, 1);
  ctx.globalAlpha = 0.26; ellipse(ctx, 8, 15, 5, 1.3, '#221a2a'); ctx.globalAlpha = 1;
};
TP['t.signpost'] = ctx => {
  px(ctx, 7, 2, P.wood3, 2, 13); px(ctx, 7, 2, P.wood2, 1, 13);
  panelBox(ctx, 1, 3, 10, 5, [P.wood0, P.wood1, P.wood2, P.wood4]);
  px(ctx, 3, 5, P.wood3, 6, 1);
  panelBox(ctx, 6, 9, 9, 4, [P.wood0, P.wood1, P.wood2, P.wood4]);
  px(ctx, 8, 10, P.wood3, 5, 1);
  ctx.globalAlpha = 0.26; ellipse(ctx, 8, 15, 4, 1.2, '#221a2a'); ctx.globalAlpha = 1;
};
function lampPost(ctx) {
  px(ctx, 7, 6, P.rock3, 2, 9); px(ctx, 7, 6, P.rock2, 1, 9);
  px(ctx, 5, 14, P.rock3, 6, 1); px(ctx, 5, 13, P.rock2, 6, 1);
  px(ctx, 5, 2, P.rock3, 6, 1);
}
// A lamp has to read as a lamp at 16px. A wide rectangular head on a thin post
// reads as a signboard or a screen — which is exactly how the first version looked
// in the village. A lantern needs a narrow tapered body, a peaked cap, a visible
// mullion splitting the glass, and a hooked arm.
function lantern(ctx, glass, glow) {
  // post and footing
  px(ctx, 8, 8, P.rock3, 1, 7);
  px(ctx, 7, 8, P.rock2, 1, 7);
  px(ctx, 6, 15, P.rock3, 4, 1);
  px(ctx, 6, 14, P.rock2, 4, 1);
  // hooked arm over to the lantern
  px(ctx, 7, 4, P.rock2, 1, 4);
  // peaked cap
  px(ctx, 7, 0, P.rock3, 2, 1);
  px(ctx, 6, 1, P.rock2, 4, 1);
  px(ctx, 5, 2, P.rock3, 6, 1);
  px(ctx, 5, 2, P.rock1, 5, 1);
  // tapered lantern body
  px(ctx, 5, 3, P.rock3, 6, 5);
  px(ctx, 6, 3, glass, 4, 4);
  // mullion + a cross-bar, so it reads as panes of glass rather than a panel
  px(ctx, 8, 3, P.rock3, 1, 4);
  px(ctx, 6, 5, P.rock3, 4, 1);
  // base of the lantern
  px(ctx, 5, 7, P.rock2, 6, 1);
  px(ctx, 6, 8, P.rock3, 4, 1);
  if (glow) {
    px(ctx, 6, 3, P.gold0, 2, 2);
    px(ctx, 9, 6, P.gold0, 1, 1);
    ctx.globalAlpha = 0.16;
    ellipse(ctx, 8, 5, 5, 5, P.gold0);
    ctx.globalAlpha = 1;
  }
  ctx.globalAlpha = 0.26; ellipse(ctx, 8, 15, 5, 1.3, '#221a2a'); ctx.globalAlpha = 1;
}

TP['t.lamp'] = ctx => lantern(ctx, mix(P.rock1, GLASS[2], 0.55), false);
TP['t.lamp.lit'] = (ctx, w, h, f) => lantern(ctx, f ? P.gold1 : P.gold0, true);

TP['t.well'] = ctx => {
  px(ctx, 2, 7, P.rock2, 12, 8);
  px(ctx, 2, 7, P.rock1, 12, 2);
  px(ctx, 2, 7, P.rock0, 12, 1);
  for (let r = 0; r < 2; r++) for (let x = 2 + (r % 2 ? 0 : 3); x < 14; x += 6) {
    px(ctx, x, 9 + r * 3, P.rock3, 1, 3);
  }
  px(ctx, 2, 14, P.rock4, 12, 1);
  ellipse(ctx, 8, 7, 5.5, 2.2, (x, y, dx, dy, d) => d > 0.7 ? P.rock1 : P.water3);
  ellipse(ctx, 8, 7, 3.4, 1.2, (x, y, dx, dy, d) => d > 0.7 ? P.water4 : P.water2);
  px(ctx, 3, 1, P.wood3, 2, 7); px(ctx, 11, 1, P.wood3, 2, 7);
  px(ctx, 3, 1, P.wood2, 1, 7); px(ctx, 11, 1, P.wood2, 1, 7);
  px(ctx, 1, 0, P.roof1, 14, 3); px(ctx, 1, 0, P.roof0, 14, 1); px(ctx, 1, 2, P.roof2, 14, 1);
  autoOutline(ctx, 16, 16, 0.5);
};
TP['t.crate'] = ctx => {
  panelBox(ctx, 2, 4, 12, 11, [P.wood0, P.wood1, P.wood2, P.wood4]);
  px(ctx, 3, 8, P.wood2, 10, 1); px(ctx, 3, 9, P.wood0, 10, 1);
  px(ctx, 7, 5, P.wood2, 2, 9);
  px(ctx, 3, 5, P.wood0, 4, 1);
  ctx.globalAlpha = 0.26; ellipse(ctx, 8, 15, 6, 1.3, '#221a2a'); ctx.globalAlpha = 1;
};
TP['t.barrel'] = ctx => {
  px(ctx, 4, 3, P.wood2, 8, 12);
  px(ctx, 4, 3, P.wood1, 5, 12);
  px(ctx, 4, 3, P.wood0, 2, 12);
  px(ctx, 11, 3, P.wood4, 1, 12);
  ellipse(ctx, 8, 4, 4, 1.8, (x, y, dx, dy, d) => d > 0.7 ? P.wood3 : P.wood0);
  for (const y of [6, 11]) { px(ctx, 3, y, P.rock2, 10, 1); px(ctx, 3, y + 1, P.rock3, 10, 1); }
  px(ctx, 4, 14, P.wood4, 8, 1);
  autoOutline(ctx, 16, 16, 0.5);
};
TP['t.sack'] = ctx => {
  shadedBlob(ctx, 8, 10, 5.5, 5, [P.sand0, P.sand1, P.sand2, P.sand3], { edge: 0.24 });
  px(ctx, 6, 3, P.sand2, 4, 3); px(ctx, 6, 3, P.sand1, 2, 3);
  px(ctx, 6, 5, P.soil2, 4, 1);
  px(ctx, 5, 9, P.sand3, 1, 4); px(ctx, 10, 9, P.sand3, 1, 4);
  autoOutline(ctx, 16, 16, 0.5);
  ctx.globalAlpha = 0.26; ellipse(ctx, 8, 15, 6, 1.4, '#221a2a'); ctx.globalAlpha = 1;
};
TP['t.hay'] = ctx => {
  shadedBlob(ctx, 8, 9, 7, 6, [P.gold0, P.gold1, P.gold2, P.gold3], { edge: 0.22 });
  for (let i = 0; i < 18; i++) {
    const x = 2 + Math.floor(hash(i, 3, 9) * 12), y = 4 + Math.floor(hash(i, 4, 9) * 10);
    px(ctx, x, y, hash(i, 5, 9) > 0.5 ? P.gold0 : P.gold3);
  }
  px(ctx, 1, 6, P.gold1, 2, 1); px(ctx, 14, 11, P.gold2, 2, 1);
  autoOutline(ctx, 16, 16, 0.5);
};
TP['t.bench'] = ctx => {
  px(ctx, 1, 5, P.wood3, 14, 1);
  px(ctx, 1, 6, P.wood1, 14, 2); px(ctx, 1, 6, P.wood0, 14, 1);
  px(ctx, 1, 8, P.wood3, 14, 1);
  px(ctx, 1, 9, P.wood1, 14, 2); px(ctx, 1, 9, P.wood0, 14, 1);
  px(ctx, 1, 11, P.wood3, 14, 1);
  px(ctx, 2, 12, P.wood2, 2, 3); px(ctx, 12, 12, P.wood2, 2, 3);
  px(ctx, 2, 12, P.wood1, 1, 3); px(ctx, 12, 12, P.wood1, 1, 3);
  ctx.globalAlpha = 0.24; ellipse(ctx, 8, 15, 7, 1.3, '#221a2a'); ctx.globalAlpha = 1;
};
TP['t.planter'] = ctx => {
  px(ctx, 2, 9, P.wood2, 12, 6);
  px(ctx, 2, 9, P.wood1, 12, 2); px(ctx, 2, 9, P.wood0, 12, 1);
  px(ctx, 2, 14, P.wood4, 12, 1); px(ctx, 13, 9, P.wood3, 1, 6);
  for (const [x, c] of [[4, P.bloom1], [7, P.gold1], [10, P.violet1]]) {
    px(ctx, x, 6, P.leaf2, 1, 3);
    px(ctx, x - 1, 5, c, 3, 1); px(ctx, x, 4, c); px(ctx, x, 5, shade(c, -0.25));
    px(ctx, x - 2, 7, P.leaf1, 2, 1); px(ctx, x + 1, 7, P.leaf1, 2, 1);
  }
  autoOutline(ctx, 16, 16, 0.5);
};
TP['t.banner'] = (ctx, w, h, f) => {
  px(ctx, 1, 1, P.wood3, 14, 1); px(ctx, 1, 0, P.wood2, 14, 1);
  const sway = [0, 1, 0][f] || 0;
  for (let y = 2; y < 14; y++) {
    const off = Math.round(Math.sin((y + f * 2) / 3.5) * sway);
    const wdt = 8;
    px(ctx, 4 + off, y, P.roof1, wdt, 1);
    px(ctx, 4 + off, y, P.roof0, 2, 1);
    px(ctx, 10 + off, y, P.roof2, 2, 1);
  }
  // gold chevron
  for (let i = 0; i < 4; i++) {
    const off = Math.round(Math.sin((7 + i + f * 2) / 3.5) * sway);
    px(ctx, 5 + i + off, 6 + i, P.gold1, 2, 1);
    px(ctx, 11 - i + off, 6 + i, P.gold1, 2, 1);
  }
  const offB = Math.round(Math.sin((14 + f * 2) / 3.5) * sway);
  px(ctx, 4 + offB, 14, P.roof3, 3, 1); px(ctx, 9 + offB, 14, P.roof3, 3, 1);
  autoOutline(ctx, 16, 16, 0.5);
};
TP['t.flowerpot'] = ctx => {
  px(ctx, 5, 10, P.roof2, 6, 5); px(ctx, 5, 10, P.roof1, 4, 5); px(ctx, 5, 10, P.roof0, 1, 5);
  px(ctx, 4, 9, P.roof1, 8, 2); px(ctx, 4, 9, P.roof0, 8, 1);
  px(ctx, 7, 6, P.leaf2, 2, 4);
  for (const [x, y] of [[5, 5], [10, 6], [7, 3]]) {
    px(ctx, x, y, P.leaf1, 2, 2); px(ctx, x, y, P.leaf0);
  }
  px(ctx, 7, 2, P.bloom1, 2, 2); px(ctx, 7, 2, P.bloom0); px(ctx, 8, 3, P.bloom2);
  autoOutline(ctx, 16, 16, 0.5);
};
TP['t.laundry'] = (ctx, w, h, f) => {
  px(ctx, 0, 2, P.wood3, 16, 1);
  const cloths = [[1, P.roofB1, 5], [7, P.paper0, 6], [12, P.gold1, 4]];
  for (const [x, c, cw] of cloths) {
    const s = Math.round(Math.sin((x + f * 2.1) / 2.4) * 1.2);
    for (let y = 3; y < 12; y++) {
      const off = Math.round(s * (y - 3) / 9);
      px(ctx, x + off, y, c, cw, 1);
      px(ctx, x + off, y, shade(c, 0.18), 1, 1);
      px(ctx, x + cw - 1 + off, y, shade(c, -0.2), 1, 1);
    }
    px(ctx, x + Math.round(s), 12, shade(c, -0.3), cw, 1);
  }
  autoOutline(ctx, 16, 16, 0.5);
};
TP['t.mailbox'] = ctx => {
  px(ctx, 7, 8, P.wood3, 2, 7); px(ctx, 7, 8, P.wood2, 1, 7);
  panelBox(ctx, 3, 3, 10, 6, [P.roofB0, P.roofB1, P.roofB2, P.roofB3]);
  px(ctx, 4, 4, P.roofB0, 8, 1);
  px(ctx, 4, 6, P.roofB3, 6, 1);
  px(ctx, 12, 2, P.roof1, 1, 4); px(ctx, 12, 2, P.roof0, 1, 1);
  ctx.globalAlpha = 0.26; ellipse(ctx, 8, 15, 4, 1.2, '#221a2a'); ctx.globalAlpha = 1;
};
TP['t.cart'] = ctx => {
  px(ctx, 2, 5, P.wood2, 12, 5);
  px(ctx, 2, 5, P.wood1, 12, 2); px(ctx, 2, 5, P.wood0, 12, 1);
  px(ctx, 2, 9, P.wood4, 12, 1);
  for (const x of [4, 10]) {
    ellipse(ctx, x, 12, 2.8, 2.8, (px_, py, dx, dy, d) => d > 0.72 ? P.wood3 : (d < 0.3 ? P.wood1 : P.wood2));
    px(ctx, x, 12, P.wood4);
  }
  px(ctx, 1, 6, P.gold1, 2, 2); px(ctx, 11, 6, P.leaf1, 2, 2);
  autoOutline(ctx, 16, 16, 0.5);
};
TP['t.anvil'] = ctx => {
  px(ctx, 4, 12, P.wood3, 8, 3); px(ctx, 4, 12, P.wood2, 8, 1);
  px(ctx, 6, 9, P.rock3, 4, 3);
  px(ctx, 2, 5, P.rock2, 12, 4);
  px(ctx, 2, 5, P.rock1, 12, 1); px(ctx, 2, 5, P.rock0, 9, 1);
  px(ctx, 2, 8, P.rock4, 12, 1);
  px(ctx, 0, 6, P.rock2, 3, 2); px(ctx, 0, 6, P.rock1, 3, 1);
  autoOutline(ctx, 16, 16, 0.5);
};
TP['t.loom'] = ctx => {
  px(ctx, 2, 2, P.wood3, 2, 13); px(ctx, 12, 2, P.wood3, 2, 13);
  px(ctx, 2, 2, P.wood2, 1, 13); px(ctx, 12, 2, P.wood2, 1, 13);
  px(ctx, 2, 2, P.wood2, 12, 2); px(ctx, 2, 2, P.wood1, 12, 1);
  for (let x = 4; x < 12; x += 2) px(ctx, x, 4, P.paper1, 1, 8);
  px(ctx, 4, 7, P.bloom1, 8, 1); px(ctx, 4, 9, P.roofB1, 8, 1);
  px(ctx, 3, 12, P.wood2, 10, 2); px(ctx, 3, 12, P.wood1, 10, 1);
  autoOutline(ctx, 16, 16, 0.5);
};
TP['t.beehive'] = (ctx, w, h, f) => {
  for (let i = 0; i < 4; i++) {
    const y = 3 + i * 3, wd = 8 + i;
    px(ctx, 8 - (wd >> 1), y, P.gold2, wd, 3);
    px(ctx, 8 - (wd >> 1), y, P.gold1, wd, 1);
    px(ctx, 8 - (wd >> 1), y, P.gold0, 2, 1);
    px(ctx, 8 + (wd >> 1) - 1, y + 1, P.gold3, 1, 2);
  }
  px(ctx, 7, 12, P.gold3, 3, 2);
  const bx = f ? 3 : 12, by = f ? 4 : 7;
  px(ctx, bx, by, P.ink, 2, 1); px(ctx, bx, by - 1, P.spark1, 1, 1);
  autoOutline(ctx, 16, 16, 0.5);
};
TP['t.scarecrow'] = ctx => {
  px(ctx, 7, 6, P.wood3, 2, 9);
  px(ctx, 2, 8, P.wood3, 12, 1); px(ctx, 2, 7, P.wood2, 12, 1);
  // shirt
  px(ctx, 4, 8, P.roofB1, 8, 5); px(ctx, 4, 8, P.roofB0, 8, 1); px(ctx, 4, 12, P.roofB2, 8, 1);
  px(ctx, 3, 12, P.gold1, 2, 2); px(ctx, 11, 12, P.gold1, 2, 2);
  // head
  shadedBlob(ctx, 8, 4, 3.6, 3.4, [P.sand0, P.sand1, P.sand2, P.sand3], { edge: 0.22 });
  px(ctx, 6, 3, P.ink2); px(ctx, 9, 3, P.ink2);
  px(ctx, 7, 5, P.ink3, 2, 1);
  // hat
  px(ctx, 4, 1, P.gold2, 8, 1); px(ctx, 5, 0, P.gold1, 6, 1);
  autoOutline(ctx, 16, 16, 0.5);
};

// ---- interiors ---------------------------------------------------------
TP['t.floor.wood'] = ctx => AT.floor.body(ctx);
TP['t.floor.wood.a'] = ctx => {
  AT.floor.body(ctx);
  for (let x = 0; x < 16; x++) if (hash(x, 2, 161) > 0.7) px(ctx, x, 6, mix(P.wood1, P.wood2, 0.35));
  px(ctx, 3, 9, P.wood2, 2, 1);
};
TP['t.floor.tile'] = ctx => {
  px(ctx, 0, 0, P.plaster2, 16, 16);
  for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) {
    const x = c * 8, y = r * 8, light = (r + c) % 2 === 0;
    px(ctx, x, y, light ? P.plaster1 : P.plaster2, 7, 7);
    px(ctx, x, y, light ? P.plaster0 : P.plaster1, 7, 1);
    px(ctx, x, y, light ? P.plaster0 : P.plaster1, 1, 7);
    px(ctx, x + 6, y + 1, P.plaster3, 1, 6);
    px(ctx, x + 1, y + 6, P.plaster3, 6, 1);
  }
};
TP['t.floor.rug'] = ctx => {
  px(ctx, 0, 0, P.roof2, 16, 16);
  px(ctx, 1, 1, P.roof1, 14, 14);
  px(ctx, 1, 1, P.roof0, 14, 1); px(ctx, 1, 1, P.roof0, 1, 14);
  px(ctx, 3, 3, P.gold2, 10, 10);
  px(ctx, 4, 4, P.paper1, 8, 8);
  px(ctx, 6, 6, P.roof1, 4, 4); px(ctx, 7, 7, P.gold1, 2, 2);
  px(ctx, 0, 15, P.roof3, 16, 1); px(ctx, 15, 0, P.roof3, 1, 16);
};
TP['t.iwall.plaster'] = ctx => {
  px(ctx, 0, 0, P.plaster1, 16, 16);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    if (hash(x, y, 171) > 0.94) px(ctx, x, y, P.plaster0);
    else if (hash(x, y, 173) > 0.96) px(ctx, x, y, P.plaster2);
  }
  px(ctx, 0, 0, P.plaster0, 16, 1);
  px(ctx, 0, 15, P.plaster2, 16, 1);
};
TP['t.iwall.plank'] = ctx => {
  const base = mix(P.wood2, P.ink, 0.30);
  const seam = mix(P.wood3, P.ink, 0.36);
  const glint = mix(P.wood1, P.ink2, 0.20);
  px(ctx, 0, 0, base, 16, 16);
  for (let y = 0; y < 16; y += 4) {
    px(ctx, 0, y, glint, 16, 1);
    px(ctx, 0, y + 3, seam, 16, 1);
  }
  for (let y = 0; y < 16; y++) if (hash(y, 4, 181) > 0.86) px(ctx, (y * 5) % 15, y, P.wood4);
};
TP['t.iwall.top'] = ctx => {
  px(ctx, 0, 0, P.wood3, 16, 5);
  px(ctx, 0, 0, P.wood2, 16, 2); px(ctx, 0, 0, P.wood1, 16, 1);
  px(ctx, 0, 4, P.wood4, 16, 1);
  const base = mix(P.wood2, P.ink, 0.28);
  px(ctx, 0, 5, base, 16, 11);
  for (let y = 5; y < 16; y += 4) {
    px(ctx, 0, y, mix(P.wood1, P.ink2, 0.20), 16, 1);
    px(ctx, 0, Math.min(15, y + 3), mix(P.wood3, P.ink, 0.35), 16, 1);
  }
};
TP['t.iwall.window'] = ctx => {
  TP['t.iwall.plank'](ctx);
  panelBox(ctx, 2, 3, 12, 10, [P.wood0, P.wood1, P.wood2, P.wood4]);
  px(ctx, 3, 4, GLASS[1], 10, 8);
  px(ctx, 3, 4, GLASS[0], 10, 2);
  px(ctx, 3, 9, GLASS[2], 10, 3);
  px(ctx, 7, 4, P.wood2, 2, 8); px(ctx, 3, 7, P.wood2, 10, 1);
  px(ctx, 1, 12, P.wood2, 14, 2); px(ctx, 1, 12, P.wood1, 14, 1);
};
TP['t.door.wood'] = ctx => {
  px(ctx, 0, 0, P.plaster2, 16, 16);
  px(ctx, 1, 1, P.wood4, 14, 15);
  px(ctx, 2, 2, P.wood2, 12, 14);
  px(ctx, 2, 2, P.wood1, 12, 1);
  for (let x = 3; x < 14; x += 4) px(ctx, x, 3, P.wood3, 1, 13);
  px(ctx, 4, 4, P.wood1, 8, 5); px(ctx, 4, 4, P.wood0, 8, 1);
  px(ctx, 4, 10, P.wood1, 8, 5); px(ctx, 4, 10, P.wood0, 8, 1);
  px(ctx, 11, 8, P.gold2, 2, 2); px(ctx, 11, 8, P.gold0);
  px(ctx, 1, 0, P.wood3, 14, 1);
};
TP['t.door.open'] = ctx => {
  px(ctx, 0, 0, P.plaster2, 16, 16);
  px(ctx, 1, 1, P.wood4, 14, 15);
  px(ctx, 2, 2, '#241c26', 12, 14);
  px(ctx, 3, 3, '#1a141f', 10, 13);
  px(ctx, 2, 2, P.wood3, 3, 14);
  px(ctx, 2, 2, P.wood2, 1, 14);
  px(ctx, 4, 8, P.gold2);
  px(ctx, 1, 0, P.wood3, 14, 1);
};
TP['t.door.arch'] = ctx => {
  px(ctx, 0, 0, P.plaster2, 16, 16);
  px(ctx, 2, 4, P.rock3, 12, 12);
  px(ctx, 3, 5, '#241c26', 10, 11);
  ellipse(ctx, 8, 6, 5.6, 4, (x, y, dx, dy, d) => (dy > 0 ? null : (d > 0.72 ? P.rock2 : P.rock1)));
  ellipse(ctx, 8, 6, 4.4, 3, (x, y, dx, dy, d) => (dy > 0 ? null : '#241c26'));
  px(ctx, 2, 4, P.rock1, 12, 1);
  px(ctx, 2, 4, P.rock2, 1, 12); px(ctx, 13, 4, P.rock4, 1, 12);
};
TP['t.stairs.in'] = ctx => {
  px(ctx, 0, 0, P.wood2, 16, 16);
  for (let s = 0; s < 4; s++) {
    const y = s * 4;
    px(ctx, 1, y, P.wood0, 14, 1);
    px(ctx, 1, y + 1, P.wood1, 14, 2);
    px(ctx, 1, y + 3, P.wood3, 14, 1);
  }
  px(ctx, 0, 0, P.wood3, 1, 16); px(ctx, 15, 0, P.wood4, 1, 16);
};
TP['t.table'] = ctx => {
  px(ctx, 1, 3, P.wood1, 14, 8);
  px(ctx, 1, 3, P.wood0, 14, 2);
  px(ctx, 1, 10, P.wood3, 14, 1);
  px(ctx, 1, 11, P.wood2, 14, 1);
  px(ctx, 2, 12, P.wood3, 2, 3); px(ctx, 12, 12, P.wood3, 2, 3);
  autoOutline(ctx, 16, 16, 0.5);
};
TP['t.table.set'] = ctx => {
  TP['t.table'](ctx);
  ellipse(ctx, 5, 6, 2.6, 1.8, (x, y, dx, dy, d) => d > 0.72 ? P.plaster3 : P.plaster0);
  ellipse(ctx, 11, 7, 2.2, 1.5, (x, y, dx, dy, d) => d > 0.72 ? P.plaster3 : P.plaster0);
  px(ctx, 4, 5, P.ember2, 3, 1); px(ctx, 4, 5, P.ember1, 1, 1);
  px(ctx, 10, 6, P.leaf1, 2, 1);
  px(ctx, 7, 4, P.water1, 2, 3); px(ctx, 7, 4, P.water0, 1, 3);
};
function chair(ctx, dir) {
  const seatY = 7;
  px(ctx, 4, seatY, P.wood2, 8, 4);
  px(ctx, 4, seatY, P.wood1, 8, 2);
  px(ctx, 4, seatY, P.wood0, 8, 1);
  px(ctx, 4, seatY + 3, P.wood4, 8, 1);
  px(ctx, 4, 12, P.wood3, 2, 3); px(ctx, 10, 12, P.wood3, 2, 3);
  if (dir === 'u') { px(ctx, 4, 2, P.wood2, 8, 5); px(ctx, 4, 2, P.wood1, 8, 1); px(ctx, 5, 3, P.wood3, 6, 3); }
  if (dir === 'd') { px(ctx, 4, 11, P.wood3, 8, 4); px(ctx, 4, 11, P.wood2, 8, 1); }
  if (dir === 'l') { px(ctx, 2, 3, P.wood2, 3, 9); px(ctx, 2, 3, P.wood1, 1, 9); }
  if (dir === 'r') { px(ctx, 11, 3, P.wood2, 3, 9); px(ctx, 13, 3, P.wood4, 1, 9); }
  autoOutline(ctx, 16, 16, 0.5);
}
TP['t.chair.l'] = ctx => chair(ctx, 'l');
TP['t.chair.r'] = ctx => chair(ctx, 'r');
TP['t.chair.u'] = ctx => chair(ctx, 'u');
TP['t.chair.d'] = ctx => chair(ctx, 'd');
TP['t.bed.head'] = ctx => {
  px(ctx, 1, 0, P.wood3, 14, 4); px(ctx, 1, 0, P.wood2, 14, 2); px(ctx, 1, 0, P.wood1, 14, 1);
  px(ctx, 2, 4, P.paper0, 12, 6);
  px(ctx, 2, 4, P.white, 12, 2);
  px(ctx, 2, 9, P.paper2, 12, 1);
  px(ctx, 2, 10, P.roofB1, 12, 6);
  px(ctx, 2, 10, P.roofB0, 12, 1);
  px(ctx, 1, 4, P.wood3, 1, 12); px(ctx, 14, 4, P.wood4, 1, 12);
};
TP['t.bed.foot'] = ctx => {
  px(ctx, 2, 0, P.roofB1, 12, 12);
  px(ctx, 2, 0, P.roofB0, 12, 1);
  px(ctx, 2, 5, P.roofB2, 12, 1);
  px(ctx, 1, 0, P.wood3, 1, 13); px(ctx, 14, 0, P.wood4, 1, 13);
  px(ctx, 1, 12, P.wood3, 14, 3); px(ctx, 1, 12, P.wood2, 14, 1);
  px(ctx, 4, 2, P.roofB0, 3, 1); px(ctx, 9, 8, P.roofB0, 3, 1);
};
TP['t.shelf'] = ctx => {
  px(ctx, 1, 1, P.wood3, 14, 14);
  px(ctx, 2, 2, P.wood2, 12, 12);
  for (const y of [6, 10]) { px(ctx, 2, y, P.wood1, 12, 1); px(ctx, 2, y + 1, P.wood4, 12, 1); }
  px(ctx, 1, 1, P.wood2, 14, 1); px(ctx, 1, 1, P.wood2, 1, 14);
};
TP['t.shelf.books'] = ctx => {
  TP['t.shelf'](ctx);
  const cols = [P.roof1, P.roofB1, P.leaf2, P.gold2, P.violet2, P.bloom2];
  for (let s = 0; s < 2; s++) {
    let x = 3;
    for (let i = 0; i < 5; i++) {
      const w = 1 + (i % 2);
      const c = cols[(i + s * 3) % cols.length];
      px(ctx, x, 3 + s * 4, c, w, 3);
      px(ctx, x, 3 + s * 4, shade(c, 0.22), 1, 3);
      x += w + 1;
      if (x > 12) break;
    }
  }
};
TP['t.counter'] = ctx => {
  px(ctx, 0, 3, P.wood1, 16, 3);
  px(ctx, 0, 3, P.wood0, 16, 1);
  px(ctx, 0, 6, P.wood3, 16, 1);
  px(ctx, 0, 7, P.wood2, 16, 9);
  for (let x = 0; x < 16; x += 4) px(ctx, x, 7, P.wood3, 1, 9);
  px(ctx, 0, 15, P.wood4, 16, 1);
};
TP['t.stove'] = ctx => {
  panelBox(ctx, 1, 3, 14, 12, [P.rock1, P.rock2, P.rock3, P.rock4]);
  px(ctx, 3, 8, P.ink, 6, 5);
  px(ctx, 4, 9, P.ember3, 4, 3); px(ctx, 4, 11, P.ember2, 4, 1);
  px(ctx, 10, 8, P.rock3, 3, 4); px(ctx, 10, 8, P.rock2, 3, 1);
  px(ctx, 2, 4, P.rock0, 12, 1);
  ellipse(ctx, 5, 5, 2, 1.2, P.rock3); ellipse(ctx, 11, 5, 2, 1.2, P.rock3);
};
TP['t.pot'] = ctx => {
  shadedBlob(ctx, 8, 9, 5.5, 5, [P.rock1, P.rock2, P.rock3, P.rock4], { edge: 0.24 });
  px(ctx, 3, 6, P.rock2, 10, 1); px(ctx, 3, 5, P.rock1, 10, 1);
  px(ctx, 2, 5, P.rock3, 2, 1); px(ctx, 12, 5, P.rock3, 2, 1);
  px(ctx, 5, 3, P.plaster1, 2, 2); px(ctx, 9, 2, P.plaster0, 2, 2);
  autoOutline(ctx, 16, 16, 0.5);
};
TP['t.hearth.lit'] = (ctx, w, h, f) => {
  hearthShell(ctx);
  const t = [0, 1, 2][f] || 0;
  // flame
  ellipse(ctx, 8, 11 - t * 0.3, 3.6, 3.4 + t * 0.3, (x, y, dx, dy, d) =>
    d > 0.85 ? P.ember3 : (d > 0.5 ? P.ember2 : P.ember1));
  ellipse(ctx, 8, 11, 1.8, 2.2 + t * 0.4, (x, y, dx, dy, d) => d > 0.7 ? P.ember0 : P.spark0);
  px(ctx, 8, 6 - t, P.ember1); px(ctx, 7 + (t % 2), 5 - t, P.ember0);
  px(ctx, 4, 13, P.wood3, 8, 2); px(ctx, 5, 13, P.wood2, 2, 1); px(ctx, 9, 14, P.wood2, 2, 1);
  ctx.globalAlpha = 0.16 + t * 0.03; ellipse(ctx, 8, 10, 9, 8, P.ember0); ctx.globalAlpha = 1;
};
TP['t.hearth.cold'] = ctx => {
  hearthShell(ctx);
  px(ctx, 4, 12, P.rock3, 8, 3);
  px(ctx, 5, 12, P.wood4, 2, 1); px(ctx, 9, 13, P.wood4, 2, 1);
  px(ctx, 6, 11, P.rock2, 2, 1);
};
function hearthShell(ctx) {
  px(ctx, 0, 0, P.rock2, 16, 16);
  for (let r = 0; r < 4; r++) for (let x = (r % 2 ? -2 : 0); x < 16; x += 5) {
    px(ctx, x, r * 4, P.rock1, 4, 3);
    px(ctx, x, r * 4, P.rock0, 4, 1);
    px(ctx, x + 3, r * 4, P.rock3, 1, 3);
  }
  px(ctx, 2, 5, P.rock4, 12, 11);
  px(ctx, 3, 6, '#1b1524', 10, 10);
  px(ctx, 1, 3, P.rock3, 14, 2); px(ctx, 1, 3, P.rock1, 14, 1);
}
TP['t.cabinet'] = ctx => {
  panelBox(ctx, 1, 2, 14, 13, [P.wood0, P.wood1, P.wood2, P.wood4]);
  px(ctx, 3, 4, P.wood2, 4, 4); px(ctx, 9, 4, P.wood2, 4, 4);
  px(ctx, 3, 4, P.wood3, 4, 1); px(ctx, 9, 4, P.wood3, 4, 1);
  px(ctx, 3, 10, P.wood2, 10, 3); px(ctx, 3, 10, P.wood3, 10, 1);
  px(ctx, 6, 6, P.gold2); px(ctx, 9, 6, P.gold2); px(ctx, 7, 11, P.gold2, 2, 1);
};
TP['t.plant.pot'] = ctx => {
  px(ctx, 5, 11, P.roof2, 6, 4); px(ctx, 5, 11, P.roof1, 4, 4); px(ctx, 5, 11, P.roof0, 1, 4);
  px(ctx, 4, 10, P.roof1, 8, 2); px(ctx, 4, 10, P.roof0, 8, 1);
  px(ctx, 7, 6, P.leaf3, 2, 5);
  for (const [x, y, r] of [[5, 5, 3], [11, 6, 2.6], [8, 3, 3]]) {
    shadedBlob(ctx, x, y, r, r * 0.85, LF, { edge: 0.2 });
  }
  autoOutline(ctx, 16, 16, 0.5);
};
TP['t.painting'] = ctx => {
  panelBox(ctx, 1, 3, 14, 10, [P.gold0, P.gold1, P.gold2, P.gold3]);
  px(ctx, 3, 5, P.water1, 10, 6);
  px(ctx, 3, 8, P.leaf2, 10, 3);
  px(ctx, 3, 5, P.water0, 10, 1);
  px(ctx, 5, 6, P.paper0, 2, 1); px(ctx, 9, 5, P.paper0, 3, 1);
  px(ctx, 6, 9, P.leaf1, 3, 1); px(ctx, 10, 10, P.leaf3, 2, 1);
};
TP['t.clock'] = ctx => {
  ellipse(ctx, 8, 7, 5.5, 5.5, (x, y, dx, dy, d) => d > 0.86 ? P.wood3 : (d > 0.7 ? P.wood2 : P.paper0));
  px(ctx, 8, 7, P.ink2); px(ctx, 8, 4, P.ink3, 1, 3); px(ctx, 8, 7, P.ink3, 3, 1);
  px(ctx, 7, 12, P.wood3, 3, 3);
  px(ctx, 6, 14, P.wood2, 5, 1);
  autoOutline(ctx, 16, 16, 0.5);
};
TP['t.basket'] = ctx => {
  px(ctx, 3, 7, P.gold2, 10, 7);
  px(ctx, 3, 7, P.gold1, 10, 2);
  for (let y = 7; y < 14; y += 2) px(ctx, 3, y, P.gold3, 10, 1);
  for (let x = 4; x < 13; x += 3) px(ctx, x, 8, P.gold3, 1, 6);
  px(ctx, 3, 13, P.gold3, 10, 1);
  px(ctx, 4, 4, P.gold2, 1, 3); px(ctx, 11, 4, P.gold2, 1, 3); px(ctx, 5, 3, P.gold1, 6, 1);
  px(ctx, 5, 6, P.roof1, 3, 2); px(ctx, 8, 5, P.gold1, 3, 2);
  autoOutline(ctx, 16, 16, 0.5);
};
TP['t.chest'] = ctx => {
  px(ctx, 2, 8, P.wood2, 12, 7);
  px(ctx, 2, 8, P.wood1, 12, 1);
  px(ctx, 2, 14, P.wood4, 12, 1);
  ellipse(ctx, 8, 8, 6.2, 4.2, (x, y, dx, dy, d) => dy > 0 ? null : (d > 0.78 ? P.wood3 : (dx + dy < -0.3 ? P.wood0 : P.wood1)));
  px(ctx, 2, 7, P.wood3, 12, 1);
  px(ctx, 7, 4, P.gold2, 2, 11); px(ctx, 7, 4, P.gold1, 1, 11);
  px(ctx, 6, 9, P.gold1, 4, 3); px(ctx, 7, 10, P.gold3, 2, 1);
  autoOutline(ctx, 16, 16, 0.5);
};

// ---- village ground finishing -----------------------------------------
TP['t.plaza'] = ctx => {
  px(ctx, 0, 0, P.sand1, 16, 16);
  for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) {
    const x = c * 8, y = r * 8;
    px(ctx, x, y, (r + c) % 2 ? P.sand1 : P.sand0, 7, 7);
    px(ctx, x, y, mix(P.sand0, '#fff', 0.3), 7, 1);
    px(ctx, x + 6, y + 1, P.sand2, 1, 6);
    px(ctx, x + 1, y + 6, P.sand2, 6, 1);
    for (let i = 0; i < 3; i++) {
      const ox = 1 + Math.floor(hash(i, r * 2 + c, 201) * 5);
      const oy = 1 + Math.floor(hash(i, r * 2 + c, 202) * 5);
      px(ctx, x + ox, y + oy, mix(P.sand1, P.sand2, 0.4));
    }
  }
};
TP['t.plaza.edge'] = ctx => {
  TP['t.plaza'](ctx);
  px(ctx, 0, 13, P.sand2, 16, 1);
  px(ctx, 0, 14, P.sand3, 16, 2);
  for (let x = 0; x < 16; x += 4) px(ctx, x, 14, P.sand2, 1, 2);
};
TP['t.cobble'] = ctx => {
  // Warm stone, not cold grey, and only one step of value between the mortar and the
  // stones. A near-white stone on a dark base reads as static, and cold grey fights
  // the sand plaza it sits beside.
  const mortar = mix(P.rock2, P.sand3, 0.55);
  const stone = mix(P.rock1, P.sand2, 0.55);
  const lit = mix(P.rock0, P.sand1, 0.5);
  px(ctx, 0, 0, mortar, 16, 16);
  for (let r = 0; r < 4; r++) {
    const y = r * 4, off = r % 2 ? -2 : 0;
    for (let x = off; x < 16; x += 5) {
      ellipse(ctx, x + 2, y + 1.5, 2.4, 1.8, (px_, py, dx, dy, d) =>
        d > 0.85 ? mortar : (dx + dy < -0.3 ? lit : stone));
    }
  }
};
TP['t.gravel'] = ctx => {
  // The outermost village finish. It sits directly against grass, so it stays quiet.
  px(ctx, 0, 0, mix(P.sand2, P.rock1, 0.35), 16, 16);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const n = hash(x, y, 211);
    if (n > 0.92) px(ctx, x, y, P.sand1);
    else if (n < 0.16) px(ctx, x, y, P.rock2);
  }
  for (const [x, y] of [[3, 4], [10, 9], [6, 13]]) { px(ctx, x, y, P.rock0, 2, 1); px(ctx, x, y + 1, P.rock3, 2, 1); }
};

// ===========================================================================
// Fine pixel painters. Terrain still occupies one 16px world cell, but the art
// is drawn at twice that density. Connected colour clusters carry the material:
// blades and clover in meadows, worn stone in streets, grain in warm oak floors.
// There is deliberately no per-frame noise or canvas smoothing here.
// ===========================================================================
const HD = {};
const MEADOW = ['#a9bc65', '#91ad55', '#79964b', '#6c8941', '#567438', '#36552d'];
const OAK = ['#c1975c', '#ac7b46', '#906039', '#734b2e', '#543823', '#33291e'];

function grassHD(ctx, variant = 0) {
  px(ctx, 0, 0, '#759448', 32, 32);
  // Low contrast islands cross both tile edges, so adjacent cells stay seamless.
  for (let i = 0; i < 12; i++) {
    const x = (i * 13 + variant * 7) % 32, y = (i * 7 + variant * 11) % 32;
    const col = i % 3 === 0 ? '#708e44' : '#79974b';
    for (const ox of [-32, 0, 32]) for (const oy of [-32, 0, 32]) {
      px(ctx, x + ox, y + oy, col, 6, 2);
      px(ctx, x + ox + 1, y + oy - 1, col, 3, 4);
    }
  }
  for (let i = 0; i < 25; i++) {
    const x = 1 + Math.floor(hash(i, variant, 712) * 29);
    const y = 2 + Math.floor(hash(i, variant, 715) * 28);
    const bright = i % 4 === 0;
    px(ctx, x, y, bright ? '#849f50' : '#68883f', 2, 1);
    if (i % 3 === 0) {
      px(ctx, x, y - 1, bright ? '#91aa56' : '#7e9d4b');
      px(ctx, x + 2, y - 2, '#86a250');
      px(ctx, x + 2, y - 1, '#739144');
    }
  }
  // Tiny clover pairs are softer than isolated bright pixels.
  for (let i = 0; i < 3; i++) {
    const x = 3 + (i * 11 + variant * 5) % 25, y = 5 + (i * 7 + variant * 9) % 23;
    px(ctx, x, y, '#6c873f', 4, 1);
    px(ctx, x, y - 1, '#809b4d', 2, 1);
    px(ctx, x + 2, y - 2, '#8aa553', 2, 1);
  }
}

function grassClumpHD(ctx, x, y, height = 9, lean = 0, golden = false) {
  const ramp = golden ? ['#bac777', '#96b258', '#759145', '#496931'] : MEADOW;
  for (const [off, heightDelta, tilt] of [[-4, -4, -2], [-1, 0, lean], [2, -2, 2], [5, -5, 3]]) {
    const h = Math.max(3, height + heightDelta);
    for (let j = 0; j < h; j++) {
      const bx = x + off + Math.round((tilt + lean) * j / h);
      px(ctx, bx, y - j, j > h - 3 ? ramp[0] : ramp[2], j === h - 1 ? 1 : 2, 1);
      if (j < h - 3) px(ctx, bx + 1, y - j, ramp[3]);
    }
  }
}

function flowerHD(ctx, x, y, petals = '#f1eac0', center = '#d7a446', size = 1) {
  px(ctx, x, y, '#476a35', 1, 5);
  px(ctx, x - 2, y + 2, '#85a651', 2, 1);
  px(ctx, x + 1, y + 1, '#698c43', 2, 1);
  px(ctx, x - size, y - size, petals, size, size);
  px(ctx, x + 1, y - size, petals, size, size);
  px(ctx, x - size, y + 1, shade(petals, -0.14), size, size);
  px(ctx, x + 1, y + 1, shade(petals, -0.14), size, size);
  px(ctx, x, y, center);
}

for (const [i, suffix] of ['', '.a', '.b', '.c'].entries()) HD[`t.grass${suffix}`] = ctx => grassHD(ctx, i);
HD['t.grass.tuft'] = ctx => {
  grassHD(ctx, 1);
  grassClumpHD(ctx, 12, 25, 9, -1);
  grassClumpHD(ctx, 23, 17, 6, 1, true);
};
HD['t.grass.flower'] = ctx => {
  grassHD(ctx, 2);
  for (const [x, y] of [[7, 12], [12, 9], [22, 23], [25, 18]]) flowerHD(ctx, x, y);
  flowerHD(ctx, 15, 26, '#e3c96b', '#8c7132');
};
HD['t.grass.flower2'] = ctx => {
  grassHD(ctx, 3);
  for (const [x, y, color] of [[8, 18, '#e9b3a0'], [12, 13, '#dfb8a9'], [23, 10, '#d8bfdc'], [24, 25, '#dba2a0']]) flowerHD(ctx, x, y, color, '#c99159');
};
HD['t.grass.pebble'] = ctx => {
  grassHD(ctx);
  for (const [x, y, r] of [[9, 16, 4], [23, 22, 3], [25, 8, 2]]) {
    ellipse(ctx, x + 1, y + 2, r + 1, r * .65, '#5c713b');
    shadedBlob(ctx, x, y, r, r * .65, ['#c0bc8d', '#a2a47e', '#808764', '#5c6c4e'], { noRim: true });
    px(ctx, x - 1, y - 1, '#d4c79c', 2, 1);
  }
};
HD['t.tallgrass'] = (ctx, w, h, frame) => {
  grassHD(ctx, 2);
  for (const [y, off] of [[13, 0], [23, 3], [31, -1]]) {
    for (let x = -2; x < 35; x += 7) {
      const high = 8 + Math.floor(hash(x, y, 771) * 5);
      grassClumpHD(ctx, x + off, y, high, frame ? 1 : 0, y === 13);
    }
  }
};
HD['t.leaves'] = ctx => {
  grassHD(ctx, 2);
  for (let i = 0; i < 16; i++) {
    const x = 2 + (i * 13) % 27, y = 2 + (i * 9) % 27;
    px(ctx, x, y, ['#b5994e', '#957943', '#d1a958', '#8b8145'][i % 4], 3, 1);
    px(ctx, x + 1, y - 1, '#b79d53', 2, 1);
  }
};

function pathHD(ctx, mask = 15, forest = false) {
  const earth = '#b89a60';
  px(ctx, 0, 0, earth, 32, 32);
  for (let i = 0; i < 19; i++) {
    const x = (i * 13 + 3) % 32, y = (i * 7 + 1) % 32;
    px(ctx, x, y, i % 3 ? '#bea16a' : '#b29459', 3 + i % 4, 1);
    if (i % 4 === 0) px(ctx, x + 1, y + 1, '#c5a972', 2, 1);
  }
  for (const [x, y, r] of [[8, 12, 3], [24, 25, 2]]) {
    ellipse(ctx, x + 1, y + 1, r, 1.8, '#9d814f');
    ellipse(ctx, x, y, r, 1.7, '#d3bd89');
    px(ctx, x - 1, y - 1, '#e1cfa1', 2, 1);
  }
  const edge = (vertical, end, side) => {
    for (let i = 0; i < 32; i++) {
      // Broad scallops, not independent noisy teeth. Corners stay grass-covered.
      const wave = [1, 1, 2, 2, 3, 3, 2, 1][Math.floor(i / 2) % 8];
      const depth = wave + (forest ? 2 : 0);
      for (let d = 0; d <= depth + 1; d++) {
        const x = vertical ? (end ? 31 - d : d) : i;
        const y = vertical ? i : (end ? 31 - d : d);
        px(ctx, x, y, d < depth ? '#759448' : d === depth ? '#5e7b38' : '#a1834d');
      }
      if (i % 7 === side) {
        const x = vertical ? (end ? 31 - depth : depth) : i;
        const y = vertical ? i : (end ? 31 - depth : depth);
        px(ctx, x, y - 1, '#99af59');
      }
    }
  };
  if (!(mask & 1)) edge(false, false, 0);
  if (!(mask & 4)) edge(false, true, 2);
  if (!(mask & 8)) edge(true, false, 4);
  if (!(mask & 2)) edge(true, true, 1);
}

function pavingHD(ctx, cobble = false) {
  px(ctx, 0, 0, cobble ? '#797958' : '#9c8758', 32, 32);
  const height = cobble ? 7 : 10, width = cobble ? 10 : 14;
  for (let row = -1; row < 5; row++) {
    const y = row * height + 1;
    for (let x = row % 2 ? -width / 2 : 0; x < 32; x += width) {
      const ramp = cobble ? ['#aaa684', '#96987a', '#838667', '#6d7358'] : ['#c8b382', '#bba574', '#aa9465', '#8b8055'];
      const toneIndex = hash(x, y, 712) > .5 ? 1 : 2;
      px(ctx, x + 1, y, ramp[toneIndex], width - 2, height - 1);
      px(ctx, x + 2, y, ramp[0], width - 4, 1);
      px(ctx, x + 1, y + 1, ramp[0], 1, height - 3);
      px(ctx, x + width - 2, y + 2, ramp[3], 1, height - 3);
      px(ctx, x + 2, y + height - 2, ramp[3], width - 4, 1);
      if (row % 2) px(ctx, x + 5, y + 3, ramp[2], 3, 1);
    }
  }
  // Small moss in joins reinforces warm, timeworn village stone.
  for (const [x, y] of [[1, 10], [19, 20], [13, 30]]) {
    px(ctx, x, y, '#84914c', 3, 1); px(ctx, x + 1, y + 1, '#657c41');
  }
}
HD['t.plaza'] = ctx => pavingHD(ctx);
HD['t.cobble'] = ctx => pavingHD(ctx, true);
HD['t.plaza.edge'] = ctx => { pavingHD(ctx); px(ctx, 0, 29, '#a68d59', 32, 1); px(ctx, 0, 30, '#796d47', 32, 2); };

function floorHD(ctx, variant = 0) {
  px(ctx, 0, 0, '#63472f', 32, 32);
  for (let row = 0; row < 4; row++) {
    const y = row * 8, joint = (row % 2 ? 23 : 9);
    px(ctx, 0, y, row % 2 ? '#947047' : '#9b754a', 32, 7);
    px(ctx, 0, y, '#af8856', 32, 1);
    px(ctx, 0, y + 6, '#805b39', 32, 1);
    px(ctx, joint, y + 1, '#62442c', 1, 6);
    px(ctx, joint + 1, y + 1, '#a17d50', 1, 6);
    const gx = (row * 7 + variant * 11 + 3) % 22;
    px(ctx, gx, y + 3, '#a48051', 8, 1);
    px(ctx, gx + 2, y + 4, '#8c653f', 9, 1);
    px(ctx, gx + 5, y + 3, '#88613c', 3, 1);
    px(ctx, joint - 2, y + 2, '#624b32'); px(ctx, joint + 3, y + 5, '#695037');
  }
}
HD['t.floor.wood'] = ctx => floorHD(ctx);
HD['t.floor.wood.a'] = ctx => floorHD(ctx, 1);
HD['t.floor.rug'] = ctx => {
  // Adjacent authored rug cells form one carpet rather than framed placemats.
  px(ctx, 0, 0, '#8f6048', 32, 32);
  for (let y = 0; y < 32; y += 2) px(ctx, 0, y, '#95684d', 32, 1);
  for (let y = -16; y < 48; y += 16) for (let x = -16; x < 48; x += 16) {
    const cx = x + 8, cy = y + 8;
    for (let j = -7; j <= 7; j++) {
      const half = 7 - Math.abs(j);
      px(ctx, cx - half, cy + j, '#b0855b');
      px(ctx, cx + half, cy + j, '#b0855b');
    }
    px(ctx, cx - 1, cy - 1, '#bb9365', 3, 3);
    px(ctx, cx, cy, '#d1ac7b');
  }
};

function wallHD(ctx, top = false) {
  px(ctx, 0, 0, '#674b34', 32, 32);
  for (let y = 0; y < 32; y += 8) {
    px(ctx, 0, y, '#8b6640', 32, 1);
    px(ctx, 0, y + 1, '#775437', 32, 5);
    px(ctx, 0, y + 6, '#58422e', 32, 2);
    px(ctx, 5 + (y % 7), y + 3, '#7f5b38', 11, 1);
    px(ctx, 16 + (y % 5), y + 4, '#5f442d', 6, 1);
  }
  if (top) {
    px(ctx, 0, 0, '#ab8050', 32, 2); px(ctx, 0, 2, '#745033', 32, 5);
    px(ctx, 0, 7, '#392f24', 32, 3); px(ctx, 0, 10, '#56402c', 32, 2);
  }
}
HD['t.iwall.plank'] = ctx => wallHD(ctx);
HD['t.iwall.top'] = ctx => wallHD(ctx, true);
HD['t.iwall.window'] = ctx => {
  wallHD(ctx);
  panelBox(ctx, 3, 4, 26, 23, OAK);
  px(ctx, 6, 7, '#5e8d8b', 20, 16);
  px(ctx, 6, 7, '#aad1bf', 20, 3);
  px(ctx, 6, 10, '#80b1a6', 20, 4);
  px(ctx, 6, 17, '#477775', 20, 6);
  // Leaf silhouettes outside and angled reflected daylight on the glass.
  px(ctx, 8, 19, '#477752', 5, 4); px(ctx, 10, 16, '#678e5a', 3, 4);
  px(ctx, 21, 15, '#678d59', 5, 8);
  for (let i = 0; i < 5; i++) px(ctx, 8 + i, 13 - i, '#c0d9c7');
  px(ctx, 15, 7, '#61432e', 2, 16); px(ctx, 6, 15, '#61432e', 20, 2);
  px(ctx, 15, 7, '#b68c58', 1, 16); px(ctx, 6, 15, '#ae8250', 20, 1);
  px(ctx, 2, 25, '#b88c55', 28, 2); px(ctx, 2, 27, '#4c3928', 28, 2);
};

function fencePostHD(ctx, x = 13, y = 4) {
  px(ctx, x - 2, 28, '#465532', 9, 3);
  px(ctx, x, y + 1, '#4e3b26', 7, 25 - y);
  px(ctx, x, y, '#a98246', 5, 24 - y);
  px(ctx, x, y, '#d1b174', 5, 2); px(ctx, x, y + 2, '#b49156', 1, 21 - y);
  px(ctx, x + 3, y + 5, '#806039', 1, 14 - y);
  px(ctx, x + 1, y + 9, '#6d5030', 2, 1);
  px(ctx, x + 1, y + 7, '#d0a567');
}
HD['t.fence.h'] = ctx => {
  for (const y of [11, 22]) {
    px(ctx, 0, y, '#baa16a', 32, 2); px(ctx, 0, y + 2, '#947344', 32, 3);
    px(ctx, 0, y + 5, '#543f2a', 32, 1);
    px(ctx, 4, y + 3, '#aa8750', 7, 1); px(ctx, 23, y + 2, '#6c5130', 5, 1);
  }
  fencePostHD(ctx);
};
HD['t.fence.v'] = ctx => {
  px(ctx, 14, 0, '#ba9960', 2, 32); px(ctx, 16, 0, '#957242', 3, 32); px(ctx, 19, 0, '#543f2a', 2, 32);
  fencePostHD(ctx, 12, 5);
};
HD['t.fence.post'] = ctx => fencePostHD(ctx);
HD['t.fence.gate'] = ctx => {
  px(ctx, 1, 8, '#55412b', 30, 22);
  for (let x = 3; x < 30; x += 5) {
    px(ctx, x, 9, '#997540', 4, 18); px(ctx, x, 9, '#bf995c', 1, 18);
    px(ctx, x + 3, 11, '#76582f', 1, 16);
  }
  px(ctx, 3, 11, '#b8975a', 26, 3); px(ctx, 3, 24, '#755731', 26, 3);
  for (let i = 0; i < 22; i++) px(ctx, 5 + i, 24 - Math.floor(i * .5), '#a7854c', 2, 2);
  fencePostHD(ctx, 0, 3); fencePostHD(ctx, 26, 3);
  px(ctx, 22, 19, '#544f38', 3, 3); px(ctx, 22, 19, '#d5b879', 2, 1);
};

function lampHD(ctx, lit = false, frame = 0) {
  px(ctx, 21, 3, '#55402b', 4, 28); px(ctx, 21, 3, '#a1814a', 1, 26);
  px(ctx, 19, 29, '#574329', 8, 2);
  px(ctx, 10, 3, '#493b2c', 14, 3); px(ctx, 11, 3, '#b3985e', 11, 1);
  px(ctx, 11, 5, '#493b2c', 1, 4);
  px(ctx, 8, 9, '#3e3929', 8, 2); px(ctx, 7, 11, '#8f7949', 10, 2);
  px(ctx, 8, 13, '#59472d', 8, 10);
  px(ctx, 9, 13, lit ? '#f6d581' : '#d4ba7a', 6, 8);
  px(ctx, 9, 14, lit ? '#fff0af' : '#ece0a0', 2, 5);
  px(ctx, 12, 13, '#8c6a36', 1, 8);
  px(ctx, 8, 22, '#443b2a', 8, 2); px(ctx, 10, 24, '#84633a', 4, 1);
  if (lit) { ctx.globalAlpha = frame ? .12 : .09; ellipse(ctx, 12, 17, 11, 12, '#ffdc88'); ctx.globalAlpha = 1; }
}
HD['t.lamp'] = ctx => lampHD(ctx);
HD['t.lamp.lit'] = (ctx, w, h, frame) => lampHD(ctx, true, frame);

function bookcaseHD(ctx, books = true) {
  panelBox(ctx, 2, 2, 28, 29, OAK);
  px(ctx, 5, 5, '#3f3328', 22, 22);
  for (const y of [14, 25]) {
    if (books) {
      let x = 6;
      for (let i = 0; i < 6; i++) {
        const col = ['#96734d', '#78856a', '#527d7b', '#b89b61', '#8c5b42', '#936c67'][(i + y) % 6];
        const height = 6 + i % 3;
        px(ctx, x, y - height, shade(col, -.24), 3, height);
        px(ctx, x, y - height, col, 2, height - 1);
        px(ctx, x, y - 2, '#c4a572', 2, 1);
        x += 3 + i % 2;
      }
    }
    px(ctx, 4, y, '#c09558', 24, 1); px(ctx, 4, y + 1, '#745134', 24, 2);
  }
  px(ctx, 3, 29, '#3d3125', 27, 2);
}
HD['t.shelf'] = ctx => bookcaseHD(ctx, false);
HD['t.shelf.books'] = ctx => bookcaseHD(ctx);

function tableHD(ctx, set = false) {
  for (const x of [5, 24]) { px(ctx, x, 21, '#4e3a28', 4, 9); px(ctx, x, 21, '#926942', 1, 8); }
  panelBox(ctx, 2, 5, 28, 19, OAK);
  px(ctx, 3, 7, '#b88a51', 26, 12); px(ctx, 3, 19, '#8e6339', 26, 3);
  for (const y of [11, 17]) { px(ctx, 4, y, '#8c673d', 24, 1); px(ctx, 6, y - 2, '#c0955a', 11, 1); }
  if (set) {
    for (const x of [10, 22]) {
      ellipse(ctx, x, 13, 5, 3.2, '#71523b'); ellipse(ctx, x, 12, 5, 3.2, '#d8c9a3'); ellipse(ctx, x, 12, 3, 1.8, '#eee0b9');
    }
    px(ctx, 8, 11, '#c58a49', 4, 2); px(ctx, 9, 10, '#e4b979', 2, 1);
    px(ctx, 21, 11, '#719452', 3, 2); px(ctx, 22, 11, '#b1b568');
    px(ctx, 15, 8, '#6b8e89', 3, 5); px(ctx, 15, 8, '#b2c9b9', 3, 1); px(ctx, 15, 9, '#87ada2', 1, 3);
  }
}
HD['t.table'] = ctx => tableHD(ctx);
HD['t.table.set'] = ctx => tableHD(ctx, true);
HD['t.counter'] = ctx => {
  px(ctx, 0, 6, '#4f3b27', 32, 26);
  px(ctx, 0, 6, '#b68c53', 32, 7); px(ctx, 0, 6, '#d6ae70', 32, 1);
  px(ctx, 0, 9, '#c3995c', 32, 1); px(ctx, 0, 12, '#694a30', 32, 2);
  for (const x of [1, 17]) {
    panelBox(ctx, x, 15, 14, 14, OAK);
    px(ctx, x + 3, 18, '#7d5735', 8, 8); px(ctx, x + 3, 18, '#61442c', 8, 1);
    px(ctx, x + 10, 21, '#d2ad68', 2, 1);
  }
  px(ctx, 0, 30, '#392e22', 32, 2);
};

function hearthHD(ctx, frame = 0, lit = true) {
  px(ctx, 0, 0, '#6c6955', 32, 32);
  for (let row = 0; row < 5; row++) for (let x = row % 2 ? -5 : 0; x < 32; x += 11) {
    px(ctx, x + 1, row * 7, '#9c967b', 9, 6); px(ctx, x + 2, row * 7, '#b5ab88', 7, 1);
    px(ctx, x + 2, row * 7 + 5, '#777660', 8, 1);
  }
  px(ctx, 4, 10, '#453d2d', 24, 21); px(ctx, 6, 12, '#262820', 20, 18);
  panelBox(ctx, 1, 6, 30, 5, OAK);
  px(ctx, 3, 29, '#b3a07b', 26, 2); px(ctx, 2, 31, '#6a5b41', 28, 1);
  if (lit) {
    ellipse(ctx, 16, 24, 9, 5, '#a1592d');
    for (const [x, y, high] of [[10, 26, 9], [16, 27, 13], [22, 26, 8]]) {
      const shift = (x + frame) % 3;
      ellipse(ctx, x, y - high / 2, 3.4, high / 2, '#cf7a36');
      ellipse(ctx, x - 1, y - high / 2 + shift, 2.4, high / 2 - 1, '#edb357');
      ellipse(ctx, x - 1, y - 3, 1.4, 3, '#ffe5a0');
    }
    px(ctx, 14 + frame, 12 - frame, '#e5ae56');
  }
  for (const [x, y] of [[8, 27], [15, 28], [20, 27]]) { px(ctx, x, y, '#3c3025', 6, 2); px(ctx, x, y, '#775033', 4, 1); }
}
HD['t.hearth.lit'] = (ctx, w, h, frame) => hearthHD(ctx, frame);
HD['t.hearth.cold'] = ctx => hearthHD(ctx, 0, false);

function leafyBushHD(ctx, berry = false) {
  contactShadow(ctx, 16, 28, 13, 3, { alpha: .3, color: '#31412b' });
  const ramp = ['#adbd66', '#89a557', '#698c47', '#4d703c', '#34532f'];
  for (const [x, y, rx, ry] of [[16, 18, 14, 9], [8, 16, 7, 7], [23, 14, 7, 7], [15, 10, 9, 7]]) {
    shadedBlob(ctx, x, y, rx, ry, ramp, { edge: .15 });
  }
  for (const [x, y] of [[5, 14], [9, 9], [15, 6], [19, 12], [24, 11], [10, 19], [18, 20], [24, 20]]) {
    px(ctx, x, y, '#9fb562', 3, 1); px(ctx, x + 1, y - 1, '#b6c57a', 2, 1);
    px(ctx, x + 2, y + 3, '#426337', 3, 1); px(ctx, x + 3, y + 4, '#3b5c34', 2, 1);
  }
  if (berry) for (const [x, y] of [[8, 13], [19, 9], [24, 18], [14, 22]]) {
    px(ctx, x, y, '#7f4c3e', 3, 3); px(ctx, x, y, '#ca785a', 2, 2); px(ctx, x, y, '#e9ac80');
  }
}
HD['t.bush'] = ctx => leafyBushHD(ctx);
HD['t.bush.berry'] = ctx => leafyBushHD(ctx, true);
HD['t.rock.small'] = ctx => rockHD(ctx, false);
HD['t.rock.big'] = ctx => rockHD(ctx, true);
function rockHD(ctx, big) {
  const rx = big ? 13 : 10, ry = big ? 10 : 6, cy = big ? 17 : 23;
  contactShadow(ctx, 17, 29, rx, 3, { alpha: .3, color: '#354a2c' });
  shadedBlob(ctx, 16, cy, rx, ry, ['#c3bda0', '#a6a78b', '#8b937b', '#6f7c63', '#4c6150'], { edge: .15 });
  for (const [x, y, w] of [[10, cy - ry + 3, 7], [8, cy - ry + 5, 4], [19, cy + 2, 5]]) {
    px(ctx, x, y, '#b7b89b', w, 1);
    px(ctx, x + 1, y + 1, '#a1a58a', w - 2, 1);
  }
  px(ctx, 22, cy, '#78836d', 1, 5); px(ctx, 23, cy + 4, '#64745d', 3, 1);
  if (big) {
    px(ctx, 7, cy + 7, '#648146', 7, 2); px(ctx, 8, cy + 6, '#8c9d55', 5, 1);
    px(ctx, 10, cy + 5, '#a2ae65', 2, 1); px(ctx, 13, cy + 8, '#4b6b38', 4, 2);
  }
}
HD['t.mushroom'] = ctx => {
  contactShadow(ctx, 16, 29, 12, 2.5, { alpha: .25, color: '#3a4c2c' });
  for (const [x, y, r] of [[9, 14, 7], [23, 23, 5]]) {
    px(ctx, x - 2, y + 2, '#947f57', 5, 9);
    px(ctx, x - 2, y + 2, '#e5d3a6', 3, 8);
    px(ctx, x - 2, y + 8, '#c5b68b', 3, 2);
    shadedBlob(ctx, x, y, r, r * .6, ['#e8b482', '#c9875c', '#a96245', '#7c4937', '#634333'], { edge: .2 });
    px(ctx, x - r + 1, y + 2, '#d5b58a', r * 2 - 2, 1);
    px(ctx, x - 3, y - 2, '#f3dfb3', 3, 1); px(ctx, x + 2, y - 1, '#e3c79e', 2, 2);
  }
};
HD['t.plant.pot'] = ctx => {
  contactShadow(ctx, 16, 30, 8, 2, { alpha: .22 });
  px(ctx, 10, 22, '#8f5740', 12, 8); px(ctx, 11, 23, '#c1875e', 8, 6); px(ctx, 11, 23, '#d59b6c', 2, 5);
  panelBox(ctx, 8, 20, 16, 4, ['#d1a077', '#b7835e', '#946448', '#664834']);
  px(ctx, 15, 8, '#41643b', 2, 13);
  const leaves = ['#b4bc6c', '#8fa459', '#688b4a', '#486c3a'];
  for (const [x, y, rx, ry] of [[9, 12, 6, 3], [22, 15, 6, 3], [14, 7, 5, 4], [23, 7, 5, 3], [10, 17, 5, 3]]) {
    shadedBlob(ctx, x, y, rx, ry, leaves, { edge: .05, noRim: true });
    px(ctx, x - 2, y - 1, '#a4b66a', 4, 1);
  }
};
HD['t.bed.head'] = ctx => {
  panelBox(ctx, 2, 0, 28, 10, OAK);
  px(ctx, 4, 8, '#d2c7a4', 24, 13); px(ctx, 5, 8, '#e8dfbf', 22, 11);
  panelBox(ctx, 7, 9, 18, 8, ['#fff0ce', '#ede0b8', '#cab995', '#ab987b']);
  px(ctx, 4, 21, '#547d79', 24, 11); px(ctx, 4, 21, '#93b2a0', 24, 2);
  px(ctx, 4, 26, '#72978c', 24, 1); px(ctx, 10, 23, '#658f84', 2, 9); px(ctx, 23, 23, '#3d645f', 3, 9);
  px(ctx, 2, 8, '#67472f', 2, 24); px(ctx, 28, 8, '#4e3b2b', 2, 24);
};
HD['t.bed.foot'] = ctx => {
  px(ctx, 4, 0, '#547d79', 24, 25);
  for (const y of [5, 15]) { px(ctx, 4, y, '#71978b', 24, 1); px(ctx, 4, y + 1, '#4a716d', 24, 1); }
  px(ctx, 10, 0, '#658f84', 2, 24); px(ctx, 23, 0, '#3d645f', 3, 24);
  px(ctx, 5, 21, '#72968a', 22, 3); px(ctx, 5, 24, '#365b56', 22, 2);
  px(ctx, 2, 0, '#67472f', 2, 27); px(ctx, 28, 0, '#4e3b2b', 2, 27);
  panelBox(ctx, 2, 26, 28, 5, OAK);
};

export function register() {
  for (const name of TILES) {
    const fn = TP[name];
    if (!fn) { console.warn('[tiles] no painter for', name); continue; }
    if (HD[name]) Atlas.defineHD(name, 16, 16, 2, HD[name], ANIM_TILES[name] || 1);
    else Atlas.defineAnim(name, 16, 16, ANIM_TILES[name] || 1, fn);
  }
  for (const fam of AUTOTILE) {
    for (let m = 0; m < 16; m++) {
      if (fam === 'path' || fam === 'trail') Atlas.defineHD(`t.${fam}.m${m}`, 16, 16, 2, ctx => pathHD(ctx, m, fam === 'trail'));
      else if (fam === 'floor') Atlas.defineHD(`t.${fam}.m${m}`, 16, 16, 2, ctx => floorHD(ctx));
      else Atlas.define(`t.${fam}.m${m}`, 16, 16, ctx => autotileTile(fam, m, ctx));
    }
    if (!Atlas.has(`t.${fam}`)) {
      if (fam === 'path' || fam === 'trail') Atlas.defineHD(`t.${fam}`, 16, 16, 2, ctx => pathHD(ctx, 15, fam === 'trail'));
      else if (fam === 'floor') Atlas.defineHD(`t.${fam}`, 16, 16, 2, ctx => floorHD(ctx));
      else Atlas.define(`t.${fam}`, 16, 16, ctx => autotileTile(fam, 15, ctx));
    }
  }
}
