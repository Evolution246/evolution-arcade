import { onlineReady, net, playerId, newCode, cleanCode } from "../../js/net.js";

/* =====================================================================
   TRICK TRAP — solo (30 levels), duel vs CPU, online duel for 2–4.
   The solo engine is the original game; the duel layer sits on top.
   ===================================================================== */

const BASE_COLORS=['red','blue','green','yellow'];
const SHAPES=['circle','square','triangle'];
const SHAPE_PL={circle:'circles',square:'squares',triangle:'triangles'};
const SHAPE_SVG={
  circle:'<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="5"/></svg>',
  square:'<svg viewBox="0 0 10 10"><rect width="10" height="10" rx="1.5"/></svg>',
  triangle:'<svg viewBox="0 0 10 10"><polygon points="5,0 10,10 0,10"/></svg>'
};
const COLOR_WORDS=['RED','BLUE','GREEN','YELLOW','ORANGE','TEAL','PINK','PURPLE','GOLD'];
const TRICKS={
  shift:{name:'Color Swap',desc:'Safe things turn into forbidden ones'},
  stroop:{name:'Lying Labels',desc:'Words that contradict what you see'},
  swap:{name:'Switcheroo',desc:'Safe and forbidden trade places'},
  bait:{name:'Bonus Bait',desc:'Shiny rewards that break the rule'},
  fake:{name:'Fake Orders',desc:'Pop-ups that give false instructions'},
  chase:{name:'Ambush',desc:'Forbidden things slide under your finger'}
};
const TK=Object.keys(TRICKS);
const NAMES={...Object.fromEntries(TK.map(k=>[k,TRICKS[k].name])),plain:'Just Rushed It'};
const MILESTONES={
  5:'New rule type: <b>ONLY</b> rules. Everything that isn’t allowed is forbidden. Also your first <b>boss level</b>.',
  8:'New color: <b>ORANGE</b>. It sits right next to red. Look twice.',
  10:'New rule type: <b>WORDS</b>. Don’t touch anything that says a color, whatever color it is.',
  12:'Near-miss words like <b>READ</b> and <b>GOLDEN</b> start showing up. They are not colors.',
  14:'New color: <b>TEAL</b>. Green has a twin now.',
  15:'The rule bar starts <b>glitching</b>. Memorize the rule before you start.',
  20:'<b>Every trick is active</b> from here on, and the game leans on the ones that work on you.',
  25:'Rules can now have <b>three parts</b>.',
  30:'<b>Final level.</b> Everything at full strength.'
};

/* ---------- duel tuning ---------- */
const COST={shift:1,bait:1,stroop:2,swap:2,fake:3,chase:4};
const SEND_ORDER=['shift','bait','stroop','swap','fake','chase'];
const MAX_CHARGE=8;
const INTRO_SECS=3;

const $=s=>document.querySelector(s);
const arena=$('#arena'),overlay=$('#overlay');
// Randomness goes through RNG so a duel can swap in a seeded generator:
// every player then gets the exact same rule on the same level.
let RNG=Math.random;
const rand=()=>RNG();
const rnd=(a,b)=>a+rand()*(b-a);
const pick=a=>a[Math.floor(rand()*a.length)];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const now=()=>performance.now();
const up=s=>s.toUpperCase();
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function seeded(str){
  let h=1779033703^str.length;
  for(let i=0;i<str.length;i++){h=Math.imul(h^str.charCodeAt(i),3432918353);h=h<<13|h>>>19;}
  let a=h>>>0;
  return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
}

let store={stats:{},best:0,bestLevel:0,lastDeath:0,dossier:{},beatGame:false};
try{const s=JSON.parse(localStorage.getItem('tricktrap.v1'));if(s&&s.stats)store={...store,...s,dossier:s.dossier||{}};}catch(e){}
function save(){try{localStorage.setItem('tricktrap.v1',JSON.stringify(store))}catch(e){}}
function stat(k){return store.stats[k]||(store.stats[k]={levels:0,fooled:0});}

const G={level:1,lives:3,score:0,streak:0,running:false,tiles:[],rule:null,need:6,got:0,timeLeft:20,timeMax:20,
  tricks:[],freezeUntil:0,ptr:{x:150,y:150},T:{},W:300,H:300,size:64,speed:50,N:7,levelFools:{},levelLost:false,
  boss:false,notes:[],pace:1,tpace:{},glitchUntil:0,endless:false,charge:0,inbox:[],lastSent:null};
let uid=0;

/* Duel session. mode: 'solo' | 'cpu' | 'online' */
const M={mode:'solo',active:false,out:false,outAt:0,seed:'',round:0,introTimer:null,
  me:{id:playerId(),name:''},rivals:[],bot:null,level:'medium',room:null,order:[],seenEvents:new Set()};
const duel=()=>M.mode!=='solo';
try{M.me.name=localStorage.getItem('evo-arcade-name')||'';}catch(e){}

/* ---------- difficulty curve ---------- */
const D={
  palette:l=>BASE_COLORS.concat(l>=8?['orange']:[],l>=14?['teal']:[]),
  safeWords:l=>['GO','YES','TAP','STAR','OK','SAFE','WIN'].concat(l>=12?['READ','BLUR','GREET','YELP','REDO','GOLDEN']:[]),
  trickCount:l=>l<=2?1:l<=4?2:l<=9?3:l<=14?4:l<=19?5:6,
  need:l=>Math.min(12,5+Math.floor(l/2)),
  tiles:l=>Math.min(14,6+l),
  speed:l=>Math.min(250,40+l*8),
  badShare:l=>.4+Math.min(.2,(l-1)*.0105),
  flicker:l=>Math.max(200,420-(l-1)*20),
  smart:l=>Math.min(.95,.3+l*.035),
  pace:l=>Math.max(.38,1-l*.021),
  chasers:l=>l>=20?3:l>=7?2:1,
  time:(l,need)=>Math.max(Math.round(need*1.5+6),Math.round(16+need*1.6-.5*(l-1)))
};

