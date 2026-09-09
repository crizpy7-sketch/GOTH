// Foundation fallbacks: placeholders for any scene a feature module hasn't registered
// yet, plus a smoke scene that shows the engine, font, palette, and atlas at a glance.
// These exist so the build is always launchable — critics can screenshot any entry point.

import { R } from '../core/renderer.js';
import { Scenes } from '../core/scene.js';
import { Input } from '../core/input.js';
import { Atlas } from '../art/atlas.js';
import { P, RAMP } from '../art/palette.js';
import { Loop } from '../core/loop.js';
import { S } from '../state.js';

const EXPECTED = ['title', 'overworld', 'battle', 'village', 'build', 'missions', 'party', 'pause', 'dex'];

export function registerFallbacks(loaded) {
  Scenes.register('smoke', () => smokeScene(loaded));
  for (const name of EXPECTED) {
    if (!Scenes.has(name)) Scenes.register(name, () => stubScene(name, loaded));
  }
}

function stubScene(name, loaded) {
  let t = 0;
  return {
    enter() { t = 0; },
    update() {
      t++;
      if (Input.pressed('b') && Scenes.stack.length > 1) Scenes.pop();
      if (Input.pressed('a')) Scenes.push('smoke');
      if (Input.pressed('start')) Scenes.reset('title');
    },
    render() {
      R.layer(0, ctx => {
        // Soft dev backdrop — deliberately unlike the real game so it can't be mistaken for it.
        for (let y = 0; y < R.H; y += 8) {
          R.rect(0, y, R.W, 8, y % 16 === 0 ? '#161b26' : '#131822');
        }
      });
      R.layer(5, ctx => {
        panel(6, 6, R.W - 12, R.H - 12);
        R.text('NOT BUILT YET', R.W / 2, 20, { align: 'center', color: P.gold1 });
        R.text(`scene: ${name}`, R.W / 2, 34, { align: 'center', color: P.paper1 });

        const miss = loaded.missing.length ? loaded.missing.join(', ') : 'none';
        const lines = [
          `loaded  ${loaded.modules.length} modules`,
          `missing ${miss}`,
        ];
        if (loaded.failed.length) {
          for (const f of loaded.failed.slice(0, 3)) lines.push(`ERROR ${f.label}: ${f.err.slice(0, 40)}`);
        }
        lines.forEach((l, i) => R.text(l, 16, 56 + i * 11, { color: i && loaded.failed.length ? '#ff9a9a' : P.paper2 }));

        R.text('A = engine smoke test   B = back   M = title', R.W / 2, R.H - 22,
          { align: 'center', color: P.ui2 });
        const pulse = 0.5 + 0.5 * Math.sin(t / 16);
        R.text('▼', R.W / 2, R.H - 38, { align: 'center', color: P.gold1, alpha: pulse });
      });
    },
  };
}

function smokeScene(loaded) {
  let page = 0, t = 0;
  const pages = 3;
  return {
    update() {
      t++;
      if (Input.pressed('b')) Scenes.pop();
      if (Input.pressed('right') || Input.pressed('a')) page = (page + 1) % pages;
      if (Input.pressed('left')) page = (page + pages - 1) % pages;
    },
    render() {
      R.layer(0, () => R.rect(0, 0, R.W, R.H, '#10141c'));
      R.layer(5, ctx => {
        if (page === 0) fontPage(ctx);
        else if (page === 1) palettePage(ctx);
        else atlasPage(ctx, t);
        R.rect(0, R.H - 11, R.W, 11, '#0a0d13');
        R.text(`smoke ${page + 1}/${pages}  ◀ ▶  B=back   ${Loop.fps.toFixed(0)}fps  atlas:${Atlas.size}`,
          4, R.H - 9, { color: P.ui2 });
      });
    },
  };
}

function fontPage(ctx) {
  R.text('THE HEARTH FONT', 6, 6, { color: P.gold1 });
  R.text('ABCDEFGHIJKLMNOPQRSTUVWXYZ', 6, 20, { color: P.paper0 });
  R.text('abcdefghijklmnopqrstuvwxyz', 6, 32, { color: P.paper0 });
  R.text('0123456789 .,!?\'":;-+=/()[]', 6, 44, { color: P.paper0 });
  R.text('%&*@#$<>_~| ▶◀▼▲♥★●○⬥', 6, 56, { color: P.paper0 });
  R.text('Every journey begins at the hearth.', 6, 74, { color: P.paper1 });
  R.text('Embercub wants to show you something!', 6, 86, { color: P.gold0 });
  panel(6, 100, R.W - 12, 44);
  // Convention for text on a light panel: dark ink, light shadow. Copy this.
  R.text('Mayor Elm', 14, 104, { color: P.gold3, shadow: P.paper0 });
  R.text('Thanks to your help, our village keeps', 14, 116, { color: P.ink2, shadow: false });
  R.text('growing - come see the new roofs!', 14, 128, { color: P.ink2, shadow: false });
}

function palettePage(ctx) {
  R.text('PALETTE', 6, 6, { color: P.gold1 });
  const names = Object.keys(RAMP);
  names.forEach((n, i) => {
    const y = 20 + i * 13;
    R.text(n, 6, y + 2, { color: P.paper2 });
    RAMP[n].forEach((c, k) => R.rect(52 + k * 14, y, 13, 10, c));
  });
  const swatches = Object.entries(P).slice(0, 60);
  swatches.forEach(([, c], i) => {
    R.rect(150 + (i % 12) * 14, 20 + Math.floor(i / 12) * 12, 13, 11, c);
  });
}

function atlasPage(ctx, t) {
  R.text(`ATLAS (${Atlas.size} sprites)`, 6, 6, { color: P.gold1 });
  const names = Atlas.names.filter(n => !n.includes(':')).slice(0, 96);
  if (!names.length) {
    R.text('no art registered yet', 6, 24, { color: '#ff9a9a' });
    return;
  }
  let x = 6, y = 20, rowH = 0;
  for (const n of names) {
    const img = Atlas.get(n, Math.floor(t / 12));
    if (x + img.width > R.W - 6) { x = 6; y += rowH + 3; rowH = 0; }
    if (y + img.height > R.H - 14) break;
    R.rect(x - 1, y - 1, img.width + 2, img.height + 2, '#1c2230');
    R.blit(img, x, y);
    x += img.width + 3;
    rowH = Math.max(rowH, img.height);
  }
}

// Minimal window frame so fallbacks look intentional rather than broken.
function panel(x, y, w, h) {
  R.rect(x, y, w, h, P.ui3);
  R.rect(x + 1, y + 1, w - 2, h - 2, P.ui1);
  R.rect(x + 2, y + 2, w - 4, h - 4, P.ui0);
  R.rect(x + 2, y + 2, w - 4, 1, '#fffdf2');
  R.stroke(x, y, w, h, P.ui4);
}
