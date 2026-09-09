// The world. Outdoor maps are composed with a tiny authoring DSL — fill, border,
// pond, road, grove, scatter — because 40x34 grids of hand-typed characters are
// unreadable and easy to get subtly wrong. Interiors are small enough to draw
// literally, so they are.
//
// Everything here is intent: where the road runs, where the grass is tall, what you
// can see from the gate. map.js turns it into tiles, masks, canopies, and collision.

import { hash2 } from '../core/rng.js';

// ---------------------------------------------------------------- authoring DSL
class Sheet {
  constructor(w, h, fill = '.') {
    this.w = w; this.h = h;
    this.g = Array.from({ length: h }, () => new Array(w).fill(fill));
  }
  in(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  set(x, y, ch) { if (this.in(x, y)) this.g[y][x] = ch; return this; }
  get(x, y) { return this.in(x, y) ? this.g[y][x] : null; }

  rect(x, y, w, h, ch) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, ch);
    return this;
  }
  hline(x, y, len, ch) { for (let i = x; i < x + len; i++) this.set(i, y, ch); return this; }
  vline(x, y, len, ch) { for (let j = y; j < y + len; j++) this.set(x, j, ch); return this; }

  /** Tree wall around the edge; trees are 2x2 so they step by two. */
  treeBorder({ top = 2, bottom = 2, left = 2, right = 2, gaps = [] } = {}) {
    const skip = (x, y) => gaps.some(g => x >= g.x && x < g.x + (g.w || 1) && y >= g.y && y < g.y + (g.h || 1));
    for (let x = 0; x < this.w - 1; x += 2) {
      for (let j = 0; j < top; j += 2) if (!skip(x, j)) this.set(x, j, 'T');
      for (let j = 0; j < bottom; j += 2) {
        const y = this.h - 2 - j;
        if (!skip(x, y)) this.set(x, y, 'T');
      }
    }
    for (let y = 0; y < this.h - 1; y += 2) {
      for (let i = 0; i < left; i += 2) if (!skip(i, y)) this.set(i, y, 'T');
      for (let i = 0; i < right; i += 2) {
        const x = this.w - 2 - i;
        if (!skip(x, y)) this.set(x, y, 'T');
      }
    }
    return this;
  }

  /** Soft-edged blob of `ch`, with an optional rim character. */
  blob(cx, cy, rx, ry, ch, { rim = null, seed = 3, wobble = 0.55 } = {}) {
    for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) {
      for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
        const n = (hash2(x, y, seed) - 0.5) * wobble;
        const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + n * 0.5;
        if (d <= 1) this.set(x, y, ch);
        else if (rim && d <= 1.35) this.set(x, y, rim);
      }
    }
    return this;
  }

  /** An L-shaped road: horizontal then vertical, or the reverse. */
  road(x0, y0, x1, y1, ch = 'p', { vfirst = false, width = 1 } = {}) {
    const put = (x, y) => {
      for (let k = 0; k < width; k++) this.set(x + k, y, ch);
    };
    if (vfirst) {
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) put(x0, y);
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) put(x, y1);
    } else {
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) put(x, y0);
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) put(x1, y);
    }
    return this;
  }

  /** A stand of trees, thinned by noise so it never reads as a grid. */
  grove(x, y, w, h, { density = 0.62, ch = 'T', seed = 11 } = {}) {
    for (let j = y; j < y + h; j += 2) {
      for (let i = x; i < x + w; i += 2) {
        const jitter = hash2(i, j, seed) < 0.4 ? 1 : 0;
        if (hash2(i, j, seed + 1) < density) this.set(i + jitter, j, ch);
      }
    }
    return this;
  }

  /** Sprinkle accents onto plain grass only, deterministically. */
  scatter(chars, rate, { seed = 23, area = null } = {}) {
    const a = area || { x: 0, y: 0, w: this.w, h: this.h };
    for (let y = a.y; y < a.y + a.h; y++) {
      for (let x = a.x; x < a.x + a.w; x++) {
        if (this.get(x, y) !== '.') continue;
        const n = hash2(x, y, seed);
        if (n < rate) this.set(x, y, chars[Math.floor(hash2(x, y, seed + 5) * chars.length)]);
      }
    }
    return this;
  }

  /** Patch of encounter grass with a soft edge. */
  meadowPatch(cx, cy, rx, ry, seed = 41) { return this.blob(cx, cy, rx, ry, '"', { seed, wobble: 0.8 }); }

  /** Authored flower drifts: a soft clump, with room to walk and build through it. */
  flowers(cx, cy, rx, ry, seed, bloom = '*') {
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) {
      for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
        if (!['.', ',', '*', '%', '`'].includes(this.get(x, y))) continue;
        const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
        if (d + hash2(x, y, seed) * 0.6 > 1.1) continue;
        this.set(x, y, hash2(x, y, seed + 1) < 0.42 ? bloom : ',');
      }
    }
    return this;
  }

  /** Fence run. Corners get posts. */
  fence(x, y, w, h) {
    for (let i = x; i < x + w; i++) { this.set(i, y, '-'); this.set(i, y + h - 1, '-'); }
    for (let j = y; j < y + h; j++) { this.set(x, j, '|'); this.set(x + w - 1, j, '|'); }
    this.set(x, y, '+'); this.set(x + w - 1, y, '+');
    this.set(x, y + h - 1, '+'); this.set(x + w - 1, y + h - 1, '+');
    return this;
  }

  rows() { return this.g.map(r => r.join('')); }
}

