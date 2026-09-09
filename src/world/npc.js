// NPCs: grid-aligned like the player, with a small wander radius, a notice reaction,
// and dialogue that knows how far along the village is.

import { DIR_VEC, opposite, dirTowards, TILE } from '../core/util.js';
import { Atlas } from '../art/atlas.js';
import { R } from '../core/renderer.js';
import { UIx, Hooks } from '../core/bridge.js';
import { S, flag, setFlag, save } from '../state.js';
import { makeRng } from '../core/rng.js';
import { Audio } from '../core/audio.js';
import { Economy } from '../village/economy.js';

const WALK_FRAMES = 14;          // NPCs amble; the player is quicker
const rng = makeRng(20260730);

export class Npc {
  constructor(def, map) {
    this.def = def;
    this.id = def.id || `${def.who}@${def.x},${def.y}`;
    this.who = def.who;
    this.home = { x: def.x, y: def.y };
    this.x = def.x; this.y = def.y;
    this.px = def.x * TILE; this.py = def.y * TILE;
    this.dir = def.dir || 'down';
    this.wander = def.wander ?? 0;
    this.map = map;
    this.frame = 0; this.anim = 0;
    this.moving = false; this.t = 0;
    this.fx = this.x; this.fy = this.y;
    this.cool = 40 + Math.floor(rng.float() * 120);
    this.noticed = 0;
    this.talking = false;
    this.playerNearby = false;
    this.playerAdjacent = false;
  }

  get tile() { return { x: this.x, y: this.y }; }

  face(dir) { if (dir) this.dir = dir; }

  canStep(nx, ny, blocked) {
    if (this.map.solid(nx, ny)) return false;
    if (Math.abs(nx - this.home.x) > this.wander || Math.abs(ny - this.home.y) > this.wander) return false;
    return !blocked(nx, ny);
  }

  update(blocked) {
    if (this.moving) {
      this.t++;
      const k = Math.min(1, this.t / WALK_FRAMES);
      this.px = (this.fx + (this.x - this.fx) * k) * TILE;
      this.py = (this.fy + (this.y - this.fy) * k) * TILE;
      this.anim++;
      if (k >= 1) { this.moving = false; this.fx = this.x; this.fy = this.y; }
      return;
    }
    this.px = this.x * TILE; this.py = this.y * TILE;
    if (this.noticed > 0) this.noticed--;
    // Give someone standing beside us time to speak before wandering away.
    if (this.talking || this.playerAdjacent || this.wander <= 0) return;
    if (--this.cool > 0) return;
    this.cool = 70 + Math.floor(rng.float() * 160);

    const dir = ['up', 'down', 'left', 'right'][Math.floor(rng.float() * 4)];
    const v = DIR_VEC[dir];
    const nx = this.x + v.x, ny = this.y + v.y;
    this.dir = dir;
    if (this.canStep(nx, ny, blocked)) {
      this.fx = this.x; this.fy = this.y;
      this.x = nx; this.y = ny;
      this.moving = true; this.t = 0;
    }
  }

  notice(playerX, playerY) {
    const distance = Math.abs(playerX - this.x) + Math.abs(playerY - this.y);
    const nearby = distance <= 2;
    this.playerAdjacent = distance <= 1;
    if (nearby && !this.playerNearby) this.noticed = 50;
    this.playerNearby = nearby;
  }

  draw(cam) {
    const name = `c.${this.who}.${this.dir}`;
    const img = Atlas.tryGet(name, this.moving ? (Math.floor(this.anim / 7) % 4) : 0);
    const sx = Math.round(this.px - cam.x);
    const sy = Math.round(this.py - cam.y) - 8;   // 16x24 sprite stands on its tile
    const shadow = Atlas.tryGet('fx.shadow');
    if (shadow) R.blit(shadow, sx, sy + 19, { alpha: 0.5 });
    if (img) R.blit(img, sx, sy);
    else R.rect(sx + 2, sy + 4, 12, 20, '#ff00ff');
    if (this.noticed > 30) {
      const ex = Atlas.tryGet('fx.exclaim');
      if (ex) R.blit(ex, sx, sy - 12);
      else R.text('!', sx + 6, sy - 10, { color: '#ffe066' });
    }
  }

  async interact() {
    if (this.talking) return;
    this.talking = true;
    const dir = dirTowards(this.x, this.y, S.player.x, S.player.y);
    if (dir) this.face(dir);
    Audio.sfx('confirm');
    try {
      if (!await importantTalk(this)) {
        const lines = linesFor(this);
        for (const l of lines) await UIx.say(l.text, { speaker: l.speaker ?? nameOf(this.who) });
        if (this.who === 'peddler') await visitCobb();
      }
      try { Hooks.missions.note('talk', { who: this.who }); } catch {}
    } finally {
      this.talking = false;
    }
  }
}

