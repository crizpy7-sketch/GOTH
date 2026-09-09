// Party, summary, and records.
//
// Also implements Hooks.party, which is how the battle screen asks the player to
// pick a Guardian — so this has to be fast to read and fast to answer.

import { R, LAYER } from '../core/renderer.js';
import { Input } from '../core/input.js';
import { Scenes } from '../core/scene.js';
import { Atlas } from '../art/atlas.js';
import { Audio } from '../core/audio.js';
import { UIx, Hooks } from '../core/bridge.js';
import { Font } from '../core/font.js';
import { S, save } from '../state.js';
import { P, TYPE_COLOR, mix, shade } from '../art/palette.js';
import { clamp } from '../core/util.js';
import { GUARDIANS } from '../art/names.js';
import { getSpecies, displayName, speciesName, makeGuardian } from '../battle/species.js';
import { getMove } from '../battle/moves.js';

const hpFrac = g => g && g.maxhp ? clamp(g.hp / g.maxhp, 0, 1) : 0;
const hpColor = f => f > 0.5 ? P.hpGood : f > 0.22 ? P.hpWarn : P.hpBad;

function fitText(value, width) {
  let s = String(value);
  if (Font.measure(s) <= width) return s;
  while (s.length && Font.measure(`${s}..`) > width) s = s.slice(0, -1);
  return `${s}..`;
}

function drawRoom() {
  for (let y = 0; y < R.H; y += 2) R.rect(0, y, R.W, 2, mix('#132f2d', '#30544a', y / R.H));
  R.glow(60, 56, 125, '#d2b471', 0.09);
  for (let i = 0; i < 18; i++) R.rect((i * 71) % R.W, (i * 43) % R.H, 1, 1, '#56755d');
}

function typeChip(x, y, ty) {
  if (!ty) return;
  const b = Atlas.tryGet(`ui.type.${ty}`);
  if (b) R.blit(b, x, y);
  else R.rect(x, y, 22, 9, TYPE_COLOR[ty] || P.ui2);
  R.text(ty.slice(0, 3).toUpperCase(), x + 11, y + 1,
    { color: '#fffaf0', shadow: shade(TYPE_COLOR[ty] || P.ui2, -0.55), align: 'center' });
}

// Keep the roster changes atomic: travelling companions must never disappear,
// and a resting Guardian cannot strand the player without their last ready one.
const ready = list => list.filter(g => g.hp > 0).length;
export function leadGuardian(index) {
  const g = S.party[index];
  if (!g) return { ok: false, message: 'Choose a travelling Guardian.' };
  if (g.hp <= 0) return { ok: false, message: 'Rest at home before leading the way.' };
  if (index === 0) return { ok: false, message: `${displayName(g)} already walks beside you.` };
  S.party.splice(index, 1);
  S.party.unshift(g);
  return { ok: true, index: 0, message: `${displayName(g)} now walks beside you.` };
}

export function sendGuardianHome(index) {
  const g = S.party[index];
  if (!g) return { ok: false, message: 'Choose a travelling Guardian.' };
  if (S.party.length === 1) return { ok: false, message: 'Keep a companion with you.' };
  if (g.hp > 0 && ready(S.party) === 1) return { ok: false, message: 'Keep one ready Guardian with you.' };
  if (S.box.length >= 200) return { ok: false, message: 'There is no room at home.' };
  S.party.splice(index, 1);
  S.box.push(g);
  return { ok: true, index: Math.min(index, S.party.length - 1), message: `${displayName(g)} is waiting at home.` };
}

export function inviteGuardian(index, replacement = -1) {
  const g = S.box[index];
  if (!g) return { ok: false, message: 'Choose a Guardian at home.' };
  if (S.party.length < 6) {
    S.box.splice(index, 1); S.party.push(g);
    return { ok: true, index: S.party.length - 1, message: `${displayName(g)} joins your adventure.` };
  }
  const homebound = S.party[replacement];
  if (!homebound) return { ok: false, message: 'Choose who will stay at home.' };
  if (g.hp <= 0 && homebound.hp > 0 && ready(S.party) === 1) {
    return { ok: false, message: 'Keep one ready Guardian with you.' };
  }
  S.party[replacement] = g; S.box[index] = homebound;
  return { ok: true, index: replacement, message: `${displayName(g)} joins your adventure.` };
}

