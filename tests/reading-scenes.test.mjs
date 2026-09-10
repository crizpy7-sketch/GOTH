import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = {};
globalThis.document = { getElementById: () => null };
globalThis.localStorage = { setItem() {}, getItem() { return null; } };
const [{ register: registerText }, { register: registerStory }, { Narration }, { R }, { Input },
  { Scenes }, { UIx }, { Atlas }, { Audio }, { S, adopt, defaults }, { Font }, { Frame }] = await Promise.all([
  import('../src/ui/textbox.js'), import('../src/ui/story.js'), import('../src/core/narration.js'),
  import('../src/core/renderer.js'), import('../src/core/input.js'), import('../src/core/scene.js'),
  import('../src/core/bridge.js'), import('../src/art/atlas.js'), import('../src/core/audio.js'),
  import('../src/state.js'), import('../src/core/font.js'), import('../src/ui/frame.js'),
]);
registerText(); registerStory();
Scenes.register('reading-world', () => ({}));

const frame = () => { Input.runScripted(); Scenes.update(1 / 60); Input.endFrame(); };
const frames = n => { for (let i = 0; i < n; i++) frame(); };
const press = button => { Input.script(button, 1); frame(); };
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };
let captions, clears, sounds, texts;

beforeEach(t => {
  while (Scenes.top) Scenes.pop();
  adopt(defaults()); S.settings.reducedMotion = true; S.settings.readAloud = true;
  Input.reset(); Input.enabled = true;
  captions = []; clears = []; sounds = []; texts = [];
  t.mock.method(Narration, 'set', (text, options) => captions.push({ text, ...options }));
  t.mock.method(Narration, 'clear', owner => clears.push(owner));
  t.mock.method(Font, 'wrap', text => String(text).split('|'));
  t.mock.method(Audio, 'hasSong', () => false);
  t.mock.method(Audio, 'sfx', name => sounds.push(name));
  t.mock.method(Atlas, 'has', () => false);
  t.mock.method(Atlas, 'tryGet', () => null);
  t.mock.method(R, 'layer', (_, draw) => draw());
  for (const method of ['rect', 'stroke', 'blit']) t.mock.method(R, method, () => {});
  t.mock.method(R, 'measure', text => String(text).length * 4);
  t.mock.method(R, 'text', (text, x, y, options) => texts.push({ text, ...options }));
  for (const method of ['panel', 'tab', 'cursor']) t.mock.method(Frame, method, () => {});
  t.mock.getter(R, 'ctx', () => ({ globalAlpha: 1, save() {}, restore() {}, beginPath() {}, rect() {}, clip() {} }));
  Scenes.push('reading-world');
});

function visibleCaption() {
  texts.length = 0; Scenes.render();
  return texts.filter(line => line.limit !== undefined).map(line => line.text.slice(0, line.limit)).join(' ');
}

test('textbox reads each visible page once and choice movement speaks only the selected label', () => {
  UIx.ask('First line.|Second line.|Third line.|Take a rest?', ['Yes', 'Not yet'], { speaker: 'Gran Willow' });
  const scene = Scenes.top;
  frames(7);
  assert.equal(visibleCaption(), 'First line. Second line. Third line.');
  assert.equal(captions.length, 1);
  assert.equal(captions[0].text, visibleCaption());
  assert.equal(captions[0].speaker, 'Gran Willow');
  assert.equal(captions[0].owner, scene);
  frames(120);
  assert.equal(captions.length, 1, 'idle frames never queue the caption again');
  assert.equal(Scenes.top, scene, 'speech never advances the page');
  press('a');
  assert.equal(captions.length, 2);
  assert.equal(captions[1].text, 'Take a rest? Yes.');
  press('down');
  assert.equal(captions.at(-1).text, 'Take a rest? Not yet.', 'replay retains the page and current choice');
  assert.equal(captions.at(-1).utterance, 'Not yet.', 'navigation speaks only the new choice');
  frames(120);
  assert.equal(captions.length, 3);
  assert.equal(Scenes.top, scene, 'speech never selects the choice');
  assert.ok(!sounds.includes('text'), 'read-aloud has no competing typewriter clicks');
  press('b');
  assert.equal(clears.at(-1), scene, 'cancel stops speech before the closing animation');
  frames(8);
  assert.equal(Scenes.topName, 'reading-world');
  assert.equal(clears.at(-1), scene, 'exit reliably clears its own caption');
});

test('story reads a choice and the granted companion epilogue without advancing or granting twice', async () => {
  let grant, calls = 0;
  const pending = UIx.story({
    speaker: 'Gran Willow', lines: ['Welcome home.', 'Choose a friend.'],
    choices: [
      { id: 'embercub', label: 'Embercub', detail: 'A little spark with a warm heart.' },
      { id: 'leafowl', label: 'Leafowl', detail: 'A thoughtful friend of the forest.' },
    ],
    onChoose: () => { calls++; return new Promise(resolve => { grant = resolve; }); },
  });
  const scene = Scenes.top;
  frame();
  assert.equal(visibleCaption(), 'Welcome home.');
  assert.equal(captions.length, 1);
  press('a');
  assert.equal(captions.at(-1).text, 'Choose a friend.');
  press('a');
  assert.equal(captions.at(-1).text, 'Embercub. A little spark with a warm heart.');
  press('right');
  assert.equal(captions.at(-1).text, 'Leafowl. A thoughtful friend of the forest.');
  frames(180);
  assert.equal(captions.length, 4);
  assert.equal(calls, 0);
  press('a');
  assert.equal(clears.at(-1), scene, 'pending grant silences the old choice');
  frames(30); press('a');
  assert.equal(calls, 1);
  grant({ guardian: 'leafowl', lines: ['Leafowl nestles beside you.'] });
  await settle();
  assert.equal(captions.length, 5);
  assert.equal(captions.at(-1).text, 'Leafowl nestles beside you.');
  assert.equal(visibleCaption(), 'Leafowl nestles beside you.');
  frames(90);
  assert.equal(Scenes.top, scene);
  press('a'); frame();
  assert.deepEqual(await pending, { completed: true, choice: 1 });
  assert.equal(calls, 1);
  assert.equal(clears.at(-1), scene);
});

test('a parent dialogue restores its own selected caption after a nested prompt', () => {
  UIx.ask('Ready to return?', ['Yes', 'Not yet']); frames(7); press('down');
  const parent = Scenes.top;
  UIx.say('We can take our time.'); frames(7);
  const child = Scenes.top;
  assert.equal(captions.at(-1).owner, child);
  const count = captions.length;
  parent.refreshNarration();
  assert.equal(captions.length, count, 'a covered parent cannot replace the child caption');
  Scenes.pop();
  assert.equal(clears.at(-1), child);
  parent.refreshNarration();
  assert.equal(captions.at(-1).text, 'Ready to return? Not yet.');
  assert.equal(captions.at(-1).owner, parent);
  assert.equal(captions.at(-1).utterance, undefined, 'restoring a page includes its context');
});

test('enabling read-aloud during the typewriter reveal exposes the whole page without advancing', () => {
  S.settings.readAloud = false;
  UIx.say('The lanterns will guide you home.'); frames(8);
  const scene = Scenes.top;
  assert.ok(visibleCaption().length < 'The lanterns will guide you home.'.length);
  S.settings.readAloud = true;
  frame();
  assert.equal(visibleCaption(), 'The lanterns will guide you home.');
  const count = captions.length;
  frames(100);
  assert.equal(captions.length, count);
  assert.equal(Scenes.top, scene);
});
