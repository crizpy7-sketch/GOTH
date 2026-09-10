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
    const hero=await page.evaluate(async()=>{const {CHARS}=await import(__MODULE_URLS['art/names.js']);return CHARS.flatMap(who=>['down','up','left','right'].flatMap(dir=>[0,1,2,3].map(frame=>{
      const a=__ATLAS__.get(`c.${who}.${dir}`,frame),data=a.getContext('2d').getImageData(0,0,a.width,a.height).data;
      let transparent=0,visible=0;
      for(let i=3;i<data.length;i+=4) {if(data[i]===0)transparent++;else visible++;}
      return {size:[a.width,a.height,a.logicalWidth,a.logicalHeight],frames:__ATLAS__.frames(`c.${who}.${dir}`),smooth:a.smooth,transparent,visible};
    })));});
    for(const a of hero) {
      assert.deepEqual(a.size,[64,96,16,24]);assert.equal(a.frames,4);assert.equal(a.smooth,true);
      assert.ok(a.transparent>1000 && a.visible>500,'each character frame has a real transparent cutout');
    }
    assert.equal(hero.length,208,'all thirteen cast members have four frames in four directions');
    if(width===1280) {
      const assets=await page.evaluate(async()=>{
        const {BUILDINGS}=await import(__MODULE_URLS['art/names.js']);
        const {loadMap}=await import(__MODULE_URLS['world/map.js']);
        const names=new Set(['scene.battle','scene.story.cottage','scene.story.village','story.gran','story.mayor','story.rival','t.tree.oak','t.pine.illustrated']);
        for(const b of BUILDINGS)for(let i=1;i<=b.tiers;i++)names.add(`b.${b.id}.t${i}`);
        for(const id of ['cottage','infirmary','workshop'])names.add(`b.${id}.authored`);
        for(const id of ['village','meadow','forest','granhouse']) {
          const map=loadMap(id);
          for(const encounter of map.encounters||[])for(const pose of ['front','back','ow'])names.add(`g.${encounter.id}.${pose}`);
          for(let y=0;y<map.h;y++)for(let x=0;x<map.w;x++)for(const layer of ['ground','mid','over']) {
            const name=map[layer](x,y);
            if(name&&!name.startsWith('t.tree.canopy')&&!['t.pine.top','t.pine.trunk'].includes(name))names.add(name);
          }
        }
        return [...names].map(name=>{
          const a=__ATLAS__.get(name),data=a.getContext('2d').getImageData(0,0,a.width,a.height).data;
          let clear=0,paint=0;
          for(let i=3;i<data.length;i+=4){if(data[i]===0)clear++;if(data[i]>32)paint++;}
          return {name,smooth:a.smooth,ratio:a.width/a.logicalWidth,width:a.logicalWidth,height:a.logicalHeight,frames:__ATLAS__.frames(name),clear,paint};
        });
      });
      for(const a of assets) {
        assert.equal(a.smooth,true,`${a.name} uses smooth illustrated artwork`);
        assert.equal(a.ratio,4,`${a.name} has four physical pixels per logical pixel`);
        assert.ok(a.paint>(/^(g\.|b\.|story\.|scene\.)/.test(a.name)?100:8),`${a.name} has real visible artwork`);
        if(/^(g\.|b\.|story\.|t\.tree|t\.pine)/.test(a.name))assert.ok(a.clear>100,`${a.name} has transparent edges`);
        if(a.name.startsWith('g.')){
          assert.deepEqual([a.width,a.height],a.name.endsWith('.ow')?[16,16]:[80,80]);
          assert.equal(a.frames,a.name.endsWith('.ow')?2:1);
        }
      }
      await writeFile('artifacts/illustrated-asset-coverage.json',JSON.stringify(assets,null,2));
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
  const result={pass:true,checks:['embedded smooth font','native text metrics','wrapped text bounds','Balanced and High canvas resolutions','208 cast frames with real alpha','all opening encounters, building tiers and rendered tiles illustrated','graphics quality switching','desktop and two mobile layouts','world, journal and story render'],errors};
  await writeFile('artifacts/illustrated-browser-results.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
} finally {await browser.close();}
