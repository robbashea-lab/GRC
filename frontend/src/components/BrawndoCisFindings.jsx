import {useCallback,useRef} from 'react';
import {cisLabel} from '@/lib/cisScope';
import {operatorProgram,operatorVocabulary} from '@/lib/frameworkOperator';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {Textarea} from './ui/textarea';
import AssigneeSelect from './AssigneeSelect';
import api from '@/lib/api';
import {recordUuid} from '@/lib/recordUuid';
import RemediationTickets from './RemediationTickets';
import BrawndoSafeguard11Findings from './BrawndoSafeguard11Findings';
import BrawndoSafeguard11FindingFields from './BrawndoSafeguard11FindingFields';
import {Sheet,SheetContent,SheetTitle,SheetDescription} from './ui/sheet';

// Compact safeguard-level Findings for the Brawndo CIS workspace. The safeguard is the authoritative
// origin (framework_assessment_id); the Finding owns its Action and its validation lifecycle.
export const SEVERITY_LABELS={low:'Low',medium:'Moderate',high:'High',critical:'Critical'};
export const FINDING_STATUS_LABELS={open:'Open',in_remediation:'In remediation',remediated:'Pending Validation',closed:'Closed',accepted:'Accepted'};

export function directFindings(record,related){
  const links=new Set((record.related_links||[]).filter(l=>l.kind==='findings').map(l=>l.id));
  return (related?.findings||[]).filter(f=>f.client_id===record.client_id&&(f.framework_assessment_id===record.framework_assessment_id||links.has(f.finding_id)));
}

function sameFindingDraft(left,right){
  return !!left&&!!right?.clientId&&!!right.assessmentId&&!!right.requestId
    &&left.clientId===right.clientId&&left.assessmentId===right.assessmentId
    &&left.requestId===right.requestId&&left.itemId===right.itemId;
}

