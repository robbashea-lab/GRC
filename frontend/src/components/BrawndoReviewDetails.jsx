import {requirementBasis,cadenceBasis,BUSINESS_BASIS} from '@/lib/requirementBasis';
import {pilotReviewStatus,pilotReviewMatches,REVIEW_STATUS} from '@/lib/brawndoReviews';
import {reviewDisplayValue} from '@/lib/reviewPresentation';
import {GovernanceContextFields,SourceReference} from './RequirementBasis';
import {DueDate,HistoryDate,OwnerCell} from './RegisterCells';
import StatusBadge from './StatusBadge';
import './BrawndoReviews.css';

export function ReviewFacts({record,users,history=[],status:statusOverride}) {
  if (!record) return null;
  const status=statusOverride??pilotReviewStatus(record),last=record.last_completed_at||record.last_completed||record.completion_date||history[0]?.completed_at;
  return <section aria-label="Review details" className="space-y-3">
    {pilotReviewMatches(record,'overdue')&&<p role="note" className="text-sm text-semantic-critical">This Review is overdue{status==='in_progress'?' and in progress':''}.</p>}
    {status==='needs_scheduling'&&<p role="note" className="text-sm text-ink-secondary">Set a due date to schedule this Review.</p>}
    <dl className="review-facts-grid">
      {[['Status',<StatusBadge value={status} label={REVIEW_STATUS[status]}/>],
        ['Assigned Reviewer',<OwnerCell people={users} id={record.owner_id} status={record.status}/>],
        ['Due Date',<DueDate iso={record.due_date} closed={['completed','cancelled'].includes(status)}/>],
        ['Last Completed',<HistoryDate value={last} empty="Not recorded"/>],
        ['Cadence',record.recurrence==='custom'?`Every ${record.custom_recurrence_days} days`:reviewDisplayValue('recurrence',record.recurrence)||'Not documented'],
        ['Next Due',<HistoryDate value={record.next_review_date} empty="Not scheduled"/>]
      ].map(([label,value])=><div key={label}><dt className="text-xs text-ink-secondary mb-1">{label}</dt><dd>{value}</dd></div>)}
    </dl>
  </section>;
}

