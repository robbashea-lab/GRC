import {useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {flushSync} from 'react-dom';
import * as Tooltip from '@radix-ui/react-tooltip';
import {Dialog,DialogClose,DialogContent,DialogDescription,DialogTitle} from '@/components/ui/dialog';
import {calendarDay,displayDay} from '@/lib/managementDates';
import {currentQuarter,isOverdue,quarterTimelineGroups,quarterToday,shiftQuarter} from '@/lib/quarterlyProgramTimeline';
import './BrawndoAdditionalPolicyVendor.css';
// Existing overview cards share this unchanged stylesheet with the legacy chart.
import './CompactProgramTimeline.css';
import './QuarterlyProgramTimeline.css';

const SHAPES=['circle','diamond','square','triangle','hexagon'];
const TONES=['review','assurance','renewal','review','muted'];
const ROW_HEIGHT=64.8;
const shortDate=value=>new Date(calendarDay(value)*86400000).toLocaleDateString(undefined,{timeZone:'UTC',month:'short',day:'numeric'});

// Only the four chart windows survive a same-scope native route return. No records are cached.
let rememberedScope='';
const rememberedWindows=new Map();
function initialWindow(scopeKey,chartKey){
  if(rememberedScope!==scopeKey){rememberedScope=scopeKey;rememberedWindows.clear();}
  return {scopeKey,chartKey,manual:false,...currentQuarter(),...rememberedWindows.get(chartKey)};
}

// Keep exact date centers and a bounded lane count. Overflow retains whole date/category groups.
export function packQuarterGroups(groups,rows,width){
  const lanes=Array.from({length:rows},()=>[]),occupied=lanes.map(()=>[]),overflow=[];
  groups.forEach(group=>{
    const footprint=78,left=group.point/100*width-footprint/2,right=left+footprint;
    // Extremely large totals belong in the readable overflow list rather than a clipped symbol.
    const lane=width>0&&group.events.length<100000?occupied.findIndex(items=>items.every(item=>left>=item.right+6||right+6<=item.left)):-1;
    if(lane<0){overflow.push(group);return;}
    lanes[lane].push(group);occupied[lane].push({left,right});
  });
  return {lanes,overflow};
}

export function useQuarterClock(){
  const [now,setNow]=useState(()=>new Date());
  useEffect(()=>{
    let timer;
    const refresh=()=>{
      const current=new Date();setNow(current);clearTimeout(timer);
      const midnight=new Date(current.getFullYear(),current.getMonth(),current.getDate()+1);
      timer=setTimeout(refresh,Math.max(1,midnight.getTime()-current.getTime()+50));
    };
    const visible=()=>{if(document.visibilityState!=='hidden')refresh();};
    refresh();window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',visible);
    return()=>{clearTimeout(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',visible);};
  },[]);
  return [now,setNow];
}

export function useQuarterWindow(scopeKey,chartKey){
  const [now,setNow]=useQuarterClock();
  const [windowState,setWindowState]=useState(()=>initialWindow(scopeKey,chartKey));
  const matchingWindow=windowState.scopeKey===scopeKey&&windowState.chartKey===chartKey;
  const selected=matchingWindow&&windowState.manual?windowState:currentQuarter(now);
  useEffect(()=>{setWindowState(initialWindow(scopeKey,chartKey));},[scopeKey,chartKey]);
  useEffect(()=>{
    if(!matchingWindow||rememberedScope!==scopeKey)return;
    if(windowState.manual){
      rememberedWindows.set(chartKey,{manual:true,year:windowState.year,quarter:windowState.quarter});
      if(rememberedWindows.size>4)rememberedWindows.delete(rememberedWindows.keys().next().value);
    }else rememberedWindows.delete(chartKey);
  },[windowState,matchingWindow,scopeKey,chartKey]);
  return {now,setNow,windowState,setWindowState,matchingWindow,selected};
}

export default function QuarterlyProgramTimeline({events=[],rows=3,upcomingLimit=3,legend=[],onOpen,theme='light',available=true,description='Saved dates from the native register.',recordOpen=false,scopeKey='',chartKey='chart'}){
  const {now,setNow,windowState,setWindowState,matchingWindow,selected}=useQuarterWindow(scopeKey,chartKey);
  const today=quarterToday(now);
  const [table,setTable]=useState(false),[selection,setSelection]=useState(null),[plotWidth,setPlotWidth]=useState(0);
  const selectedYear=selected.year,selectedQuarter=selected.quarter;
  const model=useMemo(()=>quarterTimelineGroups(available?events:[],{year:selectedYear,quarter:selectedQuarter}),[events,available,selectedYear,selectedQuarter]);
  const layout=useMemo(()=>packQuarterGroups(model.groups,rows,plotWidth),[model.groups,rows,plotWidth]);
  const plot=useRef(null),heading=useRef(null),viewData=useRef(null),overflowTrigger=useRef(null),groupTriggers=useRef(new Map());
  const selectionReturn=useRef(null),pendingReturn=useRef(null),launchFrame=useRef(null),mounted=useRef(true);
  const previousRecordOpen=useRef(recordOpen),live=useRef(null);
  const hasScopeKey=typeof scopeKey==='string'&&scopeKey.trim().length>0;
  live.current={scopeKey,recordOpen,available,groups:model.groups,events:model.events,overflow:layout.overflow};

  useEffect(()=>{
    setSelection(null);setTable(false);selectionReturn.current=null;pendingReturn.current=null;
  },[scopeKey,chartKey]);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;pendingReturn.current=null;if(launchFrame.current!==null)cancelAnimationFrame(launchFrame.current);};},[]);
  useLayoutEffect(()=>{
    const node=plot.current;if(!node)return;
    const measure=()=>setPlotWidth(Math.max(0,node.getBoundingClientRect().width-88));
    measure();const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(measure);
    observer?.observe(node);window.addEventListener('resize',measure);
    return()=>{observer?.disconnect();window.removeEventListener('resize',measure);};
  },[scopeKey]);

  const fallback=useCallback(()=>viewData.current?.isConnected&&!viewData.current.disabled?viewData.current:heading.current,[]);
  const returnTarget=useCallback(pending=>{
    const current=live.current,group=current.groups.find(item=>item.id===pending.groupId);
    const trigger=pending.groupId==='overflow'?overflowTrigger.current:groupTriggers.current.get(pending.groupId);
    const currentGroupEvents=pending.groupId==='overflow'?current.overflow.flatMap(item=>item.events):group?.events||[];
    const stillPresent=pending.eventId?currentGroupEvents.some(event=>event.id===pending.eventId):currentGroupEvents.length>0;
    return stillPresent&&trigger===pending.trigger&&trigger?.isConnected?trigger:fallback();
  },[fallback]);
  useLayoutEffect(()=>{
    const pending=pendingReturn.current,wasOpen=previousRecordOpen.current;
    previousRecordOpen.current=recordOpen;
    if(pending&&(!hasScopeKey||pending.scopeKey!==scopeKey)){pendingReturn.current=null;return;}
    if(recordOpen&&pending)pending.opened=true;
    if(!wasOpen||recordOpen||!pending?.opened)return;
    pendingReturn.current=null;
    const frame=requestAnimationFrame(()=>{
      if(live.current.recordOpen||live.current.scopeKey!==pending.scopeKey)return;
      const target=returnTarget(pending);if(target?.isConnected&&!target.disabled)target.focus({preventScroll:true});
    });
    return()=>cancelAnimationFrame(frame);
  },[recordOpen,scopeKey,hasScopeKey,returnTarget]);
  const activeGroup=selection?.scopeKey===scopeKey?model.groups.find(group=>group.id===selection.groupId):null;
  // The clicked overflow set survives plot repacking; current records are always resolved afresh.
  const overflowIds=new Set(selection?.eventIds||[]);
  const selectedEvents=selection?.scopeKey!==scopeKey?[]:selection?.groupId==='overflow'?model.events.filter(event=>overflowIds.has(event.id)):activeGroup?.events||[];
  useEffect(()=>{if(recordOpen||selection&&!selectedEvents.length)setSelection(null);},[recordOpen,selection,selectedEvents.length]);
  const category=event=>legend.find(item=>item.kind===event.kind)?.label||event.classificationLabel||'Classification not recorded';
  const appearance=event=>{
    const index=legend.findIndex(item=>item.kind===event.kind),item=legend[index];
    return {shape:item?.shape||SHAPES[Math.max(0,index)%SHAPES.length],tone:item?.tone||TONES[Math.max(0,index)%TONES.length]};
  };
  const symbol=(event,count)=>{
    const {shape,tone}=appearance(event);
    return <span aria-hidden="true" className={`qpt-symbol qpt-${shape} qpt-tone-${tone}${count===undefined?' qpt-key':''}`} style={count===undefined?undefined:{width:`${Math.max(34,String(count).length*6+14)}px`,height:`${Math.max(34,String(count).length*6+14)}px`}}><i/>{count!==undefined&&<b>{count}</b>}</span>;
  };
  const name=event=>`${event.title}, ${event.label}, ${displayDay(event.date)}${event.detail?`, ${event.detail}`:''}`;
  const chooseWindow=next=>{setSelection(null);setWindowState({scopeKey,chartKey,manual:true,...next});};
  const showList=(groupId,trigger)=>{
    selectionReturn.current={scopeKey,groupId,trigger};
    const eventIds=groupId==='overflow'?live.current.overflow.flatMap(group=>group.events.map(event=>event.id)):undefined;
    setSelection({scopeKey,groupId,eventIds});
  };
  const openNative=(event,fromList=false)=>{
    const current=live.current,currentEvent=current.events.find(item=>item.id===event.id);
    if(!current.available||current.scopeKey!==scopeKey||!hasScopeKey||!currentEvent)return;
    const source=fromList?selectionReturn.current:null;
    const pending=source?.scopeKey===scopeKey&&source.trigger?.isConnected?{...source,eventId:currentEvent.id,opened:false}:null;
    pendingReturn.current=pending;
    if(fromList){
      // Unmount/suspend the selector before native focus capture; its row is transient.
      selectionReturn.current=null;flushSync(()=>setSelection(null));
      const target=pending?returnTarget(pending):fallback();if(target?.isConnected&&!target.disabled)target.focus({preventScroll:true});
    }
    const expireRefused=()=>{
      if(!mounted.current||pendingReturn.current!==pending)return;
      if(launchFrame.current!==null)cancelAnimationFrame(launchFrame.current);
      launchFrame.current=requestAnimationFrame(()=>{launchFrame.current=null;if(pendingReturn.current===pending&&!pending?.opened)pendingReturn.current=null;});
    };
    try{
      const opening=onOpen?.(currentEvent);
      if(opening&&typeof opening.then==='function')return Promise.resolve(opening).finally(expireRefused);
      expireRefused();
    }catch(error){expireRefused();throw error;}
  };
  const closeListFocus=event=>{
    event.preventDefault();const pending=selectionReturn.current;selectionReturn.current=null;
    if(!pending||pending.scopeKey!==live.current.scopeKey||live.current.recordOpen)return;
    const target=returnTarget(pending);if(target?.isConnected&&!target.disabled)target.focus({preventScroll:true});
  };
  const quarterLabel=`Q${selected.quarter} ${selected.year}`;
  return <section key={scopeKey} className="quarterly-program-timeline" data-theme={theme} aria-label="Calendar quarter timeline">
    <header className="qpt-head"><div><h3 ref={heading} tabIndex={-1}>Calendar quarter</h3><p>{description}</p></div>
      <div className="qpt-controls" aria-label="Timeline period">
        <div className="qpt-year"><button type="button" aria-label="Previous quarter" onClick={()=>chooseWindow(shiftQuarter(selected,-1))}>‹</button><strong aria-live="polite">{quarterLabel}</strong><button type="button" aria-label="Next quarter" onClick={()=>chooseWindow(shiftQuarter(selected,1))}>›</button></div>
        <div className="qpt-quarter-buttons" role="group" aria-label="Calendar quarter">{[1,2,3,4].map(quarter=><button type="button" key={quarter} aria-pressed={selected.quarter===quarter} onClick={()=>chooseWindow({year:selected.year,quarter})}>Q{quarter}</button>)}</div>
        <button type="button" className="qpt-follow" aria-pressed={!matchingWindow||!windowState.manual} onClick={()=>{const current=new Date();setNow(current);setSelection(null);setWindowState({scopeKey,chartKey,manual:false,...currentQuarter(current)});}}>This quarter</button>
      </div>
    </header>
    <div className="qpt-legend-line"><div className="qpt-legend" aria-label="Timeline markers">{legend.map(item=><span key={item.kind}>{symbol(item)}{item.label}</span>)}</div><button type="button" ref={viewData} disabled={!available} aria-expanded={table} onClick={()=>setTable(value=>!value)}>{table?'Hide data':'View data'}</button></div>
    <Tooltip.Provider delayDuration={150} skipDelayDuration={100}><div className="qpt-chart">
      <aside className="qpt-coming"><h4>Coming up</h4>{model.events.slice(0,upcomingLimit).map(event=>{
        const days=calendarDay(event.date)-today,overdue=isOverdue(event,now);
        const relative=days<0?`${Math.abs(days)===1?'day':'days'} ${overdue?'late':'ago'}`:days===1?'day':'days';
        return <button type="button" key={event.id} data-event-id={event.id} className={overdue?'qpt-overdue':''} aria-label={`${name(event)}. Open item.`} onClick={()=>openNative(event)}><strong>{Math.abs(days)}<small>{relative}</small></strong><b>{symbol(event)}{event.label} · {shortDate(event.date)}</b><span>{event.title}</span></button>;
      })}{!model.events.length&&<p>{available?'No saved dates in this quarter.':'Dates unavailable while records are loading.'}</p>}</aside>
      <div className="qpt-plot" ref={plot} aria-label={`${quarterLabel} saved dates`}>
        <div className="qpt-axis" aria-hidden="true">{model.months.map(month=><span key={month.toISOString()} style={{left:`${model.position(month.toISOString())}%`}}>{month.toLocaleDateString(undefined,{timeZone:'UTC',month:'short'})}</span>)}</div>
        <div className="qpt-board" style={{height:`${rows*ROW_HEIGHT}px`}}>{layout.lanes.map((groups,index)=><div key={index} className="qpt-lane" role="group" aria-label={`Timeline row ${index+1}`} style={{height:`${ROW_HEIGHT}px`}}>
          {model.months.map(month=><i className="qpt-gridline" key={month.toISOString()} aria-hidden="true" style={{left:`${model.position(month.toISOString())}%`}}/>)}
          {groups.map(group=><Tooltip.Root key={group.id}><Tooltip.Trigger asChild><button type="button" ref={node=>{if(node)groupTriggers.current.set(group.id,node);else groupTriggers.current.delete(group.id);}} className={`qpt-event${group.events.some(event=>isOverdue(event,now))?' qpt-overdue':''}`} data-group-id={group.id} style={{left:`${group.point}%`}} aria-label={`${category(group.events[0])}, ${group.events.length} ${group.events.length===1?'item':'items'}, ${displayDay(group.date)}. Choose an item.`} aria-haspopup="dialog" aria-expanded={selection?.groupId===group.id} onClick={event=>showList(group.id,event.currentTarget)}>{symbol(group.events[0],group.events.length)}<span className="qpt-event-date">{shortDate(group.date)}</span></button></Tooltip.Trigger><Tooltip.Portal><Tooltip.Content className="qpt-tooltip" data-theme={theme} sideOffset={8} collisionPadding={{top:68,right:12,bottom:12,left:12}} hideWhenDetached><strong>{category(group.events[0])} · {group.events.length} {group.events.length===1?'item':'items'}</strong><span>{displayDay(group.date)}</span><ul>{group.events.slice(0,3).map(event=><li key={event.id}>{event.title} · {event.label}</li>)}</ul><p>{group.events.length>3?`${group.events.length-3} more. `:''}Activate to choose from every item.</p></Tooltip.Content></Tooltip.Portal></Tooltip.Root>)}
        </div>)}{!model.events.length&&<p className="qpt-empty">{available?'No saved dates in this quarter.':'Dates unavailable while records are loading.'}</p>}</div>
        {!!layout.overflow.length&&<button type="button" className="qpt-overflow" ref={overflowTrigger} aria-haspopup="dialog" onClick={event=>showList('overflow',event.currentTarget)}>More dates · {layout.overflow.length} {layout.overflow.length===1?'group':'groups'} ({layout.overflow.reduce((total,group)=>total+group.events.length,0)} items)</button>}
      </div>
    </div></Tooltip.Provider>
    <p className="qpt-note">Numbered shapes show total items for each exact date and category. Only saved native dates are shown.</p>
    {table&&<div className="qpt-data"><table><caption>Saved dates in {quarterLabel}</caption><thead><tr><th>Due date</th><th>Item</th><th>Event</th><th>Category</th></tr></thead><tbody>{model.events.map(event=><tr key={event.id}><td>{displayDay(event.date)}</td><td><button type="button" onClick={()=>openNative(event)}>{event.title}</button></td><td>{event.label}</td><td>{category(event)}</td></tr>)}</tbody></table></div>}
    <Dialog open={!!selection&&selectedEvents.length>0&&!recordOpen} onOpenChange={open=>{if(!open)setSelection(null);}}><DialogContent className="qpt-selector" data-theme={theme} showCloseButton={false} onCloseAutoFocus={closeListFocus}>
      <header><div><DialogTitle>{activeGroup?`${category(activeGroup.events[0])} · ${displayDay(activeGroup.date)}`:`Additional dates in ${quarterLabel}`}</DialogTitle><DialogDescription>{selectedEvents.length} {selectedEvents.length===1?'item':'items'} · Earliest due first</DialogDescription></div><DialogClose aria-label="Close item selection">Close</DialogClose></header>
      <p>Each item keeps its exact due date, category and native record.</p>
      <div className="qpt-selection-rows">{selectedEvents.map(event=><button type="button" key={event.id} data-event-id={event.id} className="qpt-selection-row" onClick={()=>openNative(event,true)}><time dateTime={String(event.date).slice(0,10)}>{displayDay(event.date)}</time><span><strong>{event.title}</strong><small>{event.label} · {category(event)}{event.detail?` · ${event.detail}`:''}</small></span><span aria-hidden="true">→</span></button>)}</div>
    </DialogContent></Dialog>
  </section>;
}
