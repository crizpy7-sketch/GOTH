// Local family journeys. Switching happens only at the title and reloads the
// runtime, so scenes from one person cannot outlive their ownership of the save.
import { Scenes } from '../core/scene.js';
import { Input } from '../core/input.js';
import { Narration } from '../core/narration.js';
import { UIx } from '../core/bridge.js';
import { profileRows, currentProfileId, selectProfile, renameProfile, copyLegacyToProfile, saveIssue } from '../state.js';

let panel, initialized = false, lastIssue = '';
const $ = id => document.getElementById(id);
const consume = () => { for (const key of ['a','b','up','down','left','right','start','select','run']) Input.consume(key); };

function profileScene() {
  let selected = currentProfileId(), confirmCopy = false, previousFocus;
  let rows = [];
  const selectedRow = () => rows.find(p => p.id === selected);
  function message(text) { $('profileNotice').textContent = text; }
  function sync() {
    rows = profileRows();
    $('titleProfileName').textContent = rows.find(row => row.active)?.name || 'Original journey';
    $('profileList').replaceChildren(...rows.map(row => {
      const button = document.createElement('button'); button.type = 'button';
      button.dataset.profile = row.id; button.setAttribute('aria-pressed', String(row.id === selected));
      const name = document.createElement('strong'); name.textContent = row.name;
      const detail = document.createElement('span');
      detail.textContent = row.status === 'saved' ? `Village ${row.summary.level} · Day ${row.summary.day}`
        : row.status === 'invalid' ? 'Save needs attention' : row.status === 'unavailable' ? 'Storage unavailable' : 'New adventure';
      const mark = document.createElement('span'); mark.className = 'profile-mark';
      mark.textContent = row.active ? 'Playing now' : row.id === 'legacy' ? 'Kept separate' : row.id.startsWith('child') ? 'Child' : 'Parent';
      button.append(name, detail, mark);
      button.addEventListener('click', () => { selected = row.id; confirmCopy = false; message(''); sync(); $('profileList').querySelector(`[data-profile="${row.id}"]`)?.focus({preventScroll:true}); });
      return button;
    }));
    const row = selectedRow(), original = rows.find(p => p.id === 'legacy');
    $('profileSelected').textContent = row.name;
    $('profileName').value = row.name;
    $('profileRename').hidden = row.id === 'legacy';
    $('profileUse').textContent = row.active ? `Return to ${row.name}` : `Play as ${row.name}`;
    $('profileUse').disabled = row.status === 'unavailable';
    $('profileCopy').hidden = row.id === 'legacy' || row.status !== 'empty' || original.status !== 'saved';
    $('profileConfirm').hidden = !confirmCopy;
    $('profileCopyText').textContent = `Copy the original journey into ${row.name}? This creates a separate journey and a protected backup. The original stays available.`;
    $('profileDescription').textContent = row.status === 'saved'
      ? `${row.summary.name}'s journey is saved on this device. Your village, companions and settings belong to this profile.`
      : row.status === 'invalid' ? 'This save could not be opened. It is kept unchanged. Return to this profile to choose a new journey, or keep it for recovery.'
      : 'An empty place for your own village, companions and reading settings.';
    $('profileUse').hidden = confirmCopy;
    $('profileCopy').disabled = confirmCopy;
  }
  function useProfile() {
    if (Scenes.topName !== 'family-profiles' || Scenes.stack.some(s => !['title','family-profiles'].includes(s.__name))) return;
    if (!selectProfile(selected)) { message('Could not open this profile. Device storage is unavailable. Your current journey is still selected.'); return; }
    Narration.clear(); Input.reset();
    message(`Opening ${selectedRow().name}…`);
    // A clean boot drops every cached map, pending caption and asynchronous scene.
    const url = new URL(location.href); url.searchParams.delete('save'); url.searchParams.delete('scene'); url.searchParams.delete('dev');
    location.replace(url.href);
  }
  const close = () => { if (confirmCopy) { confirmCopy = false; sync(); return; } Scenes.pop(); };
  const onKey = e => {
    e.stopPropagation();
    if (e.type === 'keyup') return;
    if (e.code === 'Escape') { e.preventDefault(); close(); return; }
    if (e.code !== 'Tab') return;
    const focusable = [...panel.querySelectorAll('button,input')].filter(el => !el.disabled && !el.closest('[hidden]'));
    const index = focusable.indexOf(document.activeElement);
    if (e.shiftKey && index <= 0) { e.preventDefault(); focusable.at(-1)?.focus(); }
    if (!e.shiftKey && index === focusable.length - 1) { e.preventDefault(); focusable[0]?.focus(); }
  };
  return {
    pausesBelow:true, drawsBelow:true,
    get readingText() { return `Family profiles. ${selectedRow()?.name || ''}. ${$('profileDescription').textContent} Profiles stay on this device. Online visits are not available yet.`; },
    enter() {
      if (Scenes.stack.some(s => !['title','family-profiles'].includes(s.__name))) { Scenes.pop(); return; }
      previousFocus = document.activeElement; Input.reset(); Narration.clear();
      panel.hidden = false; document.body.classList.add('profiles-open');
      $('titleScreen').inert = true;
      $('profileClose').onclick = close;
      $('profileUse').onclick = useProfile;
      $('profileRename').onsubmit = e => {
        e.preventDefault();
        const name = $('profileName').value.trim();
        if (!name) { message('Please enter a name.'); return; }
        if (!renameProfile(selected, name)) { message('Could not save the name. Try again when device storage is available.'); return; }
        sync(); message('Profile name saved on this device.');
      };
      $('profileCopy').onclick = () => { confirmCopy = true; sync(); $('profileCopyCancel').focus(); };
      $('profileCopyCancel').onclick = () => { confirmCopy = false; sync(); $('profileCopy').focus(); };
      $('profileCopyConfirm').onclick = () => {
        const result = copyLegacyToProfile(selected); confirmCopy = false; sync(); message(result.message);
        if (result.ok && selected === currentProfileId()) useProfile();
      };
      panel.addEventListener('keydown', onKey); panel.addEventListener('keyup', onKey);
      message(''); sync(); $('profileClose').focus({preventScroll:true});
    },
    update() {
      if (Input.pressed('b')) { consume(); close(); }
      // Native form controls own keyboard/touch input. Controllers can move focus.
      if (Input.device === 'gamepad') {
        const buttons = [...panel.querySelectorAll('button')].filter(el => !el.disabled && !el.closest('[hidden]'));
        let index = buttons.indexOf(document.activeElement);
        if (Input.nav('down') || Input.nav('right')) buttons[(index + 1) % buttons.length]?.focus();
        if (Input.nav('up') || Input.nav('left')) buttons[(index + buttons.length - 1) % buttons.length]?.focus();
        if (Input.pressed('a')) { consume(); document.activeElement?.click(); }
      }
    },
    exit() {
      panel.hidden = true; document.body.classList.remove('profiles-open'); $('titleScreen').inert = false;
      panel.removeEventListener('keydown', onKey); panel.removeEventListener('keyup', onKey);
      Narration.clear(); consume(); previousFocus?.focus({preventScroll:true});
    },
  };
}