export const NAMES = {
  hero: 'You', mayor: 'Mayor Bramble', gran: 'Gran Willow', kid: 'Pip',
  farmer: 'Odell', smith: 'Hesta', baker: 'Marrow', fisher: 'Quill',
  ranger: 'Sable', weaver: 'Nettle', peddler: 'Cobb', twin: 'Wick',
  rival: 'Ash-of-the-North',
};
export const nameOf = who => NAMES[who] || 'Villager';

const STARTER_CHOICES = [
  { id: 'embercub', label: 'Embercub', detail: 'A brave little warmth.' },
  { id: 'leafowl', label: 'Leafowl', detail: 'A quiet, watchful friend.' },
  { id: 'aquarabbit', label: 'Aquarabbit', detail: 'A bright, curious spirit.' },
];

// Story flags live in the existing save's extensible flags map. Older saves get
// one meaningful reunion without replaying gifts or changing their progress.
async function importantTalk(npc) {
  const speaker = nameOf(npc.who);
  if (npc.who === 'gran') {
    const hasGuardian = S.party.length > 0 || S.box.length > 0;
    if (!flag('gotStarter') && hasGuardian) { setFlag('gotStarter'); save(); }
    if (!flag('gotStarter')) {
      let welcome = null;
      const result = await UIx.story({
        title: 'A place beside the fire', speaker, portrait: 'gran', setting: 'cottage',
        lines: [
          'There you are. I kept the kettle warm. Some things are worth waiting for.',
          'These three have been watching the door all morning. Guardians are neighbours, mind. Not pets.',
          'The road feels different when someone walks it with you. Whose company feels like home?',
        ],
        choices: STARTER_CHOICES,
        async onChoose(index) {
          if (welcome) return welcome;
          const chosen = STARTER_CHOICES[index];
          if (!chosen || flag('gotStarter')) return { lines: ['Take your time, dear. There is no hurry.'] };
          const guardian = Hooks.battle.grantStarter(chosen.id);
          if (!guardian) return { lines: ['Rest here a moment. We will try again when you are ready.'] };
          setFlag('gotStarter');
          save();
          welcome = {
            guardian: chosen.id,
            lines: [
              `${chosen.label} settles beside you. There now. You have found each other.`,
              'Look after one another out there. And remember: this hearth will always have room for you both.',
            ],
          };
          return welcome;
        },
      });
      if (result?.completed && flag('gotStarter')) { setFlag('story.granHearth'); save(); }
      return true;
    }
    if (!flag('story.granHearth')) {
      await finishStory('story.granHearth', {
        title: 'Room for you both', speaker, portrait: 'gran', setting: 'cottage',
        lines: [
          'I know those footsteps. Come warm yourself a moment.',
          'When you first left, I worried about the road. Now I see you bringing a little warmth back with you.',
          'A hearth is only a fire until someone sits at it. I am glad you came home.',
        ],
      });
      return true;
    }
  }
  if (npc.who === 'mayor') {
    if (!flag('story.mayorWelcome')) {
      await finishStory('story.mayorWelcome', {
        title: 'A village worth coming home to', speaker, portrait: 'mayor', setting: 'village',
        lines: flag('metMayor') ? [
          'I used to walk this plaza counting the empty windows.',
          'Lately I catch myself wondering who might live behind them. You helped me remember how to do that.',
          'Every small thing you build gives someone another reason to come home.',
        ] : [
          'You must be the one Gran wrote about. Welcome to Emberhollow.',
          'Some evenings I keep the plaza lamps lit, even when there is no one left outside. A village should look like it is waiting for you.',
          'Stand beside the Hearthstone when you can. Help us give people a reason to come home.',
        ],
      }, 'metMayor');
      return true;
    }
    if (Hooks.village.level() >= 4 && !flag('story.mayorRenewal')) {
      await finishStory('story.mayorRenewal', {
        title: 'The windows are warm again', speaker, portrait: 'mayor', setting: 'village',
        lines: [
          'There was laughter in the plaza this morning. I stopped to listen. Could not help myself.',
          'People are moving back. Whole families. The windows I used to count are lighting up again.',
          'You gave this place more than buildings. You gave us something to look forward to. Thank you.',
        ],
      });
      return true;
    }
  }
  if (npc.who === 'rival' && !flag('metRival')) {
    await finishStory('story.rivalMeeting', {
      title: 'Someone worth staying for', speaker, portrait: 'rival', setting: 'forest',
      lines: [
        'So you are the one taking the long way round.',
        'I came south to see whether Emberhollow was worth saving. Empty houses are easy to leave behind.',
        S.party.length
          ? 'But your Guardian keeps looking back to see if you are coming. Perhaps I have been looking at the wrong things.'
          : 'Yet you walked all this way, and you still mean to go back. Perhaps I have been looking at the wrong things.',
        'Show me something worth staying for. I will be watching.',
      ],
    }, 'metRival');
    return true;
  }
  return false;
}

