// Runtime map: bakes authored character rows into flat arrays once, then answers
// lookups in O(1). Autotile masks, tree canopies, and solidity are all derived here
// so map authors only ever write terrain.

import { cellFor } from './legend.js';
import { MAPS } from './maps.js';
import { TILE } from '../core/util.js';
import { hash2 } from '../core/rng.js';

const cache = new Map();

// Four subtle grass variants, chosen by position hash so a field never looks tiled
// and always looks the same on revisit.
const GRASS_VARIANTS = ['t.grass', 't.grass.a', 't.grass.b', 't.grass.c'];

class GameMap {
  constructor(id, def) {
    this.id = id;
    this.def = def;
    this.rows = def.rows;
    this.h = def.rows.length;
    this.w = Math.max(...def.rows.map(r => r.length));
    this.village = !!def.village;
    this.indoor = !!def.indoor;
    this.music = def.music || null;
    this.name = def.name || id;
    this.bounds = { w: this.w, h: this.h };
    this.warps = (def.warps || []).slice();
    this.encounters = def.encounters || null;
    this.npcs = def.npcs || [];
    this.structures = def.structures || [];
    this.bake();
    this.applyStructures();
  }

  // Authored buildings (the ones that predate the player) block their footprint and
  // turn their door tile into a warp, so the world reads as lived-in from tile one.
  applyStructures() {
    for (const st of this.structures) {
      for (let j = st.y; j < st.y + st.h; j++) {
        for (let i = st.x; i < st.x + st.w; i++) {
          if (this.inside(i, j)) this._solid[this.idx(i, j)] = 1;
        }
      }
      if (st.door) {
        const i = this.idx(st.door.x, st.door.y);
        if (this.inside(st.door.x, st.door.y)) {
          this._solid[i] = 0;
          this._tag[i] = 'door';
          this._mid[i] = 't.door.wood';
        }
        if (st.to) {
          const target = MAPS[st.to];
          const back = target?.warps?.find(w => w.to === this.id);
          this.warps.push({
            x: st.door.x, y: st.door.y, to: st.to,
            tx: back ? back.x : 1, ty: back ? back.y : 1,
            dir: 'up', door: true,
          });
        }
      }
    }
  }

  bake() {
    const n = this.w * this.h;
    this._ground = new Array(n).fill('t.grass');
    this._mid = new Array(n).fill(null);
    this._over = new Array(n).fill(null);
    this._solid = new Uint8Array(n);
    this._tag = new Array(n).fill(null);
    this._grass = new Uint8Array(n);
    this._ledge = new Array(n).fill(null);
    this._fam = new Array(n).fill(null);
    this._water = new Uint8Array(n);

    // Pass 1: place everything the legend states directly.
    for (let y = 0; y < this.h; y++) {
      const row = this.rows[y];
      for (let x = 0; x < this.w; x++) {
        const i = y * this.w + x;
        const ch = row[x] ?? '.';
        const c = cellFor(ch);
        this._ground[i] = c.g || 't.grass';
        this._fam[i] = c.fam || null;
        if (c.mid) this._mid[i] = c.mid;
        if (c.over) this._over[i] = c.over;
        if (c.solid) this._solid[i] = 1;
        if (c.tag) this._tag[i] = c.tag;
        if (c.grass) this._grass[i] = 1;
        if (c.ledge) this._ledge[i] = c.ledge;
        if (c.water) this._water[i] = 1;
        if (c.tree) this.placeTree(x, y, c.tree);
      }
    }

    // Pass 2: autotile masks, now that every family is known.
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const i = y * this.w + x;
        const fam = this._fam[i];
        if (!fam) {
          // Quiet variation for plain grass only — never for authored accents.
          if (this._ground[i] === 't.grass') {
            this._ground[i] = GRASS_VARIANTS[Math.floor(hash2(x, y, 7) * 4)];
          }
          continue;
        }
        let m = 0;
        if (this.famAt(x, y - 1) === fam) m |= 1;
        if (this.famAt(x + 1, y) === fam) m |= 2;
        if (this.famAt(x, y + 1) === fam) m |= 4;
        if (this.famAt(x - 1, y) === fam) m |= 8;
        this._ground[i] = `t.${fam}.m${m}`;
      }
    }
  }

  // Off-map counts as the same family, so shorelines don't grow a rim at the edge.
  famAt(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return this._edgeFam ?? null;
    return this._fam[y * this.w + x];
  }

  // 'oak' is a 2x2 canopy anchored top-left; its lower row is the solid trunk band.
  // 'pine' is 1x2. Canopies live on the OVER layer so the player walks behind them.
  placeTree(x, y, kind) {
    const put = (xx, yy, name, solid) => {
      if (xx < 0 || yy < 0 || xx >= this.w || yy >= this.h) return;
      const i = yy * this.w + xx;
      this._over[i] = name;
      if (solid) this._solid[i] = 1;
    };
    if (kind === 'pine') {
      put(x, y, 't.pine.top', false);
      put(x, y + 1, 't.pine.trunk', true);
    } else {
      put(x, y, 't.tree.canopy.nw', false);
      put(x + 1, y, 't.tree.canopy.ne', false);
      put(x, y + 1, 't.tree.canopy.sw', true);
      put(x + 1, y + 1, 't.tree.canopy.se', true);
    }
  }

  // ---- lookups ----
  inside(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  idx(x, y) { return y * this.w + x; }

  ground(x, y) { return this.inside(x, y) ? this._ground[this.idx(x, y)] : null; }
  mid(x, y) { return this.inside(x, y) ? this._mid[this.idx(x, y)] : null; }
  over(x, y) { return this.inside(x, y) ? this._over[this.idx(x, y)] : null; }
  tag(x, y) { return this.inside(x, y) ? this._tag[this.idx(x, y)] : null; }
  isGrass(x, y) { return this.inside(x, y) ? !!this._grass[this.idx(x, y)] : false; }
  isWater(x, y) { return this.inside(x, y) ? !!this._water[this.idx(x, y)] : false; }
  ledge(x, y) { return this.inside(x, y) ? this._ledge[this.idx(x, y)] : null; }

  /** Terrain solidity only. The overworld adds buildings, NPCs, and the player. */
  solid(x, y) {
    if (!this.inside(x, y)) return true;      // the world edge is a wall
    return !!this._solid[this.idx(x, y)];
  }

  warpAt(x, y) {
    for (const w of this.warps) if (w.x === x && w.y === y) return w;
    return null;
  }

  encounterTable(x, y) {
    if (!this.encounters) return null;
    if (!this.isGrass(x, y)) return null;
    return this.encounters;
  }

  /** Every tile carrying a tag, for systems that want to find their own markers. */
  findTag(tag) {
    const out = [];
    for (let i = 0; i < this._tag.length; i++) {
      if (this._tag[i] === tag) out.push({ x: i % this.w, y: Math.floor(i / this.w) });
    }
    return out;
  }

  get pixelW() { return this.w * TILE; }
  get pixelH() { return this.h * TILE; }
}

export function loadMap(id) {
  if (cache.has(id)) return cache.get(id);
  const def = MAPS[id];
  if (!def) throw new Error(`[map] unknown map "${id}"`);
  const m = new GameMap(id, def);
  cache.set(id, m);
  return m;
}

export const mapIds = () => Object.keys(MAPS);
export const clearMapCache = () => cache.clear();
