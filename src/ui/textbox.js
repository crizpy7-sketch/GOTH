// Dialogue.
//
// Every line of story in the game passes through here, so the details matter more
// than anywhere else: characters land at a tunable rate with a soft click, holding a
// button fast-forwards, B skips to the end of the page before it advances, pages
// break cleanly and never mid-word, and the speaker gets a nameplate and a portrait
// so you always know who is talking.

import { R, LAYER } from '../core/renderer.js';
import { Input } from '../core/input.js';
import { Scenes } from '../core/scene.js';
import { Atlas } from '../art/atlas.js';
import { Audio } from '../core/audio.js';
import { UIx } from '../core/bridge.js';
import { Font } from '../core/font.js';
import { S } from '../state.js';
import { P, mix, shade } from '../art/palette.js';
import { clamp, ease } from '../core/util.js';
import { Frame } from './frame.js';

// Characters per frame at each text-speed setting. 1 = slow, 2 = normal, 3 = fast.
const SPEED = [0, 0.7, 1.4, 2.6];
const BOX = { x: 6, w: 308, h: 50 };
const OPEN = 7;              // frames the box takes to open — short, but it reads

let busy = false;

// Portraits are drawn from the character sprite we already have, cropped to the
// head and scaled up. That keeps one source of truth for what everyone looks like.
function portrait(who, x, y) {
  const img = Atlas.tryGet(`c.${who}.down`, 0);
  if (!img) return false;
  Frame.panel(x, y, 34, 34, 'gold');
  const ctx = R.ctx;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x + 3, y + 3, 28, 28);
  ctx.clip();
  // 16x24 sprite, head is roughly the top 14px; scale x2 and centre on the face.
  ctx.imageSmoothingEnabled = false;
  const ratio = img.pixelRatio || 1;
  ctx.drawImage(img, ratio, ratio, 14 * ratio, 14 * ratio, x + 3, y + 3, 28, 28);
  ctx.restore();
  return true;
}

