// 320x180 logical UI, with a 960x540 backing store for detailed world artwork.
//
// Layers: 0 ground, 1 mid (decor under the player), 2 entity (y-sorted),
//         3 over (tree canopies, roofs, anything that occludes the player),
//         4 weather/lighting, 5 ui.
// Scenes never touch ctx directly outside of a layer callback — that ordering is what
// makes the world read correctly at a glance.

import { Font } from './font.js';
import { clamp } from './util.js';

export const LAYER = { GROUND: 0, MID: 1, ENTITY: 2, OVER: 3, WEATHER: 4, UI: 5 };

const N_LAYERS = 6;
const layers = Array.from({ length: N_LAYERS }, () => []);
const entities = [];

let canvas, ctx, scale = 1;
let viewportEl, playfieldEl, stageEl, rotateGateEl;
let layoutObserver = null, resizeFrame = 0;
let settleTimers = [];
let shakeFrames = 0, shakeMag = 0, shakeX = 0, shakeY = 0;
let flashFrames = 0, flashTotal = 0, flashColor = '#fff';
let cinematicFx = true;
const silhouettes = new WeakMap();
let atmosphere = null;

function atmosphereLayer() {
  if (atmosphere) return atmosphere;
  atmosphere = document.createElement('canvas');
  atmosphere.width = 640; atmosphere.height = 360;
  const c = atmosphere.getContext('2d'); c.scale(2, 2);
  const shade = c.createRadialGradient(160, 80, 45, 160, 90, 190);
  shade.addColorStop(0, 'rgba(13,27,24,0)');
  shade.addColorStop(.65, 'rgba(13,27,24,0.025)');
  shade.addColorStop(1, 'rgba(13,27,24,0.25)');
  c.fillStyle = shade; c.fillRect(0, 0, 320, 180);
  const light = c.createRadialGradient(145, 24, 0, 145, 24, 150);
  light.addColorStop(0, 'rgba(255,224,168,0.04)');
  light.addColorStop(1, 'rgba(255,224,168,0)');
  c.fillStyle = light; c.fillRect(0, 0, 320, 180);
  return atmosphere;
}

const cssNumber = value => Number.parseFloat(value) || 0;

function viewportBox() {
  const vv = window.visualViewport;
  return {
    left: vv ? vv.offsetLeft : 0,
    top: vv ? vv.offsetTop : 0,
    width: vv ? vv.width : (document.documentElement.clientWidth || window.innerWidth),
    height: vv ? vv.height : (document.documentElement.clientHeight || window.innerHeight),
  };
}

// Safari updates its layout and visual viewports on different frames while its
// browser chrome or orientation changes. Coalescing resize signals and measuring
// one extra frame later keeps the stage and controls in one coordinate space.
function scheduleResize() {
  if (!canvas || resizeFrame) return;
  resizeFrame = requestAnimationFrame(() => {
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      R.resize();
    });
  });
}

function settleViewport() {
  for (const timer of settleTimers) clearTimeout(timer);
  scheduleResize();
  settleTimers = [80, 220, 480, 760].map(delay => setTimeout(scheduleResize, delay));
}

