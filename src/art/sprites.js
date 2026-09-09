// ---------------------------------------------------------------------------
// Characters (16x24, origin bottom-centre) and buildings (footprint sized).
//
// Characters: one parametric painter, thirteen palettes and silhouettes. Every
// cast member must be identifiable from their colour block alone at 1x.
// Buildings: one parametric house painter with an explicit tier ladder —
//   t1 humble (plank walls, small dark windows, plain roof)
//   t2 settled (plaster + timber, chimney, proper shingles, planter)
//   t3 proud  (gold ridge, banners, lit windows, sign, emblem, steps)
// ---------------------------------------------------------------------------

import { Atlas } from './atlas.js';
import { P, RAMP, mix, shade } from './palette.js';
import { CHARS, DIRS4, CHAR_FRAMES, BUILDINGS } from './names.js';
import { px, hash, ellipse, shadedBlob, autoOutline, panelBox, strokeRect, tone } from './tiles.js';

const GLASS = ['#cfe7f2', '#8fbcd4', '#5c8ba8', '#3c5f78'];
const LITG = [P.gold0, P.gold1, P.gold2, P.gold3];
const ROOFV = [P.violet0, P.violet1, P.violet2, P.violet3];
const ROOFG = [P.roofG0, P.roofG1, P.roofG2, P.roofG3];
const ROOFB = [P.roofB0, P.roofB1, P.roofB2, P.roofB3];
const ROOFR = [P.roof0, P.roof1, P.roof2, P.roof3];
const STONE = RAMP.rock, WOOD = RAMP.wood, PLAS = RAMP.plaster;

// ===========================================================================
// CHARACTERS
// ===========================================================================

const SKIN = {
  fair: ['#ffe0bd', '#f0c39a', '#cf9b73'],
  warm: ['#f5c99b', '#dda877', '#b8814f'],
  tan: ['#dda06e', '#bd7f4f', '#945c34'],
  deep: ['#a9714a', '#8a5636', '#653b23'],
};

// hair / clothing choices are deliberately far apart in hue so a crowd reads.
const LOOKS = {
  hero: {
    skin: 'warm', hair: ['#c07a3f', '#8e5325'], hairStyle: 'short',
    top: ['#d07755', '#984936'], bottom: ['#4a5f8c', '#31416b'], shoe: ['#8e6034', '#5b3d21'],
    accent: '#e9c580', scarf: true, pack: ['#b58e58', '#775739'],
  },
  mayor: {
    skin: 'fair', hair: ['#d8d2c4', '#a49d8d'], hairStyle: 'bald',
    top: ['#4f8b31', '#36641f'], bottom: ['#7a6248', '#523f2c'], shoe: ['#5b3d21', '#3d2817'],
    accent: P.gold1, hat: 'tall', vest: P.gold2,
  },
  gran: {
    skin: 'fair', hair: ['#f2eee4', '#c6bfae'], hairStyle: 'bun',
    top: ['#b79ada', '#8065ad'], bottom: ['#6d5b8a', '#4a3c60'], shoe: ['#5b3d21', '#3d2817'],
    accent: P.bloom1, skirt: true, shawl: '#e0d3f2',
  },
  kid: {
    skin: 'fair', hair: ['#f2d472', '#c0a03f'], hairStyle: 'mop', child: true,
    top: ['#ffd45e', '#d99f2c'], bottom: ['#59a2d4', '#3a6c96'], shoe: ['#c04214', '#8a2e0e'],
    accent: P.spark1,
  },
  twin: {
    skin: 'tan', hair: ['#6b4a7d', '#472f56'], hairStyle: 'twin', child: true,
    top: ['#f593b9', '#c95f88'], bottom: ['#6fae45', '#4f8b31'], shoe: ['#8e6034', '#5b3d21'],
    accent: P.bloom0,
  },
  farmer: {
    skin: 'tan', hair: ['#8e6034', '#5f3d20'], hairStyle: 'short',
    top: ['#e8cf9a', '#bfa473'], bottom: ['#5f7fb0', '#3f5a84'], shoe: ['#654223', '#452c17'],
    accent: P.gold2, hat: 'straw', overalls: true,
  },
  smith: {
    skin: 'deep', hair: ['#3b2b23', '#241a14'], hairStyle: 'short',
    top: ['#b04136', '#822b26'], bottom: ['#4a3826', '#2f2417'], shoe: ['#3d2817', '#241a12'],
    accent: '#e8563f', apron: ['#8e6034', '#5b3d21'], band: '#e8563f', broad: true,
  },
  baker: {
    skin: 'fair', hair: ['#a4633a', '#70401f'], hairStyle: 'bun',
    top: ['#f593b9', '#c95f88'], bottom: ['#e3d2ac', '#b8a37d'], shoe: ['#8e6034', '#5b3d21'],
    accent: P.paper0, apron: ['#fdf6e3', '#d8cbaa'], hat: 'chef',
  },
  fisher: {
    skin: 'warm', hair: ['#3f5f7a', '#2a4055'], hairStyle: 'short',
    top: ['#5590bd', '#3a6c96'], bottom: ['#3f5a6b', '#2a3d49'], shoe: ['#e0cfa6', '#a99070'],
    accent: P.water0, hat: 'hood', boots: true,
  },
  ranger: {
    skin: 'tan', hair: ['#4f3a2a', '#33261b'], hairStyle: 'short',
    top: ['#4f8b31', '#33601f'], bottom: ['#6b5238', '#493724'], shoe: ['#493724', '#2e2216'],
    accent: P.leaf0, hat: 'hood', cloak: ['#63a464', '#2d5a33'], quiver: true,
  },
  weaver: {
    skin: 'warm', hair: ['#2f2438', '#1c1524'], hairStyle: 'long',
    top: ['#a98ada', '#7d5fb0'], bottom: ['#563d80', '#3a2857'], shoe: ['#5b3d21', '#3d2817'],
    accent: P.violet0, skirt: true, shawl: '#f5c877',
  },
  peddler: {
    skin: 'deep', hair: ['#4a3220', '#2d1e13'], hairStyle: 'short',
    top: ['#dda23f', '#a9762a'], bottom: ['#8e6034', '#5b3d21'], shoe: ['#452c17', '#2b1a0e'],
    accent: P.roof0, hat: 'wide', pack: ['#b04136', '#822b26'],
  },
  rival: {
    skin: 'fair', hair: ['#e6eef7', '#a9bcd0'], hairStyle: 'swept',
    top: ['#3a4f7a', '#25334f'], bottom: ['#2f3a52', '#1d2534'], shoe: ['#4a3826', '#2b1f14'],
    accent: '#cfe7f2', collar: '#f2f7ff', cloak: ['#4f6b9c', '#25334f'],
  },
};

function metrics(child) {
  return child
    ? { hy: 3, hh: 9, ny: 12, ty: 13, tb: 16, ly: 17, fy: 21 }
    : { hy: 1, hh: 10, ny: 11, ty: 12, tb: 16, ly: 17, fy: 21 };
}

function charPainter(look) {
  return (ctx, w, h, frame) => {
    const pose = frame === 1 ? 1 : frame === 3 ? -1 : 0;
    const dir = look.__dir;
    const flip = dir === 'right';
    if (flip) { ctx.save(); ctx.translate(16, 0); ctx.scale(-1, 1); }
    drawCharacter(ctx, look, flip ? 'left' : dir, pose);
    if (flip) ctx.restore();
    autoOutline(ctx, 16, 24, 0.46, 0.26);
  };
}

function drawCharacter(ctx, L, dir, pose) {
  const m = metrics(L.child);
  const sk = SKIN[L.skin];
  const bob = pose !== 0 ? -1 : 0;
  const side = dir === 'left';
  const back = dir === 'up';

  drawLegs(ctx, L, dir, pose, m);
  drawTorso(ctx, L, dir, pose, m, bob, sk);
  drawHead(ctx, L, dir, m, bob, sk, side, back);
}

