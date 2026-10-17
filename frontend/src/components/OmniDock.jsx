import {useLayoutEffect,useRef,useState} from 'react';

export const OMNI_POSITIONS=['lower-right','middle-right','lower-left'];
export function snapPosition(x,y,width,height){return x<width/2?'lower-left':y<height*.65?'middle-right':'lower-right';}
const overlaps=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
export function fitOmniPopover(anchor,size,width=window.innerWidth,height=window.innerHeight){
  const pad=8,gap=8,w=Math.min(size.width,width-pad*2),h=Math.min(size.height,height-pad*2);
  const above=anchor.top-gap-pad,below=height-anchor.bottom-gap-pad;
  return {left:Math.max(pad,Math.min(width-w-pad,anchor.right-w)),top:Math.max(pad,Math.min(height-h-pad,above>=h||above>=below?anchor.top-gap-h:anchor.bottom+gap))};
}
export function fitOmniControl(point,size,obstacles,width=window.innerWidth,height=window.innerHeight,minTop=8){
  const gap=8,maxX=width-size.width-gap,maxY=height-size.height-gap;
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  const preferred={x:clamp(point.x,gap,maxX),y:clamp(point.y,minTop,maxY)};
  const xs=[...new Set([preferred.x,gap,maxX,...obstacles.flatMap(r=>[r.left-size.width-gap,r.right+gap])])];
  const ys=[...new Set([preferred.y,minTop,maxY,...obstacles.flatMap(r=>[r.top-size.height-gap,r.bottom+gap])])];
  let best,distance=Infinity;
  for(const x of xs)for(const y of ys){
    if(x<gap||x>maxX||y<minTop||y>maxY)continue;
    const rect={left:x,right:x+size.width,top:y,bottom:y+size.height};
    if(obstacles.some(r=>overlaps(rect,{left:r.left-gap,right:r.right+gap,top:r.top-gap,bottom:r.bottom+gap})))continue;
    const delta=(x-preferred.x)**2+(y-preferred.y)**2;
    if(delta<distance){best={x,y};distance=delta;}
  }
  return best;
}
function assessmentObstacles(dock){
  const shell=dock.closest('[data-assessment-shell]');if(!shell)return [];
  const controls=[...shell.querySelectorAll('button,input,textarea,select,a,summary,[role="button"],[role="tab"]')].filter(el=>!el.closest('.guided-pilot,.omni-workspace-window,.omni-free-dock')).map(el=>{
    const rect=(el.closest('label')||el).getBoundingClientRect(),clip=el.closest('.brawndo-assessment-scroll')?.getBoundingClientRect();
    return {left:rect.left,right:rect.right,top:Math.max(rect.top,clip?.top??0),bottom:Math.min(rect.bottom,clip?.bottom??window.innerHeight)};
  }).filter(r=>r.right>r.left&&r.bottom>r.top);
  const guide=shell.querySelector('.omni-workspace-window')?.getBoundingClientRect();
  return [...controls,...(guide?.width&&guide?.height?[guide]:[])];
}
function programControls(dock){
  return [...(dock.closest('.app-shell')?.querySelectorAll('button,input,textarea,select,a[href],summary,[role="button"],[role="tab"]')||[])].filter(el=>!el.closest('.guided-pilot,.omni-workspace-window,.omni-free-dock'));
}
function programObstacles(dock){
  return programControls(dock).map(el=>{
    const style=window.getComputedStyle(el);if(style.display==='none'||['hidden','collapse'].includes(style.visibility))return null;
    const rect=(el.closest('label')||el).getBoundingClientRect(),scroll=el.closest('.bsb-nav,.brawndo-assessment-scroll')?.getBoundingClientRect(),clip=scroll?.width>0&&scroll?.height>0?scroll:null;
    return {left:Math.max(0,rect.left,clip?.left??0),right:Math.min(window.innerWidth,rect.right,clip?.right??window.innerWidth),top:Math.max(0,rect.top,clip?.top??0),bottom:Math.min(window.innerHeight,rect.bottom,clip?.bottom??window.innerHeight),returnToPortfolio:el.matches('[data-testid="return-to-portfolio"]')};
  }).filter(r=>r&&r.right>r.left&&r.bottom>r.top);
}
export default function OmniDock(props){return props.freePosition?<FreeDock {...props}/>:<ClassicDock {...props}/>;}
function FreeDock({preferenceKey,inAssessment,children,name='Omni',focused=false,visualReference=false}){
  const root=useRef(null),drag=useRef(null),moved=useRef(false),key=preferenceKey+':free-position';
  const [point,setPoint]=useState(()=>{try{const value=JSON.parse(localStorage.getItem(key));if(value&&Number.isFinite(value.x)&&Number.isFinite(value.y))return value;}catch{/* Cosmetic preference only. */}return visualReference?{x:window.innerWidth-88,y:window.innerHeight-96}:{x:window.innerWidth-190,y:window.innerHeight-260};});
  const pointRef=useRef(point);pointRef.current=point;
  const move=(x,y)=>{const rect=root.current?.getBoundingClientRect(),height=rect?.height||190,top=focused&&window.innerHeight<height+90?8:82;const next={x:Math.max(8,Math.min(window.innerWidth-(rect?.width||168)-8,x)),y:Math.max(top,Math.min(window.innerHeight-height-8,y))};setPoint(next);try{localStorage.setItem(key,JSON.stringify(next));}catch{/* Cosmetic preference only. */}};
  const place=()=>{
    const dock=root.current;if(!dock)return;
    const settings=dock.querySelector('.omni-position-controls'),preferences=focused&&inAssessment?settings:null;
    if(settings&&!preferences){settings.style.position='';settings.style.width='';settings.style.left='';settings.style.top='';}
    // Fit preferences separately: moving the entire owl above the footer can cover an editable field.
    if(preferences){preferences.style.position='fixed';preferences.style.width=dock.getBoundingClientRect().width+'px';}
    const size=dock.getBoundingClientRect(),top=focused&&window.innerHeight<(size.height||190)+90?8:82;
    let position={x:Math.max(8,Math.min(window.innerWidth-(size.width||168)-8,pointRef.current.x)),y:Math.max(top,Math.min(window.innerHeight-(size.height||190)-8,pointRef.current.y))};
    dock.style.left=position.x+'px';dock.style.top=position.y+'px';
    const controls=inAssessment?assessmentObstacles(dock):programObstacles(dock),footer=dock.closest('[data-assessment-shell]')?.querySelector('.brawndo-assessment-footer');
    // Return triggers a programme refit; neighbouring controls constrain the safe replacement.
    if(inAssessment?footer&&[...footer.querySelectorAll('button')].some(el=>overlaps(dock.getBoundingClientRect(),el.getBoundingClientRect())):controls.some(r=>r.returnToPortfolio&&overlaps(dock.getBoundingClientRect(),r))){
      position=fitOmniControl(position,size,controls,window.innerWidth,window.innerHeight,top)||position;
      dock.style.left=position.x+'px';dock.style.top=position.y+'px';
    }
    const anchor=dock.getBoundingClientRect();
    if(preferences){
      const summary=preferences.querySelector('summary'),summarySize=summary.getBoundingClientRect();
      const preferred={x:anchor.left,y:anchor.bottom+8};
      const fitted=fitOmniControl(preferred,summarySize,[...controls,anchor],window.innerWidth,window.innerHeight,top)||fitOmniControl(preferred,summarySize,[],window.innerWidth,window.innerHeight,top);
      if(fitted){preferences.style.left=fitted.x+'px';preferences.style.top=fitted.y+'px';}
    }
    if(!focused)return;
    const placed=[];
    // Keep the open settings usable, then fit the invitation clear of their actual hit area.
    for(const popover of [...dock.querySelectorAll('.omni-position-controls[open] > div'),...dock.querySelectorAll('.guided-context-prompt')]){
      // Keep invitations clear of the settings and position controls below the artwork.
      const anchor=(popover.classList.contains('guided-context-prompt')?dock:popover.parentElement.querySelector('summary'))?.getBoundingClientRect();
      const size=popover.getBoundingClientRect();if(!anchor||!size.width||!size.height)continue;
      const position=fitOmniPopover(anchor,size);popover.style.left=position.left+'px';popover.style.top=position.top+'px';
      if(inAssessment||controls.length){const fitted=fitOmniControl({x:position.left,y:position.top},size,[...controls,dock.getBoundingClientRect(),...(preferences?[preferences.querySelector('summary').getBoundingClientRect()]:[]),...placed],window.innerWidth,window.innerHeight,top);if(fitted){popover.style.left=fitted.x+'px';popover.style.top=fitted.y+'px';}placed.push(popover.getBoundingClientRect());}
    }
  };
  // Automatic fitting is transient; only a user's drag, arrow key or reset writes their preference.
  useLayoutEffect(place);
  useLayoutEffect(()=>{
    const dock=root.current,shell=dock.closest('[data-assessment-shell]'),target=shell||dock.closest('.app-shell')||dock;
    target.addEventListener('toggle',place,true);target.addEventListener('scroll',place,true);window.addEventListener('resize',place);
    const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(place);observer?.observe(dock);
    if(shell){observer?.observe(shell);for(const el of shell.querySelectorAll('.brawndo-assessment-columns,.brawndo-assessment-footer,input,textarea,select,summary'))if(!el.closest('.guided-pilot,.omni-workspace-window,.omni-free-dock'))observer?.observe(el.closest('label')||el);}
    if(!inAssessment)for(const el of programControls(dock))observer?.observe(el.closest('label')||el);
    const guide=inAssessment&&shell?.querySelector('.omni-workspace-window');if(guide)observer?.observe(guide);
    // Position-only window moves do not trigger ResizeObserver.
    const guideChanges=guide&&typeof MutationObserver!=='undefined'?new MutationObserver(place):null;
    guideChanges?.observe(guide,{attributes:true,attributeFilter:['style']});
    return()=>{target.removeEventListener('toggle',place,true);target.removeEventListener('scroll',place,true);window.removeEventListener('resize',place);observer?.disconnect();guideChanges?.disconnect();};
  });
  return <div ref={root} className="guided-launcher omni-free-dock" data-focused-omni={focused||undefined} style={{left:point.x,top:point.y}}
    onPointerDown={e=>{if(e.button!==0||!e.target.closest('.omni-launch-button'))return;drag.current={id:e.pointerId,x:e.clientX,y:e.clientY,point:{x:parseFloat(root.current.style.left),y:parseFloat(root.current.style.top)}};moved.current=false;}}
    onPointerMove={e=>{const d=drag.current;if(!d||d.id!==e.pointerId)return;const dx=e.clientX-d.x,dy=e.clientY-d.y;if(Math.hypot(dx,dy)>8||moved.current){moved.current=true;e.currentTarget.setPointerCapture(e.pointerId);move(d.point.x+dx,d.point.y+dy);}}}
    onPointerUp={e=>{if(!drag.current)return;if(moved.current)e.preventDefault();drag.current=null;}}
    onPointerCancel={()=>{drag.current=null;}}
    onClickCapture={e=>{if(moved.current){e.preventDefault();e.stopPropagation();moved.current=false;}}}
    onKeyDown={e=>{if(!e.target.closest('.omni-launch-button')||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const unit=e.shiftKey?30:10;move(parseFloat(root.current.style.left)+(e.key==='ArrowRight'?unit:e.key==='ArrowLeft'?-unit:0),parseFloat(root.current.style.top)+(e.key==='ArrowDown'?unit:e.key==='ArrowUp'?-unit:0));}}>
    {children}{!focused&&<details className="omni-position-controls"><summary aria-label={"Reposition "+name}>•••</summary><div>
      <button type="button" onClick={()=>move(8,window.innerHeight-260)}>Place on left</button><button type="button" onClick={()=>move(window.innerWidth-190,window.innerHeight-260)}>Place on right</button><button type="button" onClick={()=>move(window.innerWidth-190,window.innerHeight-260)}>Reset {name} position</button>
      <p>Focus {name} and use arrow keys to reposition.</p>
    </div></details>}
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
