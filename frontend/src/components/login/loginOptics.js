// Approved decorative optics, independent of authentication and application data.
export function createLoginOptics(root) {
 const $=id=>root.querySelector('#login-'+id),clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),lerp=(a,b,t)=>a+(b-a)*t;
 const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
 const canvas=$('fx'),frontCanvas=$('fx-front'),ctxBack=canvas.getContext('2d'),ctxFront=frontCanvas.getContext('2d');
 let ctx=ctxBack;const state={time:0,mode:'robot'};
 function ring(x,y,r,alpha,ratio=.19){ctx.save();ctx.strokeStyle=`rgba(103,209,255,${Math.max(0,alpha)})`;ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(x,y,r,r*ratio,0,0,Math.PI*2);ctx.stroke();ctx.restore();}
function brackets(r,a,color='103,212,255',k=12){
 ctx.save();ctx.strokeStyle=`rgba(${color},${a})`;ctx.lineWidth=1.1;
 [[r.left-5,r.top-5,1,1],[r.right+5,r.top-5,-1,1],[r.left-5,r.bottom+5,1,-1],[r.right+5,r.bottom+5,-1,-1]].forEach(([x,y,dx,dy])=>{ctx.beginPath();ctx.moveTo(x+dx*k,y);ctx.lineTo(x,y);ctx.lineTo(x,y+dy*k);ctx.stroke();});ctx.restore();
}
function reticle(x,y,r,a,t){
 ctx.save();ctx.translate(x,y);ctx.lineCap='butt';
 for(let n=0;n<3;n++){
  ctx.save();ctx.rotate(t*(n%2?-.6:.45)+n*.6);ctx.strokeStyle=`rgba(${n===1?'169,152,255':'138,236,255'},${a*(n===1?.55:.75)})`;ctx.lineWidth=n===1?1.4:.8;ctx.setLineDash(n===2?[1,6]:[17,12,5,14]);
  ctx.beginPath();ctx.arc(0,0,r+n*7,0,Math.PI*2);ctx.stroke();ctx.restore();
 }
 ctx.strokeStyle=`rgba(165,238,255,${a*.64})`;ctx.lineWidth=.8;
 for(let n=0;n<4;n++){ctx.save();ctx.rotate(n*Math.PI/2);ctx.beginPath();ctx.moveTo(r+18,0);ctx.lineTo(r+25,0);ctx.stroke();ctx.restore();}
 ctx.beginPath();ctx.moveTo(-4,0);ctx.lineTo(4,0);ctx.moveTo(0,-4);ctx.lineTo(0,4);ctx.stroke();ctx.restore();
}
function flare(x,y,r,a){
 const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,`rgba(231,255,255,${a})`);g.addColorStop(.13,`rgba(161,243,255,${a*.8})`);g.addColorStop(.38,`rgba(33,191,255,${a*.23})`);g.addColorStop(1,'rgba(0,132,255,0)');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);
}
function laserBeam(eye, end, power, time, index){
 const dx=end.x-eye.x,dy=end.y-eye.y,length=Math.max(1,Math.hypot(dx,dy));
 const nx=-dy/length,ny=dx/length;
 ctx.save();ctx.lineCap='round';ctx.globalCompositeOperation='screen';
 // Dense white core inside a saturated cyan/blue energy envelope.
 for(const [width,alpha,color] of [[27,.085,'26,112,255'],[15,.15,'31,163,255'],[7,.36,'49,208,255'],[3.2,.8,'143,244,255'],[1.35,.98,'242,255,255']]){
  const g=ctx.createLinearGradient(eye.x,eye.y,end.x,end.y);
  g.addColorStop(0,`rgba(${color},${power*alpha})`);
  g.addColorStop(.72,`rgba(${color},${power*alpha*.94})`);
  g.addColorStop(1,`rgba(${color},${power*alpha*.67})`);
  ctx.strokeStyle=g;ctx.lineWidth=width;
  ctx.beginPath();ctx.moveTo(eye.x,eye.y);ctx.lineTo(end.x,end.y);ctx.stroke();
 }
 // Two quiet filament lines make the discharge feel contained, not noisy.
 for(const sign of [-1,1]){
  ctx.beginPath();ctx.moveTo(eye.x,eye.y);
  for(let step=1;step<=28;step++){
   const u=step/28,offset=sign*(2.8+Math.sin(u*9-time*3+index)*1.25)*Math.sin(u*Math.PI);
   ctx.lineTo(eye.x+dx*u+nx*offset,eye.y+dy*u+ny*offset);
  }
  ctx.strokeStyle=`rgba(89,185,255,${power*.31})`;ctx.lineWidth=.75;ctx.stroke();
 }
 for(let k=0;k<3;k++){
  const u=(time*.38+k/3+index*.06)%1;
  const px=eye.x+dx*u,py=eye.y+dy*u;
  ctx.strokeStyle=`rgba(222,254,255,${power*.75*Math.sin(u*Math.PI)})`;ctx.lineWidth=2.1;
  ctx.beginPath();ctx.moveTo(px-dx*.014,py-dy*.014);ctx.lineTo(px+dx*.014,py+dy*.014);ctx.stroke();
 }
 flare(eye.x,eye.y,25,power*.72);
 flare(end.x,end.y,36,power*.56);
 ctx.restore();
}
function drawScanner(v,p){
 const t=state.time,W=innerWidth,H=innerHeight,U=v.U;
 const a=smooth(p/.04)*(1-smooth((p-.94)/.06));if(a<=.002)return;
 // Integration: sweep bounds follow the new composition (header to floor; on phones, the hero stage).
 const origins=v.eyes,center={x:(origins[0].x+origins[1].x)/2,y:(origins[0].y+origins[1].y)/2};
 const top=Math.max(v.top,0)+6,bottom=v.mobile?Math.min(H-32,v.hero.bottom-12):H-32,left=clamp(center.x+70*U,18,W*.7),right=W-18;
 const onFront=fn=>{const prev=ctx;ctx=ctxFront;ctx.save();ctx.beginPath();ctx.rect(0,top-6,W,Math.max(0,bottom-top+30));ctx.clip();ctx.globalCompositeOperation='screen';fn();ctx.restore();ctx=prev;};
 const charge=smooth(p/.14),fire=smooth((p-.105)/.055)*(1-smooth((p-.89)/.1));
 const q=smooth((p-.15)/.73),sx=lerp(left,right,q),ty=lerp(clamp(center.y,top+40,bottom-62),lerp(top+40,bottom-62,.40+.25*Math.sin(q*Math.PI*2-.72)),smooth(q/.3));
 ctx.save();ctx.beginPath();ctx.rect(0,top-6,W,Math.max(0,bottom-top+30));ctx.clip();ctx.globalCompositeOperation='screen';
 // Single visible charge-up. No strobe and no fabricated threat/security verdicts.
 if(p<.22){
  const hold=(1-smooth((p-.15)/.07))*a;
  onFront(()=>{
  for(const eye of origins){
   flare(eye.x,eye.y,14+charge*25,hold*(.18+.63*charge));
   ctx.save();ctx.translate(eye.x,eye.y);ctx.rotate(t*1.8);
   ctx.strokeStyle=`rgba(103,231,255,${hold*.65})`;ctx.lineWidth=1;
   ctx.beginPath();ctx.arc(0,0,20-12*charge,-.4,2.5);ctx.stroke();ctx.beginPath();ctx.arc(0,0,20-12*charge,2.8,5.8);ctx.stroke();ctx.restore();
  }
  if(state.mode==='robot'){
   const c=v.core;flare(c.x,c.y,30*U,hold*charge*.35);
  }
  });
 }
 if(fire>.001){
  const width=Math.min(230*U,W*.24),g=ctx.createLinearGradient(sx-width,0,sx+22,0);
  g.addColorStop(0,'rgba(4,55,138,0)');g.addColorStop(.66,`rgba(13,102,227,${fire*.035})`);g.addColorStop(.96,`rgba(81,210,255,${fire*.13})`);g.addColorStop(1,'rgba(118,235,255,0)');
  ctx.fillStyle=g;ctx.fillRect(sx-width,top,width+22,bottom-top);
  // Sparse precision mesh, immediately behind the optical curtain.
  ctx.lineWidth=.6;
  for(let y=top+14;y<bottom;y+=32){
   for(let x=Math.floor((sx-width)/36)*36;x<sx+8;x+=36){
    if(x<6||x>W-6)continue;
    const opacity=clamp((x-sx+width)/width,0,1)*fire*.21;
    ctx.strokeStyle=`rgba(114,204,255,${opacity})`;ctx.beginPath();ctx.moveTo(x-3,y);ctx.lineTo(x+3,y);ctx.moveTo(x,y-3);ctx.lineTo(x,y+3);ctx.stroke();
   }
  }
  const curtain=ctx.createLinearGradient(0,top,0,bottom);
  curtain.addColorStop(0,'rgba(44,176,255,0)');curtain.addColorStop(.14,`rgba(69,205,255,${fire*.25})`);curtain.addColorStop(.52,`rgba(165,246,255,${fire*.86})`);curtain.addColorStop(.86,`rgba(69,205,255,${fire*.25})`);curtain.addColorStop(1,'rgba(44,176,255,0)');
  ctx.strokeStyle=curtain;ctx.lineWidth=1.2;ctx.shadowColor='#39caff';ctx.shadowBlur=14;
  ctx.beginPath();ctx.moveTo(sx,top);ctx.lineTo(sx,bottom);ctx.stroke();ctx.shadowBlur=0;
  // Beams originate at the Defender's visor optics, are drawn in front of the artwork, and follow it as it moves.
  onFront(()=>{
  origins.forEach((eye,i)=>{
   const end={x:sx,y:ty+(i?5:-5)};
   ctx.fillStyle=`rgba(16,137,249,${fire*.024})`;ctx.beginPath();ctx.moveTo(eye.x,eye.y);ctx.lineTo(end.x,end.y-62);ctx.lineTo(end.x,end.y+62);ctx.closePath();ctx.fill();
   laserBeam(eye,end,fire*(.90+.1*Math.sin(q*Math.PI)),t,i);
  });
  // Subtle lens streaks, not a full-screen flash.
  const lg=ctx.createLinearGradient(center.x-60,0,center.x+70,0);
  lg.addColorStop(0,'rgba(65,181,255,0)');lg.addColorStop(.46,`rgba(78,205,255,${fire*.58})`);lg.addColorStop(.5,`rgba(224,255,255,${fire*.8})`);lg.addColorStop(1,'rgba(65,181,255,0)');
  ctx.fillStyle=lg;ctx.fillRect(center.x-60,center.y-1,130,1.5);
  flare(center.x,center.y,22*U,fire*.35);
  });
  reticle(sx,ty,Math.min(29*U,W*.052),fire*.87,t*.7);
  ctx.strokeStyle=`rgba(118,211,255,${fire*.28})`;ctx.lineWidth=.7;
  ctx.setLineDash([3,8]);ctx.beginPath();ctx.arc(sx,ty,51*U,-.6,.95);ctx.stroke();ctx.setLineDash([]);
  // Known presentation rectangles only. Never read input values, page data or account state.
  ['.holo-shield','.governance','.risk','.compliance','.login'].forEach((sel,i)=>{
   const r=root.querySelector(sel).getBoundingClientRect();
   if(r.bottom<top||r.top>bottom)return;
   const reach=clamp(1-Math.abs(sx-(r.left+r.right)/2)/(r.width*.6+70),0,1);
   brackets(r,fire*(.06+reach*.74),'111,218,255',15*U);
   if(reach>.2){
    ctx.font=`${Math.round(8*Math.max(1,U))}px ui-monospace,monospace`;ctx.fillStyle=`rgba(166,231,255,${fire*reach*.87})`;
    ctx.fillText(['00 / OVERVIEW','01 / GOVERNANCE','02 / RISK','03 / COMPLIANCE','04 / WORKSPACE'][i],r.left+10,Math.max(top+10,r.top-12));
   }
  });
  ctx.font=`${Math.round(8*Math.max(1,U))}px ui-monospace,monospace`;ctx.fillStyle=`rgba(144,221,248,${fire*.64})`;
  const tx=sx<W-176?sx+42:sx-165;ctx.fillText('OPTIC ARRAY // VISUAL PASS',clamp(tx,10,W-180),clamp(ty-49,top+20,bottom-20));
  for(let y=top+18;y<bottom;y+=24){ctx.strokeStyle=`rgba(118,192,232,${fire*.24})`;ctx.beginPath();ctx.moveTo(W-12,y);ctx.lineTo(W-(y%48===0?22:17),y);ctx.stroke();}
 }
 ring(v.baseX,v.baseY,78*U,a*.34);ring(v.baseX,v.baseY,101*U,a*.16);
 ctx.restore();$('scan-number').textContent=String(Math.round(p*100)).padStart(2,'0')+'%';
}
// Integration: effects that pass over the sign-in panel are reduced so the form stays readable.
function calmLogin(v,ctx){
 const r=v.login;if(r.bottom<0||r.top>innerHeight)return;
 ctx.save();ctx.globalCompositeOperation='destination-out';ctx.fillStyle='rgba(0,0,0,.7)';ctx.beginPath();
 if(ctx.roundRect)ctx.roundRect(r.left,r.top,r.width,r.height,18*v.U);else ctx.rect(r.left,r.top,r.width,r.height);
 ctx.fill();ctx.restore();
}

 return {
  resize(){const dp=Math.min(devicePixelRatio||1,2,Math.sqrt(11e6/(innerWidth*innerHeight)));for(const c of [canvas,frontCanvas]){c.width=Math.max(1,Math.round(innerWidth*dp));c.height=Math.max(1,Math.round(innerHeight*dp));}ctxBack.setTransform(dp,0,0,dp,0,0);ctxFront.setTransform(dp,0,0,dp,0,0);},
  draw(view,progress,time){ctxBack.clearRect(0,0,innerWidth,innerHeight);ctxFront.clearRect(0,0,innerWidth,innerHeight);if(progress===null||document.hidden||!view.show)return;state.time=time;drawScanner(view,progress);calmLogin(view,ctxBack);calmLogin(view,ctxFront);},
  clear(){ctxBack.clearRect(0,0,innerWidth,innerHeight);ctxFront.clearRect(0,0,innerWidth,innerHeight);}
 };
}
