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
  assert.equal(await page.evaluate(()=>__game.save()),true);
  const saved=await page.evaluate(()=>({party:__game.state.party.length,steps:__game.state.stats.steps}));
  await page.reload();await page.waitForFunction(()=>__boot?.ready);
  assert.ok(await page.getByRole('button',{name:'Continue journey'}).isVisible());
  assert.deepEqual(await page.evaluate(()=>({party:__game.state.party.length,steps:__game.state.stats.steps})),saved);
  await page.getByRole('button',{name:'Continue journey'}).click();await scene('overworld');
  assert.equal(await page.locator('#titleScreen').isVisible(),false);
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
    return ['tpad','tA','tB','tM'].every(id=>{
      const r=document.getElementById(id).getBoundingClientRect();
      return (r.right<=screen.left || r.left>=screen.right) && r.x>=0 && r.right<=innerWidth && r.y>=0 && r.bottom<=innerHeight;
    });
  });
  assert.equal(touchClear,true,'touch controls stay outside readable game content');
  await phone.screenshot({path:'artifacts/mobile-dialogue.png'});
  for(let i=0;i<24 && await phone.evaluate(()=>__game.scene!=='overworld');i++) {
    await phone.locator('#tA').tap();await phone.waitForTimeout(220);
  }
  await phone.waitForFunction(()=>__game.scene==='overworld');
  await phone.locator('#tM').tap();await phone.waitForFunction(()=>__game.scene==='pause');
  await phone.screenshot({path:'artifacts/mobile-journal.png'});
  await phone.locator('#tB').tap();await phone.waitForFunction(()=>__game.scene==='overworld');
  await phone.setViewportSize({width:390,height:844});await phone.waitForTimeout(300);
  assert.ok(await phone.locator('#rotateGate').isVisible(),'portrait instruction visible');
  await phone.screenshot({path:'artifacts/mobile-portrait.png'});
  await mobile.close();
  assert.deepEqual(errors,[]);
  const result={pass:true,checks:['boot modules','native title menu','new game onboarding','movement','journal','seasons','battle','party','missions','village','save reload','continue','mobile layout','portrait gate'],fps,errors};
  await writeFile('artifacts/browser-results.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
} catch(e) {await shot('failure');console.error('Page errors:',errors);throw e;}
finally {await browser.close();}
