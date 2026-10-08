import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {Maximize2,Minimize2,Minus,X,MoreHorizontal} from 'lucide-react';

export function fitOmniRect(rect,width=window.innerWidth,height=window.innerHeight){
  const pad=8,top=height>350?82:8,maxW=Math.max(1,width-pad*2),maxH=Math.max(1,height-top-pad);
  const w=Math.min(maxW,Math.max(Math.min(490,maxW),rect.w)),h=Math.min(maxH,Math.max(Math.min(470,maxH),rect.h));
  return {x:Math.max(pad,Math.min(width-w-pad,rect.x)),y:Math.max(top,Math.min(height-h-pad,rect.y)),w,h};
}
const defaultRect=()=>fitOmniRect({x:window.innerWidth-720,y:94,w:700,h:744});
export function besideOmniRect(anchor,width=window.innerWidth,height=window.innerHeight){
  if(!anchor)return fitOmniRect({x:width-720,y:94,w:700,h:744},width,height);
  const size=fitOmniRect({x:8,y:82,w:700,h:744},width,height),gap=12;
  const right=width-anchor.right-gap-8,left=anchor.left-gap-8;
  return fitOmniRect({...size,x:right>=size.w||right>=left?anchor.right+gap:anchor.left-gap-size.w,y:anchor.top},width,height);
}
const EDGES=['n','ne','e','se','s','sw','w','nw'];

// Presentation only: interview answers, saves and replacement protection stay in GuidedAssessor.
export default function OmniWindow({id,children,onOpenAutoFocus,onCloseAutoFocus,onMinimize,onClose,anchor}){
  const [rect,setRect]=useState(()=>anchor?besideOmniRect(anchor()):defaultRect()),[maximized,setMaximized]=useState(false);
  const rectRef=useRef(rect),restore=useRef(null),drag=useRef(null),focusHandlers=useRef({onOpenAutoFocus,onCloseAutoFocus});rectRef.current=rect;
  // Measure after the launcher has expanded from its minimized size, before paint.
  useLayoutEffect(()=>{if(anchor)setRect(besideOmniRect(anchor()));},[]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{const handlers=focusHandlers.current;handlers.onOpenAutoFocus?.({preventDefault(){}});return()=>handlers.onCloseAutoFocus?.({preventDefault(){}});},[]);
  useEffect(()=>{const resize=()=>setRect(r=>fitOmniRect(maximized?{x:8,y:82,w:window.innerWidth-16,h:window.innerHeight-90}:r));window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize);},[maximized]);
  function expand(){if(maximized){setRect(fitOmniRect(restore.current||defaultRect()));}else{restore.current=rectRef.current;setRect(fitOmniRect({x:8,y:82,w:window.innerWidth-16,h:window.innerHeight-90}));}setMaximized(!maximized);}
  function start(event,edge){
    if(event.button!==0||maximized||(!edge&&!event.target.closest('.omni-panel-header'))||(!edge&&event.target.closest('button,details,input,select,textarea,a')))return;
    drag.current={id:event.pointerId,x:event.clientX,y:event.clientY,rect:rectRef.current,edge};event.currentTarget.setPointerCapture(event.pointerId);event.preventDefault();
  }
  function move(event){
    const d=drag.current;if(!d||d.id!==event.pointerId)return;
    const dx=event.clientX-d.x,dy=event.clientY-d.y,r={...d.rect};
    if(!d.edge){r.x+=dx;r.y+=dy;}else{
      if(d.edge.includes('e'))r.w+=dx;if(d.edge.includes('s'))r.h+=dy;
      if(d.edge.includes('w')){r.w-=dx;r.x+=dx;}if(d.edge.includes('n')){r.h-=dy;r.y+=dy;}
    }
    setRect(fitOmniRect(r));
  }
  function nudge(event,resize=false){
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)||maximized)return;
    event.preventDefault();const step=event.shiftKey?30:10,dx=event.key==='ArrowRight'?step:event.key==='ArrowLeft'?-step:0,dy=event.key==='ArrowDown'?step:event.key==='ArrowUp'?-step:0;
    setRect(r=>fitOmniRect(resize?{...r,w:r.w+dx,h:r.h+dy}:{...r,x:r.x+dx,y:r.y+dy}));
  }
  return <section id={id} role="dialog" aria-modal="false" aria-labelledby={id+'-title'} aria-describedby={id+'-description'} className="guided-panel omni-workspace-window" style={{left:rect.x,top:rect.y,width:rect.w,height:rect.h}}
    onPointerDown={e=>start(e)} onDoubleClick={e=>{if(e.target.closest('.omni-panel-header')&&!e.target.closest('button,details,input,select,textarea,a'))expand();}} onPointerMove={move} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose();}}}>
    <div className="omni-window-controls"><details><summary aria-label="Omni window position and size"><MoreHorizontal size={18}/></summary><div className="omni-window-menu">
      <button type="button" onKeyDown={e=>nudge(e)}>Position: use arrow keys</button><button type="button" onKeyDown={e=>nudge(e,true)}>Size: use arrow keys</button>
      <button type="button" onClick={()=>{setMaximized(false);setRect(defaultRect());}}>Reset window</button>
      <button type="button" onClick={()=>{setMaximized(false);setRect(fitOmniRect({...rectRef.current,x:8}));}}>Place on left</button><button type="button" onClick={()=>{setMaximized(false);setRect(fitOmniRect({...rectRef.current,x:window.innerWidth-rectRef.current.w-8}));}}>Place on right</button>
    </div></details><button type="button" aria-label="Minimize Omni Guide" onClick={onMinimize}><Minus size={18}/></button><button type="button" aria-label={maximized?'Restore Omni Guide size':'Expand Omni Guide'} onClick={expand}>{maximized?<Minimize2 size={18}/>:<Maximize2 size={18}/>}</button><button type="button" aria-label="Close Omni Guide" onClick={onClose}><X size={18}/></button></div>
    {children}
    {!maximized&&EDGES.map(edge=><div key={edge} className={'omni-resize omni-resize-'+edge} onPointerDown={e=>{e.stopPropagation();start(e,edge);}} onPointerMove={move} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}/>)}
  </section>;
}
