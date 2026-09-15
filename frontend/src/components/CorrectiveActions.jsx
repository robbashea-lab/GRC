import StatusBadge from './StatusBadge';
import {actionStatus} from '@/lib/actionItems';

const date=value=>value?new Date(String(value).slice(0,10)+'T00:00:00').toLocaleDateString():'—';

// Current authoritative task records; no copied remediation status or evidence store.
export default function CorrectiveActions({actions=[],members=[],onOpen,itemTestId='corrective-action'}) {
  const person=id=>members.find(m=>m.user_id===id)?.name||members.find(m=>m.user_id===id)?.email||(id?'Assigned user':'Not recorded');
  return actions.length?actions.map(action=><div key={action.task_id} data-testid={itemTestId} className="border-t border-line pt-2 space-y-1 text-sm">
    <div><span className="text-ink-secondary">Corrective Action: </span>{onOpen?<button type="button" className="underline text-left" onClick={()=>onOpen(action)}>{action.title}</button>:<span>{action.title}</span>}</div>
    <div>Current Action Status: <StatusBadge value={action.status==='done'?'completed':action.status}/></div>
    <div className="text-ink-secondary">Owner: {action.assignee_id||action.owner_id?person(action.assignee_id||action.owner_id):'Unassigned'} · Due: {date(action.due_date)}</div>
    {action.status==='done'&&<div className="text-xs text-ink-help">Completed {action.completed_at?date(action.completed_at):'date not recorded'} · By {person(action.completed_by)}</div>}
    {action.status==='cancelled'&&<p className="text-xs text-ink-help">{actionStatus(action.status)} · No longer required under the existing remediation workflow.</p>}
  </div>):<p className="text-sm text-ink-help">No linked corrective actions.</p>;
}
