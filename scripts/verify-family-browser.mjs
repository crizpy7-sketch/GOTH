import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(process.env.GOTH_NODE_MODULES ? process.env.GOTH_NODE_MODULES+'/' : import.meta.url);
const {chromium}=require('playwright');
const base=process.env.GOTH_URL || 'http://127.0.0.1:4173';
await mkdir('artifacts',{recursive:true});
const browser=await chromium.launch({headless:true});
const checks=[],errors=[],layouts=[];
const context=await browser.newContext({viewport:{width:1280,height:800}});
const page=await context.newPage();
page.on('pageerror',e=>errors.push(e.message));
page.setDefaultTimeout(15000);
async function ready(p=page) { await p.waitForFunction(()=>window.__boot?.ready); await p.locator('#titleProfiles').waitFor({state:'visible'}); }
async function key(name='Enter',p=page) { await p.locator('#screen').focus(); await p.keyboard.press(name); await p.waitForTimeout(150); }
async function world(p=page) { for(let i=0;i<25 && await p.evaluate(()=>__game.scene!=='overworld');i++) await key('Enter',p); await p.waitForFunction(()=>__game.scene==='overworld'); }
async function open(p=page) { await p.locator('#titleProfiles').click(); await p.locator('#familyPanel').waitFor({state:'visible'}); }
async function activate(p=page,touch=false) { await Promise.all([p.waitForEvent('domcontentloaded'),touch?p.locator('#profileUse').tap():p.locator('#profileUse').click()]); await ready(p); }
async function use(id,p=page) { await open(p); await p.locator(`[data-profile="${id}"]`).click(); await activate(p); assert.equal(await p.evaluate(()=>localStorage.getItem('hearth.family.active.v1')),id); }
async function title(p=page) {
  await key('KeyM',p); await p.waitForFunction(()=>__game.scene==='pause');
  for(let i=0;i<5;i++) await key('ArrowDown',p); await key('Enter',p); await p.waitForFunction(()=>__game.scene==='settings');
  for(let i=0;i<6;i++) await key('ArrowDown',p); await key('Enter',p);
  for(let i=0;i<30 && await p.evaluate(()=>!__game.stack.includes('title'));i++) {
    if (await p.evaluate(()=>__game.scene?.startsWith('__fx'))) await p.waitForTimeout(180);
    else await key('Enter',p);
  }
  await ready(p);
}
async function storage(p=page) { return p.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([key])=>key.startsWith('hearth.')))); }
try {
  await page.goto(base+'/?autostart=1'); await ready();
  assert.deepEqual(await page.locator('#titleMenu button').allTextContents(),['Begin your journey','Settings']);
  await open(); assert.equal(await page.locator('#profileList button').count(),8);
  assert.match(await page.locator('#familyPanel').innerText(),/Saved only in this browser on this device/);
  for(const id of ['child1','child2','child3','child4','child5','parent1','parent2']) {
    await page.locator(`[data-profile="${id}"]`).click(); assert.match(await page.locator('#profileDescription').innerText(),/empty place/);
  }
  assert.equal(Object.keys(await storage()).length,0,'browsing the picker creates no saves or backup');
  await page.locator('#profileClose').click();
  await page.locator('#titleMenu button').first().click(); await world();
  const original=(await storage())['hearth.save.v1']; assert.ok(original);
  await title();
  checks.push('Original Begin/Continue order and real-input onboarding/save-return flow remain intact.');

  await open(); await page.locator('[data-profile="child1"]').click();
  await page.locator('#profileName').fill('Luna');
  await page.locator('#profileName').press('Enter'); assert.match(await page.locator('#profileNotice').innerText(),/name saved/);
  await page.locator('#profileCopy').click(); assert.equal(await page.locator('#profileConfirm').isVisible(),true);
  await page.locator('#profileCopyCancel').click(); assert.equal((await storage())['hearth.profile.child1.save.v1'],undefined);
  await page.locator('#profileCopy').click(); await page.locator('#profileCopyConfirm').click();
  assert.match(await page.locator('#profileNotice').innerText(),/Journey copied/);
  const copied=await storage();
  assert.equal(copied['hearth.profile.child1.save.v1'],copied['hearth.save.v1']);
  assert.equal(copied['hearth.backup.legacy.v1'],copied['hearth.save.v1']);
  const preservedOriginal=copied['hearth.save.v1'];
  await activate();
  assert.equal(await page.locator('#titleProfileName').innerText(),'Luna');
  assert.equal(await page.locator('#titleMenu button').first().innerText(),'Continue journey');
  await page.locator('#titleReading').click(); assert.match(await page.locator('#titleReading').innerText(),/On/);
  await page.reload(); await ready(); assert.match(await page.locator('#titleReading').innerText(),/On/);
  checks.push('Explicit, cancelable original copy creates an exact backup, preserves original bytes, and reloads the renamed profile.');

  const importing=await browser.newContext({viewport:{width:1024,height:768}});
  const importPage=await importing.newPage();
  await importPage.goto(base+'/?autostart=1'); await ready(importPage);
  await importPage.evaluate(raw=>localStorage.setItem('hearth.save.v1',raw),preservedOriginal);
  await use('child1',importPage); await open(importPage);
  await importPage.locator('#profileCopy').click();
  await Promise.all([importPage.waitForEvent('domcontentloaded'),importPage.locator('#profileCopyConfirm').click()]);
  await ready(importPage); assert.equal(await importPage.locator('#titleMenu button').first().innerText(),'Continue journey');
  const importedState=await importPage.evaluate(()=>JSON.stringify({player:__game.state.player,coins:__game.state.coins,flags:__game.state.flags}));
  await importPage.locator('#titleReading').click();
  assert.equal(await importPage.evaluate(()=>JSON.stringify({player:__game.state.player,coins:__game.state.coins,flags:__game.state.flags})),importedState);
  const importedSave=JSON.parse((await storage(importPage))['hearth.profile.child1.save.v1']);
  assert.equal(importedSave.seed,JSON.parse(preservedOriginal).seed);
  assert.equal((await storage(importPage))['hearth.save.v1'],preservedOriginal);
  await importing.close();
  checks.push('Copying into the active empty profile forces a clean reload; later reading toggles cannot overwrite the copy with stale defaults.');

  // Synthetic earned-state fixture isolates persistence; the full opening suite
  // separately earns its rewards using real movement and battle input.
  await page.evaluate(()=>{__game.state.coins=734;__game.state.village.buildings=[{id:'family-home',type:'cottage',x:31,y:23,tier:1}];__game.state.flags.familyIsolation='Luna';__game.save();});
  for(const id of ['child2','child3','child4','child5','parent1','parent2']) {
    await use(id);
    assert.deepEqual(await page.locator('#titleMenu button').allTextContents(),['Begin your journey','Settings']);
    assert.match(await page.locator('#titleReading').innerText(),/Off/);
    assert.equal(await page.evaluate(()=>__game.state.coins),120);
    assert.equal(await page.evaluate(()=>__game.state.village.buildings.filter(b=>b.type==='cottage').length),0);
    await page.locator('#titleMenu button').first().click(); await world(); await title();
  }
  await use('child1'); assert.equal(await page.evaluate(()=>__game.state.coins),734);
  assert.equal(await page.evaluate(()=>__game.state.village.buildings[0].id),'family-home');
  assert.match(await page.locator('#titleReading').innerText(),/On/);
  assert.equal((await storage())['hearth.save.v1'],preservedOriginal);
  assert.equal((await storage())['hearth.backup.legacy.v1'],preservedOriginal);
  checks.push('All seven profiles can begin and return safely; village, progress and voice settings survive switching and reload.');

  await page.locator('#titleMenu button').first().click(); await world();
  await page.evaluate(()=>__game.push('family-profiles'));
  assert.equal(await page.evaluate(()=>__game.scene),'overworld'); assert.equal(await page.locator('#familyPanel').isVisible(),false);
  await title();
  const beforeReset=await storage();
  await page.locator('#titleMenu button').nth(1).click();
  // First confirm reveals the caption; Back cancels the replacement.
  for(let i=0;i<12 && await page.evaluate(()=>__game.scene!=='title');i++) await key('Escape');
  await ready();
  assert.equal((await storage())['hearth.profile.child1.save.v1'],beforeReset['hearth.profile.child1.save.v1']);
  await page.locator('#titleMenu button').nth(1).click(); await world();
  assert.equal(await page.evaluate(()=>__game.state.coins),120); assert.equal(await page.evaluate(()=>__game.state.village.buildings.filter(b=>b.type==='cottage').length),0);
  const afterReset=await storage();
  for(const [key,value] of Object.entries(beforeReset)) if(key.includes('.save.') && !key.includes('.child1.')) assert.equal(afterReset[key],value,key);
  await title(); await use('legacy');
  assert.equal((await storage())['hearth.save.v1'],preservedOriginal);
  checks.push('Profile switching is refused during gameplay; canceling New journey preserves progress, confirming changes only its selected profile.');

  // Two real tabs share browser storage, with separate runtime ownership.
  await use('child2'); const second=await context.newPage(); second.on('pageerror',e=>errors.push(e.message));
  await second.goto(base+'/?autostart=1'); await ready(second);
  await second.evaluate(()=>{__game.state.coins=881;__game.save();});
  const staleResult=await page.evaluate(()=>{__game.state.coins=123;return __game.save();});
  assert.equal(staleResult,false); await page.locator('#saveNotice').waitFor({state:'visible'});
  assert.match(await page.locator('#saveNoticeText').innerText(),/changed in another tab/);
  assert.equal(JSON.parse((await storage())['hearth.profile.child2.save.v1']).coins,881);
  await page.reload(); await ready(); assert.equal(await page.evaluate(()=>__game.state.coins),881);
  await use('parent1',second); await second.evaluate(()=>{__game.state.coins=882;__game.save();});
  assert.equal(await page.evaluate(()=>{__game.state.coins=883;return __game.save();}),true);
  const parallel=await storage(); assert.equal(JSON.parse(parallel['hearth.profile.child2.save.v1']).coins,883); assert.equal(JSON.parse(parallel['hearth.profile.parent1.save.v1']).coins,882);
  // Trigger another conflict after the other tab changes the shared boot target.
  await second.evaluate(()=>{const raw=JSON.parse(localStorage.getItem('hearth.profile.child2.save.v1'));raw.coins=884;localStorage.setItem('hearth.profile.child2.save.v1',JSON.stringify(raw));});
  await page.evaluate(()=>__game.save()); await page.locator('#profileReload').waitFor({state:'visible'});
  page.once('dialog',dialog=>dialog.accept());
  await Promise.all([page.waitForEvent('domcontentloaded'),page.locator('#profileReload').click()]); await ready();
  assert.equal(await page.locator('#titleProfileName').innerText(),'Child 2'); assert.equal(await page.evaluate(()=>__game.state.coins),884);
  await second.close();
  checks.push('Two-tab same-profile overwrite is refused with a visible notice; different profiles keep independent save ownership.');

  // Keyboard focus cannot leak into the game while editing names.
  await open(); await page.locator('[data-profile="child3"]').click();
  await page.locator('#profileName').fill('Willow'); await page.locator('#profileName').press('ArrowLeft');
  assert.equal(await page.evaluate(()=>__game.scene),'family-profiles');
  await page.locator('#profileClose').focus(); await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'profileUse');
  await page.keyboard.press('Tab'); assert.equal(await page.evaluate(()=>document.activeElement.id),'profileClose');
  await page.keyboard.press('Escape'); await ready();
  checks.push('Native names and Tab/Escape navigation keep keyboard focus inside the picker without activating gameplay.');

  for(const [width,height] of [[1280,800],[1024,768],[844,390],[568,320]]) {
    const device=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true});
    const p=await device.newPage(); p.on('pageerror',e=>errors.push(e.message));
    await p.goto(base+'/?autostart=1'); await ready(p);
    const titleBounds=await p.locator('#titleProfiles').boundingBox();
    assert.ok(titleBounds.height>=44 && titleBounds.x>=0 && titleBounds.x+titleBounds.width<=width);
    await p.locator('#titleProfiles').tap();
    const bounds=await p.locator('.family-card').evaluate(el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,client:el.clientHeight,scroll:el.scrollHeight};});
    assert.ok(bounds.x>=0 && bounds.y>=0 && bounds.right<=width+1 && bounds.bottom<=height+1,`${width} dialog stays in viewport`);
    const sizes=await p.locator('#profileList button').evaluateAll(els=>els.map(el=>el.getBoundingClientRect().height));
    assert.ok(sizes.every(h=>h>=44));
    await p.locator('[data-profile="parent2"]').tap();
    await p.locator('#profileName').fill('Parent Two'); await p.getByRole('button',{name:'Save name',exact:true}).tap();
    await p.locator('#profileUse').scrollIntoViewIfNeeded(); await p.screenshot({path:`artifacts/family-${width}.png`});
    await activate(p,true); assert.equal(await p.locator('#titleProfileName').innerText(),'Parent Two');
    layouts.push({width,height,...bounds}); await device.close();
  }
  checks.push('Touch picker, scrolling, rename and profile switch pass at desktop, iPad landscape and two phone landscape sizes.');

  const broken=await browser.newContext({viewport:{width:1024,height:768}});
  await broken.addInitScript(()=>{Storage.prototype.setItem=function(){throw new DOMException('Full','QuotaExceededError');};});
  const p=await broken.newPage(); await p.goto(base+'/?autostart=1'); await ready(p);
  await open(p); await p.locator('[data-profile="child1"]').click(); await p.locator('#profileUse').click();
  assert.match(await p.locator('#profileNotice').innerText(),/storage is unavailable/);
  assert.equal(await p.evaluate(()=>__game.scene),'family-profiles');
  await p.locator('#profileClose').click(); await ready(p);
  assert.equal(await p.locator('#familyPanel').isVisible(),false); await broken.close();
  checks.push('Unavailable device storage keeps the current profile open and explains the failed switch.');

  assert.deepEqual(errors,[]); await writeFile('artifacts/family-browser-results.json',JSON.stringify({base,checks,layouts,errors},null,2));
  console.log(JSON.stringify({checks:checks.length,layouts:layouts.length,errors},null,2));
} catch(error) {
  console.error('Completed checks:',checks);
  try { console.error('Current scene:',await page.evaluate(()=>({scene:__game.scene,stack:__game.stack}))); await page.screenshot({path:'artifacts/family-failure.png'}); } catch {}
  throw error;
} finally { await browser.close(); }
