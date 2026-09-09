// CANONICAL ATLAS NAME REGISTRY — foundation-owned, shared contract.
//
// Art paints these names. World, village, battle, and UI reference these names.
// Neither side may invent a name the other doesn't know about: add it here first.
//
// Conventions
//   t.*   16x16 terrain / decor tiles
//   b.*   buildings, sized w*16 x h*16 per BUILDINGS footprint
//   c.*   characters, 16x24, origin bottom-centre, `c.<who>.<dir>` with 4 walk frames
//   g.*   guardians: `g.<id>.front` and `g.<id>.back` at 80x80, `g.<id>.ow` 16x16 x2
//   fx.*  effects
//   ui.*  interface chrome
//
// AUTOTILING: families listed in AUTOTILE register 16 masked variants
//   `t.<fam>.m<0..15>` where bit 1=north, 2=east, 4=south, 8=west is set when the
//   neighbour belongs to the SAME family. m15 is the fully-enclosed centre tile.
//   Art may also register `t.<fam>` as an alias for m15.

export const AUTOTILE = ['path', 'trail', 'water', 'cliff', 'sand', 'snow', 'deepwater', 'floor'];

export const masksFor = fam => Array.from({ length: 16 }, (_, m) => `t.${fam}.m${m}`);

// --- plain tiles -------------------------------------------------------------
export const TILES = [
  // ground cover (grass has 4 quiet variants so large fields never look tiled)
  't.grass', 't.grass.a', 't.grass.b', 't.grass.c',
  't.grass.tuft', 't.grass.flower', 't.grass.flower2', 't.grass.pebble',
  't.tallgrass',            // ANIM 2 — encounter grass, sways
  't.crop.soil', 't.crop.sprout', 't.crop.grown',
  't.leaves',               // autumn leaf litter
  't.puddle',               // ANIM 2
  // walls / cliffs / structure
  't.cliff.face', 't.cliff.top', 't.stair.up', 't.stair.down',
  't.ledge',                // hop-down ledge
  't.bridge.h', 't.bridge.v',
  't.fence.h', 't.fence.v', 't.fence.post', 't.fence.gate',
  't.hedge', 't.wall.stone', 't.wall.plank',
  // props (OVER layer unless noted)
  't.tree.canopy.nw', 't.tree.canopy.ne', 't.tree.canopy.sw', 't.tree.canopy.se',
  't.tree.trunk',
  't.pine.top', 't.pine.mid', 't.pine.trunk',
  't.bush', 't.bush.berry', 't.rock.small', 't.rock.big',
  't.stump', 't.log', 't.mushroom', 't.reed', 't.lilypad', 't.cattail',
  't.sign', 't.signpost', 't.lamp', 't.lamp.lit',
  't.well', 't.crate', 't.barrel', 't.sack', 't.hay',
  't.bench', 't.planter', 't.banner', 't.flowerpot', 't.laundry',
  't.mailbox', 't.cart', 't.anvil', 't.loom', 't.beehive', 't.scarecrow',
  // interiors
  't.floor.wood', 't.floor.wood.a', 't.floor.tile', 't.floor.rug',
  't.iwall.plaster', 't.iwall.plank', 't.iwall.top', 't.iwall.window',
  't.door.wood', 't.door.open', 't.door.arch', 't.stairs.in',
  't.table', 't.table.set', 't.chair.l', 't.chair.r', 't.chair.u', 't.chair.d',
  't.bed.head', 't.bed.foot', 't.shelf', 't.shelf.books', 't.counter',
  't.stove', 't.pot', 't.hearth.lit', 't.hearth.cold',
  't.cabinet', 't.plant.pot', 't.painting', 't.clock', 't.basket', 't.chest',
  // village ground finishing
  't.plaza', 't.plaza.edge', 't.cobble', 't.gravel',
];

export const ANIM_TILES = {
  't.tallgrass': 2, 't.puddle': 2, 't.hearth.lit': 3, 't.lamp.lit': 2,
  't.crop.sprout': 2, 't.banner': 3, 't.laundry': 3, 't.beehive': 2,
};