// ---------------------------------------------------------------- village (home)
// village.js pins the Hearthstone to the '@' tag and lays its plots out around it,
// spanning roughly x 10..33, y 11..31 — so authored scenery stays out of that band.
function villageRows() {
  const s = new Sheet(40, 34);
  s.treeBorder({
    top: 2, bottom: 2, left: 2, right: 2,
    gaps: [{ x: 20, y: 32, w: 2, h: 2 }, { x: 0, y: 24, w: 2, h: 4 }],
  });

  // The heart of the village and its plaza.
  s.rect(18, 17, 7, 5, '0');
  s.set(21, 19, '@');

  // The road: in from the south gate, up to the plaza, then out east and west.
  s.road(21, 33, 21, 22, 'p', { vfirst: true });
  s.vline(21, 22, 11, 'p');
  s.hline(9, 25, 13, 'p');
  s.hline(0, 25, 9, 'p');
  s.hline(21, 25, 12, 'p');
  s.set(21, 33, 'A');

  // North strip: the three houses that were here before you arrived.
  s.rect(5, 6, 4, 4, '.'); s.rect(16, 6, 4, 4, '.'); s.rect(26, 6, 5, 4, '.');
  s.hline(6, 10, 2, 'p'); s.hline(17, 10, 2, 'p'); s.hline(27, 10, 3, 'p');
  s.road(7, 10, 21, 16, 'p'); s.road(18, 10, 21, 14, 'p'); s.road(28, 10, 21, 12, 'p');

  // The mill pond, tucked into the south-west where no plot reaches.
  s.blob(6, 28, 4, 3, 'w', { rim: 's', seed: 9 });
  s.set(4, 26, '~'); s.set(9, 30, 'j'); s.set(7, 25, 'q');

  // Kitchen garden behind the fence, and the well by the road.
  s.fence(31, 20, 6, 6);
  s.rect(32, 21, 4, 4, 'N');
  s.set(33, 20, '-'); s.set(34, 20, 'A');
  s.set(19, 24, 'e');

  // Lamps along the plaza edge, benches facing the Hearthstone.
  for (const [x, y] of [[17, 16], [25, 16], [17, 22], [25, 22]]) s.set(x, y, 'l');
  s.set(19, 22, 'K'); s.set(23, 22, 'K');
  s.set(20, 30, 'I');          // signpost at the gate
  s.set(24, 27, 'M');

  s.scatter([',', '*', '`', '%'], 0.14, { seed: 31, area: { x: 2, y: 2, w: 36, h: 30 } });
  s.set(12, 7, 'B'); s.set(13, 8, 'b'); s.set(34, 12, 'O'); s.set(35, 14, 'o');

  // Three small properties along the north lane. Their fences stop beside the
  // doors, and the porch approaches remain clear even as the settlement grows.
  for (const [left, right, door] of [[4, 9, 6], [15, 20, 17], [25, 30, 27]]) {
    s.hline(left, 11, right - left + 1, '-');
    s.set(door, 11, 'p'); s.set(door + 1, 11, 'p');
    s.set(left, 10, 'F'); s.set(right, 10, 'F');
    s.flowers(left - 1, 8, 1.8, 2.1, 301 + left, '%');
    s.flowers(right + 1, 8, 1.5, 2, 307 + right);
  }
  s.set(18, 11, 'p'); s.set(28, 11, 'p'); // Gran and the smith greet you at their gates.
  s.set(8, 9, 'M'); s.set(19, 9, 'P'); s.set(30, 9, 'X');
  s.set(4, 12, 'l'); s.set(30, 12, 'l');

  // Garden rooms soften the boundary, while the centre stays available for the
  // player's houses. All the flowers inside the plot band are non-solid.
  for (const [x, y] of [[3, 13], [6, 14], [3, 19], [35, 6], [35, 16], [35, 28],
    [2, 4], [9, 3], [13, 3], [21, 4], [24, 2], [31, 4], [34, 2]]) s.set(x, y, 'T');
  for (const [x, y] of [[5, 15], [4, 21], [36, 9], [35, 18]]) s.set(x, y, 'b');
  for (const [x, y] of [[4, 16], [7, 15], [35, 10], [34, 29]]) s.set(x, y, 'm');
  for (const [x, y, rx, ry, seed] of [
    [7, 12, 3, 1.5, 331], [7, 22, 3, 2, 337], [13, 21, 3, 2, 347],
    [16, 26, 3, 2, 349], [25, 24, 3, 1.5, 353], [29, 28, 3, 2, 359],
    [16, 30, 3, 1.5, 367], [34, 18, 3, 2, 373], [10, 28, 2, 2, 379],
  ]) s.flowers(x, y, rx, ry, seed, seed % 3 ? '*' : '%');
  s.hline(17, 32, 3, '-'); s.hline(22, 32, 3, '-');
  s.set(19, 31, 'l'); s.set(23, 31, 'l');
  s.set(30, 22, 'V'); s.set(36, 21, 'S');
  // The established houses have room for a family. Their front door tiles stay
  // exactly where older saves and their interior return warps expect them.
  s.rect(4, 7, 4, 3, '.'); s.rect(15, 7, 4, 3, '.'); s.rect(25, 7, 5, 3, '.');
  return s.rows();
}