export default function BrawndoCisFindings({record,definition,current,ctx,related,writable,busy,finding,setFinding,run,setNested,setFeedback,safeguard11=false,error}){
  const findings=record.framework_key==='cis-ig1'?directFindings(current,related):(related?.findings||[]).filter(f=>f.client_id===record.client_id);
  const disabled=!writable||busy||!ctx,aid=record.framework_assessment_id;
  const liveDraft=useRef(null),sheetElement=useRef(null),withdrawnFocus=useRef(null);
  liveDraft.current={clientId:record.client_id,assessmentId:aid,requestId:finding?.request_id,itemId:finding?.item_id,safeguard11};
  // A live draft can outlast its scoped portal; transfer its field focus without saving or cancelling it.
  const retainSheetElement=useCallback(node=>{
    if(node){sheetElement.current={node,identity:{...liveDraft.current}};withdrawnFocus.current=null;return;}
    const previous=sheetElement.current,active=document.activeElement,current=liveDraft.current;
    sheetElement.current=null;withdrawnFocus.current=null;
    if(current.safeguard11||!sameFindingDraft(previous?.identity,current)||!previous.node.contains(active))return;
    const label=active.getAttribute('aria-label')||(active.hasAttribute('data-severity')?'Finding severity':null);
    if(label)withdrawnFocus.current={...previous.identity,label,start:active.selectionStart,end:active.selectionEnd,direction:active.selectionDirection,restored:false};
  },[]);
  const restoreNativeField=useCallback(node=>{
    const receipt=withdrawnFocus.current,current=liveDraft.current;
    if(!node||current.safeguard11||!sameFindingDraft(receipt,current))return;
    const field=[...node.querySelectorAll('[aria-label]')].find(element=>element.getAttribute('aria-label')===receipt.label);
    if(!field||field.matches(':disabled'))return;
    field.focus();
    if(typeof receipt.start==='number'&&typeof receipt.end==='number')field.setSelectionRange(receipt.start,receipt.end,receipt.direction);
    receipt.restored=document.activeElement===field;receipt.field=receipt.restored?field:null;
  },[]);
  const preserveWithdrawnFocus=event=>{
    const receipt=withdrawnFocus.current,current=liveDraft.current;
    if(!current.safeguard11&&receipt?.restored&&receipt.field?.isConnected&&!receipt.field.matches(':disabled')&&sameFindingDraft(receipt,current))event.preventDefault();
  };

  const start=()=>setFinding({request_id:recordUuid(),title:'',description:'',severity:'medium',owner_id:current.owner_id||'',due_date:'',remediation_title:''});
  const put=(k,v)=>setFinding(p=>({...p,[k]:v}));
  const submit=()=>run(async()=>{
    const {owner_id,...body}=finding;
    // An unchanged owner is inherited from the safeguard (with the existing eligibility fallback).
    await api.post(`/framework_assessments/${aid}/findings`,{...body,due_date:body.due_date||null,...(owner_id!==(current.owner_id||'')?{owner_id:owner_id||null}:{})});
    setFinding(null);
    setFeedback?.('Ticket saved. Assessment changes remain separate.');
  });
  const Tickets=safeguard11?BrawndoSafeguard11Findings:RemediationTickets;
  return <section className="bcsg-findings" aria-labelledby="bcsg-findings-heading">
    <div className="bcsg-findings-head"><h3 id="bcsg-findings-heading">{safeguard11?"Gaps under formal tracking, each with an action item.":"Findings"}</h3>
      {writable&&!finding&&<Button size="sm" variant="outline" disabled={disabled} onClick={start}>{safeguard11?'Raise finding':'Raise Finding'}</Button>}</div>
    {findings.length?<Tickets records={{...related,findings,tasks:(related.tasks||[]).filter(t=>findings.some(f=>f.finding_id===t.finding_id)),framework_assessments:[current]}} clientId={record.client_id} users={ctx?.users} onOpen={setNested} disabled={busy}/>:<p className="bcsg-muted">No linked Findings.</p>}
    {finding&&(safeguard11?<Sheet open onOpenChange={open=>{if(!open&&!busy)setFinding(null);}}><SheetContent ref={retainSheetElement} onCloseAutoFocus={preserveWithdrawnFocus} className="sg11-finding-sheet" aria-busy={busy} onEscapeKeyDown={event=>event.stopPropagation()} onPointerDownOutside={event=>event.preventDefault()}>
      <header className="sg11-finding-sheet-head"><SheetTitle><span className="sg11-warning-icon" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg></span> Raise finding</SheetTitle><SheetDescription className="sr-only">From the saved {cisLabel(ctx?.configuration)} assessment · Safeguard {definition.id}</SheetDescription></header>
      {error&&<p role="alert" className="sg11-finding-error">{error}</p>}
      <BrawndoSafeguard11FindingFields {...{finding,record,definition,current,disabled}} clientId={record.client_id} implementationGroup={ctx?.configuration?.implementation_group} users={ctx?.users||[]} onChange={put} onCancel={()=>setFinding(null)} onSubmit={submit}/>
    </SheetContent></Sheet>:<fieldset ref={restoreNativeField} disabled={disabled} className="bcsg-finding-form"><legend>Raise Finding</legend>
      <p className="bcsg-muted" data-testid="finding-origin">Origin: {record.framework_key==='cis-ig1'?cisLabel(ctx?.configuration):operatorProgram(record.framework_key)} · {operatorVocabulary(record.framework_key).item} {definition.id} — {definition.title}</p>
      <label>Finding title<Input aria-label="Finding title" required value={finding.title} onChange={e=>put('title',e.target.value)}/></label>
      <label>Description<Textarea aria-label="Finding description" maxLength={20000} value={finding.description} onChange={e=>put('description',e.target.value)}/></label>
      <div className="bcsg-finding-grid">
        <label>Severity<select aria-label="Finding severity" value={finding.severity} onChange={e=>put('severity',e.target.value)}>{Object.entries(SEVERITY_LABELS).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
        <label>Target date<Input aria-label="Finding target date" type="date" value={finding.due_date} onChange={e=>put('due_date',e.target.value)}/></label>
      </div>
      <div><span className="bcsg-label">Owner</span><AssigneeSelect clientId={record.client_id} label="Finding owner" value={finding.owner_id} onChange={v=>put('owner_id',v||'')} users={ctx?.users||[]} disabled={disabled} showGuidance={false}/></div>
      <label>Corrective action<Input aria-label="Corrective action" required value={finding.remediation_title} onChange={e=>put('remediation_title',e.target.value)}/></label>
      <div className="flex flex-wrap gap-2"><Button size="sm" disabled={disabled||!finding.title.trim()||!finding.remediation_title.trim()} onClick={submit}>Create Finding & Action</Button><Button size="sm" variant="ghost" onClick={()=>setFinding(null)}>Cancel</Button></div>
    </fieldset>)}
  </section>;
}
