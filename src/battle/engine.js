// Turn resolution. PURE — no DOM, no state.js, no renderer. Deterministic given B.rng.
//
// Contract (hearth/CONTRACTS.md):
//   newBattle({ party, foe, kind }) -> B
//   chooseAction(B, side, action)
//   stepTurn(B) -> Event[]
//
// The scene consumes the event list and animates it. Events are ordered exactly as they
// should be *presented*, so a scene can be a dumb player of the list:
//
//   text     {k:'text', s, side?, move?, hold?, punch?}
//   damage   {k:'damage', side, target, amount, hp, maxhp, eff, crit, missed?, heal?,
//             cause?, move?, anim?}          amount<0 (with heal:true) is a heal
//   faint    {k:'faint', side, name}
//   stat     {k:'stat', side, target, stat, delta, stage, name, anim?}
//   status   {k:'status', side?, target, status, name, turns?, cured?, anim?}
//   switch   {k:'switch', side, i, from, to, name}
//   bond-try {k:'bond-try', charm, beats, p, name}
//   bond-ok  {k:'bond-ok', species, name, level, hearth, foe, charm}
//   bond-fail{k:'bond-fail', beats, charm, hearth}
//   consume  {k:'consume', item, n}
//   xp       {k:'xp', i, amount, from, to, xpNext, lvl}   (one per level segment)
//   levelup  {k:'levelup', i, level, gains, stats, name}
//   evolve   {k:'evolve', i, from, to, fromName, toName, cancellable}
//   end      {k:'end', outcome:'won'|'lost'|'fled'|'bonded'}
//
// `side` is always the ACTOR's side; `target` the side being acted on.

import { getMove, makeMoveSlot, effectiveness, effLabel, typeMult, STATUS, RULES } from './moves.js';
import {
  SPECIES, STAT_KEYS, STAT_LABEL, isFainted, displayName, recalcStats,
  movesAt, evolutionFor, commitEvolve, xpNeeded, maxLevel,
} from './species.js';
import { bondAttempt, getCharm, bondPreview } from './capture.js';
import { makeRng } from '../core/rng.js';

export { typeMult, effectiveness, effLabel, STATUS, RULES } from './moves.js';
export { commitEvolve } from './species.js';
export { bondPreview, bondChance, CHARMS, getCharm } from './capture.js';

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const other = side => side === 'player' ? 'foe' : 'player';

const volState = () => ({
  boosts: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
  charging: null,
  fainted: false,
  turnsOut: 0,
});

// ---------------------------------------------------------------------------
//  setup
// ---------------------------------------------------------------------------
/**
 * @param party  the player's live party array (mutated: hp, xp, level, moves)
 * @param foe    a guardian, or an array of them for a trainer team
 * @param kind   'wild' | 'trainer'
 * @param ctx    { villageLevel, streak, charm, trainer, bag } — read-only context the
 *               engine needs but must not reach into state.js for.
 */
export function newBattle({ party, foe, kind = 'wild', seed = 1, rng = null, ctx = {} } = {}) {
  const foeParty = Array.isArray(foe) ? foe.slice() : [foe];
  const B = {
    kind,
    rng: rng || makeRng(seed >>> 0 || 1),
    seed,
    party,
    active: Math.max(0, party.findIndex(g => !isFainted(g))),
    foeParty,
    foeActive: Math.max(0, foeParty.findIndex(g => !isFainted(g))),
    turn: 0,
    over: false,
    outcome: null,
    bonded: null,
    needSwitch: null,
    runAttempts: 0,
    actions: { player: null, foe: null },
    vol: { player: volState(), foe: volState() },
    ctx: {
      villageLevel: ctx.villageLevel || 1,
      streak: ctx.streak || 0,
      charm: ctx.charm || 'charm',
      trainer: ctx.trainer || null,
      playerName: ctx.playerName || 'you',
      ...ctx,
    },
    events: [],
  };
  // A fresh battle starts clean: no ailment ever follows a guardian into a new fight.
  for (const g of party) { g.status = null; g.statusTurns = 0; }
  for (const g of foeParty) { g.status = null; g.statusTurns = 0; }
  return B;
}

