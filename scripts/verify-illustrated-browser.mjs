import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(process.env.GOTH_NODE_MODULES ? process.env.GOTH_NODE_MODULES+'/' : import.meta.url);
const {chromium}=require('playwright');
await mkdir('artifacts',{recursive:true});
const browser=await chromium.launch({headless:true}),errors=[];
try {
  for (const [width,height,touch] of [[1280,800,false],[844,390,true],[568,320,true]]) {
    const page=await browser.newPage({viewport:{width,height},hasTouch:touch,isMobile:touch});
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto((process.env.GOTH_URL||'http://127.0.0.1:4173')+'/?autostart=1');
    await page.waitForFunction(()=>window.__boot?.ready);
    assert.deepEqual(await page.evaluate(()=>__game.boot.failed),[]);
    assert.equal(await page.evaluate(()=>Array.from(document.fonts).some(f=>f.family==='HearthText' && f.status==='loaded')),true,'embedded face loaded');
    assert.deepEqual(await page.locator('#screen').evaluate(c=>[c.width,c.height]),[960,540]);
    const hero=await page.evaluate(()=>['hero','gran'].flatMap(who=>['down','up','left','right'].flatMap(dir=>[0,1,2,3].map(frame=>{
      const a=__ATLAS__.get(`c.${who}.${dir}`,frame),data=a.getContext('2d').getImageData(0,0,a.width,a.height).data;
      let transparent=0,visible=0;
      for(let i=3;i<data.length;i+=4) {if(data[i]===0)transparent++;else visible++;}
      return {size:[a.width,a.height,a.logicalWidth,a.logicalHeight],frames:__ATLAS__.frames('c.hero.'+dir),smooth:a.smooth,transparent,visible};
    }))));
    for(const a of hero) {
      assert.deepEqual(a.size,[64,96,16,24]);assert.equal(a.frames,4);assert.equal(a.smooth,true);
      assert.ok(a.transparent>1000 && a.visible>500,'each character frame has a real transparent cutout');
    }
    const metrics=await page.evaluate(async()=>{
      const {Font}=await import(__MODULE_URLS['core/font.js']);
      const c=document.createElement('canvas').getContext('2d');c.font='650 8px HearthText';
      const text='Gran Willow welcomes your companion home.';
      return {actual:Font.measure(text),expected:c.measureText(text).width,lines:Font.wrap(text,90).map(t=>Font.measure(t))};
    });
    assert.equal(metrics.actual,metrics.expected);
    assert.ok(metrics.lines.every(w=>w<=90),'wrapping uses the actual painted face');
    await page.evaluate(()=>__game.goto('overworld',{map:'village',x:22,y:24,dir:'down'}));
    await page.waitForTimeout(450);
    await page.screenshot({path:`artifacts/illustrated-${width}-world.png`});
    await page.keyboard.press('m');await page.waitForFunction(()=>__game.scene==='pause');
    await page.screenshot({path:`artifacts/illustrated-${width}-journal.png`});
    await page.evaluate(()=>__game.goto('settings'));
    await page.waitForTimeout(200);
    for(let i=0;i<5;i++) {await page.keyboard.press('ArrowDown');await page.waitForTimeout(80);}
    await page.keyboard.press('ArrowRight');await page.waitForTimeout(180);
    assert.deepEqual(await page.locator('#screen').evaluate(c=>[c.width,c.height]),[1280,720]);
    assert.equal(await page.evaluate(()=>__game.state.settings.graphics),'high');
    await page.screenshot({path:`artifacts/illustrated-${width}-settings.png`});
    await page.keyboard.press('ArrowLeft');await page.waitForTimeout(180);
    assert.deepEqual(await page.locator('#screen').evaluate(c=>[c.width,c.height]),[960,540]);
    await page.evaluate(()=>__game.goto('overworld',{map:'granhouse',x:10,y:8,dir:'up'}));
    await page.waitForTimeout(200);await page.keyboard.press('e');
    await page.waitForFunction(()=>__game.scene==='story');await page.waitForTimeout(650);
    await page.screenshot({path:`artifacts/illustrated-${width}-story.png`});
    await page.close();
  }
  assert.deepEqual(errors,[]);
  const result={pass:true,checks:['embedded smooth font','native text metrics','wrapped text bounds','1280x720 canvas','hero and Gran directional frames with real alpha','graphics quality switching','desktop and two mobile layouts','world, journal and story render'],errors};
  await writeFile('artifacts/illustrated-browser-results.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
} finally {await browser.close();}
