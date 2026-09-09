// Scene stack. Overworld sits at the bottom; menus, dialogue, and build mode push on
// top of it. A scene may ask to keep the scene below it drawing (drawsBelow) and/or
// updating (pausesBelow: false) — that's how the pause menu renders over the world.

const registry = new Map();
export const stack = [];

function settle(scene, result, error) {
  if (!scene || scene.__settled) return;
  scene.__settled = true;
  if (error) scene.__reject?.(error);
  else scene.__resolve?.(result);
}

function enter(scene, params) {
  try {
    const pending = scene.enter?.(params);
    if (pending && typeof pending.then === 'function') {
      pending.catch(err => {
        console.error(`[scene:${scene.__name}:enter]`, err);
        Scenes.remove(scene, undefined, err);
      });
    }
  } catch (err) {
    Scenes.remove(scene, undefined, err);
    throw err;
  }
}

export const Scenes = {
  register(name, factory) { registry.set(name, factory); },
  unregister(name) { registry.delete(name); },
  get stack() { return stack; },
  get top() { return stack[stack.length - 1] || null; },
  get topName() { return this.top?.__name || null; },
  has(name) { return registry.has(name); },
  isActive(name) { return stack.some(s => s.__name === name); },

  make(name, params) {
    const f = registry.get(name);
    if (!f) throw new Error(`[scene] unknown scene "${name}"`);
    // Params go to the factory. A factory must NOT read Scenes.top to find them —
    // it runs before the new scene is pushed, so top is still the scene below.
    const s = f(params);
    s.__name = name;
    if (s.pausesBelow === undefined) s.pausesBelow = true;
    if (s.drawsBelow === undefined) s.drawsBelow = false;
    s.__params = params;
    return s;
  },

  push(name, params) {
    const s = this.make(name, params);
    stack.push(s);
    enter(s, params);
    return s;
  },

  // Resolves with whatever is handed to pop().
  pushAsync(name, params) {
    return new Promise((resolve, reject) => {
      const s = this.make(name, params);
      s.__resolve = resolve;
      s.__reject = reject;
      stack.push(s);
      enter(s, params);
    });
  },

  pop(result) {
    const s = stack.pop();
    if (!s) return;
    s.exit?.(result);
    settle(s, result);
    return s;
  },

  /** Remove one known scene without disturbing an overlay above it. */
  remove(scene, result, error) {
    const i = stack.indexOf(scene);
    if (i < 0) { settle(scene, result, error); return null; }
    stack.splice(i, 1);
    try { scene.exit?.(result); } finally { settle(scene, result, error); }
    return scene;
  },

  replace(name, params) {
    const s = stack.pop();
    s?.exit?.();
    s?.__resolve?.(undefined);
    return this.push(name, params);
  },

  // Drop everything and start fresh (used by title -> new game, and by resetSave).
  reset(name, params) {
    while (stack.length) this.pop();
    return this.push(name, params);
  },

  popTo(name) {
    while (stack.length > 1 && this.topName !== name) this.pop();
  },

  update(dt) {
    // Walk from the top down; stop updating once a scene claims the pause.
    let i = stack.length - 1;
    const toUpdate = [];
    while (i >= 0) {
      toUpdate.push(stack[i]);
      if (stack[i].pausesBelow) break;
      i--;
    }
    for (let k = toUpdate.length - 1; k >= 0; k--) toUpdate[k].update?.(dt);
  },

  render(alpha) {
    // An empty stack is valid for a brief frame while a scene exits or is replaced.
    if (!stack.length) return;
    // Find the lowest scene that must draw, then render upward.
    let i = stack.length - 1;
    while (i > 0 && stack[i].drawsBelow) i--;
    for (; i < stack.length; i++) stack[i]?.render?.(alpha);
  },
};
