// Smooth, resolution-independent paint for the existing tile geometry. These
// cached canvases keep paths/collision legible beneath the illustrated cast.
import { Atlas } from './atlas.js';
import { ANIM_TILES } from './names.js';

const rnd = (x, y, s = 0) => {
  let n = Math.imul(x + 37, 374761393) ^ Math.imul(y + s * 71, 668265263);
  n = Math.imul(n ^ n >>> 13, 1274126177);
  return (n >>> 0) / 4294967295;
};
function fill(c, color, x=0, y=0, w=16, h=16) { c.fillStyle=color; c.fillRect(x,y,w,h); }
function oval(c,x,y,rx,ry,color) { c.fillStyle=color; c.beginPath(); c.ellipse(x,y,rx,ry,0,0,Math.PI*2); c.fill(); }
function line(c,color,width,points) { c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.lineJoin='round';c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.stroke(); }
function box(c,x,y,w,h,top,bottom,r=.7) {
  const g=c.createLinearGradient(x,y,x+w*.35,y+h);g.addColorStop(0,top);g.addColorStop(1,bottom);
  c.fillStyle=g;c.beginPath();c.roundRect(x,y,w,h,r);c.fill();
  c.strokeStyle='rgba(37,31,25,.4)';c.lineWidth=.3;c.stroke();
  line(c,'rgba(255,230,174,.3)',.3,[[x+.7,y+.4],[x+w-.7,y+.4]]);
}
function leaf(c,x,y,size,color,angle=0) {
  c.save();c.translate(x,y);c.rotate(angle);c.fillStyle=color;c.beginPath();
  c.moveTo(0,size);c.bezierCurveTo(-size,size*.1,-size,-size*.6,0,-size);
  c.bezierCurveTo(size,-size*.2,size,size*.4,0,size);c.fill();c.restore();
}
function flower(c,x,y,color='#e7cf91',size=.75) {
  for(let n=0;n<5;n++) oval(c,x+Math.cos(n*1.256)*size*.7,y+Math.sin(n*1.256)*size*.7,size*.48,size*.55,color);
  oval(c,x,y,size*.3,size*.3,'#c59545');
}
function grass(c,v=0) {
  fill(c,'#708e4b');
  const texture=Atlas.tryGet('material.grass');
  if(texture){c.save();c.translate(8,8);c.rotate(v*Math.PI/2);c.drawImage(texture,-8,-8,16,16);c.restore();}
  // Broad, faint brush marks share one base at the edges. No per-tile vignette.
  for(let i=0;i<12;i++) {
    const x=rnd(i,4,v)*16,y=rnd(i,9,v)*16;
    oval(c,x,y,1.7+rnd(i,3)*2,.3+rnd(i,5)*.5,i%2?'rgba(188,198,119,.08)':'rgba(46,79,45,.06)');
  }
  for(let i=0;i<9;i++) {
    const x=1+rnd(i,2,v)*14,y=2+rnd(i,7,v)*13;
    line(c,i%3?'rgba(177,194,109,.3)':'rgba(47,80,44,.23)',.16,[[x-.35,y],[x,y-1],[x+.3,y-.4]]);
  }
}
function stone(c,base='#b7a075',size=5) {
  fill(c,'#897d60');
  for(let row=-1;row<5;row++) for(let col=-1;col<5;col++) {
    const x=col*size+(row%2)*size/2,y=row*4;
    box(c,x+.2,y+.2,size-.4,3.6,base,'#a49370',.65);
    if(rnd(col,row)>.5)line(c,'rgba(250,236,191,.18)',.15,[[x+.8,y+1],[x+size-1,y+.8]]);
  }
}
function path(c,mask,trail=false) {
  grass(c);
  const n=mask&1,e=mask&2,s=mask&4,w=mask&8;
  const l=w?0:2.3,r=e?16:13.7,t=n?0:2.3,b=s?16:13.7;
  c.save(); c.beginPath(); c.roundRect(l,t,r-l,b-t,[!n&&!w?2:0,!n&&!e?2:0,!s&&!e?2:0,!s&&!w?2:0]);c.clip();
  fill(c,trail==='sand'?'#c5b582':trail?'#ab965e':'#c2ab76');
  const texture=Atlas.tryGet('material.path');
  if(texture){c.globalAlpha=trail?.55:.85;c.drawImage(texture,0,0,16,16);c.globalAlpha=1;}
  for(let i=0;i<15;i++) {
    const x=rnd(i,2)*16,y=rnd(i,6)*16;
    oval(c,x,y,.25+rnd(i,8)*.55,.15+rnd(i,3)*.27,i%2?'#cbb684':'#ad996b');
  }
  c.restore();
  if(!n)line(c,'#8b8851',.5,[[l+1,t],[r-1,t]]);
  if(!s)line(c,'#8a7c4f',.5,[[l+1,b],[r-1,b]]);
  if(!w)line(c,'#8f8c54',.5,[[l,t+1],[l,b-1]]);
  if(!e)line(c,'#8a7c4f',.5,[[r,t+1],[r,b-1]]);
}
function floor(c,tile=false) {
  if(tile){stone(c,'#b2b19b',8);return;}
  fill(c,'#60422c');
  for(let j=0;j<4;j++) {
    box(c,-.2,j*4,16.4,3.8,j%2?'#966d47':'#a0774e','#755136',.15);
    const seam=j%2?5:12;line(c,'#62462f',.3,[[seam,j*4+.4],[seam,j*4+3.5]]);
    for(let k=0;k<3;k++)line(c,'rgba(232,189,119,.11)',.15,[[1+k*4,j*4+1.3],[3+k*4,j*4+1],[5+k*4,j*4+1.2]]);
  }
}
function water(c,mask,deep=false) {
  const g=c.createLinearGradient(0,0,16,16);g.addColorStop(0,deep?'#3d8397':'#649f9e');g.addColorStop(1,deep?'#32677e':'#4b868c');fill(c,g);
  for(let i=0;i<5;i++)line(c,'rgba(194,232,211,.18)',.3,[[i*4-4,i*3+1],[i*4-1,i*3+.7],[i*4+2,i*3+1]]);
  for(const [bit,p] of [[1,[[0,.6],[16,.6]]],[2,[[15.4,0],[15.4,16]]],[4,[[0,15.4],[16,15.4]]],[8,[[.6,0],[.6,16]]]])
    if(!(mask&bit))line(c,'#bac5a1',1.1,p);
}
function fence(c,type) {
  const post=(x,y,h=12)=>{box(c,x,y,2.5,h,'#c39558','#6f4b2d',.35);line(c,'#e0b67a',.35,[[x+.4,y+.7],[x+.4,y+h-1]]);};
  if(type==='v'){box(c,6,0,2.8,16,'#b38a50','#7c5532');post(5.5,1,13);return;}
  if(type==='post'){post(6.5,2,13);return;}
  box(c,0,6,16,2,'#c29b61','#876037');box(c,0,11,16,1.8,'#b98b50','#795231');
  if(type==='gate') for(let i=2;i<15;i+=3)box(c,i,4,2,10,'#ba955d','#795538');
  post(.4,2);post(13.1,2);
}
function bush(c,berries=false) {
  oval(c,8,13,6.8,1.5,'rgba(24,44,31,.28)');
  for(let j=0;j<12;j++) {
    const x=3+rnd(j,4)*10,y=5+rnd(j,6)*7,r=2+rnd(j,8)*1.5;
    const g=c.createRadialGradient(x-.7,y-1,0,x,y,r);g.addColorStop(0,'#91ad59');g.addColorStop(.65,'#5a843f');g.addColorStop(1,'#355c36');oval(c,x,y,r,r*.8,g);
    leaf(c,x-.4,y-.3,.6,'#b3bd70',j);
    if(berries&&j%3===0){oval(c,x,y+1,.6,.6,'#b86067');oval(c,x-.15,y+.8,.2,.2,'#e9998c');}
  }
}
function plant(c,pot=true) {
  if(pot)box(c,4.3,10.2,7.3,5,'#c29164','#825336',1.4);
  line(c,'#41623c',.6,[[8,12],[8,3]]);
  for(let i=0;i<6;i++)leaf(c,8+(i%2?2:-2),3+i*1.25,2,i%2?'#71984d':'#8bab59',i%2?1:-1);
  if(pot)box(c,3.7,10,8.5,1.5,'#d5a276','#976343',.4);
}
function lamp(c,lit) {
  box(c,7,2,1.7,13,'#b48d53','#5d442e');
  line(c,'#695337',1,[[7.5,3],[11,3],[11,5]]);
  box(c,8.9,5,4.4,5.3,'#443d31','#282e29');
  box(c,9.7,5.7,2.8,3.7,lit?'#ffe7a0':'#baa879',lit?'#e0a14f':'#796e52');
  line(c,'#5e4a2e',.4,[[11.1,5.5],[11.1,9.5]]);
}
function furniture(c,id,frame=0) {
  const table=()=>{for(const x of [2.5,12])box(c,x,9,1.5,6,'#9a7047','#5b3d2c');box(c,1,4,14,7,'#bc9360','#785234',1);};
  const shelf=()=>{box(c,1,1,14,14,'#a47a4f','#5b3b29');for(const y of [3,8]){fill(c,'#392e28',2,y,12,4);for(let i=0;i<7;i++)box(c,2.5+i*1.6,y+.4,1.1,3.4,['#738e73','#b6905c','#85658a','#8f6252'][i%4],'#544432',.1);line(c,'#c5a16d',.6,[[1.5,y+4],[14.5,y+4]]);}};
  if(id==='table'||id==='table.set'||id==='counter'||id==='bench'){
    table();if(id==='table.set'){oval(c,6,7,2.5,1.6,'#e4d0a4');oval(c,6,6.7,1.8,1,'#ae8148');box(c,10,5.8,2,2.2,'#cfb990','#897558',.4);}return;
  }
  if(/shelf|cabinet|loom/.test(id)){shelf();return;}
  if(id.startsWith('chair')) {box(c,4,4,8,6,'#b78d58','#725132');box(c,4,2,8,2,'#c6a06a','#806044');for(const x of [4,10.5])box(c,x,9,1.5,6,'#987246','#67472e');return;}
  if(id==='bed.head'||id==='bed.foot'){
    box(c,1,0,14,16,'#a47a4f','#63432f');box(c,2.4,0,11.2,16,'#76958a','#3e625c',.3);
    if(id==='bed.head'){box(c,1,0,14,3,'#b79461','#795736');box(c,3,3.5,10,4,'#f3dfb4','#cdb994',1.1);}else box(c,1,13,14,2.7,'#b79461','#795736');
    line(c,'#a2b4a0',.45,[[4,8],[12,8]]);return;
  }
  if(/hearth|stove/.test(id)) {
    box(c,1,0,14,15,'#a59b7d','#615f51');box(c,3,4,10,10,'#574d3d','#302b27',3);
    line(c,'#bcac87',.7,[[1,3],[15,3]]);line(c,'#8f8067',.4,[[5,0],[5,3]]);
    if(!id.endsWith('cold')) {oval(c,8,12,4,1.4,'#ca682f');for(let i=0;i<3;i++)leaf(c,5.5+i*2.2,10,2.4+(frame+i)%3*.3,i%2?'#ffe294':'#f5b258',.1);}
    return;
  }
  if(/chest|crate|basket|barrel|sack|hay|beehive/.test(id)) {
    if(id==='barrel'){box(c,3,2,10,13,'#bd935e','#6c4c31',3);for(const y of [5,12])line(c,'#66645a',1,[[3,y],[13,y]]);return;}
    box(c,2,4,12,11,'#bc945f','#765035',id==='basket'?2:.6);
    if(id==='chest'){box(c,2,3,12,5,'#ccaa73','#8c693f',1.7);box(c,7,7,2,3,'#e3c779','#a4843d',.2);}
    else {for(let i=0;i<4;i++)line(c,'#9a7043',.4,[[3+i*3,5],[3+i*3,14]]);line(c,'#d7b17b',.7,[[2.5,5],[13.5,5]]);}return;
  }
  if(/pot|planter|reed|cattail/.test(id)){plant(c,!/reed|cattail/.test(id));return;}
  if(/door/.test(id)){box(c,2,1,12,15,'#795c3b','#483e2e',3);for(let x=4;x<13;x+=3)line(c,'#a58a57',.3,[[x,5],[x,15]]);oval(c,11,11,.6,.6,'#dec083');return;}
  if(id==='painting'){box(c,2,2,12,11,'#d6b276','#82623c');box(c,3.5,3.5,9,8,'#9bb4a1','#526f58');oval(c,9,5,1,1,'#f4d699');return;}
  if(id==='clock'){box(c,4,1,8,14,'#9f774f','#594031',3);oval(c,8,6,3,3,'#eddeb7');line(c,'#685039',.5,[[8,3.8],[8,6],[10,7]]);return;}
  if(id==='anvil'){box(c,5,9,6,6,'#897b66','#4b514e');box(c,2,5,12,4,'#bbc1b1','#637576',.8);return;}
  if(id==='well'){oval(c,8,11,6.5,4,'#9b957b');oval(c,8,10,4.5,2.5,'#3e5655');for(const x of [2,12.5])box(c,x,2,1.4,10,'#bd9460','#795132');box(c,1,2,14,2,'#b79765','#79563c');return;}
  if(id==='mailbox'){box(c,7,9,2,6,'#ad8657','#6e4b31');box(c,3,4,10,7,'#729395','#435e62',2);line(c,'#c6ae72',.4,[[5,6],[11,6]]);return;}
  if(id==='cart'){table();for(const x of [3,13]){oval(c,x,13,2,2,'#66503b');oval(c,x,13,1,1,'#ae8a57');}return;}
  if(id==='banner'||id==='laundry'){line(c,'#76583b',.5,[[0,2],[16,2]]);box(c,4,2,8,10,'#b78b75','#875d56');leaf(c,8,7,2,'#ddbf76');return;}
  if(id==='scarecrow'){line(c,'#926e43',1,[[8,5],[8,16]]);line(c,'#926e43',.8,[[1,8],[15,8]]);box(c,4,6,8,5,'#aa8e62','#756448');oval(c,8,4,2.5,2.4,'#c6aa72');box(c,4,2,8,1.2,'#ab814b','#765933');return;}
}
function wall(c,id) {
  fill(c,'#a48f6a');box(c,-.3,0,16.6,16,'#b4a17e','#938364',0);
  if(/plank/.test(id)) {for(let x=0;x<16;x+=4)box(c,x,0,4,16,'#957147','#715031',.1);}
  line(c,'#705139',1.4,[[0,14.8],[16,14.8]]);
  if(id.endsWith('top')){box(c,0,0,16,8,'#84613e','#463a2d',.1);return;}
  if(id.endsWith('window')){
    box(c,2,2,12,10,'#d4b582','#755638');box(c,3,3,10,8,'#9cc8bd','#5c8d92',.2);
    line(c,'#b49560',.8,[[8,3],[8,11]]);line(c,'#b49560',.8,[[3,7],[13,7]]);
  }
}
function reg(name,painter,frames=ANIM_TILES[name]||1) {
  Atlas.defineHD(name,16,16,4,(c,w,h,f)=>{c.save();c.scale(4,4);painter(c,f);c.restore();},frames,{smooth:true});
}
export function register() {
  ['t.grass','t.grass.a','t.grass.b','t.grass.c'].forEach((n,i)=>reg(n,c=>grass(c,i)));
  for(const fam of ['path','trail','sand','water','deepwater','floor']) {
    const paint=(c,m)=>fam==='floor'?floor(c):fam.includes('water')?water(c,m,fam==='deepwater'):path(c,m,fam==='sand'?'sand':fam==='trail');
    for(let m=0;m<16;m++)reg(`t.${fam}.m${m}`,c=>paint(c,m));reg(`t.${fam}`,c=>paint(c,15));
  }
  for(const name of ['plaza','plaza.edge','cobble','gravel'])reg('t.'+name,c=>stone(c,name==='gravel'?'#b4a681':'#b7a57e',name==='gravel'?3:5));
  for(const name of ['floor.wood','floor.wood.a','floor.tile'])reg('t.'+name,c=>floor(c,name.endsWith('tile')));
  reg('t.floor.rug',c=>{floor(c);box(c,.5,.5,15,15,'#98774b','#736044',.5);line(c,'#c7ac6b',.5,[[2,2],[14,2],[14,14],[2,14],[2,2]]);flower(c,8,8,'#bd9d65',3);});
  for(const id of ['iwall.plaster','iwall.plank','iwall.top','iwall.window','wall.plank','wall.stone'])reg('t.'+id,c=>wall(c,id));
  for(const type of ['h','v','post','gate'])reg('t.fence.'+type,c=>fence(c,type));
  for(const name of ['bush','bush.berry','hedge'])reg('t.'+name,c=>bush(c,name.includes('berry')));
  reg('t.leaves',c=>{grass(c);for(let i=0;i<10;i++)leaf(c,1+rnd(i,2)*14,1+rnd(i,7)*14,.6+rnd(i,5)*.6,i%2?'#ac8b48':'#8f9855',i);});
  reg('t.lilypad',c=>{oval(c,8,10,5,2.8,'#628a61');line(c,'#a2b782',.35,[[8,10],[4,8.8]]);flower(c,10,8,'#e1c6b9',1);});
  reg('t.lamp',c=>lamp(c,false));reg('t.lamp.lit',c=>lamp(c,true));
  for(const name of ['sign','signpost'])reg('t.'+name,c=>{box(c,7,7,2,9,'#be995e','#755237');box(c,1,3,14,6,'#c5a16a','#8d663e');line(c,'#785937',.4,[[4,5],[11,5]]);line(c,'#785937',.4,[[4,7],[9,7]]);});
  reg('t.tallgrass',(c,f)=>{
    for(let j=0;j<3;j++)for(let i=0;i<6;i++) {
      const x=.8+i*2.7+rnd(i,j)*.8,y=6+j*4.5;
      line(c,'#5c743d',.75,[[x,y],[x+(f?.6:-.3),y-4-rnd(i,j)*1.6]]);
      line(c,'#a6b66c',.3,[[x-.15,y-1],[x-1.1+(f?.6:0),y-4.5]]);
    }
  });
  for(const id of ['grass.tuft','grass.flower','grass.flower2','grass.pebble'])reg('t.'+id,c=>{
    if(id.endsWith('pebble')){oval(c,9,11,1.5,.9,'#9e9e78');return;}
    for(let i=0;i<4;i++){const x=4+rnd(i,3)*8,y=6+rnd(i,4)*7;line(c,'#667f40',.35,[[x,y],[x-.5,y-2.4]]);if(id.includes('flower'))flower(c,x-.5,y-2.4,id.endsWith('2')?'#dac4cc':'#e9dcac');}
  });
  for(const id of ['crop.soil','crop.sprout','crop.grown'])reg('t.'+id,c=>{fill(c,'#806744');for(let j=0;j<4;j++){line(c,'#655438',1,[[0,3+j*4],[16,3+j*4]]);if(!id.endsWith('soil'))for(let i=0;i<4;i++){leaf(c,2+i*4,j*4+1,id.endsWith('grown')?1.7:.8,'#8ea958',.5);}}});
  for(const id of ['rock.small','rock.big','stump','log','mushroom'])reg('t.'+id,c=>{
    if(id==='mushroom'){for(const [x,y] of [[5,10],[11,12]]){box(c,x-.6,y-3,1.4,5,'#e0c496','#a98b5a');oval(c,x,y-3,3,1.9,'#b27554');oval(c,x-.8,y-3.5,.5,.35,'#e5c6a0');}return;}
    if(id==='stump'||id==='log'){box(c,3,5,10,9,'#ad8753','#725436',3);oval(c,8,5,5,2,'#c8a971');oval(c,8,5,2.5,1,'#a38353');return;}
    const g=c.createLinearGradient(3,4,12,14);g.addColorStop(0,'#d0c8a7');g.addColorStop(.4,'#9fa38b');g.addColorStop(1,'#66755c');oval(c,8,10,id.endsWith('big')?6:3.5,id.endsWith('big')?4:2.3,g);leaf(c,5,12,1.2,'#6d8549',1);
  });
  for(const id of ['table','table.set','counter','bench','shelf','shelf.books','cabinet','loom','chair.l','chair.r','chair.u','chair.d','bed.head','bed.foot','hearth.lit','hearth.cold','stove','chest','crate','basket','barrel','sack','hay','beehive','pot','planter','plant.pot','flowerpot','reed','cattail','door.wood','door.open','door.arch','painting','clock','anvil','well','mailbox','cart','banner','laundry','scarecrow'])reg('t.'+id,(c,f)=>furniture(c,id,f));
}
