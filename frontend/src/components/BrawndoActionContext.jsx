import {actionOrigin,pilotPriority,pilotActionStatus,pilotActionMatches} from '@/lib/brawndoActions';
import {DueDate,OwnerCell} from './RegisterCells';
import StatusBadge,{SeverityBadge} from './StatusBadge';
import {GovernanceContextFields} from './RequirementBasis';

export default function BrawndoActionContext({record,form,related,records,users,onOpen,canWrite,onContextChange}){
  const current=record||form,findingId=current.finding_id||(current.source_type==='finding'?current.source_id:null);
  const finding=related.findings?.find(f=>f.finding_id===findingId&&f.client_id===current.client_id)||records.findings?.find(f=>f.finding_id===findingId&&f.client_id===current.client_id);
  const source=actionOrigin(current,{...records,...related},finding);
  const row={raw:current,kind:'tasks',due_date:current.due_date,owner_id:current.assignee_id??current.owner_id};
  return <>
    {record&&<section aria-label="Action details" className="space-y-3 text-sm">
      {pilotActionMatches(row,'overdue')&&<p className="text-semantic-critical">This Action Item is overdue{pilotActionStatus(row)==='in_progress'?' and in progress':''}.</p>}
      <dl className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div><dt className="text-ink-secondary mb-1">Priority</dt><dd><SeverityBadge value={current.priority||'unknown'} label={pilotPriority(current.priority)}/></dd></div>
        <div><dt className="text-ink-secondary mb-1">Status</dt><dd><StatusBadge value={pilotActionStatus(row)} label={{open:'Open',in_progress:'In Progress',overdue:'Overdue',completed:'Completed'}[pilotActionStatus(row)]}/>{['blocked','cancelled'].includes(current.status)&&<p>{current.status}</p>}</dd></div>
        <div><dt className="text-ink-secondary mb-1">Assigned To</dt><dd><OwnerCell people={users} id={row.owner_id} status={current.status}/></dd></div>
        <div><dt className="text-ink-secondary mb-1">Due Date</dt><dd>{current.due_date?<DueDate iso={current.due_date} closed={['done','cancelled'].includes(current.status)}/>: 'No due date'}</dd></div>
      </dl>
      {current.finding_id&&<p>Remediates: {finding?<button className="text-link underline text-left" onClick={()=>onOpen({kind:'findings',record:finding})}>{finding.title}</button>:'Linked Finding unavailable'}</p>}
    </section>}
    <section aria-label="Action Context & Completion Criteria" className="rounded-md border border-line p-4 space-y-4 text-sm break-words">
      <h3 className="font-semibold">Action Context &amp; Completion Criteria</h3>
      <div><h4 className="font-medium mb-1">Originated From</h4>{source.target?<button className="text-link underline text-left" onClick={()=>onOpen({kind:source.kind,record:source.target,initialValues:source.initialValues})}>{source.label}</button>:<p>{source.id?'Linked source unavailable':source.label}</p>}{source.detail&&<p className="text-ink-secondary">{source.detail}</p>}</div>
      <div><h4 className="font-medium mb-1">Finding / Business Need</h4><p className="whitespace-pre-wrap">{finding?.description||finding?.title||form.governance_context?.rationale||record?.framework_purpose||'Business need not documented. Add the context below.'}</p>{[...new Set([record?.reason,record?.context].filter(Boolean))].map(text=><p className="whitespace-pre-wrap mt-2" key={text}>{text}</p>)}</div>
      <div><h4 className="font-medium mb-1">Completion Criteria</h4><p className="whitespace-pre-wrap">{record?.framework_completion_criteria||form.description||finding?.remediation_plan||'Completion criteria not documented. Describe the required outcome in Description below.'}</p>{record?.framework_evidence_expectations&&<p className="mt-2">{record.framework_evidence_expectations}</p>}</div>
      <GovernanceContextFields value={form.governance_context} disabled={!canWrite} onChange={onContextChange} actionContext/>
    </section>
  </>;
}