function drawLegs(ctx, L, dir, pose, m) {
  const [b0, b1] = L.bottom, [s0, s1] = L.shoe;
  const legTop = m.ly, footTop = m.fy;
  const far = [shade(b0, -0.22), shade(b1, -0.22)];
  const farS = [shade(s0, -0.22), shade(s1, -0.22)];

  const leg = (x, top, cols, shoes, footY) => {
    px(ctx, x, top, cols[0], 3, footY - top);
    px(ctx, x + 2, top, cols[1], 1, footY - top);
    px(ctx, x, footY, shoes[0], 3, 2);
    px(ctx, x, footY, shade(shoes[0], 0.18), 3, 1);
    px(ctx, x + 2, footY, shoes[1], 1, 2);
  };

  if (L.skirt) {
    // skirt hides the stride; legs peek out below
    px(ctx, 4, legTop, L.bottom[0], 8, 3);
    px(ctx, 3, legTop + 1, L.bottom[0], 10, 2);
    px(ctx, 3, legTop + 2, L.bottom[1], 10, 1);
    const o = pose === 0 ? 0 : 1;
    px(ctx, 5 + (pose > 0 ? -1 : 0), legTop + 3, SKIN[L.skin][1], 2, footTop - legTop - 3);
    px(ctx, 9 + (pose < 0 ? 1 : 0), legTop + 3, SKIN[L.skin][2], 2, footTop - legTop - 3);
    px(ctx, 5 + (pose > 0 ? -1 : 0), footTop - o, L.shoe[0], 2, 2);
    px(ctx, 9 + (pose < 0 ? 1 : 0), footTop, L.shoe[0], 2, 2);
    return;
  }

  if (dir === 'left' || dir === 'right') {
    const fwd = -1;   // 'left' is authored; 'right' is mirrored by the caller
    let nearX, farX;
    if (pose === 0) { nearX = 6; farX = 7; }
    else if (pose === 1) { nearX = 6 + fwd * 2; farX = 7 - fwd * 2; }
    else { nearX = 6 - fwd * 2; farX = 7 + fwd * 2; }
    leg(farX, legTop, far, farS, footTop);
    leg(nearX, legTop, L.bottom, L.shoe, footTop);
  } else {
    const lx = 4, rx = 9;
    if (pose === 0) {
      leg(lx, legTop, L.bottom, L.shoe, footTop);
      leg(rx, legTop, L.bottom, L.shoe, footTop);
    } else if (pose === 1) {
      leg(lx - 1, legTop, L.bottom, L.shoe, footTop);
      leg(rx, legTop, far, farS, footTop - 1);
    } else {
      leg(lx, legTop, far, farS, footTop - 1);
      leg(rx + 1, legTop, L.bottom, L.shoe, footTop);
    }
  }
}

function drawTorso(ctx, L, dir, pose, m, bob, sk) {
  const [t0, t1] = L.top;
  const ty = m.ty + bob, tb = m.tb + bob;
  const hgt = tb - ty + 1;
  const broad = L.broad ? 1 : 0;
  const side = dir === 'left' || dir === 'right';

  // torso block
  const x0 = side ? 4 : 4 - broad, x1 = side ? 11 : 11 + broad;
  px(ctx, x0, ty, t0, x1 - x0 + 1, hgt);
  px(ctx, x0, ty, shade(t0, 0.14), x1 - x0 + 1, 1);
  px(ctx, x1, ty, t1, 1, hgt);
  px(ctx, x0, tb, t1, x1 - x0 + 1, 1);

  if (L.cloak) {
    px(ctx, x0 - 1, ty, L.cloak[0], 3, hgt + 1);
    px(ctx, x1 - 1, ty, L.cloak[1], 3, hgt + 1);
    px(ctx, x0 - 1, ty, shade(L.cloak[0], 0.15), 3, 1);
  }
  if (L.apron) {
    px(ctx, 5, ty + 1, L.apron[0], 6, hgt);
    px(ctx, 5, ty + 1, shade(L.apron[0], 0.12), 6, 1);
    px(ctx, 10, ty + 1, L.apron[1], 1, hgt);
  }
  if (L.overalls) {
    px(ctx, 5, ty, L.bottom[0], 2, hgt); px(ctx, 9, ty, L.bottom[0], 2, hgt);
    px(ctx, 5, tb - 1, L.bottom[0], 6, 2);
    px(ctx, 5, ty, shade(L.bottom[0], 0.14), 2, 1); px(ctx, 9, ty, shade(L.bottom[0], 0.14), 2, 1);
    px(ctx, 6, tb, P.gold2); px(ctx, 9, tb, P.gold2);
  }
  if (L.vest) {
    px(ctx, 5, ty + 1, L.vest, 2, hgt - 1); px(ctx, 9, ty + 1, L.vest, 2, hgt - 1);
    px(ctx, 7, ty + 3, shade(L.vest, -0.2), 2, 1);
  }
  if (L.scarf) {
    px(ctx, 4, ty, L.accent, 8, 2);
    px(ctx, 4, ty, shade(L.accent, 0.2), 8, 1);
    px(ctx, dir === 'up' ? 5 : 10, ty + 2, shade(L.accent, -0.12), 2, 3);
  }
  if (L.collar) {
    px(ctx, 4, ty, L.collar, 8, 2);
    px(ctx, 6, ty + 2, shade(L.collar, -0.1), 4, 1);
  }
  if (L.pack && dir !== 'down') {
    const packX = side ? 10 : 5, packW = side ? 3 : 6;
    px(ctx, packX, ty + 1, L.pack[0], packW, hgt);
    px(ctx, packX, ty + 1, shade(L.pack[0], 0.15), packW, 1);
    px(ctx, packX + packW - 1, ty + 2, L.pack[1], 1, hgt - 1);
    px(ctx, packX, tb + 1, L.pack[1], packW, 1);
    px(ctx, packX + 1, ty + 3, P.gold1, side ? 1 : 3, 1);
  }
  if (L.quiver && dir !== 'down') {
    px(ctx, 11, ty - 1, P.wood3, 3, 6);
    px(ctx, 11, ty - 1, P.wood2, 1, 6);
    px(ctx, 12, ty - 3, P.paper1, 1, 3); px(ctx, 12, ty - 4, P.paper0);
  }

  // arms + hands
  const swing = pose;
  if (side) {
    const ax = 4, ay = ty + 1 + (swing > 0 ? 1 : 0);
    px(ctx, ax, ay, t1, 2, hgt - 1);
    px(ctx, ax, ay, shade(t1, 0.12), 2, 1);
    px(ctx, ax, ay + hgt - 1, sk[0], 2, 2);
    px(ctx, ax + 1, ay + hgt - 1, sk[1], 1, 2);
  } else {
    const aL = ty + (swing > 0 ? 1 : 0), aR = ty + (swing < 0 ? 1 : 0);
    px(ctx, 2 - broad, aL, t1, 2, hgt);
    px(ctx, 2 - broad, aL, shade(t1, 0.12), 2, 1);
    px(ctx, 12 + broad, aR, t1, 2, hgt);
    px(ctx, 12 + broad, aR, shade(t1, 0.12), 2, 1);
    px(ctx, 2 - broad, aL + hgt, sk[0], 2, 2);
    px(ctx, 12 + broad, aR + hgt, sk[0], 2, 2);
    px(ctx, 3 - broad, aL + hgt, sk[1], 1, 2);
    px(ctx, 13 + broad, aR + hgt, sk[1], 1, 2);
  }
  // neck
  px(ctx, 6, m.ny + bob, sk[1], 4, 1);
  px(ctx, 6, m.ny + bob, sk[2], 4, 1);
}