// ---------------------------------------------------------------- meadow (south)
function meadowRows() {
  const s = new Sheet(38, 32);
  s.treeBorder({ top: 2, bottom: 2, left: 2, right: 2, gaps: [{ x: 18, y: 0, w: 2, h: 2 }, { x: 34, y: 20, w: 4, h: 4 }] });
  s.road(19, 0, 19, 30, 'p', { vfirst: true });
  s.vline(19, 0, 22, 'p');
  s.hline(19, 21, 19, 'p');
  s.set(19, 0, 'A');

  s.meadowPatch(9, 8, 6, 4, 41);
  s.meadowPatch(28, 9, 5, 3, 47);
  s.meadowPatch(11, 25, 7, 4, 53);
  s.meadowPatch(30, 27, 4, 3, 59);

  s.fence(4, 14, 12, 6);
  s.set(9, 14, 'A');
  s.rect(5, 15, 10, 4, ','); s.set(9, 17, 'S'); s.set(6, 16, 'h'); s.set(13, 18, 'h');

  s.grove(24, 3, 10, 6, { density: 0.5, seed: 61 });
  s.blob(31, 17, 3, 2, 'w', { rim: 's', seed: 13 });
  s.set(24, 24, 'L'); s.set(27, 22, 'u'); s.set(8, 22, 'O');
  s.set(18, 3, 'I'); s.set(21, 12, 'i');
  s.scatter([',', '*', '`', 'm'], 0.13, { seed: 71, area: { x: 2, y: 2, w: 34, h: 28 } });
  // A readable verge frames the long path: flowers and mushrooms cluster beside
  // landmarks instead of being spread evenly over every open tile.
  for (const [x, y, rx, ry, seed] of [
    [16, 4, 2, 3, 401], [22, 13, 2.5, 3, 409], [17, 22, 1.5, 3, 419],
    [6, 21, 4, 2, 421], [29, 20, 4, 1.5, 431], [23, 28, 2, 2, 433],
  ]) s.flowers(x, y, rx, ry, seed, seed % 3 ? '*' : '%');
  s.set(15, 3, 'T'); s.set(3, 22, 'T'); s.set(22, 25, 'T');
  s.set(16, 6, 'm'); s.set(17, 7, 'm'); s.set(4, 24, 'm');
  s.set(17, 2, 'l'); s.set(20, 19, 'l');
  s.hline(4, 12, 5, '-'); s.hline(10, 12, 6, '-'); s.set(9, 12, 'A');
  s.set(16, 13, 'b'); s.set(3, 13, 'b');
  return s.rows();
}