// ------------------------------------------------------------------ party list
function partyScene(params) {
  const picking = !!params?.picking;
  let sel = 0, t = 0, busy = false, notice = '', home = false, tabs = false;
  let screen = null;

  const party = () => picking ? (params?.party || S.party) : home ? S.box : S.party;
  const pageStart = () => Math.floor(sel / 6) * 6;

  function changed(result) {
    notice = result.message;
    Audio.sfx(result.ok ? 'confirm' : 'deny');
    if (!result.ok) return;
    sel = result.index;
    if (!save()) notice = 'Roster changed. Save unavailable on this device.';
  }

  async function act() {
    const list = party();
    const g = list[sel];
    if (!g) return;
    if (picking) {
      if (g.hp <= 0) { notice = 'This Guardian needs rest.'; Audio.sfx('deny'); return; }
      if (sel === params.active) { notice = 'Already beside you. Choose a friend.'; Audio.sfx('deny'); return; }
      Audio.sfx('confirm'); Scenes.pop(sel); return;
    }
    busy = true;
    try {
      if (home) {
        const i = await UIx.ask(displayName(g), ['Join the adventure', 'Summary', 'Back']);
        if (i === 1) await Scenes.pushAsync('summary', { g });
        else if (i === 0) {
          const replacement = S.party.length < 6 ? -1 : await UIx.ask('Who will stay at home?',
            [...S.party.map(g => `${displayName(g)}  Lv ${g.lvl}`), 'Back']);
          if (S.party.length >= 6 && (replacement < 0 || replacement >= S.party.length)) return;
          const result = inviteGuardian(sel, replacement);
          if (result.ok) home = false;
          changed(result);
        }
      } else {
        const i = await UIx.ask(displayName(g), ['Summary', 'Travel beside me', 'Stay at home', 'Back']);
        if (i === 0) await Scenes.pushAsync('summary', { g });
        else if (i === 1) changed(leadGuardian(sel));
        else if (i === 2) changed(sendGuardianHome(sel));
      }
    } finally { busy = false; }
  }

  function point(event) {
    if (busy || UIx.busy || Scenes.top !== scene || (event.button ?? 0) !== 0) return;
    const bounds = screen?.getBoundingClientRect();
    if (!bounds?.width || !bounds.height) return;
    const x = (event.clientX - bounds.left) * R.W / bounds.width;
    const y = (event.clientY - bounds.top) * R.H / bounds.height;
    if (!picking && y >= 20 && y < 32 && x >= 8 && x < 306) {
      const column = Math.floor((x - 8) / 152);
      if ((x - 8) % 152 >= 146) return;
      home = !!column; sel = 0; tabs = false; notice = '';
      Audio.sfx('cursor'); event.preventDefault();
      return;
    }
    if (x < 8 || x >= 306 || y < 38 || y >= 155) return;
    const column = Math.floor((x - 8) / 152), row = Math.floor((y - 38) / 40);
    if ((x - 8) % 152 >= 146 || (y - 38) % 40 >= 37) return;
    const next = pageStart() + row * 2 + column;
    if (!party()[next]) return;
    sel = next; tabs = false; notice = '';
    event.preventDefault(); act();
  }

  const scene = {
    enter() {
      if (picking) sel = Math.max(0, party().findIndex((g, i) => g.hp > 0 && i !== params.active));
      screen = document.getElementById('screen');
      screen?.addEventListener('pointerdown', point);
    },
    exit() { screen?.removeEventListener('pointerdown', point); },
    update() {
      t++;
      if (busy || UIx.busy) return;
      const list = party();
      if (Input.pressed('b')) {
        Audio.sfx('cancel');
        if (!picking && home && !tabs) tabs = true;
        else Scenes.pop(picking ? -1 : undefined);
        return;
      }
      if (!picking && tabs) {
        if (Input.nav('left') || Input.nav('right')) { home = !home; sel = 0; notice = ''; Audio.sfx('cursor'); }
        if (Input.nav('down') || Input.pressed('a')) { tabs = false; Audio.sfx('cursor'); }
        return;
      }
      if (list.length) {
        const direction = ['up', 'down', 'left', 'right'].find(key => Input.nav(key));
        if (direction) {
          if (!picking && direction === 'up' && sel < 2) tabs = true;
          else if (direction === 'left' || direction === 'right') {
            const next = sel % 2 ? sel - 1 : sel + 1;
            if (next < list.length) sel = next;
          } else if (list.length < 3) sel = (sel + 1) % list.length;
          else {
            const rows = Math.ceil(list.length / 2), step = direction === 'up' ? -1 : 1;
            sel = Math.min(list.length - 1, ((Math.floor(sel / 2) + rows + step) % rows) * 2 + sel % 2);
          }
          notice = ''; Audio.sfx('cursor');
        }
      } else if (!picking && Input.nav('up')) {
        tabs = true; Audio.sfx('cursor');
      }
      if (!tabs && Input.pressed('a')) { Input.consume('a'); act(); }
    },
    render() {
      const list = party();
      R.layer(LAYER.GROUND, drawRoom);
      R.layer(LAYER.UI, () => {
        R.text(picking ? 'CHOOSE A GUARDIAN' : 'YOUR GUARDIANS', 8, 6, { color: P.gold1 });
        R.text(`${ready(list)} ready / ${list.length}`, R.W - 10, 6,
          { color: '#d3dec3', align: 'right' });
        if (!picking) {
          [['TRAVELLING', S.party.length], ['AT HOME', S.box.length]].forEach(([label, total], i) => {
            const x = 8 + i * 152, on = home === !!i;
            R.rect(x, 20, 146, 12, on ? '#536944' : '#203d34');
            if (tabs && on) R.stroke(x, 20, 146, 12, P.gold1);
            const pages = i && home && total > 6 ? `  ${Math.floor(sel / 6) + 1}/${Math.ceil(total / 6)}` : '';
            R.text(`${label}  ${total}${i ? pages : '/6'}`, x + 73, 23,
              { align: 'center', color: on ? P.gold0 : P.ui1 });
          });
        } else R.text('Choose a ready friend to join the encounter.', 8, 23, { color: P.ui1 });
        if (!list.length) {
          UIx.panel(30, 60, R.W - 60, 50, 'paper');
          R.text(home ? 'Everyone is travelling with you.' : 'No Guardians yet.', R.W / 2, 72,
            { color: P.ink2, shadow: false, align: 'center' });
          R.text(home ? 'New friends can wait here when your team is full.' : 'Gran Willow has one waiting for you.',
            R.W / 2, 86, { color: P.ink3, shadow: false, align: 'center' });
        }
        list.slice(pageStart(), pageStart() + 6).forEach((g, slot) => {
          const i = pageStart() + slot;
          const col = slot % 2, row = Math.floor(slot / 2);
          const x = 8 + col * 152, y = 38 + row * 40;
          const on = i === sel && !tabs;
          UIx.panel(x, y, 146, 37, 'paper');
          if (on) { R.stroke(x - 1, y - 1, 148, 39, P.gold2); R.rect(x + 3, y + 5, 2, 27, P.gold2); }
          const portrait = Atlas.tryGet(`g.${g.species}.front`);
          if (portrait) R.blit(portrait, x + 3, y - 2 + (on ? Math.sin(t / 22) : 0), { w: 40, h: 40, alpha: g.hp > 0 ? 1 : .45 });
          R.text(fitText(displayName(g), 73), x + 43, y + 5, { color: g.hp > 0 ? P.ink2 : P.ui2, shadow: false });
          R.text(`Lv ${g.lvl}`, x + 140, y + 4, { color: P.ink3, shadow: false, align: 'right' });
          (g.types || []).forEach((ty, k) => typeChip(x + 43 + k * 25, y + 16, ty));
          if (g.hp <= 0 || (picking && i === params.active)) R.text(g.hp <= 0 ? 'REST' : 'ACTIVE', x + 139, y + 17,
            { color: g.hp <= 0 ? '#a45545' : '#567246', shadow: false, align: 'right' });
          else if (!picking && !home && i === 0) R.text('LEAD', x + 139, y + 17,
            { color: '#567246', shadow: false, align: 'right' });
          const f = hpFrac(g);
          R.rect(x + 43, y + 30, 57, 5, '#b7b69a');
          R.rect(x + 43, y + 30, Math.round(57 * f), 5, hpColor(f));
          R.rect(x + 43, y + 30, Math.round(57 * f), 1, mix(hpColor(f), '#ffffff', .45));
          R.text(`${g.hp}/${g.maxhp}`, x + 140, y + 29, { color: P.ink3, shadow: false, align: 'right' });
          if (on) {
            const c = Atlas.tryGet('ui.cursor');
            if (c) R.blit(c, x - 8, y + 16 + Math.sin(t / 8) * 0.6);
          }
        });
        if (!picking) R.text(tabs ? '◀ ▶ choose a roster   ▼ view Guardians'
          : home ? `At home: ${list.length}  ·  Page ${Math.floor(sel / 6) + 1}/${Math.max(1, Math.ceil(list.length / 6))}  ·  ${Input.label('b')} rosters`
          : 'Your lead Guardian walks beside you.  ▲ above first row: rosters', 8, 158,
          { color: P.ui1 });
        R.rect(0, R.H - 12, R.W, 12, 'rgba(16,12,20,0.8)');
        R.text(fitText(notice || (picking ? `${Input.label('a')} choose    ${Input.label('b')} cancel`
          : `${Input.label('a')} ${tabs ? 'view' : 'options'}    ${Input.label('b')} ${home && !tabs ? 'rosters' : 'back'}`), R.W - 12),
          6, R.H - 10, { color: notice ? P.gold1 : P.ui1 });
      });
    },
  };
  return scene;
}

