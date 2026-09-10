// The battle screen: presentation only. The engine decides what happens and hands
// back an ordered event list; this file turns that list into something that feels
// like it landed — timed text, hit flashes, screen shake, draining bars, and a
// bonding sequence that reads as an offer rather than a capture.

import { R, LAYER } from '../core/renderer.js';
import { Input } from '../core/input.js';
import { Scenes } from '../core/scene.js';
import { Atlas } from '../art/atlas.js';
import { Audio } from '../core/audio.js';
import { UIx, Hooks } from '../core/bridge.js';
import { S, addHearth, save } from '../state.js';
import { Bus, EV } from '../core/events.js';
import { Font } from '../core/font.js';
import { P, TYPE_COLOR, mix } from '../art/palette.js';
import { clamp, ease } from '../core/util.js';
import {
  newBattle, chooseAction, stepTurn, activeOf, canRun, canBond,
  forceSwitch, aiAction, hpFrac, hasFocus, previewEffect, presentationOf,
} from './engine.js';
import { makeGuardian, displayName, getSpecies, restEasy, commitEvolve, normalizeGuardian } from './species.js';
import { getMove, STATUS } from './moves.js';
import { BOND_BEATS, bondPreview, startingBond } from './capture.js';

const MENU = ['Fight', 'Bond', 'Team', 'Bag', 'Run'];
const DRAIN = 22;              // frames an HP bar takes to travel its full width
const TEXT_HOLD = 8;
const BOND_WAIT = 84;          // the offer and all four trust beats remain visible

const fitText = (value, width) => {
  let s = String(value);
  if (Font.measure(s) <= width) return s;
  while (s.length && Font.measure(`${s}..`) > width) s = s.slice(0, -1);
  return `${s}..`;
};

export function gridCursor(index, count, direction) {
  if (count < 2) return 0;
  const i = clamp(index, 0, count - 1);
  if (direction === 'left' || direction === 'right') {
    const next = i % 2 ? i - 1 : i + 1;
    return next < count ? next : i;
  }
  if (count <= 2) return (i + 1) % count;
  const rows = Math.ceil(count / 2), step = direction === 'up' ? -1 : 1;
  return Math.min(count - 1, ((Math.floor(i / 2) + rows + step) % rows) * 2 + i % 2);
}

function navigateGrid(index, count) {
  const direction = ['up', 'down', 'left', 'right'].find(key => Input.nav(key));
  if (!direction) return clamp(index, 0, count - 1);
  const next = gridCursor(index, count, direction);
  if (next !== index) Audio.sfx('cursor');
  return next;
}

export function commandCursor(index, direction) {
  const step = direction === 'left' || direction === 'up' ? -1 : 1;
  return (index + MENU.length + step) % MENU.length;
}