function drawHead(ctx, L, dir, m, bob, sk, side, back) {
  const hy = m.hy + bob, hb = hy + m.hh - 1;
  const [h0, h1] = L.hair;

  // skull
  px(ctx, 3, hy + 1, sk[0], 10, m.hh - 2);
  px(ctx, 4, hy, sk[0], 8, 1);
  px(ctx, 4, hb, sk[0], 8, 1);
  px(ctx, 11, hy + 1, sk[1], 2, m.hh - 2);
  px(ctx, 12, hy + 2, sk[1], 1, m.hh - 4);
  px(ctx, 4, hb, sk[1], 8, 1);
  px(ctx, 3, hy + 1, mix(sk[0], '#fff', 0.25), 1, 3);

  // hair
  const st = L.hairStyle;
  const cap = (rows) => {
    px(ctx, 4, hy, h0, 8, 1);
    px(ctx, 3, hy + 1, h0, 10, rows - 1);
    px(ctx, 3, hy + 1, mix(h0, '#fff', 0.2), 4, 1);
    px(ctx, 11, hy + 1, h1, 2, rows - 1);
    px(ctx, 3, hy + rows - 1, h1, 10, 1);
  };
  if (back) {
    // rear of the head: all hair, keep the silhouette of the style
    cap(m.hh - 1);
    px(ctx, 3, hy + 1, h0, 10, m.hh - 2);
    px(ctx, 3, hy + 1, mix(h0, '#fff', 0.18), 4, 2);
    px(ctx, 11, hy + 1, h1, 2, m.hh - 2);
    px(ctx, 4, hb - 1, h1, 8, 2);
    px(ctx, 5, hb, sk[2], 6, 1);
  } else if (st === 'bald') {
    px(ctx, 3, hy + 1, h0, 10, 2);
    px(ctx, 3, hy + 3, h0, 1, 3); px(ctx, 12, hy + 3, h1, 1, 3);
    px(ctx, 5, hy, h0, 6, 1);
  } else if (st === 'mop') {
    cap(5);
    for (let x = 3; x < 13; x += 2) px(ctx, x, hy + 4, h0, 1, 2);
    px(ctx, 3, hy + 4, h1, 1, 3); px(ctx, 12, hy + 4, h1, 1, 3);
  } else if (st === 'long') {
    cap(4);
    px(ctx, 2, hy + 2, h0, 2, m.hh + 2); px(ctx, 12, hy + 2, h1, 2, m.hh + 2);
    px(ctx, 2, hy + 2, mix(h0, '#fff', 0.16), 1, 4);
  } else if (st === 'bun') {
    cap(4);
    shadedBlob(ctx, 8, hy - 2, 3.2, 2.4, [mix(h0, '#fff', 0.3), h0, h1, shade(h1, -0.2)], { edge: 0.2 });
    px(ctx, 3, hy + 3, h1, 1, 2); px(ctx, 12, hy + 3, h1, 1, 2);
  } else if (st === 'twin') {
    cap(4);
    for (const bx of [1, 12]) {
      shadedBlob(ctx, bx + 1, hy + 5, 2.4, 2.8, [mix(h0, '#fff', 0.25), h0, h1, shade(h1, -0.2)], { edge: 0.2 });
      px(ctx, bx + 1, hy + 3, L.accent, 2, 1);
    }
  } else if (st === 'swept') {
    cap(4);
    px(ctx, 3, hy + 4, h0, 3, 2);
    px(ctx, 10, hy, h0, 4, 2); px(ctx, 12, hy - 1, h0, 2, 2);
    px(ctx, 12, hy + 3, h1, 1, 3);
  } else {
    cap(4);
    px(ctx, 3, hy + 4, h0, 2, 3); px(ctx, 12, hy + 4, h1, 1, 3);
  }

  // hats
  const hat = L.hat;
  if (hat === 'straw') {
    px(ctx, 1, hy + 2, P.gold2, 14, 2);
    px(ctx, 1, hy + 2, P.gold1, 14, 1);
    px(ctx, 4, hy - 2, P.gold1, 8, 4);
    px(ctx, 4, hy - 2, P.gold0, 8, 1);
    px(ctx, 11, hy - 1, P.gold3, 1, 3);
    px(ctx, 4, hy + 1, P.gold3, 8, 1);
  } else if (hat === 'tall') {
    px(ctx, 3, hy + 1, P.leaf3, 10, 2);
    px(ctx, 5, hy - 5, P.leaf2, 6, 6);
    px(ctx, 5, hy - 5, P.leaf1, 2, 6);
    px(ctx, 5, hy - 2, P.gold2, 6, 1);
    px(ctx, 10, hy - 5, P.leaf4, 1, 6);
  } else if (hat === 'chef') {
    px(ctx, 3, hy, P.paper0, 10, 2);
    px(ctx, 4, hy - 3, P.paper0, 8, 3);
    px(ctx, 4, hy - 3, P.white, 8, 1);
    px(ctx, 11, hy - 2, P.paper2, 1, 3);
    px(ctx, 3, hy + 2, P.paper2, 10, 1);
  } else if (hat === 'hood') {
    const hc = L.cloak ? L.cloak : L.top;
    px(ctx, 2, hy, hc[0], 12, 4);
    px(ctx, 2, hy, shade(hc[0], 0.15), 12, 1);
    px(ctx, 2, hy + 4, hc[0], 2, 4); px(ctx, 12, hy + 4, hc[1], 2, 4);
    px(ctx, 4, hy + 3, shade(hc[1], -0.1), 8, 1);
    px(ctx, 2, hy + 7, hc[1], 12, 2);
  } else if (hat === 'wide') {
    px(ctx, 0, hy + 2, P.wood3, 16, 2);
    px(ctx, 0, hy + 2, P.wood2, 16, 1);
    px(ctx, 4, hy - 3, P.wood2, 8, 5);
    px(ctx, 4, hy - 3, P.wood1, 8, 1);
    px(ctx, 4, hy + 1, P.roof2, 8, 1);
    px(ctx, 11, hy - 2, P.wood4, 1, 4);
  }
  if (L.band) { px(ctx, 3, hy + 3, L.band, 10, 1); px(ctx, 3, hy + 3, shade(L.band, 0.2), 4, 1); }
  if (L.shawl) {
    px(ctx, 3, hb + 1, L.shawl, 10, 2);
    px(ctx, 2, hb + 2, L.shawl, 12, 2);
    px(ctx, 2, hb + 3, shade(L.shawl, -0.18), 12, 1);
  }

  if (back) return;

  // face
  const eyeY = hy + Math.round(m.hh * 0.52);
  const dark = P.ink;
  const white = '#ffffff';
  if (side) {
    // three-quarter-ish profile: one big eye toward the front, hair over the back
    px(ctx, 4, eyeY, dark, 2, 2);
    px(ctx, 4, eyeY, white, 1, 1);
    px(ctx, 3, eyeY + 1, mix(sk[1], P.ink3, 0.35), 1, 1);
    px(ctx, 4, eyeY + 3, mix(sk[2], P.ink3, 0.4), 2, 1);
    px(ctx, 8, hy + 1, h0, 5, m.hh - 3);
    px(ctx, 11, hy + 1, h1, 2, m.hh - 3);
    px(ctx, 6, eyeY + 2, mix(sk[1], P.roof1, 0.35), 2, 1);
  } else {
    px(ctx, 4, eyeY, dark, 2, 2);
    px(ctx, 10, eyeY, dark, 2, 2);
    px(ctx, 4, eyeY, white, 1, 1);
    px(ctx, 10, eyeY, white, 1, 1);
    px(ctx, 7, eyeY + 2, mix(sk[2], P.ink3, 0.3), 2, 1);
    px(ctx, 3, eyeY + 2, mix(sk[1], P.roof1, 0.4), 1, 1);
    px(ctx, 12, eyeY + 2, mix(sk[1], P.roof1, 0.4), 1, 1);
  }
}

// ===========================================================================
// BUILDINGS
// ===========================================================================

function plankWall(ctx, x, y, w, h, ramp) {
  px(ctx, x, y, ramp[1], w, h);
  for (let i = 0; i < w; i += 4) {
    px(ctx, x + i, y, mix(ramp[1], ramp[0], 0.5), 3, h);
    px(ctx, x + i + 3, y, ramp[3], 1, h);
    for (let j = 0; j < h; j++) if (hash(i, j, 301) > 0.94) px(ctx, x + i + 1, y + j, ramp[2]);
  }
  px(ctx, x, y, ramp[0], w, 1);
}

function plasterWall(ctx, x, y, w, h, ramp, beams) {
  px(ctx, x, y, ramp[1], w, h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const n = hash(i, j, 307);
    if (n > 0.95) px(ctx, x + i, y + j, ramp[0]);
    else if (n < 0.05) px(ctx, x + i, y + j, ramp[2]);
  }
  px(ctx, x, y, ramp[0], w, 1);
  px(ctx, x, y, ramp[0], 1, h);
  px(ctx, x + w - 1, y, ramp[2], 1, h);
  if (beams) {
    // half-timbered corners and a mid rail
    px(ctx, x, y, P.wood2, 2, h); px(ctx, x + w - 2, y, P.wood3, 2, h);
    px(ctx, x, y, P.wood1, 1, h);
    const rail = y + Math.floor(h * 0.55);
    px(ctx, x, rail, P.wood2, w, 2);
    px(ctx, x, rail, P.wood1, w, 1);
  }
}

