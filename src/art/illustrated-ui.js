import { Atlas } from './atlas.js';
import { TYPE_COLOR } from './palette.js';

function path(c,points,color,stroke=false,width=.7) {
  c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));
  if(stroke){c.lineWidth=width;c.lineCap='round';c.lineJoin='round';c.strokeStyle=color;c.stroke();}
  else {c.closePath();c.fillStyle=color;c.fill();}
}
function circle(c,x,y,r,color){c.fillStyle=color;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();}
function badge(c,x,y,w,h,color,r=1){c.fillStyle=color;c.beginPath();c.roundRect(x,y,w,h,r);c.fill();}
function star(c,x,y,r,color){path(c,Array.from({length:10},(_,i)=>{const a=i*Math.PI/5-Math.PI/2,s=i%2?r*.45:r;return[x+Math.cos(a)*s,y+Math.sin(a)*s];}),color);}
function leaf(c,color){c.fillStyle=color;c.beginPath();c.moveTo(2,7);c.bezierCurveTo(1,-1,8,2,8,1);c.bezierCurveTo(11,8,3,9,2,7);c.fill();path(c,[[2,8],[6,4]],'#fff0b2',true,.4);}
function sun(c){for(let i=0;i<8;i++){const a=i*Math.PI/4;path(c,[[4+Math.cos(a)*3.1,4+Math.sin(a)*3.1],[4+Math.cos(a)*3.9,4+Math.sin(a)*3.9]],'#efd38e',true,.45);}circle(c,4,4,2.4,'#e5b54d');circle(c,3.7,3.6,1.9,'#ffe8a3');}
function flower(c){for(let i=0;i<5;i++){const a=i*Math.PI*2/5;circle(c,4+Math.cos(a)*1.9,4+Math.sin(a)*1.9,1.5,'#e7adb5');}circle(c,4,4,1,'#ffe3a0');}
const painters={
  'ui.star': c=>star(c,5,5,4.3,'#f6d489'),
  'ui.heart': c=>{c.fillStyle='#e5989a';c.beginPath();c.moveTo(5,9);c.bezierCurveTo(-3,3,3,-1,5,3);c.bezierCurveTo(7,-1,13,3,5,9);c.fill();},
  'ui.ball': c=>{circle(c,5,5,4.1,'#8b6f41');circle(c,5,5,3.3,'#dcc185');path(c,[[5,2],[7,5],[5,8],[3,5]],'#6d9a83');circle(c,4.4,4.4,.65,'#e4eed3');},
  'ui.ball.empty': c=>{circle(c,5,5,4,'#7e867c');circle(c,5,5,3,'#bac1ac');},
  'ui.badge.check': c=>{circle(c,5,5,4.5,'#507854');path(c,[[2.5,5],[4.3,6.9],[7.8,3.4]],'#e2edc5',true,1);},
  'ui.badge.lock': c=>{badge(c,2,4,6,5,'#bdad85');c.strokeStyle='#b6a682';c.lineWidth=.9;c.beginPath();c.arc(5,4,2.1,Math.PI,0);c.stroke();circle(c,5,6.3,.7,'#5e655b');},
  'ui.badge.new': c=>{star(c,5,5,5,'#d4a957');circle(c,5,5,1.5,'#fff0bd');},
  'ui.cursor': c=>path(c,[[.5,1],[5.5,4],[.5,7]],'#f0d194'),
  'ui.cursor.small': c=>path(c,[[.2,.5],[3.7,3],[.2,5.5]],'#e4c282'),
  'ui.arrow.up': c=>path(c,[[1,4.5],[4,1],[7,4.5]],'#f0d194'),
  'ui.arrow.down': c=>path(c,[[1,1.5],[4,5],[7,1.5]],'#f0d194'),
  'ui.sky.sun': sun,
  'ui.sky.moon': c=>{c.fillStyle='#e3e6cc';c.beginPath();c.moveTo(5.4,.6);c.bezierCurveTo(-1,0,-.4,8,5.3,7.3);c.bezierCurveTo(2.1,5.8,2.2,2.5,5.4,.6);c.fill();circle(c,6.6,2,.5,'#e7d9a2');},
  'ui.season.spring': flower,
  'ui.season.summer': sun,
  'ui.season.autumn': c=>{c.scale(.8,.8);leaf(c,'#d9a65b');},
  'ui.season.winter': c=>{for(let i=0;i<3;i++){c.save();c.translate(4,4);c.rotate(i*Math.PI/3);path(c,[[0,-3.8],[0,3.8]],'#d1e6de',true,.6);for(const s of [-1,1])path(c,[[-1.1,s*2.2],[0,s*3],[1.1,s*2.2]],'#d1e6de',true,.4);c.restore();}},
};
export function register() {
  for(const [name,painter] of Object.entries(painters)){
    const size=name.startsWith('ui.sky')||name.startsWith('ui.season')?[8,8]:name==='ui.cursor'?[6,8]:name==='ui.cursor.small'?[4,6]:name.startsWith('ui.arrow')?[8,6]:[10,10];
    Atlas.defineHD(name,...size,4,c=>{c.scale(4,4);painter(c);},1,{smooth:true});
  }
  for(const [type,color] of Object.entries(TYPE_COLOR))Atlas.defineHD(`ui.type.${type}`,22,9,4,c=>{c.scale(4,4);badge(c,0,0,22,9,color,3);},1,{smooth:true});
  for(const [name,w,h] of [['fx.shadow',16,6],['fx.shadow.big',64,12]])Atlas.defineHD(name,w,h,4,c=>{
    c.scale(4,4);c.translate(w/2,h/2);c.scale(w/2,h/2);
    const g=c.createRadialGradient(0,0,0,0,0,1);g.addColorStop(0,'rgba(24,34,28,.72)');g.addColorStop(.6,'rgba(24,34,28,.4)');g.addColorStop(1,'rgba(24,34,28,0)');circle(c,0,0,1,g);
  },1,{smooth:true});
}