// ---------------------------------------------------------------- battle scene
function battleScene(params) {
  let B = null;
  let phase = 'intro';          // intro | menu | moves | bond | bag | anim | over
  let cursor = 0, moveCursor = 0, bagCursor = 0;
  let queue = [];               // pending engine events
  let text = '', textShown = 0, textHold = 0;
  let t = 0, introT = 0;
  let resolve = null, outcome = null;
  const shownHp = { player: 1, foe: 1 };   // lags real HP so bars drain visibly
  const hpTarget = { player: 1, foe: 1 };
  const shownXp = { v: 0 };
  let xpTarget = 0;
  const shown = { player: null, foe: null };
  const fx = [];                // {name, x, y, t, frames}
  const flash = { player: 0, foe: 0 };
  const nudge = { player: 0, foe: 0 };
  const attack = { player: 0, foe: 0 };
  const faint = { player: -1, foe: -1 };
  const floaters = [];
  let bonding = null;           // {t, beats, ok}
  let evolving = null;

  // --- layout ---
  // Keep both silhouettes inside the touch-safe scenic band: mobile controls
  // occupy the far left/right edges while the command UI owns the bottom.
  const FOE = { x: 171, y: 32 };
  const PLR = { x: 63, y: 46 };

  function setText(s, hold = TEXT_HOLD) {
    text = s; textShown = 0; textHold = hold;
  }

  function begin() {
    const party = S.party.length ? S.party : demoParty();
    const foe = params?.foeGuardian
      || makeGuardian(params?.speciesId || 'leafowl', params?.level || 5, { where: params?.where || 'the tall grass' });
    B = newBattle({
      party, foe, kind: params?.kind || 'wild',
      seed: (Date.now() ^ (S.seed || 1)) >>> 0,
      ctx: {
        villageLevel: safeLevel(), streak: S.missions?.streak || 0,
        charm: 'charm', playerName: S.player.name,
      },
    });
    shownHp.player = hpFrac(activeOf(B, 'player'));
    shownHp.foe = hpFrac(activeOf(B, 'foe'));
    hpTarget.player = shownHp.player;
    hpTarget.foe = shownHp.foe;
    shown.player = presentationOf(activeOf(B, 'player'));
    shown.foe = presentationOf(activeOf(B, 'foe'));
    shownXp.v = xpFrac(activeOf(B, 'player'));
    xpTarget = shownXp.v;
    S.seen[B.foeParty[0].species] = S.seen[B.foeParty[0].species] || 'seen';
    setText(`A wild ${displayName(activeOf(B, 'foe'))} steps out of the grass!`, 26);
  }

  // --- event consumption -----------------------------------------------------
  function pump() {
    if (textShown < text.length) return;
    if (textHold > 0) { textHold--; return; }
    if (bonding?.stage === 'waiting' && bonding.t < BOND_WAIT) return;
    if (!queue.length) {
      if (B.over) { finish(); return; }
      if (B.needSwitch) { openForcedSwitch(); return; }
      setText(`What will ${displayName(activeOf(B, 'player'))} do?`, 0);
      phase = 'menu';
      return;
    }
    const e = queue.shift();
    applyEvent(e);
  }

  function applyEvent(e) {
    switch (e.k) {
      case 'text':
        setText(e.s, e.hold ?? TEXT_HOLD);
        if (e.side && e.move) attack[e.side] = 16;
        if (e.punch) { R.shake(3, 8); Audio.sfx('confirm'); }
        break;

      case 'damage': {
        const side = e.target;
        if (shown[side] && e.hp !== undefined) shown[side].hp = e.hp;
        hpTarget[side] = e.maxhp ? clamp(e.hp / e.maxhp, 0, 1) : hpTarget[side];
        const at = side === 'foe' ? FOE : PLR;
        floaters.push({ x: at.x + 40, y: at.y + 29, t: 0,
          label: e.missed ? 'MISS' : `${e.heal ? '+' : '-'}${Math.abs(e.amount || 0)}`,
          color: e.heal ? '#b7f4af' : e.crit ? '#ffdc77' : '#fff8e1',
          detail: e.crit ? 'CRITICAL' : e.eff >= 2 ? `${e.eff}x EFFECTIVE` : e.eff < 1 ? 'RESISTED' : '',
        });
        if (e.missed) { Audio.sfx('cancel'); textHold = 14; break; }
        if (!e.heal) {
          flash[side] = 10;
          nudge[side] = 8;
          const power = e.eff >= 2 ? 5 : e.eff < 1 ? 1 : 3;
          R.shake(power, 10);
          Audio.sfx('bump', { rate: e.eff >= 2 ? 0.8 : 1.2, gain: 1.2 });
        } else Audio.sfx('chime');
        spawnFx(e.anim?.fx || 'fx.impact', at.x + 40, at.y + 44);
        textHold = Math.max(textHold, 18);
        break;
      }

      case 'status':
        if (shown[e.target]) shown[e.target].status = e.status;
        Audio.sfx(e.cured ? 'chime' : 'deny'); textHold = 8; break;
      case 'stat': {
        const at = e.target === 'foe' ? FOE : PLR;
        spawnFx(e.anim?.fx || 'fx.sparkle', at.x + 32, at.y + 40);
        Audio.sfx('cursor'); textHold = 8; break;
      }

      case 'faint': {
        faint[e.side] = 0;
        Audio.sfx('deny');
        textHold = 24;
        break;
      }

      case 'switch': {
        shown[e.side] = presentationOf(e.guardian || (e.side === 'player' ? B.party[e.i] : B.foeParty[e.i]));
        faint[e.side] = -1;
        const g = shownGuardian(e.side);
        shownHp[e.side] = hpFrac(g);
        hpTarget[e.side] = shownHp[e.side];
        if (e.side === 'player') { shownXp.v = xpFrac(g); xpTarget = shownXp.v; }
        const at = e.side === 'foe' ? FOE : PLR;
        spawnFx('fx.sparkle', at.x + 40, at.y + 40);
        textHold = 14;
        break;
      }

      case 'xp': xpTarget = e.xpNext ? clamp(e.to / e.xpNext, 0, 1) : xpTarget; textHold = 10; break;
      case 'levelup': {
        shown.player.lvl = e.level;
        if (e.maxhp) { shown.player.maxhp = e.maxhp; shown.player.hp = e.hp; }
        xpTarget = 0;
        shownXp.v = 0;
        if (e.maxhp) hpTarget.player = clamp(e.hp / e.maxhp, 0, 1);
        Audio.sfx('chime');
        spawnFx('fx.star', PLR.x + 32, PLR.y + 10);
        textHold = 20;
        break;
      }
      case 'evolve': {
        const guardian = B.party[e.i];
        const result = guardian ? commitEvolve(guardian) : null;
        if (result) {
          shown.player = presentationOf(guardian);
          evolving = { t: 0, ...result };
          setText(`${result.fromName} grew into ${result.toName}!`, 72);
          Bus.emit(EV.GUARDIAN_EVOLVED, { guardian, ...result });
          save();
        }
        break;
      }

      case 'bond-try':
        bonding = { t: 0, beats: e.beats ?? 0, ok: false, stage: 'waiting', charm: e.charm };
        setText(`${e.name} is considering your offer.`, 0);
        Audio.sfx('coin');
        break;
      case 'bond-ok':
        bonding = { ...bonding, t: 0, beats: BOND_BEATS, ok: true, stage: 'welcome',
          name: e.name, hearth: e.hearth || 0, destination: S.party.length < 6 ? 'party' : 'box' };
        Audio.sfx('chime');
        if (e.hearth) addHearth(e.hearth);
        S.seen[e.species] = 'bonded';
        if (e.foe) {
          const guardian = makeGuardian(e.species, e.level, {
            id: nextGuardianId(),
            where: e.foe.met?.where || params?.where || 'the wild',
            day: S.clock?.day || 0,
            bond: startingBond(B.ctx),
          });
          restEasy(guardian, { full: true });
          shown.foe = presentationOf(guardian);
          hpTarget.foe = hpFrac(guardian);
          const home = S.party.length < 6 ? S.party : S.box;
          home.push(guardian);
          Bus.emit(EV.GUARDIAN_CAUGHT, { guardian, destination: home === S.party ? 'party' : 'box' });
        }
        save();
        setText(`Welcome, ${e.name}!`, 60);
        break;
      case 'bond-fail':
        bonding = { ...bonding, t: 0, ok: false, stage: 'withdraw' };
        if (e.hearth) addHearth(e.hearth);
        Audio.sfx('cancel'); textHold = 20;
        break;

      case 'consume':
        S.bag[e.item] = Math.max(0, (S.bag[e.item] || 0) - (e.n || 1));
        break;

      case 'end': outcome = e.outcome; textHold = 20; break;
      default: textHold = 6;
    }
  }

  function spawnFx(name, x, y) {
    const frames = Atlas.has(name) ? Atlas.frames(name) : 0;
    if (!frames) return;
    fx.push({ name, x, y, t: 0, frames });
  }

  // --- player actions --------------------------------------------------------
  function submit(action) {
    chooseAction(B, 'player', action);
    chooseAction(B, 'foe', aiAction(B, 'foe'));
    queue = stepTurn(B).slice();
    phase = 'anim';
    textHold = 0;
  }

  async function openForcedSwitch() {
    phase = 'anim';
    const live = B.party.map((g, i) => ({ g, i })).filter(o => o.g.hp > 0);
    if (!live.length) { finish(); return; }
    let pick = live[0].i;
    try {
      const chosen = await Hooks.party.chooseGuardian({ reason: 'faint', party: B.party, active: B.active });
      if (typeof chosen === 'number' && chosen >= 0 && B.party[chosen]?.hp > 0) pick = chosen;
    } catch {}
    queue = forceSwitch(B, pick).slice();
  }

  async function finish() {
    if (phase === 'over') return;
    phase = 'over';
    for (const g of B.party) restEasy(g);
    const result = outcome || B.outcome || 'fled';
    save();
    await UIx.fade('out', 14);
    Scenes.pop(result);
    resolve?.(result);
  }

  // --- update ----------------------------------------------------------------
  function update() {
    t++;
    if (textShown < text.length) textShown += 2;
    for (let i = fx.length - 1; i >= 0; i--) if (++fx[i].t > fx[i].frames * 4) fx.splice(i, 1);
    for (const k of ['player', 'foe']) {
      if (flash[k] > 0) flash[k]--;
      if (nudge[k] > 0) nudge[k]--;
      if (attack[k] > 0) attack[k]--;
      if (faint[k] >= 0) faint[k]++;
    }
    for (let i = floaters.length - 1; i >= 0; i--) if (++floaters[i].t > 34) floaters.splice(i, 1);
    if (bonding) {
      const before = Math.max(0, Math.floor((bonding.t - 18) / 14));
      bonding.t += phase === 'anim' && Input.held('a') ? 3 : 1;
      const after = Math.max(0, Math.floor((bonding.t - 18) / 14));
      if (bonding.stage === 'waiting' && after > before && after <= bonding.beats) Audio.sfx('cursor');
      if (bonding.stage === 'withdraw' && bonding.t > 28) bonding = null;
    }
    if (evolving && ++evolving.t > 96) evolving = null;

    // Follow event targets instead of the engine's already-resolved final state.
    // This keeps drains, switches and XP gains in the order the player sees them.
    shownHp.player += clamp(hpTarget.player - shownHp.player, -1 / DRAIN, 1 / DRAIN);
    shownHp.foe += clamp(hpTarget.foe - shownHp.foe, -1 / DRAIN, 1 / DRAIN);
    shownXp.v += clamp(xpTarget - shownXp.v, -1 / 40, 1 / 40);

    if (phase === 'intro') {
      introT++;
      // Long enough for the slide-in to land, short enough not to make anyone wait.
      if (introT > 26 && (Input.pressed('a') || introT > 54)) { phase = 'anim'; queue = []; textHold = 0; }
      return;
    }

    if (phase === 'anim') {
      // Holding A fast-forwards the beat, which is what impatient players want.
      if (Input.held('a') && textHold > 2) textHold -= 2;
      if (textShown < text.length && Input.held('a')) textShown += 3;
      pump();
      return;
    }

    if (phase === 'menu') {
      const direction = ['up', 'down', 'left', 'right'].find(key => Input.nav(key));
      if (direction) { cursor = commandCursor(cursor, direction); Audio.sfx('cursor'); }
      if (Input.pressed('a')) {
        Audio.sfx('confirm');
        const pick = MENU[cursor];
        if (pick === 'Fight') { phase = 'moves'; moveCursor = 0; }
        else if (pick === 'Bond') {
          if (!canBond(B)) { setText('This Guardian already has a home.', 20); phase = 'anim'; }
          else phase = 'bond';
        }
        else if (pick === 'Team') openParty();
        else if (pick === 'Bag') { phase = 'bag'; bagCursor = 0; }
        else if (pick === 'Run') {
          if (!canRun(B)) { setText('There is no running from this one.', 20); phase = 'anim'; }
          else submit({ type: 'run' });
        }
      }
      return;
    }

    if (phase === 'bond') {
      if (Input.pressed('b')) { phase = 'menu'; Audio.sfx('cancel'); return; }
      if (Input.pressed('a')) {
        if ((S.bag.charm || 0) < 1 || !canBond(B) || rosterFull()) { Audio.sfx('deny'); return; }
        Audio.sfx('confirm');
        submit({ type: 'bond', charm: 'charm' });
      }
      return;
    }

    if (phase === 'moves') {
      const g = activeOf(B, 'player');
      const exhausted = !hasFocus(g);
      const n = exhausted ? 1 : Math.max(1, g.moves.length);
      moveCursor = navigateGrid(moveCursor, n);
      if (Input.pressed('b')) { phase = 'menu'; Audio.sfx('cancel'); }
      if (Input.pressed('a')) {
        if (exhausted) { Audio.sfx('confirm'); submit({ type: 'move', id: 'struggle' }); return; }
        const m = g.moves[moveCursor];
        if (!m || m.focus <= 0) { Audio.sfx('deny'); setText('That move has no focus left.', 16); phase = 'anim'; return; }
        Audio.sfx('confirm');
        submit({ type: 'move', id: m.id });
      }
      return;
    }

    if (phase === 'bag') {
      const items = bagItems();
      if (Input.nav('down')) { bagCursor = (bagCursor + 1) % items.length; Audio.sfx('cursor'); }
      if (Input.nav('up')) { bagCursor = (bagCursor + items.length - 1) % items.length; Audio.sfx('cursor'); }
      if (Input.pressed('b')) { phase = 'menu'; Audio.sfx('cancel'); }
      if (Input.pressed('a')) {
        const it = items[bagCursor];
        if (!it || it.n <= 0) { Audio.sfx('deny'); return; }
        Audio.sfx('confirm');
        if (it.bond) {
          if (!canBond(B)) { setText('You cannot offer a charm to a friend’s Guardian.', 20); phase = 'anim'; return; }
          if (rosterFull()) {
            setText('Your travelling team and home are full. No charm was used.', 28);
            phase = 'anim';
            return;
          }
          submit({ type: 'bond', charm: it.id });
        } else submit({ type: 'item', id: it.id });
      }
    }
  }

  async function openParty() {
    phase = 'anim'; textHold = 2;
    try {
      const i = await Hooks.party.chooseGuardian({ reason: 'switch', party: B.party, active: B.active });
      if (typeof i === 'number' && i >= 0 && i !== B.active && B.party[i]?.hp > 0) {
        submit({ type: 'switch', i });
        return;
      }
    } catch {}
    phase = 'menu';
  }

  // --- render ----------------------------------------------------------------
  function render() {
    R.layer(LAYER.GROUND, () => drawBackdrop());
    R.layer(LAYER.ENTITY, () => {
      drawBattler('foe');
      drawBattler('player');
      drawFx();
    });
    R.layer(LAYER.UI, () => {
      drawPanel('foe');
      drawPanel('player');
      if (phase !== 'moves' && phase !== 'bag' && phase !== 'bond') drawTextbox();
      if (phase === 'menu') drawMenu();
      else if (phase === 'moves') drawMoves();
      else if (phase === 'bag') drawBag();
      else if (phase === 'bond') drawBond();
      if (evolving) drawEvolve();
    });
  }

  function drawBackdrop() {
    const scene = Atlas.tryGet('scene.battle');
    if (scene) {
      R.blit(scene, 0, 0, { w: R.W, h: R.H });
      R.rect(0, 0, R.W, 53, 'rgba(13,35,31,0.13)');
      // A few slow motes keep the clearing alive while choosing an action.
      for (let i = 0; i < 7; i++) {
        const motion = S.settings?.reducedMotion ? 0 : t;
        const x = (i * 47 + motion * 0.08) % R.W;
        const y = 59 + (i * 13) % 58 + Math.sin(motion / 55 + i) * 5;
        R.rect(x, y, 1, 1, 'rgba(255,239,178,0.65)');
      }
      return;
    }
    // A shaded woodland clearing: cool, layered edges frame a warm playable
    // centre. This deliberately replaces the old bright-sky meadow backdrop.
    for (let y = 0; y < 86; y += 2) {
      R.rect(0, y, R.W, 2, mix('#102c27', '#527a49', y / 86));
    }
    R.glow(160, 43, 88, '#ffe4a2', 0.13);

    // Low-contrast canopy layers create distance before the readable tree line.
    const ridge = (base, amp, step, col) => {
      let py=base;
      for(let x=0;x<R.W;x+=step){
        const y=base-Math.round((Math.sin(x*.037)+Math.sin(x*.071+1.7))*amp);
        const x2=Math.min(R.W,x+step);
        for(let xx=x;xx<x2;xx++){
          const t=(xx-x)/Math.max(1,step); const yy=Math.round(py+(y-py)*t);
          R.rect(xx,yy,1,96-yy,col);
        }
        py=y;
      }
    };
    ridge(52,8,17,'#315d45');
    ridge(65,7,15,'#244d38');
    ridge(77,5,12,'#183c2d');

    // Tree line with trunks visible below irregular crowns. The centre is thinned
    // so both guardians silhouette cleanly against the light.
    for(let x=-10;x<R.W+14;x+=17){
      const edge=Math.abs(x-R.W/2)/(R.W/2);
      const h=13+((x*13)%9+9)%9;
      const base=82;
      R.rect(x+7,base-h,3,h+7,'#3d2b1d');
      R.rect(x+7,base-h,1,h+7,'#775233');
      const crown=edge>.45?'#2e6a3c':'#467d48';
      disc(x+8,base-h,8,7,crown);
      disc(x+3,base-h+4,6,5,mix(crown,'#79a94f',.18));
      if(edge>.58) disc(x+14,base-h+3,6,6,'#244f33');
    }

    // Mossy floor, warm dappled centre, and darker foreground framing.
    R.rect(0,76,R.W,104,'#426f3d');
    for(let y=76;y<180;y+=4) {
      R.rect(0,y,R.W,2,mix('#628f49','#244f35',(y-76)/120));
    }
    disc(160,103,116,29,'#5f9449');
    disc(160,108,92,22,'#6fa34f');
    R.glow(157,92,96,'#ffd48a',0.09);

    for(let i=0;i<48;i++){
      const x=(i*47+19)%R.W, y=91+((i*29)%61);
      const edge=Math.abs(x-R.W/2)/(R.W/2);
      const col=i%3===0?'#f4ce66':i%3===1?'#e99ab4':'#cde8df';
      R.rect(x,y,1,2,edge>.56?'#1e5532':'#34713a');
      if(i%2===0) R.rect(x-1,y-1,3,1,col);
    }
    for(let x=0;x<R.W;x+=5) {
      const y=98+((x*7)%23);
      R.rect(x,y,1,3,x<48||x>270?'#173f2c':'#78a95b');
    }
    disc(FOE.x + 40, FOE.y + 69, 43, 10, '#3b6b3a');
    disc(PLR.x + 40, PLR.y + 69, 48, 11, '#3f713d');
    R.rect(0,150,R.W,30,'#1d4932');
    for(let x=0;x<R.W;x+=6){ const h=3+((x*5)%9); R.rect(x,151-h,1,h,'#6c9a51'); R.rect(x+2,151-h,1,h-1,'#315f3c'); }
  }

  function disc(cx, cy, rx, ry, c) {
    for (let y = -ry; y <= ry; y++) {
      const half = Math.sqrt(Math.max(0, 1 - (y / ry) ** 2)) * rx;
      R.rect(cx - half, cy + y, half * 2, 1, y < 0 ? mix(c, '#ffffff', 0.12) : c);
    }
  }

  function drawBattler(side) {
    const g = shownGuardian(side);
    if (!g) return;
    const at = side === 'foe' ? FOE : PLR;
    const reduced = S.settings?.reducedMotion;
    const bob = reduced ? 0 : Math.sin(t / 26 + (side === 'foe' ? 1 : 0)) * 1.5;
    const slide = phase === 'intro' && !reduced
      ? (1 - ease.outCubic(Math.min(1, introT / 34))) * (side === 'foe' ? 90 : -90)
      : 0;
    const push = nudge[side] > 0 && !reduced ? Math.sin(nudge[side] / 8 * Math.PI) * (side === 'foe' ? 4 : -4) : 0;
    const name = `g.${g.species}.${side === 'foe' ? 'front' : 'back'}`;
    const img = Atlas.tryGet(name);
    const lunge = reduced ? 0 : Math.sin((1 - attack[side] / 16) * Math.PI) * (side === 'foe' ? -6 : 6);
    const welcomeStep = side === 'foe' && bonding?.ok ? (reduced ? 0 : ease.outCubic(Math.min(1, bonding.t / 28)) * -7) : 0;
    const x = at.x + slide + push + lunge + welcomeStep, y = at.y + bob;
    const fainted = faint[side] >= 0;
    const collapse = fainted ? ease.outCubic(Math.min(1, faint[side] / 20)) : 0;
    const sink = reduced ? 0 : collapse * 16;

    const sh = Atlas.tryGet('fx.shadow.big');
    if (sh) R.blit(sh, x + 8, at.y + (img?.smooth ? 68 : 54), { alpha: fainted ? 0.15 : 0.42 });

    if (!img) { disc(x + 40, y + 55, 16, 19, TYPE_COLOR[g.types[0]] || P.leaf2); return; }
    if (evolving && side === 'player') return;   // the evolution overlay owns the sprite
    const dw = img.logicalWidth || img.width, dh = img.logicalHeight || img.height;
    const dx = Math.round(x), dy = Math.round(y + sink);
    if (!reduced && flash[side] > 0 && flash[side] % 4 < 2) {
      R.blit(img, dx, dy);
      R.silhouette(img, dx, dy, '#fff4d6', 0.8);
    } else R.blit(img, dx, dy, { w: dw, h: dh, alpha: 1 - collapse * 0.8 });
  }

  function drawFx() {
    for (const f of fx) {
      const img = Atlas.tryGet(f.name, S.settings?.reducedMotion ? 0 : Math.floor(f.t / 4));
      if (img) R.blit(img, f.x - img.width / 2, f.y - img.height / 2);
    }
    for (const f of floaters) {
      const lift = S.settings?.reducedMotion ? 4 : ease.outCubic(Math.min(1, f.t / 28)) * 12;
      R.ctx.save();
      R.ctx.globalAlpha = Math.min(1, (35 - f.t) / 9);
      R.text(f.label, f.x, f.y - lift, { color: f.color, shadow: '#142c28', align: 'center' });
      if (f.detail) R.text(f.detail, f.x, f.y - lift + 10, { color: f.color, shadow: '#142c28', align: 'center' });
      R.ctx.restore();
    }
    if (bonding) drawOffer();
  }

  function drawPanel(side) {
    const g = shownGuardian(side);
    if (!g) return;
    const foe = side === 'foe';
    const w = 118;
    const h = 33;
    const x = foe ? R.W - w - 8 : 8;
    const y = 7;
    const style = hearthPanel(x, y, w, h);

    R.text(fitText(displayName(g), w - 40), x + 7, y + 4, { color: style.ink, shadow: style.shadow });
    R.text(`Lv ${g.lvl}`, x + w - 7, y + 4, { color: style.sub, shadow: style.shadow, align: 'right' });

    const type = g.types.map(ty => ty.toUpperCase()).join('/');
    if (g.status && STATUS[g.status]) {
      const st = STATUS[g.status];
      R.text(st.name.toUpperCase(), x + 7, y + 23, { color: st.color, shadow: style.shadow });
    } else R.text(fitText(type, foe ? w - 14 : 49), x + 7, y + 23,
      { color: mix(TYPE_COLOR[g.types[0]] || P.ui1, '#f6edd3', 0.45), shadow: style.shadow });
    const health = `${Math.max(0, Math.ceil(shownHp[side] * g.maxhp))}/${g.maxhp}`;
    hpBar(x + 8, y + 16, Math.min(62, w - 22 - Font.measure(health)), shownHp[side], hpTarget[side]);
    R.text(health,
      x + w - 7, y + 13, { color: style.ink, shadow: style.shadow, align: 'right' });
    if (!foe) {
      R.text('XP', x + 61, y + 23, { color: style.sub, shadow: style.shadow });
      xpBar(x + 77, y + 26, w - 85, shownXp.v);
    }
  }

  function hearthPanel(x, y, w, h) {
    R.rect(x, y, w, h, 'rgba(13,29,26,0.96)');
    R.stroke(x, y, w, h, '#897047');
    R.rect(x + 2, y + 2, w - 4, 1, '#395046');
    R.rect(x + 2, y + h - 3, w - 4, 1, '#203a31');
    for (const cx of [x + 2, x + w - 4]) R.rect(cx, y + 2, 2, 2, '#d9b77a');
    return { ink: '#f8eed3', sub: '#b9c6ad', shadow: '#091710' };
  }

  function drawOffer() {
    // The woven charm is held between the companions. No projectile, container,
    // or disappearing Guardian: the thread reaches out only as trust is earned.
    const reduced = S.settings?.reducedMotion;
    const withdrawing = bonding.stage === 'withdraw';
    const ready = bonding.stage === 'waiting'
      ? Math.min(bonding.beats, Math.max(0, Math.floor((bonding.t - 18) / 14)))
      : bonding.ok ? BOND_BEATS : bonding.beats;
    const alpha = withdrawing ? Math.max(0, 1 - bonding.t / 28) : Math.min(1, (bonding.t + 5) / 15);
    const cx = 156, cy = 91 + (reduced ? 0 : Math.sin(t / 22) * 1.3);
    const gold = bonding.ok ? '#c9f2b0' : '#efcb83';
    R.ctx.save();
    R.ctx.globalAlpha = alpha;
    R.glow(cx, cy, 24, '#ffd990', reduced ? 0.12 : 0.12 + Math.sin(t / 9) * 0.025);
    // Cedar loop, crossing red and gold fibres, and two loose tails.
    const loop = [[-3,-6],[0,-7],[3,-6],[5,-3],[6,0],[5,3],[3,6],[0,7],[-3,6],[-5,3],[-6,0],[-5,-3]];
    for (const [dx, dy] of loop) {
      R.rect(cx + dx, cy + dy, 2, 2, '#68462d');
      R.rect(cx + dx, cy + dy, 1, 1, gold);
    }
    for (let k = -4; k <= 4; k++) {
      R.rect(cx + k, cy + k / 2, 1, 1, '#e29378');
      R.rect(cx + k, cy - k / 2, 1, 1, gold);
    }
    R.rect(cx - 1, cy + 6, 2, 8, '#ad4c3f');
    R.rect(cx + 2, cy + 7, 1, 6, '#e4b06b');
    // Four knots illuminate with the engine's actual successful heartbeats.
    for (let i = 0; i < BOND_BEATS; i++) {
      const x = cx - 18 + i * 12, y = 112;
      R.stroke(x, y, 7, 7, '#b99b64');
      R.rect(x + 2, y + 2, 3, 3, i < ready ? gold : '#283b30');
    }
    if (ready > 0) {
      const progress = ready / BOND_BEATS;
      for (let i = 0; i < Math.floor(progress * 37); i++) {
        const x = cx + 9 + i, y = cy + Math.sin(i / 12) * 6;
        if (i % 3 !== 2) R.rect(x, y, 1, 1, gold);
      }
    }
    if (bonding.ok) {
      const hx = FOE.x + 32, hy = FOE.y + 6;
      R.rect(hx + 1, hy, 2, 1, '#f4a7ad');
      R.rect(hx + 4, hy, 2, 1, '#f4a7ad');
      R.rect(hx, hy + 1, 7, 2, '#ee8296');
      R.rect(hx + 1, hy + 3, 5, 1, '#ee8296');
      R.rect(hx + 2, hy + 4, 3, 1, '#ce617b');
      R.rect(hx + 3, hy + 5, 1, 1, '#ce617b');
      R.rect(hx + 1, hy + 1, 1, 1, '#ffe9d6');
    }
    R.ctx.restore();
  }

  function hpBar(x, y, w, frac, target = frac) {
    const f = clamp(frac, 0, 1);
    R.rect(x - 1, y - 1, w + 2, 6, P.ui4);
    R.rect(x, y, w, 4, '#2c2418');
    const col = f > 0.5 ? P.hpGood : f > 0.22 ? P.hpWarn : P.hpBad;
    R.rect(x, y, Math.round(w * f), 4, target < f ? '#f7d18b' : col);
    R.rect(x, y, Math.round(w * Math.min(f, target)), 4, col);
    R.rect(x, y, Math.round(w * Math.min(f, target)), 1, mix(col, '#ffffff', 0.45));
  }

  function xpBar(x, y, w, frac) {
    R.rect(x - 1, y - 1, w + 2, 4, P.ui4);
    R.rect(x, y, w, 2, '#1d2a34');
    R.rect(x, y, Math.round(w * clamp(frac, 0, 1)), 2, P.xp);
  }

  function drawTextbox() {
    const h = 44;
    const w = R.W - 12, y = R.H - h - 4;
    const style = hearthPanel(6, y, w, h);
    if (bonding?.ok) {
      R.text(fitText(`Welcome, ${bonding.name}!`, w - 98), 15, y + 7, { color: '#e8ce91', shadow: style.shadow });
      R.text(`+${bonding.hearth} Hearth`, R.W - 15, y + 7,
        { color: '#c9f2b0', shadow: style.shadow, align: 'right' });
      const destination = bonding.destination === 'party'
        ? 'Your new friend is travelling with your team.'
        : 'Waiting at home: Menu > Guardians > At home.';
      Font.wrap(destination, w - 20).slice(0, 2).forEach((line, i) =>
        R.text(line, 15, y + 21 + i * 10, { color: style.ink, shadow: style.shadow }));
      return;
    }
    if (phase === 'menu') {
      const help = cursor === 1 ? ((S.bag.charm || 0) > 0
        ? 'Offer a woven charm. A bond begins with trust.' : 'You need a Woven Charm to offer a bond.')
        : cursor === 2 ? 'Choose a travelling Guardian.'
        : cursor === 3 ? 'Use supplies from your bag.'
        : cursor === 4 ? 'Step away from this encounter.' : `What will ${displayName(shown.player)} do?`;
      R.text(fitText(help, w - 18), 15, y + 7, { color: style.ink, shadow: style.shadow });
      return;
    }
    const lines = Font.wrap(text, w - 20);
    let n = textShown;
    lines.slice(0, 3).forEach((l, i) => {
      const limit = Math.max(0, Math.min(l.length, n));
      n -= l.length;
      R.text(l, 16, R.H - h + 4 + i * 12, { color: style.ink, shadow: style.shadow, limit });
    });
  }

  function drawMenu() {
    MENU.forEach((m, i) => {
      const mx = 12 + i * 60, my = 154;
      const on = i === cursor;
      R.rect(mx, my, 56, 17, on ? '#d9b575' : '#233c31');
      R.stroke(mx, my, 56, 17, on ? '#ffe1a0' : '#55735b');
      if (on) R.rect(mx + 7, my + 14, 42, 1, '#987038');
      const disabled = m === 'Bond' && !canBond(B) || m === 'Run' && !canRun(B);
      R.text(m, mx + 28, my + 4,
        { color: on ? '#243327' : disabled ? '#87927d' : '#eee5c9', shadow: on ? false : '#0b2018', align: 'center' });
    });
  }

  function drawBond() {
    const x = 6, y = 122, w = R.W - 12, h = 54;
    const style = hearthPanel(x, y, w, h);
    const pv = safeBondPreview();
    const count = S.bag.charm || 0;
    const full = rosterFull();
    R.text(`WOVEN CHARM  x${count}`, x + 10, y + 7, { color: '#e8ce91', shadow: style.shadow });
    R.text(full ? 'Roster full' : pv ? `${pv.percent}% chance` : 'Wild Guardians only', x + w - 10, y + 7,
      { color: full ? '#e8ce91' : '#c9f2b0', shadow: style.shadow, align: 'right' });
    const help = full ? 'Your travelling team and home are both full.'
      : count > 0 ? pv?.read || 'Offer a charm and let the Guardian decide.'
      : 'Buy more from Cobb in the meadow.';
    R.text(help, x + 10, y + 21, { color: style.ink, shadow: style.shadow });
    R.rect(x + 8, y + 34, w - 16, 1, '#45604b');
    R.text(full ? 'Your charm will be kept.' : count > 0 ? `${Input.label('a')} Offer charm` : 'No Woven Charms left', x + 10, y + 40,
      { color: count > 0 && !full ? '#e8ce91' : '#cba38c', shadow: style.shadow });
    R.text(`${Input.label('b')} Back`, x + w - 10, y + 40,
      { color: style.sub, shadow: style.shadow, align: 'right' });
  }

  function drawMoves() {
    const g = activeOf(B, 'player');
    const w = R.W - 12, h = 54, x = 6, y = R.H - h - 4;
    const style = hearthPanel(x, y, w, h);
    const exhausted = !hasFocus(g);
    const slots = exhausted ? [{ id: 'struggle', focus: 1, maxFocus: 1 }] : g.moves;
    const slot0 = slots[moveCursor];
    const m0 = slot0 ? getMove(slot0.id) : null;
    slots.forEach((slot, i) => {
      const m = getMove(slot.id);
      const mx = x + 13 + (i % 2) * 150, my = y + 8 + Math.floor(i / 2) * 15;
      const on = i === moveCursor;
      if (on) {
        R.rect(mx - 5, my - 2, 142, 13, '#8a5d25');
        const c = Atlas.tryGet('ui.cursor');
        if (c) R.blit(c, mx - 12, my);
      }
      const dim = slot.focus <= 0;
      R.rect(mx, my + 2, 3, 5, TYPE_COLOR[m.type] || P.gold1);
      R.text(fitText(m.name, 99), mx + 7, my, { color: dim ? style.sub : on ? '#fff3ce' : style.ink, shadow: style.shadow });
      R.text(exhausted ? '--' : `${slot.focus}/${slot.maxFocus ?? slot.focus}`, mx + 132, my,
        { color: dim ? '#f09b86' : style.sub, shadow: style.shadow, align: 'right' });
    });
    if (m0) {
      R.rect(x + 8, y + 37, w - 16, 1, '#526452');
      const effect = previewEffect(B, m0.id);
      const hint = exhausted ? 'No focus needed. Costs a little HP.' : m0.cat === 'status' ? 'SUPPORT'
        : effect.eff >= 2 ? `STRONG ${effect.eff}x` : effect.eff < 1 ? `RESISTED ${effect.eff}x` : 'NORMAL 1x';
      R.text(exhausted ? hint : `${m0.type.toUpperCase()}  POW ${m0.power || '--'}  ${hint}`,
        x + 10, y + 42, { color: effect.eff >= 2 ? '#c1eda5' : style.sub, shadow: style.shadow });
      R.text(`${Input.label('b')} back`, x + w - 9, y + 42, { color: style.sub, shadow: style.shadow, align: 'right' });
    }
  }

  function drawBag() {
    const items = bagItems();
    const w = 150, h = 54, x = R.W - w - 6, y = R.H - h - 4;
    const style = hearthPanel(x, y, w, h);
    hearthPanel(6, y, R.W - w - 14, h);
    const selected = items[bagCursor];
    let help = selected?.bond ? (rosterFull() ? 'Your team and home are full. No charm will be spent.'
      : 'Invite this Guardian to join your journey.')
      : selected?.id === 'salve' ? 'Restores up to 24 HP to your Guardian.' : 'Restores 2 focus to every move.';
    Font.wrap(help, 134).slice(0, 3).forEach((line, i) =>
      R.text(line, 14, y + 7 + i * 10, { color: style.ink, shadow: style.shadow }));
    const pv = selected?.bond && canBond(B) && !rosterFull() ? safeBondPreview() : null;
    R.text(pv ? `Bond chance ${pv.percent}%` : `${Input.label('b')} back`, 14, y + 42,
      { color: pv ? '#c1eda5' : style.sub, shadow: style.shadow });
    items.slice(0, 3).forEach((it, i) => {
      const my = y + 8 + i * 14;
      const on = i === bagCursor;
      if (on) {
        R.rect(x + 8, my - 2, w - 16, 13, '#8a5d25');
        const c = Atlas.tryGet('ui.cursor');
        if (c) R.blit(c, x + 3, my);
      }
      R.text(it.name, x + 14, my, { color: it.n > 0 ? style.ink : style.sub, shadow: style.shadow });
      R.text(`x${it.n}`, x + w - 12, my, { color: style.sub, shadow: style.shadow, align: 'right' });
    });
  }

  function drawEvolve() {
    const k = Math.min(1, evolving.t / 90);
    const reduced = S.settings?.reducedMotion;
    R.rect(0, 0, R.W, R.H, `rgba(12,10,18,${0.55 * k})`);
    const from = Atlas.tryGet(`g.${evolving.from}.front`);
    const to = Atlas.tryGet(`g.${evolving.to}.front`);
    const cx = R.W / 2 - 32, cy = 40;
    const flicker = evolving.t % 8 < 4;
    const img = reduced ? to : k < 0.75 ? (flicker ? from : to) : to;
    if (img) {
      if (!reduced && k < 0.85) R.silhouette(img, cx, cy, '#ffffff', 0.95);
      else R.blit(img, cx, cy);
    }
    const g = Atlas.tryGet('fx.evolve', Math.floor(evolving.t / 6) % 6);
    if (g && !reduced) R.blit(g, cx + 20, cy + 20);
  }

  // --- helpers ---------------------------------------------------------------
  function rosterFull() {
    // Save normalization retains at most 200 Guardians at home. Check before
    // offering, so neither a new friend nor the player's charm can be lost.
    return S.party.length >= 6 && S.box.length >= 200;
  }
  function bagItems() {
    return [
      { id: 'charm', name: 'Woven Charm', n: S.bag.charm || 0, bond: true },
      { id: 'salve', name: 'Warm Salve', n: S.bag.salve || 0 },
      { id: 'kindling', name: 'Kindling', n: S.bag.kindling || 0 },
    ];
  }
  function shownGuardian(side) {
    return shown[side];
  }
  function nextGuardianId() {
    let max = 0;
    for (const g of [...S.party, ...S.box]) {
      const m = /^g(\d+)$/.exec(String(g?.id || ''));
      if (m) max = Math.max(max, Number(m[1]));
    }
    return `g${max + 1}`;
  }
  function safeBondPreview() {
    try {
      return bondPreview(activeOf(B, 'foe'), {
        charm: 'charm', villageLevel: safeLevel(), streak: S.missions?.streak || 0,
        playerLevel: activeOf(B, 'player')?.lvl,
      }) ?? null;
    } catch { return null; }
  }

  return {
    enter(p) {
      params = p || params || {};
      resolve = params.__resolve || null;
      document.body.classList.add('battle-active');
      begin();
      phase = 'intro'; introT = 0;
      if (Audio.hasSong('battle')) Audio.play('battle');
    },
    exit() {
      document.body.classList.remove('battle-active');
      let song = 'field';
      try { song = Hooks.world.currentMap?.()?.music || song; } catch {}
      if (Audio.hasSong(song)) Audio.play(song);
    },
    update, render,
  };
}

