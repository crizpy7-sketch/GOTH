// Offscreen sprite registry. Modules `define` painters at import time; `build()`
// realises them all once during boot. Everything the game draws comes from here, so
// the draw loop never runs a painter.

const defs = new Map();     // name -> {w,h,frames,painter|sheet,canvases}
let builtCount = 0;
const sheetLoads = [];

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  return c;
}



// -----------------------------------------------------------------------------
// QUANTUM DYNAMIC PIXEL ASSEMBLY LINE — Master Art v3
//
// A deterministic Ford-style line. Each station owns one narrow responsibility,
// then an inspector rejects unsafe output. Animation frames share one profile so
// palette/lighting decisions do not flicker between frames.
const PIXEL_LINE = Object.freeze({
  version: '3.0-master',
  stations: ['sorter', 'profiler', 'palette', 'silhouette', 'material', 'identity', 'animation-qc', 'inspector'],
  rules: ['single-pass-derived-art', 'shared-animation-profile', 'alpha-safe', 'dimension-safe', 'nearest-neighbor'],
});


const MASTER_TUNING = Object.freeze({ run: 100, contrast: 1.3600, saturation: 1.3000, light: 1.1800, edge: 1.1500, sparkle: 1.4200, sparkleMix: 1.1600 });

const pixelAudit = { assets: 0, frames: 0, skippedDerived: 0, rejected: 0, warnings: [], classes: {} };

function assetClass(name) {
  // Derived art is already based on a polished source and must never be polished twice.
  if (name.includes(':')) return 'derived';
  if (name.startsWith('g.')) return 'guardian';
  if (name.startsWith('c.')) return 'avatar';
  if (name.startsWith('b.')) return 'building';
  if (name.startsWith('ui.')) return 'ui';
  if (name.startsWith('fx.')) return 'fx';
  if (name.startsWith('t.')) {
    const ground = /^(t\.(grass|path|trail|water|deepwater|sand|snow|floor|plaza|cobble|gravel|crop\.soil|leaves|puddle|cliff\.(face|top|edge)))(\.|$)/;
    return ground.test(name) ? 'terrain' : 'object';
  }
  return 'other';
}

const clamp8 = v => v < 0 ? 0 : v > 255 ? 255 : v | 0;
const lum = (r, g, b) => r * .2126 + g * .7152 + b * .0722;
const mix8 = (a, b, t) => clamp8(a + (b - a) * t);

function frameStats(canvas) {
  const x = canvas.getContext('2d', { willReadFrequently: true });
  const d = x.getImageData(0, 0, canvas.width, canvas.height).data;
  let opaque = 0, partial = 0, minL = 255, maxL = 0, sumL = 0;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    if (!a) continue;
    if (a < 255) partial++;
    opaque++;
    const l = lum(d[i], d[i + 1], d[i + 2]);
    minL = Math.min(minL, l); maxL = Math.max(maxL, l); sumL += l;
  }
  return { opaque, partial, coverage: opaque / Math.max(1, canvas.width * canvas.height), minL, maxL, avgL: opaque ? sumL / opaque : 0 };
}

function animationProfile(name, canvases) {
  const kind = assetClass(name);
  const stats = canvases.map(frameStats);
  const coverage = stats.reduce((a, s) => a + s.coverage, 0) / Math.max(1, stats.length);
  const avgL = stats.reduce((a, s) => a + s.avgL, 0) / Math.max(1, stats.length);
  const span = Math.max(...stats.map(s => s.maxL), 0) - Math.min(...stats.map(s => s.minL), 255);
  const actor = kind === 'guardian' || kind === 'avatar';
  const strength = coverage > .88 ? .55 : coverage < .12 ? .72 : 1;
  return {
    kind, coverage, avgL, span, actor,
    contrast: (kind === 'guardian' ? 1.11 : kind === 'avatar' ? 1.085 : kind === 'building' ? 1.06 : kind === 'object' ? 1.045 : 1.025) * strength + (1 - strength),
    saturation: kind === 'guardian' ? 1.095 : kind === 'avatar' ? 1.065 : kind === 'building' ? 1.035 : 1.02,
    lightField: actor ? 6 : kind === 'building' ? 4 : 2,
    outline: kind === 'guardian' ? [28, 21, 34] : kind === 'avatar' ? [31, 25, 34] : [39, 31, 31],
  };
}

