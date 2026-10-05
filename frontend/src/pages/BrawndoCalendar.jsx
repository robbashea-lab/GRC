import {ChevronLeft,ChevronRight} from 'lucide-react';
import {BrawndoSurface,BrawndoPageHeader,BrawndoChips} from '@/components/BrawndoPage';
import {calendarStatus,calendarType,stepCalendarDate} from '@/lib/calendarView';
import './BrawndoCalendar.css';

const TYPE_LABEL={review:'Review',finding:'Finding',task:'Action item',vendor_assurance:'Security Assurance Due',vendor_contract_renewal:'Contract Renewal',vendor_contract_notice:'Contract Notice Deadline'};
export function calendarEntries(data){
  return ['reviews','findings','tasks','vendor_dates'].flatMap(kind=>Object.entries(data?.[kind]||{}).flatMap(([date,items])=>items.map(item=>({...item,date}))));
}
const byDate=(a,b)=>a.date.localeCompare(b.date)||String(a.title).localeCompare(String(b.title))||a.key.localeCompare(b.key);
export function scheduledItems(entries,today,start,end){
  const overdue=entries.filter(e=>!e.historical&&e.date<today).sort(byDate);
  const scheduled=entries.filter(e=>e.date>=start&&e.date<=end&&(e.historical||e.date>=today)).sort(byDate);
  return {overdue,scheduled};
}
const monthLabel=iso=>new Date(iso+'T12:00:00').toLocaleDateString(undefined,{month:'short'});
function ScheduledRow({item,late,onOpen}){
  return <li><button type="button" className="bcal-row" onClick={event=>onOpen(item,event)} data-testid={`cal-attn-${item.key}`}
    aria-label={`${TYPE_LABEL[item.kind]}: ${item.title} — ${late?'Overdue':calendarStatus(item)} — ${item.date}`}>
    <span className={`bcal-date${late?' is-late':''}`}><span>{monthLabel(item.date)}</span><strong>{+item.date.slice(8,10)}</strong></span>
    <span className="bcal-row-body"><span className="bcal-row-title">{item.title}</span>
      <span className={`bcal-meta${late?' is-late':''}`}><i className={`bcal-dot k-${item.kind}`} aria-hidden="true"/>{TYPE_LABEL[item.kind]} · {late?'Overdue':calendarStatus(item)}</span></span>
  </button></li>;
}
export default function BrawndoCalendarView({clientName,anchor,setAnchor,view,setView,period,days,itemsForDay,today,entries,loading,error,errorNode,busy,
  dragging,dragOverDay,setDragOverDay,setDragging,expanded,setExpanded,onDragStart,onDrop,openSchedule,ymd,drawerNode,recoveryNode}){
  const {overdue,scheduled}=scheduledItems(entries,today,period.start,period.end);
  const total=days.reduce((n,d)=>n+itemsForDay(ymd(d)).length,0);
  return <BrawndoSurface className="bcal">
    <BrawndoPageHeader eyebrow={clientName} title="Calendar"/>
    <div className="bcal-layout">
      <section className="bcal-card" aria-label={view[0].toUpperCase()+view.slice(1)}>
        <div className="bcal-toolbar">
          <div className="bcal-nav">
            <button type="button" className="bpage-btn bcal-icon" aria-label={`Previous ${view}`} data-testid="cal-prev" onClick={()=>setAnchor(stepCalendarDate(anchor,view,-1))}><ChevronLeft size={16} aria-hidden="true"/></button>
            <button type="button" className="bpage-btn" data-testid="cal-today" onClick={()=>setAnchor(new Date())}>Today</button>
            <button type="button" className="bpage-btn bcal-icon" aria-label={`Next ${view}`} data-testid="cal-next" onClick={()=>setAnchor(stepCalendarDate(anchor,view,1))}><ChevronRight size={16} aria-hidden="true"/></button>
            <h2 className="bcal-month" data-testid="cal-month-label">{period.label}</h2>
          </div>
          <BrawndoChips label="Calendar view" chips={['day','week','month'].map(id=>({id,label:id[0].toUpperCase()+id.slice(1),pressed:view===id,onClick:()=>setView(id)}))}/>
          <ul className="bcal-legend" aria-label="Legend">{Object.keys(TYPE_LABEL).map(k=><li key={k}><i className={`bcal-dot k-${k}`} aria-hidden="true"/>{TYPE_LABEL[k]}</li>)}<li><i className="bcal-rail" aria-hidden="true"/>Overdue</li></ul>
        </div>
        {(busy||loading)&&<p className="bcal-status" role="status">{busy?'Saving…':'Loading Calendar…'}</p>}
        {errorNode}{recoveryNode}
        {!loading&&!error&&!total&&<p role="status" className="bcal-note">No dated items for this period.</p>}
        <div className="bcal-scroll"><div className={`bcal-grid view-${view}`}>
          {(view==='day'?[anchor.toLocaleDateString(undefined,{weekday:'long'})]:['Mon','Tue','Wed','Thu','Fri','Sat','Sun']).map(w=><div key={w} className="bcal-wd">{w}</div>)}
          {days.map(day=>{
            const date=ymd(day),items=itemsForDay(date),inMonth=day.getMonth()===anchor.getMonth(),visible=expanded[date]||view!=='month'?items:items.slice(0,3);
            return <div key={date} data-testid={`cal-day-${date}`} className={`bcal-day${inMonth?'':' is-out'}${dragOverDay===date?' is-over':''}`}
              onDragOver={e=>{if(dragging&&!busy){e.preventDefault();setDragOverDay(date);}}} onDragLeave={()=>setDragOverDay('')} onDrop={e=>onDrop(e,date)}>
              <div className="bcal-dayhead"><span className={date===today?'bcal-today':''}>{day.getDate()}{date===today&&<span className="sr-only"> (today)</span>}</span>{!!items.length&&<span className="bcal-n">{items.length}</span>}</div>
              <ul>{visible.map(item=>{const late=!item.historical&&date<today;return <li key={item.key}>
                <button type="button" draggable={item.can_reschedule&&!busy&&!loading&&!error} onDragStart={e=>onDragStart(e,item)} onDragEnd={()=>{setDragging(null);setDragOverDay('');}} onClick={event=>openSchedule(item,event)} data-testid={`cal-item-${item.key}`}
                  aria-label={`${calendarType(item)}: ${item.title} — ${late?'Overdue':calendarStatus(item)} — ${date}${item.period?' · '+item.period:''}`}
                  className={`bcal-ev k-${item.kind}${late?' is-late':''}${item.historical?' is-hist':''}${item.can_reschedule&&!busy?' is-drag':''}`}>
                  <span className="bcal-ev-title">{item.title}</span>
                  <span className={`bcal-meta${late?' is-late':''}`}><i className={`bcal-dot k-${item.kind}`} aria-hidden="true"/>{TYPE_LABEL[item.kind]} · {late?'Overdue':calendarStatus(item)}</span>
                </button></li>;})}</ul>
              {view==='month'&&items.length>3&&<button type="button" className="bcal-more" aria-label={`${expanded[date]?'Show fewer':'Show all '+items.length+' items'} on ${date}`} onClick={()=>setExpanded(v=>({...v,[date]:!v[date]}))}>{expanded[date]?'Show fewer':`+${items.length-3} more`}</button>}
            </div>;
          })}
        </div></div>
      </section>
      <aside className="bcal-card bcal-panel" aria-labelledby="bcal-attn-h">
        <h2 id="bcal-attn-h">Scheduled items</h2><p className="bcal-sub">{period.label}</p>
        {!entries.length&&loading?<p className="bcal-note" role="status">Loading…</p>:!error&&<>
          {!overdue.length&&!scheduled.length&&<p className="bcal-note">No scheduled items.</p>}
          {!!overdue.length&&<><h3>Overdue</h3><ul className="bcal-list" aria-label="Overdue">{overdue.map(i=><ScheduledRow key={i.key} item={i} late onOpen={openSchedule}/>)}</ul></>}
          {!!scheduled.length&&<ul className="bcal-list" aria-label="Selected period">{scheduled.map(i=><ScheduledRow key={i.key} item={i} onOpen={openSchedule}/>)}</ul>}
        </>}
      </aside>
    </div>{drawerNode}
  </BrawndoSurface>;
}
