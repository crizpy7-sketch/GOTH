// Important conversations get room to breathe. Ordinary NPC chatter still uses
// the small overworld textbox; this scene owns one entire story beat and choice.
import { R, LAYER } from '../core/renderer.js';
import { Input } from '../core/input.js';
import { Scenes } from '../core/scene.js';
import { Audio } from '../core/audio.js';
import { Font } from '../core/font.js';
import { UIx } from '../core/bridge.js';
import { Atlas } from '../art/atlas.js';
import { S } from '../state.js';

const SPEED = [0, .7, 1.4, 2.6];
const IN_FRAMES = 18, OUT_FRAMES = 12;
const INK = '#30261f', GOLD = '#e5be76', PAPER = '#fff2d6';
let busyInstalled = false;
const SETTINGS = {
  cottage: { label: 'Warmhouse hearth', backdrop: 'scene.story.cottage', tone: '#281e1a' },
  village: { label: 'Emberhollow', backdrop: 'scene.story.village', tone: '#1c302d' },
  forest: { label: 'Beneath the old boughs', backdrop: 'scene.story.forest', tone: '#172b2a' },
};

function pagesOf(lines) {
  const pages = [];
  for (const line of lines || []) {
    const wrapped = Font.wrap(String(line), 284);
    for (let i = 0; i < wrapped.length; i += 3) pages.push(wrapped.slice(i, i + 3));
  }
  return pages.length ? pages : [['']];
}

