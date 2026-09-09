import {createRequire} from 'node:module';
import {copyFile} from 'node:fs/promises';
const require = createRequire(process.env.GOTH_NODE_MODULES ? process.env.GOTH_NODE_MODULES + '/' : import.meta.url);
const sharp = require('sharp');
const source = process.argv[2], name = process.argv[3];
if (!source || !name) throw new Error('Pass source path and asset name.');
await copyFile(source, `assets/${name}.png`);
const metadata = await sharp(source).metadata();
if (!metadata.hasAlpha) throw new Error('World sprite requires generated transparency.');
await sharp(source).trim().resize(144,192,{fit:'contain',background:'#00000000',kernel:'nearest'})
  .webp({lossless:true}).toFile(`assets/${name}.webp`);
console.log(`${name}: preserved generated alpha; 144x192 WebP`);
