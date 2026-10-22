import {useId} from 'react';
import AssigneeSelect from './AssigneeSelect';
import {safeguard11DueDate} from '@/lib/brawndoSafeguard11';
import {personLabel} from '@/lib/people';
import {calendarDay} from '@/lib/tableFilters';

const SEVERITIES=[['low','Low','Minor gap, little exposure'],['medium','Medium','Limited exposure'],['high','High','Material gap, fix soon'],['critical','Critical','Active exposure, fix now']];

// Presentation only: the assessment controller retains draft identity, validation and submission.
export default function BrawndoSafeguard11FindingFields({finding,onChange,record,definition,current,users=[],disabled=false,clientId,implementationGroup,onCancel,onSubmit}){
  const id=useId();
  const ownerLabel=personLabel(users,finding.owner_id);
  const inheritsOwner=!!finding.owner_id&&finding.owner_id===(current.owner_id||'');
  const severity=SEVERITIES.find(([value])=>value===finding.severity)?.[1]||finding.severity;
  const dueDay=calendarDay(finding.due_date);
  const dueLabel=dueDay===null?finding.due_date:new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(dueDay));
  const sourceAccepted=!!clientId&&[1,2,3].includes(implementationGroup)&&definition.id==='1.1'
    &&typeof record.framework_assessment_id==='string'&&!!record.framework_assessment_id.trim()
    &&[record,current].every(row=>row?.client_id===clientId&&row.framework_key==='cis-ig1'
      &&row.framework_version==='8.1'&&row.definition_id==='1.1'&&row.framework_assessment_id===record.framework_assessment_id);
  return <div className="sg11-finding-fields">
    <div className="sg11-finding-context">{sourceAccepted?<><span className="sg11-chip sg11-chip-plain">From CIS IG{implementationGroup} assessment</span><span className="sg11-chip sg11-chip-info" title={definition.title}>Safeguard {definition.id}</span></>:'Assessment context unavailable'}</div>
    <fieldset disabled={disabled} className="sg11-finding-inputs">
      <section className="sg11-finding-card" aria-labelledby={`${id}-wrong`}>
        <div className="sg11-finding-card-heading"><span className="sg11-finding-number">1</span><h3 id={`${id}-wrong`}>What's wrong</h3><span>Creates the finding</span></div>
        <label className="sg11-field"><span>Finding title <span className="sg11-required" aria-hidden="true">*</span></span><input className="sg11-input" aria-label="Finding title" required maxLength={500} value={finding.title} onChange={event=>onChange('title',event.target.value)}/></label>
        <label className="sg11-field">Description<textarea className="sg11-input" aria-label="Finding description" maxLength={20000} value={finding.description} onChange={event=>onChange('description',event.target.value)}/></label>
        <div className="sg11-field"><span id={`${id}-severity`}>Severity</span><div className="sg11-finding-severity" role="group" aria-labelledby={`${id}-severity`}>
          {SEVERITIES.map(([value,label,hint])=><button type="button" key={value} data-severity={value} aria-pressed={finding.severity===value} onClick={()=>onChange('severity',value)}><b>{label}</b><small>{hint}</small></button>)}
        </div></div>
      </section>
      <section className="sg11-finding-card" aria-labelledby={`${id}-fix`}>
        <div className="sg11-finding-card-heading"><span className="sg11-finding-number">2</span><h3 id={`${id}-fix`}>How it gets fixed</h3><span>Creates the action item</span></div>
        <label className="sg11-field"><span>Corrective action <span className="sg11-required" aria-hidden="true">*</span></span><input className="sg11-input" aria-label="Corrective action" required maxLength={500} value={finding.remediation_title} onChange={event=>onChange('remediation_title',event.target.value)}/></label>
        <div className="sg11-finding-row">
          <div className="sg11-field"><span>Owner</span><AssigneeSelect clientId={clientId} label="Finding owner" value={finding.owner_id} onChange={value=>onChange('owner_id',value||'')} users={users} disabled={disabled} showGuidance={false} popoverClassName="sg11-owner-popover"/></div>
          <div className="sg11-field"><label htmlFor={`${id}-due`}>Due date <small>(optional)</small></label><input id={`${id}-due`} className="sg11-input" aria-label="Finding target date" type="date" value={finding.due_date||''} onChange={event=>onChange('due_date',event.target.value)}/>
            <div className="sg11-finding-quick" role="group" aria-label="Quick due dates">{[14,30,60,90].map(days=><button type="button" key={days} onClick={()=>onChange('due_date',safeguard11DueDate(days))}>{days===14?'2 weeks':`${days} days`}</button>)}</div>
          </div>
        </div>
      </section>
    </fieldset>
    <footer className="sg11-finding-footer">
      <p className="sg11-finding-summary"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/></svg><span>Saving creates a <b>{severity} finding</b>{sourceAccepted?<> on <span title={definition.title}>Safeguard {definition.id}</span></>:null} and an <b>action item</b>{finding.owner_id?<> for <b>{ownerLabel}</b>{inheritsOwner?' (if eligible; otherwise unassigned)':null}</>:' initially unassigned'}{finding.due_date?<>, due <b>{dueLabel}</b></>:null}.</span></p>
      <div className="sg11-finding-actions"><button type="button" className="sg11-button" disabled={disabled} onClick={onCancel}>Cancel</button><button type="button" className="sg11-button sg11-button-primary" disabled={disabled||!sourceAccepted||!finding.title.trim()||!finding.remediation_title.trim()} onClick={onSubmit}>Save finding and action</button></div>
    </footer>
  </div>;
}
