import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(process.env.GOTH_NODE_MODULES ? process.env.GOTH_NODE_MODULES+'/' : import.meta.url);
const {chromium}=require('playwright');
const browser=await chromium.launch({headless:true});
try {
  const page=await browser.newPage({viewport:{width:1280,height:800}}),results=[],errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto((process.env.GOTH_URL||'http://127.0.0.1:4173')+'/?autostart=1');
  await page.waitForFunction(()=>__boot?.ready);
  for(const quality of ['high','balanced']) for(const map of ['village','forest']) {
    await page.evaluate(async({quality,map})=>{
      const {R}=await import(__MODULE_URLS['core/renderer.js']);R.setQuality(quality);
      __game.goto('overworld',{map,x:map==='village'?22:18,y:map==='village'?24:16,dir:'down'});
    },{quality,map});
    await page.waitForTimeout(2200);
    const samples=[];
    for(let i=0;i<5;i++) {await page.waitForTimeout(550);samples.push(await page.evaluate(()=>__game.fps));}
    results.push({quality,map,samples,medianFps:[...samples].sort((a,b)=>a-b)[2]});
  }
  await mkdir('artifacts',{recursive:true});
  await writeFile('artifacts/illustrated-performance.json',JSON.stringify({environment:'Isolated headless Chromium, 1280x800, not a physical-phone benchmark',results,errors},null,2));
  console.log(JSON.stringify({results,errors}));
} finally {await browser.close();}
