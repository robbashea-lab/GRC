import {ChevronLeft,ChevronRight} from 'lucide-react';
import {BrawndoSurface,BrawndoPageHeader,BrawndoTiles,BrawndoChips,plural,shortDate,daysUntil} from '@/components/BrawndoPage';
import {CALENDAR_SCOPES,calendarStatus,calendarType} from '@/lib/calendarView';
import './BrawndoCalendar.css';

const WORDS=['zero','one','two','three','four','five','six','seven','eight','nine','ten'];
const TYPE_LABEL={review:'Review',finding:'Finding',task:'Action item',vendor_assurance:'Security Assurance Due',vendor_contract_renewal:'Contract Renewal',vendor_contract_notice:'Contract Notice Deadline'};
// Flatten calendar buckets ({reviews:{day:[items]},...}) into [{...item,date}].
export function calendarEntries(data){
  return ['reviews','findings','tasks','vendor_dates'].flatMap(kind=>Object.entries(data?.[kind]||{}).flatMap(([date,items])=>items.map(item=>({...item,date}))));
}
const byDate=(a,b)=>a.date<b.date?-1:a.date>b.date?1:String(a.title).localeCompare(String(b.title));
// Needs attention: active overdue work items (oldest first), then active work due within the next 30 days.
// Work items count each piece of remediation once: a Finding with an active Action is represented by it.
export function needsAttention(entries,today){
  const active=entries.filter(e=>!e.historical&&!(e.kind==='finding'&&e.represented));
  const overdue=active.filter(e=>daysUntil(e.date,today)<0).sort(byDate);
  const upcoming=active.filter(e=>{const d=daysUntil(e.date,today);return d>=0&&d<=30;}).sort(byDate);
  return {overdue,upcoming};
}
// Tiles: attention = active items around today; month = items in the displayed grid.
export function calendarTiles({attention,monthEntries,anchor,today}){
  const {overdue,upcoming}=needsAttention(attention,today);
  const soon=upcoming.filter(e=>daysUntil(e.date,today)>0),dueToday=upcoming.filter(e=>daysUntil(e.date,today)===0);
  const inMonth=monthEntries.filter(e=>!e.historical&&!(e.kind==='finding'&&e.represented)&&+e.date.slice(0,4)===anchor.getFullYear()&&+e.date.slice(5,7)===anchor.getMonth()+1);
  const monthOverdue=inMonth.filter(e=>daysUntil(e.date,today)<0).length,n=inMonth.length;
  const oldest=overdue[0];
  return [
    {id:'overdue',label:'Overdue',count:overdue.length,tone:'critical',context:oldest?`Oldest: ${shortDate(oldest.date)} · ${plural(-daysUntil(oldest.date,today),'day')} late`:'Nothing overdue'},
    {id:'soon',label:'Due in 30 days',count:soon.length,tone:'attention',context:soon[0]?`${soon[0].title}, ${shortDate(soon[0].date)}`:'Nothing due in the next 30 days'},
    {id:'month',label:'This month',count:n,tone:'neutral',context:!n?'Nothing due this month':monthOverdue===n?(n===1?'It is already overdue':`All ${WORDS[n]||n} are already overdue`):`${monthOverdue} overdue · ${n-monthOverdue} upcoming`},
    {id:'today',label:'Due today',count:dueToday.length,tone:'neutral',context:dueToday.length?dueToday.map(e=>e.title).join(', '):'Nothing due today'},
  ];
}

const monthLabel=iso=>new Date(iso+'T12:00:00').toLocaleDateString(undefined,{month:'short'});
function AttentionRow({item,late,onOpen}){
  return <li><button type="button" className="bcal-row" onClick={()=>onOpen(item)} data-testid={`cal-attn-${item.key}`}
    aria-label={`${TYPE_LABEL[item.kind]}: ${item.title} — ${late?'Overdue':calendarStatus(item)} — ${item.date}`}>
    <span className={`bcal-date${late?' is-late':''}`}><span>{monthLabel(item.date)}</span><strong>{+item.date.slice(8,10)}</strong></span>
    <span className="bcal-row-body"><span className="bcal-row-title">{item.title}</span>
      <span className={`bcal-meta${late?' is-late':''}`}><i className={`bcal-dot k-${item.kind}`} aria-hidden="true"/>{TYPE_LABEL[item.kind]} · {late?'Overdue':calendarStatus(item)}</span></span>
  </button></li>;
}

