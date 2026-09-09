// Family missions: the real-world half of the game.
//
// TONE IS THE FEATURE. These are invitations, not chores. Rules we hold to:
//   * Opt-in. Nothing is assigned. You choose what to track, and nothing is ever
//     "overdue". There are no timers, no red text, no reminders.
//   * Trusted. Completion is self-reported. There is no verification and never any
//     doubt — one gentle "Did you do it together?" and then a warm celebration.
//   * A missed day never costs anything. The streak simply doesn't grow; it rests.
//     No language anywhere in this file scolds, nags, or implies failure.
//   * Every reward is visible in the village, so real kindness turns into cobbles,
//     lamps, and neighbours. A few missions unlock specific buildings outright.
//
// In-game missions (walking, bonding, talking) live in the same system but are
// tagged kind:'game', progress themselves from Hooks.missions.note(), and are shown
// on their own tab so the two kinds are never confused.

import { S, setFlag, save } from '../state.js';
import { Bus, EV } from '../core/events.js';
import { UIx, Hooks } from '../core/bridge.js';
import { Audio } from '../core/audio.js';
import { makeRng } from '../core/rng.js';
import { Economy } from '../village/economy.js';

export const CATS = {
  kitchen: { name: 'Together at the table', color: '#f0836a', icon: '●' },
  tidy: { name: 'Making room', color: '#7fb6d9', icon: '●' },
  outdoors: { name: 'Outside', color: '#8cc055', icon: '●' },
  kindness: { name: 'Kindness', color: '#f593b9', icon: '♥' },
  learning: { name: 'Finding out', color: '#a98ada', icon: '●' },
  creativity: { name: 'Making things', color: '#f5c877', icon: '★' },
  rest: { name: 'Rest', color: '#bfeaf2', icon: '●' },
  helping: { name: 'Lending a hand', color: '#dda23f', icon: '●' },
  game: { name: 'In the valley', color: '#ffe066', icon: '⬥' },
};

// r() = a real-world family mission. g() = something you do in the game.
const r = (id, cat, title, desc, opts = {}) => ({
  id, cat, kind: 'real', title, desc,
  need: opts.need || 1,
  repeat: opts.repeat || 'once',
  reward: { coins: opts.coins || 0, hearth: opts.hearth ?? 3 },
  unlocks: opts.unlocks || null,
  visible: opts.visible || null,
  stepLabel: opts.stepLabel || null,
});
const g = (id, title, desc, metric, need, opts = {}) => ({
  id, cat: 'game', kind: 'game', title, desc, metric, need,
  repeat: 'once', reward: { coins: opts.coins || 0, hearth: opts.hearth ?? 2 },
  unlocks: opts.unlocks || null, visible: opts.visible || null,
});

