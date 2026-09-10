import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
test('standalone bundle parses and preserves every source module verbatim',async()=>{
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  const scripts=[...html.matchAll(/<script(?: type="module")?>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length,2,'embedded code cannot close its script tag');
  new vm.Script(scripts[0][1]);
  const start=scripts[0][1].indexOf('const MODULES = ')+'const MODULES = '.length;
  const end=scripts[0][1].indexOf('const URLS',start);
  const modules=JSON.parse(scripts[0][1].slice(start,end).trim().replace(/;$/,''));
  const seen=new Set();
  const fontData = `data:font/ttf;base64,${(await readFile(new URL('../assets/fonts/Nunito.ttf',import.meta.url))).toString('base64')}`;
  for(const mod of modules){
    const source=(await readFile(new URL('../src/'+mod.id,import.meta.url),'utf8')).replace(/\r\n/g,'\n');
    if(!source.includes('__BATTLE_ART__')) assert.equal(mod.code,source.replace('__HEARTH_FONT__',fontData),mod.id);
    for(const dep of Object.values(mod.deps)) assert.ok(seen.has(dep),`${mod.id} imports ${dep} before its URL exists`);
    seen.add(mod.id);
  }
  assert.equal(seen.size,51);
  assert.ok(!html.includes('__TITLE_ART__'));
  assert.ok(!html.includes('__BATTLE_ART__'));
  assert.ok(!html.includes('__OAK_ART__'));
  assert.ok(!/__\w+_ART__/.test(html), 'all generated asset placeholders are embedded');
  assert.ok(!html.includes('__HEARTH_FONT__'), 'font is embedded for offline use');
});
