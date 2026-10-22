import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {Maximize2,Minimize2,Minus,X,MoreHorizontal} from 'lucide-react';

export function fitOmniRect(rect,width=window.innerWidth,height=window.innerHeight,minWidth=490,minHeight=470){
  const pad=8,top=height>350?82:8,maxW=Math.max(1,width-pad*2),maxH=Math.max(1,height-top-pad);
  const w=Math.min(maxW,Math.max(Math.min(minWidth,maxW),rect.w)),h=Math.min(maxH,Math.max(Math.min(minHeight,maxH),rect.h));
  return {x:Math.max(pad,Math.min(width-w-pad,rect.x)),y:Math.max(top,Math.min(height-h-pad,rect.y)),w,h};
}
const defaultRect=()=>fitOmniRect({x:window.innerWidth-720,y:94,w:700,h:744});
export function besideOmniRect(anchor,width=window.innerWidth,height=window.innerHeight,dimensions={w:700,h:744}){
  if(!anchor)return fitOmniRect({x:width-720,y:94,w:700,h:744},width,height);
  const size=fitOmniRect({x:8,y:82,...dimensions},width,height),gap=12;
  const right=width-anchor.right-gap-8,left=anchor.left-gap-8;
  return fitOmniRect({...size,x:right>=size.w||right>=left?anchor.right+gap:anchor.left-gap-size.w,y:anchor.top},width,height);
}
const EDGES=['n','ne','e','se','s','sw','w','nw'];
export const OMNI_ESCAPE_EVENT='omni-guide-escape';

export function cisOmniProgramRect(anchor,width=window.innerWidth,height=window.innerHeight){
  const w=Math.max(1,Math.min(360,width-32));
  let h=Math.max(1,Math.min(520,height-120));
  // A saved middle-screen launcher needs a shorter scrollable popup to stay reachable.
  const above=anchor?Math.max(0,anchor.top-10-82):0,below=anchor?Math.max(0,height-anchor.bottom-10-8):0;
  if(anchor)h=Math.max(1,Math.min(h,Math.max(above,below)));
  const size=fitOmniRect({x:12,y:82,w,h},width,height,w,h);
  if(!anchor)return size;
  const x=Math.max(12,Math.min(width-w-12,(anchor.left+anchor.right)/2-w/2));
  const y=above>=h?anchor.top-h-10:anchor.bottom+10;
  return fitOmniRect({...size,x,y},width,height,w,h);
}

// Presentation only: interview answers, saves and replacement protection stay in GuidedAssessor.
export default function OmniWindow({id,children,onOpenAutoFocus,onCloseAutoFocus,onMinimize,onClose,anchor,name='Omni',refined=false,program=false,visualReference=false}){
  const visualProgram=visualReference&&program;
  const fit=rect=>fitOmniRect(rect,undefined,undefined,visualProgram?Math.min(360,window.innerWidth-32):490,visualProgram?Math.min(470,cisOmniProgramRect(anchor?.()).h):470);
  const initialRect=()=>visualProgram?cisOmniProgramRect(anchor?.()):anchor?besideOmniRect(anchor(),undefined,undefined,refined?{w:620,h:program?520:755}:undefined):defaultRect();
  const [rect,setRect]=useState(initialRect),[maximized,setMaximized]=useState(false);
  const rectRef=useRef(rect),restore=useRef(null),drag=useRef(null),focusHandlers=useRef({onOpenAutoFocus,onCloseAutoFocus});rectRef.current=rect;
  const surface=useRef(null),closeHandler=useRef(onClose);closeHandler.current=onClose;
  useEffect(()=>{
    const node=surface.current,close=()=>closeHandler.current?.();
    node.addEventListener(OMNI_ESCAPE_EVENT,close);
    return()=>node.removeEventListener(OMNI_ESCAPE_EVENT,close);
  },[]);
  // Measure after the launcher has expanded from its minimized size, before paint.
  useLayoutEffect(()=>{if(anchor)setRect(initialRect());},[]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{const handlers=focusHandlers.current;handlers.onOpenAutoFocus?.({preventDefault(){}});return()=>handlers.onCloseAutoFocus?.({preventDefault(){}});},[]);
  useEffect(()=>{const resize=()=>setRect(r=>fit(maximized?{x:8,y:82,w:window.innerWidth-16,h:window.innerHeight-90}:r));window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize);},[maximized,visualProgram]); // eslint-disable-line react-hooks/exhaustive-deps
  function expand(){if(maximized){setRect(fit(restore.current||initialRect()));}else{restore.current=rectRef.current;setRect(fit({x:8,y:82,w:window.innerWidth-16,h:window.innerHeight-90}));}setMaximized(!maximized);}
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
    setRect(fit(r));
  }
  function nudge(event,resize=false){
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)||maximized)return;
    event.preventDefault();const step=event.shiftKey?30:10,dx=event.key==='ArrowRight'?step:event.key==='ArrowLeft'?-step:0,dy=event.key==='ArrowDown'?step:event.key==='ArrowUp'?-step:0;
    setRect(r=>fit(resize?{...r,w:r.w+dx,h:r.h+dy}:{...r,x:r.x+dx,y:r.y+dy}));
  }
  return <section ref={surface} id={id} role="dialog" aria-modal="false" aria-labelledby={id+'-title'} aria-describedby={id+'-description'} className={'guided-panel omni-workspace-window'+(refined?' omni-refined-window':'')+(visualProgram?' cis-omni-program-window':'')} style={{left:rect.x,top:rect.y,width:rect.w,height:rect.h}}
    onPointerDown={e=>start(e)} onDoubleClick={e=>{if(e.target.closest('.omni-panel-header')&&!e.target.closest('button,details,input,select,textarea,a'))expand();}} onPointerMove={move} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose();}else if(refined&&e.target.closest('.omni-panel-header')&&!e.target.closest('button'))nudge(e,e.altKey);}}>
    <div className="omni-window-controls">{!refined&&<details><summary aria-label={name+" window position and size"}><MoreHorizontal size={18}/></summary><div className="omni-window-menu">
      <button type="button" onKeyDown={e=>nudge(e)}>Position: use arrow keys</button><button type="button" onKeyDown={e=>nudge(e,true)}>Size: use arrow keys</button>
      <button type="button" onClick={()=>{setMaximized(false);setRect(defaultRect());}}>Reset window</button>
      <button type="button" onClick={()=>{setMaximized(false);setRect(fitOmniRect({...rectRef.current,x:8}));}}>Place on left</button><button type="button" onClick={()=>{setMaximized(false);setRect(fitOmniRect({...rectRef.current,x:window.innerWidth-rectRef.current.w-8}));}}>Place on right</button>
    </div></details>}<button type="button" aria-label={"Minimize "+name+" Guide"} onClick={onMinimize}><Minus size={18}/></button><button type="button" aria-label={maximized?'Restore '+name+' Guide size':'Expand '+name+' Guide'} onClick={expand}>{maximized?<Minimize2 size={18}/>:<Maximize2 size={18}/>}</button><button type="button" aria-label={"Close "+name+" Guide"} onClick={onClose}><X size={18}/></button></div>
    {children}
    {!maximized&&EDGES.map(edge=><div key={edge} className={'omni-resize omni-resize-'+edge} onPointerDown={e=>{e.stopPropagation();start(e,edge);}} onPointerMove={move} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}/>)}
  </section>;
}