export const CATALOGUE = [
  // --- together at the table --------------------------------------------------
  r('cook-together', 'kitchen', 'Cook Dinner Together',
    'Make one meal as a family. Everyone gets a job, even the small ones.',
    { hearth: 8, coins: 20, unlocks: 'kitchen', visible: 'A warm light appears in the Kitchen window.' }),
  r('set-the-table', 'kitchen', 'Set the Table',
    'Plates, cups, and something in the middle that did not need to be there.',
    { hearth: 3, repeat: 'daily' }),
  r('bake-something', 'kitchen', 'Bake Something',
    'Bread, biscuits, or a very lopsided cake. Lopsided is traditional.',
    { hearth: 6, coins: 15 }),
  r('try-new-veg', 'kitchen', 'Try One New Vegetable',
    'One bite is a whole adventure. You are allowed to make a face.',
    { hearth: 4 }),
  r('dishes-together', 'kitchen', 'Wash Up Together',
    'One washes, one dries, somebody sings badly. This is the correct method.',
    { hearth: 3, repeat: 'daily' }),
  r('eat-no-screens', 'kitchen', 'One Meal, No Screens',
    'Just the food and the people. See what everybody says.',
    { hearth: 4, repeat: 'daily' }),

  // --- making room ------------------------------------------------------------
  r('tidy-ten', 'tidy', 'Ten Minutes of Tidying, Together',
    'Set a timer, put on a song, and stop the moment it ends. Really stop.',
    { hearth: 3, repeat: 'daily' }),
  r('make-bed', 'tidy', 'Make Your Bed',
    'It takes a minute and the whole room feels calmer.',
    { hearth: 2, repeat: 'daily' }),
  r('three-homes', 'tidy', 'Find Homes for Three Things',
    'Three things that live somewhere else. Escort them there.',
    { hearth: 5, need: 3, stepLabel: 'things put away' }),
  r('laundry-help', 'tidy', 'Help With the Laundry',
    'Matching socks is a two-person sport with no known champion.',
    { hearth: 4, repeat: 'weekly', visible: 'Laundry lines appear between the cottages.' }),
  r('give-away', 'tidy', 'Choose One Thing to Give Away',
    'Something you have finished with, that somebody else is just starting.',
    { hearth: 6, coins: 10 }),

  // --- outside ----------------------------------------------------------------
  r('walk-birds', 'outdoors', 'Take a Walk, Name Three Birds',
    'Or three trees, or three clouds. Guessing counts. Guessing loudly counts more.',
    { hearth: 6, need: 3, stepLabel: 'birds named' }),
  r('water-plants', 'outdoors', 'Water the Plants',
    'They will not say thank you. They will grow, which is their way of saying it.',
    { hearth: 2, repeat: 'daily', unlocks: 'garden', visible: 'The Garden Plot starts sprouting.' }),
  r('outside-half-hour', 'outdoors', 'Half an Hour Outside',
    'Rain counts. Puddles especially count.',
    { hearth: 4, repeat: 'daily' }),
  r('plant-something', 'outdoors', 'Plant Something',
    'A seed, a cutting, or a hopeful bean in a cup on the windowsill.',
    { hearth: 7, coins: 15, visible: 'Planters bloom around the plaza.' }),
  r('five-treasures', 'outdoors', 'Collect Five Small Treasures',
    'Leaves, stones, one shell, and a genuinely excellent stick.',
    { hearth: 5, need: 5, stepLabel: 'treasures found' }),
  r('watch-the-sky', 'outdoors', 'Watch the Sky Get Dark',
    'Sit outside until the first star. Say nothing much.',
    { hearth: 5 }),

  // --- kindness ---------------------------------------------------------------
  r('thank-you-note', 'kindness', 'Write a Thank-You Note',
    'Short is fine. Drawings are better. Post it if you can.',
    { hearth: 6, coins: 10 }),
  r('call-someone', 'kindness', 'Call Someone Who\'d Like to Hear From You',
    'A grandparent, an old friend, the neighbour with the loud dog.',
    { hearth: 5, repeat: 'weekly' }),
  r('secret-kindness', 'kindness', 'Do One Kind Thing Nobody Asked For',
    'Extra credit if nobody notices it was you.',
    { hearth: 4, repeat: 'daily' }),
  r('share-something', 'kindness', 'Share Something You Love',
    'A song, a snack, a favourite page. Watch their face.',
    { hearth: 3, repeat: 'daily' }),
  r('say-the-good-thing', 'kindness', 'Tell Someone What You Like About Them',
    'Out loud, to their face. Yes, it is a bit awkward. Do it anyway.',
    { hearth: 5 }),

  // --- finding out ------------------------------------------------------------
  r('read-aloud', 'learning', 'Read a Chapter Out Loud',
    'Take turns. Do the voices. Argue about who does the villain.',
    { hearth: 7, coins: 15, unlocks: 'library', visible: 'The Story Nook lights its reading lamp.' }),
  r('learn-a-word', 'learning', 'Learn a Word in Another Language',
    'Then use it all day, slightly incorrectly.',
    { hearth: 3, repeat: 'daily' }),
  r('ask-three', 'learning', 'Ask a Grown-Up Three Questions',
    'About when they were small. Keep going if the answers are good.',
    { hearth: 5, need: 3, stepLabel: 'questions asked' }),
  r('work-together', 'learning', 'Sit Together While You Work',
    'Same table, different jobs, one pot of something warm.',
    { hearth: 3, repeat: 'daily' }),
  r('look-it-up', 'learning', 'Look Up Something You Wondered About',
    'The thing you both said "huh" about earlier. Go and find out.',
    { hearth: 4 }),

  // --- making things ----------------------------------------------------------
  r('make-something', 'creativity', 'Make Something With Your Hands',
    'Paper, clay, cardboard, tape. Mostly tape.',
    { hearth: 7, coins: 15, unlocks: 'workshop', visible: 'The Workshop opens its shutters.' }),
  r('draw-family', 'creativity', 'Draw Someone in Your Family',
    'Accuracy is not required and rarely helps.',
    { hearth: 5 }),
  r('build-a-fort', 'creativity', 'Build a Blanket Fort',
    'Structural integrity optional. Snacks inside mandatory.',
    { hearth: 6 }),
  r('sing-together', 'creativity', 'Sing One Song Together',
    'Loudly, and slightly out of tune, which is the right tune.',
    { hearth: 3, repeat: 'daily' }),
  r('invent-a-story', 'creativity', 'Invent a Story, One Line Each',
    'It will go badly wrong. That is the good part.',
    { hearth: 4, repeat: 'weekly' }),

  // --- rest -------------------------------------------------------------------
  r('rest-together', 'rest', 'Twenty Quiet Minutes Together',
    'No screens. Just a room, and the people in it.',
    { hearth: 8, unlocks: 'bathhouse', visible: 'Steam rises from the Spring House.' }),
  r('bedtime-story', 'rest', 'A Story Before Lights Out',
    'Made up or read from a book. Both are entirely real.',
    { hearth: 3, repeat: 'daily' }),
  r('early-night', 'rest', 'An Early Night',
    'Everyone. Yes, the grown-ups too. Especially the grown-ups.',
    { hearth: 5, repeat: 'weekly' }),
  r('stretch-together', 'rest', 'Stretch Together for Five Minutes',
    'Reach up. Fold down. Wobble. Laugh at the wobbling.',
    { hearth: 3, repeat: 'daily' }),

  // --- lending a hand --------------------------------------------------------
  r('help-a-grown-up', 'helping', 'Help a Grown-Up With Their Job',
    'Carry, hold, fetch, fold. Ask what would actually help.',
    { hearth: 4, repeat: 'daily' }),
  r('shopping-list', 'helping', 'Write the Shopping List Together',
    'You are permitted to add exactly one silly item.',
    { hearth: 4, repeat: 'weekly' }),
  r('look-after-animal', 'helping', 'Look After an Animal',
    'Feed, brush, walk, or simply sit near them for a while.',
    { hearth: 3, repeat: 'daily' }),
  r('fix-something', 'helping', 'Fix One Small Broken Thing',
    'Glue, tape, a screwdriver, and a reasonable amount of patience.',
    { hearth: 6, coins: 20 }),

  // --- in the valley (in-game) -----------------------------------------------
  g('walk-the-paths', 'Walk the Village Paths', 'Take five hundred steps around the valley.',
    'steps', 500, { coins: 40, hearth: 1 }),
  g('first-friend', 'Make Your First Friend', 'Bond with a guardian out in the tall grass.',
    'bonded', 1, { hearth: 4, coins: 20 }),
  g('three-friends', 'Three Friends', 'Bond with three guardians.', 'bonded', 3, { hearth: 6, coins: 40 }),
  g('meet-neighbours', 'Meet the Neighbours', 'Talk to five people in the village.',
    'talked', 5, { hearth: 4, coins: 20 }),
  g('friendly-matches', 'Three Friendly Matches', 'Win three battles.', 'wins', 3, { coins: 60, hearth: 1 }),
  g('raise-two', 'Raise Two Buildings', 'Build two new things in the village.', 'built', 2, { hearth: 5, coins: 30 }),
  g('first-upgrade', 'First Upgrade', 'Take any building up a level.', 'upgraded', 1, { hearth: 4, coins: 20 }),
];