export const activeOf = (B, side) =>
  side === 'player' ? B.party[B.active] : B.foeParty[B.foeActive];
const nm = g => displayName(g);

// The engine resolves a whole turn before the scene can draw its first beat.
// Copy the visible values so an incoming Guardian cannot appear already hurt
// by an attack that the player has not seen yet.
export const presentationOf = g => g && ({
  ...g, types: [...g.types], stats: { ...g.stats },
  moves: g.moves.map(m => ({ ...m })),
});

/** {type:'move',id} | {type:'switch',i} | {type:'item',id} | {type:'bond',charm?} | {type:'run'} */
export function chooseAction(B, side, action) {
  B.actions[side] = action;
  return B;
}

export const canRun = B => B.kind === 'wild';
export const canBond = B => B.kind === 'wild';
export const hasFocus = g => g.moves.some(m => m.focus > 0);
export const liveParty = B => B.party.filter(g => !isFainted(g));

// ---------------------------------------------------------------------------
//  stats
// ---------------------------------------------------------------------------
const stageMul = n => { n = clamp(n, -6, 6); return n >= 0 ? (2 + n) / 2 : 2 / (2 - n); };

export function statOf(B, side, key) {
  const g = activeOf(B, side);
  if (!g) return 1;
  let v = g.stats[key] * stageMul(B.vol[side].boosts[key] || 0);
  if (key === 'atk' && g.status === 'scorch') v *= RULES.scorchAtk;
  if (key === 'def' && g.status === 'soaked') v *= RULES.soakedDef;
  if (key === 'spe' && g.status === 'tangle') v *= RULES.tangleSpeed;
  return Math.max(1, Math.floor(v));
}

/**
 * Damage. Anchored so a level-5 starter exchange lasts 3-5 turns and a level-50 hit
 * takes roughly a third of a health bar.
 */
function rollDamage(B, side, move) {
  const a = activeOf(B, side), d = activeOf(B, other(side));
  const phys = move.cat === 'physical';
  const A = statOf(B, side, phys ? 'atk' : 'spa');
  const D = statOf(B, other(side), phys ? 'def' : 'spd');
  const lvlTerm = 2 * a.lvl / 5 + 2;
  const base = Math.floor(Math.floor(Math.floor(lvlTerm * move.power * A / D) / 50) + 2);

  const eff = move.fx?.noType ? 1 : effectiveness(move.type, d.types);
  let m = eff;
  if (!move.fx?.noStab && a.types.includes(move.type)) m *= RULES.stab;
  if (d.status === 'soaked' && move.type === 'spark') m *= RULES.soakedSparkTaken;

  const critOdds = move.fx?.crit ? RULES.critHighChance : RULES.critChance;
  const crit = B.rng.float() < critOdds;
  if (crit) m *= RULES.critMult;

  const rand = RULES.randLo + B.rng.float() * (1 - RULES.randLo);
  let dmg = Math.floor(base * m * rand);
  if (eff > 0) dmg = Math.max(RULES.minDamage, dmg);
  return { dmg, eff, crit };
}

/** Non-mutating estimate for the move menu ("this looks effective"). */
export function previewEffect(B, moveId) {
  const move = getMove(moveId);
  if (move.cat === 'status') return { eff: 1, label: 'status' };
  const d = activeOf(B, 'foe');
  const eff = move.fx?.noType ? 1 : effectiveness(move.type, d.types);
  return { eff, label: effLabel(eff) };
}

// ---------------------------------------------------------------------------
//  the turn
// ---------------------------------------------------------------------------
function priorityOf(B, side) {
  const a = B.actions[side];
  if (!a) return -99;
  if (a.type !== 'move') return 6;             // switch / item / bond / run go first
  const slot = activeOf(B, side)?.moves.find(m => m.id === a.id);
  const move = slot && slot.focus <= 0 ? getMove('struggle') : getMove(a.id);
  return move.pri;
}

function turnOrder(B) {
  const sides = ['player', 'foe'];
  const pri = { player: priorityOf(B, 'player'), foe: priorityOf(B, 'foe') };
  if (pri.player !== pri.foe) return pri.player > pri.foe ? sides : sides.reverse();
  const sp = statOf(B, 'player', 'spe'), sf = statOf(B, 'foe', 'spe');
  if (sp !== sf) return sp > sf ? sides : sides.reverse();
  return B.rng.chance(0.5) ? sides : sides.reverse();
}

