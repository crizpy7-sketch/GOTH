import {createRequire} from 'node:module';
import {copyFile,mkdir,writeFile} from 'node:fs/promises';
import {CHARS} from '../src/art/names.js';
const require=createRequire(process.env.GOTH_NODE_MODULES ? process.env.GOTH_NODE_MODULES+'/' : import.meta.url);
const sharp=require('sharp');
const [source,id]=process.argv.slice(2);
if(!source || !CHARS.includes(id)) throw new Error('Pass a transparent four-by-four sheet and a canonical character ID.');
const metadata=await sharp(source).metadata(),stats=await sharp(source).stats();
if(!metadata.hasAlpha || stats.isOpaque) throw new Error('Reject opaque sprite sheets.');
await mkdir('assets/illustrated',{recursive:true});
await copyFile(source,`assets/illustrated/${id}-source.png`);
const dirs=['down','up','left','right'],raw=[];
for(let row=0;row<4;row++) for(let column=0;column<4;column++) {
  const left=Math.floor(column*metadata.width/4),top=Math.floor(row*metadata.height/4);
  const width=Math.floor((column+1)*metadata.width/4)-left,height=Math.floor((row+1)*metadata.height/4)-top;
  const crop=await sharp(source).extract({left,top,width,height}).png().toBuffer();
  const trimmed=await sharp(crop).trim().png().toBuffer();
  raw.push({data:trimmed,meta:await sharp(trimmed).metadata()});
}
// A shared scale preserves body proportions through wide-stride frames.
const scale=Math.min(62/Math.max(...raw.map(f=>f.meta.width)),94/Math.max(...raw.map(f=>f.meta.height)));
for(let row=0;row<4;row++) {
  const parts=[];
  for(let column=0;column<4;column++) {
    const f=raw[row*4+column],width=Math.max(1,Math.round(f.meta.width*scale)),height=Math.max(1,Math.round(f.meta.height*scale));
    parts.push({input:await sharp(f.data).resize(width,height).png().toBuffer(),left:column*64+Math.floor((64-width)/2),top:96-height});
  }
  await sharp({create:{width:256,height:96,channels:4,background:'#00000000'}}).composite(parts).webp({lossless:true})
    .toFile(`assets/illustrated/${id}-${dirs[row]}.webp`);
}
await writeFile(`assets/illustrated/${id}-manifest.json`,JSON.stringify({id,source:`${id}-source.png`,directions:dirs,frames:4,frameWidth:64,frameHeight:96,logicalWidth:16,logicalHeight:24,sharedScale:scale},null,2)+'\n');
console.log(`Prepared ${id}: four directions, shared scale, real alpha.`);
