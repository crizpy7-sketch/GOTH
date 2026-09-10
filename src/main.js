// Boot sequence and top-level wiring.
//
// Deliberately fault-tolerant: every feature module is soft-imported. A module that is
// missing or throws degrades to a placeholder instead of taking the game down, so
// pieces can land independently and the build is always launchable and screenshottable.

import { R } from './core/renderer.js';
import { Input, initInput } from './core/input.js';
import { Scenes } from './core/scene.js';
import { startLoop, Loop } from './core/loop.js';
import { buildFont, loadIllustratedFont, Font } from './core/font.js';
import { Audio, defineCoreSfx } from './core/audio.js';
import { Atlas } from './art/atlas.js';
import { P } from './art/palette.js';
import { S, load, save, hasSave, resetSave, defaults, adopt } from './state.js';
import { Bus, EV } from './core/events.js';
import { makeRng } from './core/rng.js';
import { Hooks } from './core/bridge.js';

export const Q = new URLSearchParams(location.search);
export const DEV = Q.has('dev');

const loaded = { modules: [], missing: [], failed: [] };

async function soft(path, label) {
  try {
    const m = await import(path);
    loaded.modules.push(label);
    return m;
  } catch (err) {
    if (err && /Failed to fetch|Cannot find|404|Importing a module script failed/i.test(String(err.message))) {
      loaded.missing.push(label);
    } else {
      loaded.failed.push({ label, err: String(err.message || err) });
      console.error(`[boot] ${label} failed`, err);
    }
    return null;
  }
}

export async function boot({ veil, startBtn, setBoot }) {
  // Exposed first so the harness can still drive and inspect a build that fails to boot.
  window.__frames = frameWait;
  setBoot('lighting the font…', 6);
  const canvas = document.getElementById('screen');
  R.init(canvas);
  buildFont();
  await loadIllustratedFont();
  initInput();
  defineCoreSfx();

  // ---- art registration (modules self-register painters into the Atlas) ----
  setBoot('drawing the world…', 16);
  const art = {
    tiles: await soft('./art/tiles.js', 'art/tiles'),
    sprites: await soft('./art/sprites.js', 'art/sprites'),
    creatures: await soft('./art/creatures.js', 'art/creatures'),
    effects: await soft('./art/effects.js', 'art/effects'),
    uiart: await soft('./art/uiart.js', 'art/uiart'),
    premium: await soft('./art/premium-assets.js', 'art/premium-assets'),
  };
  for (const m of Object.values(art)) { try { m?.register?.(); } catch (e) { console.error('[art]', e); } }

  setBoot('painting the forest…', 31);
  await Atlas.preloadSheets();
  setBoot('adding the finishing touches…', 34);
  const n = Atlas.build((p, name) => setBoot('bringing the world to life…', 34 + p * 26));

  // ---- audio kits ----
  setBoot('tuning the music…', 62);
  const songs = await soft('./audio/songs.js', 'audio/songs');
  try { songs?.register?.(); } catch (e) { console.error('[songs]', e); }

  // ---- state ----
  setBoot('remembering…', 68);
  if (Q.get('save') === 'fresh') resetSave();
  else if (hasSave()) load();
  R.setQuality(S.settings.graphics);
  if (Q.has('seed')) S.seed = parseInt(Q.get('seed'), 10) | 0;
  window.__rng = makeRng(S.seed);

  // ---- feature modules & scenes ----
  setBoot('opening the gate…', 74);
  const ui = {
    frame: await soft('./ui/frame.js', 'ui/frame'),
    textbox: await soft('./ui/textbox.js', 'ui/textbox'),
    story: await soft('./ui/story.js', 'ui/story'),
    menu: await soft('./ui/menu.js', 'ui/menu'),
    hud: await soft('./ui/hud.js', 'ui/hud'),
    transition: await soft('./ui/transition.js', 'ui/transition'),
    party: await soft('./ui/party.js', 'ui/party'),
    title: await soft('./ui/title.js', 'ui/title'),
    pause: await soft('./ui/pause.js', 'ui/pause'),
  };
  const world = {
    overworld: await soft('./world/overworld.js', 'world/overworld'),
    daynight: await soft('./world/daynight.js', 'world/daynight'),
  };
  const battle = { scene: await soft('./battle/scene.js', 'battle/scene') };
  const village = {
    village: await soft('./village/village.js', 'village/village'),
    buildui: await soft('./village/buildui.js', 'village/buildui'),
  };
  const missions = {
    model: await soft('./missions/missions.js', 'missions/missions'),
    ui: await soft('./missions/missionui.js', 'missions/missionui'),
  };

  setBoot('waking the guardians…', 86);
  // Each module exposes `register()` which calls Scenes.register for the scenes it owns.
  for (const group of [ui, world, battle, village, missions]) {
    for (const m of Object.values(group)) {
      try { m?.register?.(); } catch (e) { console.error('[register]', e); }
    }
  }
  // Foundation fallbacks fill any gap so every entry point is reachable.
  const { installMinimalUI } = await import('./dev/minimal-ui.js');
  loaded.minimalUI = installMinimalUI();
  const { registerFallbacks } = await import('./dev/fallback.js');
  registerFallbacks(loaded);

  R.cinematicFx = !S.settings.reducedMotion && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  Audio.muted = !!S.settings.muted;
  Audio.setVolume(S.settings.volume);

  // ---- main loop ----
  setBoot('ready', 100);
  let started = false;
  let portraitBlocked = false;
  const begin = () => {
    if (started) return;
    started = true;
    // Do not let the gesture that opens the start gate also activate the title.
    Input.reset();
    Audio.init();
    veil.classList.add('gone');
    const entry = Q.get('scene') || (DEV && Q.get('dev') !== '1' ? Q.get('dev') : null) || 'title';
    try {
      Scenes.reset(Scenes.has(entry) ? entry : 'title');
    } catch (err) {
      console.error(`[boot] scene "${entry}" failed to enter`, err);
      Scenes.reset('title');
    }
    window.__boot.ready = true;
  };

  startLoop({
    update() {
      Input.runScripted();
      Input.pollGamepad();
      if (started) {
        const portrait = !!window.__hearthViewport?.portrait;
        if (portrait && !portraitBlocked) Input.reset();
        portraitBlocked = portrait;
        // World time stops on title, in menus, during dialogue, and in battle.
        // Only active exploration advances the save clock.
        if (!portrait && Scenes.topName === 'overworld') {
          S.playtime++;
          world.daynight?.tickClock?.();
        }
        if (!portrait) Scenes.update(1 / 60);
      }
      Input.endFrame();
    },
    render(alpha) {
      R.begin();
      R.clear('#0b0e14');
      if (started) Scenes.render(alpha);
      R.flush();
      if (DEV) drawDevOverlay();
    },
  });

  exposeTestApi({ art, ui, world, battle, village, missions, spriteCount: n });

  // Autoplay-restricted browsers need a gesture; tests and desktop keyboards get in free.
  if (Q.has('autostart') || Q.get('nogate') === '1') begin();
  else {
    startBtn.hidden = false;
    startBtn.addEventListener('click', begin);
    addEventListener('keydown', begin, { once: true });
    addEventListener('pointerdown', begin, { once: true });
  }

  // Autosave on a slow cadence and whenever the tab goes away.
  setInterval(() => { if (started && Scenes.topName !== 'title') save(); }, 20000);
  addEventListener('visibilitychange', () => { if (document.hidden && started) save(); });

  return { started: () => started };
}

