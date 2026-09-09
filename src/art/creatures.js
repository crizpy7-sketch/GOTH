// The Guardians.
//
// 18 species x front / back / overworld. Rather than 54 unrelated drawings, every
// creature is described by a spec — silhouette, ramp, ears, tail, wings, markings —
// and painted by one shared routine. That is what makes them read as a family, and
// it is what makes an evolution look like the same creature grown up: the child and
// the adult share a spec and differ by mass, detail, and a couple of features.

import { Atlas } from './atlas.js';
import { GUARDIANS } from './names.js';
import { P, RAMP, mix, shade } from './palette.js';

// ---------------------------------------------------------------- paint helpers
const fill = (ctx, x, y, c, w = 1, h = 1) => {
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
};

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

/** Ellipse with a light-from-top-left ramp: the house shading rule, everywhere. */
function orb(ctx, cx, cy, rx, ry, ramp, { lift = 0 } = {}) {
  ellipse(ctx, cx, cy, rx, ry, ramp[3]);
  ellipse(ctx, cx, cy - ry * 0.10, rx * 0.94, ry * 0.90, ramp[2]);
  ellipse(ctx, cx - rx * 0.16, cy - ry * 0.26, rx * 0.74, ry * 0.68, ramp[1]);
  ellipse(ctx, cx - rx * 0.28, cy - ry * 0.42, rx * 0.42, ry * 0.36, ramp[Math.max(0, 1 - lift)]);
}

/** 1px outline in a darker shade of the sprite's own colour — never pure black. */
function outline(ctx, w, h, col) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? 0 : d[(y * w + x) * 4 + 3];
  const out = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (at(x, y) !== 0) continue;
      if (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) out.push([x, y]);
    }
  }
  ctx.fillStyle = col;
  for (const [x, y] of out) ctx.fillRect(x, y, 1, 1);
}

function eyes(ctx, cx, cy, spread, r, col, { closed = false, shine = true } = {}) {
  for (const s of [-1, 1]) {
    const ex = cx + s * spread;
    if (closed) { fill(ctx, ex - r, cy, P.ink, r * 2, 1); continue; }
    ellipse(ctx, ex, cy, r, r * 1.15, P.ink);
    ellipse(ctx, ex, cy + r * 0.2, r * 0.72, r * 0.8, col);
    if (shine) fill(ctx, ex - Math.max(1, r * 0.4), cy - r * 0.5, '#ffffff', 1, 1);
  }
}

function ramper(base) {
  return [shade(base, 0.42), shade(base, 0.2), base, shade(base, -0.22), shade(base, -0.44)];
}

// ---------------------------------------------------------------- feature parts
function earFox(ctx, cx, cy, w, h, ramp, dir) {
  const s = dir;
  ctx.fillStyle = ramp[2];
  for (let i = 0; i < h; i++) {
    const ww = Math.max(1, Math.round(w * (1 - i / h)));
    ctx.fillRect(Math.round(cx + s * i * 0.35 - ww / 2), Math.round(cy - i), ww, 1);
  }
  ctx.fillStyle = ramp[4];
  for (let i = 0; i < h * 0.6; i++) {
    const ww = Math.max(1, Math.round(w * 0.45 * (1 - i / (h * 0.6))));
    ctx.fillRect(Math.round(cx + s * i * 0.35 - ww / 2), Math.round(cy - i - 1), ww, 1);
  }
}

function earRabbit(ctx, cx, cy, w, h, ramp, dir) {
  ellipse(ctx, cx + dir * h * 0.18, cy - h / 2, w / 2, h / 2, ramp[2]);
  ellipse(ctx, cx + dir * h * 0.18, cy - h / 2, w / 4, h / 2.6, '#bf8caf');
  fill(ctx, cx + dir * h * 0.18 - 1, cy - h * 0.78, '#ecc7d4', 1, h * 0.36);
}

function tuftOwl(ctx, cx, cy, w, h, ramp, dir) {
  ctx.fillStyle = ramp[3];
  for (let i = 0; i < h; i++) ctx.fillRect(Math.round(cx + dir * i * 0.5), Math.round(cy - i), Math.max(1, Math.round(w - i)), 1);
}

function hornStone(ctx, cx, cy, w, h, ramp, dir) {
  ctx.fillStyle = ramp[1];
  for (let i = 0; i < h; i++) ctx.fillRect(Math.round(cx + dir * i * 0.6 - w / 2), Math.round(cy - i), Math.max(1, Math.round(w - i * 0.6)), 1);
}

