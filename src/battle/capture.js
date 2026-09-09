// BONDING — our capture mechanic.
//
// You do not throw anything at a guardian. You hold out a charm, stand still, and see
// whether it decides to come. So the maths is built out of *reasons to trust you*:
//
//   · how tired it is            (a worn-out guardian is glad of the help)
//   · whether it is ailing       (scorched, tangled, soaked, dazzled — it wants out)
//   · what you're offering       (the charm's quality)
//   · how your village is doing  (Hooks.village.level() — a warm village is a good home)
//   · your mission streak        (S.missions.streak — you keep your promises)
//
// The last two are the hook: bonding is the reward for looking after the village and
// the family, not for grinding. A player who has done neither is *not* locked out —
// the floor is 2% — but a player who has is bonding at two or three times the rate.
//
// PURE MODULE — no DOM, no state.js. Everything comes in through `ctx`, so the whole
// thing is node-testable and deterministic given an rng.

import { SPECIES, isFainted } from './species.js';

/** The charms. `power` is a straight multiplier on the bond chance. */
export const CHARMS = Object.freeze({
  charm:     { id: 'charm',     name: 'Woven Charm',   power: 1.0,
               blurb: 'Grass and red thread. The one everybody starts with.' },
  warm:      { id: 'warm',      name: 'Warm Charm',    power: 1.6,
               blurb: 'Kept in a pocket by the fire until it is properly warm.' },
  gilded:    { id: 'gilded',    name: 'Gilded Charm',   power: 2.4,
               blurb: 'Gold leaf over cedar. Catches the light beautifully.' },
  hearthspun:{ id: 'hearthspun',name: 'Hearthspun Charm', power: 3.6,
               blurb: 'Spun from the smoke of the village hearth. Almost never refused.' },
});
export const CHARM_IDS = Object.freeze(Object.keys(CHARMS));
export const getCharm = id => CHARMS[id] || CHARMS.charm;

/** Status ailments make a guardian readier to accept help. */
export const STATUS_BONUS = Object.freeze({
  scorch: 1.4, tangle: 1.6, soaked: 1.4, dazzled: 1.7,
});

export const BOND_BEATS = 4;      // four heartbeats of the charm before it settles

/**
 * The bond chance, 0..1. Broken out from bondAttempt so the UI can *show* it
 * (the bond menu prints a plain-language read of this number) and tests can assert it.
 *
 *   base       species bondRate / 255                (0.03 .. 0.75)
 *   tired      (3*max - 2*hp) / (3*max)              (0.33 at full HP -> ~1.0 at 1 HP)
 *   ailing     STATUS_BONUS                          (1.0 .. 1.7)
 *   charm      CHARMS[..].power                      (1.0 .. 3.6)
 *   village    1 + 0.07 * (villageLevel - 1)         (1.0 .. ~1.6)
 *   streak     1 + 0.045 * min(streak, 12)           (1.0 .. ~1.54)
 *   respect    a guardian far above your level is warier
 */
export function bondChance(foe, ctx = {}) {
  const sp = SPECIES[foe.species];
  const rate = sp ? sp.bondRate : 90;
  const maxhp = Math.max(1, foe.maxhp);
  const hp = Math.max(1, Math.min(maxhp, foe.hp));

  const base = rate / 255;
  const tired = (3 * maxhp - 2 * hp) / (3 * maxhp);
  const ailing = foe.status ? (STATUS_BONUS[foe.status] || 1) : 1;
  const charm = getCharm(ctx.charm).power;
  const village = 1 + 0.07 * Math.max(0, (ctx.villageLevel || 1) - 1);
  const streak = 1 + 0.045 * Math.min(12, Math.max(0, ctx.streak || 0));
  const respect = clamp(1 + ((ctx.playerLevel || foe.lvl) - foe.lvl) / 40, 0.7, 1.25);

  const p = base * tired * ailing * charm * village * streak * respect;
  return clamp(p, 0.02, 0.98);
}

/** Everything the bond UI wants to show, without rolling anything. */
export function bondPreview(foe, ctx = {}) {
  const p = bondChance(foe, ctx);
  return {
    p,
    percent: Math.round(p * 100),
    read: p >= 0.75 ? 'It is already leaning towards you.'
        : p >= 0.5 ? 'It is listening.'
        : p >= 0.28 ? 'It is thinking about it.'
        : p >= 0.12 ? 'It is not sure yet.'
        : 'It is a long way from trusting you.',
    charm: getCharm(ctx.charm),
    factors: {
      tired: Math.round((1 - foe.hp / Math.max(1, foe.maxhp)) * 100),
      ailing: !!foe.status,
      village: ctx.villageLevel || 1,
      streak: ctx.streak || 0,
    },
  };
}

/**
 * Roll a bonding attempt.
 *
 * Four heartbeats, each succeeding with p^(1/4), so all four succeeding is exactly p.
 * Failing on beat 3 still *feels* close, which is the point — the animation gets to
 * show the charm nearly opening.
 *
 * Returns { ok, p, beats, hearth, msg }.
 *   beats  0..4, how far the charm got. 4 = bonded.
 *   hearth how much village hearth the attempt earns (a near miss still earns 1).
 */
export function bondAttempt(foe, ctx = {}, rng) {
  const p = bondChance(foe, ctx);
  if (isFainted(foe)) {
    return { ok: false, p: 0, beats: 0, hearth: 0, msg: 'It cannot hear you.' };
  }
  const per = Math.pow(p, 1 / BOND_BEATS);
  let beats = 0;
  for (let i = 0; i < BOND_BEATS; i++) {
    if (rng.float() < per) beats++;
    else break;
  }
  const ok = beats >= BOND_BEATS;
  return {
    ok, p, beats,
    hearth: ok ? 6 + Math.round(foe.lvl / 2) : (beats >= 3 ? 1 : 0),
    msg: ok ? 'bonded'
       : beats === 3 ? 'It very nearly came.'
       : beats === 2 ? 'It looked back once.'
       : beats === 1 ? 'It took a step, then thought better of it.'
       : 'It kept its distance.',
  };
}

/**
 * The bond a newly-bonded guardian starts with — better village, warmer welcome.
 * Fed straight into makeGuardian's `bond` option by battle/scene.js.
 */
export const startingBond = (ctx = {}) =>
  Math.min(255, 70 + 4 * Math.max(0, (ctx.villageLevel || 1) - 1) + 2 * Math.min(10, ctx.streak || 0));

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
