import {createRequire} from 'node:module';
import {mkdir, writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require = createRequire(process.env.GOTH_NODE_MODULES ? process.env.GOTH_NODE_MODULES + '/' : import.meta.url);
const {chromium} = require('playwright');
const base = process.env.GOTH_URL || 'http://127.0.0.1:4173';
await mkdir('artifacts', {recursive:true});
const browser = await chromium.launch({headless:true});
const errors = [], checks = [], layouts = [];

function instrument({unsupported = false} = {}) {
  // Speech lifecycle is deterministic; these tests do not judge voice warmth or
  // claim that Chromium's mock verifies an installed iPad voice.
  window.__speech = {log:[], pending:[], end() {
    const line = this.pending.shift(); line?.onend?.({});
  }};
  if (unsupported) {
    Object.defineProperty(window, 'speechSynthesis', {configurable:true, value:undefined});
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {configurable:true, value:undefined});
  } else {
    const voice = {name:'Samantha Enhanced', voiceURI:'test-warm-english', lang:'en-US', localService:true, default:true};
    const synth = {
      getVoices:()=>[voice], addEventListener() {},
      speak(line) {
        __speech.pending.push(line);
        __speech.log.push({type:'speak', text:line.text, rate:line.rate, volume:line.volume, voice:line.voice?.voiceURI});
        line.onstart?.({});
      },
      cancel() {
        __speech.log.push({type:'cancel', texts:__speech.pending.map(line=>line.text)});
        const old = __speech.pending.splice(0);
        for (const line of old) line.onerror?.({error:'canceled'});
      },
    };
    Object.defineProperty(window, 'speechSynthesis', {configurable:true, value:synth});
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {configurable:true, value:class {constructor(text) {this.text=text;}}});
  }
  // Capture genuine browser WebAudio contexts without replacing their behavior.
  window.__audioContexts = [];
  const NativeContext = window.AudioContext;
  if (NativeContext) window.AudioContext = new Proxy(NativeContext, {
    construct(Target, args) {const context = Reflect.construct(Target,args); __audioContexts.push(context); return context;},
  });
}
async function prepare({width=1280,height=800,touch=false,unsupported=false} = {}) {
  const context = await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch});
  await context.addInitScript(instrument,{unsupported});
  const page = await context.newPage(); page.setDefaultTimeout(12000);
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base + '/?autostart=1');
  await page.waitForFunction(()=>window.__boot?.ready);
  assert.deepEqual(await page.evaluate(()=>__game.boot.failed),[]);
  await page.locator('#titleReading').waitFor({state:'visible'});
  await observeCanvas(page);
  return page;
}
async function observeCanvas(page) {
  await page.evaluate(async()=>{
    const {R}=await import(__MODULE_URLS['core/renderer.js']);
    const begin=R.begin.bind(R), text=R.text.bind(R);
    window.__painted=[];
    R.begin=(...args)=>{__painted.length=0;return begin(...args);};
    R.text=(value,x,y,options={})=>{__painted.push({text:String(value),x,y,...options});return text(value,x,y,options);};
  });
}
const pause = (page,ms=150)=>page.waitForTimeout(ms);
async function key(page,name='Enter') {await page.keyboard.press(name); await pause(page);}
async function playKey(page,name='Enter') {await page.locator('#screen').focus(); await key(page,name);}
const scene = (page,name)=>page.waitForFunction(name=>__game.scene===name,name);
const caption = page=>page.evaluate(async()=>{const {Narration}=await import(__MODULE_URLS['core/narration.js']);return Narration.currentText;});
const speech = page=>page.evaluate(()=>__speech.log.filter(item=>item.type==='speak'));
const count = async page=>(await speech(page)).length;
const phase = page=>page.evaluate(async()=>{const {Scenes}=await import(__MODULE_URLS['core/scene.js']);return Scenes.top?.touchPhase;});
const visible = page=>page.evaluate(()=>__painted.filter(line=>line.limit!==undefined).map(line=>line.text.slice(0,line.limit)).join(' ').replace(/\s+/g,' ').trim());
async function expectCurrentOnce(page, previousCount) {
  if(previousCount!==undefined) await page.waitForFunction(n=>__speech.log.filter(item=>item.type==='speak').length>n,previousCount);
  await page.waitForFunction(async()=>{
    const {Narration}=await import(__MODULE_URLS['core/narration.js']);
    return Narration.currentText && __speech.log.filter(item=>item.type==='speak').at(-1)?.text===Narration.currentText;
  });
  const text = await caption(page), spoken = await speech(page);
  if (previousCount !== undefined) assert.equal(spoken.length,previousCount+1,`one utterance for ${text}`);
  await pause(page,250); assert.equal((await speech(page)).length,spoken.length,'idle rendering never repeats the page');
  return text;
}
async function enterWorld(page) {
  for(let i=0;i<24 && await page.evaluate(()=>__game.scene!=='overworld');i++) await playKey(page);
  await scene(page,'overworld'); await pause(page);
}
async function layoutCheck(page,width,height) {
  const bounds = await page.evaluate(()=>{
    const box=id=>{const r=document.getElementById(id).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right};};
    return {screen:box('screen'),rail:box('readingRail'),listen:box('listenCaption'),options:box('readingOptions')};
  });
  assert.ok(bounds.rail.y>=bounds.screen.bottom-1,`${width}: reading controls stay below canvas`);
  assert.ok(bounds.rail.bottom<=height+1 && bounds.rail.x>=0 && bounds.rail.right<=width,`${width}: rail fits viewport`);
  for(const id of ['listen','options']) assert.ok(bounds[id].height>=40 && bounds[id].width>=40,`${width}: ${id} has a comfortable touch target`);
  layouts.push({width,height,...bounds});
  await page.screenshot({path:`artifacts/sound-${width}-story.png`});
  await page.locator('#readingOptions').click(); await scene(page,'sound-settings');
  const player = await page.evaluate(()=>JSON.stringify({player:__game.state.player,party:__game.state.party,clock:__game.state.clock}));
  await page.locator('#sound-volume').focus(); await key(page,'ArrowLeft');
  await key(page,'ArrowDown');
  assert.equal(await page.evaluate(()=>JSON.stringify({player:__game.state.player,party:__game.state.party,clock:__game.state.clock})),player,'native range keys cannot leak into gameplay');
  await page.locator('#voicePreview').focus(); await key(page,'Tab');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'soundClose','Tab wraps inside the sound dialog');
  await key(page,'Shift+Tab');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'voicePreview','reverse Tab remains inside the dialog');
  const card = await page.locator('.sound-card').evaluate(el=>({scroll:el.scrollHeight,height:el.clientHeight,top:el.getBoundingClientRect().top,bottom:el.getBoundingClientRect().bottom}));
  assert.ok(card.top>=-1 && card.bottom<=height+1,'sound card is bounded by the viewport');
  if(height<450) assert.ok(card.scroll>card.height,'small screens scroll to all settings');
  await page.screenshot({path:`artifacts/sound-${width}-settings.png`});
  await key(page,'Escape'); await scene(page,'story');
  assert.equal(await page.locator('#soundPanel').isVisible(),false);
}

