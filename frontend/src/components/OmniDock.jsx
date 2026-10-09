import {useLayoutEffect,useRef,useState} from 'react';

export const OMNI_POSITIONS=['lower-right','middle-right','lower-left'];
export function snapPosition(x,y,width,height){return x<width/2?'lower-left':y<height*.65?'middle-right':'lower-right';}
const overlaps=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
export default function OmniDock(props){return props.freePosition?<FreeDock {...props}/>:<ClassicDock {...props}/>;}
function FreeDock({preferenceKey,children,name='Omni'}){
  const root=useRef(null),drag=useRef(null),moved=useRef(false),key=preferenceKey+':free-position';
  const [point,setPoint]=useState(()=>{try{const value=JSON.parse(localStorage.getItem(key));if(value&&Number.isFinite(value.x)&&Number.isFinite(value.y))return value;}catch{/* Cosmetic preference only. */}return {x:window.innerWidth-190,y:window.innerHeight-260};});
  const pointRef=useRef(point);pointRef.current=point;
  const move=(x,y)=>{const rect=root.current?.getBoundingClientRect();const next={x:Math.max(8,Math.min(window.innerWidth-(rect?.width||168)-8,x)),y:Math.max(82,Math.min(window.innerHeight-(rect?.height||190)-8,y))};setPoint(next);try{localStorage.setItem(key,JSON.stringify(next));}catch{/* Cosmetic preference only. */}};
  useLayoutEffect(()=>{const clamp=()=>move(pointRef.current.x,pointRef.current.y);clamp();window.addEventListener('resize',clamp);return()=>window.removeEventListener('resize',clamp);},[]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div ref={root} className="guided-launcher omni-free-dock" style={{left:point.x,top:point.y}}
    onPointerDown={e=>{if(e.button!==0||!e.target.closest('.omni-launch-button'))return;drag.current={id:e.pointerId,x:e.clientX,y:e.clientY,point:pointRef.current};moved.current=false;}}
    onPointerMove={e=>{const d=drag.current;if(!d||d.id!==e.pointerId)return;const dx=e.clientX-d.x,dy=e.clientY-d.y;if(Math.hypot(dx,dy)>8||moved.current){moved.current=true;e.currentTarget.setPointerCapture(e.pointerId);move(d.point.x+dx,d.point.y+dy);}}}
    onPointerUp={e=>{if(!drag.current)return;if(moved.current)e.preventDefault();drag.current=null;}}
    onPointerCancel={()=>{drag.current=null;}}
    onClickCapture={e=>{if(moved.current){e.preventDefault();e.stopPropagation();moved.current=false;}}}
    onKeyDown={e=>{if(!e.target.closest('.omni-launch-button')||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const unit=e.shiftKey?30:10;move(point.x+(e.key==='ArrowRight'?unit:e.key==='ArrowLeft'?-unit:0),point.y+(e.key==='ArrowDown'?unit:e.key==='ArrowUp'?-unit:0));}}>
    {children}<details className="omni-position-controls"><summary aria-label={"Reposition "+name}>•••</summary><div>
      <button type="button" onClick={()=>move(8,window.innerHeight-260)}>Place on left</button><button type="button" onClick={()=>move(window.innerWidth-190,window.innerHeight-260)}>Place on right</button><button type="button" onClick={()=>move(window.innerWidth-190,window.innerHeight-260)}>Reset {name} position</button>
      <p>Focus {name} and use arrow keys to reposition.</p>
    </div></details>
  </div>;
}
function ClassicDock({preferenceKey,inAssessment,children}){
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