// --------------------------------------------------------------------- summary
function summaryScene(params) {
  const g = params?.g || S.party[0] || makeGuardian('embercub', 5);
  let t = 0;
  const sp = getSpecies(g.species);

  return {
    update() {
      t++;
      if (Input.pressed('b') || Input.pressed('a')) { Audio.sfx('cancel'); Scenes.pop(); }
    },
    render() {
      R.layer(LAYER.GROUND, drawRoom);
      R.layer(LAYER.UI, () => {
        UIx.panel(6, 6, 118, R.H - 24, 'paper');
        const img = Atlas.tryGet(`g.${g.species}.front`);
        if (img) R.blit(img, 25, 4 + Math.sin(t / 30) * 1.5);
        R.text(fitText(displayName(g), 100), 65, 82, { color: P.ink, shadow: false, align: 'center' });
        R.text(`Lv ${g.lvl}`, 65, 94, { color: P.ink3, shadow: false, align: 'center' });
        (g.types || []).forEach((ty, k) => typeChip(42 + k * 25, 106, ty));
        const f = hpFrac(g);
        R.rect(18, 122, 94, 6, P.ui1);
        R.rect(18, 122, Math.round(94 * f), 6, hpColor(f));
        R.text(`${g.hp} / ${g.maxhp}`, 65, 132, { color: P.ink3, shadow: false, align: 'center' });
        if (sp?.dex) {
          let y = 144;
          for (const l of Font.wrap(sp.dex, 106).slice(0, 2)) {
            R.text(l, 12, y, { color: P.ui2, shadow: false }); y += 9;
          }
        }

        UIx.panel(130, 6, R.W - 136, 78, 'paper');
        const stats = [['HP', g.maxhp], ['Attack', g.stats?.atk], ['Defence', g.stats?.def],
                       ['Sp. Atk', g.stats?.spa], ['Sp. Def', g.stats?.spd], ['Speed', g.stats?.spe]];
        stats.forEach(([k, v], i) => {
          const y = 11 + i * 11;
          R.text(k, 137, y, { color: P.ui2, shadow: false });
          R.text(String(v ?? '—'), 176, y, { color: P.ink2, shadow: false, align: 'right' });
          const bw = Math.round(clamp((v || 0) / 160, 0, 1) * 96);
          R.rect(182, y + 2, 96, 4, P.ui1);
          R.rect(182, y + 2, bw, 4, mix(P.gold2, P.leaf2, i / 6));
        });

        UIx.panel(130, 88, R.W - 136, R.H - 106, 'paper');
        R.text('Moves', 137, 92, { color: P.ui2, shadow: false });
        (g.moves || []).slice(0, 4).forEach((slot, i) => {
          const m = getMove(slot.id);
          const y = 104 + i * 14;
          typeChip(137, y, m.type);
          R.text(fitText(m.name, 100), 164, y, { color: P.ink2, shadow: false });
          R.text(`${slot.focus}/${slot.maxFocus ?? slot.focus}`, R.W - 12, y, { color: P.ink3, shadow: false, align: 'right' });
        });
        R.rect(0, R.H - 12, R.W, 12, 'rgba(16,12,20,0.8)');
        R.text(`${Input.label('b')} back`, 6, R.H - 10, { color: P.ui1 });
      });
    },
  };
}

