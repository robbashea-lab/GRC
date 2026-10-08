import {useId,useRef} from 'react';
import approvedShell from '@/assets/omni-approved-shell.png';
// Original layered observation-lens artwork; pointer attention stays inside Omni.
export default function OmniCharacter({state='idle',approved=false,trackPointer=true}) {
  const uid=useId().replace(/:/g,''),eyes=useRef(null);
  const thoughtful=['thinking','verification'].includes(state);
  const track=e=>{if(e.pointerType==='touch'||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;const r=e.currentTarget.getBoundingClientRect();eyes.current.style.transform=`translate(${Math.max(-2,Math.min(2,(e.clientX-r.left-r.width/2)/12))}px,${Math.max(-2,Math.min(2,(e.clientY-r.top-r.height/2)/12))}px)`;};
  if(approved)return <svg className={'omni-character omni-approved omni-'+state} viewBox="0 0 284 260" aria-hidden="true" focusable="false" onPointerMove={trackPointer?track:undefined} onPointerLeave={trackPointer?()=>{if(eyes.current)eyes.current.style.transform='translate(0,0)';}:undefined}>
    <defs><clipPath id={uid+'clip'}><path d="M126 3 C177 -4 220 9 244 38 C261 57 268 76 275 104 C286 139 270 181 249 203 C217 235 163 252 123 243 C83 239 42 216 23 184 C4 155 0 118 10 93 C24 56 68 15 126 3Z"/></clipPath><filter id={uid+'glow'} x="-100%" y="-180%" width="300%" height="460%"><feGaussianBlur stdDeviation="5"/></filter></defs>
    <image href={approvedShell} width="284" height="252" clipPath={'url(#'+uid+'clip)'}/>
    <g ref={eyes} className="omni-eye-attention"><g className="omni-approved-eyes" fill="none" strokeLinecap="round">
      {thoughtful||state==='gap'?<><ellipse cx="131" cy="127" rx="10" ry={thoughtful?'7':'14'} stroke={state==='gap'?'#ffd079':'#82efff'} strokeWidth="6"/><ellipse cx="213" cy="114" rx="9" ry="13" stroke={state==='gap'?'#ffd079':'#82efff'} strokeWidth="6"/></>:<><path d="M106 139 Q126 106 152 130 M192 125 Q207 94 230 115" stroke="#007bff" strokeWidth="18" filter={'url(#'+uid+'glow)'}/><path d="M106 139 Q126 106 152 130 M192 125 Q207 94 230 115" stroke="#39d8ff" strokeWidth="8"/><path d="M107 137 Q126 109 151 129 M193 124 Q207 97 229 114" stroke="#b0f5ff" strokeWidth="2.3"/></>}
    </g></g>
    {state==='verification'&&<text x="238" y="45" fill="#76baff" fontSize="30" fontWeight="700">?</text>}
  </svg>;
  return <svg className={'omni-character omni-'+state} viewBox="0 0 80 80" aria-hidden="true" focusable="false" onPointerMove={trackPointer?track:undefined} onPointerLeave={trackPointer?()=>{if(eyes.current)eyes.current.style.transform='translate(0,0)';}:undefined}>
    <defs>
      <radialGradient id={uid+'shell'} cx="30%" cy="20%" r="85%"><stop stopColor="#fff"/><stop offset=".45" stopColor="#e9f3fa"/><stop offset=".72" stopColor="#a8bfd0"/><stop offset="1" stopColor="#4f6b85"/></radialGradient>
      <radialGradient id={uid+'lens'} cx="65%" cy="20%" r="80%"><stop stopColor="#5787ab"/><stop offset=".3" stopColor="#183b5e"/><stop offset=".7" stopColor="#071f39"/><stop offset="1" stopColor="#020c1b"/></radialGradient>
      <linearGradient id={uid+'edge'} x2=".7" y2="1"><stop stopColor="#fff"/><stop offset=".45" stopColor="#d6eaf6"/><stop offset="1" stopColor="#6b98b7"/></linearGradient>
    </defs>
    <circle cx="40" cy="40" r="31" fill={'url(#'+uid+'shell)'} stroke={'url(#'+uid+'edge)'} strokeWidth="2.5"/>
    <circle cx="40" cy="40" r="35" fill="none" stroke="#c8d8e3" strokeWidth="5" strokeDasharray="48 7" transform="rotate(-85 40 40)" className="omni-ring-base"/>
    <g fill="none" strokeWidth="5" strokeLinecap="butt" className="omni-segments">
      <path d="M16 15A35 35 0 0 1 35 5" stroke="#3589ef"/>
      <path d="M43 5A35 35 0 0 1 71 24" stroke="#23b9aa"/>
      <path className="omni-amber" d="M75 33A35 35 0 0 1 67 62" stroke="#d6a136"/>
      <path d="M60 69A35 35 0 0 1 45 75" stroke="#9774d8"/>
    </g>
    <circle cx="40" cy="40" r="26" fill={'url(#'+uid+'lens)'} stroke={'url(#'+uid+'edge)'} strokeWidth="3"/>
    <ellipse cx="51" cy="24" rx="8" ry="3" fill="#e7f8ff" opacity=".5" transform="rotate(35 51 24)"/>
    <path d="M20 37A21 21 0 0 1 48 20" fill="none" stroke="#426378" strokeWidth="4" strokeLinecap="round"/>
    <g ref={eyes} className="omni-eye-attention"><g fill={state==='gap'?'#ffd079':'#96ebff'} className="omni-eyes">
      <ellipse cx="32" cy={thoughtful?'38':'39'} rx="3.3" ry={thoughtful?'3':'5'}/>
      <ellipse cx="48" cy="39" rx="3.3" ry="5"/>
    </g></g>
    <path d={state==='gap'?'M32 51Q40 47 48 51':thoughtful?'M35 50Q40 52 45 49':'M31 49Q40 59 49 49'} fill="none" stroke="#7bdbef" strokeWidth="2.5" strokeLinecap="round"/>
    {state==='verification'&&<text x="61" y="24" fill="#142b40" fontSize="18" fontWeight="700">?</text>}
    {['complete','applied'].includes(state)&&<path d="M58 59l4 4 8-10" fill="none" stroke="#117d67" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>}
  </svg>;
}
