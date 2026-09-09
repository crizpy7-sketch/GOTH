// The game's colour identity. One palette for the whole game keeps the world cohesive,
// which is most of what "readable at a glance" actually means.
//
// Warm, storybook, high mid-tone contrast: grass reads clearly against path, water
// reads clearly against both, and anything walkable is lighter than anything solid.

export const P = {
  // greens (grass, canopy)
  grass0: '#91bc5c', grass1: '#6f9f48', grass2: '#4f7f35', grass3: '#38652a', grass4: '#254a20',
  leaf0: '#77b953', leaf1: '#4f8f3d', leaf2: '#347331', leaf3: '#235629', leaf4: '#173c22',
  // earth (paths, dirt, cliffs)
  sand0: '#f0dfae', sand1: '#dfc48b', sand2: '#c3a067', sand3: '#9d7a4b', sand4: '#775836',
  soil0: '#b78a5b', soil1: '#96683f', soil2: '#74492b', soil3: '#55331d',
  rock0: '#cbc6bd', rock1: '#a8a29a', rock2: '#837c74', rock3: '#5e5852', rock4: '#403b37',
  // water
  water0: '#bfeaf2', water1: '#7fd3e6', water2: '#46abd2', water3: '#2b7fae', water4: '#1d5b85',
  // wood & buildings
  wood0: '#d9a96b', wood1: '#b8834a', wood2: '#8e6034', wood3: '#654223', wood4: '#452c17',
  roof0: '#f0836a', roof1: '#d95f4c', roof2: '#b04136', roof3: '#822b26',
  roofB0: '#7fb6d9', roofB1: '#5590bd', roofB2: '#3a6c96', roofB3: '#274d6f',
  roofG0: '#8fc98a', roofG1: '#63a464', roofG2: '#437c47', roofG3: '#2d5a33',
  plaster0: '#fdf3dc', plaster1: '#ecdcbb', plaster2: '#cfbb96', plaster3: '#a9936f',
  // accents
  gold0: '#ffe9a8', gold1: '#f5c877', gold2: '#dda23f', gold3: '#a9762a',
  ember0: '#ffd08a', ember1: '#ff9d4d', ember2: '#ef6b2a', ember3: '#c04214',
  bloom0: '#ffc7dd', bloom1: '#f593b9', bloom2: '#d1638f', bloom3: '#9e4468',
  violet0: '#d6c2f5', violet1: '#a98ada', violet2: '#7d5fb0', violet3: '#563d80',
  spark0: '#fff6c4', spark1: '#ffe066', spark2: '#e8b52c',
  // ink & UI
  ink: '#2b2118', ink2: '#3d2f22', ink3: '#54402e',
  paper0: '#fdf6e3', paper1: '#f4e8cd', paper2: '#e3d2ac', paper3: '#c9b184',
  ui0: '#f8f0d8', ui1: '#e0cfa6', ui2: '#8a6f4c', ui3: '#4a3826', ui4: '#241a12',
  shade: '#1a1420',
  white: '#ffffff', black: '#000000',
  // status colours
  hpGood: '#7ed957', hpWarn: '#f5c53f', hpBad: '#e8563f', xp: '#5cc8f0',
};

export const RAMP = {
  grass: [P.grass0, P.grass1, P.grass2, P.grass3, P.grass4],
  leaf: [P.leaf0, P.leaf1, P.leaf2, P.leaf3, P.leaf4],
  sand: [P.sand0, P.sand1, P.sand2, P.sand3, P.sand4],
  soil: [P.soil0, P.soil1, P.soil2, P.soil3],
  rock: [P.rock0, P.rock1, P.rock2, P.rock3, P.rock4],
  water: [P.water0, P.water1, P.water2, P.water3, P.water4],
  wood: [P.wood0, P.wood1, P.wood2, P.wood3, P.wood4],
  roof: [P.roof0, P.roof1, P.roof2, P.roof3],
  plaster: [P.plaster0, P.plaster1, P.plaster2, P.plaster3],
  gold: [P.gold0, P.gold1, P.gold2, P.gold3],
  ember: [P.ember0, P.ember1, P.ember2, P.ember3],
};

