// The mission board.
//
// Tone is the whole job here: these are real things a family does together, offered
// warmly and trusted when the player says they're done. No timers, no scolding, no
// red overdue state. A missed day pauses the streak; it never punishes.

import { R, LAYER } from '../core/renderer.js';
import { Input } from '../core/input.js';
import { Scenes } from '../core/scene.js';
import { Atlas } from '../art/atlas.js';
import { Audio } from '../core/audio.js';
import { UIx } from '../core/bridge.js';
import { Font } from '../core/font.js';
import { S } from '../state.js';
import { P, mix } from '../art/palette.js';
import { clamp } from '../core/util.js';
import * as M from './missions.js';

const TABS = [
  { id: 'today', label: 'Today' },
  { id: 'real', label: 'All' },
  { id: 'game', label: 'In Emberhollow' },
  { id: 'done', label: 'Done' },
];

const ROW_H = 26;
const LIST_X = 8, LIST_Y = 34, LIST_W = 156, LIST_H = 132;

const fit = (text, width) => {
  let out = String(text);
  if (Font.measure(out) <= width) return out;
  while (out && Font.measure(out + '…') > width) out = out.slice(0, -1);
  return out + '…';
};

function missionScene(params) {
  let tab = Math.max(0, TABS.findIndex(t => t.id === (params?.tab || 'today')));
  let rows = [];
  let sel = 0, scroll = 0, t = 0;
  let busy = false;
  const pop = { i: -1, t: 0 };     // celebration flash on the row just completed

  function refresh(keepId) {
    rows = M.list(TABS[tab].id);
    if (keepId) {
      const index = rows.findIndex(row => row.id === keepId);
      if (index >= 0) sel = index;
    }
    sel = clamp(sel, 0, Math.max(0, rows.length - 1));
    const visible = Math.floor(LIST_H / ROW_H);
    if (sel < scroll) scroll = sel;
    if (sel >= scroll + visible) scroll = sel - visible + 1;
  }

  async function activate() {
    const row = rows[sel];
    if (!row) return;
    busy = true;
    try {
      if (row.m.kind === 'game') {
        await UIx.say(`${row.m.title} — ${row.m.desc}`, { speaker: 'Emberhollow' });
        return;
      }
      if (row.done) {
        await UIx.say(row.m.repeat === 'daily' ? 'Already done today. You can do this one again tomorrow.' : 'Already done. That one counted.', { speaker: 'Hearth Board' });
        return;
      }
      if (!row.tracked) {
        if (M.track(row.id)) {
          refresh(row.id);
          await UIx.say(row.m.desc, { speaker: row.m.title });
        }
        return;
      }
      // Tracked already: this is the "we did it" moment.
      const question = row.need > 1 ? `Add one step? ${row.progress} of ${row.need} done so far.` : 'Did you do it together?';
      const yes = await UIx.ask(question, ['Yes, we did', 'Not yet'],
        { speaker: row.m.title });
      if (yes !== 0) { Audio.sfx('cancel'); return; }
      const completed = row.need > 1 ? row.progress + 1 >= row.need : true;
      if (row.need > 1) M.bump(row.id);
      else M.complete(row.id);
      Audio.sfx('chime');
      refresh(row.id);
      pop.i = sel; pop.t = 40;
      if (completed) await UIx.say(warmClose(row), { speaker: 'Gran Willow' });
    } finally { busy = false; }
  }

  function update() {
    t++;
    if (pop.t > 0) pop.t--;
    if (busy || UIx.busy) return;

    if (Input.pressed('b')) { Audio.sfx('cancel'); Scenes.pop(); return; }
    if (Input.nav('left')) { tab = (tab + TABS.length - 1) % TABS.length; sel = 0; scroll = 0; Audio.sfx('cursor'); refresh(); }
    if (Input.nav('right')) { tab = (tab + 1) % TABS.length; sel = 0; scroll = 0; Audio.sfx('cursor'); refresh(); }
    if (Input.nav('down') && rows.length) { sel = (sel + 1) % rows.length; Audio.sfx('cursor'); refresh(); }
    if (Input.nav('up') && rows.length) { sel = (sel + rows.length - 1) % rows.length; Audio.sfx('cursor'); refresh(); }
    if (Input.pressed('a')) { Input.consume('a'); activate(); }
    if (Input.pressed('select') && rows[sel]?.tracked) {
      const row = rows[sel];
      M.untrack(row.id); refresh(row.id);
    }
  }

  function render() {
    R.layer(LAYER.GROUND, () => {
      // A corkboard, not a spreadsheet.
      R.rect(0, 0, R.W, R.H, mix(P.wood3, P.ink, 0.35));
      for (let y = 0; y < R.H; y += 2) R.rect(0, y, R.W, 1, y % 4 ? mix(P.wood2, P.ink, 0.5) : mix(P.wood3, P.ink, 0.42));
      R.rect(0, 0, R.W, 24, mix(P.wood4, P.ink, 0.3));
      R.rect(0, 23, R.W, 1, P.gold3);
    });

    R.layer(LAYER.UI, () => {
      drawHeader();
      drawList();
      drawDetail();
      drawFooter();
    });
  }

  function drawHeader() {
    R.text('FAMILY MISSIONS', 8, 6, { color: P.gold1 });

    // Right-hand cluster is laid out from the right edge inwards so the streak
    // label and the hearth counter can never collide.
    const streak = S.missions?.streak || 0;
    const streakText = streak > 0 ? `${streak} day streak` : 'start a streak';
    R.text(streakText, R.W - 8, 6, { color: streak > 0 ? P.ember0 : P.ui2, align: 'right' });
    const hx = R.W - 12 - Font.measure(streakText) - Font.measure(String(S.hearth)) - 12;
    const hi = Atlas.tryGet('ui.hearth');
    if (hi) R.blit(hi, hx, 5);
    R.text(String(S.hearth), hx + 12, 6, { color: P.gold0 });

    // Tabs are measured, not evenly spaced — 'In Emberhollow' is far wider than 'All'.
    let tx = 8;
    TABS.forEach((tb, i) => {
      const w = Font.measure(tb.label);
      const on = i === tab;
      if (on) R.rect(tx - 3, 24, w + 6, 10, P.gold3);
      R.text(tb.label, tx, 25, { color: on ? P.gold0 : P.ui2 });
      tx += w + 12;
    });
  }

  function drawList() {
    UIx.panel(LIST_X - 2, LIST_Y - 2, LIST_W + 4, LIST_H + 4, 'paper');
    if (!rows.length) {
      R.text(TABS[tab].id === 'done' ? 'Your story starts here.' : 'Nothing here today.', LIST_X + 8, LIST_Y + 16, { color: P.ink3, shadow: false });
      R.text('Choose a mission in All.', LIST_X + 8, LIST_Y + 28, { color: P.ink3, shadow: false });
      return;
    }
    const visible = Math.floor(LIST_H / ROW_H);
    for (let i = 0; i < visible; i++) {
      const idx = scroll + i;
      const row = rows[idx];
      if (!row) break;
      drawRow(row, idx, LIST_X + 2, LIST_Y + 2 + i * ROW_H);
    }
    if (scroll > 0) {
      const a = Atlas.tryGet('ui.arrow.up');
      if (a) R.blit(a, LIST_X + LIST_W - 12, LIST_Y - 1);
    }
    if (scroll + visible < rows.length) {
      const a = Atlas.tryGet('ui.arrow.down');
      if (a) R.blit(a, LIST_X + LIST_W - 12, LIST_Y + LIST_H - 6);
    }
  }

  function drawRow(row, idx, x, y) {
    const on = idx === sel;
    const celebrating = pop.i === idx && pop.t > 0;
    const bg = row.done ? mix(P.paper2, '#7ed957', 0.18)
      : row.tracked ? mix(P.paper1, P.gold1, 0.35) : P.paper1;
    R.rect(x, y, LIST_W - 4, ROW_H - 3, celebrating && !S.settings.reducedMotion && pop.t % 8 < 4 ? P.gold0 : bg);
    R.rect(x, y, 2, ROW_H - 3, row.cat?.color || P.gold2);        // category stripe
    if (on) {
      R.stroke(x - 1, y - 1, LIST_W - 2, ROW_H - 1, P.gold3);
      const c = Atlas.tryGet('ui.cursor');
      if (c) R.blit(c, x - 8, y + 6 + Math.sin(t / 9) * 0.6);
    }

    const title = row.m.title;
    R.text(fit(title, LIST_W - (row.done ? 28 : 18)), x + 7, y + 3,
      { color: row.done ? P.ink3 : P.ink2, shadow: false });

    if (row.done) {
      const chk = Atlas.tryGet('ui.badge.check');
      if (chk) R.blit(chk, x + LIST_W - 18, y + 3);
    } else if (row.need > 1) {
      const bw = 32;
      R.rect(x + 7, y + 15, bw, 4, P.ui1);
      R.rect(x + 7, y + 15, Math.round(bw * clamp(row.frac, 0, 1)), 4, P.gold2);
      R.text(`${row.progress}/${row.need}`, x + 43, y + 13, { color: P.ink3, shadow: false });
    } else {
      R.text(row.tracked ? 'Tracking' : 'Available', x + 7, y + 13,
        { color: row.tracked ? P.gold3 : P.ink3, shadow: false });
    }

    const rw = `${row.m.reward.hearth || 0} H${row.m.reward.coins ? ` + ${row.m.reward.coins} C` : ''}`;
    if (rw) R.text(rw, x + LIST_W - 8, y + 13, { color: P.ink3, shadow: false, align: 'right' });
  }

  function drawDetail() {
    const x = LIST_X + LIST_W + 6, w = R.W - x - 8;
    UIx.panel(x, LIST_Y - 2, w, LIST_H + 4, 'paper');
    const row = rows[sel];
    if (!row) return;

    const lines = Font.wrap(row.m.desc, w - 16);
    R.text(fit(row.cat?.name || 'Mission', w - 16), x + 8, LIST_Y + 4, { color: P.ink3, shadow: false });
    let y = LIST_Y + 18;
    for (const l of Font.wrap(row.m.title, w - 16).slice(0, 3)) { R.text(l, x + 8, y, { color: P.ink, shadow: false }); y += 10; }
    y += 3;
    const rewardY = LIST_Y + LIST_H - 38;
    const lineCount = Math.max(0, Math.floor((rewardY - 7 - y) / 10));
    const visible = lines.slice(0, lineCount);
    if (visible.length && lines.length > lineCount) visible[visible.length - 1] = fit(visible[visible.length - 1] + '…', w - 16);
    for (const l of visible) { R.text(l, x + 8, y, { color: P.ink3, shadow: false }); y += 10; }

    y = rewardY;
    R.rect(x + 6, y - 4, w - 12, 1, P.ui1);
    R.text('REWARD', x + 8, y, { color: P.ink3, shadow: false });
    R.text(fit(M.rewardText(row.m) || '—', w - 16), x + 8, y + 10, { color: P.gold3, shadow: false });
    // The visible change is the point of the whole loop — show it, don't bury it.
    if (row.m.visible) {
      R.text(fit(row.m.visible, w - 16), x + 8, y + 22, { color: P.leaf3, shadow: false });
    } else if (row.times > 0) {
      R.text(`Done ${row.times}x before`, x + 8, y + 22, { color: P.ink3, shadow: false });
    }
  }

  function drawFooter() {
    R.rect(0, R.H - 12, R.W, 12, mix(P.wood4, P.ink, 0.3));
    const row = rows[sel];
    const action = !row ? 'select' : row.done ? 'view' : row.m.kind === 'game' ? 'details' : row.tracked ? 'mark done' : 'track';
    const extra = row?.tracked && Input.device !== 'touch' ? `   ${Input.label('select')} untrack` : '';
    R.text(fit(`◀ ▶ tabs   ${Input.label('a')} ${action}   ${Input.label('b')} back${extra}`, R.W - 12), 6, R.H - 10, { color: P.ui1 });
  }

  return {
    enter() { M.ensureState(); M.refreshDaily(); refresh(); },
    update, render,
  };
}

// Gran's closing line, varied so completing missions never feels like a form submit.
function warmClose(row) {
  const lines = [
    'That is the kind of thing this village is made of.',
    'The Hearthstone felt that one. So did I.',
    'Good. Now sit down, both of you, and have something warm.',
    'Small things, done together. That is the whole trick.',
    'I will add it to the ledger. The good ledger.',
  ];
  const i = (row.id.length + (S.missions?.done?.length || 0)) % lines.length;
  return lines[i];
}

export function register() {
  Scenes.register('missions', p => missionScene(p));
}
