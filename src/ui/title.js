// Illustrated title with native controls; game state remains owned by the scene.
import { R, LAYER } from '../core/renderer.js';
import { Input } from '../core/input.js';
import { Scenes } from '../core/scene.js';
import { Audio } from '../core/audio.js';
import { UIx, Hooks } from '../core/bridge.js';
import { S, hasSave, load, defaults, adopt, save } from '../state.js';
import { START } from '../world/maps.js';

function titleScene() {
  let sel = 0, busy = false, saved = null, items = [], buttons = [];
  const el = document.getElementById('titleScreen');
  const menu = document.getElementById('titleMenu');
  const summary = document.getElementById('titleSave');
  function sync() {
    const visible = Scenes.topName === 'title' && !busy;
    if (el) el.hidden = !visible;
    const changed = document.body.classList.contains('title-active') !== visible;
    document.body.classList.toggle('title-active', visible);
    if (changed) R.resize();
    buttons.forEach((b,i) => {
      b.classList.toggle('selected',i===sel);
      if (i===sel) b.setAttribute('aria-current','true');
      else b.removeAttribute('aria-current');
    });
  }
  async function choose() {
    if (busy || UIx.busy) return;
    const it = items[sel];
    if (!it) return;
    busy = true; Input.reset(); sync();
    document.getElementById('screen')?.focus({preventScroll:true});
    try {
      Audio.sfx('confirm');
      if (it.id === 'settings') { await settings(); return; }
      if (it.id === 'new') {
        if (saved && !(await UIx.confirm('Starting a new journey will replace the one you have. Are you sure?'))) return;
        const preferences = {...S.settings};
        adopt(defaults()); S.settings = preferences;
        Object.assign(S.player, START);
        save();
      }
      await UIx.fade('out', 16);
      Scenes.reset('overworld');
      Hooks.world.lockInput(true); Input.reset();
      try {
        await UIx.fade('in', 16);
        if (it.id === 'new') {
          await UIx.sayMany([
            'Welcome to Emberhollow. A little village with a warm hearth and room to grow.',
            'Follow the path north to Gran Willow by the Warmhouse. She has a guardian for you.',
            `Move with ${Input.label('move')}. Press ${Input.label('a')} to talk, ${Input.label('run')} to run, and ${Input.label('start')} for your journal.`,
          ]);
        }
      } finally { if (Scenes.isActive('overworld')) Hooks.world.lockInput(false); }
    } finally { busy=false; sync(); }
  }
  async function settings() {
    if (Scenes.has('sound-settings')) { await Scenes.pushAsync('sound-settings'); return; }
    for (;;) {
      const i = await UIx.ask('Make yourself at home', [
        Audio.muted ? 'Sound: off' : 'Sound: on',
        `Text: ${['slow','normal','fast'][S.settings.textSpeed-1]}`,
        S.settings.reducedMotion ? 'Reduced motion: on' : 'Reduced motion: off',
        'Back',
      ]);
      if (i < 0 || i === 3) break;
      if (i === 0) S.settings.muted = Audio.toggleMute();
      if (i === 1) S.settings.textSpeed = S.settings.textSpeed % 3 + 1;
      if (i === 2) {
        S.settings.reducedMotion = !S.settings.reducedMotion;
        R.cinematicFx = !S.settings.reducedMotion;
      }
      save();
    }
  }
  return {
    get readingText() { return `Welcome to Guardians of the Hearth. ${items[sel]?.label || 'Begin your journey'}.`; },
    enter() {
      if (hasSave() && load()) saved = {name:S.player.name,level:S.village.level,day:S.clock.day};
      items = saved ? [{id:'continue',label:'Continue journey'},{id:'new',label:'New journey'},{id:'settings',label:'Settings'}]
        : [{id:'new',label:'Begin your journey'},{id:'settings',label:'Settings'}];
      buttons = items.map((item,i) => {
        const button = document.createElement('button');
        button.type = 'button'; button.textContent = item.label;
        button.addEventListener('click',()=>{sel=i; choose();});
        button.addEventListener('pointerenter',()=>{sel=i;sync();});
        button.addEventListener('focus',()=>{sel=i;sync();});
        return button;
      });
      menu?.replaceChildren(...buttons);
      if (summary) summary.textContent = saved ? `${saved.name} · Village level ${saved.level} · Day ${saved.day}` : 'A new place to call home.';
      sync();
      if (Audio.hasSong('title')) Audio.play('title');
    },
    update() {
      if (busy || UIx.busy) return;
      if (Input.nav('down')) {sel=(sel+1)%items.length;buttons[sel]?.focus({preventScroll:true});Audio.sfx('cursor');}
      if (Input.nav('up')) {sel=(sel+items.length-1)%items.length;buttons[sel]?.focus({preventScroll:true});Audio.sfx('cursor');}
      if (Input.pressed('a') || Input.pressed('start')) choose();
      sync();
    },
    render() {
      R.layer(LAYER.GROUND,()=>{R.clear('#143b35');R.glow(190,72,150,'#476d49',0.45);});
    },
    exit() { if (el) el.hidden=true;document.body.classList.remove('title-active');R.resize(); }
  };
}
export function register() { Scenes.register('title',titleScene); }