function polishPixels(name, canvas, profile, frameIndex = 0) {
  const { kind } = profile;
  if (kind === 'derived') { pixelAudit.skippedDerived++; return true; }
  if (kind === 'ui' || kind === 'fx' || kind === 'other') return true;
  const w = canvas.width, h = canvas.height;
  if (!w || !h) return true;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  const before = ctx.getImageData(0, 0, w, h);
  const src = new Uint8ClampedArray(before.data);
  const img = new ImageData(new Uint8ClampedArray(src), w, h);
  const d = img.data;
  const idx = (x, y) => (y * w + x) * 4;
  const opaque = (x, y) => x >= 0 && y >= 0 && x < w && y < h && src[idx(x, y) + 3] > 32;
  const actor = profile.actor;
  const tunedContrast = 1 + (profile.contrast - 1) * MASTER_TUNING.contrast;
  const tunedSaturation = 1 + (profile.saturation - 1) * MASTER_TUNING.saturation;

  // Station 3 — palette. Shared profile prevents animation-frame color pumping.
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = idx(x, y), a = src[i + 3];
    if (a <= 16) continue;
    let r = src[i], g = src[i + 1], b = src[i + 2];
    const l = lum(r, g, b);
    r = l + (r - l) * tunedSaturation;
    g = l + (g - l) * tunedSaturation;
    b = l + (b - l) * tunedSaturation;
    r = 128 + (r - 128) * tunedContrast;
    g = 128 + (g - 128) * tunedContrast;
    b = 128 + (b - 128) * tunedContrast;
    const field = (.5 - y / Math.max(1, h - 1)) * profile.lightField * MASTER_TUNING.light;
    d[i] = clamp8(r + field); d[i + 1] = clamp8(g + field); d[i + 2] = clamp8(b + field);
  }

  // Station 4 — silhouette. Never outline seamless terrain; only transparent-margin art.
  if ((actor || kind === 'building') && profile.coverage < .86) {
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = idx(x, y);
      if (src[i + 3] > 16) continue;
      const near = opaque(x - 1, y) || opaque(x + 1, y) || opaque(x, y - 1) || opaque(x, y + 1);
      if (!near) continue;
      d[i] = profile.outline[0]; d[i + 1] = profile.outline[1]; d[i + 2] = profile.outline[2]; d[i + 3] = actor ? 240 : 214;
    }
  }

  // Seamless terrain must retain its palette at tile boundaries.
  if (kind === 'terrain') { ctx.putImageData(img, 0, 0); return true; }

  // Station 5 — material. Directional edge light and ambient occlusion, kept subtle.
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = idx(x, y);
    if (src[i + 3] <= 32) continue;
    const topEdge = !opaque(x, y - 1) || !opaque(x - 1, y);
    const lowEdge = !opaque(x, y + 1) || !opaque(x + 1, y);
    if (topEdge && y < h * .70) {
      const t = (kind === 'guardian' ? .13 : actor ? .105 : .065) * MASTER_TUNING.edge;
      d[i] = mix8(d[i], 255, t); d[i + 1] = mix8(d[i + 1], 244, t); d[i + 2] = mix8(d[i + 2], 214, t);
    } else if (lowEdge && y > h * .24) {
      const t = (kind === 'guardian' ? .17 : actor ? .14 : .09) * MASTER_TUNING.edge;
      d[i] = mix8(d[i], 24, t); d[i + 1] = mix8(d[i + 1], 21, t); d[i + 2] = mix8(d[i + 2], 31, t);
    }
  }

  // Station 6 — identity highlights. Stable spatial hash; no random per-frame shimmer.
  if (kind === 'guardian') {
    let seed = 2166136261;
    for (let k = 0; k < name.length; k++) seed = Math.imul(seed ^ name.charCodeAt(k), 16777619);
    for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) {
      const i = idx(x, y);
      if (src[i + 3] < 230 || lum(src[i], src[i + 1], src[i + 2]) < 112) continue;
      const hash = Math.imul(seed ^ (x + y * 131), 2246822519) >>> 0;
      if (hash % Math.max(113, Math.round(257 / MASTER_TUNING.sparkle)) !== 0) continue;
      d[i] = mix8(d[i], 255, .29 * MASTER_TUNING.sparkleMix); d[i + 1] = mix8(d[i + 1], 248, .29 * MASTER_TUNING.sparkleMix); d[i + 2] = mix8(d[i + 2], 220, .29 * MASTER_TUNING.sparkleMix);
    }
  }

  // Station 8 — inspector. Reject any mutation to dimensions or original alpha pixels.
  let alphaSafe = true;
  for (let i = 3; i < d.length; i += 4) {
    // Existing painted pixels retain their exact alpha. New silhouette pixels are allowed.
    if (src[i] > 16 && d[i] !== src[i]) { alphaSafe = false; break; }
  }
  if (!alphaSafe || img.width !== w || img.height !== h) {
    pixelAudit.rejected++;
    pixelAudit.warnings.push(`${name}#${frameIndex}: inspector reverted unsafe frame`);
    ctx.putImageData(before, 0, 0);
    return false;
  }
  ctx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = false;
  return true;
}