// ---------------------------------------------------------------- forest (east)
function forestRows() {
  const s = new Sheet(34, 34);
  s.treeBorder({ top: 2, bottom: 2, left: 2, right: 2, gaps: [{ x: 0, y: 14, w: 2, h: 4 }] });
  s.grove(3, 3, 28, 28, { density: 0.56, seed: 83 });
  s.grove(4, 4, 26, 26, { density: 0.38, ch: 'Y', seed: 89 });

  // A two-tile, softly diagonal trail. Every trail tile clears tree anchors that
  // would otherwise expand a hidden solid canopy over it during map baking.
  const waypoints = [[1, 16], [6, 16], [10, 13], [12, 19], [16, 20], [18, 14],
    [16, 10], [22, 9], [24, 14], [22, 18], [28, 21], [28, 28]];
  const trail = new Map();
  const add = (x, y) => { if (s.in(x, y)) trail.set(`${x},${y}`, [x, y]); };
  for (let i = 0; i < waypoints.length - 1; i++) {
    let [x, y] = waypoints[i];
    const [tx, ty] = waypoints[i + 1];
    const dx = Math.abs(tx - x), sx = x < tx ? 1 : -1;
    const dy = -Math.abs(ty - y), sy = y < ty ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      add(x, y);
      if (dx >= -dy) add(x, y + (hash2(x, y, 211) < 0.5 ? -1 : 1));
      else add(x + (hash2(x, y, 223) < 0.5 ? -1 : 1), y);
      if (x === tx && y === ty) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x += sx; }
      if (e2 <= dx) { err += dx; y += sy; }
    }
  }
  for (const [x, y] of trail.values()) {
    for (let ay = y - 1; ay <= y; ay++) for (let ax = x - 1; ax <= x; ax++) {
      if (s.get(ax, ay) === 'T' || s.get(ax, ay) === 'Y') s.set(ax, ay, '.');
    }
    s.set(x, y, '(');
  }

  s.meadowPatch(8, 24, 4, 3, 97);
  s.meadowPatch(24, 6, 4, 3, 101);

  // The secret clearing: reachable only by walking round the grove at (26,26).
  s.blob(28, 28, 3, 3, '.', { seed: 5, wobble: 0.2 });
  s.set(28, 28, 'Z'); s.set(30, 29, 'm'); s.set(26, 30, 'm');
  s.set(1, 15, 'I');
  s.scatter([';', 'm', 'b', '`'], 0.16, { seed: 103, area: { x: 2, y: 2, w: 30, h: 30 } });
  return s.rows();
}

// ------------------------------------------------------------- riverside (west)
function riversideRows() {
  const s = new Sheet(36, 26);
  s.treeBorder({ top: 2, bottom: 2, left: 2, right: 2, gaps: [{ x: 32, y: 10, w: 4, h: 4 }] });
  // The river runs north-south; one bridge crosses it.
  s.rect(14, 0, 6, 26, 'w');
  s.rect(15, 0, 4, 26, 'W');
  s.hline(13, 12, 1, 's'); s.hline(20, 12, 1, 's');
  s.rect(14, 12, 6, 1, '=');
  s.vline(13, 0, 26, 's'); s.vline(20, 0, 26, 's');
  s.hline(2, 12, 12, 'p'); s.hline(20, 12, 14, 'p');

  for (const [x, y] of [[14, 4], [19, 7], [14, 19], [19, 22], [15, 24]]) s.set(x, y, '~');
  s.set(12, 15, 'j'); s.set(21, 8, 'j');
  s.meadowPatch(7, 6, 4, 3, 107);
  s.meadowPatch(27, 19, 5, 3, 109);
  s.set(11, 12, 'i');
  s.set(24, 6, 'O'); s.set(26, 8, 'o'); s.set(6, 20, 'L');
  s.grove(22, 15, 10, 8, { density: 0.4, seed: 113 });
  s.scatter([',', '*', '`'], 0.12, { seed: 127, area: { x: 2, y: 2, w: 32, h: 22 } });
  s.flowers(10, 14, 2.5, 2, 451).flowers(23, 10, 2, 2, 457, '%');
  s.flowers(9, 21, 3, 2, 461).flowers(25, 4, 3, 1.5, 463, '%');
  s.set(12, 11, 'l'); s.set(21, 11, 'l');
  s.set(11, 7, 'K'); s.set(10, 6, 'm'); s.set(12, 9, 'b');
  s.set(4, 17, 'T'); s.set(7, 19, 'T');
  return s.rows();
}

