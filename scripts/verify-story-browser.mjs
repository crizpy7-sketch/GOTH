import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(process.env.GOTH_NODE_MODULES ? process.env.GOTH_NODE_MODULES+'/' : import.meta.url);
const {chromium}=require('playwright');
const base=process.env.GOTH_URL || 'http://127.0.0.1:4173';
await mkdir('artifacts',{recursive:true});
const browser=await chromium.launch({headless:true}), errors=[];
const scene=(p,name)=>p.waitForFunction(n=>__game.scene===n,name);
async function phase(p) {return p.evaluate(async()=>{const {Scenes}=await import(__MODULE_URLS['core/scene.js']);return Scenes.top?.touchPhase;});}
async function key(p,k='Enter') {await p.keyboard.press(k);await p.waitForTimeout(170);}
async function playTo(p,target) {
  for(let i=0;i<42;i++) {
    if (target==='overworld' ? await p.evaluate(()=>__game.scene==='overworld') : (await phase(p))===target) return;
    await key(p);
  }
  throw new Error(`Story did not reach ${target}`);
}
async function prepare(p) {
  p.on('pageerror',e=>errors.push(e.message));
  await p.goto(base+'/?autostart=1');await p.waitForFunction(()=>__boot?.ready);
  assert.deepEqual(await p.evaluate(()=>__game.boot.failed),[]);
  await p.evaluate(()=>__game.goto('overworld',{map:'granhouse',x:10,y:8,dir:'up'}));
  await scene(p,'overworld');await p.waitForTimeout(150);
}
const shot=(p,name)=>p.screenshot({path:`artifacts/story-${name}.png`});
try {
  const page=await browser.newPage({viewport:{width:1280,height:800}});
  await prepare(page);
  await key(page,'e');await scene(page,'story');await page.waitForTimeout(400);await shot(page,'gran');
  const still=await page.evaluate(()=>({player:{...__game.state.player},clock:{...__game.state.clock}}));
  await page.keyboard.down('ArrowDown');await page.waitForTimeout(500);await page.keyboard.up('ArrowDown');
  assert.deepEqual(await page.evaluate(()=>({player:{...__game.state.player},clock:{...__game.state.clock}})),still,'important scenes pause player movement and world time');
  const art=await page.evaluate(()=>Object.fromEntries(['story.gran','story.mayor','story.rival','scene.story.cottage'].map(id=>{
    const a=__ATLAS__.get(id);return [id,[a.width,a.height,a.logicalWidth,a.logicalHeight]];
  })));
  for(const id of ['story.gran','story.mayor','story.rival']) assert.deepEqual(art[id],[448,512,112,128]);
  assert.deepEqual(art['scene.story.cottage'],[1280,720,320,180]);
  await playTo(page,'choices');await shot(page,'starters');
  await key(page,'Escape');await scene(page,'overworld');
  assert.equal(await page.evaluate(()=>__game.state.party.length),0,'cancelled choice never gives a starter');
  assert.equal(await page.evaluate(()=>!!__game.state.flags.gotStarter),false);
  await key(page,'e');await scene(page,'story');await playTo(page,'choices');
  await key(page,'ArrowRight');await key(page,'ArrowRight');await key(page);
  await page.waitForFunction(()=>__game.state.party.length===1);
  await page.waitForTimeout(300);await shot(page,'welcome');
  assert.equal(await page.evaluate(()=>__game.state.party[0].species),'aquarabbit');
  await playTo(page,'overworld');
  assert.equal(await page.evaluate(()=>__game.state.flags['story.granHearth']),true);
  await key(page,'e');await scene(page,'__say');await shot(page,'repeat');
  await playTo(page,'overworld');
  const earned=await page.evaluate(()=>({id:__game.state.party[0].id,party:__game.state.party.length,flags:{...__game.state.flags}}));
  await page.reload();await page.waitForFunction(()=>__boot?.ready);
  await page.getByRole('button',{name:'Continue journey'}).click();await scene(page,'overworld');
  assert.deepEqual(await page.evaluate(()=>({id:__game.state.party[0].id,party:__game.state.party.length,flags:{...__game.state.flags}})),earned,'story completion and exactly one starter survive reload');
  // Existing players get one new reunion, while preserving their companion.
  await page.evaluate(()=>{delete __game.state.flags['story.granHearth'];__game.goto('overworld',{map:'granhouse',x:10,y:8,dir:'up'});});
  await key(page,'e');await scene(page,'story');await shot(page,'reunion');
  await playTo(page,'overworld');assert.equal(await page.evaluate(()=>__game.state.party.length),1);
  // Verify the other authored story events through the actual NPC interaction.
  for(const [who,tag] of [['mayor','mayor'],['rival','rival']]) {
    await page.evaluate(async who=>{
      const {Npc}=await import(__MODULE_URLS['world/npc.js']);
      const npc=new Npc({who,x:1,y:1},{solid:()=>false});
      window.__storyNpc=npc;window.__storyDone=npc.interact();
    },who);
    await scene(page,'story');await page.waitForTimeout(350);await shot(page,tag);
    await playTo(page,'overworld');await page.evaluate(()=>__storyDone);
  }
  const phone=await browser.newPage({viewport:{width:844,height:390},isMobile:true,hasTouch:true,deviceScaleFactor:2});
  await prepare(phone);await phone.locator('#tA').tap();await scene(phone,'story');await phone.waitForTimeout(400);
  assert.equal(await phone.locator('#tpad').isVisible(),false);
  assert.equal(await phone.locator('#tB').isVisible(),false,'narrative has one clear advance action');
  const tap=async id=>{await phone.locator('#'+id).tap();await phone.waitForTimeout(180);};
  await shot(phone,'mobile-gran');
  for(let i=0;i<40 && (await phase(phone))!=='choices';i++) await tap('tA');
  assert.equal(await phase(phone),'choices');
  assert.equal(await phone.locator('#tright').isVisible(),true);
  assert.equal(await phone.locator('#tB').isVisible(),true);
  await shot(phone,'mobile-starters');
  const bounds=await phone.locator('#screen').boundingBox();
  await phone.touchscreen.tap(bounds.x+256/320*bounds.width,bounds.y+66/180*bounds.height);
  await phone.waitForTimeout(150);
  assert.equal(await phone.evaluate(()=>__game.state.party.length),0,'first tap previews a new starter');
  await tap('tA');await phone.waitForFunction(()=>__game.state.party.length===1);
  assert.equal(await phone.evaluate(()=>__game.state.party[0].species),'aquarabbit');
  for(let i=0;i<45 && await phone.evaluate(()=>__game.scene==='story');i++) {
    if ((await phase(phone))==='pending') await phone.waitForTimeout(100);
    else await tap('tA');
  }
  await scene(phone,'overworld');
  assert.equal(await phone.evaluate(()=>__game.state.party.length),1);
  assert.deepEqual(errors,[]);
  const result={pass:true,checks:['important NPC routing','large portraits','world pause','starter preview and cancel','exactly one chosen starter','continuous welcome','quick repeat dialogue','old-save reunion','story save reload','Mayor and rival scenes','mobile narrative dock','mobile direct choice preview'],errors};
  await writeFile('artifacts/story-browser-results.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
} catch(error) {for(const p of browser.contexts().flatMap(c=>c.pages())) await shot(p,'failure').catch(()=>{});console.error('Page errors:',errors);throw error;}
finally {await browser.close();}
