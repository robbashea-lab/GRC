import {ticketRecords,ticketStage} from '@/lib/remediationTickets';
import {actionOrigin} from '@/lib/brawndoActions';
import {personLabel} from '@/lib/people';

export default function RemediationTickets({records,clientId,users=[],onOpen,disabled=false}) {
  const tickets=ticketRecords(records,clientId);
  return <ul className="space-y-3" aria-label="Remediation tickets">{tickets.map(t=>{
    const origin=actionOrigin(t.raw,records,t.finding);
    return <li key={t.ticketId} className="border border-line rounded p-3 text-sm" data-ticket-id={t.ticketId}>
      <button type="button" className="text-link text-left font-medium" disabled={disabled} onClick={()=>onOpen({kind:t.kind,record:t.raw})}>{t.title}</button>
      {t.finding&&<p className="line-clamp-2">Finding: {t.issue||'Issue description not recorded'}</p>}
      {origin.id&&<p>Originated from: {origin.target?<button type="button" disabled={disabled} className="text-link underline text-left" onClick={()=>onOpen({kind:origin.kind,record:origin.target,initialValues:origin.initialValues})}>{origin.label}{origin.detail?' · '+origin.detail:''}</button>:<span>{origin.label} · {origin.id} · unavailable</span>}</p>}
      <p className="text-xs text-ink-secondary">{ticketStage(t).replaceAll('_',' ')} · {personLabel(users,t.owner_id,'Unassigned')} · {t.due_date?'Due '+t.due_date.slice(0,10):'No due date'}</p>
      {t.diagnostic&&<p className="text-xs">{t.diagnostic}</p>}
    </li>;
  })}</ul>;
}
