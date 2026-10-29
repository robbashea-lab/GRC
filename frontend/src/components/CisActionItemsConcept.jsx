import {useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {flushSync} from 'react-dom';
import * as Tooltip from '@radix-ui/react-tooltip';
import {CalendarDays,CheckSquare,ChevronLeft,ChevronRight,TriangleAlert,Users} from 'lucide-react';
import {Dialog,DialogClose,DialogContent,DialogDescription,DialogTitle} from '@/components/ui/dialog';
import {calendarDay} from '@/lib/managementDates';
import {currentQuarter,quarterToday,shiftQuarter} from '@/lib/quarterlyProgramTimeline';
import {ACTION_CONCEPT_PRIORITIES,actionConceptEvents,actionConceptPriority,actionConceptQuarter,actionConceptUrgency} from '@/lib/cisActionItemsConcept';
import {brawndoEligibleOwnerIds,brawndoNeedsOwner} from '@/lib/brawndoDemoActions';
import {personLabel} from '@/lib/people';
import DeadlineClock from './DeadlineClock';
import {ticketStage} from '@/lib/remediationTickets';
import './CisActionItemsConcept.css';

const dateLabel=(value,year=true)=>{
  const day=calendarDay(value);
  return day===null?'Unscheduled':new Date(day*86400000).toLocaleDateString('en-US',{timeZone:'UTC',month:'short',day:'numeric',...(year?{year:'numeric'}:{})});
};
const statusLabel=value=>({open:'Open',in_progress:'In progress',blocked:'Blocked',pending_validation:'Pending validation',completed:'Completed',accepted:'Accepted',cancelled:'Cancelled'})[value]||value;

// Radix uses the visual viewport; reserve the document scrollbar in its right collision padding.
const getTooltipScrollbarWidth=()=>{
  const clientWidth=typeof document==='undefined'?0:document.documentElement.clientWidth;
  return clientWidth>0?Math.max(0,window.innerWidth-clientWidth):0;
};

export function ActionConceptPriority({value}){
  const priority=actionConceptPriority(value);
  return <span className={`priority-badge priority-${priority.key}`}>{priority.label}</span>;
}
export function ActionConceptDue({date,completed=false,now}){
  const urgency=actionConceptUrgency(date,now);
  return <><time dateTime={calendarDay(date)===null?undefined:String(date).slice(0,10)}>{dateLabel(date)}</time>{!completed&&<span className={`due-badge ${urgency.className}`}>{urgency.className==='overdue'?<DeadlineClock>{urgency.text}</DeadlineClock>:urgency.text}</span>}</>;
}

export function CisActionItemsSummary({metrics,ready,onSelect,activeKey}){
  const oldest=Math.max(0,...metrics.overdue.map(row=>-actionConceptDays(row.due_date)));
  const cards=[
    ['active','Active',metrics.active.length,`${metrics.active.filter(row=>ticketStage(row)==='in_progress').length} in progress · ${metrics.active.filter(row=>ticketStage(row)==='pending_validation').length} awaiting validation`,CheckSquare],
    ['overdue','Overdue',metrics.overdue.length,oldest?`Oldest ${oldest} ${oldest===1?'day':'days'} past due`:'Nothing past due',TriangleAlert],
    ['upcoming','Due in 30 days',metrics.windows.next14.length+metrics.windows['15_30'].length,'Saved active Action deadlines',CalendarDays],
    ['unassigned','Needs an owner',metrics.needsOwner.length,metrics.ownerDetail||(metrics.needsOwner.length?'Missing or ineligible owner':'Every action has an active owner'),Users],
  ];
  return <section className="kpis cia-summary bda-summary" aria-label="Action summaries">{cards.map(([key,label,count,detail,Icon])=><button type="button" key={key} className={`kpi bda-cell bda-${key} ${key==='overdue'?'overdue':''} ${key==='unassigned'?'needs-owner':''}`} disabled={!ready} aria-pressed={activeKey===key} onClick={()=>onSelect(key)}><span className="kpi-icon"><Icon aria-hidden="true"/></span><span><span className="label">{label}</span><strong>{ready?count:'—'}</strong><small>{ready?detail:'—'}</small></span></button>)}</section>;
}
const actionConceptDays=date=>calendarDay(date)===null?0:calendarDay(date)-quarterToday();

// Clock follows native viewer-local calendar days, including a page left open overnight.
export function useActionConceptClock(enabled=true){
  const [now,setNow]=useState(()=>new Date());
  useEffect(()=>{
    if(!enabled)return;
    let timer;
    const refresh=()=>{const value=new Date();setNow(value);clearTimeout(timer);timer=setTimeout(refresh,new Date(value.getFullYear(),value.getMonth(),value.getDate()+1).getTime()-value.getTime()+50);};
    const visible=()=>{if(document.visibilityState!=='hidden')refresh();};
    refresh();window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',visible);
    return()=>{clearTimeout(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',visible);};
  },[enabled]);
  return now;
}

// Every saved Action keeps a separate dot; a shared date has one label and as many lanes as needed.
function placeDates(groups,width,padding){
  const lanes=[];
  return groups.map(group=>{
    const footprint=Math.max(48,group.events.length*23),anchor=padding+group.point/100*Math.max(1,width-2*padding);
    let lane=0;
    while(lanes[lane]!==undefined&&anchor-footprint/2<lanes[lane]+15)lane++;
    lanes[lane]=anchor+footprint/2;
    return {...group,lane,width:footprint,anchor,left:anchor-footprint/2};
  });
}

export function CisActionItemsOverview({rows=[],users=[],available=true,onOpen,scopeKey='',theme='light',recordOpen=false,now:providedNow}){
  const internalNow=useActionConceptClock(!providedNow),now=providedNow||internalNow;
  const today=quarterToday(now),[windowState,setWindow]=useState(null),[mode,setMode]=useState('upcoming'),[priority,setPriority]=useState(null),[selection,setSelection]=useState(null),[plotWidth,setPlotWidth]=useState(700);
  const [openError,setOpenError]=useState(null);
  const [tooltipScrollbarWidth,setTooltipScrollbarWidth]=useState(getTooltipScrollbarWidth);
  const matching=windowState?.scopeKey===scopeKey,selected=matching?windowState:currentQuarter(now);
  const events=useMemo(()=>actionConceptEvents(available?rows:[]),[rows,available]);
  const model=useMemo(()=>actionConceptQuarter(events,{year:selected.year,quarter:selected.quarter},now),[events,selected.year,selected.quarter,now]);
  const visible=model.events.filter(event=>!priority||event.kind===priority);
  const groups=model.groups.map(group=>({...group,events:group.events.filter(event=>!priority||event.kind===priority)})).filter(group=>group.events.length);
  // Grow horizontally for large same-date groups rather than clipping or aggregating them.
  const padding=Math.max(40,...groups.map(group=>group.events.length*23/2+2));
  const minimumWidth=Math.max(530,padding*2+200),width=Math.max(plotWidth,minimumWidth),layout=placeDates(groups,width,padding),height=Math.max(190,...layout.map(group=>group.lane*54+84));
  const agenda=mode==='overdue'?model.overdue:model.upcoming,eligible=brawndoEligibleOwnerIds(users);
  const plot=useRef(null),heading=useRef(null),viewData=useRef(null),opener=useRef(null),live=useRef(null);
  live.current={scopeKey,available,events,recordOpen};
  useEffect(()=>{setWindow(null);setPriority(null);setSelection(null);setMode('upcoming');setOpenError(null);opener.current=null;},[scopeKey]);
  useEffect(()=>{if(!available||recordOpen)setSelection(null);},[available,recordOpen]);
  useLayoutEffect(()=>{
    const node=plot.current;if(!node)return;
    const measure=()=>{
      setPlotWidth(Math.max(node.getBoundingClientRect().width||700,Number.parseFloat(getComputedStyle(node).getPropertyValue('--cia-timeline-min-width'))||530));
      setTooltipScrollbarWidth(getTooltipScrollbarWidth());
    };
    measure();const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(measure);observer?.observe(node);window.addEventListener('resize',measure);
    return()=>{observer?.disconnect();window.removeEventListener('resize',measure);};
  },[]);
  const focusOrigin=()=>{
    const current=live.current;
    if(current.scopeKey!==scopeKey||!current.available||current.recordOpen)return false;
    const usable=node=>node?.isConnected&&!node.disabled&&!node.closest('[hidden],[inert],[aria-hidden="true"]');
    const target=opener.current?.scopeKey===scopeKey&&usable(opener.current.node)?opener.current.node:viewData.current;
    if(!usable(target))return false;
    target.focus({preventScroll:true});return document.activeElement===target;
  };
  const selectWindow=next=>{setSelection(null);setWindow({...next,scopeKey});};
  const showList=(kind,node,date=null,highlight=null)=>{opener.current={node,scopeKey};setSelection({kind,date,highlight,scopeKey});};
  const selectedEvents=selection?.scopeKey!==scopeKey?[]:selection?.kind==='date'?visible.filter(event=>event.date.slice(0,10)===selection.date):selection?.kind==='agenda'?agenda:visible;
  function openNative(event,fromList=false,origin=null){
    const current=live.current,currentEvent=current.events.find(item=>item.id===event.id);
    if(!scopeKey||current.scopeKey!==scopeKey||!current.available||current.recordOpen||!currentEvent)return;
    if(origin)opener.current={node:origin,scopeKey};
    if(fromList){flushSync(()=>setSelection(null));focusOrigin();}
    setOpenError(null);
    const failed=()=>{if(live.current.scopeKey===scopeKey){setOpenError({scopeKey,id:currentEvent.id});focusOrigin();}};
    try{
      if(typeof onOpen!=='function'){failed();return;}
      // The native close-autofocus callback owns the return after Radix finishes closing.
      Promise.resolve(onOpen(currentEvent,focusOrigin)).then(result=>{if(result===false)failed();},failed);
    }catch{failed();}
  }
  const owner=event=>personLabel(users,event.task.assignee_id??event.task.owner_id),needsOwner=event=>brawndoNeedsOwner({owner_id:event.task.assignee_id??event.task.owner_id},eligible);
  const eventStatus=event=>event.task.status==='done'&&ticketStage(event.record)==='pending_validation'?'Pending validation':statusLabel(event.task.status==='done'?'completed':event.task.status);
  const context=event=>event.record.source?.label||'Origin not recorded';
  const dayAt=day=>new Date(day*86400000).toISOString().slice(0,10),first=model.start,last=model.end-1,position=day=>padding+(day-first)/(last-first)*Math.max(1,width-2*padding);
  const ticks=[];for(let day=first;day<=last;day+=7)ticks.push(day);if(ticks.at(-1)!==last)ticks.push(last);
  const label=`Q${selected.quarter} ${selected.year}`;
  const priorities=[...ACTION_CONCEPT_PRIORITIES,...(model.events.some(event=>event.kind==='unclassified')?[actionConceptPriority(null)]:[])];
  return <section className="panel quarter-card" aria-label="Calendar quarter timeline" data-theme={theme}>
    {openError?.scopeKey===scopeKey&&<p className="cia-open-error" role="alert">The Action could not be opened. Try again or choose it from the register. <button type="button" disabled={!available||recordOpen||!events.some(event=>event.id===openError.id)} onClick={click=>openNative({id:openError.id},false,click.currentTarget)}>Retry opening Action</button></p>}
    <div className="quarter-heading"><div><h2 ref={heading} tabIndex={-1}>Calendar quarter</h2><p>Action deadlines, with a clearer view of what’s next.</p></div><div className="quarter-controls"><button className="icon-button" type="button" aria-label="Previous quarter" onClick={()=>selectWindow(shiftQuarter(selected,-1))}><ChevronLeft/></button><strong aria-live="polite">{label}</strong><button type="button" className="icon-button" aria-label="Next quarter" onClick={()=>selectWindow(shiftQuarter(selected,1))}><ChevronRight/></button><select className="cia-year" aria-label="Year" value={selected.year} onChange={event=>selectWindow({year:Number(event.target.value),quarter:selected.quarter})}>{[...new Set([now.getFullYear(),...events.map(event=>Number(event.date.slice(0,4))),...Array.from({length:9},(_,index)=>selected.year-4+index)])].filter(year=>year>=100&&year<=9999).sort((a,b)=>a-b).map(year=><option key={year} value={year}>{year}</option>)}</select><div className="segmented quarters" aria-label="Choose quarter">{[1,2,3,4].map(quarter=><button type="button" key={quarter} aria-pressed={selected.quarter===quarter} onClick={()=>selectWindow({year:selected.year,quarter})}>Q{quarter}</button>)}</div><button type="button" className="this-quarter" onClick={()=>{setWindow(null);setPriority(null);setSelection(null);}}>This quarter</button></div></div>
    <div className="legend-row"><span className="quarter-range">{dateLabel(dayAt(first),false)} – {dateLabel(dayAt(last))}</span><div className="legend" aria-label="Filter timeline by Action priority">{priorities.map(item=><button type="button" key={item.key} aria-pressed={!priority||priority===item.key} aria-label={priority===item.key?'Show all priorities':`Show ${item.label} priority actions`} onClick={()=>{setSelection(null);setPriority(priority===item.key?null:item.key);}}><i className="legend-dot" style={{background:item.color}} aria-hidden="true"/>{item.label}</button>)}</div></div>
    <div className="quarter-content"><aside className="agenda"><div className="segmented agenda-switch">{['upcoming','overdue'].map(value=><button type="button" data-mode={value} key={value} aria-pressed={mode===value} onClick={()=>{setMode(value);setSelection(null);}}>{value==='upcoming'?'Upcoming':'Overdue'} <span>{available?model[value].length:'—'}</span></button>)}</div><p className="agenda-caption">Unresolved actions · {label}</p><div className="cia-agenda-list">{agenda.slice(0,3).map(event=><button type="button" key={event.id} className={`agenda-entry ${actionConceptUrgency(event.date,now).className==='overdue'?'overdue':''}`} onClick={click=>openNative(event,false,click.currentTarget)}><span className="agenda-title">{event.title}</span><span className="agenda-bottom"><span className="agenda-date">{dateLabel(event.date)}</span><span className={`due-badge ${actionConceptUrgency(event.date,now).className}`}>{actionConceptUrgency(event.date,now).text}</span></span></button>)}{!agenda.length&&<p className="agenda-empty">{available?`No ${mode} actions in this quarter.`:'Action deadlines unavailable.'}</p>}</div>{!!agenda.length&&<button type="button" className="text-link agenda-all" onClick={event=>showList('agenda',event.currentTarget)}>View all {agenda.length} {mode} actions →</button>}</aside>
      <div className="timeline-column"><div className="timeline-scroll" ref={plot}><div className="timeline-inner" style={{minWidth:minimumWidth,width}}><div className="month-row" style={{marginInline:padding}}>{model.months.map(month=><span className="month-name" key={month.toISOString()} style={{left:`${(calendarDay(month.toISOString())-first)/(last-first)*100}%`}}>{month.toLocaleDateString('en-US',{timeZone:'UTC',month:'short',...(month.getUTCMonth()===0?{year:'numeric'}:{})})}</span>)}</div>
        <Tooltip.Provider delayDuration={150}><div className="plot" style={{height}} aria-label={`${label} saved Action deadlines`}>
          {today>first&&<div className="past-area" style={{width:today>last?width:position(today)}}/>}{ticks.map(day=><i aria-hidden="true" className="grid-line" key={day} style={{left:position(day)}}/>)}{model.months.slice(1).map(month=><i className="grid-line month-line" aria-hidden="true" key={month.toISOString()} style={{left:position(calendarDay(month.toISOString()))}}/>)}{[1,2].map(index=><i className="h-line" aria-hidden="true" key={index} style={{top:height*index/3}}/>)}
          {today>=first&&today<=last&&<div className="today-line" style={{left:position(today)}}><span className="today-label">Today<br/>{dateLabel(dayAt(today),false)}</span></div>}
          {layout.map(group=><div className="date-group" key={group.id} data-date={group.date} style={{left:group.left,top:20+group.lane*54,width:group.width}}><div className="circle-row">{group.events.map(event=><Tooltip.Root key={event.id} onOpenChange={open=>{if(open)setTooltipScrollbarWidth(getTooltipScrollbarWidth());}}><Tooltip.Trigger asChild><button type="button" className={`review-dot ${calendarDay(event.date)<today?'late':''}`} data-action-id={event.task.task_id} aria-label={`${event.title}, ${event.priority.label} priority, ${dateLabel(event.date)}, ${actionConceptUrgency(event.date,now).text}. Open date’s actions.`} onClick={click=>showList('date',click.currentTarget,group.date,event.id)}><i className="dot" aria-hidden="true" style={{background:event.priority.color}}/></button></Tooltip.Trigger><Tooltip.Portal><Tooltip.Content className="cia-root cia-tooltip" data-theme={theme} collisionPadding={{top:12,right:12+tooltipScrollbarWidth,bottom:12,left:12}} sideOffset={10} hideWhenDetached><div className="tip-type" style={{borderColor:event.priority.color}}>{event.priority.label} priority · {context(event)}</div><h3>{event.title}</h3><div className="tip-due"><span>{dateLabel(event.date)}</span><span className={`due-badge ${actionConceptUrgency(event.date,now).className}`}>{actionConceptUrgency(event.date,now).text}</span></div><div className="tip-meta">{owner(event)}{needsOwner(event)?' · Needs reassignment':''}<br/>{eventStatus(event)}{event.record.source?.detail?` · ${event.record.source.detail}`:''}</div><p className="tip-hint">Click to see the date’s actions.</p></Tooltip.Content></Tooltip.Portal></Tooltip.Root>)}</div><i className="date-stem" aria-hidden="true"/><button type="button" className={`date-label ${actionConceptUrgency(group.date,now).className}`} onClick={event=>showList('date',event.currentTarget,group.date)} aria-label={`${dateLabel(group.date)}: ${group.events.length} actions`}>{dateLabel(group.date,false)}</button></div>)}
          {!visible.length&&<p className="chart-empty">{available?'No saved Action deadlines in this selection.':'Action deadlines unavailable.'}</p>}
        </div></Tooltip.Provider><div className="date-axis" aria-hidden="true">{ticks.filter((_,index)=>index%2===0||index===ticks.length-1).map(day=><span className="axis-label" key={day} style={{left:position(day)}}>{dateLabel(dayAt(day),false)}</span>)}</div></div></div><div className="timeline-foot"><span>{priority?`${actionConceptPriority(priority).label} priority · select the legend again to show all.`:'One circle per action. Hover for details; click to see the date’s actions.'}</span><button type="button" className="text-link" ref={viewData} disabled={!available} onClick={event=>showList('all',event.currentTarget)}>View data</button></div></div>
    </div>
    <Dialog open={!!selection&&available&&!recordOpen&&selection.scopeKey===scopeKey} onOpenChange={open=>{if(!open)setSelection(null);}}><DialogContent className="cia-root cia-selector" data-theme={theme} showCloseButton={false} onCloseAutoFocus={event=>{event.preventDefault();if(!live.current.recordOpen)focusOrigin();}}><header className="dialog-heading"><div><DialogTitle>{selection?.kind==='date'?dateLabel(selection.date):selection?.kind==='agenda'?`${mode==='overdue'?'Overdue':'Upcoming'} action items`:'Action deadlines'}</DialogTitle><DialogDescription>{selectedEvents.length} action items · {label} · {selection?.kind==='agenda'?'unresolved deadlines':priority?`${actionConceptPriority(priority).label} priority`:'all priorities'}</DialogDescription></div><DialogClose className="button">Close</DialogClose></header><div className="dialog-content date-list">{selectedEvents.map(event=><button type="button" className={`date-review ${selection.highlight===event.id?'highlight':''}`} key={event.id} onClick={()=>openNative(event,true)}><span className="list-title">{event.title}</span><span className="list-details"><ActionConceptPriority value={event.task.priority}/><span>{owner(event)}</span><span>{eventStatus(event)}</span></span><span className="list-bottom"><span>{dateLabel(event.date)} <span className={`due-badge ${actionConceptUrgency(event.date,now).className}`}>{actionConceptUrgency(event.date,now).text}</span></span><span className="open-text">Open action item →</span></span></button>)}{!selectedEvents.length&&<p>No Action deadlines in this selection.</p>}</div></DialogContent></Dialog>
  </section>;
}
