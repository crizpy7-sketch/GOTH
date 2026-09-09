// Small helpers shared by every module. Keep allocation-free where it matters.

export const TILE = 16;

export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const inv = (a, b, v) => (v - a) / (b - a);
export const approach = (v, target, step) =>
  v < target ? Math.min(v + step, target) : Math.max(v - step, target);

// Eased curves used by animations. Keep names stable — UI code references them.
export const ease = {
  linear: t => t,
  inQuad: t => t * t,
  outQuad: t => t * (2 - t),
  inOutQuad: t => t < .5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  outCubic: t => 1 - Math.pow(1 - t, 3),
  inOutCubic: t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  outBack: t => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2),
  outElastic: t => t === 0 || t === 1 ? t
    : Math.pow(2, -9 * t) * Math.sin((t * 10 - .75) * (2 * Math.PI / 3)) + 1,
  outBounce: t => {
    const n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + .75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + .9375;
    return n * (t -= 2.625 / d) * t + .984375;
  },
};

export const DIRS = ['down', 'up', 'left', 'right'];
export const DIR_VEC = {
  down: { x: 0, y: 1 }, up: { x: 0, y: -1 },
  left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
};
export const DIR_INDEX = { down: 0, up: 1, left: 2, right: 3 };
export const opposite = d => ({ down: 'up', up: 'down', left: 'right', right: 'left' })[d];

export const step = (x, y, dir, n = 1) => {
  const v = DIR_VEC[dir];
  return { x: x + v.x * n, y: y + v.y * n };
};

export const dist = (ax, ay, bx, by) => Math.abs(ax - bx) + Math.abs(ay - by);

export const dirTowards = (fx, fy, tx, ty) => {
  const dx = tx - fx, dy = ty - fy;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  if (dy !== 0) return dy > 0 ? 'down' : 'up';
  return null;
};

// Frame-based countdown timers. Cheap, no closures, integer math.
export class Timer {
  constructor() { this.t = 0; }
  set(frames) { this.t = frames; return this; }
  tick() { if (this.t > 0) this.t--; return this.t === 0; }
  get running() { return this.t > 0; }
  get done() { return this.t <= 0; }
}

export const wait = ms => new Promise(r => setTimeout(r, ms));

// Format helpers used across UI.
export const pad2 = n => String(n).padStart(2, '0');
export const commas = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
export const titleCase = s => s.replace(/(^|[\s-])([a-z])/g, (_, a, b) => a + b.toUpperCase());
