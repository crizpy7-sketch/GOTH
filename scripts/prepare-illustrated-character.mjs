import {createRequire} from 'node:module';
import {copyFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {CHARS} from '../src/art/names.js';
const require=createRequire(process.env.GOTH_NODE_MODULES ? process.env.GOTH_NODE_MODULES+'/' : import.meta.url);
const sharp=require('sharp');
const [source,id]=process.argv.slice(2);
const flags=new Set(process.argv.slice(4));
const rows=flags.has('--three-rows') ? 3 : 4;
if(!source || !CHARS.includes(id)) throw new Error('Pass a transparent directional sheet and a canonical character ID.');
const metadata=await sharp(source).metadata(),stats=await sharp(source).stats();
if(!metadata.hasAlpha || stats.isOpaque) throw new Error('Reject opaque sprite sheets.');
await mkdir('assets/illustrated',{recursive:true});
const savedSource=`assets/illustrated/${id}-source.png`;
if(resolve(source)!==resolve(savedSource)) await copyFile(source,savedSource);
const dirs=['down','up','left','right'].slice(0,rows),raw=[];
const cropHeightFlag=[...flags].find(v=>v.startsWith('--crop-height='));
const cropHeight=cropHeightFlag ? Number(cropHeightFlag.split('=')[1]) : metadata.height;
if(!Number.isInteger(cropHeight) || cropHeight<1 || cropHeight>metadata.height) throw new Error('Invalid source crop height.');
const sourceImage=await sharp(source).extract({left:0,top:0,width:metadata.width,height:cropHeight}).png().toBuffer();
// Generated rows are approximately regular, not exact raster cells. Find each
// complete alpha silhouette before slicing so neighboring heads cannot leak
// into a walk frame or make the shared scale unexpectedly tiny.
const {data,info}=await sharp(sourceImage).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const seen=new Uint8Array(info.width*info.height),queue=new Int32Array(seen.length),components=[];
for(let start=0;start<seen.length;start++) {
  if(seen[start] || data[start*4+3]<16) continue;
  let head=0,tail=1,minX=info.width,minY=info.height,maxX=0,maxY=0;
  queue[0]=start; seen[start]=1;
  while(head<tail) {
    const p=queue[head++],x=p%info.width,y=Math.floor(p/info.width);
    minX=Math.min(minX,x); minY=Math.min(minY,y); maxX=Math.max(maxX,x); maxY=Math.max(maxY,y);
    for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++) {
      const nx=x+dx,ny=y+dy,n=ny*info.width+nx;
      if(nx<0 || ny<0 || nx>=info.width || ny>=info.height || seen[n] || data[n*4+3]<16) continue;
      seen[n]=1;queue[tail++]=n;
    }
  }
  if(tail>100) components.push({minX,minY,maxX,maxY,area:tail});
}
components.sort((a,b)=>b.area-a.area);
if(components.length<rows*4) throw new Error(`Expected ${rows*4} distinct figures, found ${components.length}.`);
const figures=components.slice(0,rows*4).sort((a,b)=>(a.minY+a.maxY)-(b.minY+b.maxY));
if(figures.some(f=>f.area<figures[0].area*.2)) throw new Error('A disconnected fragment was mistaken for a figure.');
const bounds=[];
for(let row=0;row<rows;row++) {
  const line=figures.slice(row*4,row*4+4).sort((a,b)=>a.minX-b.minX);
  for(const f of line) {
    const left=Math.max(0,f.minX-2),top=Math.max(0,f.minY-2);
    const width=Math.min(info.width-1,f.maxX+2)-left+1,height=Math.min(info.height-1,f.maxY+2)-top+1;
    const crop=await sharp(sourceImage).extract({left,top,width,height}).png().toBuffer();
    raw.push({data:crop,meta:{width,height}});bounds.push({left,top,width,height});
  }
}
// A shared scale preserves body proportions through wide-stride frames.
const scale=Math.min(62/Math.max(...raw.map(f=>f.meta.width)),94/Math.max(...raw.map(f=>f.meta.height)));
for(let row=0;row<rows;row++) {
  const parts=[];
  for(let column=0;column<4;column++) {
    const sourceRow=flags.has('--swap-sides') && row>1 ? 5-row : flags.has('--mirror-left') && row===2 ? 3 : row;
    const f=raw[sourceRow*4+column],width=Math.max(1,Math.round(f.meta.width*scale)),height=Math.max(1,Math.round(f.meta.height*scale));
    let image=sharp(f.data).resize(width,height);
    if(flags.has('--mirror-left') && row===2) image=image.flop();
    parts.push({input:await image.png().toBuffer(),left:column*64+Math.floor((64-width)/2),top:96-height});
  }
  await sharp({create:{width:256,height:96,channels:4,background:'#00000000'}}).composite(parts).webp({lossless:true})
    .toFile(`assets/illustrated/${id}-${dirs[row]}.webp`);
}
await writeFile(`assets/illustrated/${id}-manifest.json`,JSON.stringify({id,source:`${id}-source.png`,directions:dirs,frames:4,frameWidth:64,frameHeight:96,logicalWidth:16,logicalHeight:24,sharedScale:scale,sourceBounds:bounds,corrections:[...flags],...(rows===3 ? {mirrorRightFrom:'left'} : {})},null,2)+'\n');
console.log(`Prepared ${id}: ${rows} source directions, shared scale, real alpha.`);