// --- guardians ---------------------------------------------------------------
// id, display name, type, and the evolution line it belongs to. Battle owns stats
// and learnsets; this is only what ART and UI need to exist.
export const GUARDIANS = [
  { id: 'embercub',   name: 'Embercub',   type: 'ember',  stage: 1, line: 'ember' },
  { id: 'emberlynx',  name: 'Emberlynx',  type: 'ember',  stage: 2, line: 'ember' },
  { id: 'pyrelion',   name: 'Pyrelion',   type: 'ember',  stage: 3, line: 'ember' },
  { id: 'leafowl',    name: 'Leafowl',    type: 'leaf',   stage: 1, line: 'leaf' },
  { id: 'grovewing',  name: 'Grovewing',  type: 'leaf',   stage: 2, line: 'leaf' },
  { id: 'aquarabbit', name: 'Aquarabbit', type: 'tide',   stage: 1, line: 'tide' },
  { id: 'torrentide', name: 'Torrentide', type: 'tide',   stage: 2, line: 'tide' },
  { id: 'terranox',   name: 'Terranox',   type: 'stone',  stage: 1, line: 'stone' },
  { id: 'cragnox',    name: 'Cragnox',    type: 'stone',  stage: 2, line: 'stone' },
  { id: 'wisplet',    name: 'Wisplet',    type: 'gale',   stage: 1, line: 'gale' },
  { id: 'zephyrix',   name: 'Zephyrix',   type: 'gale',   stage: 2, line: 'gale' },
  { id: 'voltkit',    name: 'Voltkit',    type: 'spark',  stage: 1, line: 'spark' },
  { id: 'voltmane',   name: 'Voltmane',   type: 'spark',  stage: 2, line: 'spark' },
  { id: 'florabloom', name: 'Florabloom', type: 'bloom',  stage: 1, line: 'bloom' },
  { id: 'floradiant', name: 'Floradiant', type: 'bloom',  stage: 2, line: 'bloom' },
  { id: 'drakindle',  name: 'Drakindle',  type: 'dusk',   stage: 1, line: 'drake' },
  { id: 'drakember',  name: 'Drakember',  type: 'dusk',   stage: 2, line: 'drake' },
  { id: 'hearthling', name: 'Hearthling', type: 'hearth', stage: 1, line: 'hearth' },
];

export const guardianSprites = () => GUARDIANS.flatMap(g =>
  [`g.${g.id}.front`, `g.${g.id}.back`, `g.${g.id}.ow`]);

// --- characters --------------------------------------------------------------
export const CHARS = [
  'hero',        // the player
  'mayor',       // Mayor Bramble, village leader
  'gran',        // Gran Willow, hearth-keeper
  'kid',         // village child
  'farmer', 'smith', 'baker', 'fisher', 'ranger', 'weaver', 'peddler', 'twin',
  'rival',       // Ash-of-the-North: the recurring rival
];
export const DIRS4 = ['down', 'up', 'left', 'right'];
export const charSprites = () => CHARS.flatMap(c => DIRS4.map(d => `c.${c}.${d}`));
export const CHAR_FRAMES = 4;   // stand, stepL, stand, stepR

// --- buildings ---------------------------------------------------------------
// footprint in tiles [w,h]; `tiers` = how many visual upgrade stages exist.
// Art registers `b.<id>.t1` … `b.<id>.t<tiers>` sized w*16 x (h*16 + overhang*16).
// `overhang` is extra rows drawn ABOVE the footprint (roofs), so a 2x2 cottage with
// overhang 1 is a 32x48 sprite whose bottom 32px sit on the footprint.
export const BUILDINGS = [
  { id: 'hearthstone', name: 'Hearthstone',  w: 3, h: 2, overhang: 2, tiers: 4 },
  { id: 'cottage',     name: 'Cottage',      w: 2, h: 2, overhang: 2, tiers: 3 },
  { id: 'kitchen',     name: 'Kitchen',      w: 2, h: 2, overhang: 2, tiers: 3 },
  { id: 'workshop',    name: 'Workshop',     w: 3, h: 2, overhang: 2, tiers: 3 },
  { id: 'garden',      name: 'Garden Plot',  w: 2, h: 2, overhang: 0, tiers: 3 },
  { id: 'library',     name: 'Story Nook',   w: 3, h: 2, overhang: 2, tiers: 3 },
  { id: 'market',      name: 'Market Stall', w: 3, h: 1, overhang: 1, tiers: 3 },
  { id: 'infirmary',   name: 'Warmhouse',    w: 2, h: 2, overhang: 2, tiers: 3 },
  { id: 'bathhouse',   name: 'Spring House', w: 3, h: 2, overhang: 2, tiers: 2 },
  { id: 'gate',        name: 'Village Gate', w: 3, h: 1, overhang: 2, tiers: 2 },
  { id: 'fountain',    name: 'Fountain',     w: 2, h: 2, overhang: 0, tiers: 2 },
  { id: 'belltower',   name: 'Bell Tower',   w: 2, h: 2, overhang: 2, tiers: 2 },
];
export const buildingSprites = () => BUILDINGS.flatMap(b =>
  Array.from({ length: b.tiers }, (_, i) => `b.${b.id}.t${i + 1}`));