async function shiftedViewportCheck(page) {
  const view={width:900,height:600,offsetLeft:24,offsetTop:70};
  await page.evaluate(view=>{
    const original=Object.getOwnPropertyDescriptor(window,'visualViewport');
    window.__restoreVisualViewport=()=>{
      if(original) Object.defineProperty(window,'visualViewport',original);
      else delete window.visualViewport;
      window.dispatchEvent(new Event('resize'));
    };
    Object.defineProperty(window,'visualViewport',{configurable:true,value:{...view,addEventListener(){},removeEventListener(){}}});
    window.dispatchEvent(new Event('resize'));
  },view);
  await page.waitForFunction(()=>document.documentElement.style.getPropertyValue('--vv-top')==='70px');
  await pause(page,200);
  const boxes=await page.evaluate(()=>Object.fromEntries(['screen','readingRail'].map(id=>{
    const r=document.getElementById(id).getBoundingClientRect();
    return [id,{x:r.x,y:r.y,right:r.right,bottom:r.bottom}];
  })));
  for(const [id,box] of Object.entries(boxes)) {
    assert.ok(box.x>=view.offsetLeft-1 && box.right<=view.offsetLeft+view.width+1,`${id} follows visual viewport horizontal bounds`);
    assert.ok(box.y>=view.offsetTop-1 && box.bottom<=view.offsetTop+view.height+1,`${id} follows visual viewport vertical bounds`);
  }
  assert.ok(boxes.readingRail.y>=boxes.screen.bottom-1,'offset reading rail remains below the game');
  layouts.push({mode:'simulated-visual-viewport',view,...boxes});
  await page.screenshot({path:'artifacts/sound-ipad-offset-viewport.png'});
  await page.evaluate(()=>__restoreVisualViewport());
}