export const R = {
  W: 320, H: 180,
  resolution: 3,
  worldZoom: 1,
  get viewW() { return this.W / this.worldZoom; },
  get viewH() { return this.H / this.worldZoom; },
  camera: { x: 0, y: 0 },
  get ctx() { return ctx; },
  get canvas() { return canvas; },
  get scale() { return scale; },
  get cinematicFx() { return cinematicFx; },
  set cinematicFx(v) { cinematicFx = !!v; },

  init(el) {
    canvas = el;
    viewportEl = document.getElementById('gameViewport');
    playfieldEl = document.getElementById('playfield');
    stageEl = document.getElementById('stage') || canvas.parentElement;
    rotateGateEl = document.getElementById('rotateGate');
    canvas.width = this.W * this.resolution; canvas.height = this.H * this.resolution;
    ctx = canvas.getContext('2d', { alpha: false });
    ctx.imageSmoothingEnabled = false;
    this.resize();
    addEventListener('resize', scheduleResize, { passive: true });
    addEventListener('orientationchange', settleViewport, { passive: true });
    addEventListener('pageshow', settleViewport, { passive: true });
    document.addEventListener('fullscreenchange', settleViewport, { passive: true });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', scheduleResize, { passive: true });
      window.visualViewport.addEventListener('scroll', scheduleResize, { passive: true });
    }
    if (window.screen.orientation?.addEventListener) {
      window.screen.orientation.addEventListener('change', settleViewport);
    }
    if ('ResizeObserver' in window) {
      layoutObserver = new ResizeObserver(scheduleResize);
      layoutObserver.observe(document.documentElement);
      if (viewportEl) layoutObserver.observe(viewportEl);
    }
    settleViewport();
  },

  resize() {
    if (!canvas) return;

    const view = viewportBox();
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty('--vv-left', `${view.left}px`);
    rootStyle.setProperty('--vv-top', `${view.top}px`);
    rootStyle.setProperty('--vv-width', `${view.width}px`);
    rootStyle.setProperty('--vv-height', `${view.height}px`);

    const viewportStyle = viewportEl ? getComputedStyle(viewportEl) : null;
    const safe = {
      left: cssNumber(viewportStyle?.paddingLeft),
      right: cssNumber(viewportStyle?.paddingRight),
      top: cssNumber(viewportStyle?.paddingTop),
      bottom: cssNumber(viewportStyle?.paddingBottom),
    };
    const stageStyle = stageEl ? getComputedStyle(stageEl) : null;
    const chrome = {
      x: cssNumber(stageStyle?.paddingLeft) + cssNumber(stageStyle?.paddingRight)
        + cssNumber(stageStyle?.borderLeftWidth) + cssNumber(stageStyle?.borderRightWidth),
      y: cssNumber(stageStyle?.paddingTop) + cssNumber(stageStyle?.paddingBottom)
        + cssNumber(stageStyle?.borderTopWidth) + cssNumber(stageStyle?.borderBottomWidth),
    };

    const rail = 0;
    rootStyle.setProperty('--control-rail', `${rail}px`);
    const availableWidth = Math.max(0, view.width - safe.left - safe.right - chrome.x - rail * 2);
    const availableHeight = Math.max(0, view.height - safe.top - safe.bottom - chrome.y);
    const rawScale = Math.min(availableWidth / this.W, availableHeight / this.H);
    // A fine-grained fractional scale preserves the full 16:9 frame while making
    // maximum use of every phone size. Quantising downward guarantees containment.
    scale = Math.max(1 / 4096, Math.floor(rawScale * 4096) / 4096);
    const width = this.W * scale;
    const height = this.H * scale;
    const playfieldWidth = width + chrome.x;
    const playfieldHeight = height + chrome.y;

    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    rootStyle.setProperty('--playfield-width', `${playfieldWidth}px`);
    rootStyle.setProperty('--playfield-height', `${playfieldHeight}px`);

    const portrait = document.body.classList.contains('touch')
      && matchMedia('(orientation: portrait)').matches;
    document.body.classList.toggle('is-portrait', portrait);
    if (rotateGateEl) rotateGateEl.setAttribute('aria-hidden', String(!portrait));

    // A small diagnostic snapshot makes real-device layout reports inspectable
    // without coupling input or gameplay code to visualViewport details.
    window.__hearthViewport = {
      ...view,
      safe,
      chrome,
      canvas: { width, height },
      playfield: { width: playfieldWidth, height: playfieldHeight },
      scale,
      portrait,
    };
  },

  // ---- frame lifecycle (main.js owns these) ----
  begin() {
    this.worldZoom = 1;
    for (let i = 0; i < N_LAYERS; i++) layers[i].length = 0;
    entities.length = 0;
    if (shakeFrames > 0) {
      shakeFrames--;
      const m = shakeMag * (shakeFrames / 8);
      shakeX = Math.round((Math.random() * 2 - 1) * m);
      shakeY = Math.round((Math.random() * 2 - 1) * m);
    } else { shakeX = shakeY = 0; }
  },

  flush() {
    ctx.setTransform(this.resolution, 0, 0, this.resolution, 0, 0);
    ctx.save();
    if (shakeX || shakeY) ctx.translate(shakeX, shakeY);
    ctx.scale(this.worldZoom, this.worldZoom);
    for (let i = 0; i < LAYER.UI; i++) {
      if (i === LAYER.ENTITY && entities.length) {
        entities.sort((a, b) => a.y - b.y || a.seq - b.seq);
        for (const e of entities) e.fn(ctx);
      }
      const l = layers[i];
      for (let k = 0; k < l.length; k++) l[k](ctx);
    }
    ctx.restore();
    if (flashFrames > 0) {
      ctx.globalAlpha = clamp(flashFrames / flashTotal, 0, 1);
      ctx.fillStyle = flashColor;
      ctx.fillRect(0, 0, this.W, this.H);
      ctx.globalAlpha = 1;
      flashFrames--;
    }

    // Premium pixel presentation pass. It adds depth without blurring the art or
    // touching gameplay: a restrained vignette and warm bloom. The UI is rendered
    // afterwards so its text and health bars retain their intended contrast.
    if (cinematicFx) {
      // Static atmospheric gradients are baked once instead of recompositing
      // multiple full-resolution multiply/screen passes every animation frame.
      ctx.drawImage(atmosphereLayer(), 0, 0, this.W, this.H);
    }
    // Text and health bars remain unshaken and outside the world color grade.
    for (const draw of layers[LAYER.UI]) draw(ctx);
  },

  layer(n, fn) { layers[n].push(fn); },
  sortEntity(y, fn) { entities.push({ y, seq: entities.length, fn }); },

  // ---- drawing ----
  clear(color = '#0b0e14') {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, this.W, this.H);
  },

  blit(img, x, y, o) {
    if (!img) return;
    const dx = Math.round(x), dy = Math.round(y);
    const iw = img.logicalWidth || img.width, ih = img.logicalHeight || img.height;
    const ratio = img.pixelRatio || 1;
    if (!o) { ctx.drawImage(img, dx, dy, iw, ih); return; }
    const a = o.alpha;
    if (a !== undefined && a <= 0) return;
    if (a !== undefined && a < 1) ctx.globalAlpha = a;
    if (o.flipX) {
      ctx.save();
      ctx.translate(dx + (o.w || iw), dy);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0, o.w || iw, o.h || ih);
      ctx.restore();
    } else if (o.clip) {
      const c = o.clip;
      ctx.drawImage(img, c.x * ratio, c.y * ratio, c.w * ratio, c.h * ratio, dx, dy, c.w, c.h);
    } else if (o.w || o.h) {
      ctx.drawImage(img, dx, dy, o.w || iw, o.h || ih);
    } else {
      ctx.drawImage(img, dx, dy, iw, ih);
    }
    if (a !== undefined && a < 1) ctx.globalAlpha = 1;
  },

  // Silhouette blit: draws `img` as a flat colour. Used for hit flashes and shadows.
  silhouette(img, x, y, color, alpha = 1) {
    if (!img) return;
    let colors = silhouettes.get(img);
    if (!colors) { colors = new Map(); silhouettes.set(img, colors); }
    let tinted = colors.get(color);
    if (!tinted) {
      tinted = document.createElement('canvas');
      tinted.width = img.width; tinted.height = img.height;
      const c = tinted.getContext('2d');
      c.drawImage(img, 0, 0); c.globalCompositeOperation = 'source-in';
      c.fillStyle = color; c.fillRect(0, 0, img.width, img.height);
      colors.set(color, tinted);
    }
    ctx.globalAlpha = alpha;
    ctx.drawImage(tinted, Math.round(x), Math.round(y), img.logicalWidth || img.width, img.logicalHeight || img.height);
    ctx.globalAlpha = 1;
  },

  rect(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  },
  stroke(x, y, w, h, color) {
    ctx.fillStyle = color;
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y + h - 1, w, 1);
    ctx.fillRect(x, y, 1, h); ctx.fillRect(x + w - 1, y, 1, h);
  },
  text(str, x, y, o) { return Font.draw(ctx, str, x, y, o); },
  measure(str) { return Font.measure(str); },

  // ---- camera ----
  worldToScreen(wx, wy) {
    return [Math.round(wx - this.camera.x), Math.round(wy - this.camera.y)];
  },
  centerOn(wx, wy, bounds) {
    const vw = this.viewW, vh = this.viewH;
    let cx = wx - vw / 2, cy = wy - vh / 2;
    if (bounds) {
      cx = bounds.w * 16 <= vw ? (bounds.w * 16 - vw) / 2 : clamp(cx, 0, bounds.w * 16 - vw);
      cy = bounds.h * 16 <= vh ? (bounds.h * 16 - vh) / 2 : clamp(cy, 0, bounds.h * 16 - vh);
    }
    this.camera.x = cx; this.camera.y = cy;
  },

  // ---- effects ----
  shake(px = 3, frames = 8) { if (!cinematicFx) return; shakeMag = px; shakeFrames = frames; },
  flash(color = '#fff', frames = 6) { if (!cinematicFx) return; flashColor = color; flashFrames = frames; flashTotal = frames; },
  tintScreen(color, alpha, mode = 'multiply') {
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = mode;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, this.viewW, this.viewH);
    ctx.restore();
  },
  // Additive glow patch — used for lanterns and windows at night.
  glow(x, y, r, color, alpha) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.restore();
  },
};
