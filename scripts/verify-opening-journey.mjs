// An isolated acceptance journey driven through the player's controls.
// Geometry is read only for route planning; the harness never teleports the player,
// grants currency/Guardians, completes a mission, or places/upgrades a building.
// A fixed battle seed bounds chance; self-reporting a family mission is a test
// response in this disposable profile, not evidence of a real-world activity.
import {createRequire} from 'node:module';
import {mkdir, writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(process.env.GOTH_NODE_MODULES ? process.env.GOTH_NODE_MODULES+'/' : import.meta.url);
const {chromium}=require('playwright');
const base=process.env.GOTH_URL || 'http://127.0.0.1:4173';
await mkdir('artifacts',{recursive:true});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1280,height:800}});
page.setDefaultTimeout(12000);
const errors=[], checks=[], observations=[], fixtures=[];
page.on('pageerror',e=>errors.push(e.message));
const shot=name=>page.screenshot({path:`artifacts/opening-${name}.png`});
const scene=name=>page.waitForFunction(n=>__game.scene===n,name);
const text=value=>page.waitForFunction(s=>__openingPaint.some(t=>t.includes(s)),value);
const press=async(k='Enter')=>{await page.keyboard.press(k,{delay:45});await page.waitForTimeout(160);};
const check=(name)=>{checks.push(name);console.log('PASS '+name);};
async function observe(p) {
  await p.evaluate(async()=>{
    const {R}=await import(__MODULE_URLS['core/renderer.js']);
    const {Hooks,UIx}=await import(__MODULE_URLS['core/bridge.js']);
    const {Scenes}=await import(__MODULE_URLS['core/scene.js']);
    const {Font}=await import(__MODULE_URLS['core/font.js']);
    window.__openingHooks=Hooks;window.__openingUI=UIx;window.__openingScenes=Scenes;window.__openingFont=Font;
    const begin=R.begin.bind(R),text=R.text.bind(R),rect=R.rect.bind(R),panel=UIx.panel.bind(UIx);
    window.__openingPaint=[];window.__openingDraw=[];
    R.begin=(...args)=>{__openingPaint.length=0;__openingDraw.length=0;return begin(...args);};
    R.text=(value,x,y,opts={})=>{
      __openingPaint.push(String(value).slice(0,opts.limit));
      __openingDraw.push({kind:'text',value:String(value),x,y,opts,width:R.measure(value)});
      return text(value,x,y,opts);
    };
    R.rect=(x,y,w,h,...rest)=>{__openingDraw.push({kind:'rect',x,y,w,h});return rect(x,y,w,h,...rest);};
    UIx.panel=(x,y,w,h,...rest)=>{__openingDraw.push({kind:'panel',x,y,w,h});return panel(x,y,w,h,...rest);};
  });
}
async function assertMenuLayout(p,mode,expectedBenefits) {
  const layout=await p.evaluate(mode=>{
    // Measure the alpha bounds of the actual text raster, independently of the
    // scene's assumed line height. This catches a later font or content change.
    const inkBounds=draw=>{
      const c=document.createElement('canvas');c.width=Math.ceil(draw.width)+12;c.height=24;
      const ctx=c.getContext('2d');__openingFont.draw(ctx,draw.value,4,4,{...draw.opts,align:'left',limit:undefined,alpha:1});
      const a=ctx.getImageData(0,0,c.width,c.height).data;let l=c.width,t=c.height,r=0,b=0;
      for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++)if(a[(y*c.width+x)*4+3]){l=Math.min(l,x);t=Math.min(t,y);r=Math.max(r,x+1);b=Math.max(b,y+1);}
      const x=draw.opts.align==='right'?draw.x-draw.width:draw.opts.align==='center'?draw.x-draw.width/2:draw.x;
      return {...draw,left:x+l-4,top:draw.y+t-4,right:x+r-4,bottom:draw.y+b-4};
    };
    const panels=__openingDraw.filter(d=>d.kind==='panel');
    const allText=__openingDraw.filter(d=>d.kind==='text').map(inkBounds);
    const panel=panels.at(-1);
    const foreground=__openingDraw.slice(__openingDraw.lastIndexOf(panel)+1);
    const frontText=foreground.filter(d=>d.kind==='text').map(inkBounds);
    const within=(t,p)=>t.left>=p.x+1&&t.right<=p.x+p.w-1&&t.top>=p.y+1&&t.bottom<=p.y+p.h-1;
    let relevant=mode==='missions'?allText.filter(t=>['Today','All','In Emberhollow','Done'].includes(t.value))
      :frontText.filter(t=>t.value.startsWith('· ')&&within(t,panel));
    const draws=foreground.filter(d=>d.kind==='rect');
    const buttons=mode==='upgrade'?frontText.filter(t=>['Upgrade','Not now'].includes(t.value)&&within(t,panel)).map(t=>{
      const candidates=draws.filter(d=>d.x<=t.left&&d.y<=t.top&&d.x+d.w>=t.right&&d.y+d.h>=t.bottom);
      return candidates.sort((a,b)=>a.w*a.h-b.w*b.h)[0];
    }):[];
    const screen=document.querySelector('#screen').getBoundingClientRect(),touch=document.querySelector('#touch');
    const dock=getComputedStyle(touch,'::before'),height=parseFloat(dock.height)||0;
    const dockTop=document.body.classList.contains('touch')&&dock.content!=='none'&&height
      ?(touch.getBoundingClientRect().bottom-height-screen.top)*180/screen.height:180;
    const missionContent=allText.filter(t=>t.y>=Math.min(...panels.map(p=>p.y))&&!t.value.startsWith('◀ ▶ tabs'));
    return {panel,panels,relevant,buttons,dockTop,missionContent,buttonText:frontText.filter(t=>['Upgrade','Not now'].includes(t.value)&&within(t,panel)),allBenefits:frontText.filter(t=>t.value.startsWith('· '))};
  },mode);
  if(mode==='missions') {
    assert.equal(layout.relevant.length,4,'all mission tab labels are painted');
    for(const t of layout.relevant)assert.ok(t.bottom<Math.min(...layout.panels.map(p=>p.y)),`${t.value} clears the mission panels`);
    for(const t of layout.missionContent) {
      assert.ok(layout.panels.some(p=>t.left>=p.x+1&&t.right<=p.x+p.w-1&&t.top>=p.y+1&&t.bottom<=p.y+p.h-1),`${t.value} is inside a mission panel`);
      assert.ok(t.bottom<layout.dockTop,`${t.value} clears the touch dock`);
    }
  } else {
    const expected=expectedBenefits||(mode==='cottage'?['A villager moves in','Smoke from the chimney']:['Plaza stones replace bare dirt','Room for two more buildings']);
    for(const label of expected)assert.ok(layout.relevant.some(t=>t.value.includes(label)),`${label} is visible inside the detail panel`);
    if(mode==='upgrade') {
      assert.equal(layout.buttons.length,2,'both upgrade buttons have their own painted backgrounds');
      for(const t of layout.relevant)for(const b of layout.buttons)assert.ok(t.bottom<=b.y||t.top>=b.y+b.h||t.right<=b.x||t.left>=b.x+b.w,`${t.value} clears the action buttons`);
      for(const t of [...layout.relevant,...layout.buttonText])assert.ok(t.bottom<layout.dockTop,`${t.value} clears the touch dock`);
    }
  }
  return layout;
}
async function drainDialogue(target='overworld') {
  for(let i=0;i<65;i++) {
    if(await page.evaluate(n=>__game.scene===n,target)) return;
    await press();
  }
  throw new Error(`Dialogue did not return to ${target}`);
}
async function storyToChoice() {
  for(let i=0;i<50;i++) {
    if(await page.evaluate(()=>__openingScenes.top?.touchPhase==='choices')) return;
    await press();
  }
  throw new Error('Starter choices never opened');
}
async function planRoute(tx,ty,{grass=false,npcMargin=false,avoid=[],movedNpcs=[]}={}) {
  return page.evaluate(({tx,ty,grass,npcMargin,avoid,movedNpcs})=>{
    const H=__openingHooks,m=H.world.currentMap(),start=H.world.playerTile();
    const k=(x,y)=>`${x},${y}`,goal=k(tx,ty), q=[[start.x,start.y]], seen=new Map([[k(start.x,start.y),null]]);
    for(let i=0;i<q.length;i++) {
      const [x,y]=q[i];if(k(x,y)===goal)break;
      for(const [dx,dy,d] of [[0,-1,'ArrowUp'],[1,0,'ArrowRight'],[0,1,'ArrowDown'],[-1,0,'ArrowLeft']]) {
        const nx=x+dx,ny=y+dy,key=k(nx,ny);
        if(seen.has(key)||avoid.includes(key)||m.solid(nx,ny)||H.village.solid(m,nx,ny)||m.ledge(nx,ny))continue;
        if(key!==goal && (m.warpAt(nx,ny)||(!grass&&m.isGrass(nx,ny))))continue;
        if((m.npcs||[]).some(n=>!movedNpcs.includes(n.who)&&Math.abs(n.x-nx)<=((npcMargin?n.wander:0)||0)&&Math.abs(n.y-ny)<=((npcMargin?n.wander:0)||0)))continue;
        seen.set(key,{prev:k(x,y),dir:d});q.push([nx,ny]);
      }
    }
    if(!seen.has(goal))return null;
    const route=[];for(let key=goal;seen.get(key);key=seen.get(key).prev)route.unshift(seen.get(key).dir);
    return route;
  },{tx,ty,grass,npcMargin,avoid,movedNpcs});
}
async function step(direction) {
  const before=await page.evaluate(()=>({...__openingHooks.world.playerTile()}));
  await page.keyboard.down(direction);
  try {
    await page.waitForFunction(p=>{
      const n=__openingHooks.world.playerTile();return n.x!==p.x||n.y!==p.y||n.map!==p.map||__game.scene!=='overworld';
    },before,{timeout:1800});
  } finally {await page.keyboard.up(direction);}
  await page.waitForFunction(()=>{
    const p=__openingHooks.world.playerTile(),s=__game.state.player;
    return (p.x===s.x&&p.y===s.y&&p.map===s.map)||__game.scene!=='overworld';
  });
  await page.waitForTimeout(35);
}
async function walkTo(x,y,opts={}) {
  const map=await page.evaluate(()=>__game.state.player.map);
  const avoid=[],movedNpcs=[];
  for(let i=0;i<160;i++) {
    if(await page.evaluate(()=>__game.scene!=='overworld'))return false;
    const p=await page.evaluate(()=>({...__game.state.player}));
    if(p.map!==map || (p.x===x&&p.y===y))return true;
    const route=await planRoute(x,y,{...opts,avoid,movedNpcs});
    assert.ok(route?.length,`No walkable route from ${p.map}:${p.x},${p.y} to ${x},${y}`);
    try {await step(route[0]);}
    catch(e) {
      if(await page.evaluate(()=>__openingPaint.some(t=>t.startsWith('Talk to ')))) {
        const [dx,dy]={ArrowUp:[0,-1],ArrowRight:[1,0],ArrowDown:[0,1],ArrowLeft:[-1,0]}[route[0]];
        const who=await page.evaluate(async()=>{
          const {NAMES}=await import(__MODULE_URLS['world/npc.js']);
          return Object.entries(NAMES).find(([,name])=>__openingPaint.includes('Talk to '+name))?.[0];
        });
        if(who)movedNpcs.push(who);
        if(p.x+dx!==x||p.y+dy!==y) {avoid.push(`${p.x+dx},${p.y+dy}`);continue;}
      }
      await shot('route-blocked');throw new Error(`${map} route blocked at ${p.x},${p.y} walking ${route[0]}: ${e.message}`);
    }
  }
  throw new Error(`Walking did not reach ${x},${y}`);
}
async function pauseItem(index) {
  await press('m');await scene('pause');
  for(let i=0;i<index;i++)await press('ArrowDown');
  await press();
}
async function settledWorld() {
  await scene('overworld');
  await page.waitForFunction(()=>!__openingUI.transitioning&&!__openingUI.busy);
  await page.waitForTimeout(200);
}
try {
  await page.goto(base+'/?autostart=1');await page.waitForFunction(()=>window.__boot?.ready);
  assert.deepEqual(await page.evaluate(()=>__game.boot.failed),[]);
  assert.equal(await page.evaluate(()=>localStorage.getItem('hearth.save.v1')),null,'isolated fresh profile');
  await observe(page);
  await page.evaluate(async()=>{
    const Hooks=__openingHooks;
    // Observe the natural encounter hook; fixed seed affects random outcomes only.
    const battle=Hooks.battle.start.bind(Hooks.battle);window.__openingBattles=[];
    Hooks.battle.start=async params=>{
      const clock=Date.now;Date.now=()=>((Number(window.__openingBattleSeed)||19)^__game.state.seed)>>>0;
      let result;try{result=battle(params);}finally{Date.now=clock;}
      const outcome=await result;__openingBattles.push({...params,outcome});return outcome;
    };
  });
  fixtures.push('Battle seed 19 is fixed at the natural encounter hook; exploration, species/level selection, combat, bonding and rewards execute unchanged.');
  fixtures.push('Cook Dinner Together is self-reported using the actual confirmation UI in this disposable test profile.');
  await page.getByRole('button',{name:'Begin your journey'}).click();await scene('__say');
  await drainDialogue();await settledWorld();await text('Meet Gran Willow');
  assert.equal(await page.evaluate(()=>__game.state.party.length),0);
  check('Fresh title and onboarding explain the first objective');
  await walkTo(17,9,{npcMargin:false});await settledWorld();
  assert.equal(await page.evaluate(()=>__game.state.player.map),'granhouse','the Warmhouse entrance remains accessible');
  await walkTo(10,8);await press('ArrowUp');
  await text('Talk to Gran Willow');
  await press('e');await scene('story');await storyToChoice();await shot('starter-choices');
  await press();await page.waitForFunction(()=>__game.state.party.length===1);await drainDialogue();await settledWorld();
  assert.equal(await page.evaluate(()=>__game.state.party[0].species),'embercub');
  assert.equal(await page.evaluate(()=>__game.state.flags['story.granHearth']),true);
  check('Walk from the village to Gran and choose exactly one starter');
  check('Walk through the Warmhouse door and navigate its interior');
  await walkTo(9,10);await page.waitForFunction(()=>__game.state.player.map==='village');await settledWorld();
  await walkTo(22,22);await press('ArrowUp');await text('Talk to Mayor Bramble');await press('e');await scene('story');
  await drainDialogue();await settledWorld();assert.equal(await page.evaluate(()=>__game.state.flags.metMayor),true);
  check('Meet the Mayor through world interaction and advance the journey hint');
  await walkTo(21,33);await page.waitForFunction(()=>__game.state.player.map==='meadow');await settledWorld();
  // Walk naturally in nearby grass until the authored seeded encounter occurs.
  let grassTargets=await page.evaluate(()=>{
    const m=__openingHooks.world.currentMap(),p=__game.state.player,out=[];
    for(let y=0;y<m.h;y++)for(let x=0;x<m.w;x++)if(m.isGrass(x,y)&&!m.solid(x,y))out.push({x,y,d:Math.abs(x-p.x)+Math.abs(y-p.y)});
    return out.sort((a,b)=>a.d-b.d).slice(0,16);
  });
  for(let i=0;i<60&&await page.evaluate(()=>__game.scene==='overworld');i++) {
    const target=grassTargets[i%grassTargets.length];await walkTo(target.x,target.y,{grass:true});
    await page.waitForTimeout(150);
  }
  await scene('battle');await text('Fight');await shot('first-battle');
  const beforeBattle=await page.evaluate(()=>({charms:__game.state.bag.charm,party:__game.state.party.length,hp:__game.state.party[0].hp}));
  await press();await text('POW');await shot('moves');await press();
  await text('Fight');check('Natural meadow encounter accepts a real move and returns control');
  await press('ArrowRight');await press();await text('WOVEN CHARM');
  await press('Escape');await text('Fight');
  assert.equal(await page.evaluate(()=>__game.state.bag.charm),beforeBattle.charms,'bond preview cancel is free');
  for(let attempt=0;attempt<5 && await page.evaluate(()=>__game.scene==='battle');attempt++) {
    await press();await text('WOVEN CHARM');await press();
    await page.waitForFunction(()=>__game.scene==='overworld'||__openingPaint.includes('Fight'),null,{timeout:25000});
    if(await page.evaluate(()=>__game.scene==='overworld'))break;
  }
  await settledWorld();await page.waitForFunction(()=>__openingBattles.length>0);
  observations.push({battles:await page.evaluate(()=>__openingBattles)});
  assert.equal(await page.evaluate(()=>__openingBattles[0].outcome),'bonded','seeded real battle bonds successfully');
  assert.equal(await page.evaluate(()=>__game.state.party.length),beforeBattle.party+1);
  assert.equal(await page.evaluate(()=>__game.state.stats.bonded),1);
  assert.ok(await page.evaluate(()=>__game.state.missions.completed['first-friend']));
  check('Bond preview cancellation, charm use, companion reward and first-friend mission');
  await walkTo(36,21);await page.waitForFunction(()=>__game.state.player.map==='forest');await settledWorld();
  await walkTo(2,16);await shot('forest-arrival');
  await walkTo(1,16);await page.waitForFunction(()=>__game.state.player.map==='meadow');await settledWorld();
  check('Walk through the meadow-to-forest connection and return with the same companions');
  await walkTo(19,0);await page.waitForFunction(()=>__game.state.player.map==='village');await settledWorld();
  await pauseItem(2);await scene('missions');await press('ArrowRight');await text('Cook Dinner Together');await assertMenuLayout(page,'missions');
  const beforeMission=await page.evaluate(()=>({coins:__game.state.coins,hearth:__game.state.hearth}));
  await press();await scene('__say');await drainDialogue('missions');
  assert.equal(await page.evaluate(()=>__game.state.missions.active.some(a=>a.id==='cook-together')),true);
  await press();await text('Yes, we did');await press('ArrowDown');await press();await scene('missions');
  assert.equal(await page.evaluate(()=>!!__game.state.missions.completed['cook-together']),false,'Not yet preserves mission');
  await press();await text('Yes, we did');await press();await scene('__say');await drainDialogue('missions');
  assert.ok(await page.evaluate(()=>__game.state.missions.completed['cook-together']));
  assert.deepEqual(await page.evaluate(()=>({coins:__game.state.coins,hearth:__game.state.hearth})),{coins:beforeMission.coins+20,hearth:beforeMission.hearth+8});
  await shot('family-mission');await press('Escape');await scene('pause');await press('Escape');await settledWorld();
  check('Track a family mission, decline completion, then confirm exactly one reward');
  await pauseItem(1);await scene('village');await press('ArrowDown');await shot('cottage-details');
  await assertMenuLayout(page,'cottage');
  observations.push({cottagePaint:await page.evaluate(()=>__openingPaint)});
  const beforeBuild=await page.evaluate(()=>({coins:__game.state.coins,hearth:__game.state.hearth,count:__game.state.village.buildings.length}));
  await press();await scene('build');await text('Looks like a good spot.');await shot('building-plot');
  await press();await scene('__say');await drainDialogue();await settledWorld();
  assert.equal(await page.evaluate(()=>__game.state.village.buildings.length),beforeBuild.count+1);
  assert.equal(await page.evaluate(()=>__game.state.village.buildings.filter(b=>b.type==='cottage').length),1);
  assert.deepEqual(await page.evaluate(()=>({coins:__game.state.coins,hearth:__game.state.hearth})),{coins:beforeBuild.coins-40,hearth:beforeBuild.hearth-2});
  check('Choose a cottage, accept a valid suggested plot and pay its exact cost');
  await pauseItem(1);await scene('village');await press('ArrowRight');await press();await scene('upgradecard');await shot('upgrade-preview');
  await assertMenuLayout(page,'upgrade');
  const beforeUpgrade=await page.evaluate(()=>({coins:__game.state.coins,hearth:__game.state.hearth}));
  await press('Escape');await scene('village');
  assert.equal(await page.evaluate(()=>__game.state.village.buildings.find(b=>b.type==='hearthstone').tier),1);
  await press();await scene('upgradecard');await press();await scene('__say');await drainDialogue('village');
  assert.equal(await page.evaluate(()=>__game.state.village.buildings.find(b=>b.type==='hearthstone').tier),2);
  // First Upgrade pays 20 coins and 4 Hearth after the 60/8 upgrade charge.
  assert.deepEqual(await page.evaluate(()=>({coins:__game.state.coins,hearth:__game.state.hearth})),{coins:beforeUpgrade.coins-40,hearth:beforeUpgrade.hearth-4});
  await press('Escape');await settledWorld();await shot('village-grown');
  check('Cancel upgrade safely, then upgrade the Hearthstone and receive the first-upgrade reward');
  await pauseItem(4);await scene('pause');await text('Progress saved on this device.');
  const saved=await page.evaluate(()=>({party:__game.state.party,bag:__game.state.bag,village:__game.state.village,missions:__game.state.missions,flags:__game.state.flags,coins:__game.state.coins,hearth:__game.state.hearth}));
  await page.reload();await page.waitForFunction(()=>__boot?.ready);await page.getByRole('button',{name:'Continue journey'}).click();await scene('overworld');
  const reloaded=await page.evaluate(()=>({party:__game.state.party,bag:__game.state.bag,village:__game.state.village,missions:__game.state.missions,flags:__game.state.flags,coins:__game.state.coins,hearth:__game.state.hearth}));
  assert.deepEqual(reloaded,saved);check('Journal save and Continue preserve the whole earned opening journey');
  // Resume the exact save earned above in a separate touch-capable context.
  // No progression is invented to make the phone checks pass.
  const phoneContext=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:2,storageState:await page.context().storageState()});
  const phone=await phoneContext.newPage();phone.on('pageerror',e=>errors.push(e.message));
  await phone.goto(base+'/?autostart=1');await phone.waitForFunction(()=>__boot?.ready);
  await observe(phone);
  await phone.getByRole('button',{name:'Continue journey'}).tap();await phone.waitForFunction(()=>__game.scene==='overworld');
  const tap=async id=>{await phone.locator('#'+id).tap();await phone.waitForTimeout(180);};
  await tap('tM');await phone.waitForFunction(()=>__game.scene==='pause');
  await tap('tdown');await tap('tdown');await tap('tA');await phone.waitForFunction(()=>__game.scene==='missions');
  await tap('tright');await phone.screenshot({path:'artifacts/opening-touch-family-missions.png'});await assertMenuLayout(phone,'missions');
  await phone.setViewportSize({width:568,height:320});await phone.waitForTimeout(250);
  await phone.screenshot({path:'artifacts/opening-touch-compact-missions.png'});await assertMenuLayout(phone,'missions');
  await tap('tB');await phone.waitForFunction(()=>__game.scene==='pause');await tap('tB');await phone.waitForFunction(()=>__game.scene==='overworld');
  await tap('tM');await phone.waitForFunction(()=>__game.scene==='pause');await tap('tdown');await tap('tA');await phone.waitForFunction(()=>__game.scene==='village');
  await tap('tdown');await assertMenuLayout(phone,'cottage');await phone.screenshot({path:'artifacts/opening-touch-compact-cottage.png'});
  await tap('tright');await tap('tA');await phone.waitForFunction(()=>__game.scene==='upgradecard');
  await phone.screenshot({path:'artifacts/opening-touch-upgrade.png'});
  await assertMenuLayout(phone,'upgrade',['Lanterns light the plaza at night','Banners and planters unlocked']);
  await tap('tB');await phone.waitForFunction(()=>__game.scene==='village');await tap('tB');await phone.waitForFunction(()=>__game.scene==='overworld');
  assert.deepEqual(await phone.evaluate(()=>({party:__game.state.party,bag:__game.state.bag,village:__game.state.village,missions:__game.state.missions,flags:__game.state.flags,coins:__game.state.coins,hearth:__game.state.hearth})),saved,'touch browsing and upgrade cancellation preserve earned progress');
  await phone.setViewportSize({width:568,height:320});await phone.waitForTimeout(250);await tap('tM');
  await phone.screenshot({path:'artifacts/opening-touch-compact-journal.png'});
  assert.equal(await phone.locator('#tA').isVisible(),true);assert.equal(await phone.locator('#tB').isVisible(),true);
  await phoneContext.close();
  check('Touch Continue, family mission tabs, upgrade preview/cancel and compact journal');
  assert.deepEqual(errors,[]);
  const result={pass:true,checks,fixtures,observations,errors};
  await writeFile('artifacts/opening-journey-results.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
} catch(error) {
  await shot('failure').catch(()=>{});
  const failure={pass:false,checks,fixtures,observations,errors,error:error.message,state:await page.evaluate(()=>window.__game&&({scene:__game.scene,player:__game.state.player,party:__game.state.party,coins:__game.state.coins,hearth:__game.state.hearth,paint:window.__openingPaint})).catch(()=>null)};
  await writeFile('artifacts/opening-journey-results.json',JSON.stringify(failure,null,2));console.error(JSON.stringify(failure,null,2));throw error;
} finally {await browser.close();}
