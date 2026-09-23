import {BUSINESS_BASIS,CADENCE_BASIS,requirementBasis,cadenceBasis,referenceUrl} from '@/lib/requirementBasis';
import {Input} from './ui/input';
import {Textarea} from './ui/textarea';

export function SourceReference({url,children}) {
  const href=referenceUrl(url);
  return href?<a href={href} target="_blank" rel="noopener noreferrer" className="text-link underline underline-offset-2">{children}</a>:<span>{children}</span>;
}
export function GovernanceContextFields({value={},onChange,disabled=false,cadence=false}) {
  const context=value||{},put=(k,v)=>onChange({...context,[k]:v});
  const select=(key,label,options)=><label className="block text-sm">{label}<select aria-label={label} className="w-full border border-line rounded-md bg-surface-card p-2 mt-1" value={context[key]||''} onChange={e=>put(key,e.target.value)}><option value="">Not recorded</option>{Object.entries(options).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>;
  return <details className="border-t border-line pt-3"><summary className="cursor-pointer text-sm font-medium">Reason / context{cadence?' & cadence rationale':''}</summary><fieldset disabled={disabled} className="space-y-3 mt-3">
    <p className="text-xs text-ink-secondary">Organization-entered context. This does not change requirement assessments or verify an external mandate.</p>
    {select('category','Business basis',BUSINESS_BASIS)}
    <label className="block text-sm">Reason / context<Textarea aria-label="Reason / context" maxLength={4000} value={context.rationale||''} onChange={e=>put('rationale',e.target.value)}/></label>
    {cadence&&<>{select('cadence_source','Cadence basis',CADENCE_BASIS)}<label className="block text-sm">Cadence rationale<Textarea aria-label="Cadence rationale" maxLength={4000} value={context.cadence_rationale||''} onChange={e=>put('cadence_rationale',e.target.value)}/></label></>}
    <label className="block text-sm">Citation / decision reference<Input aria-label="Citation / decision reference" maxLength={1000} value={context.citation||''} onChange={e=>put('citation',e.target.value)}/></label>
    <label className="block text-sm">Reference URL (optional HTTPS)<Input aria-label="Reference URL" maxLength={2000} value={context.reference_url||''} onChange={e=>put('reference_url',e.target.value)}/></label>
  </fieldset></details>;
}
export default function RequirementBasis({kind,record,related={},onOpen,loading=false,error='',historical=false,users=[]}) {
  if(!record)return null;
  const groups=requirementBasis(kind,record,related),context=record.governance_context||{},cadence=cadenceBasis(record,groups);
  return <section aria-label="Requirement basis" className="border border-line rounded-md p-3 space-y-3 text-sm break-words">
    <h3 className="font-semibold">{kind==='policies'?'Governance basis':'Requirement basis'}</h3>
    {loading&&<p role="status">Loading linked requirements…</p>}{error&&<p role="alert">Requirement relationships could not be loaded. {error}</p>}
    {historical&&<p className="text-xs text-ink-secondary">Occurrence context is preserved; linked assessments and catalog references show their current state.</p>}
    {record.created_at&&<p className="text-xs text-ink-secondary">Created {String(record.created_at).slice(0,10)}{record.created_by? ` · ${users.find(u=>u.user_id===record.created_by)?.name||'Recorded actor: '+record.created_by}`:''}</p>}
    {(record.framework_plan_key||record.baseline_key)&&<p className="text-xs text-ink-secondary">{record.framework_plan_key?'Linked framework plan':'Program baseline relationship'} · association does not establish the original creation method.</p>}
    {kind!=='tasks'&&['review','finding','risk','policy','vendor'].filter(type=>record[type+'_id']&&type+'s'!==kind&&!(type==='policy'&&kind==='policies')).map(type=>{
      const sourceKind=type==='policy'?'policies':type+'s',key=type+'_id',target=(related[sourceKind]||[]).find(r=>r[key]===record[key]&&r.client_id===record.client_id);
      return <p key={type} className="text-xs">Source {type}: {target?<button className="text-link underline text-left" onClick={()=>onOpen?.({kind:sourceKind,record:target})}>{target.title||target.name}</button>:loading?'Loading…':'Linked record unavailable'}</p>;
    })}
    {context.category&&<p className="font-medium">{BUSINESS_BASIS[context.category]}</p>}
    {(context.rationale||record.framework_purpose||kind==='policies'&&record.summary)&&<div><h4 className="text-xs text-ink-secondary">Why this exists</h4><p className="whitespace-pre-wrap">{context.rationale||record.framework_purpose||record.summary}</p></div>}
    {(record.framework_evidence_expectations||record.framework_completion_criteria)&&<details><summary className="cursor-pointer text-xs font-medium">Evidence &amp; completion guidance</summary><div className="text-xs space-y-2 mt-2">{record.framework_evidence_expectations&&<p>{record.framework_evidence_expectations}</p>}{record.framework_completion_criteria&&<p>{record.framework_completion_criteria}</p>}</div></details>}
    {!groups.length&&!loading&&!error&&<p className="text-ink-secondary">No external requirement basis recorded. Organizational work does not require a framework association.</p>}
    {groups.map(group=><details key={group.key} open={groups.length===1&&group.requirements.length<=5} className="border-t border-line pt-2">
      <summary className="cursor-pointer font-medium">{group.label} <span className="font-normal text-xs text-ink-secondary">· {group.requirements.length} references · Supports requirements</span></summary>
      <p className="text-xs text-ink-secondary mt-2">{group.version} · Supporting relationship, not proof of conformity or a prescribed standalone document.</p>
      {group.policyMappings.map((m,i)=><p key={i} className="mt-2 text-xs">{m.rationale||m.reason||m.basis}</p>)}
      <ul className="divide-y divide-line mt-2">{group.requirements.map(({definition:d,assessment,classification})=><li className="py-2 space-y-1" key={d.id}>
        <div className="font-medium">{assessment&&onOpen?<button className="text-link underline text-left" onClick={()=>onOpen({kind:'framework_assessments',record:assessment})}>{d.id} · {d.title}</button>:`${d.id} · ${d.title}`}</div>
        <p className="text-xs text-ink-secondary">Requirement classification: {classification}{assessment?.soa_applicability?` · SoA: ${assessment.soa_applicability}`:''}{assessment?.status==='not_applicable'?' · Assessed Not Applicable':''}</p>
        {d.specification==='addressable'&&<p className="text-xs">Addressable is not optional; the assessment records the scoped decision and rationale.</p>}
        <p className="text-xs"><SourceReference url={d.source}>{d.source_organization||group.label} · {d.id}</SourceReference>{d.verified_on&&` · Catalog verified ${d.verified_on}`}</p>
      </li>)}</ul>
    </details>)}
    {kind==='reviews'&&<div className="border-t border-line pt-3 space-y-2"><h4 className="font-medium">Cadence · {cadence.current}</h4><p className="text-xs text-ink-secondary">{cadence.classification}</p>{cadence.rationale&&<p>{cadence.rationale}</p>}
      {cadence.sources.map(s=><details key={s.key}><summary className="cursor-pointer text-xs font-medium">{s.framework} · Source vs configured cadence</summary><div className="mt-2 space-y-2 text-xs"><p>{s.source}</p>{s.minimum&&<p>Explicit source interval: {s.minimum}. Applies to the cited activity, not necessarily every operational safeguard in this Review.</p>}<p>Omnisciente setup default: {s.recommended}. A matching client schedule does not establish approval or an external mandate.</p>{s.reason&&<p>{s.reason}</p>}{s.refs.map((r,i)=><p key={i}><SourceReference url={r.source}>{r.definition_id} · {r.interval}</SourceReference></p>)}</div></details>)}
    </div>}
    {kind==='policies'&&<div className="border-t border-line pt-2"><h4 className="font-medium">Review cadence</h4><p className="text-xs text-ink-secondary">Linked Reviews own the schedule; no annual frequency is inferred from a review date.</p>{(related.reviews||[]).filter(r=>r.client_id===record.client_id&&r.policy_id===record.policy_id).map(r=><button key={r.review_id} className="block text-link underline text-left mt-1" onClick={()=>onOpen?.({kind:'reviews',record:r})}>{r.title} · {r.recurrence||'Not scheduled'}</button>)}{context.cadence_rationale&&<p className="mt-2">{CADENCE_BASIS[context.cadence_source]||'Organization-entered'} · {context.cadence_rationale}</p>}</div>}
    {(context.citation||context.reference_url)&&<p className="text-xs">Organization-entered reference: <SourceReference url={context.reference_url}>{context.citation||context.reference_url}</SourceReference></p>}
    {record.framework_driver_active===false&&<p className="text-xs text-ink-secondary">Historical framework association retained. Existing Review recurrence remains until explicitly retired.</p>}
  </section>;
}
