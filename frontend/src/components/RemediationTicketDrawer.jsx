import {useEffect,useRef,useState} from 'react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './ui/dialog';
import {AlertDialog,AlertDialogContent,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction} from './ui/alert-dialog';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {Textarea} from './ui/textarea';
import AssigneeSelect from './AssigneeSelect';
import EvidencePanel from './EvidencePanel';
import RecordDrawer from './RecordDrawer';
import {useAuth} from '@/context/AuthContext';
import {canOperate,editableFields,isAssignedTo,isInternal} from '@/lib/permissions';
import {useActionRegisterData} from '@/lib/useActionRegisterData';
import {ticketRecords,ticketStage} from '@/lib/remediationTickets';
import {actionOrigin} from '@/lib/brawndoActions';
import {useCreateIntent} from '@/lib/createIntent';
import {readEvidenceFile} from '@/lib/evidenceFile';
import {resolveEvidenceSource} from '@/lib/evidenceContext';
import {SCHEMAS} from '@/lib/schemas';
import api,{formatError} from '@/lib/api';

const labels={open:'Open',in_progress:'In progress',blocked:'Blocked',pending_validation:'Pending validation',completed:'Completed',accepted:'Accepted',cancelled:'Cancelled'};
const priorities=SCHEMAS.tasks.fields.find(f=>f.name==='priority').options;
const fields=['title','assignee_id','due_date','description','resolution','status','priority'];
const draft=t=>Object.fromEntries(fields.map(k=>[k,t[k]??'']));
const mayEdit=(user,task)=>canOperate(user)&&(user.role!=='client_contributor'||isAssignedTo(user,task)||!task.assignee_id&&task.created_by===user.user_id);