function stoneBase(ctx, x, y, w, h) {
  px(ctx, x, y, STONE[2], w, h);
  for (let r = 0; r < Math.ceil(h / 3); r++) {
    const yy = y + r * 3, off = r % 2 ? -2 : 0;
    for (let i = off; i < w; i += 6) {
      px(ctx, x + Math.max(0, i), yy, STONE[1], Math.min(5, w - Math.max(0, i)), 2);
      px(ctx, x + Math.max(0, i), yy, STONE[0], Math.min(5, w - Math.max(0, i)), 1);
    }
  }
  px(ctx, x, y + h - 1, STONE[4], w, 1);
}

function shingleRoof(ctx, W, roofH, ramp, o = {}) {
  const topHalf = Math.max(2, Math.round(W / 2 - roofH * 0.62));
  const rows = [];
  for (let y = 0; y < roofH; y++) {
    const t = roofH === 1 ? 1 : y / (roofH - 1);
    const half = topHalf + (W / 2 - topHalf) * t;
    const x0 = Math.round(W / 2 - half), x1 = Math.round(W / 2 + half) - 1;
    rows.push([x0, x1]);
    const band = y % 4;
    const row = Math.floor(y / 4);
    let c = ramp[1];
    if (band === 0) c = mix(ramp[0], ramp[1], 0.30);
    if (band === 3) c = ramp[2];
    px(ctx, x0, y, c, x1 - x0 + 1, 1);
    // Broad, staggered clay shingles. Their light catches the curved upper lip;
    // short joints leave room for colour and avoid the old striped-roof effect.
    const offset = row % 2 ? 3 : 0;
    for (let x = offset; x < W; x += 6) {
      if (x > x0 && x < x1 && band >= 2) px(ctx, x, y, ramp[2]);
      if (band === 1 && x + 1 >= x0 && x + 3 < x1) {
        px(ctx, x + 1, y, mix(ramp[0], ramp[1], hash(x, row, 419) * 0.6), 3, 1);
      }
    }
    // lit left slope / shaded right slope
    px(ctx, x0, y, mix(c, '#ffe7bb', 0.13), Math.max(1, Math.round((x1 - x0) * 0.12)), 1);
    px(ctx, x1 - Math.max(0, Math.round((x1 - x0) * 0.07)), y, mix(ramp[2], ramp[3], 0.6), Math.max(1, Math.round((x1 - x0) * 0.07) + 1), 1);
    // keyline on the slope edges (autoOutline can't reach off-canvas)
    px(ctx, x0, y, ramp[3]);
    px(ctx, x1, y, shade(ramp[3], -0.2));
  }
  // ridge
  const [rx0, rx1] = rows[0];
  px(ctx, rx0, 0, o.ridge || ramp[3], rx1 - rx0 + 1, 1);
  if (o.ridge) {
    px(ctx, rx0, 1, o.ridge, rx1 - rx0 + 1, 1);
    px(ctx, rx0, 0, shade(o.ridge, 0.3), rx1 - rx0 + 1, 1);
  }
  // eaves board
  const [ex0, ex1] = rows[roofH - 1];
  px(ctx, ex0, roofH - 1, ramp[3], ex1 - ex0 + 1, 1);
  px(ctx, ex0, roofH - 2, ramp[2], ex1 - ex0 + 1, 1);
  if (o.scallop) {
    for (let x = ex0; x <= ex1; x += 3) px(ctx, x, roofH, ramp[2], 2, 1);
  }
  return rows;
}

function window9(ctx, x, y, w, h, lit, o = {}) {
  strokeRect(ctx, x - 1, y - 1, w + 2, h + 2, P.wood4);
  px(ctx, x, y, lit ? LITG[1] : GLASS[1], w, h);
  px(ctx, x, y, lit ? LITG[0] : GLASS[0], w, Math.max(1, (h >> 1) - 1));
  px(ctx, x, y + h - 2, lit ? LITG[2] : GLASS[2], w, 2);
  if (w >= 5) px(ctx, x + ((w - 1) >> 1), y, P.wood3, 1, h);
  if (h >= 5) px(ctx, x, y + ((h - 1) >> 1), P.wood3, w, 1);
  // sill
  px(ctx, x - 2, y + h + 1, P.wood2, w + 4, 1);
  px(ctx, x - 2, y + h + 1, P.wood1, w + 4, 1);
  px(ctx, x - 2, y + h + 2, P.wood3, w + 4, 1);
  if (o.shutters) {
    px(ctx, x - 3, y - 1, o.shutters, 2, h + 2);
    px(ctx, x + w + 1, y - 1, shade(o.shutters, -0.2), 2, h + 2);
  }
  if (o.box) {
    px(ctx, x - 1, y + h + 2, P.wood2, w + 2, 3);
    px(ctx, x - 1, y + h + 2, P.wood1, w + 2, 1);
    for (let i = 0; i < w + 1; i += 2) {
      px(ctx, x + i - 1, y + h + 1, P.leaf2, 1, 1);
      px(ctx, x + i, y + h + 1, i % 4 ? P.bloom1 : P.gold1, 1, 1);
    }
  }
}

function doorway(ctx, cx, baseY, w, h, tier, o = {}) {
  const x = cx - (w >> 1);
  px(ctx, x - 1, baseY - h - 1, P.wood4, w + 2, h + 1);
  px(ctx, x, baseY - h, P.wood2, w, h);
  px(ctx, x, baseY - h, P.wood1, w, 1);
  for (let i = 1; i < w; i += 3) px(ctx, x + i, baseY - h + 1, P.wood3, 1, h - 1);
  px(ctx, x + 1, baseY - h + 2, P.wood1, w - 3, Math.floor(h / 2) - 2);
  px(ctx, x + 1, baseY - h + 2, P.wood0, w - 3, 1);
  px(ctx, x + w - 2, baseY - h, P.wood4, 1, h);
  px(ctx, x + w - 3, baseY - Math.round(h * 0.55), P.gold2, 2, 2);
  px(ctx, x + w - 3, baseY - Math.round(h * 0.55), P.gold0, 1, 1);
  if (tier >= 2) {
    px(ctx, x - 2, baseY - h - 2, P.wood2, w + 4, 2);
    px(ctx, x - 2, baseY - h - 2, P.wood1, w + 4, 1);
  }
  if (tier >= 3) {
    px(ctx, x - 3, baseY, STONE[1], w + 6, 2);
    px(ctx, x - 3, baseY, STONE[0], w + 6, 1);
    px(ctx, x - 2, baseY - 1, STONE[0], w + 4, 1);
    // little porch lanterns
    for (const lx of [x - 4, x + w + 2]) {
      px(ctx, lx, baseY - h - 1, P.wood3, 1, 3);
      px(ctx, lx - 1, baseY - h + 1, LITG[2], 3, 3);
      px(ctx, lx - 1, baseY - h + 1, LITG[0], 3, 1);
      px(ctx, lx, baseY - h + 2, P.white, 1, 1);
    }
  }
  if (o.arch) {
    ellipse(ctx, cx, baseY - h, w / 2 + 1, 4, (X, Y, dx, dy, d) =>
      dy > 0 ? null : (d > 0.72 ? P.wood4 : P.wood2));
  }
}

function chimney(ctx, x, y, h, smoke) {
  px(ctx, x, y, STONE[2], 6, h);
  px(ctx, x, y, STONE[1], 4, h);
  px(ctx, x, y, STONE[0], 1, h);
  px(ctx, x + 5, y, STONE[3], 1, h);
  px(ctx, x - 1, y, STONE[1], 8, 2);
  px(ctx, x - 1, y, STONE[0], 8, 1);
  px(ctx, x + 1, y + 1, '#2a2130', 4, 1);
  for (let r = 0; r < Math.floor(h / 3); r++) px(ctx, x, y + 3 + r * 3, STONE[3], 6, 1);
  if (smoke) {
    ctx.globalAlpha = 0.5;
    for (const [ox, oy, r] of [[2, -3, 1.6], [4, -6, 2.0], [1, -9, 2.4]]) {
      ellipse(ctx, x + ox, y + oy, r, r, '#e8e2ee');
    }
    ctx.globalAlpha = 1;
  }
}

function banner(ctx, x, y, h, c0, c1) {
  px(ctx, x, y, c0, 4, h);
  px(ctx, x, y, shade(c0, 0.2), 1, h);
  px(ctx, x + 3, y, c1, 1, h);
  px(ctx, x, y, P.gold1, 4, 1);
  px(ctx, x, y + h, c1, 1, 1); px(ctx, x + 3, y + h, c1, 1, 1);
  px(ctx, x + 1, y + h - 1, P.gold2, 2, 1);
}