const BY_ID = new Map(CATALOGUE.map(m => [m.id, m]));
export const byId = id => BY_ID.get(id) || null;

const DONE_MAX = 400;

// --- state helpers -----------------------------------------------------------
export function ensureState() {
  S.missions ||= {};
  const m = S.missions;
  if (!Array.isArray(m.active)) m.active = [];
  if (!Array.isArray(m.done)) m.done = [];
  if (!Array.isArray(m.dailyPool)) m.dailyPool = [];
  if (!m.completed || typeof m.completed !== 'object' || Array.isArray(m.completed)) m.completed = {};
  if (typeof m.streak !== 'number') m.streak = 0;
  if (typeof m.bestStreak !== 'number') m.bestStreak = m.streak || 0;
  if (m.lastDay === undefined) m.lastDay = null;
  m.repeats ||= {};
  m.counters ||= {};
  return m;
}

const today = () => S.clock?.day ?? 1;

export const isTracked = id => ensureState().active.some(a => a.id === id);
export const entryOf = id => ensureState().active.find(a => a.id === id) || null;
export const timesDone = id => ensureState().done.filter(d => d.id === id).length;

/** Is this mission finished *for now*? Dailies come back tomorrow, kindly. */
export function isDone(id) {
  const m = byId(id);
  const st = ensureState();
  if (!m) return false;
  if (m.repeat === 'once') return !!st.completed[id] || st.done.some(d => d.id === id);
  const last = st.repeats[id];
  if (last === undefined) return false;
  if (m.repeat === 'daily') return last >= today();
  if (m.repeat === 'weekly') return today() - last < 7;
  return false;
}