// ---------------------------------------------------------------------- interiors
// Full-screen 20x11 room drawings. At 16px per tile they fill the 320x180 camera
// while keeping a thin cinematic edge instead of floating in a grass/void margin.
const HOME = [
  '^^^^^^^^^^^^^^^^^^^^',
  ']E]]]]]U]]]]]]]]]E]]',
  ']_5_7______R_88988_]',
  ']_6_7____rrrrr__G__]',
  ']___R____rQrrr_____]',
  ']_7______314rr_____]',
  ']_!_Q____rrrrr___J_]',
  ']_Z_2____________X_]',
  ']__R___________R___]',
  ']_JJ7__________JJJ_]',
  ']]]]]]]]]d]]]]]]]]]]',
];

const GRANHOUSE = [
  '^^^^^^^^^^^^^^^^^^^^',
  ']E]]]]]]]U]]]]]]]]E]',
  '[_7_R___J_G___J_7__[',
  '[_7_____rrr_____7__[',
  '[___Q___rrr___Q____[',
  '[__314__rrr__314___[',
  '[_______rrrr_______[',
  '[_!_____________5__[',
  '[__R____rrr_____6__[',
  '[_7J____rrr___R_J__[',
  '[[[[[[[[[d[[[[[[[[[[',
];

const WORKSHOP = [
  '^^^^^^^^^^^^^^^^^^^^',
  ']E]]]]]]]U]]]]]]]]E]',
  ']_a_X_88888___J_X__]',
  ']_y___8___8_____G__]',
  ']_____88888_____X__]',
  ']___Q_________Z____]',
  ']___2___rrrr_!_____]',
  ']_______rrrr_______]',
  ']_X_R__________R_X_]',
  ']______J___J_______]',
  ']]]]]]]]]d]]]]]]]]]]',
];