function textboxScene(params) {
  const { text, speaker, choices, portraitOf } = params || {};
  const hasPortrait = portraitOf && Atlas.has(`c.${portraitOf}.down`);
  const padL = hasPortrait ? 46 : 12;
  const wrapW = BOX.w - padL - 14;
  const lines = Font.wrap(String(text ?? ''), wrapW);
  const PER_PAGE = 3;

  let page = 0, shown = 0, t = 0, open = 0, pick = 0, closing = 0;

  const pageLines = () => lines.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);
  const pageLen = () => pageLines().join('').length;
  const morePages = () => (page + 1) * PER_PAGE < lines.length;
  const typed = () => shown >= pageLen();
  const boxH = () => BOX.h + (choices && !morePages() ? choices.length * 12 + 4 : 0);
  const boxY = () => R.H - boxH() - 4;

  function advance() {
    if (morePages()) { page++; shown = 0; Audio.sfx('cursor', { gain: 0.6 }); }
    else { Audio.sfx('confirm'); closing = 1; }
  }

  return {
    pausesBelow: false, drawsBelow: true,

    update() {
      t++;
      if (closing) { if (++closing > OPEN) Scenes.pop(choices ? pick : undefined); return; }
      if (open < OPEN) { open++; return; }

      if (!typed()) {
        const rate = SPEED[clamp(S.settings.textSpeed || 2, 1, 3)];
        // Holding either button fast-forwards; B alone snaps to the end of the page.
        const fast = Input.held('a') || Input.held('b');
        shown += fast ? rate * 3.5 : rate;
        // First tap reveals the current page; the next tap advances it.
        if (Input.pressed('a') || Input.pressed('b')) shown = pageLen();
        if (t % 3 === 0) Audio.sfx('text', { gain: 0.5 });
        return;
      }

      if (choices && !morePages()) {
        if (Input.pressed('down')) { pick = (pick + 1) % choices.length; Audio.sfx('cursor'); }
        if (Input.pressed('up')) { pick = (pick + choices.length - 1) % choices.length; Audio.sfx('cursor'); }
        if (Input.pressed('a')) { Audio.sfx('confirm'); closing = 1; }
        if (Input.pressed('b')) { Audio.sfx('cancel'); pick = -1; closing = 1; }
        return;
      }
      if (Input.pressed('a') || Input.pressed('b')) advance();
    },

    render() {
      R.layer(LAYER.UI, () => {
        const k = closing ? 1 - closing / OPEN : ease.outCubic(open / OPEN);
        const h = Math.max(2, Math.round(boxH() * k));
        const y = R.H - h - 4;
        const full = k > 0.92;

        Frame.panel(BOX.x, y, BOX.w, h, 'paper');
        if (!full) return;                     // don't draw contents mid-open

        if (speaker) Frame.tab(BOX.x + 8, y - 9, speaker, 'gold');
        if (hasPortrait) portrait(portraitOf, BOX.x + 6, y + 8);

        let n = shown;
        pageLines().forEach((l, i) => {
          const limit = Math.max(0, Math.min(l.length, Math.floor(n)));
          n -= l.length;
          Frame.write(l, BOX.x + padL, y + 9 + i * 12, 'paper', { limit });
        });

        if (choices && typed() && !morePages()) {
          const cy0 = y + 9 + PER_PAGE * 12;
          choices.forEach((c, i) => {
            const cy = cy0 + i * 12;
            const on = i === pick;
            if (on) R.rect(BOX.x + padL - 4, cy - 2, BOX.w - padL - 10, 12, mix(P.gold1, P.paper0, 0.5));
            Frame.write(c, BOX.x + padL + 8, cy, 'paper', { color: on ? P.ink : P.ink3 });
            if (on) Frame.cursor(BOX.x + padL - 2, cy, t);
          });
        } else if (typed()) {
          // The advance chevron bobs rather than blinks — easier to notice, less nagging.
          const bob = Math.round(Math.sin(t / 9) * 1);
          R.text(morePages() ? '▼' : '▼', BOX.x + BOX.w - 16, y + h - 15 + bob,
            { color: P.gold3, shadow: false });
        }
      });
    },
  };
}

export function register() {
  Scenes.register('__say', p => textboxScene(p));

  UIx.install({
    get busy() { return busy; },

    async say(text, opts = {}) {
      busy = true;
      try {
        await Scenes.pushAsync('__say', {
          text, speaker: opts.speaker,
          portraitOf: opts.portrait || opts.who || speakerToWho(opts.speaker),
        });
      } finally { busy = false; }
    },

    async sayMany(lines, opts = {}) {
      for (const l of lines) await UIx.say(l, opts);
    },

    async ask(text, choices, opts = {}) {
      busy = true;
      try {
        const r = await Scenes.pushAsync('__say', {
          text, speaker: opts.speaker, choices,
          portraitOf: opts.portrait || speakerToWho(opts.speaker),
        });
        return r === undefined ? -1 : r;
      } finally { busy = false; }
    },

    async confirm(text, opts = {}) {
      return (await UIx.ask(text, ['Yes', 'No'], opts)) === 0;
    },

    panel(x, y, w, h, style) { return Frame.panel(x, y, w, h, style); },
  });
}

// Maps a display name back to a sprite so `say('...', {speaker:'Gran Willow'})`
// gets the right portrait without every caller knowing sprite ids.
const BY_NAME = {
  'Mayor Bramble': 'mayor', 'Gran Willow': 'gran', 'Pip': 'kid', 'Odell': 'farmer',
  'Hesta': 'smith', 'Marrow': 'baker', 'Quill': 'fisher', 'Sable': 'ranger',
  'Nettle': 'weaver', 'Cobb': 'peddler', 'Wick': 'twin', 'Ash-of-the-North': 'rival',
};
function speakerToWho(speaker) {
  if (!speaker) return null;
  if (BY_NAME[speaker]) return BY_NAME[speaker];
  const low = String(speaker).toLowerCase();
  return Atlas.has(`c.${low}.down`) ? low : null;
}