export default function ReviewExpectations({record,related,policies,onOpen,loading,error,historical,onChange,disabled,policyPicker,reviewLayout=false}) {
  const groups=requirementBasis('reviews',record,related),context=record.governance_context||{},cadence=cadenceBasis(record,groups);
  const policy=policies.find(p=>p.client_id===record.client_id&&p.policy_id===record.policy_id);
  const expectation=[context.rationale,record.framework_purpose,record.scope].filter((v,i,a)=>v&&a.indexOf(v)===i);
  const originContent=<>
      {record.policy_id&&<p>Policy: {policy?<button type="button" className="text-link underline text-left" onClick={()=>onOpen({kind:'policies',record:policy})}>{policy.title}</button>:'Linked policy unavailable'}</p>}
      {policyPicker}
      {['risk','vendor'].filter(k=>record[k+'_id']).map(k=>{
        const item=related[k+'s']?.find(r=>r[k+'_id']===record[k+'_id']&&r.client_id===record.client_id);
        return <p key={k}>{k==='risk'?'Risk':'Vendor'}: {item?<button type="button" className="text-link underline" onClick={()=>onOpen({kind:k+'s',record:item})}>{item.title||item.name}</button>:'Linked record unavailable'}</p>;
      })}
  </>;
  return <section aria-label="Requirement & Review Expectations" className={reviewLayout?"space-y-4 text-sm break-words":"border border-line rounded-md p-4 space-y-4 text-sm break-words"}>
    {!reviewLayout&&<h3 className="font-semibold">Requirement &amp; Review Expectations</h3>}
    {loading&&<p role="status">Loading linked requirements…</p>}
    {error&&<p role="alert">Requirement relationships could not be loaded. {error}</p>}
    {historical&&<p className="text-xs text-ink-secondary">Occurrence context is preserved; linked records and catalog references show their current state.</p>}
    <div className={reviewLayout?'review-requirements-grid':undefined}>
      <div className={reviewLayout?'review-requirements-column':undefined}>
    <section className="review-requirements-section"><h4 className="font-medium mb-1">Requirement Source</h4>
      {reviewLayout&&groups.map(g=><p key={g.key}>{g.label} · {g.version}</p>)}
      {context.category&&<p>{context.category==='organizational'?'Organization-defined requirement':BUSINESS_BASIS[context.category]}</p>}
      {!groups.length&&!context.category&&!record.policy_id&&<p className="text-ink-secondary">Requirement source not documented.</p>}
      {!reviewLayout&&originContent}

      {(context.citation||context.reference_url)&&<p className="mt-2">Organization-entered reference: <SourceReference url={context.reference_url}>{context.citation||context.reference_url}</SourceReference></p>}
    </section>
    <section className="review-requirements-section"><h4 className="font-medium mb-1">Review Expectation</h4>
      {expectation.length?expectation.map((text,i)=><p key={i} className="whitespace-pre-wrap">{text}</p>):<p className="text-ink-secondary">Review expectation not documented.</p>}
      {(record.framework_evidence_expectations||record.framework_completion_criteria)&&<section className="mt-2"><h4 className="cursor-pointer">Evidence &amp; completion guidance</h4><p>{record.framework_evidence_expectations}</p><p>{record.framework_completion_criteria}</p></section>}
    </section>
      </div>
      <div className={reviewLayout?'review-requirements-column':undefined}>
    <section className="review-requirements-section"><h4 className="font-medium mb-1">Review Frequency</h4>
      <p>{record.recurrence==='custom'?cadence.current:reviewDisplayValue('recurrence',record.recurrence)||'Not documented'} — {cadence.classification}</p>
      {cadence.rationale&&<p className="whitespace-pre-wrap">{cadence.rationale}</p>}
      {cadence.belowSource&&<p role="note" className="text-semantic-duesoon-text">The configured schedule is less frequent than an active source interval. Check the cited activity.</p>}
      {!!cadence.sources.length&&<section className="mt-2"><h4 className="cursor-pointer">Source cadence references</h4>
        <p className="text-xs text-ink-secondary mt-2">A framework mapping alone does not mandate this Review or its configured frequency.</p>
        {cadence.sources.map((s,i)=><div key={i} className="mt-2"><p>{s.framework}{s.active===false?' · Historical driver (inactive)':''}: {s.source||'Source cadence not documented'}</p>
          {s.reason&&<p>{s.reason}</p>}
          {s.minimum&&<p>Explicit source interval: {s.minimum} — applies to the cited activity.</p>}
          {s.recommended&&<p className="text-xs">Suggested setup cadence: {s.recommended}; not automatically a source requirement.</p>}
          {s.refs.map((ref,j)=><p key={j}><SourceReference url={ref.source}>{ref.definition_id} · {ref.interval}</SourceReference></p>)}
        </div>)}
      </section>}
    </section>
        <section className="review-requirements-section">
          {reviewLayout&&<h4 className="font-medium mb-1">Related framework items</h4>}
      {groups.map(g=><section key={g.key} className="mt-2"><h4 className="">Supports {g.label} · {g.requirements.map(r=>r.definition.id).join(', ')}</h4>
        <ul className="mt-2 space-y-2">{g.requirements.map(({definition:d,assessment})=><li key={d.id}>
          {assessment?<button type="button" className="text-link underline text-left" onClick={()=>onOpen({kind:'framework_assessments',record:assessment})}>{d.id} · {d.title}</button>:<span>{d.id} · {d.title}</span>}
          <div className="text-xs"><SourceReference url={d.source}>{d.source_organization||g.label} · Official reference</SourceReference></div>
        </li>)}</ul>
      </section>)}
        </section>
        {reviewLayout&&(record.policy_id||record.risk_id||record.vendor_id||policyPicker)&&<section className="review-requirements-section"><h4 className="font-medium mb-1">Originating record</h4>{originContent}</section>}
      </div>
    </div>
    {record.framework_driver_active===false&&<p className="text-xs text-ink-secondary">Historical framework association retained. Review recurrence remains until explicitly retired.</p>}
    <GovernanceContextFields expanded value={context} cadence disabled={disabled} onChange={onChange} reviewExpectations/>
  </section>;
}
