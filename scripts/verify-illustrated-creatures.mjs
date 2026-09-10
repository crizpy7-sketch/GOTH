import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const require=createRequire(process.env.GOTH_NODE_MODULES ? process.env.GOTH_NODE_MODULES+'/' : import.meta.url);
const sharp=require('sharp');
const species=['embercub','leafowl','aquarabbit','voltkit','florabloom','terranox','wisplet','grovewing','drakindle'];
const parts=[],results=[];
for(let i=0;i<species.length;i++) {
  const id=species[i],x=(i%3)*320,y=Math.floor(i/3)*240;
  const manifest=JSON.parse(await readFile(`assets/illustrated/${id}-manifest.json`,'utf8'));
  assert.equal(manifest.pixelRatio,4);
  const images={};
  for(const view of ['front','back','ow']) {
    const file=`assets/illustrated/${id}-${view}.webp`,meta=await sharp(file).metadata();
    const [width,height]=view==='ow'?[128,64]:[320,320];
    assert.equal(meta.width,width); assert.equal(meta.height,height); assert.equal(meta.hasAlpha,true);
    const stats=await sharp(file).stats(); assert.equal(stats.isOpaque,false);
    const raw=await sharp(file).ensureAlpha().raw().toBuffer();
    let transparent=0,visible=0;
    for(let p=3;p<raw.length;p+=4) {if(raw[p]===0)transparent++;if(raw[p]>128)visible++;}
    assert(transparent>width*height*.25,`${id} ${view}: transparent margin missing`);
    assert(visible>width*height*.035,`${id} ${view}: empty pose`);
    images[view]={width,height,transparent,visible};
    if(view==='ow') {
      const one=await sharp(file).extract({left:0,top:0,width:64,height:64}).raw().toBuffer();
      const two=await sharp(file).extract({left:64,top:0,width:64,height:64}).raw().toBuffer();
      assert(!one.equals(two),`${id}: companion animation frames identical`);
      parts.push({input:await sharp(file).png().toBuffer(),left:x+96,top:y+167});
    } else parts.push({input:await sharp(file).resize(160,160).png().toBuffer(),left:x+(view==='front'?0:160),top:y});
  }
  results.push({id,images,distinctCompanionFrames:true});
}
await mkdir('artifacts',{recursive:true});
await sharp({create:{width:960,height:720,channels:4,background:'#8caa74'}}).composite(parts).png().toFile('artifacts/illustrated-creatures-contact.png');
await writeFile('artifacts/illustrated-creatures-results.json',JSON.stringify({species:results,errors:[]},null,2)+'\n');
console.log('Nine illustrated species passed: 18 battle cutouts, 18 companion frames, real alpha, dimensions and distinct animation poses.');
