import {createRequire} from 'node:module';
import {copyFile,mkdir} from 'node:fs/promises';
const require=createRequire(process.env.GOTH_NODE_MODULES ? process.env.GOTH_NODE_MODULES+'/' : import.meta.url);
const sharp=require('sharp');
const [source,name,widthText,heightText,mode='object']=process.argv.slice(2);
const width=Number(widthText),height=Number(heightText);
if (!source || !/^[a-z][a-z0-9-]*$/.test(name||'') || !Number.isInteger(width) || !Number.isInteger(height) || width<1 || height<1 || !['object','background'].includes(mode)) {
  throw new Error('Pass source, asset name, logical width and height, and object or background.');
}
if (mode==='object') {
  const meta=await sharp(source).metadata(),stats=await sharp(source).stats();
  if (!meta.hasAlpha || stats.isOpaque) throw new Error('Object must have real transparent alpha.');
}
await mkdir('assets/illustrated',{recursive:true});
await copyFile(source,`assets/illustrated/${name}-source.png`);
let pipeline=sharp(source);
if(mode==='object') pipeline=pipeline.trim().resize(width*4,height*4,{fit:'contain',position:'bottom',background:'#00000000'}).webp({lossless:true});
else pipeline=pipeline.resize(width*4,height*4,{fit:'cover'}).webp({quality:88});
await pipeline.toFile(`assets/illustrated/${name}.webp`);
console.log(`Prepared ${name}: ${width*4}x${height*4}, ${mode}`);
