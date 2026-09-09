// The clock, the seasons, the weather, and the light they produce.
//
// One in-game minute per real second: a full day is 24 real minutes, so a play
// session sees dawn, noon, dusk, and night without anyone waiting around.

import { S } from '../state.js';
import { Bus, EV } from '../core/events.js';
import { R } from '../core/renderer.js';
import { tintFor } from '../art/palette.js';
import { Atlas } from '../art/atlas.js';
import { makeRng } from '../core/rng.js';

export const FRAMES_PER_MINUTE = 60;      // 1 in-game minute per real second
export const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
export const DAYS_PER_SEASON = 7;

let acc = 0;
const rng = makeRng(4242);
const drops = [];
let particleWeather = null;

export function tickClock(n = 1) {
  const c = S.clock;
  acc += n;
  while (acc >= FRAMES_PER_MINUTE) {
    acc -= FRAMES_PER_MINUTE;
    c.minute++;
    if (c.minute >= 60) {
      c.minute = 0;
      c.hour++;
      if (c.hour >= 24) {
        c.hour = 0;
        c.day++;
        Bus.emit(EV.DAY_CHANGED, { day: c.day });
        rollWeather();
        if ((c.day - 1) % DAYS_PER_SEASON === 0) {
          const i = (SEASONS.indexOf(c.season) + 1) % SEASONS.length;
          c.season = SEASONS[i];
          Bus.emit(EV.SEASON_CHANGED, c.season);
        }
      }
    }
  }
}

function rollWeather() {
  const c = S.clock;
  const r = rng.float();
  if (c.season === 'winter') c.weather = r < 0.32 ? 'snow' : 'clear';
  else if (c.season === 'autumn') c.weather = r < 0.28 ? 'rain' : r < 0.34 ? 'storm' : 'clear';
  else c.weather = r < 0.18 ? 'rain' : 'clear';
}

export const isNight = () => S.clock.hour >= 19 || S.clock.hour < 6;
export const clockText = () => `${String(S.clock.hour).padStart(2, '0')}:${String(S.clock.minute).padStart(2, '0')}`;
export const timeOfDay = () => {
  const h = S.clock.hour;
  if (h < 6) return 'night';
  if (h < 9) return 'dawn';
  if (h < 17) return 'day';
  if (h < 20) return 'dusk';
  return 'night';
};

/** Screen tint for the current moment. Drawn on LAYER.WEATHER by the overworld. */
export function drawLighting(map) {
  const c = S.clock;
  const { color, alpha, mode } = tintFor(c.hour + c.minute / 60, c.season, c.weather);
  if (map?.indoor) {
    // Preserve the warm timber and readable furniture while the windows/hearth
    // supply local light. A heavy full-screen tint hid the room's small details.
    const a = Math.max(0.06, Math.min(alpha * 0.55, 0.24));
    if (a > 0.02) R.tintScreen('#20263a', a, 'multiply');
    return;
  }
  // Night remains visibly blue, with enough reflected light to follow roads and
  // identify objects away from a lamp. Weather still contributes its own tint.
  const readableAlpha = mode === 'multiply' ? Math.min(0.58, alpha * 0.78) : alpha;
  if (readableAlpha > 0.01) R.tintScreen(color, readableAlpha, mode);
}

