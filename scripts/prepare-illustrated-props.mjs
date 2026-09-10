import {createRequire} from 'node:module';
import {copyFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const require=createRequire(process.env.GOTH_NODE_MODULES ? process.env.GOTH_NODE_MODULES+'/' : import.meta.url),sharp=require('sharp');
const groups={indoor:['table','chair','bookcase','hearth','plant','chest','basket','clock'],outdoor:['bush','rock','sign','lantern','well','bench','flowerpot','crate']};
const [source,group]=process.argv.slice(2),ids=groups[group] || (Object.values(groups).flat().includes(group) ? [group] : null);
if(!source || !ids) throw new Error('Pass a transparent prop source and indoor, outdoor, or one canonical prop ID.');
const m=await sharp(source).metadata(),s=await sharp(source).stats();
if(!m.hasAlpha || s.isOpaque) throw new Error('Reject opaque or painted-checkerboard prop sources.');
const {data,info}=await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const seen=new Uint8Array(info.width*info.height),queue=new Int32Array(seen.length),components=[];
for(let start=0;start<seen.length;start++) {
  if(seen[start] || data[start*4+3]<16) continue;
  let head=0,tail=1,minX=info.width,minY=info.height,maxX=0,maxY=0;
  queue[0]=start;seen[start]=1;
  while(head<tail) {
    const p=queue[head++],x=p%info.width,y=Math.floor(p/info.width);
    minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
    for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++) {
      const nx=x+dx,ny=y+dy,n=ny*info.width+nx;
      if(nx<0 || ny<0 || nx>=info.width || ny>=info.height || seen[n] || data[n*4+3]<16) continue;
      seen[n]=1;queue[tail++]=n;
    }
  }
  if(tail>100) components.push({minX,minY,maxX,maxY,area:tail});
}
components.sort((a,b)=>b.area-a.area);
if(components.length<ids.length) throw new Error(`Expected ${ids.length} separate props, found ${components.length}.`);
const selected=components.slice(0,ids.length).sort((a,b)=>(a.minY+a.maxY)-(b.minY+b.maxY)),ordered=[];
for(let row=0;row<Math.ceil(ids.length/4);row++) ordered.push(...selected.slice(row*4,row*4+4).sort((a,b)=>a.minX-b.minX));
await mkdir('assets/illustrated',{recursive:true});
const savedSource=`assets/illustrated/props-${group}-source.png`;
if(resolve(source)!==resolve(savedSource)) await copyFile(source,savedSource);
const outputs=[];
for(let i=0;i<ids.length;i++) {
  const f=ordered[i],left=Math.max(0,f.minX-2),top=Math.max(0,f.minY-2);
  const width=Math.min(info.width-1,f.maxX+2)-left+1,height=Math.min(info.height-1,f.maxY+2)-top+1;
  const crop=await sharp(source).extract({left,top,width,height}).png().toBuffer();
  const scaled=await sharp(crop).resize(62,62,{fit:'inside'}).png().toBuffer({resolveWithObject:true});
  const file=`assets/illustrated/prop-${ids[i]}.webp`;
  await sharp({create:{width:64,height:64,channels:4,background:'#00000000'}}).composite([{input:scaled.data,left:Math.floor((64-scaled.info.width)/2),top:64-scaled.info.height}]).webp({lossless:true}).toFile(file);
  const outputStats=await sharp(file).stats();
  if(outputStats.isOpaque || outputStats.channels[3].max!==255 || outputStats.channels[3].mean<8) throw new Error(`Invalid optimized alpha for ${ids[i]}`);
  outputs.push({id:ids[i],file:file.split('/').at(-1),sourceBounds:{left,top,width,height},width:64,height:64,logicalWidth:16,logicalHeight:16,pixelRatio:4,smooth:true,alphaVerified:true});
}
await writeFile(`assets/illustrated/props-${group}-manifest.json`,JSON.stringify({group,source:savedSource.split('/').at(-1),props:outputs},null,2)+'\n');
console.log(`Prepared ${group}: ${ids.length} transparent illustrated props at 64x64.`);
