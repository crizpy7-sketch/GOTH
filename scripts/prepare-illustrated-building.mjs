import {createRequire} from 'node:module';
import {copyFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {BUILDINGS} from '../src/art/names.js';
const require=createRequire(process.env.GOTH_NODE_MODULES ? process.env.GOTH_NODE_MODULES+'/' : import.meta.url);
const sharp=require('sharp');
const [source,id]=process.argv.slice(2),b=BUILDINGS.find(b=>b.id===id);
if(!source||!b)throw new Error('Pass a transparent building tier sheet and canonical ID.');
const meta=await sharp(source).metadata(),stats=await sharp(source).stats();
if(!meta.hasAlpha||stats.isOpaque)throw new Error(`${id}: source has no usable transparent alpha`);
await mkdir('assets/illustrated',{recursive:true});
const savedSource=`assets/illustrated/b-${id}-source.png`;
if(resolve(source)!==resolve(savedSource))await copyFile(source,savedSource);
const cols=b.tiers===4?2:b.tiers,rows=b.tiers===4?2:1;
const width=b.w*16,height=(b.h+b.overhang)*16;
const crops=[],bounds=[];
// Generated grids have loose spacing. Exact cell cuts can include the tip of
// a neighboring flame and then shrink the whole stage to accommodate debris.
// Find complete structural silhouettes in the source, then sort them into the
// requested tier order. Crops retain the source's original transparent alpha.
// The 96-alpha connectivity threshold ignores faint fringe bridges between
// tightly spaced roof eaves; it does not remove pixels from the output image.
const {data,info}=await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const seen=new Uint8Array(info.width*info.height),queue=new Int32Array(seen.length),components=[];
for(let start=0;start<seen.length;start++) {
  if(seen[start]||data[start*4+3]<96)continue;
  let head=0,tail=1,minX=info.width,minY=info.height,maxX=0,maxY=0;
  queue[0]=start;seen[start]=1;
  while(head<tail) {
    const p=queue[head++],x=p%info.width,y=Math.floor(p/info.width);
    minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++) {
      const nx=x+dx,ny=y+dy,n=ny*info.width+nx;
      if(nx<0||ny<0||nx>=info.width||ny>=info.height||seen[n]||data[n*4+3]<96)continue;
      seen[n]=1;queue[tail++]=n;
    }
  }
  if(tail>100)components.push({minX,minY,maxX,maxY,area:tail});
}
components.sort((a,b)=>b.area-a.area);
if(components.length<b.tiers)throw new Error(`${id}: expected ${b.tiers} separate building silhouettes, found ${components.length}`);
const selected=components.slice(0,b.tiers).sort((a,b)=>(a.minY+a.maxY)-(b.minY+b.maxY)),ordered=[];
for(let row=0;row<rows;row++)ordered.push(...selected.slice(row*cols,row*cols+cols).sort((a,b)=>a.minX-b.minX));
for(const f of ordered) {
  const left=Math.max(0,f.minX-2),top=Math.max(0,f.minY-2);
  const cropWidth=Math.min(info.width-1,f.maxX+2)-left+1,cropHeight=Math.min(info.height-1,f.maxY+2)-top+1;
  const crop=await sharp(source).extract({left,top,width:cropWidth,height:cropHeight}).png().toBuffer();
  crops.push({data:crop,width:cropWidth,height:cropHeight});
  bounds.push({left,top,width:cropWidth,height:cropHeight,structuralAlphaPixels:f.area});
}
// Upgrade tiers keep a shared scale. Tall additions grow upward, not by shrinking
// the whole village building between its stages.
const scale=Math.min((width*4-4)/Math.max(...crops.map(c=>c.width)),(height*4-4)/Math.max(...crops.map(c=>c.height)));
for(let n=0;n<crops.length;n++) {
  const c=crops[n],w=Math.round(c.width*scale),h=Math.round(c.height*scale);
  const input=await sharp(c.data).resize(w,h).png().toBuffer();
  await sharp({create:{width:width*4,height:height*4,channels:4,background:'#00000000'}})
    .composite([{input,left:Math.floor((width*4-w)/2),top:height*4-h}]).webp({lossless:true}).toFile(`assets/illustrated/b-${id}-t${n+1}.webp`);
}
if(['cottage','infirmary','workshop'].includes(id)) {
  const c=crops[1],aw=id==='workshop'?80:64,ah=80;
  // These pre-existing structures have a door centered 40 px from their left.
  // Cottage/Gran footprints reserve a small left yard. Workshop's source door
  // sits at roughly 70% of its facade width, so align that feature to tile 2.
  const doorFraction=id==='workshop'?.70:.5;
  const factor=Math.min((ah*4-4)/c.height,(aw*4-4)/c.width,(40*4-2)/(c.width*doorFraction),((aw-40)*4-2)/(c.width*(1-doorFraction)));
  const w=Math.round(c.width*factor),h=Math.round(c.height*factor);
  const input=await sharp(c.data).resize(w,h).png().toBuffer();
  await sharp({create:{width:aw*4,height:ah*4,channels:4,background:'#00000000'}})
    .composite([{input,left:Math.round(40*4-w*doorFraction),top:ah*4-h}]).webp({lossless:true}).toFile(`assets/illustrated/b-${id}-authored.webp`);
}
await writeFile(`assets/illustrated/b-${id}-manifest.json`,JSON.stringify({id,tiers:b.tiers,logicalWidth:width,logicalHeight:height,pixelRatio:4,sharedScale:scale,sourceBounds:bounds,structuralAlphaThreshold:96},null,2)+'\n');
console.log(`Prepared ${id}: ${b.tiers} tiers, ${width}x${height} logical.`);