async function finishStory(storyFlag, options, progressFlag) {
  const result = await UIx.story(options);
  if (!result?.completed) return;
  if (progressFlag && !flag(progressFlag)) setFlag(progressFlag);
  setFlag(storyFlag);
  save();
}

// Dialogue reacts to village level and story flags so the world notices your progress.
function linesFor(npc) {
  const lv = (() => { try { return Hooks.village.level(); } catch { return 1; } })();
  const party = S.party.length;
  const T = t => ({ text: t });

  switch (npc.who) {
    case 'mayor':
      if (!flag('metMayor')) return [
        T('You must be the one Gran wrote about. Welcome to Emberhollow.'),
        T('We are a small place. Half our roofs are older than I am, and the other half are only ideas.'),
        T('Stand by the Hearthstone when you have a moment. It remembers every good thing this village does.'),
      ];
      if (lv <= 1) return [T('The Hearthstone is quiet, but it is listening. Build something and it will warm.')];
      if (lv < 4) return [T(`Level ${lv} already. I walked past the plaza this morning and did not recognise it.`)];
      return [T('People are moving back. Whole families. I did not think I would see that again.')];

    case 'gran':
      if (!flag('gotStarter')) return [
        T('There you are. I kept the kettle warm and three young Guardians waiting.'),
        T('The Guardians are not pets, mind. They are neighbours who happen to have paws.'),
        T('Choose the one whose company feels most like home.'),
      ];
      return [
        T(party ? 'Your Guardian looks well fed. Good. That is half of it.' : 'Go on, take one of mine. The house is too quiet.'),
        T('A hearth is only a fire until someone sits at it.'),
      ];

    case 'kid': return [
      T('I saw a Leafowl in the tall grass and it looked RIGHT at me.'),
      T('If you go in the grass, walk slow. They do not like loud feet.'),
    ];
    case 'smith': return [
      T('Bring me anything bent and I will make it straight. Bring me anything straight and I will make it better.'),
      T(lv >= 3 ? 'The workshop is busy again. I have not been busy in years.' : 'Quiet week. Quiet year, really.'),
    ];
    case 'baker': return [
      T('Bread is the only thing in this village older than the Mayor.'),
      T('Come by after your family has cooked together. I want to hear what you made.'),
    ];
    case 'farmer': return [
      T('Rain came late. The beds forgave me anyway.'),
      T('A Terranox got into the carrots. I have decided to call that fertiliser.'),
    ];
    case 'fisher': return [
      T('The river runs west of here, past the old bridge.'),
      T('Stillwater Reach. Good water. Better silence.'),
    ];
    case 'weaver': return [
      T('Every banner over the plaza came off this loom.'),
      T(lv >= 4 ? 'I am running out of plaza to hang them on.' : 'One day there will be enough village to decorate.'),
    ];
    case 'ranger': return [
      T('Tall grass means Guardians. Step in and something will notice you.'),
      T('Weaken it first, then offer a charm. Never the other way round.'),
    ];
    case 'peddler': return [
      T('Charms, salves, and unreliable directions. Two of the three are for sale.'),
    ];
    case 'twin': return [
      T('My brother says he saw the Hearthstone glow. My brother says a lot of things.'),
    ];
    case 'rival':
      if (!flag('metRival')) return [
        T('So you are the one taking the long way round.'),
        T('I came south to see whether Emberhollow was worth saving. I have not decided.'),
        T('Show me something worth the walk and I will change my mind.'),
      ];
      return [T('Still building. Good. I will keep watching.')];
    default: return [T('Lovely day for it.')];
  }
}

// Cobb offers the same supplies and prices as the village market, so an early
// expedition can restock before the player has built a market of their own.
const COBB_GOODS = [
  { id: 'charm', name: 'Woven Charm', coins: 12 },
  { id: 'salve', name: 'Warm Salve', coins: 18 },
];

async function visitCobb() {
  const speaker = nameOf('peddler');
  while (true) {
    const choices = COBB_GOODS.map(item =>
      `${item.name} — ${item.coins} coins  (${S.bag[item.id] || 0} in bag)`);
    const pick = await UIx.ask(`A little something for the road?\nYou have ${S.coins} coins.`,
      [...choices, 'Leave the stall'], { speaker });
    const item = COBB_GOODS[pick];
    if (!item) return;
    if (!Economy.spend({ coins: item.coins }, `bought ${item.name} from Cobb`)) {
      Audio.sfx('deny');
      await UIx.say(`${item.name} costs ${item.coins} coins. You need ${Math.max(0, item.coins - S.coins)} more.`, { speaker });
      continue;
    }
    S.bag[item.id] = (S.bag[item.id] || 0) + 1;
    const saved = save();
    Audio.sfx('chime');
    await UIx.say(`${item.name}, wrapped and ready. ${S.coins} coins left.`
      + (saved ? '' : '\nYour purchase could not be saved on this device.'), { speaker });
  }
}

export function makeNpcs(map) {
  return (map.npcs || []).map(d => new Npc(d, map));
}