/** Progress on a mission: game missions read live counters, real ones read the entry. */
export function progressOf(id) {
  const m = byId(id);
  if (!m) return 0;
  if (m.kind === 'game') return Math.min(m.need, ensureState().counters[m.metric] || 0);
  const e = entryOf(id);
  if (isDone(id)) return m.need;
  return e ? Math.min(m.need, e.progress || 0) : 0;
}

export const needOf = id => byId(id)?.need || 1;

// --- the daily invitation ----------------------------------------------------
/**
 * A handful of things offered today. Deterministic per in-game day, so it feels
 * like a morning list rather than a slot machine. Nothing here expires: if you
 * don't feel like today's, every other mission is still on the ALL tab.
 */
export function refreshDaily(force = false) {
  const st = ensureState();
  const d = today();
  if (!force && st.poolDay === d && st.dailyPool.length) return st.dailyPool;
  const bell = (S.village?.buildings || []).some(b => b.type === 'belltower');
  const size = bell ? 6 : 5;
  const rng = makeRng((S.seed | 0) + d * 7919);

  const dailies = CATALOGUE.filter(m => m.kind === 'real' && m.repeat === 'daily');
  const weeklies = CATALOGUE.filter(m => m.kind === 'real' && m.repeat === 'weekly' && !isDone(m.id));
  const oneOffs = CATALOGUE.filter(m => m.kind === 'real' && m.repeat === 'once' && !isDone(m.id));

  const pool = [];
  const take = (arr, n) => {
    const shuffled = rng.shuffle([...arr]);
    for (const m of shuffled) {
      if (pool.length >= size) break;
      if (n-- <= 0) break;
      if (!pool.includes(m.id)) pool.push(m.id);
    }
  };
  take(dailies, 3);
  take(oneOffs, 2);
  take(weeklies, 1);
  take(dailies, size);           // top up if a category ran dry

  st.dailyPool = pool.slice(0, size);
  st.poolDay = d;
  return st.dailyPool;
}

export const dailyPool = () => refreshDaily();

// --- listing ----------------------------------------------------------------
/**
 * tab: 'today' | 'all' | 'game' | 'done'
 * Ordering puts tracked-and-unfinished first, because that is what you came to do.
 */
export function list(tab = 'today') {
  ensureState();
  let ids;
  if (tab === 'today') ids = refreshDaily().slice();
  else if (tab === 'game') ids = CATALOGUE.filter(m => m.kind === 'game').map(m => m.id);
  else if (tab === 'done') ids = [...new Set([
    ...Object.keys(ensureState().completed),
    ...ensureState().done.map(d => d.id),
  ])];
  else ids = CATALOGUE.filter(m => m.kind === 'real').map(m => m.id);

  // Anything you've chosen to track shows up on TODAY too, always.
  if (tab === 'today') {
    for (const a of ensureState().active) {
      const m = byId(a.id);
      if (m && m.kind === 'real' && !ids.includes(a.id)) ids.unshift(a.id);
    }
  }
  const rows = ids.map(id => rowFor(id)).filter(Boolean);
  const rank = row => (row.done ? 2 : row.tracked ? 0 : 1);
  rows.sort((a, b) => rank(a) - rank(b));
  return rows;
}

