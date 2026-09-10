// Pause is a clear stopping place: progress, controls and the next destination.
import { R, LAYER } from '../core/renderer.js';
import { Input } from '../core/input.js';
import { Scenes } from '../core/scene.js';
import { Audio } from '../core/audio.js';
import { UIx, Hooks } from '../core/bridge.js';
import { Font } from '../core/font.js';
import { S, save } from '../state.js';
import { P, mix } from '../art/palette.js';
import { Frame } from './frame.js';
import { journeyGoal } from './hud.js';

const ITEMS = [
  { id: 'party', label: 'Guardians', scene: 'party', hint: 'Choose your lead. Visit Guardians at home.' },
  { id: 'village', label: 'Village', scene: 'village', hint: 'Build a home. Help Emberhollow grow.' },
  { id: 'missions', label: 'Family missions', scene: 'missions', hint: 'Small things together earn Hearth' },
  { id: 'dex', label: 'Field journal', scene: 'dex', hint: 'Discover the Guardians of the valley' },
  { id: 'save', label: 'Save progress', hint: 'Keep this journey on this device' },
  { id: 'settings', label: 'Settings', hint: 'Sound, reading pace and journey hints' },
  { id: 'close', label: 'Keep exploring', hint: 'The valley is waiting for you' },
];

const fit = (text, width) => {
  let out = String(text);
  if (Font.measure(out) <= width) return out;
  while (out && Font.measure(out + '…') > width) out = out.slice(0, -1);
  return out + '…';
};

function pauseScene() {
  let sel = 0, busy = false, notice = '', noticeLife = 0;

  async function pick() {
    const it = ITEMS[sel];
    busy = true;
    try {
      Audio.sfx('confirm');
      if (it.id === 'close') { Scenes.pop(); return; }
      if (it.id === 'save') {
        notice = save() ? 'Progress saved on this device.' : 'Save failed. Try again before leaving.';
        noticeLife = 240;
        return;
      }
      if (it.id === 'settings') { Scenes.push('settings'); return; }
      // Placement needs the world directly below it, without Pause's dimmer.
      if (it.id === 'village' && Scenes.has(it.scene)) Scenes.replace(it.scene);
      else if (it.scene && Scenes.has(it.scene)) Scenes.push(it.scene);
      else await UIx.say('Not open yet.');
    } finally { busy = false; }
  }

  return {
    pausesBelow: true, drawsBelow: true,
    update() {
      if (noticeLife > 0) noticeLife--;
      if (busy || UIx.busy) return;
      if (Input.pressed('b') || Input.pressed('start')) { Audio.sfx('cancel'); Scenes.pop(); return; }
      if (Input.nav('down')) { sel = (sel + 1) % ITEMS.length; Audio.sfx('cursor'); }
      if (Input.nav('up')) { sel = (sel + ITEMS.length - 1) % ITEMS.length; Audio.sfx('cursor'); }
      if (Input.pressed('a')) { Input.consume('a'); pick(); }
    },
    render() {
      R.layer(LAYER.UI, () => {
        R.rect(0, 0, R.W, R.H, 'rgba(9,22,24,0.64)');
        const x = 8, y = 8, w = 174;
        Frame.panel(x, y, w, 146, 'dark');
        Frame.write('A MOMENT BY THE HEARTH', x + 10, y + 10, 'dark', { color: P.gold1 });
        Frame.write(fit(S.player.name, w - 20), x + 10, y + 25, 'dark');
        const map = Hooks.world.currentMap();
        const place = map?.name || 'Emberhollow';
        Frame.write(fit(place, w - 20), x + 10, y + 36, 'dark', { color: P.ui1 });
        R.rect(x + 10, y + 49, w - 20, 1, '#50665a');
        const goal = journeyGoal(map);
        Frame.write('NEXT ON YOUR JOURNEY', x + 10, y + 57, 'dark', { color: P.gold1 });
        Frame.write(fit(goal.title, w - 20), x + 10, y + 70, 'dark');
        Font.wrap(goal.hint, w - 20).slice(0, 2).forEach((line, i) =>
          Frame.write(line, x + 10, y + 82 + i * 10, 'dark', { color: P.ui1 }));
        const homes = S.village.buildings.filter(b => b.type === 'cottage').length;
        Frame.write(`Village Lv ${safeLevel()}  ·  ${homes} ${homes === 1 ? 'home' : 'homes'}`, x + 10, y + 108,
          'dark', { color: P.gold1 });
        Frame.write(`${S.party.length}/6 travelling  ·  ${S.box.length} at home`, x + 10, y + 120, 'dark');
        Frame.write(fit(`${S.coins} coins  ·  ${S.hearth} Hearth`, w - 20), x + 10, y + 132, 'dark', { color: P.ui1 });

        const mx = 190, mw = R.W - mx - 8;
        Frame.panel(mx, y, mw, 146, 'paper');
        Frame.write('YOUR JOURNEY', mx + 10, y + 10, 'paper', { color: P.gold3 });
        ITEMS.forEach((it, i) => {
          const iy = y + 29 + i * 16;
          if (i === sel) {
            R.rect(mx + 5, iy - 3, mw - 10, 15, mix(P.gold1, P.paper0, 0.5));
            R.rect(mx + 5, iy - 3, 2, 15, P.gold3);
          }
          Frame.write(it.label, mx + 12, iy, 'paper', { color: i === sel ? P.ink : P.ink3 });
        });
        const hint = noticeLife > 0 ? notice : ITEMS[sel].hint;
        Frame.write(fit(hint, R.W - 16), 8, 160, 'dark', { color: noticeLife > 0 ? P.gold1 : P.ui0 });
        Frame.write(`${Input.label('a')} select   ${Input.label('b')} back`, R.W - 8, 171, 'dark', { align: 'right', color: P.ui1 });
      });
    },
  };
}