export function stepTurn(B) {
  const ev = [];
  if (B.over) { ev.push({ k: 'end', outcome: B.outcome }); B.events = ev; return ev; }
  B.turn++;
  if (!B.actions.foe) B.actions.foe = aiAction(B);
  if (!B.actions.player) B.actions.player = aiAction(B, 'player');

  const starting = { player: B.active, foe: B.foeActive };
  for (const side of turnOrder(B)) {
    if (B.over || B.needSwitch) break;
    // A replacement enters on the next turn. It must never execute the action
    // selected by the Guardian that fainted earlier in this one.
    const current = side === 'player' ? B.active : B.foeActive;
    if (current !== starting[side]) continue;
    const actor = activeOf(B, side);
    if (!actor || isFainted(actor)) continue;
    resolveAction(B, side, B.actions[side], ev);
    checkFaints(B, ev);
  }
  if (!B.over && !B.needSwitch) { endOfTurn(B, ev); checkFaints(B, ev); }

  B.actions.player = null;
  B.actions.foe = null;
  if (B.over) ev.push({ k: 'end', outcome: B.outcome });
  B.events = ev;
  return ev;
}

function resolveAction(B, side, action, ev) {
  switch (action?.type) {
    case 'move':   return useMove(B, side, action.id, ev);
    case 'switch': return doSwitch(B, side, action.i, ev);
    case 'item':   return useItem(B, side, action.id, ev);
    case 'bond':   return doBond(B, side, action, ev);
    case 'run':    return doRun(B, side, ev);
    default:       return useMove(B, side, activeOf(B, side).moves[0]?.id || 'struggle', ev);
  }
}

// ---- moves ----------------------------------------------------------------
function useMove(B, side, id, ev) {
  const g = activeOf(B, side);
  const tSide = other(side);
  const vol = B.vol[side];
  let slot = g.moves.find(m => m.id === id);
  let move = getMove(id);

  // Out of focus on the chosen move, or on everything: throw yourself at it.
  if (slot && slot.focus <= 0) { move = getMove('struggle'); slot = null; }
  if (!slot && !hasFocus(g) && move.id !== 'struggle') { move = getMove('struggle'); }

  // --- status gates, before anything is spent ---
  if (g.status === 'tangle' && B.rng.float() < RULES.tangleSkip) {
    ev.push({ k: 'text', s: `${nm(g)} is bound up and cannot move!`, side, hold: 10 });
    return;
  }
  if (g.status === 'dazzled' && B.rng.float() < RULES.dazzledFizzle) {
    ev.push({ k: 'text', s: `${nm(g)} is seeing spots — the move fizzles out!`, side, hold: 10 });
    return;
  }

  // --- two-turn charge ---
  if (move.fx?.charge && vol.charging !== move.id) {
    vol.charging = move.id;
    if (slot) slot.focus = Math.max(0, slot.focus - 1);
    ev.push({ k: 'text', s: `${nm(g)} ${move.fx.charge}!`, side, move: move.id, hold: 12 });
    ev.push({ k: 'stat', side, target: side, stat: 'spa', delta: 0, stage: 0, name: nm(g),
              anim: { fx: move.anim.fx, style: 'self' }, charge: true });
    return;
  }
  const wasCharging = vol.charging === move.id;
  vol.charging = null;
  if (!wasCharging && slot) slot.focus = Math.max(0, slot.focus - 1);

  ev.push({ k: 'text', s: `${nm(g)} used ${move.name}!`, side, move: move.id, hold: 8 });

  const target = activeOf(B, tSide);

  // --- accuracy ---
  if (move.acc !== null && B.rng.float() * 100 >= move.acc) {
    ev.push({ k: 'damage', side, target: tSide, move: move.id, anim: move.anim,
              amount: 0, missed: true, hp: target.hp, maxhp: target.maxhp, eff: 1, crit: false });
    ev.push({ k: 'text', s: `${nm(g)}'s attack went wide!`, hold: 10 });
    return;
  }

  if (move.cat === 'status') { statusMove(B, side, move, ev); return; }

  // --- damage ---
  const hitCount = move.fx?.hits
    ? B.rng.weighted([[2, 3], [3, 3], [4, 1], [5, 1]])
    : 1;
  let landed = 0, lastEff = 1, anyCrit = false, dealt = 0;
  for (let h = 0; h < hitCount; h++) {
    if (isFainted(target)) break;
    const { dmg, eff, crit } = rollDamage(B, side, move);
    lastEff = eff; anyCrit = anyCrit || crit;
    target.hp = Math.max(0, target.hp - dmg);
    dealt += dmg; landed++;
    ev.push({
      k: 'damage', side, target: tSide, move: move.id, anim: move.anim,
      amount: dmg, hp: target.hp, maxhp: target.maxhp, eff, crit,
      hit: h + 1, hits: hitCount,
    });
  }
  if (hitCount > 1) ev.push({ k: 'text', s: `Hit ${landed} time${landed === 1 ? '' : 's'}!`, hold: 8 });
  if (anyCrit) ev.push({ k: 'text', s: 'Right on the mark!', hold: 10 });
  if (lastEff >= 2) ev.push({ k: 'text', s: 'A telling hit!', hold: 12, punch: true });
  else if (lastEff < 1) ev.push({ k: 'text', s: 'It hardly told...', hold: 10 });

  applySecondary(B, side, move, ev, dealt);
}