export default function BrawndoCalendarView({clientName,anchor,setAnchor,scope,setScope,days,itemsForDay,today,attention,attentionLoading,attentionFailed,loading,error,errorNode,total,busy,writable,
  dragging,dragOverDay,setDragOverDay,setDragging,expanded,setExpanded,onDragStart,onDrop,openRecord,ymd,drawerNode}){
  const monthEntries=days.flatMap(d=>itemsForDay(ymd(d)).map(item=>({...item,date:ymd(d)})));
  const tiles=calendarTiles({attention,monthEntries,anchor,today:new Date(today+'T12:00:00')});
  const {overdue,upcoming}=needsAttention(attention,new Date(today+'T12:00:00'));
  return <BrawndoSurface className="bcal">
    <BrawndoPageHeader eyebrow={`${clientName} · Due dates`} title="Calendar"/>
    <BrawndoTiles tiles={tiles} label="Due date summary" loading={attentionLoading}/>
    <div className="bcal-layout">
      <section className="bcal-card" aria-label="Month">
        <div className="bcal-toolbar">
          <div className="bcal-nav">
            <button type="button" className="bpage-btn bcal-icon" aria-label="Previous month" data-testid="cal-prev" onClick={()=>setAnchor(new Date(anchor.getFullYear(),anchor.getMonth()-1,1))}><ChevronLeft size={16} aria-hidden="true"/></button>
            <button type="button" className="bpage-btn" data-testid="cal-today" onClick={()=>setAnchor(new Date())}>Today</button>
            <button type="button" className="bpage-btn bcal-icon" aria-label="Next month" data-testid="cal-next" onClick={()=>setAnchor(new Date(anchor.getFullYear(),anchor.getMonth()+1,1))}><ChevronRight size={16} aria-hidden="true"/></button>
            <h2 className="bcal-month" data-testid="cal-month-label">{anchor.toLocaleString(undefined,{month:'long',year:'numeric'})}</h2>
          </div>
          <BrawndoChips label="Calendar scope" chips={CALENDAR_SCOPES.map(([id,label])=>({id,label,pressed:scope===id,onClick:()=>setScope(id)}))}/>
          <ul className="bcal-legend" aria-label="Legend">{['review','finding','task','vendor_assurance','vendor_contract_renewal','vendor_contract_notice'].map(k=><li key={k}><i className={`bcal-dot k-${k}`} aria-hidden="true"/>{TYPE_LABEL[k]}</li>)}<li><i className="bcal-rail" aria-hidden="true"/>Overdue</li></ul>
        </div>
        <p className="bcal-status" role="status">{busy?'Saving…':loading?'Loading Calendar…':writable?'Drag or open an active item to change its date':'Read-only'}</p>
        {scope!=='active'&&<p className="bcal-note">Historical items stay on their due dates; includes cancelled work and accepted Findings.</p>}
        {errorNode}
        {!loading&&!error&&!total&&<p role="status" className="bcal-note">{scope==='active'?'No active items scheduled for this period.':scope==='history'?'No completed or closed items for this period.':'No dated items for this period.'}</p>}
        <div className="bcal-scroll"><div className="bcal-grid">
          {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(w=><div key={w} className="bcal-wd">{w}</div>)}
          {days.map(day=>{
            const date=ymd(day),items=itemsForDay(date),inMonth=day.getMonth()===anchor.getMonth();
            return <div key={date} data-testid={`cal-day-${date}`} className={`bcal-day${inMonth?'':' is-out'}${dragOverDay===date?' is-over':''}`}
              onDragOver={e=>{if(dragging&&!busy){e.preventDefault();setDragOverDay(date);}}} onDragLeave={()=>setDragOverDay('')} onDrop={e=>onDrop(e,date)}>
              <div className="bcal-dayhead"><span className={date===today?'bcal-today':''}>{day.getDate()}{date===today&&<span className="sr-only"> (today)</span>}</span>{!!items.length&&<span className="bcal-n">{items.length}</span>}</div>
              <ul>{items.slice(0,expanded[date]?items.length:3).map(item=>{const late=!item.historical&&date<today;return <li key={item.key}>
                <button type="button" draggable={item.can_reschedule&&!busy} onDragStart={e=>onDragStart(e,item)} onDragEnd={()=>{setDragging(null);setDragOverDay('');}} onClick={()=>openRecord(item)} data-testid={`cal-item-${item.key}`}
                  aria-label={`${calendarType(item)}: ${item.title} — ${calendarStatus(item)} — ${date}${item.period?' · '+item.period:''}`} title={`${item.title} · ${calendarStatus(item)}${item.can_reschedule?' · Drag or open to reschedule':''}`}
                  className={`bcal-ev k-${item.kind}${late?' is-late':''}${item.historical?' is-hist':''}${item.can_reschedule&&!busy?' is-drag':''}`}>
                  <span className="bcal-ev-title">{item.title}</span>
                  <span className={`bcal-meta${late?' is-late':''}`}><i className={`bcal-dot k-${item.kind}`} aria-hidden="true"/>{TYPE_LABEL[item.kind]} · {late?'Overdue':calendarStatus(item)}</span>
                </button></li>;})}</ul>
              {items.length>3&&<button type="button" className="bcal-more" aria-label={`${expanded[date]?'Show fewer':'Show all '+items.length+' items'} on ${date}`} onClick={()=>setExpanded(v=>({...v,[date]:!v[date]}))}>{expanded[date]?'Show fewer':`+${items.length-3} more`}</button>}
            </div>;
          })}
        </div></div>
      </section>
      <aside className="bcal-card bcal-panel" aria-labelledby="bcal-attn-h">
        <h2 id="bcal-attn-h">Needs attention</h2>
        <p className="bcal-sub">Overdue first, then next 30 days</p>
        {attentionFailed?<p className="bcal-note" role="alert">Due-date summary could not be loaded. Reload the page to try again.</p>:attentionLoading?<p className="bcal-note" role="status">Loading…</p>:<>
          {!overdue.length&&!upcoming.length&&<p className="bcal-note">Nothing overdue or due in the next 30 days.</p>}
          {!!overdue.length&&<ul className="bcal-list" aria-label="Overdue">{overdue.map(i=><AttentionRow key={i.key} item={i} late onOpen={openRecord}/>)}</ul>}
          {!!upcoming.length&&<><h3>Coming up</h3><ul className="bcal-list" aria-label="Coming up">{upcoming.map(i=><AttentionRow key={i.key} item={i} onOpen={openRecord}/>)}</ul></>}
        </>}
      </aside>
    </div>
    {drawerNode}
  </BrawndoSurface>;
}