export function rowFor(id) {
  const m = byId(id);
  if (!m) return null;
  const prog = progressOf(id);
  return {
    id, m,
    cat: CATS[m.cat] || CATS.game,
    tracked: isTracked(id),
    done: isDone(id),
    progress: prog,
    need: m.need,
    frac: m.need ? prog / m.need : 0,
    reward: m.reward,
    times: timesDone(id),
  };
}

export const rewardText = m => {
  const bits = [];
  if (m.reward.hearth) bits.push(`${m.reward.hearth} hearth`);
  if (m.reward.coins) bits.push(`${m.reward.coins} coins`);
  return bits.join(' + ') || 'a warm feeling';
};

/** The label of the one button on the card, so the UI never has to guess. */
export function actionLabel(id) {
  const row = rowFor(id);
  if (!row) return '';
  if (row.done) return row.m.repeat === 'daily' ? 'Done today  ★' : 'Completed  ★';
  if (row.m.kind === 'game') return `In progress  ${row.progress}/${row.need}`;
  if (!row.tracked) return 'Track Mission';
  return row.need > 1 ? `Mark a Step  ${row.progress}/${row.need}` : 'Mark Done';
}

// --- tracking ---------------------------------------------------------------
export function track(id) {
  const m = byId(id);
  const st = ensureState();
  if (!m || m.kind === 'game' || isDone(id) || isTracked(id)) return false;
  st.active.push({ id, progress: 0, need: m.need, acceptedAt: today() });
  Bus.emit(EV.MISSION_TRACKED, { id, mission: m });
  try { Audio.sfx('confirm'); } catch {}
  try { UIx.toast(`Tracking: ${m.title}`, { ms: 2000 }); } catch {}
  save();
  return true;
}

export function untrack(id) {
  const st = ensureState();
  const i = st.active.findIndex(a => a.id === id);
  if (i < 0) return false;
  st.active.splice(i, 1);
  try { Audio.sfx('cancel'); } catch {}
  save();
  return true;
}

/** One step of a multi-step mission. Completes it when the last step lands. */
export function bump(id, n = 1) {
  const m = byId(id);
  if (!m || isDone(id)) return false;
  if (!isTracked(id)) track(id);
  const e = entryOf(id);
  if (!e) return false;
  e.progress = Math.min(m.need, (e.progress || 0) + n);
  if (e.progress >= m.need) return complete(id);
  try { Audio.sfx('coin'); } catch {}
  try { UIx.toast(`${m.title}  ${e.progress}/${m.need}`, { ms: 1800 }); } catch {}
  save();
  return true;
}

/**
 * Mark a mission done. Trusted, celebrated, never questioned afterwards.
 * `quiet` skips the toast (used when several land at once).
 */
export function complete(id, { quiet = false } = {}) {
  const m = byId(id);
  const st = ensureState();
  if (!m || isDone(id)) return false;

  const d = today();
  st.done.push({ id, at: Date.now(), day: d });
  if (st.done.length > DONE_MAX) st.done.splice(0, st.done.length - DONE_MAX);
  if (m.repeat === 'once') st.completed[id] = d;
  st.repeats[id] = d;
  const i = st.active.findIndex(a => a.id === id);
  if (i >= 0) st.active.splice(i, 1);
  S.stats && (S.stats.missionsDone = (S.stats.missionsDone || 0) + 1);

  // The streak counts days you did something together. It never goes down, so a
  // missed day costs exactly nothing — it just rests until you come back.
  if (m.kind === 'real' && st.lastDay !== d) {
    st.streak = (st.streak || 0) + 1;
    st.bestStreak = Math.max(st.bestStreak || 0, st.streak);
    st.lastDay = d;
  }

  Economy.earn(m.reward, `mission: ${m.title}`);

  if (m.unlocks) {
    S.village ||= {};
    S.village.unlocked ||= [];
    if (!S.village.unlocked.includes(m.unlocks)) S.village.unlocked.push(m.unlocks);
    setFlag('unlock.' + m.unlocks, true);
  }
  setFlag('mission.' + id, true);

  try { Audio.sfx(m.kind === 'game' ? 'chime' : 'warm'); } catch {}
  if (!quiet) {
    try { UIx.toast(`${m.title}  +${rewardText(m)}`, { ms: 2600, icon: 'ui.hearth' }); } catch {}
  }
  Bus.emit(EV.MISSION_DONE, { id, mission: m, reward: m.reward, visible: m.visible });
  save();
  return true;
}