function applySecondary(B, side, move, ev, dealt) {
  const fx = move.fx;
  if (!fx) return;
  const g = activeOf(B, side), tSide = other(side), t = activeOf(B, tSide);

  if (fx.drain && dealt > 0 && !isFainted(g)) {
    const back = Math.max(1, Math.floor(dealt * fx.drain));
    const gain = Math.min(back, g.maxhp - g.hp);
    if (gain > 0) {
      g.hp += gain;
      ev.push({ k: 'damage', side, target: side, amount: -gain, heal: true,
                hp: g.hp, maxhp: g.maxhp, eff: 1, crit: false,
                anim: { fx: 'fx.heart', style: 'self', shake: 0 } });
      ev.push({ k: 'text', s: `${nm(g)} drew some warmth back.`, hold: 8 });
    }
  }
  if (fx.recoil && dealt > 0) {
    const hurt = Math.max(1, Math.floor(dealt * fx.recoil));
    g.hp = Math.max(0, g.hp - hurt);
    ev.push({ k: 'damage', side, target: side, amount: hurt, cause: 'recoil',
              hp: g.hp, maxhp: g.maxhp, eff: 1, crit: false,
              anim: { fx: 'fx.impact', style: 'self', shake: 2 } });
    ev.push({ k: 'text', s: `${nm(g)} took the shock of it.`, hold: 10 });
  }
  if (fx.status && !isFainted(t)) {
    tryStatus(B, side, tSide, fx.status.id, fx.status.chance ?? 1, ev);
  }
  for (const s of fx.stat || []) {
    const targetSide = s.target === 'self' ? side : tSide;
    if (s.chance !== undefined && B.rng.float() >= s.chance) continue;
    if (targetSide === tSide && isFainted(t)) continue;
    applyStat(B, side, targetSide, s.stat, s.delta, ev);
  }
}

function statusMove(B, side, move, ev) {
  const fx = move.fx || {};
  const g = activeOf(B, side), tSide = other(side);
  let did = false;
  if (fx.heal) { doHeal(B, side, fx.heal, !!fx.cure, ev); did = true; }
  if (fx.status) { tryStatus(B, side, tSide, fx.status.id, fx.status.chance ?? 1, ev); did = true; }
  for (const s of fx.stat || []) {
    const targetSide = s.target === 'self' ? side : tSide;
    if (s.chance !== undefined && B.rng.float() >= s.chance) continue;
    applyStat(B, side, targetSide, s.stat, s.delta, ev, move.anim);
    did = true;
  }
  if (!did) ev.push({ k: 'text', s: `...but nothing came of it.`, hold: 10 });
}