// ---------------------------------------------------------------------- the world
export const MAPS = {
  village: {
    name: 'Emberhollow', village: true, music: 'village',
    rows: villageRows(),
    // Authored buildings that predate the player. Player-built ones come from village.js.
    structures: [
      { sprite: 'b.cottage.authored', x: 4, y: 7, w: 4, h: 3, overhang: 2, door: { x: 6, y: 9 }, to: 'home' },
      { sprite: 'b.infirmary.authored', x: 15, y: 7, w: 4, h: 3, overhang: 2, door: { x: 17, y: 9 }, to: 'granhouse' },
      { sprite: 'b.workshop.authored', x: 25, y: 7, w: 5, h: 3, overhang: 2, door: { x: 27, y: 9 }, to: 'workshop' },
    ],
    warps: [
      { x: 21, y: 33, to: 'meadow', tx: 19, ty: 1, dir: 'down' },
      { x: 20, y: 33, to: 'meadow', tx: 19, ty: 1, dir: 'down' },
      { x: 0, y: 25, to: 'riverside', tx: 34, ty: 12, dir: 'left' },
      { x: 1, y: 25, to: 'riverside', tx: 34, ty: 12, dir: 'left' },
    ],
    npcs: [
      { who: 'mayor', x: 22, y: 21, dir: 'up', wander: 0, id: 'mayor' },
      { who: 'gran', x: 18, y: 11, dir: 'down', wander: 1, id: 'gran' },
      { who: 'kid', x: 25, y: 26, dir: 'left', wander: 3, id: 'kid' },
      { who: 'smith', x: 28, y: 11, dir: 'down', wander: 1, id: 'smith' },
      { who: 'baker', x: 12, y: 24, dir: 'right', wander: 2, id: 'baker' },
      { who: 'farmer', x: 33, y: 26, dir: 'up', wander: 1, id: 'farmer' },
      { who: 'weaver', x: 8, y: 20, dir: 'down', wander: 2, id: 'weaver' },
      { who: 'fisher', x: 12, y: 29, dir: 'left', wander: 1, id: 'fisher' },
    ],
  },

  meadow: {
    name: 'Gladewind Meadow', music: 'field',
    rows: meadowRows(),
    encounters: [
      { id: 'embercub', w: 12, lo: 3, hi: 5 },
      { id: 'leafowl', w: 18, lo: 3, hi: 6 },
      { id: 'aquarabbit', w: 12, lo: 3, hi: 5 },
      { id: 'voltkit', w: 8, lo: 4, hi: 6 },
      { id: 'florabloom', w: 14, lo: 3, hi: 6 },
      { id: 'wisplet', w: 10, lo: 4, hi: 7 },
      { id: 'terranox', w: 8, lo: 4, hi: 7 },
    ],
    warps: [
      { x: 19, y: 0, to: 'village', tx: 21, ty: 32, dir: 'up' },
      { x: 36, y: 21, to: 'forest', tx: 1, ty: 16, dir: 'right' },
      { x: 37, y: 21, to: 'forest', tx: 1, ty: 16, dir: 'right' },
    ],
    npcs: [
      { who: 'ranger', x: 21, y: 6, dir: 'down', wander: 2, id: 'ranger' },
      { who: 'twin', x: 12, y: 17, dir: 'down', wander: 1, id: 'twinA' },
      { who: 'peddler', x: 24, y: 20, dir: 'left', wander: 0, id: 'peddler' },
    ],
  },

  forest: {
    name: 'Hollowpine Wood', music: 'forest',
    rows: forestRows(),
    encounters: [
      { id: 'leafowl', w: 20, lo: 6, hi: 10 },
      { id: 'grovewing', w: 6, lo: 12, hi: 15 },
      { id: 'drakindle', w: 8, lo: 7, hi: 11 },
      { id: 'terranox', w: 14, lo: 6, hi: 10 },
      { id: 'wisplet', w: 14, lo: 6, hi: 10 },
      { id: 'florabloom', w: 12, lo: 6, hi: 9 },
      { id: 'voltkit', w: 10, lo: 7, hi: 10 },
    ],
    warps: [
      { x: 0, y: 16, to: 'meadow', tx: 35, ty: 21, dir: 'left' },
      { x: 1, y: 16, to: 'meadow', tx: 35, ty: 21, dir: 'left' },
    ],
    npcs: [
      { who: 'rival', x: 19, y: 10, dir: 'left', wander: 0, id: 'rival' },
      { who: 'ranger', x: 11, y: 18, dir: 'right', wander: 2, id: 'ranger2' },
    ],
  },

  riverside: {
    name: 'Stillwater Reach', music: 'river',
    rows: riversideRows(),
    encounters: [
      { id: 'aquarabbit', w: 24, lo: 5, hi: 9 },
      { id: 'torrentide', w: 5, lo: 13, hi: 16 },
      { id: 'wisplet', w: 14, lo: 5, hi: 8 },
      { id: 'leafowl', w: 12, lo: 5, hi: 8 },
      { id: 'terranox', w: 12, lo: 5, hi: 9 },
    ],
    warps: [
      { x: 34, y: 12, to: 'village', tx: 3, ty: 25, dir: 'right' },
      { x: 35, y: 12, to: 'village', tx: 3, ty: 25, dir: 'right' },
    ],
    npcs: [
      { who: 'fisher', x: 12, y: 8, dir: 'right', wander: 0, id: 'fisher2' },
    ],
  },

  home: {
    name: 'Your Cottage', indoor: true, music: 'home',
    rows: HOME,
    warps: [{ x: 9, y: 10, to: 'village', tx: 6, ty: 10, dir: 'down' }],
    npcs: [],
  },

  granhouse: {
    name: "Gran Willow's Warmhouse", indoor: true, music: 'home',
    rows: GRANHOUSE,
    warps: [{ x: 9, y: 10, to: 'village', tx: 17, ty: 10, dir: 'down' }],
    npcs: [{ who: 'gran', x: 10, y: 7, dir: 'down', wander: 0, id: 'granIn' }],
  },

  workshop: {
    name: 'The Workshop', indoor: true, music: 'shop',
    rows: WORKSHOP,
    warps: [{ x: 9, y: 10, to: 'village', tx: 27, ty: 10, dir: 'down' }],
    npcs: [{ who: 'smith', x: 3, y: 6, dir: 'right', wander: 0, id: 'smithIn' }],
  },
};

export const START = { map: 'village', x: 22, y: 24, dir: 'down' };
