import {createRequire} from 'node:module';
import {copyFile} from 'node:fs/promises';
const require=createRequire(process.env.GOTH_NODE_MODULES ? process.env.GOTH_NODE_MODULES+'/' : import.meta.url);
const sharp=require('sharp');
const [source,name,mode='portrait']=process.argv.slice(2);
if (!source || !/^[a-z][a-z0-9-]*$/.test(name || '') || !['portrait','backdrop'].includes(mode)) {
  throw new Error('Pass a source PNG, asset name, and portrait or backdrop.');
}
const metadata=await sharp(source).metadata();
if (mode==='portrait' && !metadata.hasAlpha) throw new Error('Portrait must retain generated transparency.');
await copyFile(source,`assets/${name}.png`);
let art=sharp(source);
if (mode==='portrait') art=art.trim().resize(336,384,{fit:'contain',background:'#00000000',kernel:'nearest'}).webp({lossless:true});
else art=art.resize(640,360,{fit:'cover',kernel:'nearest'}).webp({quality:88});
await art.toFile(`assets/${name}.webp`);
console.log(`${name}: ${mode==='portrait'?'336x384 transparent portrait':'640x360 story backdrop'}`);