async function gamepadBackCheck(page) {
  for(let i=0;i<30 && (await phase(page))!=='choices';i++) await playKey(page);
  assert.equal(await phase(page),'choices');
  await page.locator('#readingOptions').click(); await scene(page,'sound-settings');
  await page.evaluate(()=>{
    const original=Object.getOwnPropertyDescriptor(navigator,'getGamepads');
    window.__padBack=false;
    window.__restoreGamepad=()=>{
      window.__padBack=false;
      if(original) Object.defineProperty(navigator,'getGamepads',original);
      else delete navigator.getGamepads;
    };
    Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[{
      buttons:Array.from({length:17},(_,i)=>({pressed:i===1 && __padBack})),axes:[0,0],
    }]});
  });
  await pause(page,100);
  await page.evaluate(()=>{__padBack=true;});
  await scene(page,'story'); await pause(page,400);
  assert.equal(await phase(page),'choices','holding gamepad Back closes only the sound dialog');
  assert.equal(await page.evaluate(()=>__game.state.party.length),0);
  await page.evaluate(()=>{__padBack=false;}); await pause(page,120);
  await page.evaluate(()=>{__padBack=true;});
  await scene(page,'overworld');
  await page.evaluate(()=>__restoreGamepad());
}

try {
  const page = await prepare();
  assert.equal(await page.locator('#titleReading').getAttribute('aria-pressed'),'false');
  const titleBefore = await count(page);
  await page.locator('#titleReading').click();
  assert.equal(await page.locator('#titleReading').getAttribute('aria-pressed'),'true');
  await expectCurrentOnce(page,titleBefore);
  assert.equal(await page.evaluate(async()=>(await import(__MODULE_URLS['core/audio.js'])).Audio.narrating),true,'reading ducks the music mix');
  checks.push('trusted title toggle starts exactly one reading');
  await page.waitForFunction(()=>__audioContexts.length>0 && __audioContexts[0].state==='running');
  await page.evaluate(()=>__audioContexts[0].suspend());
  assert.equal(await page.evaluate(()=>__audioContexts[0].state),'suspended');
  await page.locator('#listenCaption').click();
  await page.waitForFunction(()=>__audioContexts[0].state==='running');
  assert.equal(await page.evaluate(async()=>(await import(__MODULE_URLS['core/audio.js'])).Audio.narrating),false,'Stop restores the normal music mix');
  checks.push('real WebAudio resumes on a subsequent trusted gesture');

  const stopped = await count(page);
  await key(page,'Shift'); assert.equal(await count(page),stopped,'an unrelated gesture does not restart stopped narration');
  await page.locator('#listenCaption').click();
  assert.equal(await count(page),stopped+1,'Listen replays one whole caption');
  await page.locator('#listenCaption').click();
  assert.equal(await page.evaluate(()=>__speech.pending.length),0);
  checks.push('Listen replay and Stop preserve user control');

  await page.reload(); await page.waitForFunction(()=>__boot?.ready);
  await observeCanvas(page);
  assert.equal(await page.locator('#titleReading').getAttribute('aria-pressed'),'true','reading preference survives a reload before starting the game');
  assert.equal(await page.getByRole('button',{name:'Continue journey'}).count(),0,'sound preferences do not create a phantom game save');

  await page.getByRole('button',{name:'Begin your journey'}).click();
  await scene(page,'__say'); await pause(page,220);
  const welcome = await expectCurrentOnce(page);
  assert.equal(await visible(page),welcome,'onboarding speaks the whole visible caption');
  assert.ok(welcome.startsWith('Welcome to Emberhollow.'));
  const firstPage = await count(page); await pause(page,500);
  assert.equal(await count(page),firstPage); assert.equal(await page.evaluate(()=>__game.scene),'__say');
  await playKey(page); await expectCurrentOnce(page,firstPage);
  assert.notEqual(await caption(page),welcome);
  assert.ok(await page.evaluate(text=>__speech.log.some(item=>item.type==='cancel' && item.texts.includes(text)),welcome));
  await enterWorld(page); checks.push('onboarding captions match visible pages and advance only on player input');

  await page.evaluate(()=>__game.goto('overworld',{map:'granhouse',x:10,y:8,dir:'up'})); await pause(page,200);
  await playKey(page,'e'); await scene(page,'story'); await pause(page,380);
  await expectCurrentOnce(page); assert.equal(await visible(page),await caption(page));
  for(let i=0;i<30 && (await phase(page))!=='choices';i++) await playKey(page);
  assert.equal(await phase(page),'choices');
  assert.equal(await page.evaluate(()=>__game.state.party.length),0);
  const choiceBefore = await count(page); await playKey(page,'ArrowRight');
  const choiceText = await expectCurrentOnce(page,choiceBefore); assert.ok(choiceText.startsWith('Leafowl.'));
  await pause(page,500); assert.equal(await page.evaluate(()=>__game.state.party.length),0,'reading a companion never chooses it');
  checks.push('Gran story narration and selected companion detail never auto-commit');
  await layoutCheck(page,1280,800);
  await playKey(page,'Escape'); await scene(page,'overworld');
  assert.ok(!(await caption(page)).startsWith('Leafowl.'),'old story caption is replaced after exit');

  await page.evaluate(()=>__game.goto('missions')); await scene(page,'missions'); await pause(page);
  const mission = await caption(page);
  assert.ok(mission.length>30 && /Track|together|mission|done|today/i.test(mission));
  const missionBefore=await count(page); await playKey(page,'ArrowDown');
  assert.notEqual(await expectCurrentOnce(page,missionBefore),mission);
  checks.push('mission selection reads its title and instructions');

  await page.evaluate(()=>{__game.grantStarter('embercub'); __game.goto('battle');}); await scene(page,'battle'); await pause(page,1900);
  const intro=await caption(page);
  assert.ok(intro && !intro.includes('Choose a move.'));
  await pause(page,500); assert.equal(await caption(page),intro,'battle introduction waits while its voice reads');
  await playKey(page); await pause(page,250);
  assert.ok((await caption(page)).includes('Choose a move.'));
  const battleBefore=await count(page); await playKey(page);
  const move=await expectCurrentOnce(page,battleBefore); assert.ok(move.includes('move.') && move.includes('Select to use'));
  const hp=await page.evaluate(()=>__game.state.party[0].hp); await pause(page,450);
  assert.equal(await page.evaluate(()=>__game.state.party[0].hp),hp,'reading move options never attacks');
  checks.push('battle commands and moves read without executing them');

  await page.locator('#readingOptions').click(); await scene(page,'sound-settings');
  await page.locator('#sound-voiceURI').selectOption('test-warm-english');
  await page.locator('#sound-voiceRate').selectOption('0.78');
  for(const [id,expected] of [['volume',0.65],['musicVolume',0.45],['effectsVolume',0.85],['voiceVolume',0.85]]) {
    await page.locator('#sound-'+id).focus(); await key(page,'Home');
    for(let i=0;i<Math.round(expected*20);i++) await page.locator('#sound-'+id).press('ArrowRight');
    assert.equal(await page.evaluate(id=>__game.state.settings[id],id),expected);
  }
  const previewBefore=await count(page); await page.locator('#voicePreview').click();
  assert.equal(await count(page),previewBefore+1,'Hear this voice issues only one sample');
  const sample=(await speech(page)).at(-1); assert.equal(sample.voice,'test-warm-english'); assert.equal(sample.rate,0.78);
  assert.ok(Math.abs(sample.volume-0.65*0.85)<0.00001);
  await page.locator('#sound-muted').check();
  assert.equal(await page.evaluate(()=>__speech.pending.length),0,'master mute cancels speech immediately');
  await page.locator('#sound-muted').uncheck();
  assert.equal(await page.locator('#sound-saved').textContent(),'Saved on this device.');
  const preferences=await page.evaluate(()=>({...__game.state.settings}));
  await page.locator('#soundClose').click(); await scene(page,'battle'); await pause(page);
  assert.equal(await caption(page),move,'closing settings restores the battle caption');
  await page.reload(); await page.waitForFunction(()=>__boot?.ready);
  await observeCanvas(page);
  for(const id of ['readAloud','muted','volume','musicVolume','effectsVolume','voiceVolume','voiceRate','voiceURI'])
    assert.equal(await page.evaluate(id=>__game.state.settings[id],id),preferences[id],`${id} survives reload`);
  checks.push('native mix controls, voice preview, mute, restoration and save reload');

  await page.getByRole('button',{name:'Continue journey'}).click(); await scene(page,'overworld');
  await page.locator('#readingOptions').click(); await page.locator('#sound-readAloud').uncheck();
  await page.locator('#soundClose').click();
  assert.equal(await page.locator('#readingRail').isVisible(),false);
  await page.evaluate(async()=>{const {UIx}=await import(__MODULE_URLS['core/bridge.js']);window.__readingExample=UIx.say('The lanterns will guide you home. Take your time and follow the little path.');});
  await scene(page,'__say'); await pause(page,150);
  assert.ok((await visible(page)).length<(await caption(page)).length,'read-aloud off restores the typewriter reveal');
  await playKey(page); assert.equal(await visible(page),await caption(page),'first press reveals text without changing page');
  checks.push('turning reading off preserves classic typewriter and reveal controls');
  await page.context().close();

  for(const [width,height] of [[844,390],[568,320],[1024,768]]) {
    const mobile = await prepare({width,height,touch:true});
    await mobile.locator('#titleReading').tap();
    await mobile.evaluate(()=>__game.goto('overworld',{map:'granhouse',x:10,y:8,dir:'up'})); await pause(mobile,200);
    await mobile.locator('#tA').tap(); await scene(mobile,'story'); await pause(mobile,400);
    await layoutCheck(mobile,width,height);
    if(width===1024) { await shiftedViewportCheck(mobile); await gamepadBackCheck(mobile); }
    await mobile.context().close();
  }
  checks.push('desktop, two landscape phones and iPad-size reading rail and scrolling sound dialog');
  checks.push('simulated visual viewport offset and height keep captions and reading controls inside the visible area');
  checks.push('held gamepad Back closes only sound settings until the button is released and pressed again');

  const unsupported = await prepare({unsupported:true});
  await unsupported.locator('#titleReading').click();
  assert.equal(await unsupported.locator('#listenCaption').isDisabled(),true);
  assert.match(await unsupported.locator('#readingStatus').textContent(),/unavailable/);
  await unsupported.getByRole('button',{name:'Begin your journey'}).click();
  await scene(unsupported,'__say'); await enterWorld(unsupported);
  assert.equal(await count(unsupported),0);
  checks.push('unsupported speech browser remains playable with a clear status');
  assert.deepEqual(errors,[]);
  const result={pass:true,checks,layouts,errors,limitations:['Speech output mocked for deterministic lifecycle verification; voice quality and physical iPad playback require device listening.','WebAudio context is the real Chromium implementation.','Disposable browser profiles; no existing family save data accessed.']};
  await writeFile('artifacts/sound-browser-results.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
} catch(error) {
  for(const page of browser.contexts().flatMap(context=>context.pages())) {
    await page.screenshot({path:'artifacts/sound-browser-failure.png'}).catch(()=>{});
    await writeFile('artifacts/sound-browser-failure-state.json',JSON.stringify(await page.evaluate(()=>({scene:window.__game?.scene,speech:window.__speech?.log,body:document.body.className})).catch(()=>({})),null,2));
  }
  await writeFile('artifacts/sound-browser-results.json',JSON.stringify({pass:false,checks,layouts,errors,failure:error.message},null,2));
  throw error;
} finally {await browser.close();}

