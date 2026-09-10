import {createRequire} from 'node:module';
import {copyFile,mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(process.env.GOTH_NODE_MODULES ? process.env.GOTH_NODE_MODULES+'/' : import.meta.url);
const sharp=require('sharp');
const [source,id,indexText='0',mode='portrait']=process.argv.slice(2),index=Number(indexText);
if(!source || !['gran','mayor','rival'].includes(id) || !Number.isInteger(index) || index<0 || index>3) throw new Error('Pass four-expression sheet, character ID, and selected index0–3.');
const meta=await sharp(source).metadata(),stats=await sharp(source).stats();
if(!meta.hasAlpha || stats.isOpaque) throw new Error('Reject opaque portrait backgrounds.');
if(!['portrait','character','single'].includes(mode)) throw new Error('Source mode must be portrait, character or single.');
if(mode==='single' && index!==0) throw new Error('A single portrait only has expression index 0.');
const grid=mode==='single'?1:mode==='character'?4:2;
const column=index%grid,row=Math.floor(index/grid),left=Math.floor(column*meta.width/grid),top=Math.floor(row*meta.height/grid);
const width=Math.floor((column+1)*meta.width/grid)-left,height=Math.floor((row+1)*meta.height/grid)-top;
const crop=await sharp(source).extract({left,top,width,height}).png().toBuffer();
let trimmed=await sharp(crop).trim({threshold:10}).png().toBuffer();
if(mode==='character') {
  const body=await sharp(trimmed).metadata();
  trimmed=await sharp(trimmed).extract({left:0,top:0,width:body.width,height:Math.round(body.height*.77)}).png().toBuffer();
}
await mkdir('assets/illustrated',{recursive:true});
await copyFile(source,`assets/illustrated/story-${id}-source.png`);
await sharp(trimmed).resize(432,504,{fit:'contain',position:'bottom',background:'#00000000'}).extend({top:8,left:8,right:8,bottom:0,background:'#00000000'}).webp({lossless:true}).toFile(`assets/illustrated/story-${id}.webp`);
await writeFile(`assets/illustrated/story-${id}-manifest.json`,JSON.stringify({id,source:`story-${id}-source.png`,expression:index,sourceMode:mode,frameWidth:448,frameHeight:512,logicalWidth:112,logicalHeight:128,pixelRatio:4,smooth:true,alphaVerified:true},null,2)+'\n');
console.log(`Prepared story-${id}: 448x512, true alpha, expression ${index}.`);