function flameTail(ctx, x, y, size, hot) {
  const R = [P.ember0, P.ember1, P.ember2, P.ember3];
  const c = hot || R;
  for (let i = 0; i < 4; i++) {
    const k = 1 - i / 4;
    ellipse(ctx, x + i * size * 0.10, y - i * size * 0.42, size * 0.52 * k + 1, size * 0.62 * k + 1, c[Math.min(3, i)]);
  }
  ellipse(ctx, x, y - size * 0.2, size * 0.28, size * 0.34, '#fff3c4');
}

function leafTail(ctx, x, y, size, ramp) {
  for (let i = 0; i < 3; i++) {
    const a = -0.5 + i * 0.5;
    ellipse(ctx, x + Math.cos(a) * size * 0.5, y - size * 0.3 + Math.sin(a) * size * 0.4,
      size * 0.42, size * 0.22, ramp[i === 1 ? 1 : 2]);
  }
  fill(ctx, x - 1, y - size * 0.35, ramp[4], size * 0.9, 1);
}

function boltTail(ctx, x, y, size) {
  const pts = [[0, 0], [0.5, -0.4], [0.2, -0.45], [0.8, -1.0], [0.45, -0.55], [0.75, -0.5]];
  ctx.fillStyle = P.spark1;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    const steps = Math.ceil(size);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      ctx.fillRect(Math.round(x + (ax + (bx - ax) * t) * size), Math.round(y + (ay + (by - ay) * t) * size), 2, 2);
    }
  }
  ctx.fillStyle = P.spark0;
  ctx.fillRect(Math.round(x + 0.5 * size), Math.round(y - 0.5 * size), 2, 2);
}

function dropTail(ctx, x, y, size, ramp) {
  ellipse(ctx, x, y - size * 0.2, size * 0.4, size * 0.5, ramp[2]);
  ctx.fillStyle = ramp[1];
  for (let i = 0; i < size * 0.6; i++) ctx.fillRect(Math.round(x - 1), Math.round(y - size * 0.6 - i), 2, 1);
  fill(ctx, x - 1, y - size * 0.35, '#ffffff', 1, 1);
}

function wingFeather(ctx, cx, cy, w, h, ramp, dir, spread = 1) {
  for (let i = 0; i < 3; i++) {
    const k = 1 - i * 0.22;
    ellipse(ctx, cx + dir * (w * 0.35 + i * 2) * spread, cy + i * h * 0.2,
      w * 0.42 * k, h * 0.52 * k, ramp[1 + (i % 2)]);
  }
  ellipse(ctx, cx + dir * w * 0.3 * spread, cy, w * 0.4, h * 0.55, ramp[2]);
}

function wingBat(ctx, cx, cy, w, h, ramp, dir) {
  ctx.fillStyle = ramp[3];
  for (let i = 0; i < h; i++) {
    const ww = Math.round(w * (1 - Math.abs(i - h / 2) / (h / 1.4)));
    if (ww > 0) ctx.fillRect(Math.round(cx + (dir > 0 ? 0 : -ww)), Math.round(cy - h / 2 + i), ww, 1);
  }
  ctx.fillStyle = ramp[4];
  for (let i = 0; i < 3; i++) ctx.fillRect(
    Math.round(cx + dir * (2 + i * (w / 3.5)) - (dir < 0 ? 1 : 0)),
    Math.round(cy - h / 2 + 2), 1, Math.max(1, Math.round(h - 4)));
}

function petalCrown(ctx, cx, cy, r, ramp) {
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 - 0.4;
    ellipse(ctx, cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.7, r * 0.5, r * 0.42, ramp[i % 2 ? 1 : 2]);
  }
  ellipse(ctx, cx, cy, r * 0.42, r * 0.38, P.gold1);
}