function settingsScene() {
  let sel = 0, busy = false, message = 'Make the journey feel right for you.';
  const rows = () => [
    ['Sound', Audio.muted ? 'Off' : 'On'],
    ['Volume', `${Math.round(S.settings.volume * 100)}%`],
    ['Reading pace', ['Slow', 'Normal', 'Fast'][(S.settings.textSpeed || 2) - 1]],
    ['Journey hints', S.settings.showHints === false ? 'Off' : 'On'],
    ['Ambient motion', S.settings.reducedMotion ? 'Reduced' : 'Full'],
    ['Graphics', S.settings.graphics === 'balanced' ? 'Balanced' : 'High detail'],
    ['Save and return to title', ''],
    ['Back to your journey', ''],
  ];

  async function change(step = 1) {
    if (sel === 7) { Scenes.pop(); return; }
    if (sel === 6) {
      busy = true;
      try {
        if (!await UIx.confirm('Save this journey and return to the title?')) return;
        if (!save()) { message = 'Save failed. Your journey is still open.'; return; }
        await UIx.fade('out', 14);
        Scenes.reset('title');
        await UIx.fade('in', 14);
      } finally { busy = false; }
      return;
    }
    if (sel === 0) S.settings.muted = Audio.toggleMute();
    else if (sel === 1) {
      S.settings.volume = Math.max(0, Math.min(1, Math.round((S.settings.volume + step * 0.1) * 10) / 10));
      Audio.setVolume(S.settings.volume);
    } else if (sel === 2) S.settings.textSpeed = ((S.settings.textSpeed || 2) - 1 + step + 3) % 3 + 1;
    else if (sel === 3) S.settings.showHints = S.settings.showHints === false;
    else if (sel === 4) { S.settings.reducedMotion = !S.settings.reducedMotion; R.cinematicFx = !S.settings.reducedMotion; }
    else if (sel === 5) {
      S.settings.graphics = S.settings.graphics === 'balanced' ? 'high' : 'balanced';
      R.setQuality(S.settings.graphics);
    }
    Audio.sfx('cursor');
    message = save() ? 'Settings saved on this device.' : 'Changed for this session. Save unavailable.';
  }

  return {
    pausesBelow: true, drawsBelow: true,
    update() {
      if (busy || UIx.busy) return;
      if (Input.pressed('b') || Input.pressed('start')) { Audio.sfx('cancel'); Scenes.pop(); return; }
      if (Input.nav('down')) { sel = (sel + 1) % 8; Audio.sfx('cursor'); }
      if (Input.nav('up')) { sel = (sel + 7) % 8; Audio.sfx('cursor'); }
      if (Input.pressed('a')) { Input.consume('a'); change(); }
      else if (sel < 6 && Input.nav('right')) change(1);
      else if (sel < 6 && Input.nav('left')) change(-1);
    },
    render() {
      R.layer(LAYER.UI, () => {
        R.rect(0, 0, R.W, R.H, 'rgba(9,22,24,0.85)');
        Frame.panel(20, 8, R.W - 40, 154, 'paper');
        Frame.write('SETTINGS', 32, 18, 'paper');
        Frame.write(fit(message, R.W - 64), 32, 30, 'paper', { color: P.ink3 });
        rows().forEach(([name, value], i) => {
          const y = 45 + i * 14;
          if (sel === i) R.rect(28, y - 3, R.W - 56, 15, mix(P.gold1, P.paper0, 0.5));
          Frame.write(name, 34, y, 'paper');
          Frame.write(value, R.W - 34, y, 'paper', { align: 'right', color: P.gold3 });
        });
        Frame.write(`◀ ▶ adjust   ${Input.label('a')} select   ${Input.label('b')} back`, R.W / 2, 169, 'dark', { align: 'center' });
      });
    },
  };
}

const safeLevel = () => { try { return Hooks.village.level(); } catch { return 1; } };

export function register() {
  R.cinematicFx = !S.settings.reducedMotion;
  Scenes.register('pause', () => pauseScene());
  Scenes.register('settings', () => settingsScene());
}