export const buildingById = id => BUILDINGS.find(b => b.id === id);

// --- effects -----------------------------------------------------------------
export const FX = [
  'fx.shadow',            // 16x6 soft ellipse under characters
  'fx.shadow.big',        // 64x12 under battlers
  'fx.grass.rustle',      // ANIM 4 — stepping into tall grass
  'fx.dust',              // ANIM 4 — running
  'fx.splash',            // ANIM 4
  'fx.sparkle',           // ANIM 4 — pickups, upgrades
  'fx.ember',             // ANIM 4
  'fx.leaf',              // ANIM 4
  'fx.bubble',            // ANIM 4
  'fx.rock',              // ANIM 4
  'fx.wind',              // ANIM 4
  'fx.spark',             // ANIM 4
  'fx.petal',             // ANIM 4
  'fx.dusk',              // ANIM 4
  'fx.heart',             // ANIM 4 — bonding
  'fx.impact',            // ANIM 5 — generic hit
  'fx.slash',             // ANIM 4
  'fx.ring',              // ANIM 5 — expanding ring
  'fx.charm',             // ANIM 6 — the bonding charm arc
  'fx.charm.open',        // ANIM 4
  'fx.star',              // ANIM 4 — level up
  'fx.rain',              // ANIM 4 — one droplet
  'fx.snow',              // ANIM 4
  'fx.evolve',            // ANIM 6 — evolution glow
  'fx.exclaim',           // 16x16 — NPC notice
  'fx.emote.happy', 'fx.emote.think', 'fx.emote.sleep',
  'fx.build.frame',       // 16x16 scaffold overlay during construction
  'fx.smoke',             // ANIM 4 — chimney
];
export const ANIM_FX = {
  'fx.grass.rustle': 4, 'fx.dust': 4, 'fx.splash': 4, 'fx.sparkle': 4,
  'fx.ember': 4, 'fx.leaf': 4, 'fx.bubble': 4, 'fx.rock': 4, 'fx.wind': 4,
  'fx.spark': 4, 'fx.petal': 4, 'fx.dusk': 4, 'fx.heart': 4, 'fx.impact': 5,
  'fx.slash': 4, 'fx.ring': 5, 'fx.charm': 6, 'fx.charm.open': 4, 'fx.star': 4,
  'fx.rain': 4, 'fx.snow': 4, 'fx.evolve': 6, 'fx.smoke': 4,
};

// --- ui chrome ---------------------------------------------------------------
export const UI = [
  'ui.frame',        // 24x24 nine-slice source, 8px corners
  'ui.frame.dark',
  'ui.frame.gold',
  'ui.cursor',       // 8x8 pointing hand/arrow
  'ui.cursor.small',
  'ui.tail',         // 8x6 dialogue tail
  'ui.hpbar',        // 48x8 track
  'ui.xpbar',
  'ui.coin', 'ui.hearth', 'ui.heart', 'ui.star',
  'ui.type.ember', 'ui.type.leaf', 'ui.type.tide', 'ui.type.stone',
  'ui.type.gale', 'ui.type.spark', 'ui.type.bloom', 'ui.type.dusk', 'ui.type.hearth',
  'ui.ball', 'ui.ball.empty',
  'ui.arrow.up', 'ui.arrow.down',
  'ui.badge.new', 'ui.badge.lock', 'ui.badge.check',
  'ui.minimap.frame',
];

// Everything art must eventually provide.
export function requiredNames() {
  return [
    ...TILES,
    ...AUTOTILE.flatMap(masksFor),
    ...charSprites(),
    ...guardianSprites(),
    ...buildingSprites(),
    ...FX,
    ...UI,
  ];
}

// Used by the art critic and the regression suite: what's still missing?
export function missingNames(atlas) {
  return requiredNames().filter(n => !atlas.has(n));
}
