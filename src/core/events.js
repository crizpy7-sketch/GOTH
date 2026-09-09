// Tiny synchronous event bus. Used for cross-system notifications that must not
// create import cycles (e.g. battle -> missions -> village).

const map = new Map();

export const Bus = {
  on(name, fn) {
    if (!map.has(name)) map.set(name, new Set());
    map.get(name).add(fn);
    return () => Bus.off(name, fn);
  },
  once(name, fn) {
    const off = Bus.on(name, (...a) => { off(); fn(...a); });
    return off;
  },
  off(name, fn) { map.get(name)?.delete(fn); },
  emit(name, payload) {
    const set = map.get(name);
    if (!set) return;
    // Copy so handlers may unsubscribe during dispatch.
    for (const fn of [...set]) {
      try { fn(payload); }
      catch (err) { console.error(`[bus:${name}]`, err); }
    }
  },
  clear(name) { name ? map.delete(name) : map.clear(); },
};

// Canonical event names. Emit/listen through these constants so typos fail loudly.
export const EV = {
  GUARDIAN_CAUGHT: 'guardian:caught',
  GUARDIAN_EVOLVED: 'guardian:evolved',
  GUARDIAN_LEVELUP: 'guardian:levelup',
  BATTLE_WON: 'battle:won',
  BATTLE_LOST: 'battle:lost',
  COINS_CHANGED: 'coins:changed',
  HEARTH_CHANGED: 'hearth:changed',
  BUILDING_PLACED: 'village:placed',
  BUILDING_UPGRADED: 'village:upgraded',
  VILLAGE_LEVEL: 'village:level',
  MISSION_TRACKED: 'mission:tracked',
  MISSION_DONE: 'mission:done',
  DAY_CHANGED: 'clock:day',
  SEASON_CHANGED: 'clock:season',
  MAP_ENTERED: 'map:entered',
  FLAG_SET: 'flag:set',
  TOAST: 'ui:toast',
};