// Type identity colours — shared by battle UI, dex, and creature auras.
export const TYPE_COLOR = {
  ember: P.ember2, leaf: P.leaf2, tide: P.water3, stone: P.rock3,
  gale: '#9fd8e8', spark: P.spark2, bloom: P.bloom2, dusk: P.violet2, hearth: P.gold2,
};

// ---- pixel stamping ----
// rows: array of strings; palette: {char: color}. '.'/' ' are transparent.
export function Px(ctx, rows, palette, ox = 0, oy = 0) {
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      const c = palette[ch];
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(ox + x, oy + y, 1, 1);
    }
  }
}

// Vertical gradient fill in n discrete bands — keeps things pixel-honest.
export function bands(ctx, x, y, w, h, colors) {
  const n = colors.length;
  for (let i = 0; i < n; i++) {
    const y0 = y + Math.round(h * i / n), y1 = y + Math.round(h * (i + 1) / n);
    ctx.fillStyle = colors[i];
    ctx.fillRect(x, y0, w, y1 - y0);
  }
}

export function dither(ctx, x, y, w, h, color, density = 2) {
  ctx.fillStyle = color;
  for (let j = 0; j < h; j++) {
    for (let i = (j % density); i < w; i += density) ctx.fillRect(x + i, y + j, 1, 1);
  }
}

// ---- day / night / season lighting ----
// Returns the screen tint for a given time. The overworld applies this on the WEATHER
// layer so sprites and tiles are lit consistently.
const NIGHT = '#1a2340', DUSK = '#7a3f52', DAWN = '#8a6fa8', NOON = '#fff6d0';

export function tintFor(hour, season = 'spring', weather = 'clear') {
  let color = NIGHT, alpha = 0, mode = 'multiply';
  const h = hour % 24;
  if (h >= 6 && h < 8) { color = DAWN; alpha = lerpA(0.42, 0.10, (h - 6) / 2); }
  else if (h >= 8 && h < 17) { color = NOON; alpha = 0.06; mode = 'soft-light'; }
  else if (h >= 17 && h < 19) { color = '#ffb46b'; alpha = lerpA(0.10, 0.30, (h - 17) / 2); mode = 'soft-light'; }
  // The first night hour must already read as night.  The previous wash was so
  // pale that lamps and lit windows had no contrast against the ground.
  else if (h >= 19 && h < 21) { color = DUSK; alpha = lerpA(0.54, 0.70, (h - 19) / 2); }
  else if (h >= 21 || h < 4) { color = NIGHT; alpha = 0.70; }   // the small hours
  else { color = NIGHT; alpha = 0.58; }

  if (season === 'autumn') { if (mode === 'multiply') color = mix(color, '#c98a4a', 0.25); }
  if (season === 'winter') { alpha = Math.min(0.7, alpha + 0.06); color = mix(color, '#cfe6ff', 0.22); }
  if (season === 'summer') { if (h >= 8 && h < 17) alpha = 0.04; }
  if (weather === 'rain') { alpha = Math.min(0.72, alpha + 0.16); color = mix(color, '#4a6a86', 0.4); mode = 'multiply'; }
  if (weather === 'storm') { alpha = Math.min(0.8, alpha + 0.24); color = mix(color, '#2f4358', 0.5); mode = 'multiply'; }
  return { color, alpha, mode };
}

const lerpA = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));

export function mix(a, b, t) {
  const pa = hex(a), pb = hex(b);
  return '#' + [0, 1, 2].map(i =>
    Math.round(pa[i] + (pb[i] - pa[i]) * t).toString(16).padStart(2, '0')).join('');
}
export function shade(c, amt) { return mix(c, amt < 0 ? '#000000' : '#ffffff', Math.abs(amt)); }
function hex(c) {
  const s = c.replace('#', '');
  const n = s.length === 3 ? s.split('').map(x => x + x).join('') : s;
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
}

// Seasonal foliage recolour: builders pass tile colours through this so one tileset
// serves all four seasons.
export function seasonize(color, season) {
  if (season === 'spring') return color;
  if (season === 'summer') return mix(color, '#3f7a26', 0.18);
  if (season === 'autumn') return mix(color, '#e08a34', 0.55);
  if (season === 'winter') return mix(color, '#eef6ff', 0.62);
  return color;
}