const EMBLEM = {
  flame(ctx, x, y) {
    ellipse(ctx, x, y + 1, 2.4, 3, (X, Y, dx, dy, d) => d > 0.72 ? P.ember3 : P.ember1);
    px(ctx, x, y - 3, P.ember2); px(ctx, x, y, P.spark0, 1, 2);
  },
  pot(ctx, x, y) {
    px(ctx, x - 3, y, STONE[2], 7, 4); px(ctx, x - 3, y, STONE[1], 7, 1);
    px(ctx, x - 4, y - 1, STONE[1], 9, 1);
    px(ctx, x - 1, y - 4, '#e8e2ee', 3, 2);
  },
  hammer(ctx, x, y) {
    px(ctx, x - 3, y - 3, STONE[1], 6, 3); px(ctx, x - 3, y - 3, STONE[0], 6, 1);
    px(ctx, x, y, P.wood2, 2, 5); px(ctx, x, y, P.wood1, 1, 5);
  },
  book(ctx, x, y) {
    px(ctx, x - 4, y - 3, P.paper0, 8, 6); px(ctx, x - 4, y - 3, P.white, 8, 1);
    px(ctx, x - 1, y - 3, P.roof2, 2, 6);
    px(ctx, x - 4, y + 3, P.paper3, 8, 1);
  },
  heart(ctx, x, y) {
    px(ctx, x - 3, y - 3, P.roof1, 2, 3); px(ctx, x + 1, y - 3, P.roof1, 2, 3);
    px(ctx, x - 3, y, P.roof1, 6, 1); px(ctx, x - 2, y + 1, P.roof2, 4, 1);
    px(ctx, x - 1, y + 2, P.roof2, 2, 1); px(ctx, x - 3, y - 3, P.roof0, 1, 1);
  },
  drop(ctx, x, y) {
    ellipse(ctx, x, y + 1, 2.6, 3, (X, Y, dx, dy, d) => d > 0.7 ? P.water3 : P.water1);
    px(ctx, x, y - 3, P.water2); px(ctx, x - 1, y, P.water0);
  },
  coin(ctx, x, y) {
    ellipse(ctx, x, y, 3.4, 3.4, (X, Y, dx, dy, d) => d > 0.72 ? P.gold3 : (dx + dy < -0.2 ? P.gold0 : P.gold1));
    px(ctx, x, y - 1, P.gold3, 1, 3);
  },
  flower(ctx, x, y) {
    for (const [dx, dy] of [[0, -2], [-2, 0], [2, 0], [0, 2]]) px(ctx, x + dx, y + dy, P.bloom1, 2, 2);
    px(ctx, x, y, P.gold1, 2, 2); px(ctx, x, y, P.gold0);
  },
  bell(ctx, x, y) {
    ellipse(ctx, x, y, 3.4, 3, (X, Y, dx, dy, d) => dy > 0.4 ? null : (d > 0.7 ? P.gold3 : P.gold1));
    px(ctx, x - 3, y + 1, P.gold2, 7, 1); px(ctx, x, y + 2, P.gold3, 1, 1);
    px(ctx, x - 3, y + 1, P.gold0, 2, 1);
  },
  leaf(ctx, x, y) {
    ellipse(ctx, x, y, 3.4, 2.4, (X, Y, dx, dy, d) => d > 0.75 ? P.leaf3 : (dx + dy < -0.1 ? P.leaf0 : P.leaf1));
    px(ctx, x - 3, y + 2, P.leaf3, 3, 1);
  },
};

/** the generic house: roof over walls, door, windows, tier dressing */
function house(ctx, W, H, cfg) {
  const t = cfg.tier;
  const overhangPx = cfg.overhang * 16;
  const roofH = overhangPx + (cfg.roofExtra ?? 8);
  const wallTop = Math.max(0, roofH - 4);
  const wallH = H - wallTop;
  const baseH = t >= 2 ? 4 : 3;
  const ramp = cfg.roof;
  // walls (inset 1px so the silhouette gets an outline)
  if (t === 1) plankWall(ctx, 1, wallTop, W - 2, wallH, WOOD);
  else plasterWall(ctx, 1, wallTop, W - 2, wallH, PLAS, true);
  stoneBase(ctx, 1, H - baseH, W - 2, baseH);

  // roof
  const rows = shingleRoof(ctx, W, roofH, t === 1 ? ramp.map(c => mix(c, P.rock2, 0.16)) : ramp, {
    ridge: t >= 3 ? P.gold2 : null,
    scallop: t >= 3,
  });
  // eaves shadow on the wall
  const [ex0, ex1] = rows[roofH - 1];
  ctx.globalAlpha = 0.30;
  px(ctx, Math.max(1, ex0), roofH, '#241a2e', Math.min(W - 2, ex1 - ex0 + 1), 2);
  ctx.globalAlpha = 1;

  // gable emblem
  if (t >= 2 && cfg.emblem && roofH > 14) {
    EMBLEM[cfg.emblem](ctx, W >> 1, Math.round(roofH * 0.45));
  }

  // door
  const doorW = W >= 40 ? 12 : 10;
  const doorH = Math.min(wallH - baseH - 2, t >= 3 ? 17 : 15);
  doorway(ctx, cfg.doorCX ?? (W >> 1), H - baseH, doorW, doorH, t, { arch: t >= 3 });

  // windows
  const winY = wallTop + 7;
  const ww = t === 1 ? 4 : t === 2 ? 5 : 6;
  const wh = t === 1 ? 4 : 5;
  const lit = t >= 3;
  const spots = cfg.windows || (W >= 40 ? [7, W - 8] : [6, W - 7]);
  for (const sx of spots) {
    window9(ctx, sx - (ww >> 1), winY, ww, wh, lit, {
      shutters: t >= 2 ? mix(ramp[2], P.wood2, 0.4) : null,
      box: t >= 2,
    });
  }

  // A narrow doorstep makes the entrance readable at every tier, including the
  // first cottages the player sees.
  const doorCX = cfg.doorCX ?? (W >> 1);
  px(ctx, doorCX - (doorW >> 1) - 1, H - 2, STONE[0], doorW + 2, 1);
  px(ctx, doorCX - (doorW >> 1), H - 1, STONE[2], doorW, 1);

  // tier dressing
  if (t >= 2) chimney(ctx, cfg.chimX ?? (W - 12), Math.max(0, roofH - overhangPx - 6), overhangPx > 8 ? 12 : 9, t >= 3);
  if (t >= 3) {
    banner(ctx, 2, roofH + 1, 12, ramp[1], ramp[3]);
    banner(ctx, W - 6, roofH + 1, 12, ramp[1], ramp[3]);
    // planters flanking the door
    for (const px0 of [3, W - 9]) {
      px(ctx, px0, H - baseH - 5, P.wood2, 6, 5);
      px(ctx, px0, H - baseH - 5, P.wood1, 6, 1);
      px(ctx, px0 + 5, H - baseH - 5, P.wood3, 1, 5);
      for (let i = 0; i < 6; i += 2) {
        px(ctx, px0 + i, H - baseH - 7, P.leaf2, 1, 2);
        px(ctx, px0 + i, H - baseH - 8, i % 4 ? P.bloom1 : P.gold1, 1, 1);
      }
    }
  }
  if (t >= 4) {
    // a second, grander roof tier plus a lantern on the ridge
    const rH = Math.round(roofH * 0.55);
    const sub = shingleRoof(ctx, W - 8, rH, ramp, { ridge: P.gold1 });
    ctx.save();
    ctx.restore();
    px(ctx, (W >> 1) - 3, 0, P.gold2, 6, 2);
    px(ctx, (W >> 1) - 2, -4, LITG[1], 4, 5);
    px(ctx, (W >> 1) - 2, -4, LITG[0], 4, 2);
  }
}

