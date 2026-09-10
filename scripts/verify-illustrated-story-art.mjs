import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(process.env.GOTH_NODE_MODULES ? process.env.GOTH_NODE_MODULES+'/' : import.meta.url);
const sharp=require('sharp');
const results=[],parts=[];
for(const [i,id] of ['gran','mayor','rival'].entries()) {
  const file=`assets/illustrated/story-${id}.webp`,meta=await sharp(file).metadata(),stats=await sharp(file).stats();
  assert.equal(meta.width,448);assert.equal(meta.height,512);assert.equal(meta.hasAlpha,true);assert.equal(stats.isOpaque,false);
  const raw=await sharp(file).ensureAlpha().raw().toBuffer();
  let clear=0;for(let j=3;j<raw.length;j+=4)if(raw[j]===0)clear++;
  assert(clear>448*512*.1,`${id}: portrait has too little transparent margin`);
  parts.push({input:await sharp(file).resize(224,256).png().toBuffer(),left:i*224,top:0});
  results.push({id,width:448,height:512,clearPixels:clear});
}
for(const id of ['cottage-scene','valley-scene']) {
  const meta=await sharp(`assets/illustrated/${id}.webp`).metadata();
  assert.equal(meta.width,1280);assert.equal(meta.height,720);
  results.push({id,width:1280,height:720});
}
await mkdir('artifacts',{recursive:true});
await sharp({create:{width:672,height:256,channels:4,background:'#637151'}}).composite(parts).png().toFile('artifacts/illustrated-story-art-contact.png');
await writeFile('artifacts/illustrated-story-art-results.json',JSON.stringify({assets:results,errors:[]},null,2)+'\n');
console.log('Three transparent portraits and two conversation backgrounds passed asset checks.');
