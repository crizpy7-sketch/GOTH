// Map authoring legend: one character per tile.
//
// Maps are written as arrays of equal-length strings, so a map is readable as a map
// in the source. Everything expensive — autotile edge masks, tree canopy expansion,
// solidity — is derived at load time by map.js, never authored by hand.
//
// Fields
//   g      ground tile name (LAYER.GROUND)
//   fam    autotile family; the ground name becomes `t.<fam>.m<mask>`
//   mid    tile drawn on LAYER.MID (over ground, under the player)
//   over   tile drawn on LAYER.OVER (above the player — canopies, roofs)
//   solid  blocks movement
//   tag    semantic marker read by other systems ('hearth', 'door', 'sign', …)
//   grass  triggers wild-encounter checks and the rustle effect
//   ledge  hop-down direction
//   tree   2x2 canopy anchor (top-left); pine is 1x2
//   water  swimmable/fishable surface

const G = 't.grass';

export const LEGEND = {
  // --- open ground ---
  '.': { g: G },
  ',': { g: G, mid: 't.grass.tuft' },
  '`': { g: G, mid: 't.grass.pebble' },
  '*': { g: G, mid: 't.grass.flower' },
  '%': { g: G, mid: 't.grass.flower2' },
  '"': { g: G, mid: 't.tallgrass', grass: true },
  ';': { g: G, mid: 't.leaves' },

  // --- autotiled families ---
  'p': { g: 't.path', fam: 'path' },
  '(': { g: 't.trail', fam: 'trail' },
  'g': { g: 't.gravel' },
  'z': { g: 't.plaza' },
  'k': { g: 't.cobble' },
  's': { g: 't.sand', fam: 'sand' },
  'w': { g: 't.water', fam: 'water', solid: true, water: true },
  'W': { g: 't.deepwater', fam: 'deepwater', solid: true, water: true },
  'n': { g: 't.snow', fam: 'snow' },
  'f': { g: 't.floor', fam: 'floor' },

  // --- cliffs & walls ---
  'c': { g: 't.cliff.face', solid: true },
  'C': { g: 't.cliff.top' },
  '#': { g: G, mid: 't.wall.stone', solid: true },
  'H': { g: G, mid: 't.hedge', solid: true },
  '<': { g: 't.stair.up' },
  '>': { g: 't.stair.down' },
  'v': { g: G, ledge: 'down' },

  // --- water dressing ---
  '~': { g: 't.water', fam: 'water', mid: 't.reed', solid: true, water: true },
  'q': { g: 't.water', fam: 'water', mid: 't.lilypad', solid: true, water: true },
  'j': { g: 't.water', fam: 'water', mid: 't.cattail', solid: true, water: true },
  '=': { g: 't.bridge.h' },
  ':': { g: 't.bridge.v' },

  // --- fences & structure ---
  '-': { g: G, mid: 't.fence.h', solid: true },
  '|': { g: G, mid: 't.fence.v', solid: true },
  '+': { g: G, mid: 't.fence.post', solid: true },
  'A': { g: 't.path', fam: 'path', mid: 't.fence.gate' },

  // --- trees & flora (2x2 unless noted) ---
  'T': { g: G, tree: 'oak' },
  'Y': { g: G, tree: 'pine' },
  'b': { g: G, mid: 't.bush', solid: true },
  'B': { g: G, mid: 't.bush.berry', solid: true },
  'o': { g: G, mid: 't.rock.small', solid: true },
  'O': { g: G, mid: 't.rock.big', solid: true },
  'u': { g: G, mid: 't.stump', solid: true },
  'L': { g: G, mid: 't.log', solid: true },
  'm': { g: G, mid: 't.mushroom' },

  // --- props ---
  'i': { g: G, mid: 't.sign', solid: true, tag: 'sign' },
  'I': { g: 't.path', fam: 'path', mid: 't.signpost', solid: true, tag: 'sign' },
  'l': { g: 't.path', fam: 'path', mid: 't.lamp', solid: true, tag: 'lamp' },
  'e': { g: G, mid: 't.well', solid: true, tag: 'well' },
  'x': { g: G, mid: 't.crate', solid: true },
  'X': { g: G, mid: 't.barrel', solid: true },
  'h': { g: G, mid: 't.hay', solid: true },
  'K': { g: 't.plaza', mid: 't.bench', solid: true, tag: 'bench' },
  'P': { g: G, mid: 't.planter', solid: true },
  'F': { g: G, mid: 't.flowerpot', solid: true },
  'M': { g: G, mid: 't.mailbox', solid: true, tag: 'mail' },
  'S': { g: G, mid: 't.scarecrow', solid: true },
  'V': { g: G, mid: 't.beehive', solid: true },
  'N': { g: 't.crop.soil', mid: 't.crop.grown' },
  '?': { g: 't.crop.soil', mid: 't.crop.sprout' },

  // --- the village heart: where village.js pins the Hearthstone ---
  '@': { g: 't.plaza', tag: 'hearth' },
  '0': { g: 't.plaza' },

  // --- interiors ---
  '_': { g: 't.floor.wood' },
  '/': { g: 't.floor.wood.a' },
  '\\': { g: 't.floor.tile' },
  'r': { g: 't.floor.rug' },
  '[': { g: 't.iwall.plaster', solid: true },
  ']': { g: 't.iwall.plank', solid: true },
  '^': { g: 't.iwall.top', solid: true },
  'E': { g: 't.iwall.window', solid: true },
  'd': { g: 't.floor.wood', mid: 't.door.wood', tag: 'exit' },
  'D': { g: G, mid: 't.door.arch', tag: 'door' },
  't': { g: 't.floor.wood', mid: 't.table', solid: true },
  'Q': { g: 't.floor.wood', mid: 't.table.set', solid: true },
  '1': { g: 't.floor.wood', mid: 't.chair.d', solid: true },
  '2': { g: 't.floor.wood', mid: 't.chair.u', solid: true },
  '3': { g: 't.floor.wood', mid: 't.chair.l', solid: true },
  '4': { g: 't.floor.wood', mid: 't.chair.r', solid: true },
  '5': { g: 't.floor.wood', mid: 't.bed.head', solid: true },
  '6': { g: 't.floor.wood', mid: 't.bed.foot', solid: true },
  '7': { g: 't.floor.wood', mid: 't.shelf.books', solid: true },
  '8': { g: 't.floor.wood', mid: 't.counter', solid: true },
  '9': { g: 't.floor.wood', mid: 't.stove', solid: true, tag: 'stove' },
  'G': { g: 't.floor.wood', mid: 't.hearth.lit', solid: true, tag: 'hearthfire' },
  'J': { g: 't.floor.wood', mid: 't.cabinet', solid: true },
  'R': { g: 't.floor.wood', mid: 't.plant.pot', solid: true },
  'U': { g: 't.floor.wood', mid: 't.painting', solid: true, tag: 'painting' },
  'Z': { g: 't.floor.wood', mid: 't.chest', solid: true, tag: 'chest' },
  'a': { g: 't.floor.wood', mid: 't.anvil', solid: true, tag: 'anvil' },
  'y': { g: 't.floor.wood', mid: 't.loom', solid: true, tag: 'loom' },
  '!': { g: 't.floor.wood', mid: 't.basket', solid: true },
};

// Unknown characters fall back to plain grass rather than crashing a whole map.
export const cellFor = ch => LEGEND[ch] || LEGEND['.'];
export const isTree = ch => !!LEGEND[ch]?.tree;