/** t4 needs the small upper roof composited above, so it gets its own routine */
function grandHouse(ctx, W, H, cfg) {
  house(ctx, W, H, { ...cfg, tier: 3 });
  const ramp = cfg.roof;
  const upH = 12, upW = W - 14;
  const ox = (W - upW) >> 1;
  ctx.save();
  ctx.translate(ox, 0);
  shingleRoof(ctx, upW, upH, ramp, { ridge: P.gold1 });
  ctx.restore();
  // cupola lantern
  px(ctx, (W >> 1) - 4, upH - 2, P.wood3, 8, 5);
  px(ctx, (W >> 1) - 3, upH - 1, LITG[1], 6, 3);
  px(ctx, (W >> 1) - 3, upH - 1, LITG[0], 6, 1);
  px(ctx, (W >> 1) - 1, upH, P.white, 2, 1);
  px(ctx, (W >> 1) - 5, upH + 3, P.wood2, 10, 1);
  ctx.globalAlpha = 0.18; ellipse(ctx, W >> 1, upH, 12, 10, LITG[0]); ctx.globalAlpha = 1;
  banner(ctx, 4, upH + 6, 14, P.gold1, P.gold3);
  banner(ctx, W - 8, upH + 6, 14, P.gold1, P.gold3);
}

// ---- bespoke buildings --------------------------------------------------

function hearthMonument(ctx, W, H, t) {
  // The village's heart is a shared ember held by ancient standing stones. Its
  // centre stays open above the low approach steps, matching the usable front
  // tile of the existing 3x2 footprint. All four tiers use the same canvas.
  const cx = W >> 1, base = H - 13;
  const top = 21 - t * 4;
  const stone = ['#eee6d0', '#c2c6b0', '#8d9f95', '#607b79', '#365354'];

  // Integer scanlines give the crystal and carved stone real, crisp facets.
  const poly = (points, color) => {
    const ymin = Math.min(...points.map(p => p[1]));
    const ymax = Math.max(...points.map(p => p[1]));
    for (let y = ymin; y < ymax; y++) {
      const cuts = [];
      for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i + 1) % points.length], line = y + 0.5;
        if ((a[1] <= line && b[1] > line) || (b[1] <= line && a[1] > line)) {
          cuts.push(a[0] + (line - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
        }
      }
      cuts.sort((a, b) => a - b);
      for (let i = 0; i + 1 < cuts.length; i += 2) {
        const x = Math.ceil(cuts[i]);
        px(ctx, x, y, color, Math.ceil(cuts[i + 1]) - x, 1);
      }
    }
  };

  // Weathered uprights are complete even at tier one; rebuilding the upper arch
  // is the first visible upgrade, followed by banners and a crowned lintel.
  if (t >= 2) {
    poly([[6, top + 15], [8, top + 8], [13, top + 3], [19, top],
      [29, top], [35, top + 3], [40, top + 8], [42, top + 15],
      [35, top + 15], [33, top + 9], [28, top + 6], [20, top + 6],
      [15, top + 9], [13, top + 15]], stone[2]);
    px(ctx, 19, top, stone[0], 10, 2);
    px(ctx, 14, top + 3, stone[1], 5, 2);
    px(ctx, 10, top + 7, stone[0], 4, 2);
    px(ctx, 29, top + 3, stone[3], 6, 2);
    px(ctx, 35, top + 8, stone[3], 4, 5);
    for (const x of [18, 24, 29]) px(ctx, x, top + 2, stone[3], 1, 3);
  }
  for (const [x, offset] of [[6, 0], [W - 14, t === 1 ? 4 : 0]]) {
    const y = top + 11 + offset;
    poly([[x + 2, y - 2], [x + 6, y - 3], [x + 8, y],
      [x + 8, base + 2], [x, base + 2], [x, y + 2]], stone[2]);
    px(ctx, x + 1, y + 1, stone[1], 3, base - y);
    px(ctx, x + 1, y + 1, stone[0], 1, base - y - 1);
    px(ctx, x + 7, y + 1, stone[3], 1, base - y + 1);
    px(ctx, x + 2, y - 1, stone[0], 4, 1);
    px(ctx, x + 1, base - 9, stone[3], 6, 1);
    // A carved hearth rune: a central notch with two open branches.
    const rune = t >= 3 ? P.gold1 : stone[4];
    px(ctx, x + 4, y + 5, rune, 1, 6);
    px(ctx, x + 2, y + 6, rune, 2, 1);
    px(ctx, x + 5, y + 8, rune, 2, 1);
    px(ctx, x + 3, y + 10, stone[0], 1, 1);
    panelBox(ctx, x - 1, base - 1, 10, 5, stone);
  }

  // A broad octagonal base and shallow front stairs invite the player to walk
  // up to the flame. Cool stone keeps the warm ember as the focal point.
  poly([[6, base + 1], [13, base - 3], [35, base - 3], [42, base + 1],
    [42, base + 7], [36, base + 10], [12, base + 10], [6, base + 7]], stone[3]);
  poly([[6, base + 1], [13, base - 3], [35, base - 3], [42, base + 1],
    [35, base + 5], [13, base + 5]], stone[1]);
  px(ctx, 13, base - 3, stone[0], 22, 1);
  px(ctx, 8, base + 3, stone[0], 5, 1);
  px(ctx, 36, base + 5, stone[4], 5, 2);
  for (const [x, y, w] of [[16, H - 8, 16], [14, H - 5, 20], [12, H - 2, 24]]) {
    px(ctx, x, y, stone[1], w, 2);
    px(ctx, x, y, stone[0], w, 1);
    px(ctx, x + w - 1, y, stone[3], 1, 2);
  }

  // The stone cup cradles a faceted, flame-shaped crystal. Its split tip and
  // bright inner ember form an original silhouette visible even in the menu.
  ellipse(ctx, cx, base - 3, 12, 4, (x, y, dx, dy, d) =>
    d > 0.8 ? stone[4] : dy < -0.25 ? stone[0] : stone[2]);
  ellipse(ctx, cx, base - 5, 8.5, 2.5, '#6d4a40');
  const lift = t >= 3 ? 2 : 0;
  const flame = points => points.map(([x, y]) => [cx + x, base + y - lift]);
  poly(flame([[0, -33], [5, -27], [5, -21], [10, -26], [10, -13],
    [6, -7], [0, -4], [-6, -7], [-10, -13], [-9, -22],
    [-4, -17], [-3, -26]]), '#aa5039');
  poly(flame([[0, -31], [3, -26], [3, -18], [8, -23], [8, -13],
    [4, -8], [0, -6], [-4, -8], [-8, -13], [-8, -19],
    [-3, -14], [-1, -25]]), '#f08a46');
  poly(flame([[0, -28], [2, -23], [0, -16], [5, -19], [4, -11],
    [0, -7], [-4, -12], [-3, -18]]), '#ffd078');
  poly(flame([[0, -20], [1, -15], [-1, -11], [0, -8],
    [-3, -12], [-2, -17]]), '#fff0b1');
  px(ctx, cx - 7, base - 18 - lift, '#ffd69a', 1, 3);
  px(ctx, cx + 6, base - 14 - lift, '#ffb361', 1, 3);
  px(ctx, cx - 2, base - 37 - lift, P.gold1, 1, 2);
  px(ctx, cx + 7, base - 32 - lift, P.gold0, 1, 1);

  if (t >= 2) {
    // Repaired gold channels carry warmth from the ember into the plinth.
    for (const x of [10, W - 11]) {
      px(ctx, x, base + 2, P.gold2, 1, 4);
      px(ctx, x - 1, base + 2, P.gold0, 3, 1);
    }
  } else {
    px(ctx, 7, base + 4, P.leaf2, 4, 1);
    px(ctx, 8, base + 3, P.leaf1, 2, 1);
    px(ctx, W - 10, base + 7, P.leaf2, 3, 1);
  }
  if (t >= 3) {
    for (const x of [2, W - 6]) {
      px(ctx, x + 1, top + 15, P.wood3, 1, 22);
      px(ctx, x, top + 15, P.gold2, 4, 1);
      banner(ctx, x, top + 17, 13, '#bd684e', '#7d3d35');
      px(ctx, x + 1, top + 21, P.gold0, 1, 3);
      px(ctx, x + 2, top + 22, P.gold1, 1, 2);
    }
    px(ctx, 20, top + 2, P.gold2, 8, 1);
    px(ctx, 23, top + 3, P.gold0, 2, 2);
  }
  if (t >= 4) {
    // The final tier crowns the restored arch and adds two small votive lights.
    poly([[cx, 1], [cx + 4, 5], [cx, 10], [cx - 4, 5]], P.gold2);
    poly([[cx, 2], [cx + 2, 5], [cx, 8], [cx - 2, 5]], P.gold0);
    for (const x of [5, W - 8]) {
      panelBox(ctx, x, H - 8, 4, 5, stone);
      px(ctx, x + 1, H - 10, P.ember1, 2, 2);
      px(ctx, x + 1, H - 11, P.gold0, 1, 3);
    }
  }
  autoOutline(ctx, W, H, 0.52);
}