/* ---------- rules ---------- */
function matchPart(p,t){
  if(p.k==='color')return t.color===p.v;
  if(p.k==='shape')return t.shape===p.v;
  return t.label.split(' ').some(w=>COLOR_WORDS.includes(w));
}
function forbiddenBy(rule,t){return (rule.only&&!matchPart(rule.only,t))||rule.deny.some(p=>matchPart(p,t));}
function forbidden(t){return forbiddenBy(G.rule,t);}
const hasWord=r=>r.deny.some(p=>p.k==='word');
function randTile(rule,l){
  const label=hasWord(rule)?(rand()<.45?pick(D.palette(l).map(up).concat(['PINK','PURPLE','GOLD'])):pick(D.safeWords(l))):'';
  return{color:pick(D.palette(l)),shape:pick(SHAPES),label};
}
function cPart(){return{k:'color',v:pick(BASE_COLORS)};}
function sPart(){return{k:'shape',v:pick(SHAPES)};}
function validRule(r,l){
  const sample=Array.from({length:400},()=>randTile(r,l));
  const safe=sample.filter(t=>!forbiddenBy(r,t)).length/400;
  if(safe<.14||safe>.82)return false;
  const parts=[...r.deny];if(r.only)parts.push('only');
  for(let i=0;i<parts.length;i++){
    const r2={deny:r.deny.filter((_,j)=>j!==i||parts[i]==='only'),only:parts[i]==='only'?null:r.only};
    const s2=sample.filter(t=>!forbiddenBy(r2,t)).length/400;
    if(Math.abs(s2-safe)<.03)return false;
  }
  return true;
}
function makeRule(l){
  if(l===1)return{deny:[{k:'color',v:'red'}],only:null};
  if(l===2)return{deny:[sPart()],only:null};
  if(l===5)return{deny:[],only:rand()<.5?cPart():sPart()};
  if(l===10)return{deny:[{k:'word'}],only:null};
  const kinds=['color','shape'].concat(l>=5?['only']:[],l>=10?['word']:[]);
  for(let tries=0;tries<200;tries++){
    const n=l<6?1:l<10?(rand()<.5?1:2):l<20?(rand()<.35?1:2):l<25?2:(rand()<.5?2:3);
    const r={deny:[],only:null};
    while(r.deny.length+(r.only?1:0)<n){
      const k=pick(kinds.filter(k=>!(k==='only'&&r.only)&&!(k==='word'&&hasWord(r))));
      if(k==='only')r.only=rand()<.6?cPart():sPart();
      else if(k==='word')r.deny.push({k:'word'});
      else r.deny.push(k==='color'?cPart():sPart());
    }
    if(validRule(r,l))return r;
  }
  return{deny:[cPart()],only:null};
}
function chip(c){return `<span class="cw${c==='yellow'?' dark':''}" style="background:var(--${c})">${up(c)}</span>`;}
function shp(s){return `<span class="shp">${SHAPE_SVG[s]}${up(SHAPE_PL[s])}</span>`;}
function denyDesc(p){return p.k==='color'?`anything ${chip(p.v)}`:p.k==='shape'?`any ${shp(p.v)}`:`anything that <span class="says">says a color</span>`;}
function ruleHTML(r=G.rule){
  const out=[];
  if(r.only)out.push('Only touch '+(r.only.k==='color'?`${chip(r.only.v)} things`:shp(r.only.v)));
  if(r.deny.length)out.push((r.only?'Never touch ':'Don’t touch ')+r.deny.map(denyDesc).join(' or '));
  return out.join('. ');
}
function ruleText(){const d=document.createElement('div');d.innerHTML=ruleHTML();return d.textContent;}

/* ---------- learning ---------- */
function weight(k){const s=stat(k);return .6+((s.fooled+.3)/(s.levels+1))*4+(s.levels===0?.8:0);}
function chooseTricks(k){
  const pool=[...TK],out=[];
  while(out.length<k&&pool.length){
    const ws=pool.map(weight),sum=ws.reduce((a,b)=>a+b,0);let r=Math.random()*sum,i=0;
    while(i<ws.length-1&&r>ws[i]){r-=ws[i];i++;}
    out.push(pool.splice(i,1)[0]);
  }
  return out;
}
function weakness(){
  let best=null;
  for(const k of TK){const s=stat(k);if(s.fooled>0&&(!best||s.fooled>stat(best).fooled))best=k;}
  return best;
}
function taunt(){
  if(duel()){
    const t=target();
    if(t&&t.weak)return `Scouting report: ${esc(t.name)} falls for ${TRICKS[t.weak].name}. It’s highlighted in yellow.`;
    return pick(['Clear shapes to charge traps. Spend them on your rival.','Last one standing wins.','Every safe tap is ammo.']);
  }
  if(store.lastDeath>1&&G.level===store.lastDeath)return `You died on level ${G.level} last time. Here it is again.`;
  if(store.bestLevel>2&&G.level===store.bestLevel+1)return `Level ${G.level}. You have never been this far. Neither has your luck.`;
  if(G.boss)return pick(['Boss level. Every trick I have, all at once.','All six tricks. Let’s see what you remember.']);
  const hot=G.tricks.filter(k=>stat(k).fooled>=2).sort((a,b)=>stat(b).fooled-stat(a).fooled)[0];
  if(hot){const n=stat(hot).fooled,nm=TRICKS[hot].name;
    return pick([`You fell for ${nm} ${n} times. It’s back.`,`${nm} works on you. Noted, and reloaded.`,`I know your weak spot: ${nm}.`,`${n} times with ${nm}. Let’s make it ${n+1}.`]);}
  if(G.level===1&&!weakness())return'Simple rule. What could go wrong?';
  return pick(['Trust the rule. Only the rule.','Still taking notes on you.','Read the rule twice. You will need it.','The screen is not on your side.']);
}

/* ---------- tiles ---------- */
function attrs(wantF,fixedLabel){
  let t;
  for(let i=0;i<80;i++){
    t=randTile(G.rule,G.level);if(fixedLabel!=null)t.label=fixedLabel;
    if(forbidden(t)===wantF)return t;
  }
  return t;
}
function lyingLabel(t){
  const other=D.palette(G.level).filter(c=>c!==t.color).map(up);
  return forbidden(t)?pick(['SAFE','OK','TAP',...other]):pick(['NO','STOP','DON’T',...other]);
}
function applyStroop(t){
  if(t.bait||hasWord(G.rule))return;
  t.label='';if(t.trick==='stroop')t.trick=null;
  if(!G.tricks.includes('stroop'))return;
  if(forbidden(t)&&rand()<.75){t.label=lyingLabel(t);t.trick='stroop';t.trickUntil=Infinity;}
  else if(!forbidden(t)&&rand()<.45)t.label=lyingLabel(t);
}
function spawn(wantF,extra={},fixedLabel){
  const el=document.createElement('div');
  const t={id:++uid,el,...attrs(wantF,fixedLabel),trick:null,trickUntil:0,fx:'',fxUntil:0,beckonUntil:0,size:G.size,x:0,y:0,vx:0,vy:0,cls:'',bg:'',txt:null,...extra};
  if(t.bait)t.size=Math.round(G.size*1.4);
  for(let i=0;i<12;i++){
    t.x=rnd(0,Math.max(1,G.W-t.size));t.y=rnd(0,Math.max(1,G.H-t.size));
    if(Math.hypot(t.x+t.size/2-G.ptr.x,t.y+t.size/2-G.ptr.y)>t.size*1.4)break;
  }
  const a=rnd(0,Math.PI*2),sp=G.speed*rnd(.6,1.4);t.vx=Math.cos(a)*sp;t.vy=Math.sin(a)*sp;
  el.dataset.id=t.id;el.style.setProperty('--s',t.size+'px');
  t.lab=document.createElement('span');t.lab.className='lab';el.appendChild(t.lab);
  arena.appendChild(el);G.tiles.push(t);
  if(fixedLabel==null)applyStroop(t);
  render(t,now());
  return t;
}
function kill(t){if(t.dead)return;t.dead=true;t.el.remove();G.tiles.splice(G.tiles.indexOf(t),1);}
function render(t,ts){
  let c='tile '+t.shape;
  if(t.color==='yellow')c+=' dark';
  if(t.chaser)c+=' chaser';
  if(t.bait)c+=' bait';
  else if(ts<t.beckonUntil)c+=' beckon';
  else if(ts<t.fxUntil)c+=' '+t.fx;
  if(c!==t.cls){t.el.className=c;t.cls=c;}
  const bg=`var(--${t.color})`;if(bg!==t.bg){t.el.style.background=bg;t.bg=bg;}
  if(t.label!==t.txt){t.lab.textContent=t.label;t.txt=t.label;}
  t.el.style.transform=`translate(${t.x}px,${t.y}px)`;
}
const center=t=>({x:t.x+t.size/2,y:t.y+t.size/2});
function nearestTo(list,p){let b=null,bd=1e9;for(const t of list){const c=center(t),d=Math.hypot(c.x-p.x,c.y-p.y);if(d<bd){bd=d;b=t;}}return b;}
const safeList=()=>G.tiles.filter(t=>!t.bait&&!forbidden(t));
const badList=()=>G.tiles.filter(t=>!t.bait&&forbidden(t));
const smartPick=list=>rand()<D.smart(G.level)?nearestTo(list,G.ptr):pick(list);

