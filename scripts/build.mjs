import { readFile, writeFile } from 'node:fs/promises';
import { resolve, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = async p => (await readFile(resolve(root, p), 'utf8')).replace(/\r\n/g, '\n');
const asset = async name => `data:image/webp;base64,${(await readFile(resolve(root, 'assets', name))).toString('base64')}`;
const names = JSON.parse(await read('scripts/module-manifest.json')).map(m => m.id);
const modules = new Map();
const font = `data:font/ttf;base64,${(await readFile(resolve(root, 'assets/fonts/Nunito.ttf'))).toString('base64')}`;
const specifier = /(['"])(\.\.?\/[^'"]*\.js)\1/g;
for (const id of names) {
  let code = await read(`src/${id}`);
  code = code.replace('__HEARTH_FONT__', font);
  for (const dir of ['down', 'up', 'left']) code = code.replace(`__HERO_${dir.toUpperCase()}_ART__`, await asset(`illustrated/hero-${dir}.webp`));
  for (const dir of ['down', 'up', 'left', 'right']) code = code.replace(`__GRAN_${dir.toUpperCase()}_ART__`, await asset(`illustrated/gran-${dir}.webp`));
  code = code.replace('__GRAN_STORY_ART__', await asset('gran-willow.webp'));
  code = code.replace('__MAYOR_STORY_ART__', await asset('mayor-bramble.webp'));
  code = code.replace('__RIVAL_STORY_ART__', await asset('ash-north.webp'));
  code = code.replace('__COTTAGE_STORY_ART__', await asset('hearth-conversation.webp'));
  code = code.replace('__VILLAGE_STORY_ART__', await asset('hearth-valley.webp'));
  code = code.replace('__BATTLE_ART__', await asset('illustrated/woodland-battle.webp'));
  code = code.replace('__OAK_ART__', await asset('illustrated/oak.webp'));
  code = code.replace('__LEAFOWL_FRONT_ART__', await asset('leafowl-front.webp'));
  code = code.replace('__LEAFOWL_BACK_ART__', await asset('leafowl-back.webp'));
  code = code.replace('__AQUARABBIT_FRONT_ART__', await asset('aquarabbit-front.webp'));
  code = code.replace('__AQUARABBIT_BACK_ART__', await asset('aquarabbit-back.webp'));
  code = code.replace('__EMBERCUB_FRONT_ART__', await asset('embercub-front.webp'));
  code = code.replace('__EMBERCUB_BACK_ART__', await asset('embercub-back.webp'));
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
const shell = (await read('src/shell.html')).replace('__TITLE_ART__', await asset('hearth-valley.webp'));
const bundle = JSON.stringify(sorted).replace(/<\/script/gi, '<\\/script');
// A replacement callback preserves literal $&, $` and $' in source code.
const output = shell.replace('__MODULE_BUNDLE__', () => bundle);
await writeFile(resolve(root, 'index.html'), output);
console.log(`Built ${sorted.length} modules into standalone index.html (${Math.round(Buffer.byteLength(output)/1024)} KB).`);
