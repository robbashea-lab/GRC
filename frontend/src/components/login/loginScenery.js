// Login-only decorative renderer. It never reads inputs, accounts or client records.
export function createLoginScenery(root) {
 const $=id=>id==='omni-login'?root:root.querySelector('#login-'+id);
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const unit=()=>innerWidth<=760?1:clamp(innerWidth*.0003125+innerHeight*.000555,.85,2.25);
 function buildCity(){
 const NS='http://www.w3.org/2000/svg',svg=$('city'),rs=$('city-reflect');let seed=90471;
 const rnd=()=>(seed=seed*16807%2147483647)/2147483647;
 const add=(p,tag,a)=>{const n=document.createElementNS(NS,tag);for(const k in a)n.setAttribute(k,a[k]);p.appendChild(n);return n;};
 const reflect=(x,w,len,cls)=>add(rs,'rect',{x:x.toFixed(1),y:0,width:w.toFixed(1),height:len.toFixed(1),class:cls});
 function layer(cls,ranges,o){
  const g=add(svg,'g',{class:cls}),neon=add(svg,'g',{class:cls+' neon'});
  for(const [from,to] of ranges){
   for(let x=from;x<to;){
    const w=o.minW+rnd()*(o.maxW-o.minW),h=o.height(x+w/2),y=1000-h;
    add(g,'rect',{x:x.toFixed(1),y:y.toFixed(1),width:w.toFixed(1),height:h.toFixed(1),class:'b'});
    if(o.edge)add(g,'rect',{x:(x+(x+w/2<800?w-1.4:0)).toFixed(1),y:y.toFixed(1),width:1.4,height:h.toFixed(1),class:'e'});
    let d='';const left=x+w/2<800,lit=o.lit*(rnd()<.3?.25:.6+rnd()*.8)*(left?o.leftLit:1);
    for(let yy=y+o.pad;yy<994-o.ch;yy+=o.ch+o.gy){if(rnd()>o.row)continue;for(let xx=x+3;xx<x+w-o.cw-2;xx+=o.cw+o.gx)if(rnd()<lit)d+=`M${xx.toFixed(1)} ${yy.toFixed(1)}h${o.cw}v${o.ch}h-${o.cw}z`;}
    if(d)add(g,'path',{d,class:'w'});
    if(o.glow&&rnd()<o.glow){reflect(x+2,w-4,90+rnd()*160,'rw');}
    if(rnd()<o.neon*(left?o.leftNeon:1)){const nx=rnd()<.5?x+1:x+w-3,c=rnd()<.28?'nv':'nb',top=y+h*((left?.5:.04)+rnd()*.2);add(neon,'rect',{x:nx.toFixed(1),y:top.toFixed(1),width:2.2,height:(1000-top).toFixed(1),class:c});reflect(nx-1,4.2,150+rnd()*260,c==='nv'?'rv':'rb');}
    if(!left&&h>420&&rnd()<.55)add(neon,'circle',{cx:(x+w/2).toFixed(1),cy:(y-4).toFixed(1),r:2.2,class:'beacon'});
    x+=w+o.gap*rnd();
   }
  }
 }
 const e=x=>Math.abs(x-800)/800;
 layer('c-far',[[-20,1620]],{minW:16,maxW:44,gap:5,height:x=>70+400*Math.pow(e(x),1.9)+rnd()*80,pad:6,cw:2,ch:2,gx:4,gy:5,row:.55,lit:.22,neon:.05,leftLit:1,leftNeon:1});
 add(svg,'rect',{x:-20,y:520,width:1640,height:480,class:'haze-band'});
 layer('c-mid',[[-20,520],[1090,1620]],{minW:36,maxW:86,gap:10,height:x=>170+560*Math.pow(e(x),1.25)+rnd()*120,pad:10,cw:3,ch:4,gx:4,gy:6,row:.6,lit:.3,neon:.32,edge:1,glow:.35,leftLit:.55,leftNeon:.35});
 add(svg,'rect',{x:-20,y:640,width:1640,height:360,class:'haze-band',opacity:.6});
 layer('c-near',[[-70,250],[1340,1680]],{minW:86,maxW:140,gap:14,height:()=>820+rnd()*190,pad:16,cw:7,ch:2,gx:3,gy:8,row:.72,lit:.36,neon:.9,edge:1,glow:.8,leftLit:.5,leftNeon:.4});
}
function buildFloor(){
 let d='';for(let i=-34;i<=34;i++)d+=`M500 -40L${500+i*118} 100`;
 for(let k=1;k<=17;k++)d+=`M0 ${(100*Math.pow(k/17,2.05)).toFixed(2)}H1000`;
 $('floor-grid-path').setAttribute('d',d);
}
const Globe=(()=>{
 const cv=$('globe'),g=cv.getContext('2d'),rad=Math.PI/180;
 // Coarse, stylised land outlines (longitude, latitude). Decorative only.
 const LAND=[
  [[-168,66],[-162,70],[-140,70],[-128,70],[-115,68],[-100,68],[-94,71],[-86,69],[-81,64],[-90,57],[-82,53],[-78,56],[-77,61],[-70,61],[-64,59],[-61,56],[-56,52],[-60,47],[-66,44],[-70,42],[-74,40],[-76,35],[-81,31],[-80,26],[-81,25],[-83,29],[-89,30],[-94,29],[-97,27],[-97,22],[-95,18],[-91,19],[-88,21],[-87,16],[-84,15],[-83,11],[-81,8],[-78,8],[-83,8],[-86,11],[-88,13],[-92,14],[-96,16],[-101,17],[-105,20],[-110,23],[-112,29],[-115,30],[-117,33],[-121,35],[-124,40],[-124,46],[-127,50],[-131,54],[-136,58],[-142,60],[-148,60],[-153,58],[-158,56],[-164,55],[-160,59],[-166,62]],
  [[-73,78],[-60,82],[-35,83],[-20,80],[-18,75],[-22,70],[-32,68],[-42,62],[-48,60],[-52,64],[-55,70],[-60,75]],
  [[-90,72],[-80,73.6],[-70,71],[-62,67],[-64,64],[-72,63],[-78,64.5],[-85,66],[-88,69]],
  [[-125,71],[-115,73],[-105,73],[-100,70],[-110,68.5],[-120,69]],[[-95,76],[-80,76],[-62,82],[-80,83],[-95,81],[-100,78]],
  [[-78,9],[-72,12],[-63,11],[-55,6],[-50,2],[-44,-2],[-35,-6],[-37,-12],[-39,-18],[-41,-22],[-48,-26],[-53,-34],[-58,-38],[-62,-40],[-65,-45],[-68,-50],[-69,-55],[-74,-52],[-75,-46],[-73,-40],[-72,-30],[-71,-20],[-76,-14],[-80,-6],[-81,-2],[-80,1],[-78,5]],
  [[-9,43],[-2,43.5],[-1,46],[-4,48],[2,51],[5,53],[8,54],[9,56],[12,54],[18,55],[21,57],[24,59],[29,60],[33,67],[40,66],[44,68],[54,69],[60,70],[68,71],[72,73],[80,73],[88,75],[100,77],[110,76],[120,73],[130,72],[140,73],[150,71],[160,70],[170,70],[180,69],[180,65],[175,64],[170,60],[163,58],[160,54],[157,51],[155,57],[150,59],[143,59],[137,54],[141,52],[140,48],[135,43],[130,42],[129,37],[127,35],[126,38],[125,40],[121,40],[119,37],[122,37],[120,32],[122,30],[120,26],[117,23],[113,22],[110,21],[108,18],[109,12],[106,9],[104,10],[101,13],[100,8],[103,2],[104,1.5],[101,3],[98,8],[98,14],[97,17],[94,18],[92,22],[90,22],[87,21],[85,19],[80,15],[80,10],[77,8],[76,11],[73,17],[72,21],[70,22],[67,25],[62,25],[57,26],[56,27],[52,28],[50,30],[48,30],[50,26],[51,24],[55,25],[57,24],[59,22],[57,19],[55,17],[52,16],[44,12],[43,14],[41,16],[39,21],[37,25],[35,28],[34,31],[35,33],[36,36],[32,36.5],[28,36.5],[27,38],[26,40],[24,40],[23,37],[21,38],[20,40],[19,42],[16,43],[13,45],[12,44],[14,42],[16,40],[16,38],[15,40],[12,42],[10,44],[8,44],[4,43],[3,42],[0,40],[-1,37],[-5,36],[-9,37]],
  [[5,58],[5,62],[10,64],[14,67],[17,69],[22,70],[28,71],[31,70],[30,66],[30,61],[24,60],[21,61],[22,65],[19,63],[17,61],[18,59],[16,56],[13,56],[11,59],[8,58]],
  [[-5.5,50],[1.5,51],[1.7,53],[0,54],[-1.5,55.5],[-2,57.5],[-4,58.6],[-6,58],[-5.5,56],[-4.8,55],[-3,54.5],[-4.5,53.5],[-4.5,52],[-5.5,51.5]],[[-10,51.5],[-6,52],[-6,54.5],[-8,55.2],[-10,54]],[[-24,64],[-22,66.4],[-15,66.5],[-13.5,65],[-18,63.4]],
  [[-17,21],[-16,24],[-13,27],[-10,30],[-9,33],[-6,35.8],[-2,35.2],[3,36.8],[10,37.2],[11,35],[10,33.5],[15,32],[20,31],[20,32.7],[25,32],[30,31.4],[32,31],[34,31.3],[33,28],[35,24],[37,21],[38,18],[39,15.5],[42,13],[43.3,11.6],[45,10.5],[51,11.8],[51,10],[49,6],[46,2],[42,-1],[40,-3],[39,-6],[39.5,-10],[40.5,-15],[37,-18],[35,-21],[35.5,-24],[33,-26],[32.5,-28.5],[30,-31],[27,-33.5],[23,-34],[20,-34.8],[18.3,-34],[18,-31],[16,-28],[15,-26],[14.5,-22],[12,-18],[12,-13],[13.5,-11],[12.5,-6],[12,-4],[9.5,-1],[9.5,3],[9,4],[6,4.3],[2,6.3],[-2,5],[-4,5.2],[-7.5,4.4],[-10,6],[-12.5,7.5],[-13.5,9.5],[-15,11],[-16.7,12.5],[-17.5,14.7],[-16.5,16.5],[-16,19]],
  [[44,-25],[47,-25],[50,-16],[49.5,-12],[48,-13.5],[44,-17],[43.5,-22]],
  [[113.5,-22],[113,-26],[115,-34],[118,-35],[123,-34],[126,-32],[131,-31.5],[135,-34.5],[138,-35.5],[140,-38],[146,-39],[150,-37.5],[153,-32],[153.5,-28],[153,-25],[150,-22],[146,-19],[145.5,-15],[143.5,-14],[142.5,-10.7],[141.5,-13],[141.5,-17],[139,-17],[136,-15],[137,-12],[132,-11.3],[130,-12.5],[129,-15],[126,-14],[124.5,-16.5],[122,-18],[120,-20],[117,-20.5]],
  [[145,-41],[148,-41],[148,-43.5],[146,-43.5]],[[172.7,-34.5],[178.5,-37.6],[175.2,-41.5],[173.8,-39]],[[174,-41],[173,-43.5],[171,-44.5],[169,-46.6],[166.5,-46],[168,-44],[172,-40.6]],
  [[130,31],[132,34],[135,34],[140,35],[141.5,38],[142,40],[141,41.5],[143,42],[145.5,43.3],[144,44.5],[142,45.5],[141,43],[140,41.5],[139.8,40],[138.5,37.5],[136.5,37],[135,35.6],[132,35.4],[130,33.8]],
  [[79.8,6],[81.8,7],[80.2,9.8]],[[109,1.5],[111,2],[113.5,4],[116,7],[119,5],[118,1],[116.5,-1],[116,-4],[114,-3.5],[110.5,-3],[109,-1]],
  [[95.3,5.6],[98,4],[103,-1],[106,-5.8],[104.5,-5.8],[101,-3],[98.5,0],[95.5,3]],[[105.5,-6.8],[108,-6.3],[112,-6.8],[114.5,-7.8],[110,-8.2],[106,-7.4]],
  [[131,-1],[134,-1],[138,-1.6],[141,-2.6],[145,-4],[147.5,-6],[150,-10.5],[147,-10],[144,-7.8],[142.5,-9.2],[141,-9.1],[139,-8],[137.8,-5],[135,-4],[132,-3]],
  [[120,18.5],[122,18.5],[122.3,16],[121.5,14],[124,12.5],[125.5,9.5],[126,7],[125,5.8],[122,7],[123,10],[120.5,14],[119.8,16]],
  [[-85,21.8],[-82,23.1],[-77,22],[-74.2,20.2],[-77.5,19.9],[-80,21.6]],[[-74.4,19.8],[-70,19.8],[-68.4,18.6],[-71.4,17.6],[-74.4,18.4]]
 ].map(p=>{let a=1e9,b=-1e9,c=1e9,d=-1e9;for(const [x,y] of p){a=Math.min(a,x);b=Math.max(b,x);c=Math.min(c,y);d=Math.max(d,y);}return {p,a,b,c,d};});
 const inPoly=(x,y,p)=>{let c=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const xi=p[i][0],yi=p[i][1],xj=p[j][0],yj=p[j][1];if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)c=!c;}return c;};
 const isLand=(lon,lat)=>lat<-70+2.5*Math.sin(lon*rad*3)||LAND.some(o=>lon>=o.a&&lon<=o.b&&lat>=o.c&&lat<=o.d&&inPoly(lon,lat,o.p));
 const dots=[];
 for(let lat=-82;lat<=83;lat+=2.4){const cl=Math.cos(lat*rad),sl=Math.sin(lat*rad),step=2.4/Math.max(cl,.2);for(let lon=-180;lon<180;lon+=step)if(isLand(lon,lat))dots.push(lon*rad,sl,cl);}
 const vec=(lon,lat)=>[Math.cos(lat*rad)*Math.sin(lon*rad),Math.sin(lat*rad),Math.cos(lat*rad)*Math.cos(lon*rad)];
 const ARCS=[[-74,40.7,-0.1,51.5],[-0.1,51.5,77.2,28.6],[2.3,48.8,31.2,30],[-122.4,37.8,-74,40.7],[-46.6,-23.5,-0.1,51.5],[18.4,-33.9,55.3,25.3],[55.3,25.3,103.8,1.3],[103.8,1.3,151.2,-33.9],[139.7,35.7,103.8,1.3]].map(a=>[vec(a[0],a[1]),vec(a[2],a[3])]);
 let s=1234;const r2=()=>(s=s*16807%2147483647)/2147483647;const SPARK=Array.from({length:46},()=>[r2(),r2(),r2()*6.28,.4+r2()*1.1]);
 let W=0,H=0,R=0,cx=0,cy=0,dp=1,lastT=-1,lastDraw=0,dirty=true;
 function resize(){
  const r=cv.getBoundingClientRect();W=r.width;H=r.height;if(!W||!H)return;
  let d=Math.min(devicePixelRatio||1,2);if(W*H*d*d>6e6)d=Math.sqrt(6e6/(W*H));dp=d;
  const cw=Math.max(1,Math.round(W*d)),ch=Math.max(1,Math.round(H*d));if(cv.width!==cw||cv.height!==ch){cv.width=cw;cv.height=ch;}
  cx=W/2;
  if(innerWidth>=1200){const c=$('grc-cards').getBoundingClientRect(),hr=$('holo').getBoundingClientRect(),A=Math.max(120,c.top-hr.top);R=Math.max(60,Math.min(hr.width*.36,A*.6));cy=(hr.top-r.top)+A*.57;}
  else{R=Math.min(W,H)*.42;cy=H*.47;}
  const holo=$('holo'),hr=holo.getBoundingClientRect();holo.style.setProperty('--sx',(r.left+cx-hr.left).toFixed(1)+'px');holo.style.setProperty('--sy',(r.top+cy-hr.top-R*.03).toFixed(1)+'px');holo.style.setProperty('--sh',(R*1.2).toFixed(1)+'px');
  dirty=true;
 }
 function draw(t){
  // Redraw only when time moved (paused/reduced motion = static) and at most ~30 fps.
  const now=performance.now();if(!W||document.hidden||(t===lastT&&!dirty)||(!dirty&&now-lastDraw<32))return;lastT=t;lastDraw=now;dirty=false;
  const dark=$('omni-login').classList.contains('dark');
  const C=dark?{dot:'140,226,255',back:'90,160,255',grid:'96,182,255',rim:'150,226,255',ring:'110,190,255',ring2:'150,124,255',arc:'170,238,255'}:{dot:'236,249,255',back:'210,232,255',grid:'220,240,255',rim:'240,252,255',ring:'210,236,255',ring2:'200,190,255',arc:'255,255,255'};
  g.setTransform(dp,0,0,dp,0,0);g.clearRect(0,0,W,H);
  const rot=.35+t*.075,tilt=.34,ct=Math.cos(tilt),st=Math.sin(tilt),cr=Math.cos(rot),sr=Math.sin(rot);
  const P=(x,y,z)=>{const x1=x*cr+z*sr,z1=z*cr-x*sr;return [cx+x1*R,cy-(y*ct-z1*st)*R,y*st+z1*ct];};
  let gr=g.createRadialGradient(cx,cy,R*.92,cx,cy,R*1.5);gr.addColorStop(0,'rgba(60,160,255,.24)');gr.addColorStop(1,'rgba(30,90,255,0)');g.fillStyle=gr;g.beginPath();g.arc(cx,cy,R*1.5,0,7);g.fill();
  const rings=[[1.5,.3,-.2,C.ring,.5],[1.3,.46,.32,C.ring2,.35]];
  const ringArc=(front)=>{for(const [rx,ry,ro,col,al] of rings){g.strokeStyle=`rgba(${col},${front?al:al*.45})`;g.lineWidth=front?1.3:1;g.beginPath();g.ellipse(cx,cy+R*.04,R*rx,R*ry,ro,front?0:Math.PI,front?Math.PI:Math.PI*2);g.stroke();
   for(let k=0;k<2;k++){const th=t*(.32+k*.11)+k*2.4+ro*3,sn=Math.sin(th);if((sn>0)!==front)continue;const ex=R*rx*Math.cos(th),ey=R*ry*sn,px=cx+ex*Math.cos(ro)-ey*Math.sin(ro),py=cy+R*.04+ex*Math.sin(ro)+ey*Math.cos(ro);
    const fg=g.createRadialGradient(px,py,0,px,py,9);fg.addColorStop(0,`rgba(235,252,255,${front?.95:.4})`);fg.addColorStop(1,`rgba(${col},0)`);g.fillStyle=fg;g.fillRect(px-9,py-9,18,18);}}};
  ringArc(false);
  gr=g.createRadialGradient(cx-R*.35,cy-R*.4,R*.1,cx,cy,R);gr.addColorStop(0,'rgba(80,180,255,.17)');gr.addColorStop(.72,'rgba(16,62,156,.2)');gr.addColorStop(1,'rgba(70,180,255,.36)');g.fillStyle=gr;g.beginPath();g.arc(cx,cy,R,0,7);g.fill();
  // Graticule: back half faint, front half brighter.
  const gb=new Path2D(),gf=new Path2D();
  const line=(fn,n)=>{let prev=null;for(let i=0;i<=n;i++){const q=fn(i/n),pt=P(q[0],q[1],q[2]),front=pt[2]>0;const path=front?gf:gb;if(prev&&prev[2]>0===front)path.lineTo(pt[0],pt[1]);else path.moveTo(pt[0],pt[1]);prev=pt;}};
  for(let lo=0;lo<360;lo+=20)line(u=>{const la=(-90+180*u)*rad,l=lo*rad;return [Math.cos(la)*Math.sin(l),Math.sin(la),Math.cos(la)*Math.cos(l)];},36);
  for(let la=-60;la<=60;la+=20)line(u=>{const l=u*360*rad,a=la*rad;return [Math.cos(a)*Math.sin(l),Math.sin(a),Math.cos(a)*Math.cos(l)];},72);
  g.lineWidth=.8;g.strokeStyle=`rgba(${C.grid},.06)`;g.stroke(gb);g.strokeStyle=`rgba(${C.grid},.2)`;g.stroke(gf);
  // Dotted land masses.
  const buckets=[new Path2D(),new Path2D(),new Path2D(),new Path2D()],back=new Path2D(),ds=Math.max(1.3,R*.0085);
  for(let i=0;i<dots.length;i+=3){const lon=dots[i]+rot,sl=dots[i+1],cl=dots[i+2],x=cl*Math.sin(lon),z0=cl*Math.cos(lon),y=sl*ct-z0*st,z=sl*st+z0*ct,px=cx+x*R,py=cy-y*R;
   if(z>0)buckets[Math.min(3,Math.floor(z*4))].rect(px-ds/2,py-ds/2,ds,ds);else back.rect(px-ds/2,py-ds/2,ds*.8,ds*.8);}
  g.fillStyle=`rgba(${C.back},.1)`;g.fill(back);
  buckets.forEach((b,i)=>{g.fillStyle=`rgba(${C.dot},${.3+i*.2})`;g.fill(b);});
  // Decorative light arcs between points; no data, no claims.
  g.lineCap='round';
  ARCS.forEach((a,i)=>{const [A,B]=a,dot=A[0]*B[0]+A[1]*B[1]+A[2]*B[2],om=Math.acos(clamp(dot,-1,1)),so=Math.sin(om)||1;let prev=null;const pts=[];
   for(let k=0;k<=28;k++){const u=k/28,wa=Math.sin((1-u)*om)/so,wb=Math.sin(u*om)/so,lift=1+.2*Math.sin(Math.PI*u);pts.push(P((A[0]*wa+B[0]*wb)*lift,(A[1]*wa+B[1]*wb)*lift,(A[2]*wa+B[2]*wb)*lift));}
   g.strokeStyle=`rgba(${C.arc},.38)`;g.lineWidth=1;g.beginPath();for(const p of pts){if(p[2]>-.05){prev?g.lineTo(p[0],p[1]):g.moveTo(p[0],p[1]);prev=p;}else prev=null;}g.stroke();
   const u=(t*.22+i*.137)%1,p=pts[Math.round(u*28)];if(p[2]>0){const fg=g.createRadialGradient(p[0],p[1],0,p[0],p[1],6);fg.addColorStop(0,'rgba(240,253,255,.95)');fg.addColorStop(1,`rgba(${C.arc},0)`);g.fillStyle=fg;g.fillRect(p[0]-6,p[1]-6,12,12);}});
  gr=g.createRadialGradient(cx,cy,R*.86,cx,cy,R*1.03);gr.addColorStop(0,`rgba(${C.rim},0)`);gr.addColorStop(.8,`rgba(${C.rim},.28)`);gr.addColorStop(1,`rgba(${C.rim},0)`);g.fillStyle=gr;g.beginPath();g.arc(cx,cy,R*1.03,0,7);g.fill();
  g.strokeStyle=`rgba(${C.rim},.55)`;g.lineWidth=1.2;g.beginPath();g.arc(cx,cy,R,0,7);g.stroke();
  ringArc(true);
  // Quiet HUD ring and corner brackets.
  g.save();g.translate(cx,cy);g.rotate(t*.05);g.setLineDash([2,9]);g.strokeStyle=`rgba(${C.grid},.32)`;g.lineWidth=1;g.beginPath();g.arc(0,0,R*1.17,0,7);g.stroke();g.setLineDash([26,18,4,18]);g.strokeStyle=`rgba(${C.grid},.18)`;g.beginPath();g.arc(0,0,R*1.24,0,7);g.stroke();g.restore();
  const k=R*1.2,bl=R*.1;g.strokeStyle=`rgba(${C.grid},.3)`;g.lineWidth=1;[[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([sx,sy])=>{g.beginPath();g.moveTo(cx+sx*k,cy+sy*k-sy*bl);g.lineTo(cx+sx*k,cy+sy*k);g.lineTo(cx+sx*k-sx*bl,cy+sy*k);g.stroke();});
  for(const [a,b,ph,sz] of SPARK){const an=a*6.283,dd=R*(1.08+b*.5),x=cx+Math.cos(an)*dd*1.15,y=cy+Math.sin(an)*dd*.85,al=.18+.3*(.5+.5*Math.sin(t*1.3+ph));g.fillStyle=`rgba(${C.dot},${al})`;g.fillRect(x,y,sz,sz);}
 }
 return {resize,draw,invalidate:()=>{dirty=true}};
})();
function setHorizon(){
 const root=$('omni-login'),rr=root.getBoundingClientRect(),w=innerWidth,holo=$('holo').getBoundingClientRect();let hz;
 if(w>=1200){const c=$('grc-cards').getBoundingClientRect();hz=c.bottom-rr.top-6*unit();}
 else{const z=$('landing-zone').getBoundingClientRect();hz=z.bottom-rr.top-Math.min(z.height*.42,w<=760?110:150);}
 root.style.setProperty('--horizon',Math.round(hz)+'px');root.style.setProperty('--holo-x',Math.round(holo.left+holo.width/2-rr.left)+'px');
}


 buildCity();buildFloor();
 return { draw:Globe.draw, invalidate:Globe.invalidate, resize(){setHorizon();Globe.resize();}, dispose(){for(const id of ['city','city-reflect']) for(const node of [...$(id).children]) if(node.tagName.toLowerCase()!=='defs')node.remove();} };
}