function gardenPlot(ctx, W, H, t) {
  // tilled beds, fence, and a visible harvest ladder
  px(ctx, 0, 0, P.soil1, W, H);
  for (let r = 0; r < H; r += 4) {
    px(ctx, 0, r, P.soil0, W, 1);
    px(ctx, 0, r + 2, P.soil2, W, 1);
    px(ctx, 0, r + 3, P.soil3, W, 1);
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (hash(x, y, 401) > 0.95) px(ctx, x, y, P.soil0);
  const rows = t === 1 ? 2 : t === 2 ? 3 : 4;
  for (let r = 0; r < rows; r++) {
    const y = H - 4 - r * 6;
    for (let x = 4; x < W - 3; x += 6) {
      if (t === 1) {
        px(ctx, x, y - 2, P.leaf2, 1, 2); px(ctx, x - 1, y - 3, P.leaf1, 3, 1);
      } else {
        px(ctx, x, y - 5, P.leaf2, 1, 5);
        px(ctx, x - 2, y - 4, P.leaf1, 2, 1); px(ctx, x + 1, y - 5, P.leaf1, 2, 1);
        px(ctx, x - 2, y - 2, P.leaf0, 2, 1); px(ctx, x + 1, y - 3, P.leaf0, 2, 1);
        if (t >= 3) { px(ctx, x - 1, y - 1, P.ember2, 2, 2); px(ctx, x - 1, y - 1, P.ember1); }
      }
    }
  }
  // fence
  px(ctx, 0, 0, P.wood3, W, 2); px(ctx, 0, 0, P.wood2, W, 1);
  for (let x = 1; x < W; x += 7) { px(ctx, x, 0, P.wood2, 2, 5); px(ctx, x, 0, P.wood1, 1, 5); }
  if (t >= 2) {
    px(ctx, 0, H - 2, P.wood3, W, 2);
    for (let x = 1; x < W; x += 7) { px(ctx, x, H - 5, P.wood2, 2, 5); px(ctx, x, H - 5, P.wood1, 1, 5); }
  }
  if (t >= 3) {
    // trellis + scarecrow
    px(ctx, W - 5, 2, P.wood2, 2, H - 6); px(ctx, W - 5, 2, P.wood1, 1, H - 6);
    for (let y = 4; y < H - 6; y += 4) px(ctx, W - 8, y, P.leaf2, 5, 1);
    px(ctx, 3, 3, P.wood3, 1, 9);
    px(ctx, 1, 5, P.wood3, 5, 1);
    px(ctx, 2, 5, P.roofB1, 3, 4); px(ctx, 2, 5, P.roofB0, 3, 1);
    ellipse(ctx, 3.5, 3, 2.2, 2, (x, y, dx, dy, d) => d > 0.75 ? P.sand2 : P.sand0);
    px(ctx, 3, 3, P.ink2); px(ctx, 4, 3, P.ink2);
    px(ctx, 1, 1, P.gold2, 5, 1);
  }
  autoOutline(ctx, W, H, 0.5);
}

function fountain(ctx, W, H, t) {
  const cy = H - 7;
  // basin
  ellipse(ctx, W / 2, cy, W / 2 - 1, 7, (x, y, dx, dy, d) =>
    d > 0.82 ? STONE[3] : (dx + dy < -0.2 ? STONE[0] : STONE[1]));
  ellipse(ctx, W / 2, cy, W / 2 - 4, 4.6, (x, y, dx, dy, d) =>
    d > 0.8 ? P.water4 : (dx + dy < -0.2 ? P.water1 : P.water2));
  for (const [x, y, w] of [[6, cy - 2, 5], [18, cy + 1, 6]]) px(ctx, x, y, P.water0, w, 1);
  // pedestal
  px(ctx, W / 2 - 3, cy - 10, STONE[2], 6, 10);
  px(ctx, W / 2 - 3, cy - 10, STONE[1], 4, 10);
  px(ctx, W / 2 - 3, cy - 10, STONE[0], 1, 10);
  if (t >= 2) {
    ellipse(ctx, W / 2, cy - 11, 7, 3, (x, y, dx, dy, d) => d > 0.8 ? STONE[3] : (dy < 0 ? STONE[0] : STONE[1]));
    ellipse(ctx, W / 2, cy - 12, 4.5, 2, (x, y, dx, dy, d) => P.water1);
    px(ctx, W / 2 - 1, cy - 18, P.gold1, 2, 6);
    px(ctx, W / 2 - 1, cy - 18, P.gold0, 1, 6);
    px(ctx, W / 2 - 3, cy - 20, P.gold2, 6, 2);
    px(ctx, W / 2 - 3, cy - 20, P.gold0, 6, 1);
    // falling water
    for (const dx of [-6, 6]) {
      px(ctx, W / 2 + dx, cy - 10, P.water0, 1, 7);
      px(ctx, W / 2 + dx + (dx < 0 ? 1 : -1), cy - 8, P.water1, 1, 5);
    }
    px(ctx, W / 2 - 1, cy - 22, P.water0, 2, 2);
  } else {
    px(ctx, W / 2 - 2, cy - 13, P.water1, 4, 4);
    px(ctx, W / 2 - 1, cy - 15, P.water0, 2, 3);
  }
  autoOutline(ctx, W, H, 0.5);
}

function marketStall(ctx, W, H, t) {
  const ramp = ROOFR;
  // awning
  const aH = 12;
  for (let y = 0; y < aH; y++) {
    const half = Math.round(4 + (W / 2 - 1 - 4) * (y / (aH - 1)));
    const x0 = (W >> 1) - half, x1 = (W >> 1) + half - 1;
    for (let x = x0; x <= x1; x++) {
      const stripe = Math.floor((x - x0) / 4) % 2;
      px(ctx, x, y, stripe ? P.paper0 : ramp[1], 1, 1);
      if (y === 0) px(ctx, x, y, stripe ? P.paper2 : ramp[3]);
    }
    px(ctx, x0, y, ramp[3]); px(ctx, x1, y, shade(ramp[3], -0.2));
  }
  for (let x = 2; x < W - 2; x += 4) px(ctx, x, aH, ramp[2], 2, 2);
  // posts
  for (const x of [2, W - 5]) {
    px(ctx, x, aH - 2, P.wood3, 3, H - aH + 2);
    px(ctx, x, aH - 2, P.wood2, 1, H - aH + 2);
  }
  // counter
  const cy = H - 10;
  px(ctx, 1, cy, P.wood1, W - 2, 3);
  px(ctx, 1, cy, P.wood0, W - 2, 1);
  px(ctx, 1, cy + 3, P.wood3, W - 2, 1);
  px(ctx, 1, cy + 4, P.wood2, W - 2, H - cy - 5);
  for (let x = 2; x < W - 2; x += 4) px(ctx, x, cy + 4, P.wood3, 1, H - cy - 5);
  px(ctx, 1, H - 1, P.wood4, W - 2, 1);
  // goods
  const goods = t === 1 ? 2 : t === 2 ? 4 : 6;
  for (let i = 0; i < goods; i++) {
    const x = 5 + i * 6, y = cy - 3;
    const kind = i % 3;
    if (kind === 0) { ellipse(ctx, x, y, 2.2, 2, (X, Y, dx, dy, d) => d > 0.7 ? P.roof3 : (dx + dy < -0.2 ? P.roof0 : P.roof1)); }
    if (kind === 1) { px(ctx, x - 2, y - 2, P.gold1, 5, 4); px(ctx, x - 2, y - 2, P.gold0, 5, 1); px(ctx, x + 2, y - 1, P.gold3, 1, 3); }
    if (kind === 2) { ellipse(ctx, x, y, 2.4, 2, (X, Y, dx, dy, d) => d > 0.7 ? P.leaf3 : (dx + dy < -0.2 ? P.leaf0 : P.leaf1)); }
  }
  if (t >= 2) {
    px(ctx, W - 12, cy - 9, P.wood2, 11, 7);
    px(ctx, W - 12, cy - 9, P.wood1, 11, 1);
    px(ctx, W - 11, cy - 7, P.paper1, 9, 4);
    EMBLEM.coin(ctx, W - 7, cy - 5);
  }
  if (t >= 3) {
    banner(ctx, 1, aH, 10, P.gold1, P.gold3);
    banner(ctx, W - 5, aH, 10, P.gold1, P.gold3);
    px(ctx, 3, H - 8, P.wood2, 7, 7); px(ctx, 3, H - 8, P.wood1, 7, 1);
    px(ctx, 3, H - 5, P.wood3, 7, 1);
  }
  autoOutline(ctx, W, H, 0.5);
}

function villageGate(ctx, W, H, t) {
  // two stone piers and a timber lintel
  for (const x of [1, W - 9]) {
    stoneBase(ctx, x, 10, 8, H - 10);
    px(ctx, x, 8, STONE[1], 8, 3);
    px(ctx, x, 8, STONE[0], 8, 1);
    px(ctx, x + 7, 8, STONE[3], 1, H - 8);
  }
  px(ctx, 0, 4, P.wood3, W, 5);
  px(ctx, 0, 4, P.wood2, W, 3);
  px(ctx, 0, 4, P.wood1, W, 1);
  px(ctx, 0, 8, P.wood4, W, 1);
  for (let x = 3; x < W; x += 6) px(ctx, x, 5, P.wood3, 1, 3);
  // sign board
  px(ctx, (W >> 1) - 9, 9, P.wood2, 18, 8);
  px(ctx, (W >> 1) - 9, 9, P.wood1, 18, 1);
  px(ctx, (W >> 1) - 8, 11, P.paper1, 16, 5);
  px(ctx, (W >> 1) - 8, 11, P.paper0, 16, 1);
  for (let i = 0; i < 3; i++) px(ctx, (W >> 1) - 6 + i * 5, 13, P.ink3, 3, 1);
  px(ctx, (W >> 1) - 9, 16, P.wood4, 18, 1);
  if (t >= 2) {
    px(ctx, 0, 2, P.wood2, W, 2); px(ctx, 0, 2, P.wood1, W, 1);
    for (const x of [4, W - 8]) {
      px(ctx, x, 9, P.wood3, 1, 3);
      px(ctx, x - 2, 12, LITG[2], 5, 5);
      px(ctx, x - 2, 12, LITG[1], 5, 3);
      px(ctx, x - 1, 13, LITG[0], 3, 2);
      px(ctx, x - 2, 11, P.wood3, 5, 1);
      ctx.globalAlpha = 0.16; ellipse(ctx, x, 14, 8, 8, LITG[0]); ctx.globalAlpha = 1;
    }
    banner(ctx, 6, 9, 12, P.roof1, P.roof3);
    banner(ctx, W - 10, 9, 12, P.roof1, P.roof3);
    for (let x = 0; x < W; x += 4) px(ctx, x, 1, P.leaf2, 3, 2);
    for (let x = 2; x < W; x += 8) px(ctx, x, 0, P.bloom1, 2, 2);
  }
  autoOutline(ctx, W, H, 0.5);
}

function bellTower(ctx, W, H, t) {
  // stone shaft
  stoneBase(ctx, 2, 24, W - 4, H - 24);
  px(ctx, 2, 24, STONE[2], W - 4, H - 24);
  for (let r = 0; r < Math.ceil((H - 24) / 4); r++) {
    const y = 24 + r * 4, off = r % 2 ? -3 : 0;
    for (let i = off; i < W - 4; i += 7) {
      const x = 2 + Math.max(0, i), w = Math.min(6, W - 2 - x);
      px(ctx, x, y, STONE[1], w, 3);
      px(ctx, x, y, STONE[0], w, 1);
      px(ctx, x + w - 1, y, STONE[3], 1, 3);
    }
  }
  px(ctx, 2, 24, STONE[0], 1, H - 24); px(ctx, W - 3, 24, STONE[4], 1, H - 24);
  // arched belfry opening
  px(ctx, 4, 12, P.wood3, W - 8, 13);
  px(ctx, 5, 13, '#241c2c', W - 10, 12);
  ellipse(ctx, W / 2, 16, W / 2 - 5, 5, (x, y, dx, dy, d) => dy > 0 ? null : (d > 0.75 ? P.wood3 : '#241c2c'));
  // bell
  const bc = t >= 2 ? [P.gold0, P.gold1, P.gold2, P.gold3] : [STONE[0], STONE[1], STONE[2], STONE[3]];
  ellipse(ctx, W / 2, 19, 5, 5.5, (x, y, dx, dy, d) =>
    dy > 0.45 ? null : (d > 0.78 ? bc[3] : (dx + dy < -0.2 ? bc[0] : bc[1])));
  px(ctx, W / 2 - 5, 21, bc[2], 10, 2);
  px(ctx, W / 2 - 5, 21, bc[1], 10, 1);
  px(ctx, W / 2 - 1, 23, bc[3], 2, 2);
  px(ctx, W / 2 - 1, 12, bc[2], 2, 2);
  // roof
  const rH = 13;
  shingleRoof(ctx, W, rH, ROOFG, { ridge: t >= 2 ? P.gold1 : null, scallop: t >= 2 });
  if (t >= 2) {
    // clock face + banners
    ellipse(ctx, W / 2, 30, 6, 6, (x, y, dx, dy, d) => d > 0.86 ? P.gold3 : (d > 0.74 ? P.gold2 : P.paper0));
    px(ctx, W / 2, 30, P.ink2); px(ctx, W / 2, 27, P.ink3, 1, 3); px(ctx, W / 2, 30, P.ink3, 3, 1);
    for (const [dx, dy] of [[0, -5], [5, 0], [0, 5], [-5, 0]]) px(ctx, (W >> 1) + dx, 30 + dy, P.ink3);
    banner(ctx, 1, rH + 1, 12, P.roofG1, P.roofG3);
    banner(ctx, W - 5, rH + 1, 12, P.roofG1, P.roofG3);
    px(ctx, (W >> 1) - 1, 0, P.gold1, 2, 3);
  }
  px(ctx, 1, H - 3, STONE[1], W - 2, 3);
  px(ctx, 1, H - 3, STONE[0], W - 2, 1);
  px(ctx, 1, H - 1, STONE[4], W - 2, 1);
  autoOutline(ctx, W, H, 0.5);
}

const BCFG = {
  cottage: { roof: ROOFR, emblem: 'flower' },
  kitchen: { roof: LITG.map(c => mix(c, P.roof1, 0.3)), emblem: 'pot' },
  workshop: { roof: ROOFB, emblem: 'hammer' },
  library: { roof: ROOFV, emblem: 'book' },
  infirmary: { roof: PLAS, emblem: 'heart' },
  bathhouse: { roof: ROOFB.map(c => mix(c, P.water1, 0.3)), emblem: 'drop' },
};

function buildingPainter(b, tier) {
  const W = b.w * 16, H = (b.h + b.overhang) * 16;
  return ctx => {
    if (b.id === 'hearthstone') return hearthMonument(ctx, W, H, tier);
    if (b.id === 'garden') return gardenPlot(ctx, W, H, tier);
    if (b.id === 'fountain') return fountain(ctx, W, H, tier);
    if (b.id === 'market') return marketStall(ctx, W, H, tier);
    if (b.id === 'gate') return villageGate(ctx, W, H, tier);
    if (b.id === 'belltower') return bellTower(ctx, W, H, tier);
    const cfg = { ...(BCFG[b.id] || { roof: ROOFR }), tier, overhang: b.overhang };
    if (tier >= 4) grandHouse(ctx, W, H, cfg);
    else house(ctx, W, H, cfg);
    autoOutline(ctx, W, H, 0.5);
  };
}

// ===========================================================================
export function register() {
  for (const who of CHARS) {
    const base = LOOKS[who] || LOOKS.hero;
    for (const dir of DIRS4) {
      const look = { ...base, __dir: dir };
      Atlas.defineAnim(`c.${who}.${dir}`, 16, 24, CHAR_FRAMES, charPainter(look));
    }
  }
  for (const b of BUILDINGS) {
    for (let i = 1; i <= b.tiers; i++) {
      Atlas.define(`b.${b.id}.t${i}`, b.w * 16, (b.h + b.overhang) * 16, buildingPainter(b, i));
    }
  }
}