function rockPlates(ctx, cx, cy, rx, ry, ramp) {
  for (let i = 0; i < 8; i++) {
    const a = -Math.PI + (i / 7) * Math.PI * 2;
    const x = cx + Math.cos(a) * rx * 0.62, y = cy + Math.sin(a) * ry * 0.56;
    const rw = rx * 0.38, rh = ry * 0.48;
    ctx.beginPath();
    [[-0.8,-0.5],[-0.25,-1],[0.6,-0.8],[1,0],[0.5,0.8],[-0.55,0.9],[-1,0]]
      .forEach(([px, py], j) => {
        const xx = Math.round(x + px * rw), yy = Math.round(y + py * rh);
        if (j) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy);
      });
    ctx.closePath(); ctx.fillStyle = ramp[i % 2 ? 2 : 3]; ctx.fill();
    fill(ctx, x - rw * .4, y - rh * .68, ramp[0], rw * .75, 1);
    // Moss collects along the top of the plates, leaving their angular edges visible.
    if (i % 2 === 0) {
      ellipse(ctx, x - rw * .1, y - rh * .58, rw * .65, rh * .24, '#7d9b4d');
      fill(ctx, x - rw * .3, y - rh * .77, '#b1c675', 3, 1);
    }
  }
}

// ---------------------------------------------------------------- species specs
// `mass` scales the whole creature; stage-2 and stage-3 forms are bigger and
// carry an extra feature, so an evolution reads as growth rather than replacement.
const SPEC = {
  embercub:   { shape: 'quad', base: '#f08a3c', mass: 0.74, ears: 'fox', tail: 'flame', belly: '#ffdca8', eye: '#4fd0e8', legs: 4, mark: 'blaze' },
  emberlynx:  { shape: 'quad', base: '#ef7a2a', mass: 0.90, ears: 'fox', tail: 'flame', belly: '#ffd39a', eye: '#4fd0e8', legs: 4, mark: 'blaze', mane: true },
  pyrelion:   { shape: 'quad', base: '#e8641d', mass: 1.06, ears: 'fox', tail: 'flame', belly: '#ffcb86', eye: '#ffe066', legs: 4, mark: 'blaze', mane: true, crown: 'ember' },

  leafowl:    { shape: 'bird', base: '#7fc056', mass: 0.72, ears: 'owl', tail: 'leaf', belly: '#e2f0c0', eye: '#f5c020', legs: 2, wings: 'feather', beak: true },
  grovewing:  { shape: 'bird', base: '#5ea23e', mass: 0.98, ears: 'owl', tail: 'leaf', belly: '#d6ecb2', eye: '#f5c020', legs: 2, wings: 'feather', beak: true, crown: 'leaf' },

  aquarabbit: { shape: 'quad', base: '#5fc2e8', mass: 0.72, ears: 'rabbit', tail: 'drop', belly: '#dff4fb', eye: '#2a6fa8', legs: 4, mark: 'splash' },
  torrentide: { shape: 'quad', base: '#3f9fd4', mass: 1.0, ears: 'rabbit', tail: 'drop', belly: '#cfeaf8', eye: '#1d5b85', legs: 4, mark: 'splash', crown: 'wave' },

  terranox:   { shape: 'squat', base: '#8f9b6a', mass: 0.80, ears: 'horn', tail: 'none', belly: '#d9d3a8', eye: '#f0d070', legs: 4, shell: true },
  cragnox:    { shape: 'squat', base: '#7d8a5c', mass: 1.04, ears: 'horn', tail: 'none', belly: '#cfc79c', eye: '#f0d070', legs: 4, shell: true, crown: 'stone' },

  wisplet:    { shape: 'wisp', base: '#dfeaf5', mass: 0.66, ears: 'fox', tail: 'wisp', belly: '#ffffff', eye: '#7fc7e8', legs: 0, wings: 'feather', float: true },
  zephyrix:   { shape: 'wisp', base: '#eef5fb', mass: 0.98, ears: 'fox', tail: 'wisp', belly: '#ffffff', eye: '#5aa8d8', legs: 0, wings: 'feather', float: true, serpent: true },

  voltkit:    { shape: 'quad', base: '#f5d63f', mass: 0.72, ears: 'fox', tail: 'bolt', belly: '#fff3bb', eye: '#3b3222', legs: 4, mark: 'zag' },
  voltmane:   { shape: 'quad', base: '#eec92c', mass: 1.0, ears: 'fox', tail: 'bolt', belly: '#fff0aa', eye: '#3b3222', legs: 4, mark: 'zag', mane: true },

  florabloom: { shape: 'sprite', base: '#8fd07a', mass: 0.70, ears: 'none', tail: 'leaf', belly: '#e6f6d4', eye: '#2f6b3a', legs: 2, crown: 'petal' },
  floradiant: { shape: 'sprite', base: '#7ac167', mass: 0.96, ears: 'none', tail: 'leaf', belly: '#ddf2c8', eye: '#2f6b3a', legs: 2, crown: 'petal', wings: 'feather' },

  drakindle:  { shape: 'drake', base: '#e05a3a', mass: 0.80, ears: 'horn', tail: 'flame', belly: '#f7c98e', eye: '#ffd24a', legs: 2, wings: 'bat' },
  drakember:  { shape: 'drake', base: '#cf4527', mass: 1.06, ears: 'horn', tail: 'flame', belly: '#f2bb7c', eye: '#ffd24a', legs: 2, wings: 'bat', crown: 'ember' },

  hearthling: { shape: 'wisp', base: '#f5c877', mass: 0.78, ears: 'none', tail: 'flame', belly: '#fff0cc', eye: '#c0521a', legs: 0, float: true, crown: 'ember', glow: true },
};

