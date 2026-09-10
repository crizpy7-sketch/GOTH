import {createRequire} from 'node:module';
import {mkdir,copyFile,writeFile} from 'node:fs/promises';
const require=createRequire(process.env.GOTH_NODE_MODULES ? process.env.GOTH_NODE_MODULES+'/' : import.meta.url);
const sharp=require('sharp');
const source=process.argv[2];
if (!source) throw new Error('Pass the approved transparent hero sheet.');
const metadata=await sharp(source).metadata(),stats=await sharp(source).stats();
if (!metadata.hasAlpha || stats.isOpaque) throw new Error('Reject opaque or painted-checkerboard sprite sheets.');
await mkdir('assets/illustrated',{recursive:true});
await copyFile(source,'assets/illustrated/hero-source.png');
// The fourth generated row had a visual defect. East uses a runtime mirror of
// the clean west row, a conventional directional sprite treatment.
const bands=[[0,322],[322,322],[644,310]],dirs=['down','up','left'];
for (let row=0;row<3;row++) {
  const cells=[];
  for (let column=0;column<4;column++) {
    const left=Math.floor(column*metadata.width/4),right=Math.floor((column+1)*metadata.width/4);
    const cropped=await sharp(source).extract({left,top:bands[row][0],width:right-left,height:bands[row][1]}).png().toBuffer();
    const frame=await sharp(cropped).trim().resize(64,96,{fit:'contain',position:'bottom',background:'#00000000'}).png().toBuffer();
    cells.push({input:frame,left:column*64,top:0});
  }
  await sharp({create:{width:256,height:96,channels:4,background:'#00000000'}}).composite(cells)
    .webp({lossless:true}).toFile(`assets/illustrated/hero-${dirs[row]}.webp`);
}
await writeFile('assets/illustrated/hero-manifest.json',JSON.stringify({source:'hero-source.png',frameWidth:64,frameHeight:96,logicalWidth:16,logicalHeight:24,frames:4,directions:dirs,mirrorRightFrom:'left',sourceBands:bands},null,2)+'\n');
console.log('Prepared three clean hero directions; east mirrors west in the renderer.');