const STATUS_LINE = {
  scorch: n => `${n} is scorched!`,
  tangle: n => `${n} is tangled up!`,
  soaked: n => `${n} is soaked through!`,
  dazzled: n => `${n} is dazzled!`,
};

function tryStatus(B, side, tSide, id, chance, ev) {
  const t = activeOf(B, tSide);
  if (!t || isFainted(t)) return;
  if (t.status) {
    if (chance >= 1) {
      ev.push({ k: 'text', s: `${nm(t)} is already ${STATUS[t.status].name.toLowerCase()}.`, hold: 8 });
    }
    return;
  }
  if (B.rng.float() >= chance) return;
  t.status = id;
  t.statusTurns = B.rng.int(RULES.statusTurns[0], RULES.statusTurns[1]);
  ev.push({ k: 'status', side, target: tSide, status: id, name: nm(t), turns: t.statusTurns });
  ev.push({ k: 'text', s: STATUS_LINE[id](nm(t)), hold: 12 });
}

function applyStat(B, side, tSide, stat, delta, ev, anim) {
  const b = B.vol[tSide].boosts;
  const t = activeOf(B, tSide);
  if (!t) return;
  const before = b[stat] || 0;
  const after = clamp(before + delta, -6, 6);
  const label = STAT_LABEL[stat] || stat.toUpperCase();
  if (after === before) {
    ev.push({ k: 'text', s: `${nm(t)}'s ${label} cannot go ${delta > 0 ? 'higher' : 'lower'}!`, hold: 10 });
    return;
  }
  b[stat] = after;
  ev.push({ k: 'stat', side, target: tSide, stat, delta, stage: after, name: nm(t), anim });
  const word = delta >= 2 ? 'rose sharply' : delta > 0 ? 'rose'
             : delta <= -2 ? 'fell hard' : 'fell';
  ev.push({ k: 'text', s: `${nm(t)}'s ${label} ${word}!`, hold: 10 });
}

function doHeal(B, side, frac, cure, ev) {
  const g = activeOf(B, side);
  const room = g.maxhp - g.hp;
  if (room <= 0 && !(cure && g.status)) {
    ev.push({ k: 'text', s: `${nm(g)} is already at full heart.`, hold: 10 });
    return;
  }
  if (room > 0) {
    const amt = Math.min(room, Math.max(1, Math.floor(g.maxhp * frac)));
    g.hp += amt;
    ev.push({ k: 'damage', side, target: side, amount: -amt, heal: true,
              hp: g.hp, maxhp: g.maxhp, eff: 1, crit: false,
              anim: { fx: 'fx.sparkle', style: 'self', shake: 0 } });
    ev.push({ k: 'text', s: `${nm(g)} steadied and took a breath.`, hold: 10 });
  }
  if (cure && g.status) {
    g.status = null; g.statusTurns = 0;
    ev.push({ k: 'status', side, target: side, status: null, cured: true, name: nm(g) });
    ev.push({ k: 'text', s: `${nm(g)} feels well again.`, hold: 10 });
  }
}

// ---- switch / item / bond / run -------------------------------------------
function doSwitch(B, side, i, ev) {
  if (side !== 'player') return;
  const g = B.party[i];
  if (i === B.active || !g || isFainted(g)) {
    ev.push({ k: 'text', s: 'There is nobody to swap in.', hold: 10 });
    return;
  }
  const from = nm(B.party[B.active]);
  B.active = i;
  B.vol.player = volState();
  ev.push({ k: 'switch', side: 'player', i, from, to: nm(g), name: nm(g), guardian: presentationOf(g) });
  ev.push({ k: 'text', s: `${from}, come back! Your turn, ${nm(g)}!`, hold: 14 });
}

/** After a faint: swaps in without spending a turn. */
export function forceSwitch(B, i) {
  const ev = [];
  const g = B.party[i];
  if (!g || isFainted(g)) return ev;
  B.active = i;
  B.vol.player = volState();
  B.needSwitch = null;
  ev.push({ k: 'switch', side: 'player', i, from: null, to: nm(g), name: nm(g), guardian: presentationOf(g) });
  ev.push({ k: 'text', s: `Your turn, ${nm(g)}!`, hold: 14 });
  return ev;
}