const xpFrac = g => {
  if (!g || !g.xpNext) return 0;
  return clamp(g.xp / g.xpNext, 0, 1);
};

const safeLevel = () => { try { return Hooks.village.level(); } catch { return 1; } };

// A party for `?scene=battle` so the screen is always inspectable, and for a brand
// new save that somehow reaches a battle before Gran hands one over.
function demoParty() {
  return [makeGuardian('embercub', 6, { where: 'the hearth' })];
}

// ---------------------------------------------------------------- registration
export function register() {
  S.party = S.party.map(normalizeGuardian).filter(Boolean).slice(0, 6);
  S.box = S.box.map(normalizeGuardian).filter(Boolean).slice(0, 200);
  Scenes.register('battle', () => battleScene(null));

  Hooks.install('battle', {
    canBattle() { return S.party.some(g => g?.hp > 0); },
    grantStarter(speciesId = 'embercub') {
      if (S.party.length || S.box.length) return null;
      const guardian = makeGuardian(speciesId, 5, {
        id: 'g1', where: "Gran Willow's hearth", day: S.clock?.day || 1, bond: 100,
      });
      S.party.push(guardian);
      S.seen[speciesId] = 'bonded';
      Bus.emit(EV.GUARDIAN_CAUGHT, { guardian, destination: 'party', starter: true });
      save();
      return guardian;
    },
    async start(params) {
      const res = await Scenes.pushAsync('battle', params || {});
      return res || 'fled';
    },
  });
}
