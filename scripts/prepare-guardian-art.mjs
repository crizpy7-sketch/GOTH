import {createRequire} from 'node:module';
import {copyFile} from 'node:fs/promises';
const require = createRequire(process.env.GOTH_NODE_MODULES ? process.env.GOTH_NODE_MODULES + '/' : import.meta.url);
const sharp = require('sharp');
const source = process.argv[2], name = process.argv[3];
if (!source || !name) throw new Error('Pass source path and Guardian name.');
await copyFile(source, `assets/${name}-poses.png`);
const m = await sharp(source).metadata();
if (!m.hasAlpha) throw new Error('Guardian sheet must preserve generated transparency.');
const cell = Math.floor(m.width / 2);
for (const [i, pose] of ['front','back'].entries()) {
  // Each authored pose is fitted to the same foot baseline and game footprint.
  const cropped = await sharp(source).extract({left:i*cell,top:0,width:cell,height:m.height}).toBuffer();
  const sprite = await sharp(cropped).trim().resize(124,124,{fit:'contain',background:'#00000000',kernel:'nearest'}).toBuffer();
  await sharp({create:{width:160,height:160,channels:4,background:'#00000000'}})
    .composite([{input:sprite,left:18,top:20}]).webp({lossless:true}).toFile(`assets/${name}-${pose}.webp`);
}
console.log(`${name}: two 160x160 transparent battle poses`);
