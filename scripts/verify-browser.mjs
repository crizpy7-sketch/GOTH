import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const {chromium} = process.env.GOTH_NODE_MODULES
  ? createRequire(process.env.GOTH_NODE_MODULES + '/')( 'playwright') : require('playwright');
const base = process.env.GOTH_URL || 'http://127.0.0.1:4173';
await mkdir('artifacts',{recursive:true});
const browser = await chromium.launch({headless:true});
const page = await browser.newPage({viewport:{width:1280,height:800}});
page.setDefaultTimeout(12000);
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
const shot = name => page.screenshot({path:`artifacts/${name}.png`});
const scene = name => page.waitForFunction(n=>window.__game?.scene===n,name);
try {
  await page.goto(base+'/?autostart=1');
  await page.waitForFunction(()=>window.__boot?.ready);
  assert.deepEqual(await page.evaluate(()=>__game.boot.failed),[]);
  assert.deepEqual(await page.evaluate(()=>__game.boot.missing),[]);
  const artSizes=await page.evaluate(()=>Object.fromEntries(
    ['t.grass','c.hero.down','scene.battle','t.tree.oak'].map(name=>{
      const image=__ATLAS__.get(name);
      return [name,[image.width,image.height,image.logicalWidth,image.logicalHeight]];
    })
  ));
  assert.deepEqual(artSizes,{
    't.grass':[32,32,16,16],
    'c.hero.down':[32,48,16,24],
    'scene.battle':[640,360,320,180],
    't.tree.oak':[144,192,48,64],
  },'detailed assets retain their gameplay footprints');
  assert.deepEqual(await page.locator('#screen').evaluate(c=>[c.width,c.height]),[960,540]);
  await page.locator('#veil').waitFor({state:'hidden'});
  await shot('title-desktop');
  // Native button focus must follow the highlighted keyboard selection.
  await page.getByRole('button',{name:'Begin your journey'}).press('ArrowDown');
  await page.waitForTimeout(80);
  assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Settings');
  await page.keyboard.press('Enter');await scene('__say');
  await page.waitForTimeout(180);await page.keyboard.press('Escape');await page.waitForTimeout(120);
  await page.keyboard.press('Escape');await scene('title');
  await page.getByRole('button',{name:'Begin your journey'}).click();
  await scene('__say');
  for(let i=0;i<24 && await page.evaluate(()=>__game.scene!=='overworld');i++) {
    await page.keyboard.press('Enter');await page.waitForTimeout(220);
  }
  await scene('overworld');
  assert.equal(await page.locator('#titleScreen').isVisible(),false);
  const before = await page.evaluate(()=>({...__game.state.player}));
  await page.keyboard.down('ArrowDown');await page.waitForTimeout(350);await page.keyboard.up('ArrowDown');
  assert.ok(await page.evaluate(p=>__game.state.player.x!==p.x || __game.state.player.y!==p.y,before),'keyboard movement');
  await shot('world-day');
  await page.keyboard.press('m');await scene('pause');await shot('journal');
  await page.keyboard.press('Escape');await scene('overworld');
  await page.evaluate(()=>{__game.setClock(22);__game.setSeason('winter');});
  await page.waitForTimeout(150);await shot('world-winter-night');
  const winterTree=await page.evaluate(()=>{
    const source=__ATLAS__.get('t.tree.oak'), winter=__ATLAS__.get('t.tree.oak:season-winter');
    const a=source.getContext('2d').getImageData(0,0,source.width,source.height).data;
    const b=winter.getContext('2d').getImageData(0,0,winter.width,winter.height).data;
    let sameAlpha=a.length===b.length, changed=0, transparent=0, visible=0;
    for(let i=0;i<a.length;i+=4){
      if(a[i+3]!==b[i+3]) sameAlpha=false;
      if(a[i+3] && (a[i]!==b[i] || a[i+1]!==b[i+1] || a[i+2]!==b[i+2])) changed++;
      if(a[i+3]) visible++;else transparent++;
    }
    return {size:[winter.width,winter.height,winter.logicalWidth,winter.logicalHeight],sameAlpha,changed,transparent,visible};
  });
  assert.deepEqual(winterTree.size,[144,192,48,64]);
  assert.equal(winterTree.sameAlpha,true,'season changes preserve canopy transparency');
  assert.ok(winterTree.changed>100 && winterTree.transparent>0 && winterTree.visible>0,'winter recolours foliage on a transparent sprite');
  await page.evaluate(()=>{__game.setClock(10);__game.setSeason('spring');__game.grantStarter('embercub');__game.goto('battle');});
  await scene('battle');await page.waitForTimeout(1800);await shot('battle');
  await page.keyboard.press('Enter');await page.waitForTimeout(150);await shot('battle-moves');
  await page.keyboard.press('Enter');await page.waitForTimeout(1200);await shot('battle-hit');
  await page.evaluate(()=>__game.goto('battle'));await page.waitForTimeout(1800);
  await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
  await page.waitForTimeout(160);await shot('battle-bag');
  await page.evaluate(()=>__game.goto('party'));await scene('party');await shot('party');
  await page.evaluate(()=>__game.goto('missions'));await scene('missions');await shot('missions');
  await page.evaluate(()=>__game.goto('village'));await scene('village');await shot('village');
  await page.evaluate(()=>__game.goto('overworld',{map:'village',x:22,y:24}));await scene('overworld');
  const placementCamera=await page.evaluate(async()=>{
    const {R}=await import(window.__MODULE_URLS['core/renderer.js']);
    R.worldZoom=1; // The village board uses the UI camera before placement opens.
    __game.push('build',{type:'cottage'});
    return {...R.camera};
  });
  await page.waitForTimeout(120);
  assert.deepEqual(await page.evaluate(async()=>({...((await import(window.__MODULE_URLS['core/renderer.js'])).R.camera)})),
    placementCamera,'placement opens at the correct camera scale without a first-frame jump');
  await shot('placement');
  await page.keyboard.press('Escape');await scene('overworld');
  assert.equal(await page.evaluate(()=>__game.save()),true);
  const saved=await page.evaluate(()=>({party:__game.state.party.length,steps:__game.state.stats.steps}));
  await page.reload();await page.waitForFunction(()=>__boot?.ready);
  assert.ok(await page.getByRole('button',{name:'Continue journey'}).isVisible());
  assert.deepEqual(await page.evaluate(()=>({party:__game.state.party.length,steps:__game.state.stats.steps})),saved);
  await page.getByRole('button',{name:'Continue journey'}).click();await scene('overworld');
  assert.equal(await page.locator('#titleScreen').isVisible(),false);
  // The first FPS window includes boot and sprite realization after reload.
  // Sample after the world has rendered long enough to replace that window.
  await page.waitForTimeout(1400);
  const fps=await page.evaluate(()=>__game.fps);
  const mobile=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true,deviceScaleFactor:2});
  const phone=await mobile.newPage();
  phone.on('pageerror',e=>errors.push(e.message));
  await phone.goto(base+'/?autostart=1');await phone.waitForFunction(()=>__boot?.ready);
  await phone.locator('#veil').waitFor({state:'hidden'});
  await phone.screenshot({path:'artifacts/title-mobile.png'});
  await phone.getByRole('button',{name:'Begin your journey'}).tap();
  await phone.waitForFunction(()=>__game.scene==='__say');
  await phone.waitForTimeout(300);
  const bounds=await phone.evaluate(()=>({view:__hearthViewport,screen:document.querySelector('#screen').getBoundingClientRect().toJSON()}));
  assert.ok(bounds.screen.x>=0 && bounds.screen.right<=844.5 && bounds.screen.bottom<=390.5,'mobile game contained');
  const touchClear=await phone.evaluate(()=>{
    const screen=document.querySelector('#screen').getBoundingClientRect();
    const choices=__game.stack.at(-1)?.__params?.choices?.length || 0;
    const dialogueTop=screen.top+(180-54-choices*12-4)/180*screen.height;
    return ['tpad','tA','tB'].every(id=>{
      const el=document.getElementById(id);
      if(getComputedStyle(el).display==='none') return true;
      const r=el.getBoundingClientRect();
      return r.x>=screen.left && r.right<=screen.right && r.y>=screen.top && r.bottom<=dialogueTop;
    });
  });
  assert.equal(touchClear,true,'fullscreen controls clear the dialogue text');
  assert.ok(bounds.screen.height>=370,'mobile playfield uses available landscape height');
  await phone.screenshot({path:'artifacts/mobile-dialogue.png'});
  for(let i=0;i<24 && await phone.evaluate(()=>__game.scene!=='overworld');i++) {
    await phone.locator('#tA').tap();await phone.waitForTimeout(220);
  }
  await phone.waitForFunction(()=>__game.scene==='overworld');
  await phone.waitForFunction(()=>document.body.dataset.touchMode==='world');
  const beforeTouch=await phone.evaluate(()=>({...__game.state.player}));
  const stick=await phone.locator('#tpad').boundingBox();
  await phone.mouse.move(stick.x+stick.width/2,stick.y+stick.height/2);
  await phone.mouse.down();
  await phone.mouse.move(stick.x+stick.width/2,stick.y+stick.height-8);
  await phone.waitForTimeout(760);
  assert.equal(await phone.evaluate(()=>__touchStickState.running),true,'outer stick engages running');
  await phone.mouse.up();await phone.waitForTimeout(100);
  assert.ok(await phone.evaluate(p=>__game.state.player.x!==p.x || __game.state.player.y!==p.y,beforeTouch),'touch stick moves the player');
  assert.equal(await phone.evaluate(()=>__touchStickState.movementDirection),null,'releasing the stick stops movement');
  await phone.screenshot({path:'artifacts/mobile-world.png'});
  await phone.locator('#tM').tap();await phone.waitForFunction(()=>__game.scene==='pause');
  await phone.waitForFunction(()=>document.body.dataset.touchMode==='menu');
  assert.equal(await phone.locator('#tpad').isVisible(),false,'menu uses precise direction keys');
  assert.equal(await phone.locator('#tdown').isVisible(),true);
  await phone.screenshot({path:'artifacts/mobile-journal.png'});
  for(let i=0;i<5;i++) {await phone.locator('#tdown').tap();await phone.waitForTimeout(40);}
  await phone.locator('#tA').tap();await phone.waitForFunction(()=>__game.scene==='settings');
  await phone.locator('#tB').tap();await phone.waitForFunction(()=>__game.scene==='pause');
  await phone.locator('#tB').tap();await phone.waitForFunction(()=>__game.scene==='overworld');
  await phone.setViewportSize({width:390,height:844});await phone.waitForTimeout(300);
  assert.ok(await phone.locator('#rotateGate').isVisible(),'portrait instruction visible');
  await phone.screenshot({path:'artifacts/mobile-portrait.png'});
  await mobile.close();
  assert.deepEqual(errors,[]);
  const result={pass:true,checks:['boot modules','HD asset footprints','seasonal sprite transparency','native title menu','new game onboarding','movement','journal','seasons','battle','party','missions','village','save reload','continue','mobile fullscreen layout','touch movement and running','touch menu navigation','portrait gate'],fps,errors};
  await writeFile('artifacts/browser-results.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
} catch(e) {await shot('failure');console.error('Page errors:',errors);throw e;}
finally {await browser.close();}