// ---------------------------------------------------------------- the painter
function paintCreature(ctx, W, H, id, view) {
  const s = SPEC[id];
  if (!s) return;
  const ramp = ramper(s.base);
  const belly = ramper(s.belly);
  const back = view === 'back';
  const M = s.mass * (W / 64);

  // Silhouette is the first thing a player reads, so the archetype changes the
  // actual proportions rather than just the decoration on top of one egg.
  const FORM = {
    quad:   { bx: 1.16, by: 0.82, hr: 0.92, neck: 0.42, lift: 2 },
    bird:   { bx: 0.84, by: 1.00, hr: 1.08, neck: 0.20, lift: 2 },
    squat:  { bx: 1.26, by: 0.70, hr: 0.86, neck: 0.24, lift: 1 },
    wisp:   { bx: 0.74, by: 1.14, hr: 0.96, neck: 0.50, lift: 9 },
    sprite: { bx: 0.72, by: 0.72, hr: 1.02, neck: 0.34, lift: 2 },
    drake:  { bx: 0.92, by: 1.02, hr: 0.94, neck: 0.44, lift: 2 },
  };
  const f = FORM[s.shape] || FORM.quad;

  const cx = W / 2;
  const groundY = H - 6 * (W / 64);
  const bodyRx = 15 * M * f.bx, bodyRy = 13 * M * f.by;
  const bodyCy = groundY - bodyRy - (s.float ? 8 * M : f.lift * M);
  const headR = 11 * M * f.hr;
  const headCy = bodyCy - bodyRy - headR * f.neck;

  // --- behind the body ---
  if (s.wings === 'feather') {
    wingFeather(ctx, cx - bodyRx * 0.5, bodyCy - bodyRy * 0.2, 16 * M, 20 * M, ramp, -1, back ? 1.25 : 1);
    wingFeather(ctx, cx + bodyRx * 0.5, bodyCy - bodyRy * 0.2, 16 * M, 20 * M, ramp, 1, back ? 1.25 : 1);
  }
  if (s.wings === 'bat') {
    wingBat(ctx, cx - bodyRx * 0.7, bodyCy - bodyRy * 0.3, 18 * M, 22 * M, ramp, -1);
    wingBat(ctx, cx + bodyRx * 0.7, bodyCy - bodyRy * 0.3, 18 * M, 22 * M, ramp, 1);
  }

  // --- tail ---
  // From behind, a centred tail hides inside the body — push it out to one side so
  // the player's own Guardian still reads as itself.
  const tailX = cx + bodyRx * (back ? -1.0 : 0.92);
  const tailY = bodyCy - bodyRy * (back ? 0.35 : 0.15);
  if (s.tail === 'flame') flameTail(ctx, tailX, tailY, 18 * M);
  else if (s.tail === 'leaf') leafTail(ctx, tailX, tailY, 16 * M, RAMP.leaf);
  else if (s.tail === 'bolt') boltTail(ctx, tailX - 2, tailY, 9 * M);
  else if (s.tail === 'drop') dropTail(ctx, tailX, tailY, 14 * M, RAMP.water);
  else if (s.tail === 'wisp') {
    for (let i = 0; i < 4; i++) {
      ellipse(ctx, tailX + i * 3 * M, tailY - i * 3 * M, (5 - i) * M, (4 - i * 0.7) * M, ramp[1]);
    }
  }

  // --- legs ---
  if (s.legs === 4) {
    for (const sx of [-1, 1]) {
      ellipse(ctx, cx + sx * bodyRx * 0.62, groundY - 3 * M, 4 * M, 4.5 * M, ramp[3]);
      ellipse(ctx, cx + sx * bodyRx * 0.34, groundY - 2 * M, 3.6 * M, 4 * M, ramp[2]);
    }
  } else if (s.legs === 2) {
    for (const sx of [-1, 1]) {
      ellipse(ctx, cx + sx * bodyRx * 0.42, groundY - 2.5 * M, 4 * M, 3.4 * M, P.gold2);
      fill(ctx, cx + sx * bodyRx * 0.42 - 3 * M, groundY - 1 * M, P.gold3, 6 * M, 1);
    }
  }

  // --- body ---
  orb(ctx, cx, bodyCy, bodyRx, bodyRy, ramp);
  if (!back) {
    ellipse(ctx, cx, bodyCy + bodyRy * 0.28, bodyRx * 0.6, bodyRy * 0.58, belly[1]);
  }
  if (s.shell) rockPlates(ctx, cx, bodyCy, bodyRx, bodyRy, RAMP.rock);
  if (s.mane) {
    for (let i = 0; i < 9; i++) {
      const a = Math.PI + (i / 8) * Math.PI;
      ellipse(ctx, cx + Math.cos(a) * headR * 1.15, headCy + Math.sin(a) * headR * 1.1,
        4.5 * M, 4 * M, i % 2 ? shade(s.base, -0.25) : shade(s.base, 0.12));
    }
  }
  if (s.serpent) {
    for (let i = 0; i < 3; i++) {
      ellipse(ctx, cx + (i - 1) * 5 * M, bodyCy + bodyRy * 0.5 + i * 2 * M, 6 * M, 3.4 * M, ramp[2]);
    }
  }
  // A wisp has no floor — it tapers into a tail instead of sitting on legs.
  if (s.shape === 'wisp') {
    for (let i = 0; i < 4; i++) {
      const k = 1 - i / 4;
      ellipse(ctx, cx + Math.sin(i * 1.1) * 3 * M, bodyCy + bodyRy * (0.8 + i * 0.34),
        bodyRx * 0.52 * k, bodyRy * 0.26 * k, ramp[2 + (i % 2)]);
    }
  }
  // A squat guardian is wider than it is tall and reads best with a heavy base.
  if (s.shape === 'squat') {
    ellipse(ctx, cx, bodyCy + bodyRy * 0.62, bodyRx * 0.92, bodyRy * 0.40, ramp[3]);
  }
  // A bird's chest is the shape you recognise it by.
  if (s.shape === 'bird' && !back) {
    ellipse(ctx, cx, bodyCy + bodyRy * 0.16, bodyRx * 0.62, bodyRy * 0.72, belly[1]);
    ellipse(ctx, cx, bodyCy + bodyRy * 0.30, bodyRx * 0.44, bodyRy * 0.52, belly[0]);
    for (let row = 0; row < 3; row++) for (let col = -1; col <= 1; col++) {
      const px = cx + col * 5 * M + (row % 2 ? 2 * M : 0), py = bodyCy + row * 4 * M;
      fill(ctx, px - 1, py, ramp[2], 1, 2);
      fill(ctx, px, py + 1, ramp[2], 1, 2);
    }
  }

  // --- head ---
  orb(ctx, cx, headCy, headR, headR * 0.94, ramp, { lift: 1 });

  // ears / horns / tufts
  for (const d of [-1, 1]) {
    const ex = cx + d * headR * 0.62, ey = headCy - headR * 0.68;
    if (s.ears === 'fox') earFox(ctx, ex, ey, 7 * M, 9 * M, ramp, d);
    else if (s.ears === 'rabbit') earRabbit(ctx, ex, ey, 6 * M, 15 * M, ramp, d);
    else if (s.ears === 'owl') tuftOwl(ctx, ex, ey, 5 * M, 7 * M, ramp, d);
    else if (s.ears === 'horn') hornStone(ctx, ex, ey, 6 * M, 8 * M, RAMP.rock, d);
  }

  // Crowns sit clear above the brow — a signature feature must never eat the face.
  if (s.crown === 'petal') petalCrown(ctx, cx, headCy - headR * 1.02, 7 * M, RAMP.gold.map(c => mix(c, P.bloom1, 0.6)));
  if (s.crown === 'leaf') leafTail(ctx, cx + 2 * M, headCy - headR * 1.15, 12 * M, RAMP.leaf);
  if (s.crown === 'ember') flameTail(ctx, cx, headCy - headR * 1.15, 12 * M);
  if (s.crown === 'stone') { for (let i = -1; i <= 1; i++) hornStone(ctx, cx + i * 5 * M, headCy - headR * 0.8, 5 * M, 6 * M, RAMP.rock, i); }
  if (s.crown === 'wave') {
    for (let i = -1; i <= 1; i++) ellipse(ctx, cx + i * 5 * M, headCy - headR * 0.85, 3.5 * M, 4.5 * M, RAMP.water[1]);
  }

  // face — the back view keeps the head shape but shows no face
  if (!back) {
    if (s.beak) {
      // The pale, heart-shaped facial disc is an owl's clearest identity cue.
      for (const d of [-1, 1]) {
        ellipse(ctx, cx + d * headR * .43, headCy + headR * .1,
          headR * .50, headR * .66, belly[1]);
        ellipse(ctx, cx + d * headR * .43, headCy + headR * .02,
          headR * .39, headR * .49, '#f8f0c8');
      }
    } else if (s.shape === 'quad') {
      ellipse(ctx, cx, headCy + headR * .46, headR * .55, headR * .33, belly[1]);
    }
    // Big eyes are most of the appeal at this size — 64x64 has room, use it.
    const eyeY = headCy + headR * 0.10;
    const eyeR = Math.max(2.4, 3.7 * M);
    eyes(ctx, cx, eyeY, headR * 0.46, eyeR, s.eye);
    for (const d of [-1, 1]) {          // a warm cheek keeps the face from reading flat
      ellipse(ctx, cx + d * headR * 0.78, eyeY + headR * 0.3, 2.4 * M, 1.6 * M, mix(s.base, P.bloom1, 0.45));
    }
    if (s.beak) {
      ellipse(ctx, cx, eyeY + headR * 0.42, 3.2 * M, 2.6 * M, P.gold2);
      fill(ctx, cx - 1, eyeY + headR * 0.42, P.gold3, 2, Math.max(1, 2 * M));
    } else {
      ellipse(ctx, cx, eyeY + headR * 0.38, 2.4 * M, 1.8 * M, shade(s.base, -0.5));
      fill(ctx, cx - 1 * M, eyeY + headR * 0.52, shade(s.base, -0.5), 2 * M, 1);
    }
    if (s.mark === 'blaze') ellipse(ctx, cx, headCy - headR * 0.42, 3 * M, 4 * M, belly[0]);
    if (s.mark === 'zag') {
      ctx.fillStyle = shade(s.base, -0.35);
      for (let i = 0; i < 4; i++) fill(ctx, cx - 5 * M + i * 2.5 * M, headCy - headR * 0.5 + (i % 2) * 2 * M, shade(s.base, -0.35), 2 * M, 1);
    }
    if (s.mark === 'splash') {
      for (const d of [-1, 1]) ellipse(ctx, cx + d * headR * 0.66, headCy + headR * 0.34, 2.2 * M, 1.6 * M, belly[0]);
    }
  } else {
    // back-of-head detail so the rear view isn't a blank egg
    ellipse(ctx, cx, headCy + headR * 0.1, headR * 0.55, headR * 0.5, shade(s.base, -0.14));
    if (s.shape === 'bird') {
      for (const d of [-1, 1]) for (let i = 0; i < 3; i++) {
        ellipse(ctx, cx + d * bodyRx * .68, bodyCy - bodyRy * .25 + i * 4 * M,
          bodyRx * .32, 4 * M, i % 2 ? ramp[3] : ramp[2]);
        fill(ctx, cx + d * bodyRx * .7 - 1, bodyCy + i * 4 * M, ramp[1], 2, 1);
      }
    }
  }

  // Separate the front paws from the belly so four-legged companions stand on
  // the ground instead of looking like a floating head and oval.
  if (s.legs === 4 && !s.shell) for (const d of [-1, 1]) {
    orb(ctx, cx + d * bodyRx * .52, groundY - 3 * M, 3.5 * M, 3.5 * M, ramp);
    fill(ctx, cx + d * bodyRx * .52 - 2 * M, groundY - 1 * M, belly[1], 4 * M, 1);
  }

  outline(ctx, W, H, shade(s.base, -0.6));
  // Research implementation: selective top-left rim light and signature pixels.
  // This is hand-directed by silhouette semantics, not a blanket sharpen filter.
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = mix(s.base, '#fff4c7', 0.58);
  ctx.globalAlpha = 0.52;
  ctx.fillRect(Math.round(cx-headR*.58), Math.round(headCy-headR*.72), Math.max(2,Math.round(headR*.62)), 1);
  ctx.fillRect(Math.round(cx-bodyRx*.62), Math.round(bodyCy-bodyRy*.68), Math.max(2,Math.round(bodyRx*.55)), 1);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  if (!back) {
    // two bright pixels strengthen eye focus at native resolution
    fill(ctx, Math.round(cx-headR*.48), Math.round(headCy-headR*.02), '#ffffff', Math.max(1,Math.round(M)), Math.max(1,Math.round(M)));
    fill(ctx, Math.round(cx+headR*.36), Math.round(headCy-headR*.02), '#ffffff', Math.max(1,Math.round(M)), Math.max(1,Math.round(M)));
    const sig = s.tail === 'flame' ? P.ember0 : s.tail === 'bolt' ? P.spark0 : s.tail === 'drop' ? RAMP.water[0] : s.tail === 'leaf' ? RAMP.leaf[0] : belly[0];
    fill(ctx, Math.round(cx+bodyRx*.70), Math.round(bodyCy-bodyRy*.45), sig, Math.max(1,Math.round(M)), Math.max(1,Math.round(M)));
  }

  if (s.glow) {
    ctx.globalCompositeOperation = 'lighter';
    ellipse(ctx, cx, bodyCy, bodyRx * 1.25, bodyRy * 1.2, 'rgba(245,200,119,0.16)');
    ctx.globalCompositeOperation = 'source-over';
  }
}

