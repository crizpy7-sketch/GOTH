// Premium vertical-slice sheet overrides v1.
import { Atlas } from './atlas.js';
const ASSETS = {
  emberOW: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAQCAYAAAB3AH1ZAAABRElEQVR4nGNgGC4gQlX2PznqWZAFVtx+zEiKAejqkcX+dxlhOIix7BwjumNZkBWQYwA2hy1PFcUq97/L6H/k7NcoYkzYDMBmOcwAXJbDHI7LchiAycPUwx1ArgG4gN6kV3j5MI9ghACpBuACl/LEGBjC8iAYxscCcDqAWAOQwYrbjxnR4xgdwOSXr41liFCV/Y/iAHIMQJaLUJX932/KBVfDsGoSBGPRGxm8mGHF7ceMGNmo35SLofD0N6xpAZsB2PQzMDAwFJ7+hqEfZjayPhYMVVCF2EICZgCjXhvB8gLmEEIAqwNIMQAdFJ7+hlMvtlDBSITYFBEjx8CAyJrY1MHE0KMNIyhhCQvdF7gMwAY0JGUCDHgY1yOLXfjyP/DG8ycb0NWiGKYhKRMAY2MzAMbGZhC6fnwAWT9W3+AyCJfFlOgHAEhXxImSjL6xAAAAAElFTkSuQmCC",
};
export function register() {
  Atlas.defineHD('ui.coin', 8, 8, 4, ctx => {
    const g = ctx.createLinearGradient(5, 2, 26, 30);
    g.addColorStop(0, '#fff1ad'); g.addColorStop(.4, '#e6ae3f'); g.addColorStop(1, '#9a5718');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(16, 16, 13, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#754a1b'; ctx.stroke();
    ctx.beginPath(); ctx.arc(16, 16, 9, 0, Math.PI * 2); ctx.strokeStyle = '#ffe6a1'; ctx.stroke();
    ctx.fillStyle = '#fff1b4'; ctx.beginPath(); ctx.moveTo(16, 8); ctx.lineTo(20, 16);
    ctx.lineTo(16, 24); ctx.lineTo(12, 16); ctx.closePath(); ctx.fill();
  }, 1, {smooth:true});
  Atlas.defineHD('ui.hearth', 8, 8, 4, ctx => {
    const g = ctx.createLinearGradient(16, 2, 16, 30);
    g.addColorStop(0, '#ffe495'); g.addColorStop(.55, '#f59b30'); g.addColorStop(1, '#b34124');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(18, 1);
    ctx.bezierCurveTo(19, 11, 29, 15, 27, 22); ctx.bezierCurveTo(24, 34, 5, 33, 5, 21);
    ctx.bezierCurveTo(5, 15, 11, 12, 10, 8); ctx.bezierCurveTo(15, 12, 14, 14, 15, 16);
    ctx.bezierCurveTo(19, 11, 13, 9, 18, 1); ctx.fill();
    ctx.fillStyle = '#fff1b2'; ctx.beginPath(); ctx.moveTo(16, 14);
    ctx.bezierCurveTo(18, 21, 24, 23, 18, 28); ctx.bezierCurveTo(7, 31, 10, 20, 16, 14); ctx.fill();
  }, 1, {smooth:true});
  const hero = { down: '__HERO_DOWN_ART__', up: '__HERO_UP_ART__', left: '__HERO_LEFT_ART__' };
  const gran = { down: '__GRAN_DOWN_ART__', up: '__GRAN_UP_ART__', left: '__GRAN_LEFT_ART__', right: '__GRAN_RIGHT_ART__' };
  for (const dir of ['down', 'up', 'left', 'right']) {
    Atlas.defineSheet(`c.gran.${dir}`, 16, 24, 4, gran[dir],
      {frameW:64,frameH:96,pixelRatio:4,premium:true,smooth:true});
    Atlas.defineSheet(`c.hero.${dir}`, 16, 24, 4, hero[dir === 'right' ? 'left' : dir],
      { frameW: 64, frameH: 96, pixelRatio: 4, premium: true, smooth: true, flipX: dir === 'right' });
  }
  Atlas.defineSheet('story.gran', 112, 128, 1, '__GRAN_STORY_ART__', {frameW:336,frameH:384,pixelRatio:3,premium:true});
  Atlas.defineSheet('story.mayor', 112, 128, 1, '__MAYOR_STORY_ART__', {frameW:336,frameH:384,pixelRatio:3,premium:true});
  Atlas.defineSheet('story.rival', 112, 128, 1, '__RIVAL_STORY_ART__', {frameW:336,frameH:384,pixelRatio:3,premium:true});
  Atlas.defineSheet('scene.story.cottage', 320, 180, 1, '__COTTAGE_STORY_ART__', {frameW:640,frameH:360,pixelRatio:2,premium:true});
  Atlas.defineSheet('scene.story.village', 320, 180, 1, '__VILLAGE_STORY_ART__', {frameW:1280,frameH:720,pixelRatio:4,premium:true});
  Atlas.defineSheet('t.tree.oak', 48, 64, 1, '__OAK_ART__', {frameW:192,frameH:256,pixelRatio:4,premium:true,smooth:true});
  Atlas.defineSheet('g.leafowl.front', 80, 80, 1, '__LEAFOWL_FRONT_ART__', {frameW:160,frameH:160,pixelRatio:2,premium:true});
  Atlas.defineSheet('g.leafowl.back', 80, 80, 1, '__LEAFOWL_BACK_ART__', {frameW:160,frameH:160,pixelRatio:2,premium:true});
  Atlas.defineSheet('g.aquarabbit.front', 80, 80, 1, '__AQUARABBIT_FRONT_ART__', {frameW:160,frameH:160,pixelRatio:2,premium:true});
  Atlas.defineSheet('g.aquarabbit.back', 80, 80, 1, '__AQUARABBIT_BACK_ART__', {frameW:160,frameH:160,pixelRatio:2,premium:true});
  Atlas.defineSheet('scene.battle', 320, 180, 1, '__BATTLE_ART__', { frameW:1280, frameH:720, pixelRatio:4, premium:true,smooth:true });
  Atlas.defineSheet('g.embercub.front', 80, 80, 1, '__EMBERCUB_FRONT_ART__', {frameW:160,frameH:160,pixelRatio:2,premium:true});
  Atlas.defineSheet('g.embercub.back', 80, 80, 1, '__EMBERCUB_BACK_ART__', {frameW:160,frameH:160,pixelRatio:2,premium:true});
  Atlas.defineSheet('g.embercub.ow', 16, 16, 2, ASSETS.emberOW, { frameW:16, frameH:16, premium:true });
}
