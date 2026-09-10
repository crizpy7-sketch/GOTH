import test, {beforeEach} from 'node:test';
import assert from 'node:assert/strict';
const storage = new Map();
globalThis.localStorage = {getItem:k=>storage.get(k) ?? null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
const {S,defaults,adopt,save,hasSave,savePreferences,loadPreferences,normalizeState} = await import('../src/state.js');
beforeEach(()=>{storage.clear();adopt(defaults());});

test('choosing reading preferences cannot create a Continue journey before onboarding',()=>{
  S.settings.readAloud=true;S.settings.voiceURI='device-voice';
  assert.equal(savePreferences(),true);assert.equal(hasSave(),false);
  adopt(defaults());assert.equal(loadPreferences(),true);
  assert.equal(S.settings.readAloud,true);assert.equal(S.settings.voiceURI,'device-voice');
  assert.equal(hasSave(),false);assert.equal(S.party.length,0);
});
test('reading preferences normalize corrupt values without replacing earned progress',()=>{
  S.coins=287;S.flags.gotStarter=true;
  storage.set('hearth.preferences.v1',JSON.stringify({volume:5,voiceRate:-2,voiceURI:23,musicVolume:'bad',readAloud:'false'}));
  assert.equal(loadPreferences(),true);assert.equal(S.settings.volume,1);
  assert.equal(S.settings.voiceRate,.65);assert.equal(S.settings.voiceURI,'');
  assert.equal(S.settings.musicVolume,.5);assert.equal(S.settings.readAloud,false);
  assert.equal(S.coins,287);assert.equal(S.flags.gotStarter,true);
});
test('older saves get reading off and safe sound defaults while keeping their existing settings',()=>{
  const old=defaults();old.settings={volume:.3,muted:true,textSpeed:3};
  const normalized=normalizeState(old);
  assert.equal(normalized.settings.readAloud,false);assert.equal(normalized.settings.voiceRate,.88);
  assert.equal(normalized.settings.effectsVolume,.9);assert.equal(normalized.settings.volume,.3);
  adopt(normalized);save();assert.equal(hasSave(),true);
});