// Tiny overworld form: the same silhouette, simplified, with a 2-frame idle bob.
function paintOverworld(ctx, W, H, id, frame) {
  const s = SPEC[id];
  if (!s) return;
  const ramp = ramper(s.base);
  const bob = frame ? 1 : 0;
  const cx = W / 2, groundY = H - 2;
  ellipse(ctx, cx, groundY, 5, 2, 'rgba(0,0,0,0.28)');
  const bodyCy = groundY - 5 - bob;
  ellipse(ctx, cx, bodyCy, 4.5, 3.6, ramp[3]);
  ellipse(ctx, cx - 0.6, bodyCy - 0.8, 3.8, 2.8, ramp[2]);
  const headCy = bodyCy - 4.6;
  ellipse(ctx, cx, headCy, 4, 3.6, ramp[2]);
  ellipse(ctx, cx - 0.8, headCy - 0.8, 3, 2.4, ramp[1]);
  for (const d of [-1, 1]) {
    if (s.ears === 'rabbit') fill(ctx, cx + d * 2, headCy - 6, ramp[2], 1, 4);
    else if (s.ears !== 'none') fill(ctx, cx + d * 2.4 - (d < 0 ? 1 : 0), headCy - 4, ramp[3], 2, 3);
  }
  if (s.tail === 'flame') { fill(ctx, cx + 5, bodyCy - 3 - bob, P.ember1, 2, 3); fill(ctx, cx + 5, bodyCy - 4 - bob, P.ember0, 1, 1); }
  else if (s.tail === 'bolt') fill(ctx, cx + 5, bodyCy - 3, P.spark1, 2, 3);
  else if (s.tail === 'leaf') fill(ctx, cx + 5, bodyCy - 2, RAMP.leaf[1], 3, 2);
  else if (s.tail === 'drop') fill(ctx, cx + 5, bodyCy - 2, RAMP.water[1], 2, 3);
  fill(ctx, cx - 2, headCy, P.ink, 1, 1);
  fill(ctx, cx + 1, headCy, P.ink, 1, 1);
  outline(ctx, W, H, shade(s.base, -0.6));
}

export function register() {
  for (const g of GUARDIANS) {
    Atlas.define(`g.${g.id}.front`, 80, 80, (ctx, w, h) => paintCreature(ctx, w, h, g.id, 'front'));
    Atlas.define(`g.${g.id}.back`, 80, 80, (ctx, w, h) => paintCreature(ctx, w, h, g.id, 'back'));
    Atlas.defineAnim(`g.${g.id}.ow`, 16, 16, 2, (ctx, w, h, f) => paintOverworld(ctx, w, h, g.id, f));
  }
}

export { SPEC };