/** Falling weather particles, screen-space so they cost nothing to scroll. */
export function drawWeather(map) {
  if (map?.indoor) return;
  const w = S.clock.weather;
  // Rain and snow have different speeds. Rebuild when the weather changes so
  // yesterday's rain cannot become snow falling at rain speed.
  if (w !== particleWeather) { drops.length = 0; particleWeather = w; }
  if (w === 'clear') return;
  const snow = w === 'snow';
  const reducedMotion = !R.cinematicFx;
  const want = reducedMotion ? (snow ? 12 : 16) : w === 'storm' ? 62 : snow ? 36 : 44;
  while (drops.length < want) {
    drops.push({
      x: rng.float() * (R.W + 40) - 20, y: rng.float() * R.H,
      v: snow ? 0.4 + rng.float() * 0.5 : 3.2 + rng.float() * 2.2,
      d: snow ? (rng.float() - 0.5) * 0.5 : -1.1,
      p: rng.float() * 6.28, f: Math.floor(rng.float() * 4),
    });
  }
  while (drops.length > want) drops.pop();

  const img = Atlas.tryGet(snow ? 'fx.snow' : 'fx.rain', 0);
  // A second, slower depth layer makes storms and snow feel spatial rather than flat.
  for (let i = 0; i < drops.length; i++) {
    const d = drops[i];
    const far = (i % 3) === 0;
    d.y += d.v * (far ? 0.58 : 1) * (reducedMotion ? 0.45 : 1);
    d.x += (d.d + (snow ? Math.sin(d.p += 0.04) * 0.4 : 0)) * (reducedMotion ? 0.45 : 1);
    if (d.y > R.H) { d.y = -6; d.x = rng.float() * (R.W + 40) - 20; }
    if (d.x < -20) d.x = R.W + 10;
    if (img) R.blit(img, d.x, d.y, { alpha: far ? (snow ? 0.38 : 0.24) : (snow ? 0.88 : 0.62) });
    else R.rect(d.x, d.y, 1, snow ? 1 : (far ? 2 : 4), snow ? '#eef6ff' : '#9fc9e8');
  }
  // A storm communicates through weather and lighting; avoid full-screen white
  // flashes that can obscure the player or make a relaxed session uncomfortable.
}

/** Warm pools of light under lit lamps and windows once the sun is down. */
export function drawNightGlow(map, cam) {
  if (map?.indoor) {
    // Interior hearths are a material light source at every hour, not just a
    // differently coloured furniture tile. Their restrained warm pool supplies
    // the depth and focus the room otherwise lacks.
    const night = isNight();
    if (!night) {
      for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
        if (map.ground(x, y) !== 't.iwall.window') continue;
        const sx = x * 16 + 8 - cam.x, sy = y * 16 + 14 - cam.y;
        const ctx = R.ctx;
        ctx.save();
        ctx.fillStyle = 'rgba(255,223,157,0.075)';
        ctx.beginPath();
        ctx.moveTo(sx - 4, sy); ctx.lineTo(sx + 3, sy);
        ctx.lineTo(sx + 18, sy + 25); ctx.lineTo(sx + 1, sy + 25);
        ctx.closePath(); ctx.fill();
        ctx.restore();
        R.glow(sx + 7, sy + 19, 25, 'rgba(255,224,170,0.11)', 0.5);
      }
    }
    for (const tag of ['hearthfire', 'stove']) {
      for (const p of map.findTag(tag)) {
        const x = p.x * 16 + 8 - cam.x, y = p.y * 16 + 8 - cam.y;
        R.glow(x, y, tag === 'hearthfire' ? 48 : 30,
          tag === 'hearthfire' ? 'rgba(255,174,82,0.38)' : 'rgba(255,202,122,0.24)',
          night ? 0.70 : 0.50);
      }
    }
    return;
  }
  if (!isNight()) return;
  // Deliberately gentle. A lamp should pool warmth on the ground, not bleach
  // whatever is standing under it.
  const deep = S.clock.hour >= 21 || S.clock.hour < 5;
  const a = deep ? 0.20 : 0.13;
  for (const p of map.findTag('lamp')) {
    // Pool the light on the ground BELOW the lamp, wide and soft. Centring a tight,
    // strong glow on the fitting itself just blows the fitting out to white.
    const x = p.x * 16 + 8 - cam.x, y = p.y * 16 + 18 - cam.y;
    if (x < -50 || y < -50 || x > R.W + 50 || y > R.H + 50) continue;
    R.glow(x, y, 38, `rgba(255,204,128,${a})`, 0.5);
  }
  for (const st of map.structures || []) {
    const x = (st.x + st.w / 2) * 16 - cam.x, y = (st.y - st.overhang / 2) * 16 - cam.y;
    if (x < -60 || y < -60 || x > R.W + 60 || y > R.H + 60) continue;
    R.glow(x, y, 22, 'rgba(255,190,104,0.26)', 0.5);
  }
}

/** Which lamp art to use — the lit variant only after dark. */
export const lampTile = () => (isNight() ? 't.lamp.lit' : 't.lamp');

export function register() {
  // Weather should already match the season on a fresh save.
  if (!S.clock.weather) rollWeather();
}
