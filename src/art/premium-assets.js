// Premium vertical-slice sheet overrides v1.
import { Atlas } from './atlas.js';
import { register as registerWorld } from './illustrated-world.js';
import { register as registerUI } from './illustrated-ui.js';
export function register() {
  registerWorld();
  registerUI();
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
  Atlas.defineSheet('t.tree.oak', 48, 64, 1, '__OAK_ART__', {frameW:192,frameH:256,pixelRatio:4,premium:true,smooth:true});
  Atlas.defineSheet('scene.battle', 320, 180, 1, '__BATTLE_ART__', { frameW:1280, frameH:720, pixelRatio:4, premium:true,smooth:true });
  const illustrated = __ILLUSTRATED_ART__;
  for (const [name,a] of Object.entries(illustrated)) Atlas.defineSheet(name,a.w,a.h,a.frames,a.src,
    {frameW:a.w*4,frameH:a.h*4,pixelRatio:4,premium:true,smooth:true,flipX:a.flipX});
  for(const [name,source,frames,cx,cy,radius] of [
    ['t.hearth.lit','illustrated.prop.hearth',3,32,45,12],
    ['t.lamp.lit','t.lamp',2,39,26,8],
  ]) Atlas.defineHD(name,16,16,4,(ctx,w,h,frame)=>{
    ctx.drawImage(Atlas.get(source),0,0);
    if(!frame)return;
    const glow=ctx.createRadialGradient(cx,cy,1,cx,cy,radius);
    glow.addColorStop(0,`rgba(255,199,91,${.10+frame*.06})`);glow.addColorStop(1,'rgba(255,164,53,0)');
    ctx.globalCompositeOperation='screen';ctx.fillStyle=glow;ctx.fillRect(cx-radius,cy-radius,radius*2,radius*2);
    ctx.globalCompositeOperation='source-over';
  },frames,{smooth:true});
}
