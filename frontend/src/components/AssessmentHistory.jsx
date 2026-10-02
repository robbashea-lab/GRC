import {personLabel} from '@/lib/people';
import {operatorStatuses} from '@/lib/frameworkOperator';
import {VERIFICATION_LABELS} from './BrawndoCisControls';

// Saved snapshots remain readable when a framework adopts a different editor.
export default function AssessmentHistory({record,users=[],activity=[]}){
  const statuses=operatorStatuses(record.framework_key),history=record.assessment_history||[];
  return <details className="brawndo-disclosure"><summary>View History</summary>
    <p className="text-xs mt-3">Assessment history · {history.length}</p>
    <ul>{history.slice().reverse().map((entry,i)=><li key={i} className="mt-3 text-sm whitespace-pre-wrap break-words">
      <p className="font-medium">{statuses[entry.status]||entry.status} · {entry.at?.slice(0,10)}</p>
      <p className="text-xs">{personLabel(users,entry.by,'Not recorded')}</p>
      <p>{entry.implementation}</p>
      {entry.notes&&<p>{entry.notes}</p>}
      {entry.technology&&<p>Technology: {entry.technology}</p>}
      {entry.verification&&<p>Verification: {VERIFICATION_LABELS[entry.verification]||entry.verification}</p>}
      {entry.na_rationale&&<p>N/A: {entry.na_rationale}</p>}
      {entry.soa_applicability&&<p>Applicability: {entry.soa_applicability==='included'?'Applicable':'Not Applicable'} · {entry.soa_justification}</p>}
      {!!entry.cis_assessment_criteria?.length&&<p>Assessment criteria: {entry.cis_assessment_criteria.join(', ')}</p>}
      {!!entry.soc_assessment_checks?.length&&<p>Assessment guidance: {entry.soc_assessment_checks.join(', ')}</p>}
      {entry.management_controls?.map(control=><p key={control.control_id} className="mt-2 text-xs">{control.name} · {control.design} / {control.operating} · {control.period_start||'No period'} — {control.period_end} · {control.collected_instances??'—'} / {control.expected_instances??'—'} instances{`\n${control.description||''}\n${control.testing_notes||''}`}</p>)}
    </li>)}</ul>
    {!history.length&&<p className="text-xs mt-3">No saved assessments yet.</p>}
    {!!activity.length&&<><h4 className="mt-4 text-sm font-medium">Activity</h4>{activity.map((entry,i)=><p key={entry.audit_id||i} className="mt-2 text-xs">{entry.action} · {entry.at} · {entry.user_name||entry.user_email}</p>)}</>}
  </details>;
}
