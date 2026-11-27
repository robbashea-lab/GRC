import {useEffect,useRef,useState} from 'react';
import {ChevronLeft,ChevronRight,Link2} from 'lucide-react';
import {BrawndoSurface} from '@/components/BrawndoPage';
import V3WorkspaceHeading from '@/components/V3WorkspaceHeading';
import {useBrawndoTheme} from '@/lib/brawndoTheme';
import SurfaceThemeAction from '@/components/SurfaceThemeAction';
import {calendarStatus,calendarType,stepCalendarDate} from '@/lib/calendarView';
import {calendarKind,calendarOwner,calendarCompleted,filterCalendarItems} from '@/lib/brawndoDemoCalendar';
import './BrawndoDemoCalendar.css';
const KINDS={review:'Reviews',finding:'Findings',task:'Action items',vendor:'Vendor dates'};
const short=date=>new Date(date+'T12:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric'});
const initials=name=>name.split(/\s+/).slice(0,2).map(x=>x[0]).join('');
export default function BrawndoDemoCalendar(p){
  const {clientName,anchor,setAnchor,view,setView,period,days,today,entries,loading,error,errorNode,recoveryNode,busy,dragging,dragOverDay,setDragOverDay,setDragging,onDragStart,onDrop,openSchedule,ymd,drawerNode,members=[],memberError,summaryEntries,summaryError,nativeBehavior=false,expanded={},setExpanded}=p;
  // Keep the native query window; display only complete weeks containing this month.
  const monthWeeks=Math.ceil((((new Date(anchor.getFullYear(),anchor.getMonth(),1).getDay()+6)%7)+new Date(anchor.getFullYear(),anchor.getMonth()+1,0).getDate())/7);
  const monthGridDays=days.slice(0,monthWeeks*7);
  const [types,setTypes]=useState(Object.keys(KINDS)),[scope,setScope]=useState('active'),[owner,setOwner]=useState('all'),[highlight,setHighlight]=useState('all'),[showDone,setShowDone]=useState(false),[tip,setTip]=useState(null);
  useEffect(()=>{const hide=()=>setTip(null);window.addEventListener('scroll',hide,true);return()=>window.removeEventListener('scroll',hide,true);},[]);
  function showTip(event,item){const rect=event.currentTarget.getBoundingClientRect();setTip({item,left:Math.max(8,Math.min(rect.left,window.innerWidth-308)),top:rect.bottom+150>window.innerHeight?Math.max(8,rect.top-140):rect.bottom+6});}
  const filtered=filterCalendarItems(entries,{types,scope,owner,highlight,today,nativeScheduledItems:nativeBehavior});
  const visible=filterCalendarItems(entries,{types,scope,owner,highlight:'all',today});
  const shown=date=>visible.filter(item=>item.date===date);
  const month=anchor.toLocaleDateString(undefined,{month:'long'}),monthPrefix=ymd(new Date(anchor.getFullYear(),anchor.getMonth(),1)).slice(0,7);
  const monthItems=entries.filter(item=>item.date.startsWith(monthPrefix)),done=monthItems.filter(calendarCompleted),otherClosed=monthItems.filter(item=>item.historical&&!calendarCompleted(item)),late=filterCalendarItems(summaryEntries||[],{types:Object.keys(KINDS),scope:'all',owner:'all',highlight:'overdue',today,nativeScheduledItems:nativeBehavior});
  const soon=filterCalendarItems(summaryEntries||[],{types:Object.keys(KINDS),scope:'all',owner:'all',highlight:'week',today,nativeScheduledItems:nativeBehavior});
  const summaries=[['all',`Scheduled in ${month}`,monthItems,`${monthItems.filter(item=>!item.historical).length} open · ${done.length} completed${otherClosed.length?` · ${otherClosed.length} other historical`:''}`],['overdue','Overdue',late,late.length?`Oldest ${Math.round((Date.parse(today)-Date.parse([...late].sort((a,b)=>a.date.localeCompare(b.date))[0].date))/86400000)} days past due`:'Nothing past due'],['week','Due in 7 days',soon,soon.length?`Next due ${short([...soon].sort((a,b)=>a.date.localeCompare(b.date))[0].date)}`:'Nothing due in 7 days'],['done',`Completed due in ${month}`,done,done.length?`By scheduled date · latest due ${short([...done].sort((a,b)=>a.date.localeCompare(b.date)).at(-1).date)}`:'By scheduled date · none yet']];
  const summaryUnavailable=id=>loading||error||['overdue','week'].includes(id)&&(!summaryEntries||!!summaryError);
  const summaryMessage=id=>error?'Unavailable':loading?'Loading…':summaryError?'Unavailable':'Loading…';
  const tipProps=item=>({onPointerEnter:ev=>showTip(ev,item),onPointerLeave:()=>setTip(null),onFocus:ev=>showTip(ev,item),onBlur:()=>setTip(null),'aria-describedby':tip?.item.key===item.key?'bdcal-tip':undefined});
  const [theme,setTheme]=useBrawndoTheme();
  const [selectedDate,setSelectedDate]=useState(null);
  const agendaRef=useRef(null);
  const activeDay=view==='day'?ymd(anchor):selectedDate;
  const longDate=date=>new Date(date+'T12:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
  function selectDay(date) {
    setSelectedDate(date);
    agendaRef.current?.scrollIntoView?.({block:'start',behavior:'smooth'});
  }
  function changeView(next) {
    if(selectedDate) setAnchor(new Date(selectedDate+'T12:00:00'));
    setSelectedDate(null);
    setView(next);
  }
  function navigatePeriod(direction) {
    setSelectedDate(null);
    setAnchor(direction===0?new Date():stepCalendarDate(anchor,view,direction));
  }
  const glyph=item=><i className={`g g-${calendarKind(item)}`} aria-hidden="true"/>;
  const state=item=>!item.historical&&item.date<today?'Overdue':calendarStatus(item);
  function event(item,mode){return <button key={item.key} type="button" className={`${mode}${highlight!=='all'&&!filtered.some(row=>row.key===item.key)?' dim':''}${item.historical?' done':item.date<today?' late':''}`} data-testid={`cal-item-${item.key}`} draggable={item.can_reschedule&&!busy&&!loading&&!error} aria-disabled={busy||loading||!!error} {...tipProps(item)} aria-label={`${calendarType(item)}: ${item.title} — ${state(item)} — ${item.date}`} onClick={ev=>openSchedule(item,ev)} onDragStart={ev=>onDragStart(ev,item)} onDragEnd={()=>{setDragging(null);setDragOverDay('');}}>
    {mode==='ev'?<>{glyph(item)}<span className="ev-t">{item.title}</span>{item.represented&&<Link2 className="ic-s" aria-hidden="true"/>}</>:mode==='card'?<><span className="ct">{glyph(item)}{calendarType(item)}</span><b>{item.title}</b><span className={`cm${item.date<today&&!item.historical?' late':''}`}>{calendarOwner(item,members)} · {state(item)}</span>{item.represented&&<span className="cl"><Link2 className="ic-s" aria-hidden="true"/>Tracked by an action item</span>}</>:<><span className="d-item"><span className="dt">{item.title}</span><span className="meta">{glyph(item)}{calendarType(item)}{item.period&&<span>{item.period}</span>}{item.represented&&<span className="calendar-linked-note"><Link2 className="ic-s" aria-hidden="true"/> Tracked by an action item</span>}</span></span><span className={`owner d-owner${item.owner_id?'':' none'}`}><span className="avatar">{item.owner_id?initials(calendarOwner(item,members)):'—'}</span>{calendarOwner(item,members)}</span><span className={`dstate${item.date<today&&!item.historical?' late':''}`}>{state(item)}</span><span className="chev">›</span></>}
  </button>;}
  const dropProps=date=>({onDragOver:ev=>{if(dragging&&!busy){ev.preventDefault();setDragOverDay(date);}},onDragLeave:()=>setDragOverDay(''),onDrop:ev=>onDrop(ev,date)});
  const agenda=filtered.filter(item=>item.date>=period.start&&item.date<=period.end||!item.historical&&item.date<today).sort((a,b)=>a.date.localeCompare(b.date)||a.title.localeCompare(b.title));
  const dayOffset=item=>Math.round((Date.parse(item.date)-Date.parse(today))/86400000);
  const groups=[['Overdue',agenda.filter(item=>!item.historical&&item.date<today)],['Today',agenda.filter(item=>!item.historical&&item.date===today)],['Next 7 days',agenda.filter(item=>!item.historical&&dayOffset(item)>0&&dayOffset(item)<=7)],[view==='month'?`Later in ${month}`:'Later',agenda.filter(item=>!item.historical&&dayOffset(item)>7)],['Completed',agenda.filter(calendarCompleted)],['Other historical items',agenda.filter(item=>item.historical&&!calendarCompleted(item))]];
  const displayedAgenda=activeDay?filtered.filter(item=>item.date===activeDay):agenda;
  const displayGroups=activeDay?[['',displayedAgenda]]:groups;
  const scopeItems=filterCalendarItems(monthItems,{types:Object.keys(KINDS),scope,owner,highlight:'all',today});
  const gridDays=view==='month'?monthGridDays:days;
  const cellLimit=view==='week'?12:3;
  const pickScope=id=>{
    setScope(id);
    if(id==='active'&&highlight==='done'||id==='done'&&['overdue','week'].includes(highlight))setHighlight('all');
  };
  return <BrawndoSurface className="bdcal">
    <V3WorkspaceHeading clientName={clientName} title="Calendar" subtitle={`Reviews, findings, action items and vendor dates · As of ${longDate(today)}`}>
      <SurfaceThemeAction theme={theme} onTheme={()=>setTheme(theme==='dark'?'light':'dark')} className="bpage-btn"/>
    </V3WorkspaceHeading>
    <div className="cal-layout">
      <section className="panel pcard" aria-label={view[0].toUpperCase()+view.slice(1)}>
        <div className="toolbar cal-bar">
          <div className="cal-nav">
            <button type="button" className="icon-btn sm" aria-label={`Previous ${view}`} data-testid="cal-prev" onClick={()=>navigatePeriod(-1)}><ChevronLeft size={16}/></button>
            <h2 data-testid="cal-month-label">{period.label}</h2>
            <button type="button" className="icon-btn sm" aria-label={`Next ${view}`} data-testid="cal-next" onClick={()=>navigatePeriod(1)}><ChevronRight size={16}/></button>
            <button type="button" className="ghost sm" data-testid="cal-today" onClick={()=>navigatePeriod(0)}>Today</button>
          </div>
          <div className="f-right">
            <div className="seg sm" role="group" aria-label="Calendar view">{['day','week','month'].map(id=>
              <button key={id} type="button" aria-pressed={view===id} onClick={()=>changeView(id)}>{id[0].toUpperCase()+id.slice(1)}</button>)}</div>
            <label><span className="sr-only">Owner</span><select className="select" value={owner} onChange={ev=>setOwner(ev.target.value)}>
              <option value="all">All owners</option>{members.map(person=><option key={person.user_id} value={person.user_id}>{person.name||'Owner unavailable'}</option>)}<option value="">Unassigned</option>
            </select></label>
            <div className="seg sm" role="group" aria-label="Calendar state">{[['active','Active'],['done','Completed / Closed'],['all','All']].map(([id,label])=>
              <button type="button" key={id} aria-pressed={scope===id} onClick={()=>pickScope(id)}>{label}</button>)}</div>
          </div>
        </div>
        <div className="toolbar filters">{Object.entries(KINDS).map(([id,label])=>
          <button type="button" className="tchip type-chip" key={id} aria-pressed={types.includes(id)} onClick={()=>setTypes(types.includes(id)?types.filter(x=>x!==id):[...types,id])}>
            <i className={`g g-${id}`} aria-hidden="true"/>{label}<span className="num">{scopeItems.filter(item=>calendarKind(item)===id).length}</span>
          </button>)}</div>
        {(loading||busy)&&<p role="status">{busy?'Saving…':'Loading…'}</p>}{errorNode}
        {summaryError&&<p role="alert">Calendar summary: {summaryError}</p>}{memberError&&<p role="alert">{memberError}</p>}{recoveryNode}
        {view==='day'?<div className={`dayv${dragOverDay===ymd(anchor)?' drop':''}`} data-testid={`cal-day-${ymd(anchor)}`} {...dropProps(ymd(anchor))}>
          {shown(ymd(anchor)).map(item=>event(item,'drow'))}
          {!shown(ymd(anchor)).length&&!loading&&!error&&<p>Nothing scheduled on {longDate(ymd(anchor))}.</p>}
        </div>:<div className="scroll-x cal-body" role="region" aria-label="Calendar dates" tabIndex="0"><div className={`cal ${view}`}>
          <div className="cal-head">{['MON','TUE','WED','THU','FRI','SAT','SUN'].map(day=><span key={day}>{day}</span>)}</div>
          {Array.from({length:gridDays.length/7},(_,week)=><div className="cal-grid wk" key={week}>
            {gridDays.slice(week*7,week*7+7).map(day=>{
              const date=ymd(day),items=shown(date);
              const expandedDay=nativeBehavior&&view==='month'&&expanded[date];
              const count=expandedDay?items.length:cellLimit;
              const classes=['cal-cell',day.getMonth()!==anchor.getMonth()&&'muted',date===today&&'today',date===activeDay&&'sel',dragOverDay===date&&'drop'].filter(Boolean).join(' ');
              return <div key={date} className={classes} data-testid={`cal-day-${date}`} {...dropProps(date)}>
                <button type="button" className="cal-day" aria-label={`${longDate(date)}, ${items.length} items`} onClick={()=>selectDay(date)}>{day.getDate()}</button>
                {items.slice(0,count).map(item=>event(item,'ev'))}
                {items.length>cellLimit&&<button type="button" className="ev-more more"
                  aria-label={`${expandedDay?'Show fewer':'Show all '+items.length+' items'} on ${date}`}
                  onClick={()=>nativeBehavior&&view==='month'?setExpanded(current=>({...current,[date]:!current[date]})):selectDay(date)}>
                  {expandedDay?'Show fewer':`+${items.length-count} more`}
                </button>}
              </div>;
            })}
          </div>)}
        </div></div>}
        <footer className="note">Overdue items carry a red edge. Select an item to open it; select a day to list its items below.</footer>
      </section>
      <section className="panel pcard agenda native-calendar-agenda" aria-labelledby="bdcal-agenda" ref={agendaRef}>
        <div className="panel-head card-head">
          <div><h2 className="panel-title" id="bdcal-agenda">{activeDay?longDate(activeDay):'Scheduled items'}</h2>
            <p className="panel-desc">{activeDay?`${displayedAgenda.length} items on this day`:`${period.label} · includes current overdue items`}</p></div>
          {activeDay?<button className="link-btn" type="button" onClick={()=>{setSelectedDate(null);setView('month');}}>Show the whole month →</button>
            :<span className="panel-count">{displayedAgenda.length} {displayedAgenda.length===1?'item':'items'}</span>}
        </div>
        <div className="reg-kstrip native-summary" data-native-summary><div className="kstrip" role="group" aria-label="Calendar summary">
          {summaries.map(([id,label,items,sub])=><button type="button" className="kchip" key={id} aria-pressed={highlight===id} disabled={summaryUnavailable(id)}
            onClick={()=>{setHighlight(highlight===id?'all':id);if(id==='done'&&scope==='active'||['overdue','week'].includes(id)&&scope==='done')setScope('all');}}>
            <strong className={'kvalue num'+(id==='overdue'&&items.length?' bad':'')}>{summaryUnavailable(id)?'—':items.length}</strong>
            <span className="klabel kl">{label}</span><small className={id==='overdue'&&items.length&&!summaryUnavailable(id)?'kc bad':'kc'}>{summaryUnavailable(id)?summaryMessage(id):sub}</small>
          </button>)}
        </div></div>
        <div className="ag-body">{displayGroups.map(([label,items])=>!!items.length&&<section className="ag-sec" key={label}>
          {label&&<h3 className={`ag-group${label==='Overdue'?' bad':''}`}>{label} · {items.length}</h3>}
          {(label!=='Completed'||showDone||highlight==='done'||scope==='done')&&items.map(item=>
            <button type="button" className={`ag-row${item.historical?' done':item.date<today?' late':''}`} key={item.key} data-testid={`cal-attn-${item.key}`}
              {...tipProps(item)} aria-disabled={busy||loading||!!error} onClick={ev=>openSchedule(item,ev)}>
              <span className="ag-date num">{short(item.date)}</span><span aria-hidden="true" className={`ag-bar g-${calendarKind(item)}`}/>
              <span className="ag-main"><b>{item.title}</b><span className="ag-meta">{calendarType(item)} · {calendarOwner(item,members)} · <span className={item.date<today&&!item.historical?'late':''}>{state(item)}</span></span>
                {item.represented&&<span className="ag-link"><Link2 className="ic-s" aria-hidden="true"/>Tracked by an action item · not counted</span>}</span><ChevronRight size={16} aria-hidden="true"/>
            </button>)}
          {label==='Completed'&&highlight!=='done'&&scope!=='done'&&<button type="button" className="link ag-more" aria-expanded={showDone} onClick={()=>setShowDone(!showDone)}>{showDone?'Hide completed':`Show ${items.length} completed items`}</button>}
        </section>)}
        {!displayedAgenda.length&&!loading&&!error&&<p className="ag-empty">{activeDay?'Nothing scheduled on this day.':'Nothing matches these filters in this period.'}</p>}</div>
      </section>
    </div>
    {tip&&<div id="bdcal-tip" role="tooltip" className="tip" style={{left:tip.left,top:tip.top}}>
      <span className="tt">{glyph(tip.item)}{calendarType(tip.item)}</span><span className="tl">{tip.item.title}</span><span>{short(tip.item.date)} · {state(tip.item)}</span>
      <span>Owner: {calendarOwner(tip.item,members)}</span>{tip.item.represented&&<span className="tn">Remediation is tracked by its linked action item.</span>}
    </div>}{drawerNode}
  </BrawndoSurface>;
}
