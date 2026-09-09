import { readFile, writeFile } from 'node:fs/promises';
import { resolve, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = async p => (await readFile(resolve(root, p), 'utf8')).replace(/\r\n/g, '\n');
const asset = async name => `data:image/webp;base64,${(await readFile(resolve(root, 'assets', name))).toString('base64')}`;
const names = JSON.parse(await read('scripts/module-manifest.json')).map(m => m.id);
const modules = new Map();
const specifier = /(['"])(\.\.?\/[^'"]*\.js)\1/g;
for (const id of names) {
  let code = await read(`src/${id}`);
  code = code.replace('__BATTLE_ART__', await asset('forest-clearing.webp'));
  code = code.replace('__OAK_ART__', await asset('forest-oak.webp'));
  code = code.replace('__LEAFOWL_FRONT_ART__', await asset('leafowl-front.webp'));
  code = code.replace('__LEAFOWL_BACK_ART__', await asset('leafowl-back.webp'));
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