function storyScene(options = {}) {
  const setting = SETTINGS[options.setting] || SETTINGS.cottage;
  const choices = (options.choices || []).filter(c => c && c.label);
  let pages = pagesOf(options.lines), page = 0, shown = 0;
  let stage = 'narrative', chosen = -1, pick = 0, guardian = null;
  let t = 0, open = 0, closing = 0, result = null;
  let alive = false, committed = false, screen = null, previousSong = null, changedSong = false;
  let previousLabel = null;
  const motion = () => R.cinematicFx && !S.settings.reducedMotion;
  const pageLength = () => pages[page].join('').length;
  const typed = () => shown >= pageLength();
  const ready = () => alive && Scenes.top === scene && !closing && open >= (motion() ? IN_FRAMES : 1);
  const cardStart = () => Math.floor(pick / 3) * 3;
  const cardRect = slot => ({ x: 10 + slot * 102, y: 30, w: 96, h: 77 });

  function accessiblePage() {
    const text = stage === 'choices' ? `${choices[pick].label}. ${choices[pick].detail || ''}. Choose a companion or go back.`
      : stage === 'pending' ? 'A new bond is taking shape.' : pages[page].join(' ');
    screen?.setAttribute?.('aria-label', `${options.speaker || 'Story'}. ${text}`);
  }

  function finish(completed) {
    if (closing) return;
    result = { completed, choice: chosen };
    closing = 1;
    Audio.sfx(completed ? 'chime' : 'cancel', { gain: .55 });
  }

  function advance() {
    if (!ready() || stage === 'pending') return;
    if (stage === 'choices') { choose(); return; }
    if (!typed()) { shown = pageLength(); return; }
    if (page < pages.length - 1) {
      page++; shown = 0;
      accessiblePage();
      Audio.sfx('cursor', { gain: .4 });
      return;
    }
    if (stage === 'narrative' && choices.length) {
      stage = 'choices';
      accessiblePage();
      Audio.sfx('chime', { gain: .5 });
    } else finish(stage !== 'failed');
  }

  async function choose() {
    if (!ready() || stage !== 'choices' || committed) return;
    // Lock synchronously before awaiting: repeated taps can never grant twice.
    committed = true; chosen = pick; stage = 'pending';
    accessiblePage(); Audio.sfx('confirm', { gain: .65 });
    try {
      const next = await options.onChoose?.(chosen);
      if (!alive) return;
      guardian = next?.guardian || null;
      if (next?.lines?.length) {
        pages = pagesOf(next.lines); page = 0; shown = 0; stage = 'epilogue';
        accessiblePage();
        Audio.sfx('chime', { gain: .7 });
      } else finish(true);
    } catch (error) {
      if (!alive) return;
      console.error('[story:choice]', error);
      pages = pagesOf(["Let's take a breath. Please speak to me again in a moment."]);
      page = 0; shown = 0; stage = 'failed';
      accessiblePage();
    }
  }

  function move(delta) {
    pick = (pick + delta + choices.length) % choices.length;
    accessiblePage();
    Audio.sfx('cursor', { gain: .65 });
  }

  function point(event) {
    if (!ready() || stage === 'pending' || (event.button ?? 0) !== 0 || event.isPrimary === false) return;
    const bounds = screen?.getBoundingClientRect();
    if (!bounds?.width || !bounds.height) return;
    const x = (event.clientX - bounds.left) * R.W / bounds.width;
    const y = (event.clientY - bounds.top) * R.H / bounds.height;
    if (x < 0 || x > R.W || y < 0 || y > R.H) return;
    if (stage === 'choices') {
      for (let slot = 0; slot < 3; slot++) {
        const box = cardRect(slot), index = cardStart() + slot;
        if (index >= choices.length || x < box.x || x > box.x + box.w || y < box.y || y > box.y + box.h) continue;
        event.preventDefault();
        // A first tap previews the companion. Tapping the selected card commits.
        if (pick === index) choose();
        else { pick = index; accessiblePage(); Audio.sfx('cursor', { gain: .65 }); }
        return;
      }
      return;
    }
    event.preventDefault(); advance();
  }

  function background() {
    const backdrop = Atlas.tryGet(setting.backdrop)
      || (options.setting !== 'cottage' ? Atlas.tryGet('scene.battle') : null);
    R.rect(0, 0, R.W, R.H, setting.tone);
    if (backdrop) R.blit(backdrop, 0, 0, { w: R.W, h: R.H });
    else {
      // A quiet, complete fallback when optional illustrations cannot load.
      R.rect(12, 23, 296, 88, '#3b382d');
      R.rect(22, 27, 60, 79, '#514332');
      R.rect(25, 30, 54, 73, '#736044');
      for (let i = 0; i < 6; i++) R.rect(23, 38 + i * 12, 58, 2, '#372d27');
      R.rect(235, 28, 54, 75, '#534631');
      R.rect(240, 35, 44, 32, '#90b6a0');
      R.rect(260, 35, 3, 32, '#382c25'); R.rect(240, 49, 44, 3, '#382c25');
    }
    const ctx = R.ctx;
    ctx.globalAlpha = stage === 'choices' ? .38 : .15;
    R.rect(0, 0, R.W, 112, setting.tone); ctx.globalAlpha = 1;
    if (motion()) {
      ctx.globalAlpha = .5;
      for (let i = 0; i < 9; i++) {
        const x = 16 + ((i * 41 + Math.sin((t + i * 19) / 90) * 3) % 292);
        const y = 27 + ((i * 23 + t * .045) % 72);
        R.rect(x, y, 1, 1, '#f2d79b');
      }
      ctx.globalAlpha = 1;
    }
    R.rect(0, 0, R.W, 22, '#161e20');
    R.rect(12, 21, 296, 1, '#927650');
    R.text(String(options.title || 'A moment by the hearth').toUpperCase(), 160, 7,
      { color: GOLD, shadow: false, align: 'center' });
  }

  function portrait() {
    const actor = guardian ? Atlas.tryGet(`g.${guardian}.front`) : Atlas.tryGet(`story.${options.portrait}`);
    const fallback = !actor && Atlas.tryGet(`c.${options.portrait || 'gran'}.down`);
    const image = actor || fallback;
    const bob = motion() ? Math.sin(t / 60) * .8 : 0;
    if (image) {
      const w = guardian ? 104 : fallback ? 54 : 112;
      const h = guardian ? 104 : fallback ? 81 : 128;
      const ctx = R.ctx;
      ctx.save(); ctx.beginPath(); ctx.rect(0, 22, R.W, 88); ctx.clip();
      R.blit(image, guardian ? 33 : fallback ? 59 : 25, (guardian ? 17 : fallback ? 30 : 23) + bob, { w, h });
      ctx.restore();
    }
    // Keep the hearth and landscape visible; the illustration carries the mood.
    const label = guardian ? 'A NEW COMPANION' : setting.label;
    const name = guardian ? choices.find(choice => choice.id === guardian)?.label : null;
    const width = Math.max(R.measure(label), name ? R.measure(name) : 0) + 12;
    const ctx = R.ctx;
    ctx.globalAlpha = .58;
    R.rect(307 - width, 28, width, name ? 25 : 14, '#18211f'); ctx.globalAlpha = 1;
    R.text(label, 301, 32, { color: guardian ? GOLD : '#eee4cf', shadow: '#18211f', align: 'right' });
    if (name) R.text(name, 301, 43, { color: '#fff0cd', shadow: '#18211f', align: 'right' });
  }

  function choiceCards() {
    const first = cardStart();
    for (let slot = 0; slot < 3; slot++) {
      const index = first + slot, choice = choices[index];
      if (!choice) continue;
      const box = cardRect(slot), selected = index === pick;
      R.rect(box.x, box.y, box.w, box.h, selected ? '#463b28' : '#1c2927');
      R.stroke(box.x, box.y, box.w, box.h, selected ? GOLD : '#647268');
      R.stroke(box.x + 2, box.y + 2, box.w - 4, box.h - 4, selected ? '#9d8150' : '#303c36');
      const image = Atlas.tryGet(`g.${choice.id}.front`);
      if (image) R.blit(image, box.x + 15, box.y + 2, { w: 66, h: 66 });
      R.text(choice.label, box.x + box.w / 2, box.y + 64,
        { color: selected ? '#ffe7ac' : '#d7ded1', shadow: '#1a1c18', align: 'center' });
      if (selected) {
        R.rect(box.x + 36, box.y + box.h - 4, 24, 1, GOLD);
        R.text('◆', box.x + box.w / 2, box.y - 8, { color: GOLD, align: 'center' });
      }
    }
  }

  function dialogue() {
    R.rect(7, 110, 306, 44, '#624a30');
    R.rect(8, 111, 304, 42, PAPER);
    R.rect(10, 113, 300, 1, '#d9bd84');
    const name = String(options.speaker || '');
    if (name && stage !== 'choices' && stage !== 'pending') {
      const width = R.measure(name) + 16;
      R.rect(14, 100, width, 13, '#332d24');
      R.rect(14, 100, 2, 13, GOLD);
      R.text(name, 22, 103, { color: '#ffe6ad', shadow: false });
    }
    let lines = pages[page], count = shown;
    if (stage === 'choices') {
      lines = Font.wrap(choices[pick].detail || `Would you like ${choices[pick].label} to travel beside you?`, 284).slice(0, 3);
      count = Infinity;
    } else if (stage === 'pending') { lines = ['A new bond is taking shape...']; count = Infinity; }
    lines.forEach((line, i) => {
      const limit = Math.max(0, Math.min(line.length, Math.floor(count))); count -= line.length;
      R.text(line, 18, 118 + i * 12, { color: INK, shadow: false, limit });
    });
    if (Input.device !== 'touch') {
      const hint = stage === 'choices'
        ? `${Input.label('move')} choose   ${Input.label('a')} confirm   ${Input.label('b')} later`
        : stage === 'pending' ? 'A moment...' : `${Input.label('a')} ${typed() ? 'continue' : 'reveal'}  /  click to continue`;
      R.text(hint, 160, 163, { color: '#eee1c5', shadow: '#111a19', align: 'center' });
    }
  }

  const scene = {
    pausesBelow: true, drawsBelow: false,
    get touchPhase() {
      if (closing || open < (motion() ? IN_FRAMES : 1)) return 'pending';
      return stage === 'choices' || stage === 'pending' ? stage : typed() ? 'narrative' : 'reveal';
    },
    enter() {
      alive = true; Input.reset();
      screen = document.getElementById('screen');
      previousLabel = screen?.getAttribute?.('aria-label') ?? null;
      accessiblePage();
      screen?.addEventListener('pointerdown', point);
      previousSong = Audio.playing;
      if (Audio.hasSong('story')) { Audio.play('story', { fade: .6 }); changedSong = true; }
    },
    exit() {
      alive = false;
      screen?.removeEventListener('pointerdown', point);
      // Preserve gamepad edge state: clearing it here would make a still-held
      // confirm button become a fresh world interaction on the following frame.
      for (const button of ['a', 'b']) if (Input.held(button)) Input.consume(button);
      if (previousLabel === null) screen?.removeAttribute?.('aria-label');
      else screen?.setAttribute?.('aria-label', previousLabel);
      if (changedSong && Audio.playing === 'story') {
        if (previousSong) Audio.play(previousSong, { fade: .6 });
        else Audio.stop({ fade: .3 });
      }
    },
    update() {
      t++;
      if (closing) {
        if (++closing > (motion() ? OUT_FRAMES : 1)) Scenes.remove(scene, result);
        return;
      }
      if (open < (motion() ? IN_FRAMES : 1)) { open++; return; }
      if (stage === 'pending') return;
      if (stage === 'choices') {
        if (Input.pressed('b')) { finish(false); return; }
        if (Input.nav('right') || Input.nav('down')) move(1);
        if (Input.nav('left') || Input.nav('up')) move(-1);
        if (Input.pressed('a')) choose();
        return;
      }
      if (Input.pressed('a') || Input.pressed('b')) { advance(); return; }
      if (!typed()) {
        const speed = SPEED[Math.max(1, Math.min(3, S.settings.textSpeed || 2))];
        shown = Math.min(pageLength(), shown + speed);
        if (t % 4 === 0) Audio.sfx('text', { gain: .3 });
      }
    },
    render() {
      R.worldZoom = 1;
      R.layer(LAYER.UI, () => {
        background();
        if (stage === 'choices' || stage === 'pending') choiceCards();
        else portrait();
        dialogue();
        const fade = closing ? closing / (motion() ? OUT_FRAMES : 1) : 1 - open / (motion() ? IN_FRAMES : 1);
        if (fade > 0) {
          R.ctx.globalAlpha = Math.min(1, fade); R.rect(0, 0, R.W, R.H, '#111a19'); R.ctx.globalAlpha = 1;
        }
      });
    },
  };
  return scene;
}

export function register() {
  Scenes.register('story', storyScene);
  if (!busyInstalled) {
    const previousBusy = Object.getOwnPropertyDescriptor(UIx, 'busy')?.get;
    UIx.install({ get busy() { return Scenes.isActive('story') || !!previousBusy?.call(UIx); } });
    busyInstalled = true;
  }
  UIx.install({
    async story(options) {
      const result = await Scenes.pushAsync('story', options);
      return result || { completed: false, choice: -1 };
    },
  });
}
