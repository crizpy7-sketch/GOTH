import test, {beforeEach} from 'node:test';
import assert from 'node:assert/strict';
const data = new Map();
let failingKey = '', noReads = false;
globalThis.localStorage = {
  getItem(key) { if (noReads) throw new Error('storage blocked'); return data.get(key) ?? null; },
  setItem(key, value) { if (key === failingKey || failingKey === '*') throw new Error('storage full'); data.set(key,String(value)); },
  removeItem(key) { if (failingKey === '*') throw new Error('storage blocked'); data.delete(key); },
};
const state = await import('../src/state.js');
const originalKey = 'hearth.save.v1';
const choose = id => { assert.equal(state.selectProfile(id),true); state.initProfiles(); state.adopt(state.defaults()); if (state.hasSave()) state.load(); else state.loadPreferences(); };
beforeEach(() => { data.clear(); failingKey = ''; noReads = false; state.initProfiles(); state.adopt(state.defaults()); });

test('seven family profiles independently preserve village, companions, money, flags and settings across reloads', () => {
  assert.equal(state.FAMILY_SLOTS.length,7);
  state.S.coins = 934; state.save(); const original = data.get(originalKey);
  state.FAMILY_SLOTS.forEach((slot,index) => {
    choose(slot.id); assert.equal(state.hasSave(),false); assert.equal(state.S.coins,120);
    state.S.settings.readAloud = index % 2 === 0; state.S.settings.voiceRate = .78;
    assert.equal(state.startNewJourney(),true);
    state.S.coins = 200 + index; state.S.hearth = index;
    state.S.village.buildings = [{id:`home${index}`,type:'cottage',x:index+10,y:16,tier:1}];
    state.S.flags.personal = slot.id; state.S.party = [{id:'g1',species:'embercub',lvl:index+1,hp:15,maxhp:15}];
    assert.equal(state.save(),true);
  });
  state.FAMILY_SLOTS.forEach((slot,index) => {
    choose(slot.id);
    assert.equal(state.S.coins,200+index); assert.equal(state.S.hearth,index);
    assert.equal(state.S.village.buildings[0].id,`home${index}`); assert.equal(state.S.flags.personal,slot.id);
    assert.equal(state.S.party[0].lvl,index+1); assert.equal(state.S.settings.readAloud,index%2===0);
    assert.equal(state.S.settings.voiceRate,.78); assert.equal(state.S.player.name,slot.name);
  });
  choose('legacy'); assert.equal(state.S.coins,934); assert.equal(data.get(originalKey),original);
});

test('preferences in an empty profile never manufacture a journey or leak to another profile', () => {
  choose('child1'); state.S.settings.readAloud = true; state.S.settings.voiceURI = 'warm'; state.savePreferences();
  assert.equal(state.hasSave(),false);
  choose('child2'); assert.equal(state.S.settings.readAloud,false); state.S.settings.musicVolume=.2; state.savePreferences();
  choose('child1'); assert.equal(state.S.settings.readAloud,true); assert.equal(state.S.settings.voiceURI,'warm'); assert.equal(state.S.settings.musicVolume,.5);
  assert.equal(state.hasSave(),false); choose('legacy'); assert.equal(state.hasSave(),false); assert.equal(state.S.settings.readAloud,false);
});

test('a failed pre-journey preference write exposes a save issue and can recover without creating Continue', () => {
  choose('child1'); state.S.settings.readAloud=true;
  failingKey='hearth.profile.child1.preferences.v1'; assert.equal(state.savePreferences(),false);
  assert.equal(state.saveIssue(),'unavailable'); assert.equal(state.hasSave(),false);
  failingKey=''; assert.equal(state.savePreferences(),true); assert.equal(state.saveIssue(),'');
  choose('child1'); assert.equal(state.S.settings.readAloud,true); assert.equal(state.hasSave(),false);
});

test('choosing a profile stores only the next boot target and cannot move live-state ownership', () => {
  state.S.coins = 343; state.save();
  assert.equal(state.selectProfile('child1'),true); assert.equal(state.currentProfileId(),'legacy');
  state.S.coins = 344; assert.equal(state.save(),true);
  assert.equal(JSON.parse(data.get(originalKey)).coins,344); assert.equal(data.has(state.profileSaveKey('child1')),false);
  state.initProfiles(); assert.equal(state.currentProfileId(),'child1');
});

test('legacy copy is explicit, exact, independently writable and protected by an immutable first backup', () => {
  state.S.coins=456; state.S.settings.readAloud=true; state.save(); const original = data.get(originalKey);
  choose('child1'); assert.equal(data.has(state.LEGACY_BACKUP_KEY),false); assert.equal(state.hasSave(),false);
  assert.equal(state.copyLegacyToProfile('child1').ok,true);
  assert.equal(data.get(state.LEGACY_BACKUP_KEY),original); assert.equal(data.get(originalKey),original);
  assert.equal(data.get(state.profileSaveKey('child1')),original);
  choose('child1'); state.S.coins=999; state.save(); assert.equal(data.get(originalKey),original);
  choose('legacy'); state.S.coins=457; state.save(); const updated = data.get(originalKey);
  assert.equal(state.copyLegacyToProfile('parent1').ok,true);
  assert.equal(data.get(state.profileSaveKey('parent1')),updated); assert.equal(data.get(state.LEGACY_BACKUP_KEY),original);
});

test('backup failure prevents any destination write and preserves both the legacy save and current state', () => {
  state.save(); const original=data.get(originalKey), live=state.exportSave();
  failingKey=state.LEGACY_BACKUP_KEY;
  assert.equal(state.copyLegacyToProfile('child1').ok,false);
  assert.equal(data.has(state.profileSaveKey('child1')),false); assert.equal(data.get(originalKey),original);
  assert.equal(state.exportSave(),live);
});