const ITEMS = {
  salve: { name: 'Warm Salve', heal: 24 },
  poultice: { name: 'Poultice', heal: 60 },
  tonic: { name: 'Tonic', cure: true },
  kindling: { name: 'Kindling', focus: 2 },
};
function useItem(B, side, id, ev) {
  const it = ITEMS[id];
  const g = activeOf(B, side);
  if (!it) { ev.push({ k: 'text', s: 'Nothing happened.', hold: 8 }); return; }
  const needsHeal = !!it.heal && g.hp < g.maxhp;
  const needsCure = !!it.cure && !!g.status;
  const needsFocus = !!it.focus && g.moves.some(m => m.focus < m.maxFocus);
  if (!needsHeal && !needsCure && !needsFocus) {
    ev.push({ k: 'text', s: `${nm(g)} does not need that right now.`, hold: 10 });
    return;
  }
  ev.push({ k: 'consume', item: id, n: 1 });
  ev.push({ k: 'text', s: `You used the ${it.name}.`, hold: 8 });
  if (it.heal) {
    const amt = Math.min(g.maxhp - g.hp, it.heal);
    if (amt > 0) {
      g.hp += amt;
      ev.push({ k: 'damage', side, target: side, amount: -amt, heal: true,
                hp: g.hp, maxhp: g.maxhp, eff: 1, crit: false,
                anim: { fx: 'fx.sparkle', style: 'self' } });
      ev.push({ k: 'text', s: `${nm(g)} looks brighter.`, hold: 10 });
    }
  }
  if (it.cure && g.status) {
    g.status = null; g.statusTurns = 0;
    ev.push({ k: 'status', side, target: side, status: null, cured: true, name: nm(g) });
    ev.push({ k: 'text', s: `${nm(g)} feels well again.`, hold: 10 });
  }
  if (it.focus) {
    for (const slot of g.moves) slot.focus = Math.min(slot.maxFocus, slot.focus + it.focus);
    ev.push({ k: 'text', s: `${nm(g)} found a second wind.`, hold: 10 });
  }
}

function doBond(B, side, action, ev) {
  if (side !== 'player') return;
  const foe = activeOf(B, 'foe');
  if (!canBond(B)) {
    ev.push({ k: 'text', s: 'This one already belongs with somebody.', hold: 12 });
    return;
  }
  const charm = action.charm || B.ctx.charm || 'charm';
  ev.push({ k: 'consume', item: charm, n: 1 });
  ev.push({ k: 'text', s: `You held out the ${getCharm(charm).name} and waited.`, hold: 14 });
  const res = bondAttempt(foe, { ...B.ctx, charm, playerLevel: activeOf(B, 'player')?.lvl }, B.rng);
  ev.push({ k: 'bond-try', charm, beats: res.beats, p: res.p, name: nm(foe) });
  if (res.ok) {
    ev.push({ k: 'bond-ok', species: foe.species, name: nm(foe), level: foe.lvl,
              hearth: res.hearth, foe, charm });
    ev.push({ k: 'text', s: `${nm(foe)} decided to come home with you!`, hold: 20, punch: true });
    B.over = true; B.outcome = 'bonded'; B.bonded = foe;
  } else {
    ev.push({ k: 'bond-fail', beats: res.beats, charm, hearth: res.hearth });
    ev.push({ k: 'text', s: res.msg, hold: 16 });
  }
}

function doRun(B, side, ev) {
  if (side !== 'player') return;
  if (!canRun(B)) {
    ev.push({ k: 'text', s: 'There is no walking out of a proper match!', hold: 12 });
    return;
  }
  B.runAttempts++;
  const ps = statOf(B, 'player', 'spe'), fs = statOf(B, 'foe', 'spe');
  const odds = (ps * 128) / Math.max(1, fs) + 30 * B.runAttempts;
  const p = clamp(odds / 256, 0.15, 0.95);
  if (B.rng.float() < p) {
    ev.push({ k: 'text', s: 'You backed away slowly, and it let you.', hold: 16 });
    B.over = true; B.outcome = 'fled';
  } else {
    ev.push({ k: 'text', s: 'You could not get clear!', hold: 14 });
  }
}