function drawDevOverlay() {
  const ctx = R.ctx;
  const lines = [
    `${Loop.fps.toFixed(0)}fps  t${Loop.tick}`,
    `scene ${Scenes.stack.map(s => s.__name).join('>') || '-'}`,
    `${S.player.map} ${S.player.x},${S.player.y} ${S.player.dir}`,
    `art ${Atlas.size}  miss ${loaded.missing.length}  err ${loaded.failed.length}`,
  ];
  ctx.globalAlpha = 0.72;
  R.rect(0, 0, 118, lines.length * 8 + 4, '#000');
  ctx.globalAlpha = 1;
  lines.forEach((l, i) => Font.draw(ctx, l, 3, 2 + i * 8, { color: '#8ff08f', shadow: false }));
}

// Everything Playwright needs to drive and inspect the real game.
function exposeTestApi(mods) {
  window.__game = {
    get state() { return S; },
    get scene() { return Scenes.topName; },
    get stack() { return Scenes.stack.map(s => s.__name); },
    get tick() { return Loop.tick; },
    get fps() { return Loop.fps; },
    get boot() { return loaded; },
    get hooks() { return Hooks.installedSlots; },
    get atlas() { return { size: Atlas.size, names: Atlas.names, pixelLine: Atlas.pixelLine }; },
    mods,
    press: (btn, frames = 3) => Input.script(btn, frames),
    async hold(btn, frames) { Input.script(btn, frames); await frameWait(frames + 2); },
    goto: (name, params) => Scenes.reset(name, params),
    push: (name, params) => Scenes.push(name, params),
    pop: r => Scenes.pop(r),
    save, load, resetSave, defaults, adopt,
    setClock: (h, m = 0) => { S.clock.hour = h; S.clock.minute = m; },
    setSeason: s => { S.clock.season = s; Bus.emit(EV.SEASON_CHANGED, s); },
    setWeather: w => { S.clock.weather = w; },
    sprite: (name, frame = 0) => Atlas.dataUrl(name, frame),
    pause: v => { Loop.paused = v; },
    mute: () => { Audio.muted = true; Audio.setVolume(0); },
    grantStarter: id => Hooks.battle.grantStarter(id),
    missionNote: (kind, payload) => Hooks.missions.note(kind, payload),
  };
  window.__frames = frameWait;
}

// Resolves after N rendered frames — lets tests advance the game deterministically.
function frameWait(n = 1) {
  return new Promise(res => {
    let left = n;
    const tickOnce = () => (--left <= 0) ? res() : requestAnimationFrame(tickOnce);
    requestAnimationFrame(tickOnce);
  });
}