export const Atlas = {
  define(name, w, h, painter) { this.defineAnim(name, w, h, 1, painter); },

  defineAnim(name, w, h, frames, painter) {
    if (defs.has(name)) console.warn(`[atlas] redefining "${name}"`);
    defs.set(name, { w, h, frames, painter, canvases: null, premium: false });
  },

  // Higher-resolution art keeps its original world footprint. Painters receive
  // physical pixel dimensions; the renderer uses the logical metadata below.
  defineHD(name, w, h, pixelRatio, painter, frames = 1) {
    defs.set(name, { w, h, frames, painter, pixelRatio, canvases: null, premium: true });
  },

  defineSheet(name, w, h, frames, src, opts = {}) {
    if (defs.has(name)) console.warn(`[atlas] premium override "${name}"`);
    const fallback = defs.get(name) || null;
    const image = new Image();
    image.decoding = 'sync';
    const load = new Promise((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error(`[atlas] failed sheet "${name}"`));
    });
    image.src = src;
    const def = { w, h, frames, image, frameW: opts.frameW || w, frameH: opts.frameH || h,
      canvases: null, pixelRatio: opts.pixelRatio || 1, premium: !!opts.premium, fallback };
    sheetLoads.push({ name, load, def });
    defs.set(name, def);
  },

  async preloadSheets() {
    const results = await Promise.allSettled(sheetLoads.map(s => s.load));
    results.forEach((result, i) => {
      if (result.status !== 'rejected') return;
      const sheet = sheetLoads[i];
      if (defs.get(sheet.name) !== sheet.def) return;
      if (sheet.def.fallback) defs.set(sheet.name, sheet.def.fallback);
      else defs.delete(sheet.name);
      console.warn(String(result.reason?.message || result.reason));
    });
    return results.filter(r => r.status === 'fulfilled').length;
  },

  has(name) { return defs.has(name); },
  get names() { return [...defs.keys()]; },
  get size() { return defs.size; },
  get built() { return builtCount; },
  get pixelLine() { return { ...PIXEL_LINE, audit: { ...pixelAudit, warnings: [...pixelAudit.warnings] } }; },

  frames(name) { return defs.get(name)?.frames ?? 0; },

  get(name, frame = 0) {
    const d = defs.get(name);
    if (!d) throw new Error(`[atlas] unknown sprite "${name}"`);
    if (!d.canvases) this._realize(name, d);
    return d.canvases[((frame | 0) % d.frames + d.frames) % d.frames];
  },

  // Safe lookup for optional art (returns null instead of throwing).
  tryGet(name, frame = 0) { return defs.has(name) ? this.get(name, frame) : null; },

  _realize(name, d) {
    // Paint or slice every raw frame first, then profile the animation as one visual unit.
    const raw = [];
    for (let f = 0; f < d.frames; f++) {
      const ratio = d.pixelRatio || 1;
      const c = makeCanvas(d.w * ratio, d.h * ratio);
      c.logicalWidth = d.w; c.logicalHeight = d.h; c.pixelRatio = ratio;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      try {
        if (d.image) {
          const sx = (f * d.frameW) % d.image.width;
          const sy = Math.floor((f * d.frameW) / d.image.width) * d.frameH;
          ctx.drawImage(d.image, sx, sy, d.frameW, d.frameH, 0, 0, c.width, c.height);
        } else d.painter(ctx, c.width, c.height, f);
      } catch (err) { console.error(`[atlas] source "${name}" frame ${f} failed`, err); }
      raw.push(c);
    }
    const profile = animationProfile(name, raw);
    pixelAudit.assets++;
    pixelAudit.frames += raw.length;
    pixelAudit.classes[profile.kind] = (pixelAudit.classes[profile.kind] || 0) + 1;
    raw.forEach((c, f) => {
      try { if (!d.premium) polishPixels(name, c, profile, f); }
      catch (err) {
        pixelAudit.rejected++;
        pixelAudit.warnings.push(`${name}#${f}: ${String(err.message || err)}`);
        console.error(`[pixel-line] "${name}" frame ${f} polish failed`, err);
      }
    });
    d.canvases = raw;
    builtCount++;
  },

  build(onProgress) {
    const names = [...defs.keys()];
    names.forEach((n, i) => {
      const d = defs.get(n);
      if (!d.canvases) this._realize(n, d);
      if (onProgress && (i % 24 === 0)) onProgress(i / names.length, n);
    });
    return names.length;
  },

  // Derived variant: pixel-wise recolour, cached under a new name.
  // mapFn receives and returns [r,g,b,a].
  recolor(name, suffix, mapFn) {
    const key = `${name}:${suffix}`;
    if (defs.has(key)) return key;
    const src = defs.get(name);
    if (!src) throw new Error(`[atlas] unknown sprite "${name}"`);
    this.defineHD(key, src.w, src.h, src.pixelRatio || 1, (ctx, w, h, f) => {
      ctx.drawImage(this.get(name, f), 0, 0);
      const img = ctx.getImageData(0, 0, w, h);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] === 0) continue;
        const out = mapFn([d[i], d[i + 1], d[i + 2], d[i + 3]]);
        d[i] = out[0]; d[i + 1] = out[1]; d[i + 2] = out[2]; d[i + 3] = out[3];
      }
      ctx.putImageData(img, 0, 0);
    }, src.frames);
    return key;
  },

  // Flat-colour silhouette variant (hit flashes, shadows, evolution glow).
  silhouette(name, color) {
    const key = `${name}:sil:${color}`;
    if (defs.has(key)) return key;
    const src = defs.get(name);
    this.defineHD(key, src.w, src.h, src.pixelRatio || 1, (ctx, w, h, f) => {
      ctx.drawImage(this.get(name, f), 0, 0);
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, w, h);
    }, src.frames);
    return key;
  },

  // Test/inspection helper: dump one sprite as a data URL.
  dataUrl(name, frame = 0) { return this.get(name, frame).toDataURL(); },
};

window.__ATLAS__ = Atlas;
window.__PIXEL_RUN__ = MASTER_TUNING;

// Convenience for painters that want a scratch canvas.
export { makeCanvas };