function Work({task,users,user,onSaved,onDirty}) {
  const update=useCreateIntent((...args)=>api.patch(...args),user.user_id+':'+task.client_id+':'+task.task_id,true);
  const [form,setForm]=useState(()=>draft(task)),[busy,setBusy]=useState(false),[error,setError]=useState(''),[feedback,setFeedback]=useState('');
  const dirty=JSON.stringify(form)!==JSON.stringify(draft(task));
  useEffect(()=>{onDirty(task.task_id,dirty);return()=>onDirty(task.task_id,false);},[dirty,task.task_id,onDirty]);
  const allowed=editableFields('tasks',user,task),writable=mayEdit(user,task);
  const enabled=k=>writable&&(!allowed||allowed.has(k)||(k==='assignee_id'&&user.role==='client_contributor'));
  const put=(k,v)=>{setForm(f=>({...f,[k]:v}));setFeedback('');};
  async function save(status){
    setBusy(true);setError('');
    const next={...form,...(status?{status}:{})};
    const body=Object.fromEntries(fields.filter(k=>enabled(k)&&next[k]!==draft(task)[k]).map(k=>[k,['assignee_id','due_date'].includes(k)?next[k]||null:next[k]]));
    try{await update('/tasks/'+task.task_id,{...body,expected_updated_at:task.updated_at??null});setFeedback('Saved.');await onSaved();}
    catch(e){setError(formatError(e));}finally{setBusy(false);}
  }
  return <section className="space-y-3 border border-line rounded-lg p-4" aria-label={task.title} data-ticket-task={task.task_id}>
    <fieldset disabled={busy} className="space-y-3">
      <label className="block">Action title<Input aria-label="Action title" value={form.title} disabled={!enabled('title')} onChange={e=>put('title',e.target.value)}/></label>
      <div className="grid sm:grid-cols-2 gap-3"><div>Responsible owner<AssigneeSelect label="Responsible owner" clientId={task.client_id} users={users} value={form.assignee_id||null} disabled={!enabled('assignee_id')} onChange={v=>put('assignee_id',v||'')}/></div>
        <label>Due date (optional)<Input aria-label="Due date" type="date" value={form.due_date.slice(0,10)} disabled={!enabled('due_date')} onChange={e=>put('due_date',e.target.value)}/></label></div>
      {!form.assignee_id&&<p className="text-sm">Unassigned</p>}
      <label className="block">Priority<select aria-label="Priority" value={form.priority} disabled={!enabled('priority')} onChange={e=>put('priority',e.target.value)}><option value="">Classification needed</option>{!priorities.some(o=>o.value===form.priority)&&form.priority&&<option value={form.priority}>{form.priority}</option>}{priorities.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
      <label className="block">Planned action<Textarea aria-label="Planned action" value={form.description} disabled={!enabled('description')} onChange={e=>put('description',e.target.value)}/></label>
      <label className="block">Actual resolution (optional)<Textarea aria-label="Actual resolution" maxLength={20000} value={form.resolution} disabled={!enabled('resolution')} onChange={e=>put('resolution',e.target.value)}/></label>
      <label className="block">Work status<select className="block bg-surface-card border border-line rounded p-2" aria-label="Work status" value={form.status} disabled={!enabled('status')||task.status==='done'} onChange={e=>put('status',e.target.value)}>
        {['open','in_progress','blocked','cancelled',...(task.status==='done'?['done']:[])].map(s=><option key={s} value={s}>{s==='done'?'Work completed':labels[s]}</option>)}
      </select></label>
      {writable&&<div className="flex flex-wrap gap-2"><Button disabled={!dirty||!form.title.trim()} onClick={()=>save()}>Save changes</Button>{!['done','cancelled'].includes(task.status)&&<Button disabled={!form.title.trim()} onClick={()=>save('done')}>Complete work</Button>}</div>}
    </fieldset>
    {error&&<p role="alert">{error}</p>}{feedback&&<p role="status">{feedback}</p>}
    {update.unconfirmed()&&<Button disabled={busy} onClick={async()=>{setBusy(true);setError('');try{await update.retry();await onSaved();}catch(e){setError(formatError(e));}finally{setBusy(false);}}}>Retry unconfirmed save</Button>}
    {task.completed_at&&<p className="text-xs">Work completed {task.completed_at}</p>}
  </section>;
}

function History({ticket,onDirty}) {
  const {user}=useAuth();
  const [comment,setComment]=useState(''),[busy,setBusy]=useState(false),[version,setVersion]=useState(0);
  const [rows,setRows]=useState([]),[error,setError]=useState('');
  useEffect(()=>{onDirty('comment',!!comment);return()=>onDirty('comment',false);},[comment,onDirty]);
  const target=ticket.primary&&mayEdit(user,ticket.primary)?ticket.primary:ticket.actions.find(t=>mayEdit(user,t))||ticket.finding;
  const kind=target?.task_id?'tasks':'findings',id=target?.task_id||target?.finding_id;
  const writable=target&&canOperate(user)&&(user.role!=='client_contributor'||isAssignedTo(user,target));
  const key=JSON.stringify([...(ticket.finding?[['findings',ticket.finding.finding_id,ticket.finding.updated_at]]:[]),...ticket.actions.map(t=>['tasks',t.task_id,t.updated_at])]);
  useEffect(()=>{let active=true;const refs=JSON.parse(key);
    Promise.all(refs.flatMap(([kind,id])=>[api.get('/'+kind+'/'+id+'/activity'),api.get('/comments',{params:{entity_type:kind,entity_id:id}})])).then(results=>{if(active)setRows(results.flatMap(r=>r.data).sort((a,b)=>(a.at||a.created_at||'').localeCompare(b.at||b.created_at||'')));}).catch(e=>{if(active)setError(formatError(e));});
    return()=>{active=false;};
  },[key,version]); // The ticket's records, not unrelated register changes, invalidate history.
  return <details><summary>History and comments</summary>{error&&<p role="alert">{error}</p>}<ul className="space-y-2 text-sm">{rows.map((r,i)=><li key={r.audit_id||r.comment_id||i}>{r.at||r.created_at} · {r.action||r.body}{r.meta?.rationale?' · '+r.meta.rationale:''}</li>)}</ul>{writable&&<div className="space-y-2"><label>Comment (optional)<Textarea aria-label="Ticket comment" value={comment} disabled={busy} onChange={e=>setComment(e.target.value)}/></label><Button disabled={busy||!comment.trim()} onClick={async()=>{setBusy(true);setError('');try{await api.post('/comments',{entity_type:kind,entity_id:id,body:comment});setComment('');setVersion(v=>v+1);}catch(e){setError(formatError(e));}finally{setBusy(false);}}}>Add comment</Button></div>}</details>;
}

export default function RemediationTicketDrawer({open,onOpenChange,kind,record,clientId,onSaved}) {
  const {user}=useAuth(),{data,users,loading,error,load}=useActionRegisterData(record.client_id||clientId);
  const [nested,setNested]=useState(null),[rationale,setRationale]=useState(''),[busy,setBusy]=useState(false),[commandError,setCommandError]=useState(''),[feedback,setFeedback]=useState(''),[discard,setDiscard]=useState(false);
  const [evidenceVersion,setEvidenceVersion]=useState(0);
  const dirty=useRef(new Set()),surface=useRef(null);
  const decision=useCreateIntent((path,body,config)=>api.post(path,{...body,request_id:config.headers['Idempotency-Key']}),user.user_id+':'+record.client_id+':decision:'+(record.finding_id||record.task_id),true);
  const reopen=useCreateIntent((path,body,config)=>api.post(path,{...body,request_id:config.headers['Idempotency-Key']}),user.user_id+':'+record.client_id+':reopen:'+(record.finding_id||record.task_id),true);
  const markDirty=useRef((id,value)=>value?dirty.current.add(id):dirty.current.delete(id)).current;
  useEffect(()=>{markDirty('rationale',!!rationale);return()=>markDirty('rationale',false);},[rationale,markDirty]);
  const ticket=ticketRecords(data,record.client_id||clientId).find(t=>kind==='findings'?t.finding?.finding_id===record.finding_id:t.actions.some(a=>a.task_id===record.task_id));
  const stage=ticket&&ticketStage(ticket),origin=ticket&&actionOrigin(ticket.raw,data,ticket.finding);
  const close=v=>{if(v)onOpenChange(true);else if(!busy){if(dirty.current.size)setDiscard(true);else onOpenChange(false);}};
  useEffect(()=>{const warn=e=>{if(dirty.current.size){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[]);
  const saved=async()=>{await load();onSaved?.();window.dispatchEvent(new Event('grc:ticket-saved'));setFeedback('Ticket saved.');};
  async function validate(action='validate'){
    setBusy(true);setCommandError('');
    const body={rationale,expected_updated_at:ticket.finding.updated_at??null};
    try{await decision('/findings/'+ticket.finding.finding_id+'/'+action,body);setRationale('');await saved();setFeedback(action==='validate'?'Ticket completed. Validation saved.':'Ticket accepted, not remediated.');}
    catch(e){setCommandError(formatError(e));}finally{setBusy(false);}
  }
  return <><Dialog open={open} onOpenChange={close}><DialogContent ref={surface} className="max-w-3xl max-h-[90vh] overflow-y-auto min-w-0 break-words" data-testid="remediation-ticket-drawer">
    <DialogTitle>{ticket?.title||'Remediation ticket'}</DialogTitle><DialogDescription>{ticket?ticket.ticketId:'Loading ticket…'}</DialogDescription>
    {error&&<p role="alert">{error}<Button onClick={load}>Retry</Button></p>}
    {!loading&&!error&&!ticket&&<p role="alert">This ticket is unavailable for this client.</p>}
    {ticket&&<div className="space-y-4">
      <p>{labels[stage]}</p>
      {ticket.finding?.status==='accepted'&&stage!=='accepted'&&<p>Issue accepted. Outstanding Actions remain active until completed or cancelled; acceptance is not verified remediation.</p>}
      {ticket.finding&&<p className="whitespace-pre-wrap"><strong>Finding:</strong> {ticket.issue||'Issue description not recorded'}</p>}
      {origin.id&&<p>Originated from: {origin.target?<button className="text-link underline" onClick={()=>setNested({kind:origin.kind,record:origin.target,initialValues:origin.initialValues})}>{origin.label}{origin.detail?' · '+origin.detail:''}</button>:<span>{origin.label} · {origin.id} · unavailable</span>}</p>}
      {ticket.diagnostic&&<p role="status">{ticket.diagnostic}. Existing records and their assignments are retained.</p>}
      {ticket.actions.map(task=><Work key={task.task_id+':'+task.updated_at} {...{task,users,user}} onSaved={saved} onDirty={markDirty}/>)}
      {!ticket.actions.length&&<p>No remediation Action is recorded. The Finding remains open.</p>}
      {!ticket.actions.length&&ticket.finding&&isInternal(user)&&<Button disabled={busy} onClick={async()=>{setBusy(true);setCommandError('');try{await api.post('/findings/'+ticket.finding.finding_id+'/create-task',{title:ticket.title});await saved();}catch(e){setCommandError(formatError(e));}finally{setBusy(false);}}}>Start remediation</Button>}
      {ticket.finding&&['closed','accepted'].includes(ticket.finding.status)&&isInternal(user)&&<Button disabled={busy} onClick={async()=>{setBusy(true);setCommandError('');try{await reopen('/findings/'+ticket.finding.finding_id+'/reopen',{expected_updated_at:ticket.finding.updated_at??null});await saved();setFeedback('Ticket reopened. Previous completed work and decisions are retained.');}catch(e){setCommandError(formatError(e));}finally{setBusy(false);}}}>Reopen ticket</Button>}
      {stage==='pending_validation'&&<section className="space-y-3"><p>Work is complete. A platform administrator must validate the resolution before this ticket is Completed.</p>{isInternal(user)&&<><label className="block">Validation rationale (required)<Textarea aria-label="Validation rationale" value={rationale} disabled={busy} onChange={e=>setRationale(e.target.value)}/></label><Button disabled={busy||!rationale.trim()} onClick={()=>validate()}>Validate and complete</Button></>}</section>}
      {ticket.finding&&!['closed','accepted'].includes(ticket.finding.status)&&isInternal(user)&&<details><summary>Accept the issue instead of remediation</summary><p>Acceptance is recorded separately from successful remediation. Existing work and evidence are retained.</p><label>Acceptance rationale (required)<Textarea aria-label="Acceptance rationale" value={rationale} disabled={busy} onChange={e=>setRationale(e.target.value)}/></label><Button disabled={busy||!rationale.trim()} onClick={()=>validate('accept')}>Accept issue</Button></details>}
      {ticket.finding&&['open','in_progress','blocked'].includes(stage)&&<p className="text-sm">Complete outstanding work, then validate the resolution here. Control implementation and verification are unchanged.</p>}
      {commandError&&<p role="alert">{commandError}</p>}{feedback&&<p role="status">{feedback}</p>}
      {[[decision,'decision'],[reopen,'reopening']].filter(([command])=>command.unconfirmed()).map(([command,name])=><Button key={name} disabled={busy} onClick={async()=>{setBusy(true);setCommandError('');try{await command.retry();setRationale('');await saved();}catch(e){setCommandError(formatError(e));}finally{setBusy(false);}}}>Retry unconfirmed {name}</Button>)}
      {ticket.actions.filter(task=>mayEdit(user,task)).map(task=><label key={task.task_id} className="block text-sm">Attach supporting evidence (optional){ticket.actions.length>1?' — '+task.title:''}<Input type="file" aria-label={ticket.actions.length===1?'Attach ticket evidence':'Attach evidence to '+task.title} disabled={busy} onChange={async e=>{const file=e.target.files?.[0];if(!file)return;setBusy(true);setCommandError('');try{await api.post('/evidence',{client_id:ticket.raw.client_id,linked_type:'task',linked_id:task.task_id,filename:file.name,mime_type:file.type||'application/octet-stream',content_base64:await readEvidenceFile(file)});setEvidenceVersion(v=>v+1);setFeedback('Evidence attached to this ticket.');}catch(err){setCommandError(formatError(err));}finally{setBusy(false);}}}/></label>)}
      <EvidencePanel clientId={ticket.raw.client_id} kind={ticket.kind} id={ticket.raw.finding_id||ticket.raw.task_id} refreshKey={evidenceVersion} validatedAt={ticket.finding?.validated_at} onOpen={async ref=>{try{const target=await resolveEvidenceSource(ref,ticket.raw.client_id);if(target.kind==='tasks'&&ticket.actions.some(t=>t.task_id===target.record.task_id)){Array.from(surface.current?.querySelectorAll('[data-ticket-task]')||[]).find(e=>e.dataset.ticketTask===target.record.task_id)?.querySelector('input')?.focus();}else if(!(target.kind==='findings'&&target.record.finding_id===ticket.finding?.finding_id))setNested(target);}catch(e){setCommandError(formatError(e));}}} allowLink={isInternal(user)}/>
      <History ticket={ticket} onDirty={markDirty}/>
    </div>}
  </DialogContent></Dialog>
  <AlertDialog open={discard} onOpenChange={setDiscard}><AlertDialogContent><AlertDialogTitle>Discard unsaved ticket changes?</AlertDialogTitle><AlertDialogDescription>Saved records remain unchanged.</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel>Keep editing</AlertDialogCancel><AlertDialogAction onClick={()=>{dirty.current.clear();setDiscard(false);onOpenChange(false);}}>Discard changes</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  {nested&&<RecordDrawer {...nested} open clientId={clientId} onSaved={saved} onOpenChange={v=>{if(!v)setNested(null);}}/>}
  </>;
}
