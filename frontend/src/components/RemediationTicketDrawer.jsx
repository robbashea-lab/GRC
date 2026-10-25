import {useBrawndoFullRecord} from '@/lib/brawndoFullRecord';
import './BrawndoFullRecord.css';
import {useCallback,useEffect,useId,useRef,useState} from 'react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './ui/dialog';
import {AlertDialog,AlertDialogContent,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction} from './ui/alert-dialog';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {Textarea} from './ui/textarea';
import AssigneeSelect from './AssigneeSelect';
import EvidencePanel from './EvidencePanel';
import RecordDrawer from './RecordDrawer';
import {useAuth} from '@/context/AuthContext';
import {useOrg} from '@/context/OrgContext';
import {canOperate,editableFields,isAssignedTo,isInternal} from '@/lib/permissions';
import {useActionRegisterData} from '@/lib/useActionRegisterData';
import {ticketRecords,ticketStage} from '@/lib/remediationTickets';
import {actionOrigin} from '@/lib/brawndoActions';
import {daysDue} from '@/lib/actionItems';
import {useCreateIntent} from '@/lib/createIntent';
import {readEvidenceFile} from '@/lib/evidenceFile';
import {resolveEvidenceSource} from '@/lib/evidenceContext';
import {SCHEMAS} from '@/lib/schemas';
import {displayRecordedAt} from '@/lib/managementDates';
import {MessageSquare,Check,CheckCircle2,Clock3,Upload} from 'lucide-react';
import api,{formatError} from '@/lib/api';
import './RemediationTicketDrawer.css';
import {ActionDetailHeader,ActionDetailWhy,ActionDetailState,ActionDetailSegments} from './BrawndoActionDetail';
import './BrawndoActionDetail.css';

const labels={open:'Open',in_progress:'In progress',blocked:'Blocked',pending_validation:'Pending validation',completed:'Completed',accepted:'Accepted',cancelled:'Cancelled'};
const priorities=SCHEMAS.tasks.fields.find(f=>f.name==='priority').options;
const fields=['title','assignee_id','due_date','description','resolution','status','priority'];
const draft=t=>Object.fromEntries(fields.map(k=>[k,t[k]??'']));
const mayEdit=(user,task)=>canOperate(user)&&(user.role!=='client_contributor'||isAssignedTo(user,task)||!task.assignee_id&&task.created_by===user.user_id);

// This endpoint has no replay key and can partially commit. Keep attempted commands
// read-only across drawer remounts in this app session; a page reload is not a replay guarantee.
const findingRiskAttempts=new Map();

