import {ticketRecords,ticketStage} from '@/lib/remediationTickets';
import {actionStatus,actionMatches} from '@/lib/actionItems';
import {personLabel} from '@/lib/people';
import {calendarDay} from '@/lib/tableFilters';

const severityColors={low:'#6b7686',medium:'#d08a1a',high:'#e0582f',critical:'#c81e1e'};
const severityLabels={low:'Low',medium:'Medium',high:'High',critical:'Critical'};
function displayDate(value) {
  const day=calendarDay(value);
  return day==null?null:new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(day));
}

// Cards keep the native ticket model, including unavailable/ambiguous primary Actions.
export default function BrawndoSafeguard11Findings({records,clientId,users=[],onOpen,disabled=false}) {
  const tickets=ticketRecords(records,clientId).filter(ticket=>ticket.finding);
  return <ul className="sg11-findings" aria-label="Remediation tickets">{tickets.map(ticket=>{
    const finding=ticket.finding,action=ticket.primary,created=displayDate(finding.created_at),due=displayDate(action?.due_date),overdue=action&&actionMatches(action,'overdue');
    const source=(records.framework_assessments||[]).find(record=>record.client_id===clientId&&record.framework_assessment_id===finding.framework_assessment_id);
    return <li key={ticket.ticketId} data-ticket-id={ticket.ticketId} className="sg11-finding-card" style={{'--severity-color':severityColors[finding.severity]||'var(--sg-muted)'}}>
      <header>
        <div className="sg11-finding-meta"><span className={`sg11-chip sg11-severity ${finding.severity==='medium'?'warn':['high','critical'].includes(finding.severity)?'crit':'plain'}`}>{severityLabels[finding.severity]?`${severityLabels[finding.severity]} finding`:'Severity not recorded'}</span>{created&&<span>Raised {created}</span>}{finding.assessment_item_id&&<span className="sg11-chip info">From items to address</span>}</div>
        <h4><button type="button" disabled={disabled||!onOpen} onClick={()=>onOpen({kind:'findings',record:finding})}>{finding.title}</button></h4>
      </header>
      <p className="sg11-finding-description">{finding.description||'Issue description not recorded'}</p>
      <details className="sg11-finding-details"><summary>Finding details</summary><p>{ticketStage(ticket).replaceAll('_',' ')}</p>{finding.framework_assessment_id&&<p>Source: {source?`${source.framework_key} · ${source.definition_id}`:finding.framework_assessment_id}</p>}</details>
      <div className="sg11-finding-action">{action?<>
        <span className="sg11-action-title">Action: <strong>{action.title}</strong></span>
        <span className={`sg11-chip ${action.status==='open'?'plain':'info'}`}>{actionStatus(action.status)||'Status not recorded'}</span>
        <span className="sg11-chip plain">{personLabel(users,action.assignee_id??action.owner_id,'Unassigned')}</span>
        {due&&<span className={`sg11-chip ${overdue?'crit':'plain'}`}>{overdue?'Overdue · Due':'Due'} {due}</span>}
        <button type="button" disabled={disabled||!onOpen} onClick={()=>onOpen({kind:'tasks',record:action})}>Open action item</button>
      </>:<span>{ticket.diagnostic||'Primary Action unavailable'}</span>}</div>
    </li>;
  })}</ul>;
}
