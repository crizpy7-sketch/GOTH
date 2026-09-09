// Scene transitions.
//
// The battle transition is the one that has to earn its keep: it is the moment the
// world hands over, and a plain fade wastes it. Ours is an original hearth-ember
// flourish — rings of embers rush out from the player, the screen snaps twice, then
// the world burns away to black. No screen ever gets stuck: every transition
// resolves exactly once, and the scene pops itself even if interrupted.

import { R, LAYER } from '../core/renderer.js';
import { Scenes } from '../core/scene.js';
import { Audio } from '../core/audio.js';
import { UIx } from '../core/bridge.js';
import { P, mix } from '../art/palette.js';
import { clamp, ease } from '../core/util.js';
import { makeRng } from '../core/rng.js';

const rng = makeRng(31337);
let active = false;

// A transition is a scene so it draws above the world and blocks input beneath it.
function fxScene(kind, frames, opts, done) {
  let f = 0;
  const embers = [];
  if (kind === 'battle') {
    for (let i = 0; i < 46; i++) {
      const a = rng.range(0, Math.PI * 2);
      // Slow enough to stay on screen for the whole transition — the first pass
      // had them off the edge before anyone could see them.
      embers.push({ a, sp: rng.range(0.9, 2.6), r0: rng.range(0, 10), size: rng.float() < 0.35 ? 2 : 1 });
    }
  }

  const scene = {
    pausesBelow: true, drawsBelow: true,
    update() {
      if (++f >= frames) { Scenes.remove(scene); done(); }
    },
    render() {
      R.layer(LAYER.UI, ctx => {
        const k = clamp(f / frames, 0, 1);

        if (kind === 'fade' || kind === 'doorway') {
          const a = opts.dir === 'out' ? k : 1 - k;
          ctx.globalAlpha = a;
          R.rect(0, 0, R.W, R.H, opts.color || '#0b0e14');
          ctx.globalAlpha = 1;
          return;
        }

        if (kind === 'iris') {
          const a = opts.dir === 'out' ? k : 1 - k;
          const maxR = Math.hypot(R.W, R.H) / 2 + 8;
          const r = (1 - ease.inOutCubic(a)) * maxR;
          const cx = opts.cx ?? R.W / 2, cy = opts.cy ?? R.H / 2;
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, 0, R.W, R.H);
          ctx.arc(cx, cy, Math.max(0, r), 0, Math.PI * 2, true);
          ctx.fillStyle = '#0b0e14';
          ctx.fill('evenodd');
          ctx.restore();
          return;
        }

        // --- battle ---
        const cx = R.W / 2, cy = R.H / 2;
        // One soft snap, not two hard ones. Repeated full-screen white flashes are a
        // photosensitivity risk, and a partial-alpha wash reads just as sharply.
        if (f >= 3 && f <= 6) {
          ctx.globalAlpha = 0.5 - (f - 3) * 0.12;
          R.rect(0, 0, R.W, R.H, '#fff3d0');
          ctx.globalAlpha = 1;
        }
        // Ember rings rushing outward.
        ctx.globalAlpha = clamp(1 - k * 0.3, 0, 1);
        for (const e of embers) {
          const d = e.r0 + e.sp * f;
          const x = cx + Math.cos(e.a) * d;
          const y = cy + Math.sin(e.a) * d * 0.72;
          const c = d < 40 ? P.spark0 : d < 80 ? P.ember0 : P.ember2;
          R.rect(x, y, e.size, e.size, c);
        }
        ctx.globalAlpha = 1;
        // Expanding ring outline.
        for (const mult of [1, 0.62]) {
          const r = k * 150 * mult;
          ctx.strokeStyle = mult === 1 ? P.ember1 : P.gold0;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.ellipse(cx, cy, r, r * 0.72, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        // Then the world burns away from the edges inward.
        if (k > 0.55) {
          const b = ease.inQuad((k - 0.55) / 0.45);
          const inset = (1 - b) * (R.W / 2);
          ctx.fillStyle = '#0b0e14';
          ctx.fillRect(0, 0, inset, R.H);
          ctx.fillRect(R.W - inset, 0, inset, R.H);
          ctx.fillRect(0, 0, R.W, inset * (R.H / R.W));
          ctx.fillRect(0, R.H - inset * (R.H / R.W), R.W, inset * (R.H / R.W));
        }
      });
    },
  };
  return scene;
}

let seq = 0;
function run(kind, frames, opts = {}) {
  return new Promise(res => {
    active = true;
    const name = `__fx${seq++}`;
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true; active = false;
      Scenes.unregister(name);
      res();
    };
    Scenes.register(name, () => fxScene(kind, frames, opts, done));
    Scenes.push(name);
    // Safety net: if the scene is popped from underneath us, still resolve.
    setTimeout(done, (frames + 30) * 17);
  });
}

export const Transition = {
  get active() { return active; },
  fade(dir = 'out', frames = 14, color) { return run('fade', frames, { dir, color }); },
  iris(dir = 'out', cx, cy) { return run('iris', 20, { dir, cx, cy }); },
  doorway(dir = 'out') { return run('doorway', 12, { dir }); },
  async battle() {
    Audio.sfx('chime', { rate: 0.7 });
    Audio.duck(900);
    await run('battle', 42);
  },
};

export function register() {
  UIx.install({
    fade: (dir, frames) => Transition.fade(dir, frames),
    iris: (dir, cx, cy) => Transition.iris(dir, cx, cy),
    doorway: dir => Transition.doorway(dir),
    battleFx: () => Transition.battle(),
    get transitioning() { return active; },
  });
}
