import {useEffect,useMemo,useRef,useState} from 'react';
import {ChevronLeft,ChevronRight,CalendarDays} from 'lucide-react';
import {useOrg} from '@/context/OrgContext';
import {useAuth} from '@/context/AuthContext';
import api,{formatError} from '@/lib/api';
import {Button} from '@/components/ui/button';
import PageHeader from '@/components/PageHeader';
import RecordDrawer from '@/components/RecordDrawer';
import {SCHEMAS} from '@/lib/schemas';
import {occurrenceId} from '@/lib/reviewOccurrences';
import {CALENDAR_SCOPES,calendarStatus,calendarType,calendarSelection,canMoveCalendar,rescheduledDate} from '@/lib/calendarView';
import {toast} from 'sonner';

const KIND_COLOR={review:'bg-semantic-info-bg text-semantic-info border-semantic-info-border',finding:'bg-semantic-moderate-bg text-semantic-moderate-text border-semantic-moderate-border',task:'bg-surface-card text-ink-primary border-line-strong'};
// Type is encoded by color; red is reserved for overdue work.
const LEGEND=[['review','Review'],['finding','Finding'],['task','Action Item']];
const overdue=(item,date)=>!item.historical&&date<new Date().toISOString().slice(0,10);
const emptyBuckets=()=>({reviews:{},findings:{},tasks:{}});
function monthGrid(anchor) {
  const first=new Date(anchor.getFullYear(),anchor.getMonth(),1);
  const start=new Date(first);start.setDate(1-((first.getDay()+6)%7));
  return Array.from({length:42},(_,i)=>new Date(start.getFullYear(),start.getMonth(),start.getDate()+i));
}
const ymd=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

