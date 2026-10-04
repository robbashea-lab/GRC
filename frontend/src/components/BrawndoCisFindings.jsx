import {cisLabel} from '@/lib/cisScope';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {Textarea} from './ui/textarea';
import AssigneeSelect from './AssigneeSelect';
import api from '@/lib/api';
import {recordUuid} from '@/lib/recordUuid';
import RemediationTickets from './RemediationTickets';

// Compact safeguard-level Findings for the Brawndo CIS workspace. The safeguard is the authoritative
// origin (framework_assessment_id); the Finding owns its Action and its validation lifecycle.
export const SEVERITY_LABELS={low:'Low',medium:'Moderate',high:'High',critical:'Critical'};
export const FINDING_STATUS_LABELS={open:'Open',in_remediation:'In remediation',remediated:'Pending Validation',closed:'Closed',accepted:'Accepted'};

export function directFindings(record,related){
  const links=new Set((record.related_links||[]).filter(l=>l.kind==='findings').map(l=>l.id));
  return (related?.findings||[]).filter(f=>f.client_id===record.client_id&&(f.framework_assessment_id===record.framework_assessment_id||links.has(f.finding_id)));
}

export default function BrawndoCisFindings({record,definition,current,ctx,related,writable,busy,finding,setFinding,run,setNested,setFeedback}){
  const findings=directFindings(current,related);
  const disabled=!writable||busy||!ctx,aid=record.framework_assessment_id;
  const start=()=>setFinding({request_id:recordUuid(),title:'',description:'',severity:'medium',owner_id:current.owner_id||'',due_date:'',remediation_title:''});
  const put=(k,v)=>setFinding(p=>({...p,[k]:v}));
  const submit=()=>run(async()=>{
    const {owner_id,...body}=finding;
    // An unchanged owner is inherited from the safeguard (with the existing eligibility fallback).
    await api.post(`/framework_assessments/${aid}/findings`,{...body,due_date:body.due_date||null,...(owner_id!==(current.owner_id||'')?{owner_id:owner_id||null}:{})});
    setFinding(null);
    setFeedback?.('Ticket saved. Assessment changes remain separate.');
  });
  return <section className="bcsg-findings" aria-labelledby="bcsg-findings-heading">
    <div className="bcsg-findings-head"><h3 id="bcsg-findings-heading">Findings</h3>
      {writable&&!finding&&<Button size="sm" variant="outline" disabled={disabled} onClick={start}>Raise Finding</Button>}</div>
    {findings.length?<RemediationTickets records={{...related,findings,tasks:(related.tasks||[]).filter(t=>findings.some(f=>f.finding_id===t.finding_id)),framework_assessments:[current]}} clientId={record.client_id} users={ctx?.users} onOpen={setNested} disabled={busy}/>:<p className="bcsg-muted">No open Findings for this safeguard.</p>}
    {finding&&<fieldset disabled={disabled} className="bcsg-finding-form"><legend>Raise Finding</legend>
      <p className="bcsg-muted" data-testid="finding-origin">Origin: {cisLabel(ctx?.configuration)} · Safeguard {definition.id} — {definition.title}</p>
      <label>Finding title<Input aria-label="Finding title" required value={finding.title} onChange={e=>put('title',e.target.value)}/></label>
      <label>Description<Textarea aria-label="Finding description" maxLength={20000} value={finding.description} onChange={e=>put('description',e.target.value)}/></label>
      <div className="bcsg-finding-grid">
        <label>Severity<select aria-label="Finding severity" value={finding.severity} onChange={e=>put('severity',e.target.value)}>{Object.entries(SEVERITY_LABELS).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
        <label>Target date<Input aria-label="Finding target date" type="date" value={finding.due_date} onChange={e=>put('due_date',e.target.value)}/></label>
      </div>
      <div><span className="bcsg-label">Owner</span><AssigneeSelect clientId={record.client_id} label="Finding owner" value={finding.owner_id} onChange={v=>put('owner_id',v||'')} users={ctx?.users||[]} disabled={disabled} showGuidance={false}/></div>
      <label>Corrective action<Input aria-label="Corrective action" required value={finding.remediation_title} onChange={e=>put('remediation_title',e.target.value)}/></label>
      <p className="bcsg-muted">Creates the Finding and one linked Action Item. Completing the Action moves the Finding to Pending Validation; it is closed only when validated.</p>
      <div className="flex flex-wrap gap-2"><Button size="sm" disabled={disabled||!finding.title.trim()||!finding.remediation_title.trim()} onClick={submit}>Create Finding & Action</Button><Button size="sm" variant="ghost" onClick={()=>setFinding(null)}>Cancel</Button></div>
    </fieldset>}
  </section>;
}