/* ---------- tricks ---------- */
function doShift(){
  const s=safeList().filter(t=>!t.pending);if(s.length<2)return;
  const t=smartPick(s),win=D.flicker(G.level);
  t.pending=true;t.fx='flicker';t.fxUntil=now()+win;
  setTimeout(()=>{
    if(t.dead||!G.running)return;
    t.pending=false;Object.assign(t,attrs(true));applyStroop(t);
    t.trick='shift';t.trickUntil=now()+2600;t.fxUntil=0;
    const b=badList().filter(x=>x!==t&&!x.chaser);
    if(b.length>2){const u=pick(b);Object.assign(u,attrs(false));if(u.trick!=='chase')u.trick=null;applyStroop(u);u.fx='blink';u.fxUntil=now()+300;}
  },win);
}
function doSwap(){
  const s=safeList(),b=badList().filter(t=>!t.chaser);if(!s.length||!b.length)return;
  const a=smartPick(s),f=nearestTo(b,center(a));
  [a.x,f.x]=[f.x,a.x];[a.y,f.y]=[f.y,a.y];
  f.trick='swap';f.trickUntil=now()+1700;
  a.fx=f.fx='blink';a.fxUntil=f.fxUntil=now()+300;
}
function doFake(){
  const b=badList();if(!b.length)return;
  const t=smartPick(b),C=up(t.color),S=up(t.shape);
  const msg=pick([`RULE UPDATE: ${C} IS SAFE NOW`,`TAP THE GLOWING ONE FOR 2× POINTS`,`QUICK, TAP THE ${C} ${S}!`,`RULE PAUSED FOR 3 SECONDS`,`BONUS TARGET: THE ${C} ${S}`,`STREAK SAVER: TAP THE ${C} ONE`]);
  t.beckonUntil=now()+2400;t.trick='fake';t.trickUntil=now()+2800;
  const el=document.createElement('div');el.className='banner';el.innerHTML=`<b>SYSTEM NOTICE</b>${msg}`;
  arena.appendChild(el);setTimeout(()=>el.remove(),2400);
}
function doBait(){
  if(G.tiles.some(t=>t.bait))return;
  const lbl=hasWord(G.rule)?pick(['GOLD +500','GOLD STAR','PINK BONUS','FREE GOLD']):pick(['+500','FREE LIFE','SKIP','2×','KEEP STREAK']);
  const t=spawn(true,{bait:true},lbl);
  t.trick='bait';t.trickUntil=Infinity;t.expires=now()+3400;t.vx*=.5;t.vy*=.5;
}
function glitch(ts){
  const dur=Math.min(2500,600+(G.level-15)*110),txt=ruleText();
  const scr=[...txt].map(ch=>/[A-Za-z]/.test(ch)&&Math.random()<.65?pick('ABCDEFGHIJKLMNOPQRSTUVWXYZ#%&?'.split('')):ch).join('');
  const r=$('#rule');r.textContent=scr;r.classList.add('glitch');G.glitchUntil=ts+dur;
}
function unglitch(){const r=$('#rule');r.classList.remove('glitch');r.innerHTML=ruleHTML();G.glitchUntil=0;}
function runTricks(ts){
  const T=G.T,has=k=>G.tricks.includes(k),p=k=>G.pace*(G.tpace[k]||1);
  if(has('shift')&&ts>T.shift){T.shift=ts+rnd(1700,2900)*p('shift');doShift();}
  if(has('swap')&&ts>T.swap){T.swap=ts+rnd(1800,3000)*p('swap');doSwap();}
  if(has('fake')&&ts>T.fake){T.fake=ts+rnd(3800,5600)*p('fake');doFake();}
  if(has('bait')&&ts>T.bait){T.bait=ts+rnd(4000,6000)*p('bait');doBait();}
  if(G.level>=15){
    if(G.glitchUntil&&ts>G.glitchUntil)unglitch();
    if(!G.glitchUntil&&ts>T.glitch){T.glitch=ts+rnd(3500,6000)*Math.max(.6,G.pace*1.2);glitch(ts);}
  }
}

/* ---------- tricks sent by a rival ---------- */
function sentStroop(){
  if(hasWord(G.rule)){doShift();return;}
  for(const t of badList()){if(rand()<.85){t.label=lyingLabel(t);t.trick='stroop';t.trickUntil=now()+6000;t.fx='blink';t.fxUntil=now()+300;}}
  for(const t of safeList()){if(rand()<.4)t.label=lyingLabel(t);}
}
function sentChase(){
  const cands=badList().filter(t=>!t.chaser);
  for(let i=0;i<2&&cands.length;i++){
    const t=cands.splice(Math.floor(rand()*cands.length),1)[0];
    t.chaser=true;t.trick='chase';t.trickUntil=now()+7000;t.chaseUntil=now()+7000;
  }
}
function applyIncoming(k,from){
  if(!G.running||M.out)return;
  const el=document.createElement('div');el.className='incoming';
  el.innerHTML=`<b>⚠ INCOMING FROM ${esc(up(from))}</b>${up(TRICKS[k].name)}`;
  arena.appendChild(el);setTimeout(()=>el.remove(),1700);
  G.lastSent={by:from,until:now()+6000};
  setTimeout(()=>{
    if(!G.running)return;
    if(k==='shift'){doShift();setTimeout(()=>G.running&&doShift(),650);}
    else if(k==='swap'){doSwap();setTimeout(()=>G.running&&doSwap(),550);}
    else if(k==='fake')doFake();
    else if(k==='bait'){G.tiles.filter(t=>t.bait).forEach(kill);doBait();}
    else if(k==='stroop')sentStroop();
    else if(k==='chase')sentChase();
  },350);
}
function receive(k,from){
  if(!M.active||M.out)return;
  if(G.running)applyIncoming(k,from);
  else G.inbox.push([k,from]);
}

/* ---------- loop ---------- */
function move(dt,ts){
  const s=safeList();
  for(const t of [...G.tiles]){
    if(t.expires&&ts>t.expires){kill(t);continue;}
    if(t.chaseUntil&&ts>t.chaseUntil){t.chaser=false;t.chaseUntil=0;if(t.trick==='chase')t.trick=null;}
    if(t.chaser&&s.length){
      const tg=center(nearestTo(s,G.ptr)),c=center(t);
      const dx=tg.x-c.x,dy=tg.y-c.y,d=Math.hypot(dx,dy)||1,acc=G.speed*3;
      t.vx+=dx/d*acc*dt;t.vy+=dy/d*acc*dt;
      const v=Math.hypot(t.vx,t.vy),max=G.speed*1.35;if(v>max){t.vx*=max/v;t.vy*=max/v;}
    }
    t.x+=t.vx*dt;t.y+=t.vy*dt;
    const mx=G.W-t.size,my=G.H-t.size;
    if(t.x<0){t.x=0;t.vx=Math.abs(t.vx);}if(t.x>mx){t.x=Math.max(0,mx);t.vx=-Math.abs(t.vx);}
    if(t.y<0){t.y=0;t.vy=Math.abs(t.vy);}if(t.y>my){t.y=Math.max(0,my);t.vy=-Math.abs(t.vy);}
  }
}
function maintain(){
  const live=G.tiles.filter(t=>!t.bait),share=D.badShare(G.level);
  while(live.length<G.N){
    const fc=live.filter(forbidden).length,sc=live.length-fc;
    live.push(spawn(sc<2?false:fc<Math.ceil(G.N*share)));
  }
  if(G.tricks.includes('chase')){
    const want=D.chasers(G.level),ch=live.filter(t=>t.chaser);
    for(const t of live){if(ch.length>=want)break;if(!t.chaser&&forbidden(t)){t.chaser=true;t.trick='chase';t.trickUntil=Infinity;ch.push(t);}}
  }
}
let last=now();
function loop(ts){
  const dt=Math.min(.05,(ts-last)/1000);last=ts;
  if(G.running&&ts>=G.freezeUntil){
    G.timeLeft-=dt;
    if(G.timeLeft<=0)timeout();
    else{runTricks(ts);move(dt,ts);maintain();}
  }
  for(const t of G.tiles)render(t,ts);
  const tb=$('#hTimer'),f=Math.max(0,G.timeLeft/G.timeMax);
  tb.style.transform=`scaleX(${f})`;tb.classList.toggle('low',f<.28);
  requestAnimationFrame(loop);
}
function measure(){G.W=arena.clientWidth;G.H=arena.clientHeight;G.size=Math.round(clamp(G.W/6.4,50,72));}
addEventListener('resize',measure);

