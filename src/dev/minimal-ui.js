// Foundation-provided minimal UI so dialogue, choices, toasts, and fades work from the
// very first commit. ui/textbox.js etc. overwrite these via UIx.install(); this only
// runs when the real UI hasn't landed yet.

import { R } from '../core/renderer.js';
import { Scenes } from '../core/scene.js';
import { Input } from '../core/input.js';
import { Font } from '../core/font.js';
import { UIx } from '../core/bridge.js';
import { Audio } from '../core/audio.js';
import { P } from '../art/palette.js';

const BOX = { x: 6, y: 122, w: 308, h: 52 };
let busy = false;
const toasts = [];

function panel(x, y, w, h) {
  R.rect(x, y, w, h, P.ui4);
  R.rect(x + 1, y + 1, w - 2, h - 2, P.ui2);
  R.rect(x + 2, y + 2, w - 4, h - 4, P.paper1);
  R.rect(x + 3, y + 3, w - 6, h - 6, P.paper0);
  R.rect(x + 3, y + 3, w - 6, 1, '#fffdf4');
}

function textboxScene({ text, speaker, choices }) {
  const lines = Font.wrap(text, BOX.w - 20);
  let shown = 0, page = 0, done = false, pick = 0, t = 0;
  const PER_PAGE = 3;
  const pageLines = () => lines.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);
  const pageChars = () => pageLines().join('').length;

  return {
    pausesBelow: false, drawsBelow: true,
    update() {
      t++;
      if (shown < pageChars()) { shown += 2; if (t % 2 === 0) Audio.sfx('text'); return; }
      const morePages = (page + 1) * PER_PAGE < lines.length;
      if (choices && !morePages) {
        if (Input.pressed('down')) { pick = (pick + 1) % choices.length; Audio.sfx('cursor'); }
        if (Input.pressed('up')) { pick = (pick + choices.length - 1) % choices.length; Audio.sfx('cursor'); }
        if (Input.pressed('a')) { Audio.sfx('confirm'); Scenes.pop(pick); }
        if (Input.pressed('b')) { Audio.sfx('cancel'); Scenes.pop(-1); }
        return;
      }
      if (Input.pressed('a') || Input.pressed('b')) {
        if (morePages) { page++; shown = 0; Audio.sfx('cursor'); }
        else { Audio.sfx('confirm'); Scenes.pop(); }
      }
    },
    render() {
      R.layer(5, () => {
        const h = choices ? BOX.h + choices.length * 11 : BOX.h;
        const y = choices ? BOX.y - choices.length * 11 : BOX.y;
        panel(BOX.x, y, BOX.w, h);
        if (speaker) {
          const w = Font.measure(speaker) + 12;
          panel(BOX.x + 6, y - 11, w, 15);
          R.text(speaker, BOX.x + 12, y - 7, { color: P.gold3, shadow: false });
        }
        let n = shown;
        pageLines().forEach((l, i) => {
          const limit = Math.max(0, Math.min(l.length, n));
          n -= l.length;
          R.text(l, BOX.x + 10, y + 10 + i * 12, { color: P.ink2, shadow: false, limit });
        });
        if (choices && shown >= pageChars()) {
          choices.forEach((c, i) => {
            const cy = y + 10 + PER_PAGE * 12 + i * 11;
            R.text(c, BOX.x + 22, cy, { color: i === pick ? P.gold3 : P.ink2, shadow: false });
            if (i === pick) R.text('▶', BOX.x + 12, cy, { color: P.gold2, shadow: false });
          });
        } else if (shown >= pageChars()) {
          if (Math.floor(t / 18) % 2 === 0) {
            R.text('▼', BOX.x + BOX.w - 16, y + h - 16, { color: P.gold2, shadow: false });
          }
        }
      });
    },
  };
}

function fadeScene(dir, frames, onDone) {
  let f = 0;
  return {
    pausesBelow: false, drawsBelow: true,
    update() { if (++f >= frames) { Scenes.pop(); onDone?.(); } },
    render() {
      R.layer(5, ctx => {
        const a = dir === 'out' ? f / frames : 1 - f / frames;
        ctx.globalAlpha = Math.max(0, Math.min(1, a));
        R.rect(0, 0, R.W, R.H, '#0b0e14');
        ctx.globalAlpha = 1;
      });
    },
  };
}

export function installMinimalUI() {
  if (UIx.real) return false;
  globalThis.__R = R;
  Scenes.register('__textbox', p => textboxScene(p || {}));

  // real:false keeps this replaceable by ui/textbox.js when that lands.
  UIx.install({
    get busy() { return busy; },
    async say(text, opts = {}) {
      busy = true;
      await Scenes.pushAsync('__textbox', { text, speaker: opts.speaker });
      busy = false;
    },
    async ask(text, choices, opts = {}) {
      busy = true;
      const r = await Scenes.pushAsync('__textbox', { text, speaker: opts.speaker, choices });
      busy = false;
      return r ?? -1;
    },
    async confirm(text) { return (await UIx.ask(text, ['Yes', 'No'])) === 0; },
    toast(text, opts = {}) { toasts.push({ text, life: opts.ms ? opts.ms / 16 : 110, icon: opts.icon }); },
    async fade(dir, frames = 16) {
      await new Promise(res => {
        Scenes.register('__fade', () => fadeScene(dir, frames, res));
        Scenes.push('__fade');
      });
    },
    async iris(dir) { return UIx.fade(dir, 14); },
    async battleFx() { await UIx.fade('out', 12); await UIx.fade('in', 12); },
    async doorway(dir) { return UIx.fade(dir, 12); },
    panel,
    drawToasts,
  }, { real: false });
  return true;
}

// Drawn by the overworld HUD fallback.
function drawToasts() {
  for (let i = toasts.length - 1; i >= 0; i--) {
    const t = toasts[i];
    if (--t.life <= 0) { toasts.splice(i, 1); continue; }
  }
  toasts.slice(0, 3).forEach((t, i) => {
    const w = Font.measure(t.text) + 16;
    const y = 8 + i * 16;
    const slide = Math.min(1, (110 - t.life) / 8) * Math.min(1, t.life / 8);
    R.layer(5, () => {
      const x = R.W - 6 - w * Math.max(0.001, slide);
      panel(x, y, w * Math.max(0.001, slide), 14);
      if (slide > 0.9) R.text(t.text, x + 8, y + 3, { color: P.ink2, shadow: false });
    });
  });
}