export function initFamilyProfiles() {
  if (initialized) return; initialized = true; panel = $('familyPanel');
  Scenes.register('family-profiles', profileScene);
  $('titleProfiles').addEventListener('click', () => {
    if (Scenes.topName === 'title' && !UIx.busy && !UIx.transitioning) Scenes.push('family-profiles');
  });
  $('profileReload').addEventListener('click', () => {
    if (!window.confirm('Reload the latest saved journey? Unsaved changes in this tab will not carry over.')) return;
    if (!selectProfile(currentProfileId())) return;
    Narration.clear(); Input.reset();
    const url = new URL(location.href); url.searchParams.delete('save'); url.searchParams.delete('scene'); url.searchParams.delete('dev');
    location.replace(url.href);
  });
  $('titleProfileName').textContent = profileRows().find(p => p.active)?.name || 'Original journey';
}

export function tickFamilyProfiles() {
  if (!initialized) return;
  const issue = saveIssue(); if (issue === lastIssue) return; lastIssue = issue;
  $('saveNotice').hidden = !issue;
  $('saveNoticeText').textContent = issue === 'conflict'
    ? 'This journey changed in another tab. Saving is paused here to protect the newer save.'
    : 'Saving is unavailable. Keep this tab open and check device storage before leaving.';
  $('profileReload').hidden = issue !== 'conflict';
}
