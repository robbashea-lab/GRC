import {useEffect,useMemo,useRef,useState} from 'react';
import RegisterLoadError from '@/components/RegisterLoadError';
import {useOrg} from '@/context/OrgContext';
import {useAuth} from '@/context/AuthContext';
import api,{formatError} from '@/lib/api';
import RecordDrawer from '@/components/RecordDrawer';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {SCHEMAS} from '@/lib/schemas';
import {occurrenceId} from '@/lib/reviewOccurrences';
import {calendarPeriod,localCalendarDate,calendarSelection,canMoveCalendar,rescheduledDate,calendarType,calendarStatus} from '@/lib/calendarView';
import {useCreateIntent} from '@/lib/createIntent';
import {toast} from 'sonner';
import BrawndoCalendarView,{calendarEntries} from './BrawndoCalendar';

const emptyBuckets=()=>({reviews:{},findings:{},tasks:{}});
export default function Calendar() {
  const {currentClientId,currentClient}=useOrg(),{user}=useAuth();
  const actorKey=`${user?.user_id||''}:${user?.role||''}:${user?.workspace_mode||''}`;
  const [anchor,setAnchor]=useState(()=>new Date()),[view,setView]=useState('month'),[revision,setRevision]=useState(0);
  const [result,setResult]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[drawer,setDrawer]=useState(null),[popup,setPopup]=useState(null),[saveError,setSaveError]=useState('');
  const [dragging,setDragging]=useState(null),[dragOverDay,setDragOverDay]=useState(''),[expanded,setExpanded]=useState({});
  const period=useMemo(()=>calendarPeriod(anchor,view),[anchor,view]),{days}=period;
  const start=localCalendarDate(days[0]),end=localCalendarDate(days[days.length-1]),today=localCalendarDate(new Date());
  const periodKey=`${actorKey}:${currentClientId}:${start}:${end}`,requestKey=`${periodKey}:${revision}`;
  const activeRequest=useRef(requestKey);activeRequest.current=requestKey;
  const actorClient=`${actorKey}:${currentClientId}`,scopeRef=useRef(actorClient);scopeRef.current=actorClient;
  const opener=useRef(null),drafts=useRef(new Map()),openingRecord=useRef(false);
  const save=useCreateIntent(api.patch,`calendar:${user?.user_id}:${currentClientId}`,true);
  const reload=()=>setRevision(n=>n+1);
  useEffect(()=>{setDrawer(null);setPopup(null);setDragging(null);setSaveError('');setBusy(false);openingRecord.current=false;drafts.current.clear();},[currentClientId,actorKey]);
  useEffect(()=>{
    const controller=new AbortController();setError('');setExpanded({});setDragging(null);setDragOverDay('');
    if(!currentClientId)return;
    api.get('/calendar',{params:{client_id:currentClientId,start,end,scope:'all',overdue_before:today},signal:controller.signal}).then(({data})=>{
      if(controller.signal.aborted)return;
      if(['reviews','findings','tasks'].some(kind=>!data[kind])||calendarEntries(data).some(item=>item.client_id!==currentClientId))throw new Error('Calendar records do not match the selected client.');
      setResult({key:requestKey,periodKey,data});
    }).catch(e=>{if(!controller.signal.aborted)setError(formatError(e));});
    return ()=>controller.abort();
  },[currentClientId,start,end,today,periodKey,requestKey]);
  const loading=!!currentClientId&&result?.key!==requestKey&&!error;
  // Preserve the same period's buttons during refresh for dialog focus return.
  const data=result?.periodKey===periodKey?result.data:emptyBuckets();
  const itemsForDay=day=>[...(data.reviews[day]||[]),...(data.findings[day]||[]),...(data.tasks[day]||[]),...(data.vendor_dates?.[day]||[])];
  const entries=calendarEntries(data);
  async function source(item) {
    const vendor=item.kind.startsWith('vendor_'),kind=vendor?'vendors':item.kind+'s';
    const {data:record}=await api.get(`/${kind}/${vendor?item.vendor_id:item.id}`);
    const initialValues=vendor?{vendorTab:item.kind==='vendor_assurance'?'assurance':'contract',assuranceId:item.assurance_id}:calendarSelection(item,record,currentClientId);
    if(record.client_id!==currentClientId||item.client_id!==currentClientId)throw new Error('Record belongs to another client.');
    return {kind,record,initialValues};
  }
  async function openSchedule(item,event) {
    if(loading||error||busy)return;
    if(save.unconfirmed()){toast.error('Retry the unconfirmed date save first.');return;}
    const key=requestKey;opener.current=event.currentTarget;
    try {
      const selected=await source(item);
      if(activeRequest.current!==key)return;
      const shown=selected.initialValues.occurrence||selected.record;
      const date=item.kind.startsWith('vendor_')?item.due_date_iso:shown.due_date;
      setPopup(drafts.current.get(item.key)||{item:{...item,title:shown.title||item.title,status:shown.status||item.status,due_date_iso:date},...selected,date:date.slice(0,10)});setSaveError('');
    }catch(e){if(activeRequest.current===key)toast.error(formatError(e));}
  }
  function closePopup() {setPopup(null);setSaveError('');}
  async function openRecord(event) {
    event.preventDefault();const key=requestKey;
    try {
      const selected=await source(popup.item);
      if(activeRequest.current!==key)return;
      openingRecord.current=true;setDrawer({key:popup.item.key,...selected});closePopup();
    }catch(e){if(activeRequest.current===key)setSaveError(formatError(e));}
  }
  async function persist(item,record,target,retry=false) {
    if(busy)return;
    const cid=currentClientId,scope=actorClient;setBusy(true);setSaveError('');
    try {
      if(retry)await save.retry();
      else {
        if(record.client_id!==cid||!canMoveCalendar(item.kind,record,user)||item.historical||item.kind==='review'&&item.occurrence_id!==occurrenceId(record))throw new Error('This item is no longer reschedulable. Refresh the Calendar.');
        await save(`/${item.kind}s/${item.id}`,{due_date:rescheduledDate(record.due_date,target),expected_updated_at:record.updated_at??null,...(item.kind==='review'?{expected_occurrence_id:item.occurrence_id,calendar_move:true}:{})});
      }
      if(scopeRef.current===scope){if(item)drafts.current.delete(item.key);closePopup();toast.success('Date saved');reload();}
    }catch(e){if(scopeRef.current===scope)setSaveError(formatError(e));}
    finally{if(scopeRef.current===scope)setBusy(false);}
  }
  function onDragStart(e,item) {
    if(busy||loading||error||!item.can_reschedule||save.unconfirmed()){e.preventDefault();return;}
    e.dataTransfer.setData('application/json',JSON.stringify({key:item.key}));e.dataTransfer.effectAllowed='move';setDragging(item.key);
  }
  async function onDrop(e,target) {
    e.preventDefault();setDragging(null);setDragOverDay('');
    if(busy||loading||error||save.unconfirmed())return;
    let payload;try{payload=JSON.parse(e.dataTransfer.getData('application/json'));}catch{return;}
    const item=entries.find(row=>row.key===payload?.key);if(!item?.can_reschedule||item.historical||item.date===target)return;
    const key=requestKey;
    try {
      const {record}=await source(item);if(activeRequest.current!==key)return;
      if(!canMoveCalendar(item.kind,record,user)||item.kind==='review'&&item.occurrence_id!==occurrenceId(record))throw new Error('This item is no longer reschedulable. Refresh the Calendar.');
      if((record.updated_at??null)!==item.updated_at||record.due_date!==item.due_date_iso)throw new Error('Record changed; refresh before rescheduling.');
      await persist(item,record,target);
    }catch(e){if(activeRequest.current===key){setSaveError(formatError(e));reload();}}
  }
  const editable=popup?.item.can_reschedule&&!popup.item.historical&&canMoveCalendar(popup.item.kind,popup.record,user);
  const route=popup&&(popup.kind==='findings'?`/action-items?finding_id=${encodeURIComponent(popup.item.id)}`:popup.kind==='tasks'?`/action-items?id=${encodeURIComponent(popup.item.id)}`:`/${popup.kind}?id=${encodeURIComponent(popup.item.id)}${popup.item.occurrence_id?'&occurrence='+encodeURIComponent(popup.item.occurrence_id):''}`)+`&client_id=${encodeURIComponent(currentClientId)}`;
  const drawerNode=<>
    {popup&&<Dialog open onOpenChange={open=>{if(!open&&!busy)closePopup();}}><DialogContent className="bcal-popup" onCloseAutoFocus={e=>{e.preventDefault();if(!openingRecord.current)opener.current?.focus();}}>
      <DialogTitle>{popup.item.title}</DialogTitle><DialogDescription>{calendarType(popup.item)} · {calendarStatus(popup.item)}</DialogDescription>
      <a href={route} className="text-link underline" onClick={openRecord}>Open {popup.kind==='vendors'?'Vendor':['tasks','findings'].includes(popup.kind)?'Action Item':'Review'}</a>
      <form onSubmit={e=>{e.preventDefault();persist(popup.item,popup.record,popup.date);}} className="space-y-4">
        <label className="block text-sm">Due date<input type="date" className="block w-full rounded-md border border-line p-2 mt-1 bg-surface-card" required value={popup.date} disabled={!editable||busy||save.unconfirmed()} onChange={e=>{const next={...popup,date:e.target.value};drafts.current.set(popup.item.key,next);setPopup(next);}}/></label>
        {saveError&&<p role="alert" className="text-sm text-semantic-critical">{saveError}</p>}
        <div className="flex justify-end gap-2"><button type="button" className="bpage-btn" disabled={busy} onClick={()=>{if(!save.unconfirmed())drafts.current.delete(popup.item.key);closePopup();}}>Cancel</button>{editable&&(save.unconfirmed()?<button type="button" className="bpage-btn" disabled={busy} onClick={()=>persist(popup.item,popup.record,null,true)}>Retry save</button>:<button type="submit" className="bpage-btn" disabled={busy||!popup.date||popup.date===popup.item.due_date_iso.slice(0,10)}>{busy?'Saving…':'Save date'}</button>)}</div>
      </form>
    </DialogContent></Dialog>}
    {drawer&&drawer.record.client_id===currentClientId&&<RecordDrawer key={drawer.key} open onOpenChange={open=>{if(!open){openingRecord.current=false;setDrawer(null);reload();opener.current?.focus();}}} kind={drawer.kind} record={drawer.record} initialValues={drawer.initialValues} schema={SCHEMAS[drawer.kind].fields} clientId={currentClientId} onSaved={reload}/>}
  </>;
  return <BrawndoCalendarView clientName={currentClient?.name||'Client'} anchor={anchor} setAnchor={setAnchor} view={view} setView={setView} period={period} days={days} itemsForDay={itemsForDay} today={today}
    entries={entries} loading={loading} error={error} errorNode={<RegisterLoadError error={error} onRetry={reload} name="Calendar"/>} busy={busy}
    dragging={dragging} dragOverDay={dragOverDay} setDragOverDay={setDragOverDay} setDragging={setDragging} expanded={expanded} setExpanded={setExpanded}
    onDragStart={onDragStart} onDrop={onDrop} openSchedule={openSchedule} ymd={localCalendarDate} drawerNode={drawerNode}
    recoveryNode={!popup&&(saveError||save.unconfirmed())&&<div className="bcal-note">{saveError&&<p role="alert">{saveError}</p>}{save.unconfirmed()&&<button type="button" className="bpage-btn" disabled={busy} onClick={()=>persist(null,null,null,true)}>Retry save</button>}</div>}/>;
}