/** The warm words shown after a real-world mission is marked done. */
export function celebrationLines(id) {
  const m = byId(id);
  if (!m) return [];
  const out = [`Lovely. ${rewardText(m)} for the village.`];
  if (m.visible) out.push(m.visible);
  if (m.unlocks) out.push(`The village can build a new thing now.`);
  const st = ensureState();
  if (st.streak >= 2) out.push(`That's ${st.streak} days you've done something together.`);
  return out;
}

export const STREAK_NOTE = 'Streaks never go down here. Miss a day and it just rests.';

export function streakInfo() {
  const st = ensureState();
  const gap = st.lastDay === null ? null : today() - st.lastDay;
  return {
    streak: st.streak || 0,
    best: st.bestStreak || 0,
    resting: gap !== null && gap > 1,
    doneToday: gap === 0,
    note: STREAK_NOTE,
  };
}

// --- in-game progress hook --------------------------------------------------
const METRIC_ALIAS = {
  step: 'steps', steps: 'steps', walk: 'steps',
  bond: 'bonded', bonded: 'bonded', caught: 'bonded',
  talk: 'talked', talked: 'talked', npc: 'talked',
  win: 'wins', wins: 'wins', battleWon: 'wins',
  built: 'built', place: 'built', placed: 'built',
  upgrade: 'upgraded', upgraded: 'upgraded',
};

/**
 * Hooks.missions.note(kind, payload) — any gameplay event a mission might count.
 * Game missions complete themselves here; real-world ones are never touched by
 * this path, so nothing the player does in the game can mark a family mission done.
 */
export function note(kind, payload = {}) {
  const metric = METRIC_ALIAS[kind];
  if (!metric) return false;
  const st = ensureState();
  const n = Math.max(1, payload.n || payload.count || 1);
  st.counters[metric] = (st.counters[metric] || 0) + n;
  let any = false;
  for (const m of CATALOGUE) {
    if (m.kind !== 'game' || m.metric !== metric) continue;
    if (isDone(m.id)) continue;
    if ((st.counters[metric] || 0) >= m.need) { complete(m.id); any = true; }
  }
  return any;
}

export function stats() {
  const st = ensureState();
  const real = st.done.filter(d => byId(d.id)?.kind === 'real').length;
  return {
    total: st.done.length,
    real,
    game: st.done.length - real,
    tracked: st.active.length,
    todayCount: refreshDaily().filter(id => !isDone(id)).length,
    ...streakInfo(),
  };
}

export const Missions = {
  CATALOGUE, CATS, byId, list, rowFor, actionLabel, rewardText, celebrationLines,
  ensureState, isDone, isTracked, progressOf, needOf, timesDone,
  track, untrack, bump, complete, note, refreshDaily, dailyPool, streakInfo, stats,
  count: CATALOGUE.length,
  realCount: CATALOGUE.filter(m => m.kind === 'real').length,
};

export function register() {
  ensureState();
  refreshDaily();
  Bus.on(EV.DAY_CHANGED, () => refreshDaily(true));
  Hooks.install('missions', {
    note,
    activeCount() { return ensureState().active.length; },
    todayCount() { return refreshDaily().filter(id => !isDone(id)).length; },
    list(tab) { return list(tab); },
    complete, track, streak() { return streakInfo(); },
    catalogue: CATALOGUE,
  });
  if (typeof window !== 'undefined') window.__missions = Missions;
  return Missions;
}

export default Missions;
