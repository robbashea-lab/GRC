import {useEffect,useState} from 'react';
import api,{formatError} from '@/lib/api';
import {cisReviewBriefs,operationGaps} from '@/lib/cisOperations';

export default function CisReviewBrief({record,onOpen,historical=false}){
  const cid=record?.client_id;
  const [workspace,setWorkspace]=useState(null),[error,setError]=useState('');
  const briefs=cisReviewBriefs(record||{},workspace?.cid===cid?workspace.activeIds:undefined),relevant=!!record&&(record.framework_key==='cis-ig1'||record.framework_drivers?.some(d=>d.framework_key==='cis-ig1'));
  useEffect(()=>{if(!relevant||!cid)return;const c=new AbortController();setWorkspace(null);setError('');Promise.all([api.get('/frameworks/cis-ig1',{params:{client_id:cid},signal:c.signal}),api.get('/contacts',{params:{client_id:cid},signal:c.signal}),api.get(`/clients/${cid}/members`,{signal:c.signal})]).then(([{data},contacts,members])=>{if(!c.signal.aborted)setWorkspace({cid,rows:data.assessments,activeIds:data.active_definition_ids,contacts:contacts.data,members:members.data});}).catch(e=>{if(!c.signal.aborted)setError(formatError(e));});return()=>c.abort();},[cid,relevant]);
  if(!relevant)return null;
  return <details className="border border-line rounded p-3 text-sm" data-testid="cis-review-brief">
    <summary className="cursor-pointer font-medium">CIS execution brief</summary>
    <p className="text-xs text-ink-secondary my-3">Current shared CIS v8.1 guidance—not {historical?'a replacement for the historical conclusion':'a mandatory checklist'}. Client-written descriptions and completed history are unchanged. Supporting records may be combined; no separate upload is required.</p>
    {briefs.map(brief=><section key={brief.key} className="space-y-2 mb-3">
      <h3 className="font-medium">{brief.title}{!brief.active&&' · Retained program mapping'}</h3>
      <p className="text-xs text-ink-secondary">Governance schedule: {record.recurrence||'Not scheduled'} · Operational duties: {brief.source_cadence}</p>
      {brief.ig2_operating_context&&brief.items.some(d=>d.implementation_group===2)&&<p className="text-xs text-ink-secondary">{brief.ig2_operating_context}</p>}
      <ul className="space-y-3">{brief.items.map(d=>{const row=workspace?.cid===cid&&workspace.rows?.find(r=>r.definition_id===d.id);return <li key={d.id}>
        {row?<button className="text-link text-left" onClick={event=>onOpen(row,event.currentTarget)}>{d.id} · {d.title}</button>:<span>{d.id} · {d.title} · {error?'Assessment unavailable':workspace?'No retained assessment':'Loading assessment link…'}</span>}
        <p>{d.review}</p><p className="text-xs text-ink-secondary">Expected outcome: {d.outcome}</p><p className="text-xs text-ink-secondary">Supporting examples: {d.evidence}</p><p className="text-xs text-ink-secondary">Operation / trigger: {d.source_cadence}</p>
        {d.operating_guidance&&<p className="text-xs text-ink-secondary">Suggested client role: {d.operating_guidance.accountable_role} · {d.operating_guidance.client_provider_split}</p>}
        {row&&<div className="text-xs text-ink-secondary"><p>Accountable person: {workspace.contacts?.find(c=>c.contact_id===row.process_owner_id)?.name||workspace.members?.find(u=>u.user_id===row.owner_id)?.name||'Not confirmed / retained person unavailable'}</p><p>Provider responsibility: {row.cis_operation?.provider||'Not recorded'}</p><p>Operating method / reference: {row.implementation?.slice(0,400)||'Not recorded'}</p>{!!operationGaps(row).length&&<p>Setup and timing check unresolved: {operationGaps(row).join(' · ')}. Confirm the operating frequency or event trigger separately from this Review; use Findings and Actions for follow-up.</p>}</div>}
      </li>;})}</ul>
    </section>)}
    {error&&<p role="alert" className="text-xs">Safeguard links could not be loaded: {error}</p>}
  </details>;
}