// --------------------------------------------------------------------- records
function dexScene() {
  let sel = 0, t = 0;
  const rows = GUARDIANS.map(g => ({ ...g, state: S.seen?.[g.id] || null }));

  return {
    update() {
      t++;
      if (Input.pressed('b')) { Audio.sfx('cancel'); Scenes.pop(); return; }
      if (Input.pressed('down')) { sel = (sel + 1) % rows.length; Audio.sfx('cursor'); }
      if (Input.pressed('up')) { sel = (sel + rows.length - 1) % rows.length; Audio.sfx('cursor'); }
      if (Input.pressed('right')) { sel = clamp(sel + 6, 0, rows.length - 1); Audio.sfx('cursor'); }
      if (Input.pressed('left')) { sel = clamp(sel - 6, 0, rows.length - 1); Audio.sfx('cursor'); }
    },
    render() {
      R.layer(LAYER.GROUND, drawRoom);
      R.layer(LAYER.UI, () => {
        const bonded = rows.filter(r => r.state === 'bonded').length;
        const seen = rows.filter(r => r.state).length;
        R.text('RECORDS', 8, 6, { color: P.gold1 });
        R.text(`${bonded} bonded · ${seen} met · ${rows.length} known to exist`, R.W - 8, 6,
          { color: P.ui2, align: 'right' });

        const start = Math.max(0, Math.min(rows.length - 18, Math.floor(sel / 6) * 6 - 6));
        for (let i = 0; i < 18; i++) {
          const r = rows[start + i];
          if (!r) break;
          const x = 8 + (i % 6) * 51, y = 20 + Math.floor(i / 6) * 46;
          const on = start + i === sel;
          R.rect(x, y, 47, 42, on ? mix(P.gold2, '#1b2233', 0.55) : 'rgba(255,255,255,0.05)');
          if (on) R.stroke(x, y, 47, 42, P.gold2);
          const img = Atlas.tryGet(`g.${r.id}.front`);
          if (img) {
            if (r.state) R.blit(img, x + 3, y - 6, { w: 40, h: 40 });
            else {
              const silhouette = Atlas.get(Atlas.silhouette(`g.${r.id}.front`, '#0e2723'));
              R.blit(silhouette, x + 3, y - 6, { w: 40, h: 40, alpha: .7 });
            }
          }
          R.text(r.state ? r.name.slice(0, 8) : '???', x + 23, y + 33,
            { color: r.state === 'bonded' ? P.gold0 : r.state ? P.ui1 : P.ui2, align: 'center' });
        }
        R.rect(0, R.H - 12, R.W, 12, 'rgba(16,12,20,0.8)');
        const cur = rows[sel];
        R.text(cur?.state ? `${cur.name} — ${cur.type}` : 'Not met yet', 6, R.H - 10, { color: P.ui1 });
      });
    },
  };
}

export function register() {
  Scenes.register('party', p => partyScene(p));
  Scenes.register('summary', p => summaryScene(p));
  Scenes.register('dex', () => dexScene());

  Hooks.install('party', {
    async openParty(opts) { return Scenes.pushAsync('party', opts); },
    async openSummary(g) { return Scenes.pushAsync('summary', { g }); },
    async chooseGuardian(opts) {
      return Scenes.pushAsync('party', { ...opts, picking: true });
    },
  });
}