/* ---------- input ---------- */
function setPtr(e){const r=arena.getBoundingClientRect();G.ptr={x:e.clientX-r.left,y:e.clientY-r.top};}
arena.addEventListener('pointermove',setPtr);
arena.addEventListener('pointerdown',e=>{
  setPtr(e);
  if(!G.running||now()<G.freezeUntil)return;
  const el=e.target.closest('.tile');if(!el)return;
  const t=G.tiles.find(x=>x.id==el.dataset.id);if(!t||t.dead)return;
  forbidden(t)?fail(t):collect(t);
});

/* ---------- outcomes ---------- */
const mult=()=>Math.min(5,1+Math.floor(G.streak/4));
function floatText(x,y,txt,cls=''){const d=document.createElement('div');d.className='float '+cls;d.textContent=txt;d.style.left=x+'px';d.style.top=y+'px';arena.appendChild(d);setTimeout(()=>d.remove(),700);}
function toast(big,small,good){const d=document.createElement('div');d.className='toast'+(good?' good':'');d.innerHTML=`<div>${big}${small?`<small>${esc(small)}</small>`:''}</div>`;arena.appendChild(d);setTimeout(()=>d.remove(),1000);}
function bump(id){const b=$(id);b.classList.remove('bump');void b.offsetWidth;b.classList.add('bump');}
function collect(t){
  const c=center(t);kill(t);
  const before=mult();G.streak++;const m=mult();
  const pts=100*m;G.got++;G.score+=pts;floatText(c.x-18,c.y-10,'+'+pts);
  if(duel()){G.charge=Math.min(MAX_CHARGE,G.charge+1);renderTricks();}
  hud();pub();
  if(m>before)bump('#hMult');
  if(G.got>=G.need)levelClear();
}
function loseLife(){
  G.lives--;G.levelLost=true;
  if(G.streak>=4)G.notes.push(`Streak of ${G.streak} broken.`);
  G.streak=0;hud();pub();
}
function fail(t){
  const k=(t.trick&&now()<t.trickUntil)?t.trick:'plain';
  stat(k).fooled++;G.levelFools[k]=(G.levelFools[k]||0)+1;save();
  kill(t);loseLife();
  arena.classList.remove('shake');void arena.offsetWidth;arena.classList.add('shake');
  const by=G.lastSent&&now()<G.lastSent.until?` · sent by ${G.lastSent.by}`:'';
  toast('GOTCHA',NAMES[k]+by);
  G.freezeUntil=now()+750;
  if(G.lives<=0){G.running=false;setTimeout(()=>duel()?eliminated():gameOver(),850);}
}
function timeout(){
  G.running=false;loseLife();toast('TOO SLOW');
  setTimeout(()=>G.lives<=0?(duel()?eliminated():gameOver()):intro(true),1000);
}
function levelClear(){
  G.running=false;if(G.glitchUntil)unglitch();
  const notes=[];
  const tb=Math.ceil(G.timeLeft)*20;G.score+=tb;notes.push(`Time bonus <b>+${tb}</b>`);
  if(G.boss){const bb=200*G.level;G.score+=bb;notes.push(`Boss defeated <b>+${bb}</b>`);}
  if(!G.levelLost){
    if(duel()){G.charge=Math.min(MAX_CHARGE,G.charge+2);notes.push('Clean level: <b>+2 trap charge</b>');}
    else if(G.lives<3){G.lives++;notes.push('Clean level: <b>+1 life</b>');}
    else{G.score+=300;notes.push('Clean level at full health <b>+300</b>');}
  }
  if(!duel()){
    let newlyBeaten=0;
    for(const k of G.tricks){
      if(!G.levelFools[k]&&store.dossier[k]!=='beaten'){store.dossier[k]='beaten';newlyBeaten++;notes.push(`Dossier: <b>${TRICKS[k].name}</b> defeated`);}
    }
    if(newlyBeaten&&TK.every(k=>store.dossier[k]==='beaten'))notes.push('<b>All six tricks defeated.</b> The dossier is complete.');
    store.bestLevel=Math.max(store.bestLevel||0,G.level+1);save();
  }
  hud();toast(G.boss?'BOSS DOWN':'CLEAR',G.levelLost?'':'Clean level',true);
  G.notes=notes;
  const cleared=G.level;G.level++;pub();renderTricks();
  setTimeout(()=>{if(duel()&&!M.active)return;cleared===30&&!G.endless&&!duel()?victory():intro(false);},1000);
}

