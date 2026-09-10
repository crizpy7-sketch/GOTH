// Late-binding facade for every cross-piece call.
//
// Why: art, world, battle, village, missions, and ui are built in parallel. If world
// imported village directly, a half-landed village would take the world down. Instead
// each piece installs its implementation here at register() time, and callers get a
// safe no-op until it does. Nothing outside a piece's own folder should be imported
// directly — go through UIx or Hooks.

// ---- UI facade -------------------------------------------------------------------
// ui/textbox.js, ui/hud.js and ui/transition.js replace these via UIx.install().
export const UIx = {
  /** True once the real ui/* modules have installed (minimal-ui leaves it false). */
  real: false,

  /** Typewriter dialogue box. Resolves when the player has read it through. */
  async say(text, opts) { console.info('[say]', text); },
  async sayMany(lines, opts) { for (const l of lines) await this.say(l, opts); },
  /** Important story moment; the ordinary dialogue UI remains a safe fallback. */
  async story(opts = {}) {
    const speech = { speaker: opts.speaker };
    for (const line of opts.lines || []) await this.say(line, speech);
    if (!opts.choices?.length) return { completed: true, choice: -1 };
    const choice = await this.ask(opts.prompt || 'Who will walk beside you?', opts.choices.map(c => c.label), speech);
    if (choice < 0 || choice >= opts.choices.length) return { completed: false, choice: -1 };
    const ending = await opts.onChoose?.(choice);
    for (const line of ending?.lines || []) await this.say(line, speech);
    return { completed: true, choice };
  },
  /** Returns the chosen index, or -1 if cancelled. */
  async ask(text, choices, opts) { return 0; },
  async confirm(text) { return true; },
  get busy() { return false; },

  toast(text, opts) { console.info('[toast]', text); },

  async fade(dir, frames) {},
  async iris(dir, cx, cy) {},
  async battleFx() {},
  async doorway(dir) {},
  get transitioning() { return false; },

  /** Nine-slice panel. Fallback draws a plain readable box. */
  panel(x, y, w, h, style) { fallbackPanel(x, y, w, h, style); },

  // Copies property *descriptors*, so an implementation may supply getters
  // (e.g. `get busy()`) over the facade's own getters. Object.assign cannot.
  install(impl, { real = true } = {}) {
    for (const k of Reflect.ownKeys(impl)) {
      if (k === 'real') continue;
      Object.defineProperty(UIx, k, Object.getOwnPropertyDescriptor(impl, k));
    }
    if (real) UIx.real = true;
  },
};

// ---- cross-piece hooks -----------------------------------------------------------
const noop = () => {};

export const Hooks = {
  /** village/village.js */
  village: {
    /** Called by world after a map loads: stamp solids, doors, and ground finishing. */
    applyTo(map) {},
    /** LAYER.MID ground finishing (plaza, paths) for the current map. */
    drawGround(map, cam) {},
    /** Push building sprites into the y-sorted entity layer. */
    drawSprites(map, cam, sortEntity) {},
    /** Return an async handler if the tile in front of the player is a village thing. */
    interact(map, x, y) { return null; },
    /** True if this map tile is blocked by a building. */
    solid(map, x, y) { return false; },
    /** Village level, for HUD and gating. */
    level() { return 1; },
    /** Enter placement mode for a building type. */
    openBuildMode(type) {},
  },

  /** missions/missions.js */
  missions: {
    /** Progress hook: any gameplay event that a mission might count. */
    note(kind, payload) {},
    activeCount() { return 0; },
    todayCount() { return 0; },
    list() { return []; },
  },

  /** battle/scene.js — how the world starts a battle. Resolves with 'won'|'lost'|'fled'|'bonded'. */
  battle: {
    async start(params) { console.info('[battle] not built', params); return 'fled'; },
    canBattle() { return false; },
    /** Create and persist the first companion after Gran's introduction. */
    grantStarter(speciesId) { return null; },
  },

  /** world/overworld.js — how village/missions/battle move or refresh the world. */
  world: {
    async warpTo(map, x, y, dir) {},
    refresh() {},
    playerTile() { return { x: 0, y: 0, dir: 'down', map: 'village' }; },
    currentMap() { return null; },
    lockInput(v) {},
    get inputLocked() { return false; },
  },

  /** ui/hud.js — the overworld HUD. The world calls draw() every frame. */
  hud: {
    draw(map) {},
    invalidateMinimap() {},
  },

  /** ui/party.js — party & guardian screens, used by battle and the pause menu. */
  party: {
    async openParty(opts) { return -1; },
    async openSummary(guardian) {},
    async chooseGuardian(opts) { return -1; },
  },

  install(slot, impl) {
    if (!this[slot]) throw new Error(`[bridge] unknown hook slot "${slot}"`);
    for (const k of Reflect.ownKeys(impl)) {
      Object.defineProperty(this[slot], k, Object.getOwnPropertyDescriptor(impl, k));
    }
    installed.add(slot);
  },

  get installedSlots() { return [...installed]; },
};

const installed = new Set();

// Minimal readable panel so fallbacks never look like a crash.
function fallbackPanel(x, y, w, h) {
  // Imported lazily to avoid a cycle with the renderer.
  const R = globalThis.__R;
  if (!R) return;
  R.rect(x, y, w, h, '#4a3826');
  R.rect(x + 1, y + 1, w - 2, h - 2, '#e0cfa6');
  R.rect(x + 2, y + 2, w - 4, h - 4, '#f8f0d8');
  R.stroke(x, y, w, h, '#241a12');
}