function FindingRiskCommand({open,finding,record,clientId,ready,busy,dirty,workControls,onBusy,refresh,onSaved,fullRecord,risks}) {
  const auth=useAuth(),org=useOrg(),user=auth?.user;
  const eligible=fullRecord&&auth?.loading===false&&org?.loading===false&&!auth?.error&&!org?.error
    &&auth?.workspaceMode==='demo'&&user?.workspace_mode==='demo'&&isInternal(user)
    &&clientId==='demo_brawndo'&&org?.currentClientId===clientId&&org?.currentClient?.client_id===clientId
    &&record.client_id===clientId&&finding.client_id===clientId&&!!finding.finding_id;
  const identity=JSON.stringify([user?.user_id,user?.role,auth?.workspaceMode,user?.workspace_mode,clientId,org?.currentClientId,record.finding_id,record.task_id,finding.finding_id]);
  const originalIdentity=useRef(identity);
  // The hold follows the resource across actors; authority and navigation remain actor-bound.
  const key=JSON.stringify([auth?.workspaceMode,clientId,finding.finding_id]);
  const signature=identity+':'+!!eligible+':'+!!open;
  const live=useRef({signature,generation:0,mounted:false});
  if(live.current.signature!==signature){live.current.signature=signature;live.current.generation++;}
  const renderGeneration=live.current.generation;
  const ownsContext=()=>live.current.mounted&&live.current.signature===signature&&live.current.generation===renderGeneration;
  live.current.ready=ready;live.current.busy=busy;
  const lock=useRef(false),confirmationOpener=useRef(null);
  const [working,setWorking]=useState(false),[confirm,setConfirm]=useState(false),[message,setMessage]=useState(''),[verified,setVerified]=useState(null),[openedRisk,setOpenedRisk]=useState(null);
  useEffect(()=>{
    const context=live.current;
    context.mounted=true;
    return()=>{context.mounted=false;onBusy(false);};
  },[onBusy]);
  useEffect(()=>{setConfirm(false);setWorking(false);onBusy(false);},[signature,onBusy]);
  const allowed=eligible&&open&&originalIdentity.current===identity;
  const attempt=findingRiskAttempts.get(key);
  const linked=finding.risk_id||attempt?.riskId||verified?.risk_id;
  const blocked=()=>busy||!ready||dirty.current.size||[...workControls.current.values()].some(control=>control.busy);
  const draftMessage='Save, post or discard unfinished Work, comments and rationale before using the Risk command.';
  function request(opener){
    if(!ownsContext()||!allowed||lock.current||busy||!ready)return;
    if(dirty.current.size){setMessage(draftMessage);return;}
    if([...workControls.current.values()].some(control=>control.busy))return;
    confirmationOpener.current={node:opener,generation:live.current.generation};
    setMessage('');setConfirm(true);
  }
  async function run(create=false,openRisk=false){
    if(!ownsContext())return;
    if(!allowed||lock.current||blocked()){
      if(allowed&&dirty.current.size)setMessage(draftMessage);
      return;
    }
    if(create&&findingRiskAttempts.has(key))return;
    lock.current=true;setWorking(true);onBusy(true);setConfirm(false);setMessage('');
    const generation=live.current.generation;
    const current=()=>live.current.mounted&&live.current.generation===generation;
    let attempted=findingRiskAttempts.has(key);
    try{
      // Always read the actual Finding before a new command; the collection or
      // parent prop may predate a Risk linked by another native surface.
      let fresh=(await api.get('/findings/'+encodeURIComponent(finding.finding_id))).data;
      if(!current())return;
      if(fresh?.finding_id!==finding.finding_id||fresh.client_id!==clientId)throw new Error('The current Finding could not be verified.');
      if(create&&!fresh.risk_id){
        if(!live.current.ready||live.current.busy||dirty.current.size||[...workControls.current.values()].some(control=>control.busy))
          throw new Error('Save, post or discard drafts and wait for current ticket reads and commands before continuing.');
        // Another drawer may have reserved this same Finding during the preflight read.
        if(findingRiskAttempts.has(key)){attempted=true;throw new Error('Another creation attempt is already held for this Finding.');}
        if(risks?.some(risk=>risk.client_id===clientId&&(risk.source_type==='finding'&&risk.source_id===finding.finding_id||risk.finding_id===finding.finding_id||risk.related_finding_ids?.includes(finding.finding_id)))){
          findingRiskAttempts.set(key,{status:'unconfirmed'});attempted=true;
          throw new Error('An existing Risk references this Finding without a confirmed Finding link. Administrator repair may be needed.');
        }
        findingRiskAttempts.set(key,{status:'unconfirmed'});attempted=true;
        const result=await api.post('/findings/'+encodeURIComponent(finding.finding_id)+'/raise-risk');
        if(!current())return;
        const returned=result?.data?.risk;
        if(!returned?.risk_id||returned.client_id!==clientId)throw new Error('The creation response could not be verified.');
        findingRiskAttempts.set(key,{status:'unconfirmed',riskId:returned.risk_id});
        fresh=(await api.get('/findings/'+encodeURIComponent(finding.finding_id))).data;
        if(!current())return;
      }
      const expected=findingRiskAttempts.get(key)?.riskId;
      if(fresh?.finding_id!==finding.finding_id||fresh.client_id!==clientId||!fresh.risk_id||expected&&fresh.risk_id!==expected)
        throw new Error('No matching linked Risk is confirmed. An empty read does not make another creation safe.');
      const risk=(await api.get('/risks/'+encodeURIComponent(fresh.risk_id))).data;
      if(!current())return;
      if(risk?.risk_id!==fresh.risk_id||risk.client_id!==clientId||risk.source_type!=='finding'
        ||risk.source_id!==finding.finding_id||risk.finding_id!==finding.finding_id||!risk.related_finding_ids?.includes(finding.finding_id))
        throw new Error('The Risk client and Finding backlinks could not be verified.');
      // Refresh the same native ticket (without remounting Work drafts), then its
      // owning register/Review. Never report success after a failed refresh.
      const refreshed=await refresh();
      if(!current())return;
      if(refreshed?.ok!==true)throw new Error('The ticket could not be refreshed.');
      // Opening an existing link is a read: it must not announce a native save.
      if(!openRisk){
        const parentRefresh=await onSaved?.();
        if(!current())return;
        if(parentRefresh?.ok===false)throw new Error('The Risk link is verified, but the parent register refresh is unconfirmed. '+(parentRefresh.error||'Reload the register before continuing.'));
        window.dispatchEvent(new Event('grc:ticket-saved'));
      }
      findingRiskAttempts.set(key,{status:'verified',riskId:risk.risk_id});
      setVerified(risk);setMessage(openRisk?'Linked Risk verified.':'Risk linked and verified. Assess likelihood and impact in the Risk record.');
      if(openRisk)setOpenedRisk({risk,generation});
    }catch(error){
      if(!current())return;
      setMessage((attempted?'Risk creation/link is unconfirmed. ':'Risk link is unconfirmed. ')+formatError(error)+(attempted?' Use Check linked Risk; do not create another Risk.':''));
    }finally{
      lock.current=false;
      if(current()){setWorking(false);onBusy(false);}
    }
  }
  if(!allowed)return null;
  const held=attempt&&attempt.status!=='verified';
  return <section aria-label="Finding Risk" className="space-y-2">
    <strong>Risk</strong>
    {held?<><p>Creation/link is unconfirmed. Check the existing link before any further action. If no link appears, a partial creation may require administrator repair.</p><Button disabled={working||busy||!ready||!!dirty.current.size} onClick={()=>run()}>Check linked Risk</Button></>
      :linked?<Button disabled={working||busy||!ready||!!dirty.current.size} onClick={()=>run(false,true)}>Open linked Risk</Button>
      :<Button disabled={working||busy||!ready||[...workControls.current.values()].some(control=>control.busy)} onClick={event=>request(event.currentTarget)}>Raise as risk</Button>}
    {message&&<p role="status">{message}</p>}
    <AlertDialog open={confirm&&allowed} onOpenChange={value=>{if(ownsContext())setConfirm(value);}}><AlertDialogContent onCloseAutoFocus={event=>{
      event.preventDefault();
      const receipt=confirmationOpener.current;
      if(live.current.mounted&&receipt?.generation===live.current.generation&&receipt.node?.isConnected&&!receipt.node.disabled)receipt.node.focus({preventScroll:true});
    }}><AlertDialogTitle>Raise this Finding as a risk?</AlertDialogTitle><AlertDialogDescription>This creates a linked, unassessed Risk. Assess likelihood and impact in its native Risk record. Finding severity does not set its Risk score. Existing work, evidence and validation remain unchanged.</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction disabled={working||busy||!ready} onClick={()=>run(true)}>Confirm raise as risk</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    {openedRisk?.generation===live.current.generation&&<RecordDrawer kind="risks" record={openedRisk.risk} clientId={clientId} open onSaved={()=>run()} onOpenChange={value=>{if(ownsContext()&&!value)setOpenedRisk(null);}}/>}
  </section>;
}