/* ---------- flow ---------- */
function hud(){
  $('#hLevel').textContent=G.level;$('#hScore').textContent=G.score;$('#hMult').textContent='×'+mult();
  [...$('#hLives').children].forEach((i,n)=>i.classList.toggle('gone',n>=G.lives));
  $('#prog').textContent=`${Math.min(G.got,G.need)} / ${G.need}`;
}
function clearArena(){G.tiles.slice().forEach(kill);arena.querySelectorAll('.banner,.toast,.float,.incoming').forEach(e=>e.remove());}
function prepLevel(retry){
  clearArena();measure();
  const l=G.level;
  G.boss=l%5===0;
  if(!retry||!G.rule){
    if(duel())RNG=seeded(M.seed+':'+l);   // everyone in the match gets this exact rule
    G.rule=makeRule(l);
    RNG=Math.random;
  }
  // in a duel the game runs one fewer trick on its own: your rival supplies the rest
  G.tricks=G.boss?[...TK]:chooseTricks(Math.max(1,D.trickCount(l)-(duel()?1:0)));
  G.need=D.need(l);G.N=D.tiles(l);G.speed=D.speed(l);
  G.timeMax=G.timeLeft=D.time(l,G.need)+(G.boss?4:0);
  G.pace=D.pace(l)*(G.boss&&l<20?1.6:G.boss?1.15:1);
  const ws=G.tricks.map(weight),mean=ws.reduce((a,b)=>a+b,0)/ws.length;
  G.tpace={};G.tricks.forEach((k,i)=>G.tpace[k]=Math.pow(clamp(mean/ws[i],.6,1.5),.7));
  G.got=0;G.levelFools={};G.levelLost=false;G.glitchUntil=0;
  $('#rule').classList.remove('glitch');$('#rule').innerHTML=ruleHTML();
  $('#plate').classList.toggle('boss',G.boss);$('#plateLbl').textContent=G.boss?'Boss rule':'The rule';
  hud();
  const top=weakness();
  $('#strip').innerHTML='<span class="lbl">Active tricks</span>'+G.tricks.map(k=>`<span class="chip${k===top?' hot':''}">${TRICKS[k].name}</span>`).join('');
  pub();
}
function startLevel(){
  clearInterval(M.introTimer);M.introTimer=null;
  if(duel()&&(!M.active||M.out))return;
  overlay.hidden=true;
  G.tricks.forEach(k=>stat(k).levels++);stat('plain').levels++;save();
  const t=now();G.T={shift:t+1500,swap:t+2200,fake:t+2600,bait:t+1800,glitch:t+2500};
  G.ptr={x:G.W/2,y:G.H/2};
  maintain();G.running=true;G.freezeUntil=0;last=now();
  renderTricks();pub();
  // tricks that arrived between levels land shortly after the start
  const q=G.inbox.splice(0);q.forEach(([k,f],i)=>setTimeout(()=>receive(k,f),1200+i*900));
}
function intro(retry){
  prepLevel(retry);
  const notes=[...G.notes];G.notes=[];
  if(retry)notes.unshift('Out of time. Same rule, new board.');
  if(!retry&&MILESTONES[G.level])notes.push(MILESTONES[G.level]);
  if(!duel()){for(const k of G.tricks){if(!store.dossier[k]){store.dossier[k]='seen';notes.push(`New dossier entry: <b>${TRICKS[k].name}</b>. ${TRICKS[k].desc}.`);}}save();}
  const eyebrow=G.boss?`Boss level · Level ${G.level}`:duel()?`Level ${G.level}`:`Level ${G.level}${G.level<=30?' of 30':' · Endless'}`;
  overlay.innerHTML=`<div class="card${G.boss?' boss':''}">
    <div class="eyebrow${G.boss?' hot':''}">${eyebrow}</div>
    <h2>${ruleHTML()}</h2>
    <p class="muted">Tap ${G.need} safe things in ${G.timeMax} seconds. ${G.level>=15?'Memorize this rule. The rule bar will glitch.':'The rule up top is the only thing telling the truth.'}</p>
    ${notes.length?`<ul class="notes">${notes.map(n=>`<li>${n}</li>`).join('')}</ul>`:''}
    <div class="taunt">${taunt()}</div>
    <div class="btns">${duel()?`<span class="count" id="count">STARTING IN ${INTRO_SECS}</span>`:`<button class="big" id="go">${retry?'Retry':'Go'}</button>`}</div></div>`;
  overlay.hidden=false;
  if(duel()){
    // duels don't wait on a button: the clock keeps everyone moving
    let n=INTRO_SECS;clearInterval(M.introTimer);
    M.introTimer=setInterval(()=>{n--;const c=$('#count');if(c)c.textContent=`STARTING IN ${n}`;if(n<=0)startLevel();},1000);
  }else{$('#go').focus();$('#go').onclick=startLevel;}
}
function setDuelUI(on){
  $('#rivals').hidden=!on;$('#tbar').hidden=!on;$('#strip').hidden=on;$('#hMultBox').hidden=on;
  measure();
}
function newGame(){
  M.mode='solo';M.active=false;setDuelUI(false);
  Object.assign(G,{level:1,lives:3,score:0,streak:0,rule:null,notes:[],endless:false,charge:0,inbox:[]});intro(false);
}
function barsHTML(){
  const rows=[...TK,'plain'].map(k=>({k,n:stat(k).fooled})).sort((a,b)=>b.n-a.n);
  const max=Math.max(1,...rows.map(r=>r.n)),top=rows[0].n>0?rows[0].k:null;
  return rows.map(r=>`<div class="bar${r.k===top?' top':''}"><span>${NAMES[r.k]}</span><div class="track"><div class="fill" style="width:${r.n/max*100}%"></div></div><span class="n">${r.n}</span></div>`).join('');
}
function dossierHTML(){
  const beaten=TK.filter(k=>store.dossier[k]==='beaten').length;
  return `<div class="eyebrow">Trick dossier · ${beaten} of 6 defeated</div><div class="dossier">`+TK.map(k=>{
    const s=store.dossier[k];
    return s?`<div class="dcard ${s}"><span>${s==='beaten'?'Defeated':'Seen'}</span><b>${TRICKS[k].name}</b></div>`
            :`<div class="dcard locked"><span>Locked</span><b>???</b></div>`;
  }).join('')+'</div>';
}
function scoresHTML(isBest){
  return `<div class="scores"><div><span class="eyebrow">Score</span><b>${G.score}</b></div><div><span class="eyebrow">${isBest?'New best':'Best'}</span><b>${store.best||0}</b></div><div><span class="eyebrow">Level</span><b>${G.level}</b></div></div>`;
}
function gameOver(){
  G.running=false;clearArena();if(G.glitchUntil)unglitch();
  const isBest=G.score>(store.best||0);if(isBest)store.best=G.score;
  store.lastDeath=G.level;store.bestLevel=Math.max(store.bestLevel||0,G.level);save();
  const ws=weakness();
  overlay.innerHTML=`<div class="card">
    <div class="eyebrow">Game over</div>
    <h2>${ws?`Your weak spot: ${TRICKS[ws].name}`:'It got you.'}</h2>
    ${scoresHTML(isBest)}
    <div class="eyebrow">Times each trick fooled you</div>
    <div class="bars">${barsHTML()}</div>
    ${dossierHTML()}
    <p class="muted">${ws?`Expect more ${TRICKS[ws].name} next game. ${TRICKS[ws].desc}.`:'Next game it starts learning what works on you.'}</p>
    <div class="btns"><button class="big" id="again">Play again</button><button class="ghost" id="menu">Menu</button><button class="ghost" id="wipe">Wipe its memory</button></div></div>`;
  overlay.hidden=false;
  $('#again').onclick=newGame;$('#menu').onclick=title;$('#again').focus();wireWipe();
}
function victory(){
  const isBest=G.score>(store.best||0);if(isBest)store.best=G.score;
  store.beatGame=true;save();
  overlay.innerHTML=`<div class="card boss">
    <div class="eyebrow hot">Level 30 cleared</div>
    <h1>You beat<br>Trick Trap</h1>
    ${scoresHTML(isBest)}
    ${G.notes.length?`<ul class="notes">${G.notes.map(n=>`<li>${n}</li>`).join('')}</ul>`:''}
    ${dossierHTML()}
    <p class="muted">Keep going in endless mode. Levels keep counting and nothing gets easier.</p>
    <div class="btns"><button class="big" id="endless">Endless mode</button><button class="ghost" id="again">New game</button></div></div>`;
  G.notes=[];overlay.hidden=false;
  $('#endless').onclick=()=>{G.endless=true;intro(false);};$('#again').onclick=newGame;$('#endless').focus();
}
function wireWipe(){
  const w=$('#wipe');if(!w)return;let armed=false;
  w.onclick=()=>{
    if(!armed){armed=true;w.textContent='Tap again to wipe';return;}
    store={stats:{},best:store.best||0,bestLevel:0,lastDeath:0,dossier:{},beatGame:store.beatGame};save();
    w.textContent='Memory wiped';w.disabled=true;
    const b=document.querySelector('.bars');if(b)b.innerHTML=barsHTML();
  };
}

/* =====================================================================
   DUEL LAYER
   ===================================================================== */