export default function Calendar() {
  const {currentClient,currentClientId}=useOrg(),{user}=useAuth();
  const [anchor,setAnchor]=useState(()=>new Date()),[scope,setScope]=useState('active'),[revision,setRevision]=useState(0);
  const [result,setResult]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[drawer,setDrawer]=useState(null);
  const [dragging,setDragging]=useState(null),[dragOverDay,setDragOverDay]=useState(''),[expanded,setExpanded]=useState({});
  const days=useMemo(()=>monthGrid(anchor),[anchor]);
  const start=ymd(days[0]),end=ymd(days[41]),requestKey=`${currentClientId}:${start}:${scope}:${revision}`;
  const activeRequest=useRef(requestKey);activeRequest.current=requestKey;
  const currentClientRef=useRef(currentClientId);currentClientRef.current=currentClientId;
  const writable=['super_admin','platform_admin','client_contributor'].includes(user?.role);
  const reload=()=>setRevision(n=>n+1);
  useEffect(()=>{setDrawer(null);setScope('active');setDragging(null);},[currentClientId]);
  useEffect(()=>{
    const controller=new AbortController();setError('');setExpanded({});setDragging(null);setDragOverDay('');
    if(!currentClientId)return;
    api.get('/calendar',{params:{client_id:currentClientId,start,end,scope},signal:controller.signal}).then(({data})=>{
      if(controller.signal.aborted)return;
      if(['reviews','findings','tasks'].some(kind=>!data[kind]||Object.values(data[kind]).flat().some(item=>item.client_id!==currentClientId)))throw new Error('Calendar records do not match the selected client.');
      setResult({key:requestKey,data});
    }).catch(e=>{if(!controller.signal.aborted)setError(formatError(e));});
    return ()=>controller.abort();
  },[currentClientId,start,end,scope,requestKey]);
  const loading=!!currentClientId&&result?.key!==requestKey&&!error;
  const data=result?.key===requestKey?result.data:emptyBuckets();
  const itemsForDay=day=>[...(data.reviews[day]||[]),...(data.findings[day]||[]),...(data.tasks[day]||[])];
  const total=Object.values(data).reduce((n,bucket)=>n+Object.values(bucket).reduce((sum,items)=>sum+items.length,0),0);

  async function openRecord(item) {
    const key=requestKey;
    try {
      const kind=item.kind+'s';
      const {data:record}=await api.get(`/${kind}/${item.id}`);
      if(activeRequest.current!==key)return;
      setDrawer({key:item.key,kind,record,initialValues:calendarSelection(item,record,currentClientId)});
    }catch(e){if(activeRequest.current===key)toast.error(formatError(e));}
  }
  function onDragStart(e,item) {
    if(busy||!item.can_reschedule){e.preventDefault();return;}
    e.dataTransfer.setData('application/json',JSON.stringify({key:item.key}));
    e.dataTransfer.effectAllowed='move';setDragging(item.key);
  }
  async function onDrop(e,target) {
    e.preventDefault();setDragging(null);setDragOverDay('');
    if(busy||!writable)return;
    let payload;try{payload=JSON.parse(e.dataTransfer.getData('application/json'));}catch{return;}
    const original=Object.values(data).flatMap(bucket=>Object.values(bucket).flat()).find(item=>item.key===payload?.key);
    if(!original?.can_reschedule||original.historical)return;
    const cid=currentClientId,key=requestKey;setBusy(true);
    try {
      // Re-read before writing so a terminal or advanced occurrence is not rescheduled from a stale chip.
      const {data:record}=await api.get(`/${original.kind}s/${original.id}`);
      if(activeRequest.current!==key)return;
      if(record.client_id!==cid||!canMoveCalendar(original.kind,record,user)||original.kind==='review'&&original.occurrence_id!==occurrenceId(record))throw new Error('This item is no longer reschedulable. Refresh the Calendar.');
      await api.patch(`/${original.kind}s/${original.id}`,{due_date:rescheduledDate(record.due_date,target),expected_updated_at:record.updated_at??null,...(original.kind==='review'?{expected_occurrence_id:original.occurrence_id}:{})});
      if(currentClientRef.current===cid)toast.success(`Rescheduled to ${target}`);
    }catch(e){if(currentClientRef.current===cid)toast.error(formatError(e));}
    finally{setBusy(false);if(currentClientRef.current===cid)reload();}
  }
  return <div>
    <PageHeader title="Review Calendar" subtitle={`${currentClient?.name||''} · Due-dated Reviews, Findings and Action Items. ${writable?'Eligible active items can be dragged or opened to edit their dates.':'Read-only.'}`}
      action={<div className="flex items-center gap-2">
        <Button variant="outline" size="sm" aria-label="Previous month" data-testid="cal-prev" onClick={()=>setAnchor(new Date(anchor.getFullYear(),anchor.getMonth()-1,1))}><ChevronLeft className="h-4 w-4"/></Button>
        <Button variant="outline" size="sm" data-testid="cal-today" onClick={()=>setAnchor(new Date())}><CalendarDays className="h-4 w-4 mr-1"/>Today</Button>
        <Button variant="outline" size="sm" aria-label="Next month" data-testid="cal-next" onClick={()=>setAnchor(new Date(anchor.getFullYear(),anchor.getMonth()+1,1))}><ChevronRight className="h-4 w-4"/></Button>
      </div>}/>
    <div className="page-content space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-lg font-heading font-semibold" data-testid="cal-month-label">{anchor.toLocaleString(undefined,{month:'long',year:'numeric'})}</div>
        <div role="group" aria-label="Calendar scope" className="flex flex-wrap gap-1">{CALENDAR_SCOPES.map(([value,label])=><Button key={value} size="sm" variant={scope===value?'secondary':'ghost'} aria-pressed={scope===value} onClick={()=>setScope(value)}>{label}</Button>)}</div>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs text-ink-secondary">
        <ul className="flex flex-wrap items-center gap-3" aria-label="Legend">{LEGEND.map(([kind,label])=><li key={kind} className="inline-flex items-center gap-1.5"><span aria-hidden="true" className={`inline-block h-3 w-3 rounded-sm border ${KIND_COLOR[kind]}`}/>{label}</li>)}<li className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="inline-block h-3 w-1 rounded-sm bg-semantic-critical"/>Overdue</li></ul>
        {scope!=='active'&&<span>Historical items stay on their due dates; includes cancelled work and accepted Findings.</span>}
        {busy&&<span role="status">Saving…</span>}
      </div>
      {loading&&<p role="status" className="text-sm">Loading Calendar…</p>}
      {error&&<div role="alert" className="text-sm">{error} <Button variant="outline" size="sm" onClick={reload}>Retry Calendar</Button></div>}
      {!currentClientId&&<p className="text-sm">Select a client to view its Calendar.</p>}
      {currentClientId&&!loading&&!error&&!total&&<p role="status" className="text-sm">{scope==='active'?'No active items scheduled for this period.':scope==='history'?'No completed or closed items for this period.':'No dated items for this period.'}</p>}
      <div className="bg-surface-card border border-line rounded-lg overflow-x-auto">
        <div className="min-w-[600px]">
          <div className="grid grid-cols-7 border-b border-line bg-surface-subtle">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(w=><div key={w} className="px-2 py-2 text-xs font-mono uppercase tracking-widest text-ink-muted">{w}</div>)}</div>
          <div className="grid grid-cols-7 grid-rows-6">{days.map((day,i)=>{
            const date=ymd(day),items=itemsForDay(date),inMonth=day.getMonth()===anchor.getMonth();
            return <div key={date} data-testid={`cal-day-${date}`} onDragOver={e=>{if(dragging&&!busy){e.preventDefault();setDragOverDay(date);}}} onDragLeave={()=>setDragOverDay('')} onDrop={e=>onDrop(e,date)}
              className={`min-w-0 min-h-[110px] border-b border-r border-line p-2 text-xs ${inMonth?'bg-surface-card':'bg-surface-subtle'} ${dragOverDay===date?'outline outline-2 outline-focus outline-offset-[-2px]':''} ${(i+1)%7===0?'border-r-0':''}`}>
              <div className="flex items-center justify-between mb-1 text-ink-secondary"><span className={`inline-flex items-center justify-center h-5 min-w-5 px-1 rounded font-mono ${date===ymd(new Date())?'bg-primary text-primary-foreground':''}`}>{day.getDate()}</span>{!!items.length&&<span className="font-mono">{items.length}</span>}</div>
              <ul className="space-y-1">{items.slice(0,expanded[date]?items.length:3).map(item=><li key={item.key}>
                <button type="button" draggable={item.can_reschedule&&!busy} onDragStart={e=>onDragStart(e,item)} onDragEnd={()=>{setDragging(null);setDragOverDay('');}} onClick={()=>openRecord(item)} data-testid={`cal-item-${item.key}`}
                  aria-label={`${calendarType(item)}: ${item.title} — ${calendarStatus(item)} — ${date}${item.period?' · '+item.period:''}`} title={`${item.title} · ${calendarStatus(item)}${item.can_reschedule?' · Drag or open to reschedule':''}`}
                  className={`w-full min-w-0 text-left rounded border px-1.5 py-1 hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring ${item.historical?'bg-surface-subtle text-ink-secondary border-line':KIND_COLOR[item.kind]} ${overdue(item,date)?'border-l-4 border-l-semantic-critical':''} ${item.can_reschedule&&!busy?'cursor-grab active:cursor-grabbing':''}`}>
                  <span className="block truncate font-medium">{item.title}</span><span className="block leading-snug">{calendarType(item)} · {overdue(item,date)?<strong className="text-semantic-critical">Overdue</strong>:calendarStatus(item)}</span>{item.kind==='review'&&<span className="block truncate">{item.period}</span>}
                </button>
              </li>)}</ul>
              {items.length>3&&<button type="button" className="text-xs text-link underline mt-1" aria-label={`${expanded[date]?'Show fewer':'Show all '+items.length+' items'} on ${date}`} onClick={()=>setExpanded(value=>({...value,[date]:!value[date]}))}>{expanded[date]?'Show fewer':`+${items.length-3} more`}</button>}
            </div>;
          })}</div>
        </div>
      </div>
    </div>
    {drawer&&drawer.record.client_id===currentClientId&&<RecordDrawer key={drawer.key} open onOpenChange={open=>{if(!open){setDrawer(null);reload();}}} kind={drawer.kind} record={drawer.record} initialValues={drawer.initialValues} schema={SCHEMAS[drawer.kind].fields} clientId={currentClientId} onSaved={reload}/>}
  </div>;
}
