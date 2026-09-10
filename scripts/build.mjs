import { readFile, writeFile, access } from 'node:fs/promises';
import { resolve, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHARS, BUILDINGS } from '../src/art/names.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = async p => (await readFile(resolve(root, p), 'utf8')).replace(/\r\n/g, '\n');
const asset = async name => `data:image/webp;base64,${(await readFile(resolve(root, 'assets', name))).toString('base64')}`;
const names = JSON.parse(await read('scripts/module-manifest.json')).map(m => m.id);
const modules = new Map();
const font = `data:font/ttf;base64,${(await readFile(resolve(root, 'assets/fonts/Nunito.ttf'))).toString('base64')}`;
const illustrated = {};
async function include(name,file,w,h,frames=1,flipX=false) {
  await access(resolve(root,'assets/illustrated',file));
  illustrated[name]={src:await asset('illustrated/'+file),w,h,frames,flipX};
}
for(const who of CHARS) for(const dir of ['down','up','left','right'])
  await include(`c.${who}.${dir}`,`${who}-${who==='hero'&&dir==='right'?'left':dir}.webp`,16,24,4,who==='hero'&&dir==='right');
for(const id of ['embercub','leafowl','aquarabbit','voltkit','florabloom','wisplet','terranox','grovewing','drakindle']) {
  for(const pose of ['front','back'])await include(`g.${id}.${pose}`,`${id}-${pose}.webp`,80,80);
  await include(`g.${id}.ow`,`${id}-ow.webp`,16,16,2);
}
for(const b of BUILDINGS)for(let tier=1;tier<=b.tiers;tier++)await include(`b.${b.id}.t${tier}`,`b-${b.id}-t${tier}.webp`,b.w*16,(b.h+b.overhang)*16);
for(const id of ['cottage','infirmary','workshop'])await include(`b.${id}.authored`,`b-${id}-authored.webp`,id==='workshop'?80:64,80);
await include('t.pine.illustrated','pine.webp',40,64);
for(const who of ['gran','mayor','rival'])await include('story.'+who,`story-${who}.webp`,112,128);
await include('scene.story.cottage','cottage-scene.webp',320,180);
await include('scene.story.village','valley-scene.webp',320,180);
for(const id of ['grass','path'])await include('material.'+id,id+'-texture.webp',16,16);
const propNames={table:['t.table','t.table.set'],chair:['t.chair.l','t.chair.r','t.chair.u','t.chair.d'],bookcase:['t.shelf','t.shelf.books','t.cabinet'],hearth:['illustrated.prop.hearth'],plant:['t.plant.pot'],chest:['t.chest'],basket:['t.basket'],clock:['t.clock'],bush:['t.bush','t.bush.berry'],rock:['t.rock.small','t.rock.big'],sign:['t.sign','t.signpost'],lamp:['t.lamp'],well:['t.well'],bench:['t.bench'],flowerpot:['t.flowerpot','t.planter'],crate:['t.crate']};
for(const [id,names] of Object.entries(propNames))for(const name of names)await include(name,`prop-${id==='lamp'?'lantern':id}.webp`,16,16);
const specifier = /(['"])(\.\.?\/[^'"]*\.js)\1/g;
for (const id of names) {
  let code = await read(`src/${id}`);
  code = code.replace('__ILLUSTRATED_ART__', () => JSON.stringify(illustrated));
  code = code.replace('__HEARTH_FONT__', font);
  code = code.replace('__BATTLE_ART__', await asset('illustrated/woodland-battle.webp'));
  code = code.replace('__OAK_ART__', await asset('illustrated/oak.webp'));
  const deps = {};
  for (const match of code.matchAll(specifier)) {
    const target = posix.normalize(posix.join(posix.dirname(id), match[2]));
    if (!names.includes(target)) throw new Error(`${id}: unregistered dependency ${target}`);
    deps[match[2]] = target;
  }
  modules.set(id, {id, code, deps});
}
// Sort imports, including lazy feature modules, so every Blob URL exists first.
const sorted = [], seen = new Set(), visiting = new Set();
function visit(id) {
  if (seen.has(id)) return;
  if (visiting.has(id)) throw new Error(`Circular bundle dependency: ${id}`);
  visiting.add(id);
  for (const dep of Object.values(modules.get(id).deps)) visit(dep);
  visiting.delete(id); seen.add(id); sorted.push(modules.get(id));
}
names.forEach(visit);
const titleArt=illustrated['scene.story.village']?.src || await asset('hearth-valley.webp');
const shell = (await read('src/shell.html')).replace('__TITLE_ART__', titleArt);
const bundle = JSON.stringify(sorted).replace(/<\/script/gi, '<\\/script');
// A replacement callback preserves literal $&, $` and $' in source code.
const output = shell.replace('__MODULE_BUNDLE__', () => bundle);
await writeFile(resolve(root, 'index.html'), output);
console.log(`Built ${sorted.length} modules into standalone index.html (${Math.round(Buffer.byteLength(output)/1024)} KB).`);
