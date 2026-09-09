// Currencies and the ledger.
//
// Two currencies, deliberately different in feel:
//   coins  — earned in the game world (battles, selling, foraging). Buys materials.
//   hearth — earned by real families doing real things together. Buys *warmth*:
//            every building needs some, so the village literally cannot grow on
//            game-grinding alone. That link is the point of the whole project.
//
// Everything that moves money goes through spend()/earn() with a human-readable
// reason, and lands in a capped ledger so the player can always answer
// "where did my coins go?".

import { S, addCoins, addHearth } from '../state.js';
import { Bus, EV } from '../core/events.js';

export const CURRENCY = {
  coins: { id: 'coins', name: 'Coins', short: 'c', icon: 'ui.coin', color: '#f5c877' },
  hearth: { id: 'hearth', name: 'Hearth', short: 'h', icon: 'ui.hearth', color: '#ff9d4d' },
};

const LEDGER_MAX = 40;

function bank() {
  S.village ||= {};
  if (!Array.isArray(S.village.ledger)) S.village.ledger = [];
  return S.village.ledger;
}

/** Normalise anything cost-shaped into {coins, hearth}. */
export const cost = (coins = 0, hearth = 0) =>
  typeof coins === 'object' && coins !== null
    ? { coins: coins.coins | 0, hearth: coins.hearth | 0 }
    : { coins: coins | 0, hearth: hearth | 0 };

export const Economy = {
  get coins() { return S.coins | 0; },
  get hearth() { return S.hearth | 0; },

  cost,

  /** Can the player pay this right now? */
  canAfford(c) {
    const k = cost(c);
    return S.coins >= k.coins && S.hearth >= k.hearth;
  },

  /** What's still missing, as {coins, hearth} of non-negative gaps. */
  shortfall(c) {
    const k = cost(c);
    return {
      coins: Math.max(0, k.coins - S.coins),
      hearth: Math.max(0, k.hearth - S.hearth),
    };
  },

  /** A kind, specific sentence about why you can't pay yet. */
  shortfallText(c) {
    const s = this.shortfall(c);
    const bits = [];
    if (s.coins) bits.push(`${s.coins} more coins`);
    if (s.hearth) bits.push(`${s.hearth} more hearth`);
    if (!bits.length) return '';
    return `Needs ${bits.join(' and ')}.`;
  },

  /** Deduct. Returns false and spends nothing if the player can't afford it. */
  spend(c, reason = 'spent') {
    const k = cost(c);
    if (!this.canAfford(k)) return false;
    if (k.coins) addCoins(-k.coins);
    if (k.hearth) addHearth(-k.hearth);
    this._log(-k.coins, -k.hearth, reason);
    return true;
  },

  /** Credit. `gain` is cost-shaped: {coins, hearth}. */
  earn(gain, reason = 'earned') {
    const k = cost(gain);
    if (k.coins) addCoins(k.coins);
    if (k.hearth) addHearth(k.hearth);
    if (k.coins || k.hearth) this._log(k.coins, k.hearth, reason);
    return k;
  },

  _log(coins, hearth, reason) {
    const l = bank();
    l.unshift({ coins, hearth, reason: String(reason).slice(0, 40), day: S.clock?.day ?? 0 });
    if (l.length > LEDGER_MAX) l.length = LEDGER_MAX;
    Bus.emit(EV.TOAST, { ledger: true });
  },

  ledger() { return bank(); },
  recent(n = 6) { return bank().slice(0, n); },

  /** Lifetime totals, for the village board's little "where it came from" line. */
  totals() {
    let earnedC = 0, earnedH = 0, spentC = 0, spentH = 0;
    for (const e of bank()) {
      if (e.coins > 0) earnedC += e.coins; else spentC -= e.coins;
      if (e.hearth > 0) earnedH += e.hearth; else spentH -= e.hearth;
    }
    return { earnedC, earnedH, spentC, spentH };
  },

  /** "120c  8h" — compact, used inside cards. Omits zero parts. */
  format(c) {
    const k = cost(c);
    const bits = [];
    if (k.coins) bits.push(`${k.coins}c`);
    if (k.hearth) bits.push(`${k.hearth}h`);
    return bits.length ? bits.join('  ') : 'free';
  },

  /** "120 coins and 8 hearth" — for dialogue. */
  formatLong(c) {
    const k = cost(c);
    const bits = [];
    if (k.coins) bits.push(`${k.coins} coins`);
    if (k.hearth) bits.push(`${k.hearth} hearth`);
    return bits.length ? bits.join(' and ') : 'nothing at all';
  },
};

export default Economy;