function Work({task,users,user,onSaved,onDirty,onControls,commandBusyRef,detail=false,showInlineSave=true,requiresValidation=false,readOnly=false,pendingValidation=false}) {
  const update=useCreateIntent((...args)=>api.patch(...args),user.user_id+':'+task.client_id+':'+task.task_id,true);
  const [edits,setEdits]=useState({}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[feedback,setFeedback]=useState('');
  const editVersion=useRef(task.updated_at??null),current=draft(task);
  const form={...current,...Object.fromEntries(Object.entries(edits).map(([key,edit])=>[key,edit.value]))};
  const due=daysDue({...task,due_date:form.due_date});
  const dirty=JSON.stringify(form)!==JSON.stringify(current);
  // Untouched fields follow native reads; a colliding edit retains its original CAS token.
  const conflict=Object.entries(edits).some(([key,edit])=>current[key]!==edit.before&&current[key]!==edit.value);
  useEffect(()=>{
    // A confirmed read may acknowledge edits, but must not erase different local text.
    setEdits(previous=>{
      const retained=Object.fromEntries(Object.entries(previous).filter(([key,edit])=>edit.value!==draft(task)[key]&&!(key==='status'&&task.status==='done')));
      return Object.keys(retained).length===Object.keys(previous).length?previous:retained;
    });
  },[task]);
  useEffect(()=>{onDirty(task.task_id,dirty);return()=>onDirty(task.task_id,false);},[dirty,task.task_id,onDirty]);
  const allowed=editableFields('tasks',user,task),writable=!readOnly&&mayEdit(user,task);
  const enabled=k=>writable&&(!allowed||allowed.has(k)||(k==='assignee_id'&&user.role==='client_contributor'));
  const put=(k,v)=>{
    if(!dirty)editVersion.current=task.updated_at??null;
    setEdits(previous=>{
      const next=dirty?{...previous}:{};
      if(v===current[k])delete next[k];else next[k]={value:v,before:next[k]?.before??current[k]};
      return next;
    });
    setFeedback('');
  };
  function acknowledge(saved){
    if(saved?.task_id!==task.task_id||saved.client_id!==task.client_id)return;
    editVersion.current=saved.updated_at??null;
    const accepted=draft(saved);
    // Recovery acknowledges the original request, not newer text typed while its response was lost.
    setEdits(previous=>Object.fromEntries(Object.entries(previous)
      .filter(([key,edit])=>edit.value!==accepted[key]&&!(key==='status'&&saved.status==='done'))
      .map(([key,edit])=>[key,{...edit,before:accepted[key]}])));
  }
  async function save(status){
    if(readOnly||commandBusyRef?.current)return;
    onControls?.(task.task_id,{save:()=>save(),disabled:true,busy:true});
    setBusy(true);setError('');
    const next={...form,...(status?{status}:{})};
    const body=Object.fromEntries(fields.filter(k=>enabled(k)&&next[k]!==current[k]).map(k=>[k,['assignee_id','due_date'].includes(k)?next[k]||null:next[k]]));
    try{const result=await update('/tasks/'+task.task_id,{...body,expected_updated_at:conflict?editVersion.current:task.updated_at??null});acknowledge(result?.data);setFeedback('Saved.');await onSaved();}
    catch(e){setError(formatError(e));}finally{setBusy(false);}
  }
  // The footer delegates to this same per-Action operation; it never bundles siblings.
  useEffect(()=>{onControls?.(task.task_id,{save:()=>save(),disabled:busy||!writable||!dirty||!form.title.trim(),busy});});
  useEffect(()=>()=>onControls?.(task.task_id,null),[task.task_id,onControls]);
  return <section className="space-y-3 border border-line rounded-lg p-4" aria-label={task.title} data-ticket-task={task.task_id}>
    {detail&&<div className="bad-work-heading"><strong>The work</strong><span>Edit and save. Changes are recorded in Activity.</span></div>}
    <fieldset disabled={busy} className="ticket-work-fields">
      <label className="block ticket-field-wide">Action title<Input aria-label="Action title" value={form.title} disabled={!enabled('title')} onChange={e=>put('title',e.target.value)}/></label>
      <div className="ticket-field-wide grid sm:grid-cols-2 gap-3"><div>{detail?'Owner':'Responsible owner'}<AssigneeSelect popoverClassName={detail?"brawndo-action-owner-popover":""} guidanceText={detail?'Active platform users with access to this client.':undefined} showManagePeople={false} label="Responsible owner" clientId={task.client_id} users={users} value={form.assignee_id||null} disabled={!enabled('assignee_id')} onChange={v=>put('assignee_id',v||'')}/></div>
        <label>{detail?'Due date':'Due date (optional)'}<Input aria-label="Due date" type="date" value={form.due_date.slice(0,10)} disabled={!enabled('due_date')} onChange={e=>put('due_date',e.target.value)}/>{detail&&due!==null&&((pendingValidation&&task.status==='done')||!['done','cancelled'].includes(task.status))&&<span className="bad-due-help" data-overdue={due<0} data-upcoming={due>=0&&due<=14}>{due<0?`${Math.abs(due)} days overdue`:due===0?'Due today':`Due in ${due} days`}</span>}</label></div>
      {!detail&&!form.assignee_id&&<p className="text-sm ticket-field-wide">Unassigned</p>}
      <div className="block ticket-choice-field"><span>Priority</span>{detail?<ActionDetailSegments label="Priority" value={form.priority} disabled={!enabled('priority')} onChange={value=>put('priority',value)} options={[{value:'',label:'Classification needed'},...(!priorities.some(o=>o.value===form.priority)&&form.priority?[{value:form.priority,label:form.priority}]:[]),...priorities]}/>:<select aria-label="Priority" value={form.priority} disabled={!enabled('priority')} onChange={e=>put('priority',e.target.value)}><option value="">Classification needed</option>{!priorities.some(o=>o.value===form.priority)&&form.priority&&<option value={form.priority}>{form.priority}</option>}{priorities.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>}</div>
      <div className="block ticket-choice-field"><span>Work status</span>{detail?<ActionDetailSegments label="Work status" value={task.status==='done'?'done':form.status} disabled={!enabled('status')||task.status==='done'} onChange={value=>put('status',value)} options={['open','in_progress','blocked','cancelled',...(task.status==='done'?['done']:[])].map(value=>({value,label:value==='done'?'Work completed':labels[value]}))}/>:<select className="block bg-surface-card border border-line rounded p-2" aria-label="Work status" value={task.status==='done'?'done':form.status} disabled={!enabled('status')||task.status==='done'} onChange={e=>put('status',e.target.value)}>
        {['open','in_progress','blocked','cancelled',...(task.status==='done'?['done']:[])].map(s=><option key={s} value={s}>{s==='done'?'Work completed':labels[s]}</option>)}
      </select>}</div>
      <label className="block ticket-field-wide">Planned action<Textarea aria-label="Planned action" placeholder={detail?'What will be done, and by whom.':undefined} value={form.description} disabled={!enabled('description')} onChange={e=>put('description',e.target.value)}/></label>
      <label className="block ticket-field-wide">{detail?'What was done (optional)':'Actual resolution (optional)'}<Textarea aria-label="Actual resolution" placeholder={detail?'Describe what was done and where the proof is.':undefined} maxLength={20000} value={form.resolution} disabled={!enabled('resolution')} onChange={e=>put('resolution',e.target.value)}/></label>

      {writable&&<div className="ticket-field-wide flex flex-wrap gap-2 bad-work-actions">{showInlineSave&&<Button className={detail?'bad-primary':undefined} disabled={!dirty||!form.title.trim()} onClick={()=>save()}>Save changes</Button>}{!['done','cancelled'].includes(task.status)&&<><Button className={detail?'bad-primary':undefined} disabled={!form.title.trim()} onClick={()=>save('done')}>{detail&&<Check size={15} strokeWidth={2.2} aria-hidden="true"/>}Complete work</Button>{detail&&requiresValidation&&<small>It's closed once validated.</small>}</>}</div>}
    </fieldset>
    {error&&<p role="alert">{error}</p>}{feedback&&<p role="status">{feedback}</p>}
    {update.unconfirmed()&&<Button disabled={busy||readOnly} onClick={async()=>{setBusy(true);setError('');try{const result=await update.retry();acknowledge(result?.data);await onSaved();}catch(e){setError(formatError(e));}finally{setBusy(false);}}}>Retry unconfirmed save</Button>}
    {task.completed_at&&<p className="text-xs">Work completed {detail?(displayRecordedAt(task.completed_at)||task.completed_at):task.completed_at}</p>}
  </section>;
}

function History({ticket,onDirty,presentation,detail=false,readOnly=false}) {
  const {user}=useAuth();
  const [comment,setComment]=useState(''),[busy,setBusy]=useState(false),[version,setVersion]=useState(0);
  const [rows,setRows]=useState([]),[error,setError]=useState('');
  useEffect(()=>{onDirty('comment',!!comment);return()=>onDirty('comment',false);},[comment,onDirty]);
  const target=ticket.primary&&mayEdit(user,ticket.primary)?ticket.primary:ticket.actions.find(t=>mayEdit(user,t))||ticket.finding;
  const kind=target?.task_id?'tasks':'findings',id=target?.task_id||target?.finding_id;
  const writable=!readOnly&&target&&canOperate(user)&&(user.role!=='client_contributor'||isAssignedTo(user,target));
  const key=JSON.stringify([...(ticket.finding?[['findings',ticket.finding.finding_id,ticket.finding.updated_at]]:[]),...ticket.actions.map(t=>['tasks',t.task_id,t.updated_at])]);
  useEffect(()=>{let active=true;const refs=JSON.parse(key);
    Promise.all(refs.flatMap(([kind,id])=>[api.get('/'+kind+'/'+id+'/activity'),api.get('/comments',{params:{entity_type:kind,entity_id:id}})])).then(results=>{if(active)setRows(results.flatMap(r=>r.data).sort((a,b)=>(a.at||a.created_at||'').localeCompare(b.at||b.created_at||'')));}).catch(e=>{if(active)setError(formatError(e));});
    return()=>{active=false;};
  },[key,version]); // The ticket's records, not unrelated register changes, invalidate history.
  return <details className="bad-history" {...(detail?{open:true}:{})}><summary>History and comments</summary>{error&&<p role="alert">{error}</p>}<ul className="space-y-2 text-sm">{rows.map((r,i)=><li className="whitespace-pre-wrap bad-activity-row" key={r.log_id||r.audit_id||r.comment_id||i}>{detail&&<span className="bad-event-icon" aria-hidden="true">{r.comment_id?<MessageSquare size={14}/>:/(completed|validated)/i.test(r.action||'')?<CheckCircle2 size={14}/>:<Clock3 size={14}/>}</span>}<div className="bad-event-content">{(detail||presentation==='brawndo-demo-actions')&&<span className="block text-xs text-ink-secondary">{r.user_name||r.user_email||r.user_id||'Historical actor unavailable'}</span>}{!detail&&<>{r.at||r.created_at} · </>}{r.action||r.body}{r.meta?.rationale?' · '+r.meta.rationale:''}</div>{detail&&<time className="bad-event-time" dateTime={r.at||r.created_at}>{displayRecordedAt(r.at||r.created_at)||r.at||r.created_at}</time>}</li>)}</ul>{writable&&<div className="space-y-2"><label>Comment (optional)<Textarea aria-label="Ticket comment" value={comment} disabled={busy} onChange={e=>setComment(e.target.value)}/></label><Button disabled={busy||!comment.trim()} onClick={async()=>{setBusy(true);setError('');try{await api.post('/comments',{entity_type:kind,entity_id:id,body:comment});setComment('');setVersion(v=>v+1);}catch(e){setError(formatError(e));}finally{setBusy(false);}}}>Add comment</Button></div>}</details>;
}

export default function RemediationTicketDrawer({open,onOpenChange,kind,record,clientId,onSaved,onRiskLinked,presentation,closeRequest=0,onCloseCancelled,cisVisualOrigin,onReturnFocus}) {
  const pilot=presentation==='brawndo-demo-actions';
  const panelPrefix=useId();
  const {user}=useAuth(),{data,users,loading,error,load}=useActionRegisterData(record.client_id||clientId,{retainOnRefreshError:pilot});
  const [nested,setNested]=useState(null),[rationale,setRationale]=useState(''),[busy,setBusy]=useState(false),[commandError,setCommandError]=useState(''),[feedback,setFeedback]=useState(''),[discard,setDiscard]=useState(false);
  const [evidenceVersion,setEvidenceVersion]=useState(0),[evidenceSummary,setEvidenceSummary]=useState(null),[tab,setTab]=useState('overview'),[hasDirty,setHasDirty]=useState(false);
  const [riskBusy,setRiskBusy]=useState(false);
  const riskBusyRef=useRef(false);
  const markRiskBusy=useCallback(value=>{riskBusyRef.current=value;setRiskBusy(value);},[]);
  const workControls=useRef(new Map());
  const [,refreshControls]=useState(0);
  const registerControls=useRef((id,controls)=>{
    const previous=workControls.current.get(id);
    if(controls)workControls.current.set(id,controls);else workControls.current.delete(id);
    if(!!previous!==!!controls||previous?.disabled!==controls?.disabled||previous?.busy!==controls?.busy)refreshControls(value=>value+1);
  }).current;
  const dirty=useRef(new Set()),surface=useRef(null);
  const opener=useRef(null),openerSurface=useRef(null),discardOpener=useRef(null);
  function restoreFocus(){
    // An explicit parent owns this return, including a denied stale-context return.
    if(onReturnFocus){onReturnFocus();return;}
    const target=opener.current?.isConnected&&opener.current!==document.body?opener.current:openerSurface.current?.isConnected?openerSurface.current.querySelector('button,input,[tabindex]'):document.querySelector('[data-testid="ai-search"],main h1,main h2');if(target){if(!target.matches('button,input,[tabindex]'))target.tabIndex=-1;target.focus({preventScroll:true});}}
  const decision=useCreateIntent((path,body,config)=>api.post(path,{...body,request_id:config.headers['Idempotency-Key']},config),user.user_id+':'+record.client_id+':decision:'+(record.finding_id||record.task_id),true);
  const reopen=useCreateIntent((path,body,config)=>api.post(path,{...body,request_id:config.headers['Idempotency-Key']},config),user.user_id+':'+record.client_id+':reopen:'+(record.finding_id||record.task_id),true);
  const markDirty=useRef((id,value)=>{if(value)dirty.current.add(id);else dirty.current.delete(id);setHasDirty(dirty.current.size>0);}).current;
  useEffect(()=>{markDirty('rationale',!!rationale);return()=>markDirty('rationale',false);},[rationale,markDirty]);
  const ticket=ticketRecords(data,record.client_id||clientId).find(t=>kind==='findings'?t.finding?.finding_id===record.finding_id:t.actions.some(a=>a.task_id===record.task_id));
  const stage=ticket&&ticketStage(ticket),origin=ticket&&actionOrigin(ticket.raw,data,ticket.finding);
  const evidenceScope=`${user?.workspace_mode}:${user?.user_id}:${user?.role}:${ticket?.raw.client_id}:${ticket?.kind}:${ticket?.raw.finding_id||ticket?.raw.task_id}`;
  const evidenceCount=evidenceSummary?.scope===evidenceScope?evidenceSummary.total:null;
  const reportEvidenceSummary=useCallback(total=>setEvidenceSummary({scope:evidenceScope,total}),[evidenceScope]);
  const fullRecord=useBrawndoFullRecord(record,clientId)&&(!ticket||ticket.raw.client_id===clientId);
  const detail=fullRecord&&!!ticket&&ticket.raw.client_id===clientId&&record.client_id===clientId
    &&(kind==='tasks'&&!!record.task_id||kind==='findings'&&!!record.finding_id&&pilot);
  const singleWork=ticket?.actions.length===1?workControls.current.get(ticket.actions[0].task_id):null;
  const nestedCisVisualOrigin=nested?.kind==='framework_assessments' && origin?.kind==='framework_assessments'
    && origin.id===cisVisualOrigin?.assessmentId && nested.record.framework_assessment_id===origin.id
    && origin.target?.framework_assessment_id===cisVisualOrigin?.assessmentId && origin.target?.definition_id===cisVisualOrigin?.definitionId
    && origin.target?.client_id===cisVisualOrigin?.clientId && origin.target?.framework_key==='cis-ig1'?cisVisualOrigin:undefined;
  const canMutate=(!pilot||!loading&&!error)&&!riskBusy;
  const close=useCallback(v=>{if(v)onOpenChange(true);else if(!busy&&!riskBusy){if(dirty.current.size)setDiscard(true);else onOpenChange(false);}},[busy,riskBusy,onOpenChange]);
  const handledCloseRequest=useRef(closeRequest);
  useEffect(()=>{
    if(!pilot||busy||!closeRequest||handledCloseRequest.current===closeRequest)return;
    handledCloseRequest.current=closeRequest;
    close(false);
  },[pilot,busy,closeRequest,close]);
  useEffect(()=>{const warn=e=>{if(dirty.current.size){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[]);
  const saved=async()=>{
    const result=await load();
    if(pilot){
      try{await onSaved?.();}
      catch{throw new Error('Saved, but the register could not be refreshed. Reload before making further changes.');}
      window.dispatchEvent(new Event('grc:ticket-saved'));
      if(result?.ok===false)throw new Error('Saved, but ticket details could not be refreshed. Reload before making further changes.');
    }else{onSaved?.();window.dispatchEvent(new Event('grc:ticket-saved'));}
    setFeedback('Ticket saved.');
  };
  async function validate(action='validate'){
    setBusy(true);setCommandError('');
    const body={rationale,expected_updated_at:ticket.finding.updated_at??null};
    try{await decision('/findings/'+ticket.finding.finding_id+'/'+action,body);setRationale('');await saved();setFeedback(action==='validate'?'Ticket completed. Validation saved.':'Ticket accepted, not remediated.');}
    catch(e){setCommandError(formatError(e));}finally{setBusy(false);}
  }
  const uploadableActions=ticket?.actions.filter(task=>canMutate&&mayEdit(user,task))||[];
  const evidenceUploads=uploadableActions.map(task=><label key={task.task_id} className={detail?'bad-upload-choice':'block text-sm bad-upload'} data-disabled={busy||!canMutate}>{detail?<span className="bad-choose-files">Choose files{ticket.actions.length>1?' — '+task.title:''}</span>:<>Attach supporting evidence (optional){ticket.actions.length>1?' — '+task.title:''}</>}<Input className={detail?'sr-only':undefined} type="file" aria-label={ticket.actions.length===1?'Attach ticket evidence':'Attach evidence to '+task.title} disabled={busy||!canMutate} onChange={async e=>{const file=e.target.files?.[0];if(!file)return;setBusy(true);setCommandError('');try{await api.post('/evidence',{client_id:ticket.raw.client_id,linked_type:'task',linked_id:task.task_id,filename:file.name,mime_type:file.type||'application/octet-stream',content_base64:await readEvidenceFile(file)});setEvidenceVersion(v=>v+1);setFeedback('Evidence attached to this ticket.');}catch(err){setCommandError(formatError(err));}finally{setBusy(false);}}}/></label>);
  const evidenceHeader=detail?linkButton=>{
    if(!evidenceUploads.length&&!linkButton)return null;
    return <div className="bad-upload"><span className="bad-upload-icon" aria-hidden="true"><Upload size={20}/></span><strong>Attach proof the work was done</strong><span className="bad-upload-description">Reports, screenshots, sign-offs.</span><div className="bad-upload-actions">{evidenceUploads}{linkButton}</div></div>;
  }:undefined;
  return <><Dialog open={open} onOpenChange={close}><DialogContent ref={surface} onOpenAutoFocus={()=>{opener.current=document.activeElement;openerSurface.current=opener.current?.closest('[role="dialog"]');}} onCloseAutoFocus={e=>{e.preventDefault();restoreFocus();}} className={'remediation-ticket-dialog max-h-[90vh] overflow-y-auto min-w-0 break-words'+(pilot?' brawndo-demo-actions-ticket':'')+(fullRecord?' brawndo-full-record':'')+(detail?' brawndo-action-detail':'')} data-testid="remediation-ticket-drawer">
    <header className="ticket-heading">{detail?<ActionDetailHeader {...{ticket,kind,record,stage,origin,tab,evidenceCount}} onTab={setTab} idPrefix={panelPrefix}/>:<><DialogTitle>{ticket?.title||'Remediation ticket'}</DialogTitle><DialogDescription>{ticket?ticket.ticketId:'Loading ticket…'}</DialogDescription></>}</header>
    {error&&<p role="alert">{error}<Button onClick={load}>Retry</Button></p>}
    {!loading&&!error&&!ticket&&<p role="alert">This ticket is unavailable for this client.</p>}
    {ticket&&<div className="space-y-4 bad-body">
      <section className="bad-panel bad-overview space-y-4" hidden={detail&&tab!=='overview'} id={detail?panelPrefix+'-panel-overview':undefined} role={detail?'tabpanel':undefined} aria-labelledby={detail?panelPrefix+'-tab-overview':undefined} aria-label={detail?'Overview':undefined}>
      {!detail&&<p>{labels[stage]}</p>}
      {!detail&&ticket.finding?.status==='accepted'&&stage!=='accepted'&&<p>Issue accepted. Outstanding Actions remain active until completed or cancelled; acceptance is not verified remediation.</p>}
      {detail&&<ActionDetailWhy ticket={ticket} origin={origin} disabled={!canMutate} onOpen={()=>setNested({kind:origin.kind,record:origin.target,initialValues:origin.initialValues})}/>}
      {!detail&&ticket.finding&&<p className="whitespace-pre-wrap"><strong>Finding:</strong> {ticket.issue||'Issue description not recorded'}</p>}
      {!detail&&origin.id&&<p>Originated from: {origin.target?<button className="text-link underline" disabled={!canMutate} onClick={()=>setNested({kind:origin.kind,record:origin.target,initialValues:origin.initialValues})}>{origin.label}{origin.detail?' · '+origin.detail:''}</button>:<span>{origin.label} · {origin.id} · unavailable</span>}</p>}
      {ticket.diagnostic&&<p role="status">{ticket.diagnostic}. Existing records and their assignments are retained.</p>}
      {ticket.finding&&<FindingRiskCommand {...{open,record,clientId,fullRecord,dirty,workControls}} onSaved={onRiskLinked||onSaved} risks={data.risks} finding={ticket.finding} ready={!loading&&!error} busy={busy} onBusy={markRiskBusy} refresh={load}/>}
      {ticket.actions.map(task=><Work key={user.user_id+':'+task.client_id+':'+task.task_id} {...{task,users,user,detail}} commandBusyRef={riskBusyRef} pendingValidation={stage==='pending_validation'} requiresValidation={!!ticket.finding&&!['closed','accepted'].includes(ticket.finding.status)} showInlineSave={!detail||ticket.actions.length!==1} onControls={registerControls} readOnly={!canMutate} onSaved={saved} onDirty={markDirty}/>)}
      {!ticket.actions.length&&<p>No remediation Action is recorded. The Finding remains open.</p>}
      {!ticket.actions.length&&ticket.finding&&isInternal(user)&&canMutate&&<Button disabled={busy||!canMutate} onClick={async()=>{setBusy(true);setCommandError('');try{await api.post('/findings/'+ticket.finding.finding_id+'/create-task',{title:ticket.title});await saved();}catch(e){setCommandError(formatError(e));}finally{setBusy(false);}}}>Start remediation</Button>}
      <ActionDetailState ticket={ticket} stage={stage} users={users} detail={detail} evidenceCount={evidenceCount}>
      {ticket.finding&&['closed','accepted'].includes(ticket.finding.status)&&isInternal(user)&&canMutate&&<Button disabled={busy||!canMutate} onClick={async()=>{setBusy(true);setCommandError('');try{await reopen('/findings/'+ticket.finding.finding_id+'/reopen',{expected_updated_at:ticket.finding.updated_at??null});await saved();setFeedback('Ticket reopened. Previous completed work and decisions are retained.');}catch(e){setCommandError(formatError(e));}finally{setBusy(false);}}}>Reopen ticket</Button>}
      {stage==='pending_validation'&&<section className="space-y-3">{!detail&&<p>Work is complete. A platform administrator must validate the resolution before this ticket is Completed.</p>}{isInternal(user)&&canMutate&&<><label className="block">{detail?'Validation note (required)':'Validation rationale (required)'}<Textarea aria-label="Validation rationale" value={rationale} disabled={busy||!canMutate} onChange={e=>setRationale(e.target.value)}/></label><Button disabled={busy||!rationale.trim()} onClick={()=>validate()}>{detail?'Validate and close':'Validate and complete'}</Button></>}</section>}
      </ActionDetailState>
      {ticket.finding&&!['closed','accepted'].includes(ticket.finding.status)&&isInternal(user)&&canMutate&&<details className="bad-accept"><summary>{detail?'Accept the issue instead of fixing it':'Accept the issue instead of remediation'}</summary><p>Acceptance is recorded separately from successful remediation. Existing work and evidence are retained.</p><label>Acceptance rationale (required)<Textarea aria-label="Acceptance rationale" value={rationale} disabled={busy||!canMutate} onChange={e=>setRationale(e.target.value)}/></label><Button disabled={busy||!rationale.trim()} onClick={()=>validate('accept')}>Accept issue</Button></details>}
      {!detail&&ticket.finding&&['open','in_progress','blocked'].includes(stage)&&<p className="text-sm">Complete outstanding work, then validate the resolution here. Control implementation and verification are unchanged.</p>}
      </section>
      <section className="bad-panel bad-evidence space-y-4" hidden={detail&&tab!=='evidence'} id={detail?panelPrefix+'-panel-evidence':undefined} role={detail?'tabpanel':undefined} aria-labelledby={detail?panelPrefix+'-tab-evidence':undefined} aria-label={detail?'Evidence':undefined}>
      {!detail&&evidenceUploads}
      <EvidencePanel key={evidenceScope} renderHeader={evidenceHeader} onSummary={detail?reportEvidenceSummary:undefined} clientId={ticket.raw.client_id} kind={ticket.kind} id={ticket.raw.finding_id||ticket.raw.task_id} refreshKey={evidenceVersion} validatedAt={ticket.finding?.validated_at} onOpen={async ref=>{if(!canMutate)return;try{const target=await resolveEvidenceSource(ref,ticket.raw.client_id);if(target.kind==='tasks'&&ticket.actions.some(t=>t.task_id===target.record.task_id)){setTab('overview');requestAnimationFrame(()=>Array.from(surface.current?.querySelectorAll('[data-ticket-task]')||[]).find(e=>e.dataset.ticketTask===target.record.task_id)?.querySelector('input')?.focus());}else if(!(target.kind==='findings'&&target.record.finding_id===ticket.finding?.finding_id))setNested(target);}catch(e){setCommandError(formatError(e));}}} allowLink={isInternal(user)&&canMutate}/>
      </section>
      <section className="bad-panel" hidden={detail&&tab!=='activity'} id={detail?panelPrefix+'-panel-activity':undefined} role={detail?'tabpanel':undefined} aria-labelledby={detail?panelPrefix+'-tab-activity':undefined} aria-label={detail?'Activity':undefined}>
      <History ticket={ticket} onDirty={markDirty} presentation={presentation} detail={detail} readOnly={!canMutate}/>
      </section>
      {commandError&&<p role="alert">{commandError}</p>}{feedback&&<p role="status">{feedback}</p>}
      {[[decision,'decision'],[reopen,'reopening']].filter(([command])=>command.unconfirmed()).map(([command,name])=><Button key={name} disabled={busy||!canMutate} onClick={async()=>{setBusy(true);setCommandError('');try{await command.retry();setRationale('');await saved();}catch(e){setCommandError(formatError(e));}finally{setBusy(false);}}}>Retry unconfirmed {name}</Button>)}
    </div>}
    {(pilot||fullRecord)&&<footer className="ticket-footer" data-single-action={detail&&ticket.actions.length===1?true:undefined}><span className="bad-dirty">{detail?(hasDirty?'Unsaved changes':'No unsaved changes'):'Save each Action above to retain its changes.'}</span><div className="bad-footer-actions"><Button variant="outline" disabled={busy} onClick={()=>close(false)}>{detail?'Close':'Cancel'}</Button>{detail&&ticket.actions.length===1&&<Button className="bad-primary" disabled={busy||!canMutate||!singleWork||singleWork.disabled} onClick={()=>workControls.current.get(ticket.actions[0].task_id)?.save()}>Save changes</Button>}{detail&&ticket.actions.length>1&&<span>Save each Action above to retain its changes.</span>}</div></footer>}
  </DialogContent></Dialog>
  <AlertDialog open={discard} onOpenChange={setDiscard}><AlertDialogContent onOpenAutoFocus={()=>{discardOpener.current=document.activeElement;}} onCloseAutoFocus={e=>{e.preventDefault();if(dirty.current.size){const target=discardOpener.current?.isConnected?discardOpener.current:surface.current?.querySelector('button,input');target?.focus({preventScroll:true});}else restoreFocus();}}><AlertDialogTitle>Discard unsaved ticket changes?</AlertDialogTitle><AlertDialogDescription>Saved records remain unchanged.</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel onClick={()=>{if(pilot)onCloseCancelled?.();}}>Keep editing</AlertDialogCancel><AlertDialogAction onClick={()=>{dirty.current.clear();setDiscard(false);onOpenChange(false);}}>Discard changes</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  {nested&&<RecordDrawer {...nested} open clientId={clientId} cisVisualOrigin={nestedCisVisualOrigin} onSaved={()=>{saved().catch(e=>setCommandError(formatError(e)));}} onOpenChange={v=>{if(!v)setNested(null);}}/>}
  </>;
}
