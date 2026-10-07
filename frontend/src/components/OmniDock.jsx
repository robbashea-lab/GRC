import {useLayoutEffect,useRef,useState} from 'react';

export const OMNI_POSITIONS=['lower-right','middle-right','lower-left'];
export function snapPosition(x,y,width,height){return x<width/2?'lower-left':y<height*.65?'middle-right':'lower-right';}
const overlaps=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
export default function OmniDock({preferenceKey,inAssessment,children}){
  const root=useRef(null),drag=useRef(null),moved=useRef(false);
  const [position,setPosition]=useState(()=>{try{const value=localStorage.getItem(preferenceKey+':position');return OMNI_POSITIONS.includes(value)?value:'lower-right';}catch{return 'lower-right';}}),[flow,setFlow]=useState(!!inAssessment);
  const move=value=>{setPosition(value);try{localStorage.setItem(preferenceKey+':position',value);}catch{/* Optional cosmetic preference. */}};
  useLayoutEffect(()=>{
    const check=()=>{if(inAssessment){setFlow(true);return;}setFlow(false);requestAnimationFrame(()=>{
      if(!root.current)return;
      const rect=root.current.getBoundingClientRect();
      const critical=[...document.querySelectorAll('input,textarea,select,button,a,[data-sonner-toast],[data-assessment-shell]')].filter(el=>!root.current.contains(el));
      const safe=r=>r.left>=0&&r.right<=window.innerWidth&&r.top>=0&&r.bottom<=window.innerHeight&&!critical.some(el=>{const c=el.getBoundingClientRect();return c.width>0&&c.height>0&&overlaps(r,c);});
      if(safe(rect))return;
      const alternative=OMNI_POSITIONS.find(value=>{const left=value==='lower-left'?(window.innerWidth<=800?16:260):window.innerWidth-(window.innerWidth<=800?16:24)-rect.width;const top=window.innerHeight-(value==='middle-right'?window.innerHeight*.45:96)-rect.height;return safe({left,right:left+rect.width,top,bottom:top+rect.height});});
      if(alternative)setPosition(alternative);else setFlow(true);
    });};
    check();window.addEventListener('resize',check);return()=>window.removeEventListener('resize',check);
  },[position,inAssessment]);
  return <div ref={root} className={`guided-launcher omni-dock-${position} ${flow?'omni-dock-flow':''}`}
    onPointerDown={e=>{if(e.button!==0||!e.target.closest('.omni-launch-button'))return;drag.current={id:e.pointerId,x:e.clientX,y:e.clientY};moved.current=false;}}
    onPointerMove={e=>{const d=drag.current;if(!d||d.id!==e.pointerId)return;if(Math.hypot(e.clientX-d.x,e.clientY-d.y)>8){moved.current=true;e.currentTarget.setPointerCapture(e.pointerId);move(snapPosition(e.clientX,e.clientY,window.innerWidth,window.innerHeight));}}}
    onPointerUp={e=>{if(!drag.current)return;if(moved.current){move(snapPosition(e.clientX,e.clientY,window.innerWidth,window.innerHeight));e.preventDefault();}drag.current=null;e.currentTarget.style.transform='';}}
    onPointerCancel={e=>{drag.current=null;e.currentTarget.style.transform='';}}
    onClickCapture={e=>{if(moved.current){e.preventDefault();e.stopPropagation();moved.current=false;}}}>
    {children}
    <details className="omni-position-controls"><summary aria-label="Reposition Omni">Move</summary><div>{OMNI_POSITIONS.map(value=><button type="button" key={value} aria-pressed={position===value} onClick={()=>move(value)}>Move Omni to {value.replace('-',' ')}</button>)}<button type="button" onClick={()=>move('lower-right')}>Reset Omni position</button></div></details>
  </div>;
}
