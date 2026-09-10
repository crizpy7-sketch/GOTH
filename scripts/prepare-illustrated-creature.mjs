import {createRequire} from 'node:module';
import {copyFile,mkdir,writeFile} from 'node:fs/promises';

// Converts an approved four-pose source sheet into the existing atlas contract.
// Cropping, proportional resizing and lossless encoding preserve generated art.
const require=createRequire(process.env.GOTH_NODE_MODULES ? process.env.GOTH_NODE_MODULES+'/' : import.meta.url);
const sharp=require('sharp');
const sizes={embercub:244,leafowl:228,aquarabbit:252,voltkit:236,florabloom:240,wisplet:216,terranox:232,grovewing:268,drakindle:260};
const [source,id]=process.argv.slice(2);
if(!source || !(id in sizes)) throw new Error('Pass approved four-pose PNG and an opening creature ID.');
const meta=await sharp(source).metadata(),stats=await sharp(source).stats();
if(!meta.hasAlpha || stats.isOpaque) throw new Error('Reject opaque sheets and painted checkerboard backgrounds.');
const rgba=await sharp(source).ensureAlpha().raw().toBuffer();
const alphaAt=(x,y)=>rgba[(y*meta.width+x)*4+3];
// Generated poses can sit a few pixels beyond an exact cell midpoint. Find
// the transparent gutter before cropping so a tail or crown is not sliced.
function gutter(length,count) {
  let best=Math.floor(length/2),score=Infinity;
  for(let i=Math.floor(length*.4);i<Math.ceil(length*.6);i++) {
    const value=count(i)*10000+Math.abs(i-length/2);
    if(value<score) {best=i;score=value;}
  }
  return best;
}
const splitX=gutter(meta.width,x=>{let n=0;for(let y=0;y<meta.height;y++)if(alphaAt(x,y)>64)n++;return n;});
const splitY=[0,1].map(column=>gutter(meta.height,y=>{
  let n=0;for(let x=column?splitX:0;x<(column?meta.width:splitX);x++)if(alphaAt(x,y)>64)n++;return n;
}));
const frames=[];
for(let row=0;row<2;row++) for(let column=0;column<2;column++) {
  const left=column?splitX:0,top=row?splitY[column]:0;
  const width=(column?meta.width:splitX)-left,height=(row?meta.height:splitY[column])-top;
  const crop=await sharp(source).extract({left,top,width,height}).png().toBuffer();
  const trimmed=await sharp(crop).trim({threshold:10}).png().toBuffer();
  const m=await sharp(trimmed).metadata();
  if(m.width<32 || m.height<32) throw new Error('Missing creature pose.');
  frames.push({data:trimmed,width:m.width,height:m.height});
}
await mkdir('assets/illustrated',{recursive:true});
await copyFile(source,`assets/illustrated/${id}-source.png`);
const battleScale=Math.min(288/Math.max(frames[0].width,frames[1].width),sizes[id]/Math.max(frames[0].height,frames[1].height));
const companionScale=Math.min(60/Math.max(frames[2].width,frames[3].width),58/Math.max(frames[2].height,frames[3].height));
const placements=[];
for(let i=0;i<4;i++) {
  const f=frames[i],scale=i<2?battleScale:companionScale;
  const width=Math.max(1,Math.round(f.width*scale)),height=Math.max(1,Math.round(f.height*scale));
  const size=i<2?320:64,baseline=i<2?(id==='wisplet'?280:296):62;
  const left=Math.floor((size-width)/2),top=baseline-height;
  const resized=await sharp(f.data).resize(width,height).png().toBuffer();
  const packed=await sharp({create:{width:size,height:size,channels:4,background:'#00000000'}}).composite([{input:resized,left,top}]).png().toBuffer();
  placements.push({width,height,left,top});
  if(i<2) await sharp(packed).webp({lossless:true}).toFile(`assets/illustrated/${id}-${i===0?'front':'back'}.webp`);
  else f.packed=packed;
}
await sharp({create:{width:128,height:64,channels:4,background:'#00000000'}}).composite([
  {input:frames[2].packed,left:0,top:0},{input:frames[3].packed,left:64,top:0}
]).webp({lossless:true}).toFile(`assets/illustrated/${id}-ow.webp`);
await writeFile(`assets/illustrated/${id}-manifest.json`,JSON.stringify({id,source:`${id}-source.png`,pixelRatio:4,smooth:true,
  battle:{logicalWidth:80,logicalHeight:80,frameWidth:320,frameHeight:320,views:['front','back'],scale:battleScale},
  overworld:{logicalWidth:16,logicalHeight:16,frameWidth:64,frameHeight:64,frames:2,scale:companionScale},
  placements,sourceGutters:{x:splitX,y:splitY},alphaVerified:true},null,2)+'\n');
console.log(`Prepared ${id}: front/back 320x320 and two companion frames at 64x64, real alpha.`);