const alive=p=>p.alive!==false&&!p.left;
const aliveRivals=()=>M.rivals.filter(alive);
// 1v1: your rival. 3–4 players: whoever is in the lead takes the hit.
function target(){
  const r=aliveRivals();if(!r.length)return null;
  return r.reduce((a,b)=>((b.level||1)*100+(b.got||0))>((a.level||1)*100+(a.got||0))?b:a);
}
function renderRivals(){
  if(!duel())return;
  const t=target();
  $('#rivals').innerHTML=M.rivals.map(p=>{
    const need=p.need||6,got=Math.min(p.got||0,need),lives=Math.max(0,p.lives??3);
    return `<div class="riv${alive(p)?'':' out'}${t&&p.id===t.id&&M.rivals.length>1?' target':''}">
      <span class="nm">${esc(p.name||'Player')}${t&&p.id===t.id&&M.rivals.length>1?'<em>TARGET</em>':''}${p.left?'<em style="color:var(--red)">LEFT</em>':''}</span>
      <span class="lvl">L${p.level||1}</span>
      <span class="pb"><i style="width:${alive(p)?got/need*100:0}%"></i></span>
      <span class="lv">${[0,1,2].map(i=>`<i class="${i<lives?'':'gone'}"></i>`).join('')}</span></div>`;
  }).join('');
}
function renderTricks(){
  if(!duel())return;
  $('#pips').innerHTML=Array.from({length:MAX_CHARGE},(_,i)=>`<i class="${i<G.charge?'on':''}"></i>`).join('');
  const t=target();
  $('#tks').innerHTML=SEND_ORDER.map(k=>{
    const weak=t&&t.weak===k;
    return `<button class="tk${weak?' weak':''}" data-k="${k}" ${G.running&&t&&G.charge>=COST[k]?'':'disabled'}>${TRICKS[k].name}<small>${COST[k]} ⚡${weak?' · their weakness':''}</small></button>`;
  }).join('');
}
$('#tks').addEventListener('click',e=>{const b=e.target.closest('button.tk');if(b&&!b.disabled)sendTrick(b.dataset.k);});
function sendTrick(k){
  const t=target();if(!t||G.charge<COST[k]||!G.running)return;
  G.charge-=COST[k];renderTricks();pub();
  floatText(G.W/2-70,G.H-40,`${TRICKS[k].name} → ${t.name}`,'sent');
  if(M.mode==='cpu')botReceive(k);
  else sendEvent(t.id,k);
}
let pubTimer=null,pubDirty=false;
function myState(){return{name:M.me.name,level:G.level,got:G.got,need:G.need,lives:Math.max(0,G.lives),alive:!M.out,outAt:M.outAt||0,weak:weakness()||'',charge:G.charge};}
function pub(){
  if(M.mode!=='online'||!M.active||!M.room)return;
  pubDirty=true;if(pubTimer)return;
  const flush=()=>{pubTimer=null;if(!pubDirty||!M.room)return;pubDirty=false;
    const {db,ref,set}=M.room.fb;set(ref(db,`rooms/${M.room.code}/live/${M.me.id}`),myState()).catch(()=>{});
    pubTimer=setTimeout(flush,150);};
  flush();
}
function eliminated(){
  G.running=false;clearArena();if(G.glitchUntil)unglitch();
  M.out=true;M.outAt=Date.now();pub();renderTricks();
  if(M.mode==='cpu'){checkOver();if(M.active)showOut();}
  else{checkOver();if(M.active)showOut();}
}
function standings(){
  const meRow={id:M.me.id,name:M.me.name||'You',level:G.level,alive:!M.out,outAt:M.outAt,me:true};
  return [meRow,...M.rivals].sort((a,b)=>(alive(b)-alive(a))||((b.outAt||0)-(a.outAt||0))||((b.level||0)-(a.level||0)));
}
function rankHTML(){
  return `<ol class="rank">${standings().map((p,i)=>`<li class="${i===0?'win':''}${p.me?' me':''}"><b>${i+1}</b><span>${esc(p.name)}${p.me&&p.name!=='You'?' (you)':''}</span><span class="eyebrow">${alive(p)?'IN · L'+(p.level||1):'OUT · L'+(p.level||1)}</span></li>`).join('')}</ol>`;
}
const aliveCount=()=>aliveRivals().length+(M.out?0:1);
function showOut(){
  const place=standings().findIndex(p=>p.me)+1;
  overlay.innerHTML=`<div class="card"><div class="eyebrow">You're out</div><h2>${ordinal(place)} place so far</h2>
    <p class="muted">Watch the rest of the match here.</p>${rankHTML()}
    <div class="btns"><button class="ghost" id="leave">${M.mode==='online'?'Leave room':'Menu'}</button></div></div>`;
  overlay.hidden=false;$('#leave').onclick=leaveMatch;
}
const ordinal=n=>n+(['th','st','nd','rd'][(n%100-20)%10]||['th','st','nd','rd'][n%100]||'th');
function checkOver(){
  if(!M.active)return;
  const total=M.rivals.length+1;
  if(total<2)return;
  if(aliveCount()<=1)endMatch();
}
function endMatch(){
  M.active=false;clearInterval(M.introTimer);M.introTimer=null;
  const won=!M.out;
  G.running=false;clearArena();if(G.glitchUntil)unglitch();
  stopBot();renderTricks();
  if(won){M.outAt=0;}
  pub();
  const host=M.mode==='cpu'||(M.room&&M.room.host===M.me.id);
  overlay.innerHTML=`<div class="card${won?' boss':''}">
    <div class="eyebrow${won?' hot':''}">Match over</div>
    ${won?'<h1>You win</h1>':`<h2>${esc(standings()[0].name)} wins</h2>`}
    ${rankHTML()}
    <div class="btns">${host?'<button class="big" id="rematch">Rematch</button>':'<span class="msg">Waiting for the host to start a rematch…</span>'}
    <button class="ghost" id="leave">${M.mode==='online'?'Leave room':'Menu'}</button></div></div>`;
  overlay.hidden=false;
  if(host)$('#rematch').onclick=()=>M.mode==='cpu'?startCpu(M.level):hostStart();
  $('#leave').onclick=leaveMatch;
}
function beginMatch(seed){
  M.seed=seed;M.active=true;M.out=false;M.outAt=0;
  M.mode!=='solo'&&setDuelUI(true);
  Object.assign(G,{level:1,lives:3,score:0,streak:0,rule:null,notes:[],endless:false,charge:0,inbox:[],lastSent:null});
  renderRivals();renderTricks();
  intro(false);
}
function leaveMatch(){
  M.active=false;clearInterval(M.introTimer);stopBot();G.running=false;clearArena();
  if(M.mode==='online')leaveRoom();
  M.mode='solo';M.rivals=[];setDuelUI(false);title();
}