test('an active empty-profile import cannot authorize stale defaults to overwrite the copy before reload', () => {
  state.S.coins=673; state.save(); const original=data.get(originalKey);
  choose('child1'); assert.equal(state.S.coins,120); assert.equal(state.copyLegacyToProfile('child1').ok,true);
  state.S.settings.readAloud=true; const warn=console.warn; console.warn=()=>{};
  try { assert.equal(state.save(),false); } finally { console.warn=warn; }
  assert.equal(data.get(state.profileSaveKey()),original);
  choose('child1'); assert.equal(state.S.coins,673); assert.equal(state.save(),true);
});

test('destination failure leaves a verified backup and never reports a copied journey', () => {
  state.save(); const original=data.get(originalKey); failingKey=state.profileSaveKey('child1');
  assert.equal(state.copyLegacyToProfile('child1').ok,false);
  assert.equal(data.get(state.LEGACY_BACKUP_KEY),original); assert.equal(data.get(originalKey),original);
  assert.equal(data.has(state.profileSaveKey('child1')),false);
});

test('copy refuses occupied, corrupt, unknown and legacy destinations without changing any bytes', () => {
  state.save(); data.set(state.profileSaveKey('child1'),'broken'); const before=[...data];
  for (const id of ['child1','legacy','child8','../../save']) assert.equal(state.copyLegacyToProfile(id).ok,false);
  assert.deepEqual([...data],before);
  for (const original of ['null','[]','{}','"text"','{broken',JSON.stringify({...state.defaults(),version:999})]) {
    data.set(originalKey,original); assert.equal(state.copyLegacyToProfile('child2').ok,false);
    assert.equal(data.get(originalKey),original); assert.equal(data.has(state.profileSaveKey('child2')),false);
  }
});

test('new journey atomically replaces only the selected profile and keeps that profile’s reading preferences', () => {
  choose('child1'); state.startNewJourney(); state.S.coins=445; state.save(); const child1=data.get(state.profileSaveKey('child1'));
  choose('child2'); state.S.settings.readAloud=true; state.startNewJourney(); state.S.coins=800; state.save();
  assert.equal(state.startNewJourney(),true); assert.equal(state.S.coins,120); assert.equal(state.S.settings.readAloud,true);
  assert.equal(data.get(state.profileSaveKey('child1')),child1); assert.equal(data.has(originalKey),false);
});

test('failed new-journey write preserves previous saved bytes and live earned progress', () => {
  choose('parent2'); state.startNewJourney(); state.S.coins=880; state.save();
  const raw=data.get(state.profileSaveKey()), live=state.exportSave(); failingKey=state.profileSaveKey();
  assert.equal(state.startNewJourney(),false); assert.equal(data.get(state.profileSaveKey()),raw); assert.equal(state.exportSave(),live);
});

test('profile labels are bounded plain text, survive reload, and never rename an existing hero', () => {
  choose('child1'); state.startNewJourney(); const original=state.S.player.name;
  assert.equal(state.renameProfile('child1','  Luna & Willow  '),true); choose('child1');
  assert.equal(state.profileRows()[0].name,'Luna & Willow'); assert.equal(state.S.player.name,original);
  assert.equal(state.renameProfile('child1','x'.repeat(40)),true); assert.equal(state.profileRows()[0].name.length,24);
  assert.equal(state.renameProfile('child1','   '),false); assert.equal(state.renameProfile('legacy','Other'),false);
  assert.equal(state.selectProfile('unknown'),false);
});

test('a second tab changing the same profile blocks stale autosave and preference writes until reload', async () => {
  choose('child1'); state.startNewJourney();
  const other = await import('../src/state.js?second-family-tab'); other.initProfiles(); assert.equal(other.load(),true);
  other.S.coins=810; assert.equal(other.save(),true); const newer=data.get(state.profileSaveKey());
  state.S.coins=999; const warn=console.warn; console.warn=()=>{};
  try { assert.equal(state.save(),false); } finally { console.warn=warn; }
  assert.equal(state.saveIssue(),'conflict'); assert.equal(data.get(state.profileSaveKey()),newer);
  assert.equal(state.savePreferences(),false); assert.equal(state.startNewJourney(),false);
  choose('child1'); assert.equal(state.S.coins,810); state.S.coins=811; assert.equal(state.save(),true);
});

test('different tabs can own different profiles without redirecting each other’s save keys', async () => {
  choose('child1'); state.startNewJourney();
  state.selectProfile('parent1'); const other=await import('../src/state.js?different-family-tab'); other.initProfiles(); other.adopt(other.defaults()); other.startNewJourney();
  state.S.coins=333; other.S.coins=777; assert.equal(state.save(),true); assert.equal(other.save(),true);
  assert.equal(JSON.parse(data.get(state.profileSaveKey('child1'))).coins,333);
  assert.equal(JSON.parse(data.get(state.profileSaveKey('parent1'))).coins,777);
});

test('invalid metadata, unreadable saves and blocked localStorage never invent playable saves', () => {
  data.set('hearth.family.active.v1','unknown'); data.set('hearth.family.names.v1','null'); data.set(originalKey,'null');
  state.initProfiles(); assert.equal(state.currentProfileId(),'legacy'); assert.equal(state.hasSave(),false); assert.equal(state.load(),false);
  assert.equal(state.profileRows().at(-1).status,'invalid'); assert.equal(state.profileRows()[0].name,'Child 1');
  noReads=true; state.initProfiles(); assert.equal(state.hasSave(),false); assert.equal(state.startNewJourney(),false);
  assert.equal(state.selectProfile('child1'),false); assert.equal(state.profileRows()[0].status,'unavailable');
  assert.equal(state.saveIssue(),'unavailable');
});