// ---- end of turn ----------------------------------------------------------
function endOfTurn(B, ev) {
  const order = statOf(B, 'player', 'spe') >= statOf(B, 'foe', 'spe')
    ? ['player', 'foe'] : ['foe', 'player'];
  for (const side of order) {
    const g = activeOf(B, side);
    if (!g || isFainted(g)) continue;
    if (g.status === 'scorch') {
      const amt = Math.max(1, Math.floor(g.maxhp * RULES.scorchTick));
      g.hp = Math.max(0, g.hp - amt);
      ev.push({ k: 'damage', side, target: side, amount: amt, cause: 'scorch',
                hp: g.hp, maxhp: g.maxhp, eff: 1, crit: false,
                anim: { fx: 'fx.ember', style: 'self', shake: 1 } });
      ev.push({ k: 'text', s: `The scorch bites at ${nm(g)}.`, hold: 12 });
      if (isFainted(g)) continue;
    }
    if (g.status && g.statusTurns > 0) {
      g.statusTurns--;
      if (g.statusTurns <= 0) {
        const was = g.status;
        g.status = null;
        ev.push({ k: 'status', side, target: side, status: null, cured: true, name: nm(g) });
        ev.push({ k: 'text', s: `${nm(g)} shook off the ${STATUS[was].name.toLowerCase()}.`, hold: 12 });
      }
    }
    B.vol[side].turnsOut++;
  }
}

// ---- faints, xp, levels, evolution ---------------------------------------
function checkFaints(B, ev) {
  const f = activeOf(B, 'foe');
  if (f && isFainted(f) && !B.vol.foe.fainted) {
    B.vol.foe.fainted = true;
    ev.push({ k: 'faint', side: 'foe', name: nm(f) });
    ev.push({ k: 'text', s: `${nm(f)} has had enough.`, hold: 18 });
    awardXp(B, f, ev);
    const next = B.foeParty.findIndex(g => !isFainted(g));
    if (next < 0) { B.over = true; B.outcome = 'won'; }
    else {
      B.foeActive = next;
      B.vol.foe = volState();
      const who = B.ctx.trainer?.name || 'The challenger';
      ev.push({ k: 'switch', side: 'foe', i: next, from: null, to: nm(B.foeParty[next]),
                name: nm(B.foeParty[next]), guardian: presentationOf(B.foeParty[next]) });
      ev.push({ k: 'text', s: `${who} sent out ${nm(B.foeParty[next])}!`, hold: 16 });
    }
  }
  const p = activeOf(B, 'player');
  if (p && isFainted(p) && !B.vol.player.fainted) {
    B.vol.player.fainted = true;
    ev.push({ k: 'faint', side: 'player', name: nm(p) });
    ev.push({ k: 'text', s: `${nm(p)} has no heart left to give.`, hold: 18 });
    if (!B.party.some(g => !isFainted(g))) { B.over = true; B.outcome = 'lost'; }
    else if (!B.over) B.needSwitch = 'player';
  }
}

function awardXp(B, foe, ev) {
  const i = B.active;
  const g = B.party[i];
  if (!g || isFainted(g)) return;
  const sp = SPECIES[foe.species];
  let amount = Math.max(1, Math.floor((sp?.xpBase || 60) * foe.lvl / 7));
  if (B.kind === 'trainer') amount = Math.floor(amount * 1.5);
  g.bond = Math.min(255, (g.bond || 0) + 2);
  gainXp(B, i, amount, ev);
  queueEvolution(g, i, ev);
}

/** Exported so the world can hand out XP for non-battle things too. */
export function gainXp(B, i, total, ev = []) {
  const g = B.party[i];
  if (!g) return ev;
  ev.push({ k: 'text', s: `${nm(g)} gained ${total} XP.`, hold: 12 });
  let left = total, guard = 0;
  while (left > 0 && guard++ < 300) {
    if (g.lvl >= maxLevel) { g.xp = 0; break; }
    const room = g.xpNext - g.xp;
    if (left < room) {
      ev.push({ k: 'xp', i, amount: left, from: g.xp, to: g.xp + left, xpNext: g.xpNext, lvl: g.lvl });
      g.xp += left;
      left = 0;
    } else {
      ev.push({ k: 'xp', i, amount: room, from: g.xp, to: g.xpNext, xpNext: g.xpNext, lvl: g.lvl });
      left -= room;
      g.xp = 0;
      levelUp(B, i, ev);
    }
  }
  return ev;
}