/* ---------- CPU rival ---------- */
const BOT={
  easy:{rate:1.0,fail:.05,fl:.004,think:.25,name:'CPU · EASY'},
  medium:{rate:1.3,fail:.035,fl:.003,think:.4,name:'CPU · MEDIUM'},
  hard:{rate:1.65,fail:.02,fl:.0022,think:.6,name:'CPU · HARD'}
};
let botTimer=null;
function startCpu(level){
  stopBot();
  M.mode='cpu';M.level=level;const cfg=BOT[level];
  const b={id:'cpu',name:cfg.name,level:1,got:0,need:D.need(1),lives:3,alive:true,outAt:0,charge:0,
    weak:pick(TK),phase:'intro',phaseUntil:Date.now()+INTRO_SECS*1000,timeLeft:0,lost:false,stunUntil:0,stunPow:0,freeze:0};
  M.bot=b;M.rivals=[b];
  beginMatch('cpu-'+Date.now());
  let lastT=Date.now();
  botTimer=setInterval(()=>{const t=Date.now(),dt=(t-lastT)/1000;lastT=t;botTick(dt,t);},100);
}
function stopBot(){clearInterval(botTimer);botTimer=null;}
function botTick(dt,t){
  const b=M.bot,cfg=BOT[M.level];if(!b||!M.active||!alive(b))return;
  if(b.phase==='intro'){
    if(t>=b.phaseUntil){b.phase='play';b.need=D.need(b.level);b.got=0;b.lost=false;b.timeLeft=D.time(b.level,b.need)+(b.level%5===0?4:0);}
    renderRivals();return;
  }
  if(t<b.freeze)return;
  b.timeLeft-=dt;
  if(b.timeLeft<=0){botLoseLife(t);if(alive(b)){b.phase='intro';b.phaseUntil=t+(INTRO_SECS+1)*1000;}renderRivals();return;}
  const stunned=t<b.stunUntil;
  const rate=cfg.rate*(1-Math.min(.35,b.level*.012))*(stunned?.7:1);
  if(Math.random()<rate*dt){
    const pf=cfg.fail+b.level*cfg.fl+(stunned?b.stunPow:0)+(b.level%5===0?.02:0);
    if(Math.random()<pf){botLoseLife(t);b.freeze=t+750;}
    else{
      b.got++;b.charge=Math.min(MAX_CHARGE,b.charge+1);
      if(b.got>=b.need){
        if(!b.lost)b.charge=Math.min(MAX_CHARGE,b.charge+2);
        b.level++;b.got=0;b.need=D.need(b.level);b.phase='intro';b.phaseUntil=t+(INTRO_SECS+1)*1000;
      }
    }
    renderRivals();renderTricks();
  }
  // the CPU spends its charge on you, aiming at your weak spot when it can
  if(!M.out&&b.charge>=1&&Math.random()<cfg.think*dt){
    const afford=SEND_ORDER.filter(k=>COST[k]<=b.charge);
    const myWeak=weakness();
    let k=null;
    if(M.level==='hard'){k=myWeak&&COST[myWeak]<=b.charge?myWeak:(b.charge>=3?afford[afford.length-1]:null);}
    else if(M.level==='medium'){k=myWeak&&COST[myWeak]<=b.charge&&Math.random()<.5?myWeak:(b.charge>=2?pick(afford):null);}
    else{k=pick(afford.filter(x=>COST[x]<=2));}
    if(k){b.charge-=COST[k];receive(k,b.name);renderRivals();}
  }
}
function botLoseLife(t){
  const b=M.bot;b.lives--;b.lost=true;
  if(b.lives<=0){b.alive=false;b.outAt=Date.now();renderRivals();renderTricks();checkOver();}
}
function botReceive(k){
  const b=M.bot;if(!b||!alive(b))return;
  const t=Date.now();
  b.stunUntil=t+4500;
  b.stunPow=(.035*COST[k])*(k===b.weak?2.2:1);
}

/* ---------- online rooms ---------- */
const GAME='trick-trap';
function saveName(v){M.me.name=(v||'').trim().slice(0,12);try{localStorage.setItem('evo-arcade-name',M.me.name)}catch(e){}}
async function createRoom(){
  const fb=await net();const {db,ref,get,set,serverTimestamp}=fb;
  let code;
  for(let i=0;i<6;i++){code=newCode();if(!(await get(ref(db,`rooms/${code}/game`))).exists())break;}
  await set(ref(db,`rooms/${code}`),{game:GAME,created:serverTimestamp(),host:M.me.id,status:'lobby',round:0,
    players:{[M.me.id]:{name:M.me.name,joined:Date.now()}}});
  enterRoom(fb,code);
}
async function joinRoom(code){
  const fb=await net();const {db,ref,get,set}=fb;
  const snap=await get(ref(db,`rooms/${code}`));
  if(!snap.exists())throw new Error('No room with that code. Double-check it with your friend.');
  const r=snap.val();
  if(r.game!==GAME)throw new Error('That code is for a different game.');
  const players=r.players||{};
  if(!players[M.me.id]){
    if(r.status!=='lobby')throw new Error('That match already started. Ask for a rematch invite.');
    if(Object.keys(players).length>=4)throw new Error('That room is full (4 players max).');
    await set(ref(db,`rooms/${code}/players/${M.me.id}`),{name:M.me.name,joined:Date.now()});
  }
  enterRoom(fb,code);
}
function enterRoom(fb,code){
  leaveRoom(true);
  const {db,ref,onValue,set,onDisconnect}=fb;
  M.mode='online';M.room={fb,code,ref:ref(db,`rooms/${code}`),host:null,status:null,lobbyKey:''};
  const here=ref(db,`rooms/${code}/online/${M.me.id}`);set(here,true);onDisconnect(here).remove();M.room.here=here;
  history.replaceState(null,'','?room='+code);
  M.room.unsub=onValue(M.room.ref,snap=>handleRoom(snap.val()));
}
function handleRoom(r){
  if(!M.room)return;
  if(!r){leaveRoom();title('That room was closed.');return;}
  const R=M.room;R.host=r.host;R.status=r.status;
  const players=r.players||{},online=r.online||{},live=r.live||{};
  // the host left? the longest-waiting player takes over
  if(!online[r.host]&&online[M.me.id]){
    const ids=Object.keys(players).filter(id=>online[id]).sort((a,b)=>players[a].joined-players[b].joined);
    if(ids[0]===M.me.id&&r.host!==M.me.id)R.fb.update(R.ref,{host:M.me.id});
  }
  if(r.status==='lobby'){renderLobby(r);return;}
  if(r.status==='playing'){
    const order=r.order||[];
    if(r.round!==M.round){
      M.round=r.round;M.seenEvents=new Set();M.order=order;
      if(!order.includes(M.me.id)){M.active=false;overlay.innerHTML=`<div class="card"><div class="eyebrow">Room ${R.code}</div><h2>Match in progress</h2><p class="muted">You'll be in the next round when the host starts a rematch.</p><div class="btns"><button class="ghost" id="leave">Leave room</button></div></div>`;overlay.hidden=false;$('#leave').onclick=leaveMatch;return;}
      M.rivals=order.filter(id=>id!==M.me.id).map(id=>({id,name:players[id]?.name||'Player',level:1,got:0,need:6,lives:3,alive:true}));
      beginMatch(r.seed);
    }
    if(!M.order.includes(M.me.id))return;
    // rivals' live state
    for(const p of M.rivals){
      const s=live[p.id];if(s)Object.assign(p,s,{id:p.id});
      p.left=!online[p.id];
      if(p.left&&!p.leftAt)p.leftAt=Date.now();
      if(!p.left)p.leftAt=0;
      if(p.left&&!p.outAt)p.outAt=p.leftAt;
    }
    renderRivals();renderTricks();
    // tricks fired at me
    const ev=r.events||{};
    for(const [k,e] of Object.entries(ev)){
      if(e.to!==M.me.id||e.round!==M.round||M.seenEvents.has(k))continue;
      M.seenEvents.add(k);receive(e.trick,e.fromName||'Rival');
      R.fb.remove(R.fb.ref(R.fb.db,`rooms/${R.code}/events/${k}`)).catch(()=>{});
    }
    if(M.active)checkOver();
    else if(overlay.querySelector('.rank'))refreshResults();
    if(M.active&&M.out)showOut();
  }
}
function refreshResults(){
  const host=M.room&&M.room.host===M.me.id;
  const r=overlay.querySelector('.rank');if(r)r.outerHTML=rankHTML();
  const btns=overlay.querySelector('.btns');
  if(btns&&host&&!$('#rematch')){btns.insertAdjacentHTML('afterbegin','<button class="big" id="rematch">Rematch</button>');btns.querySelector('.msg')?.remove();$('#rematch').onclick=hostStart;}
}
function renderLobby(r){
  M.active=false;G.running=false;stopBot();setDuelUI(false);clearArena();
  const players=r.players||{},online=r.online||{};
  const ids=Object.keys(players).filter(id=>online[id]||id===M.me.id).sort((a,b)=>players[a].joined-players[b].joined);
  const host=r.host===M.me.id;
  const key=JSON.stringify([ids,ids.map(i=>players[i].name),r.host]);
  if(key===M.room.lobbyKey&&!overlay.hidden)return;M.room.lobbyKey=key;
  overlay.innerHTML=`<div class="card">
    <div class="eyebrow hot">Trick Trap · online duel</div>
    <div class="eyebrow" style="text-align:center">Room code</div>
    <div class="bigcode">${M.room.code}</div>
    <ul class="plist">${ids.map(id=>`<li class="${id===M.me.id?'me':''}"><span>${esc(players[id].name||'Player')}${id===M.me.id?' (you)':''}</span>${id===r.host?'<em>HOST</em>':''}</li>`).join('')}
      ${ids.length<4?`<li style="opacity:.45"><span>Waiting for players…</span><em>${ids.length}/4</em></li>`:''}</ul>
    <p class="muted">${ids.length<2?'Send your friends the code or invite link. 2 to 4 players.':host?'Everyone in? Start when ready.':'Waiting for the host to start.'}</p>
    <div class="btns">${host?`<button class="big" id="start" ${ids.length<2?'disabled':''}>Start match</button>`:''}
      <button class="out2" id="share">Invite link</button><button class="ghost" id="leave">Leave</button></div>
    <div class="msg" id="shareMsg"></div></div>`;
  overlay.hidden=false;
  if(host)$('#start').onclick=hostStart;
  $('#leave').onclick=leaveMatch;
  $('#share').onclick=async()=>{
    const url=location.origin+location.pathname+'?room='+M.room.code;
    try{if(navigator.share)await navigator.share({title:'Trick Trap',text:`Duel me in Trick Trap. Room ${M.room.code}`,url});
      else{await navigator.clipboard.writeText(url);$('#shareMsg').textContent='Link copied. Send it to your friends.';}}catch(e){}
  };
}
function hostStart(){
  const R=M.room;if(!R)return;
  R.fb.get(R.ref).then(s=>{
    const r=s.val()||{},players=r.players||{},online=r.online||{};
    const order=Object.keys(players).filter(id=>online[id]).sort((a,b)=>players[a].joined-players[b].joined).slice(0,4);
    if(order.length<2)return;
    R.fb.update(R.ref,{status:'playing',round:(r.round||0)+1,seed:Math.random().toString(36).slice(2),order,live:null,events:null});
  });
}
function sendEvent(to,k){
  const R=M.room;if(!R)return;
  const key=Date.now().toString(36)+Math.random().toString(36).slice(2,6);
  R.fb.set(R.fb.ref(R.fb.db,`rooms/${R.code}/events/${key}`),{to,from:M.me.id,fromName:M.me.name||'Rival',trick:k,round:M.round}).catch(()=>{});
}
function leaveRoom(silent){
  const R=M.room;if(!R)return;
  R.unsub?.();
  R.fb.remove(R.here).catch(()=>{});
  if(R.status==='lobby')R.fb.remove(R.fb.ref(R.fb.db,`rooms/${R.code}/players/${M.me.id}`)).catch(()=>{});
  M.room=null;M.round=0;
  if(!silent)history.replaceState(null,'',location.pathname);
}

