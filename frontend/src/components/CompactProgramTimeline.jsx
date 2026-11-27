import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import * as Popover from '@radix-ui/react-popover';
import {calendarDay,displayDay} from '@/lib/managementDates';
import {compactTimelineGroups} from '@/lib/compactProgramTimeline';
import './BrawndoAdditionalPolicyVendor.css';
import './CompactProgramTimeline.css';

// January's explicit year takes priority; other labels disappear only if their measured bounds collide.
export function timelineAxisVisibleLabels(labels,gap=4){
  const selected=[];
  [...labels].sort((a,b)=>Number(!!b.year)-Number(!!a.year)||a.left-b.left).forEach(label=>{
    if(!selected.some(other=>label.left<other.right+gap&&label.right+gap>other.left))selected.push(label);
  });
  return selected.map(label=>label.id).sort();
}

const shortDate=value=>new Date(calendarDay(value)*86400000).toLocaleDateString(undefined,{timeZone:'UTC',month:'short',day:'numeric'});
export default function CompactProgramTimeline({events=[],rows=3,upcomingLimit=3,legend=[],onOpen,theme='light',available=true,description='Saved dates from the native register.',recordOpen=false,scopeKey=''}) {
  const [table,setTable]=useState(false),[activeGroup,setActiveGroup]=useState(null);
  useEffect(()=>{setActiveGroup(null);},[events,recordOpen,scopeKey]);
  const model=compactTimelineGroups(available?events:[],rows),axis=useRef(null);
  const [axisVisible,setAxisVisible]=useState(null);
  const hasScopeKey=typeof scopeKey==='string'&&scopeKey.trim().length>0;
  const launchedPreviewReturns=useRef(new Map());
  const mounted=useRef(true),headingTarget=useRef(null);
  const groupTriggers=useRef(new Map()),viewData=useRef(null),pendingReturn=useRef(null),launchFrame=useRef(null);
  const previousRecordOpen=useRef(recordOpen),liveProjection=useRef(null);
  liveProjection.current={scopeKey,recordOpen,available,groups:model.lanes.flat()};
  useLayoutEffect(()=>{
    const pending=pendingReturn.current,wasOpen=previousRecordOpen.current;
    previousRecordOpen.current=recordOpen;
    if(pending&&(!hasScopeKey||pending.scopeKey!==scopeKey)){pendingReturn.current=null;return;}
    if(recordOpen&&pending)pending.opened=true;
    if(!wasOpen||recordOpen||!pending?.opened)return;
    pendingReturn.current=null;
    const frame=requestAnimationFrame(()=>{
      const current=liveProjection.current;
      if(current.recordOpen||!hasScopeKey||current.scopeKey!==pending.scopeKey)return;
      const group=current.groups.find(item=>item.id===pending.groupId);
      const exactTrigger=groupTriggers.current.get(pending.groupId)===pending.trigger&&pending.trigger?.isConnected
        &&group?.events.some(event=>event.id===pending.eventId);
      const target=exactTrigger?pending.trigger:viewData.current?.isConnected&&!viewData.current.disabled?viewData.current:headingTarget.current;
      if(target?.isConnected&&!target.disabled)target.focus({preventScroll:true});
    });
    return()=>cancelAnimationFrame(frame);
  },[recordOpen,scopeKey,hasScopeKey]);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;pendingReturn.current=null;if(launchFrame.current!==null)cancelAnimationFrame(launchFrame.current);};},[]);
  const monthKey=model.months.map(month=>month.toISOString()).join('|');
  useLayoutEffect(()=>{
    const node=axis.current;if(!node)return;
    const labels=[...node.querySelectorAll('[data-month-key]')];
    const measure=()=>{
      const measured=labels.map(label=>{const bounds=label.getBoundingClientRect();return {id:label.dataset.monthKey,left:bounds.left,right:bounds.right,year:label.dataset.year==='true'};});
      // Unlaid-out test/hidden surfaces have no reliable label geometry yet.
      if(!measured.some(label=>label.right>label.left))return;
      const visible=timelineAxisVisibleLabels(measured);
      setAxisVisible(previous=>previous?.join('|')===visible.join('|')?previous:visible);
    };
    measure();
    const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(measure);
    observer?.observe(node);labels.forEach(label=>observer?.observe(label));
    window.addEventListener('resize',measure);
    return()=>{observer?.disconnect();window.removeEventListener('resize',measure);};
  },[monthKey,scopeKey]);
  const symbol=event=>Math.max(0,legend.findIndex(item=>item.kind===event.kind))%3;
  const name=event=>`${event.title}, ${event.label}, ${displayDay(event.date)}${event.detail?`, ${event.detail}`:''}`;
  const open=event=>{pendingReturn.current=null;onOpen?.(event);};
  const openCluster=(event,group)=>{
    const trigger=groupTriggers.current.get(group.id);
    const pending=hasScopeKey&&trigger?.isConnected?{scopeKey,groupId:group.id,eventId:event.id,trigger,opened:false}:null;
    pendingReturn.current=pending;
    launchedPreviewReturns.current.set(group.id,scopeKey);
    // Native editors capture the active invoker; the preview member will unmount.
    if(pending&&liveProjection.current.scopeKey===pending.scopeKey&&trigger.isConnected)trigger.focus({preventScroll:true});
    const opening=onOpen?.(event);
    // Native entry may fetch the record before mounting its editor. Wait for that
    // command, then one commit frame, before expiring an open that was refused.
    const expireRefusedOpen=()=>{
      if(!mounted.current||pendingReturn.current!==pending)return;
      if(launchFrame.current!==null)cancelAnimationFrame(launchFrame.current);
      launchFrame.current=requestAnimationFrame(()=>{launchFrame.current=null;if(pendingReturn.current===pending&&!pending?.opened)pendingReturn.current=null;});
    };
    if(opening&&typeof opening.then==='function')return Promise.resolve(opening).finally(expireRefusedOpen);
    expireRefusedOpen();
  };
  return <section key={scopeKey} className="compact-program-timeline" data-theme={theme} aria-label="Next 12 months">
    <header className="cpt-head"><div><h3 ref={headingTarget} tabIndex={-1}>Next 12 months</h3><p>{description}</p></div><div className="cpt-legend" aria-label="Timeline markers">{legend.map((item,index)=><span key={item.kind}><i className={`cpt-marker cpt-symbol-${index%3}`}/>{item.label}</span>)}<button type="button" ref={viewData} disabled={!available} onClick={()=>setTable(!table)} aria-expanded={table}>{table?'Hide data':'View data'}</button></div></header>
    <Tooltip.Provider delayDuration={150} skipDelayDuration={100}><div className="cpt-chart">
      <div className="compact-program-coming" style={{gridRow:`1 / span ${rows+1}`}}><h4>Coming up</h4>{model.events.slice(0,upcomingLimit).map(event=>{
        const days=calendarDay(event.date)-model.start;
        return <button type="button" key={event.id} data-event-id={event.id} className={`cpt-up-item${days<=30?' soon':''}`} aria-label={`${name(event)}. Open item.`} onClick={()=>open(event)}><strong>{Math.abs(days)}<small>{days<0?'days late':days===1?'day':'days'}</small></strong><b><i className={`cpt-marker cpt-symbol-${symbol(event)}`}/>{event.label} · {shortDate(event.date)}</b><span>{event.title}</span></button>;
      })}{!model.events.length&&<p>{available?'No saved upcoming dates.':'Dates unavailable while records are loading.'}</p>}</div>
      <div className="cpt-axis" ref={axis} aria-hidden="true">{model.months.map(month=><span key={month.toISOString()} data-month-key={month.toISOString()} data-year={month.getUTCMonth()===0} className={month.getUTCMonth()===0?'year':''} style={{left:`${model.position(month.toISOString())}%`,visibility:axisVisible&&!axisVisible.includes(month.toISOString())?'hidden':undefined}}>{month.toLocaleDateString(undefined,{timeZone:'UTC',month:'short'})}{month.getUTCMonth()===0&&<small> {month.getUTCFullYear()}</small>}</span>)}</div>
      {model.lanes.map((groups,index)=><div key={index} className="cpt-lane" role="group" aria-label={`Timeline row ${index+1}`}>
        {model.months.map(month=><i key={month.toISOString()} className="cpt-gridline" aria-hidden="true" style={{left:`${model.position(month.toISOString())}%`}}/>)}
        {groups.map(group=><Popover.Root key={group.id} open={!recordOpen&&activeGroup===group.id} onOpenChange={value=>setActiveGroup(value?group.id:null)}><Tooltip.Root><Tooltip.Trigger asChild><Popover.Trigger asChild><button type="button" ref={node=>{if(node)groupTriggers.current.set(group.id,node);else groupTriggers.current.delete(group.id);}} className={`cpt-event${calendarDay(group.events[0].date)-model.start<=30?' soon':''}${group.point>85?' flip':''}`} style={{left:`${group.point}%`}} aria-label={group.events.length===1?name(group.events[0]):`${group.events.length} scheduled events. Show all members.`}><i className={`cpt-marker cpt-symbol-${symbol(group.events[0])}`}/><span>{shortDate(group.events[0].date)}{group.events.length>1?` +${group.events.length-1}`:''}</span></button></Popover.Trigger></Tooltip.Trigger><Tooltip.Portal><Tooltip.Content className="cpt-preview" data-theme={theme} collisionPadding={{top:68,right:8,bottom:8,left:8}} sideOffset={10}><strong>{group.events[0].title}</strong><span>{group.events[0].label} · {displayDay(group.events[0].date)}</span>{group.events.length>1&&<span>{group.events.length} events. Activate to see every item.</span>}</Tooltip.Content></Tooltip.Portal></Tooltip.Root><Popover.Portal><Popover.Content onCloseAutoFocus={event=>{const launchScope=launchedPreviewReturns.current.get(group.id);launchedPreviewReturns.current.delete(group.id);if(launchScope!==undefined&&(liveProjection.current.recordOpen||launchScope!==liveProjection.current.scopeKey))event.preventDefault();}} className="cpt-preview cpt-member-list" data-theme={theme} sideOffset={10} collisionPadding={12} aria-label="Scheduled event preview">{group.events.map(event=><div key={event.id} data-event-id={event.id}><strong>{event.title}</strong><span>{event.label} · {displayDay(event.date)}</span>{event.detail&&<p>{event.detail}</p>}<Popover.Close asChild><button type="button" onClick={()=>openCluster(event,group)}>Open item<span className="sr-only">: {name(event)}</span></button></Popover.Close></div>)}<Popover.Close aria-label="Close event preview">Close</Popover.Close></Popover.Content></Popover.Portal></Popover.Root>)}
      </div>)}
    </div></Tooltip.Provider>
    {table&&<div className="cpt-data"><table><caption>Saved scheduled events</caption><thead><tr><th>Item</th><th>Event</th><th>Due</th></tr></thead><tbody>{model.events.map(event=><tr key={event.id}><td><button type="button" onClick={()=>open(event)}>{event.title}</button></td><td>{event.label}</td><td>{displayDay(event.date)}</td></tr>)}</tbody></table></div>}
  </section>;
}