function levelUp(B, i, ev) {
  const g = B.party[i];
  const before = { ...g.stats };
  g.lvl++;
  recalcStats(g);
  g.xpNext = xpNeeded(g.lvl, SPECIES[g.species]?.growth);
  const gains = {};
  for (const k of STAT_KEYS) gains[k] = g.stats[k] - (before[k] || 0);
  ev.push({ k: 'levelup', i, level: g.lvl, gains, stats: { ...g.stats }, name: nm(g), maxhp: g.maxhp, hp: g.hp });
  ev.push({ k: 'text', s: `${nm(g)} grew to Lv${g.lvl}!`, hold: 18, punch: true });

  for (const id of movesAt(g.species, g.lvl)) {
    if (g.moves.some(m => m.id === id)) continue;
    if (g.moves.length < 4) {
      g.moves.push(makeMoveSlot(id));
      ev.push({ k: 'text', s: `${nm(g)} learned ${getMove(id).name}!`, hold: 16 });
    } else {
      ev.push({ k: 'text', s: `${nm(g)} could learn ${getMove(id).name}, but knows four moves.`, hold: 16 });
    }
  }
  queueEvolution(g, i, ev);
}

function queueEvolution(g, i, ev) {
  const evo = evolutionFor(g);
  if (!evo || ev.some(e => e.k === 'evolve' && e.i === i && e.from === g.species)) return false;
  ev.push({ k: 'evolve', i, from: g.species, to: evo.to,
            fromName: nm(g), toName: evo.toName, reason: evo.reason, cancellable: true });
  return true;
}

// ---------------------------------------------------------------------------
//  the opponent
// ---------------------------------------------------------------------------
/**
 * Picks weighted by expected value rather than strictly best, so a wild guardian is
 * readable but not a solved puzzle. Deterministic through B.rng.
 */
export function aiAction(B, side = 'foe') {
  const g = activeOf(B, side);
  if (!g) return { type: 'move', id: 'struggle' };
  const foe = activeOf(B, other(side));
  const usable = g.moves.filter(m => m.focus > 0);
  if (!usable.length) return { type: 'move', id: 'struggle' };

  const hurt = 1 - g.hp / Math.max(1, g.maxhp);
  const scored = usable.map(slot => {
    const mv = getMove(slot.id);
    let score;
    if (mv.cat === 'status') {
      if (mv.fx?.heal) score = 6 + hurt * hurt * 120;
      else if (mv.fx?.status) score = foe.status ? 2 : 26;
      else score = 16;
    } else {
      const eff = mv.fx?.noType ? 1 : effectiveness(mv.type, foe.types);
      const stab = g.types.includes(mv.type) ? RULES.stab : 1;
      score = mv.power * eff * stab * (mv.acc === null ? 1 : mv.acc / 100) / 10;
      if (mv.fx?.charge) score *= 0.6;
      if (mv.fx?.recoil) score *= 0.85;
    }
    return [slot.id, Math.max(1, score)];
  });
  return { type: 'move', id: B.rng.weighted(scored) };
}

// ---------------------------------------------------------------------------
//  helpers the scene and the party UI want
// ---------------------------------------------------------------------------
export const hpFrac = g => g && g.maxhp > 0 ? clamp(g.hp / g.maxhp, 0, 1) : 0;
export const hpColorKey = g => {
  const f = hpFrac(g);
  return f > 0.5 ? 'good' : f > 0.2 ? 'warn' : 'bad';
};
export function battleSummary(B) {
  return {
    turn: B.turn, kind: B.kind, over: B.over, outcome: B.outcome,
    player: snap(activeOf(B, 'player')),
    foe: snap(activeOf(B, 'foe')),
  };
}
const snap = g => g && {
  species: g.species, name: displayName(g), lvl: g.lvl,
  hp: g.hp, maxhp: g.maxhp, status: g.status,
};