/* ---------- title / mode select ---------- */
function title(msg){
  M.mode='solo';M.active=false;setDuelUI(false);clearArena();
  const ws=weakness(),seen=TK.some(k=>store.dossier[k]);
  overlay.innerHTML=`<div class="card">
    <h1>Trick<br>Trap</h1>
    <p>Every level gives you a rule. Tap the safe things and avoid everything else.</p>
    ${store.bestLevel>1?`<div class="taunt">Furthest you have reached: level ${store.bestLevel}.${ws?` Weak spot: ${TRICKS[ws].name}.`:''}</div>`:''}
    <div class="mode"><h3>SOLO · 30 LEVELS</h3>
      <p>Colors change. Labels lie. Every 5th level is a boss, and the game leans on the tricks that fool you.</p>
      <div class="btns"><button class="big" id="start">Play solo</button>${seen?'<button class="ghost" id="dos">Dossier</button>':''}</div></div>
    <div class="mode"><h3>DUEL VS COMPUTER</h3>
      <p>Same rules as your rival. Safe taps charge traps you can fire at their screen. Last one standing wins.</p>
      <div class="btns"><button class="ghost" data-l="easy">Easy</button><button class="ghost on" data-l="medium">Medium</button><button class="ghost" data-l="hard">Hard</button><button class="big" id="cpu">Duel</button></div></div>
    <div class="mode"><h3>ONLINE DUEL · 2–4 PLAYERS</h3>
      <input class="tin" id="name" maxlength="12" placeholder="Your name" value="${esc(M.me.name)}" autocomplete="off">
      <div class="btns"><button class="big" id="create" ${onlineReady?'':'disabled'}>Create room</button></div>
      <div class="btns"><input class="tin code" id="code" maxlength="4" placeholder="CODE" autocomplete="off" autocapitalize="characters" spellcheck="false" ${onlineReady?'':'disabled'}>
        <button class="out2" id="join" ${onlineReady?'':'disabled'}>Join</button></div>
      <div class="msg${msg?' err':''}" id="msg">${esc(msg||(onlineReady?'':'Online play is coming soon.'))}</div></div>
  </div>`;
  overlay.hidden=false;
  $('#start').onclick=newGame;
  if($('#dos'))$('#dos').onclick=showDossier;
  const lv=[...overlay.querySelectorAll('[data-l]')];
  lv.forEach(b=>b.onclick=()=>{lv.forEach(x=>x.classList.toggle('on',x===b));M.level=b.dataset.l;});
  $('#cpu').onclick=()=>startCpu(overlay.querySelector('[data-l].on').dataset.l);
  const say=(t,err)=>{$('#msg').textContent=t;$('#msg').className='msg'+(err?' err':'');};
  const needName=()=>{saveName($('#name').value);if(!M.me.name){say('Enter your name first.',true);$('#name').focus();return false;}return true;};
  $('#code').oninput=e=>{e.target.value=cleanCode(e.target.value);};
  $('#create').onclick=async()=>{if(!needName())return;say('Creating room…');try{await createRoom();}catch(e){console.error(e);say("Couldn't create a room. Check your connection.",true);}};
  $('#join').onclick=async()=>{if(!needName())return;const c=cleanCode($('#code').value);if(c.length!==4)return say('Room codes are 4 characters.',true);
    say('Joining '+c+'…');try{await joinRoom(c);}catch(e){console.error(e);say(e.message||"Couldn't reach the game server.",true);}};
  $('#code').onkeydown=e=>{if(e.key==='Enter')$('#join').click();};
}
function showDossier(){
  overlay.innerHTML=`<div class="card"><div class="eyebrow">What fools you</div><div class="bars">${barsHTML()}</div>${dossierHTML()}
    <div class="btns"><button class="big" id="back">Back</button><button class="ghost" id="wipe">Wipe its memory</button></div></div>`;
  $('#back').onclick=()=>title();wireWipe();
}

measure();requestAnimationFrame(loop);
const qs=new URLSearchParams(location.search);
const roomParam=cleanCode(qs.get('room')||'');
if(roomParam&&onlineReady){
  title();$('#code').value=roomParam;
  if(M.me.name)$('#join').click();
  else{$('#msg').textContent=`Enter your name, then tap Join for room ${roomParam}.`;$('#name').focus();}
}else if(qs.get('mode')==='cpu')startCpu('medium');
else title();
if(qs.has('test'))window.__tt={G,M,forbidden,sendTrick,receive,target,ruleFor:(seed,l)=>{RNG=seeded(seed+':'+l);const r=makeRule(l);RNG=Math.random;return JSON.stringify(r);}};
