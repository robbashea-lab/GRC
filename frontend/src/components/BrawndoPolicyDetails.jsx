import {useEffect,useState} from 'react';
import api,{formatError} from '@/lib/api';
import {toast} from 'sonner';
import {POLICY_STATUS,policyAlignment,alignmentFallback,policyStatus,policyStatusLabel} from '@/lib/brawndoPolicies';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from './ui/select';
import {displayDay} from '@/lib/managementDates';
import {personLabel} from '@/lib/people';
import {ApprovalSubject} from './PolicyApprovalSubject';
import {SourceReference} from './RequirementBasis';

export function PolicyStatusField({record,disabled,onChange}) {
  const value=policyStatus(record),options={...POLICY_STATUS};
  if(!options[value])options[value]=policyStatusLabel(value);
  return <fieldset disabled={disabled} className="space-y-1.5">
    <label className="text-xs text-ink-secondary" htmlFor="policy-status">Policy Status</label>
    <Select value={value} onValueChange={onChange}><SelectTrigger id="policy-status"><SelectValue/></SelectTrigger><SelectContent>
      {Object.entries(options).map(([key,label])=><SelectItem key={key} value={key} disabled={['approved','pending_approval','in_review','retired','not_applicable'].includes(key)&&key!==value}>{label}</SelectItem>)}
    </SelectContent></Select>
    <p className="text-xs text-ink-secondary">{record.policy_id?'Use the document approval controls below for review and approval.':'Create the record, then attach its document and use the approval controls.'} Selecting a status does not record approval.</p>
  </fieldset>;
}

export function PolicyAlignment({record,programs=[],assessments=[],onOpen}) {
  const refs=policyAlignment(record,programs,assessments),[busy,setBusy]=useState(false);
  async function open(ref) {
    setBusy(true);
    try {
      const {data}=await api.get('/frameworks/'+ref.key,{params:{client_id:record.client_id}});
      const assessment=data.assessments?.find(a=>a.client_id===record.client_id&&a.definition_id===ref.id);
      if(!assessment)throw new Error('This requirement is not available in the current client assessment.');
      onOpen({kind:'framework_assessments',record:assessment});
    }catch(e){toast.error(formatError(e));}finally{setBusy(false);}
  }
  if(!refs.length)return <span className="text-xs text-ink-secondary">{alignmentFallback(record)}</span>;
  const groups=[...new Set(refs.map(r=>r.key))];
  return <div className="space-y-1 text-xs">{groups.map(key=>{
    const group=refs.filter(r=>r.key===key),first=group[0];
    return <div key={key}><span>Supports {first.label} · v{first.version}</span><div className="flex flex-wrap gap-x-2 gap-y-1">{group.map(ref=><button key={ref.id} type="button" disabled={busy} title={ref.title} className="text-link underline underline-offset-2 py-1 text-left" onClick={e=>{e.stopPropagation();open(ref);}}>{ref.id}</button>)}</div></div>;
  })}</div>;
}

export default function BrawndoPolicyDetails({record,related={},users=[],onOpen}) {
  const [programs,setPrograms]=useState([]),[error,setError]=useState('');
  useEffect(()=>{const c=new AbortController();setPrograms([]);setError('');api.get('/frameworks/summary',{params:{client_id:record.client_id},signal:c.signal}).then(({data})=>{if(!c.signal.aborted&&data.client_id===record.client_id)setPrograms(data.items.filter(p=>p.tracking_available).map(p=>p.key));}).catch(e=>{if(!c.signal.aborted)setError(formatError(e));});return()=>c.abort();},[record.client_id]);
  const reviews=(related.reviews||[]).filter(r=>r.client_id===record.client_id&&(r.policy_id===record.policy_id||r.policy_ids?.includes(record.policy_id)));
  const purpose=record.governance_context?.rationale||record.framework_purpose||record.summary;
  const cadenceRefs=policyAlignment(record,programs,related.framework_assessments).filter(r=>r.sourceCadence&&/annual|month|quarter|day/i.test(r.sourceCadence));
  const approved=[...(record.approval_history||[]).filter(h=>h.action==='approved'),...(record.decision_history||[]).filter(h=>h.action==='external_approval_recorded')].sort((a,b)=>String(b.at||b.recorded_at).localeCompare(String(a.at||a.recorded_at)))[0];
  return <div className="space-y-5">
    {record.policy_id&&<dl className="grid grid-cols-2 md:grid-cols-5 gap-3 rounded-md bg-surface-subtle p-3 text-sm">{[['Policy Status',policyStatusLabel(policyStatus(record))],['Version',record.version||'Not recorded'],['Owner',personLabel(users,record.owner_id)],['Last Reviewed',displayDay(record.last_reviewed_at)||'Not recorded'],['Next Review',displayDay(record.next_review_date)||'Not scheduled']].map(([label,value])=><div key={label}><dt className="text-xs text-ink-secondary">{label}</dt><dd className="mt-1 break-words">{value}</dd></div>)}</dl>}
    <section aria-label="Policy Requirements & Framework Alignment" className="space-y-3 text-sm border-b border-line pb-4">
      <h3 className="font-semibold">Policy Requirements &amp; Framework Alignment</h3>
      <div><h4 className="font-medium text-xs mb-1">Framework Alignment</h4>{error?<p role="alert">Alignment could not be loaded: {error}</p>:<PolicyAlignment record={record} programs={programs} assessments={related.framework_assessments} onOpen={onOpen}/>}</div>
      {purpose&&<div><h4 className="font-medium text-xs">Policy Purpose</h4><p className="whitespace-pre-wrap break-words">{purpose}</p></div>}
      <div><h4 className="font-medium text-xs">Review Schedule</h4><p className="text-ink-secondary">{reviews.length?'Linked Reviews own the schedule shown below.':'Annual is the organization-selected default; no Review date is inferred from document creation.'} Review following significant changes is an expectation, not a recorded completion or a universal framework mandate.</p>
        {reviews.map(r=><button key={r.review_id} type="button" className="block text-link underline mt-1 text-left" onClick={()=>onOpen({kind:'reviews',record:r})}>{r.title} · {r.recurrence||'Not scheduled'} · {displayDay(r.due_date)||'No due date'}</button>)}
        {!!cadenceRefs.length&&<details className="mt-2 text-xs"><summary className="cursor-pointer">Referenced activity frequencies</summary><p className="mt-1 text-ink-secondary">These apply to the cited activities, not automatically to every Policy review.</p>{cadenceRefs.map(r=><p className="mt-1" key={r.key+r.id}><SourceReference url={r.source}>{r.label} {r.id}</SourceReference> · {r.sourceCadence}</p>)}</details>}
      </div>
    </section>
    {record.status!=='approved'&&approved&&<section className="space-y-1 text-sm"><h3 className="font-medium">Last approved version — retained during revision</h3><ApprovalSubject subject={approved.subject}/><p className="text-xs text-ink-secondary">The current draft is not approved. Its upload does not replace this approval or change the review schedule.</p></section>}
  </div>;
}
