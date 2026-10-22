import {useId} from 'react';
import {Link2,Info} from 'lucide-react';
import {basisSummary} from '@/lib/requirementBasis';
import {localCalendarDate,stepCalendarDate} from '@/lib/calendarView';
import {personLabel} from '@/lib/people';
import AssigneeSelect from './AssigneeSelect';
import {Input} from './ui/input';
import {Textarea} from './ui/textarea';
import {Button} from './ui/button';
import './BrawndoReviewFindingFields.css';

const severities=[['low','Low','Minor gap, little exposure'],['medium','Medium','Limited exposure'],['high','High','Material gap, assess urgency'],['critical','Critical','Highest severity, assess urgency']];
export const findingQuickDueDate=(days,now=new Date())=>localCalendarDate(stepCalendarDate(now,'day',days));

export default function BrawndoReviewFindingFields({finding,onChange,record,occurrenceId,users=[],clientId,busy=false,onCancel}) {
  const id=useId();
  if(!finding)return null;
  const put=(key,value)=>onChange({...finding,[key]:value});
  const severity=finding.severity||'medium',severityLabel=severities.find(([value])=>value===severity)?.[1]||severity;
  const due=finding.due_date?new Date(finding.due_date.slice(0,10)+'T00:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}):null;
  const owner=finding.owner_id?personLabel(users,finding.owner_id):'Unassigned';
  return <>
    <div className="review-finding-body">
      <section className="review-finding-card" aria-labelledby={id+'-problem'}>
        <header><span className="review-finding-number" aria-hidden="true">1</span><h3 id={id+'-problem'}>What's wrong</h3><span>Creates the finding</span></header>
        <div className="review-finding-field"><label htmlFor={id+'-title'}>Finding title <span className="review-finding-required">*</span></label><Input id={id+'-title'} required maxLength={1000} disabled={busy} data-testid="finding-title" value={finding.title||''} onChange={event=>put('title',event.target.value)}/></div>
        <div className="review-finding-field"><label htmlFor={id+'-description'}>Description</label><Textarea id={id+'-description'} disabled={busy} value={finding.description||''} onChange={event=>put('description',event.target.value)} placeholder="What was found, where, and how it was spotted during the review."/></div>
        <div className="review-finding-field"><span id={id+'-severity'} className="review-finding-label">Severity</span><div className="review-finding-severity" role="group" aria-labelledby={id+'-severity'}>{severities.map(([value,label,help])=><button key={value} type="button" data-severity={value} aria-pressed={severity===value} disabled={busy} onClick={()=>put('severity',value)}><strong><i aria-hidden="true"/>{label}</strong><small>{help}</small></button>)}</div></div>
        <p className="review-finding-source"><Link2 size={14} aria-hidden="true"/><span>From {record?.title||'Review title not recorded'} · {basisSummary(record||{})}<br/>Occurrence: {occurrenceId||'Not recorded'}</span></p>
      </section>
      <section className="review-finding-card" aria-labelledby={id+'-action'}>
        <header><span className="review-finding-number" aria-hidden="true">2</span><h3 id={id+'-action'}>How it gets fixed</h3><span>Creates the action item</span></header>
        <div className="review-finding-field"><label htmlFor={id+'-remediation'}>Corrective action <span className="review-finding-required">*</span></label><Input id={id+'-remediation'} required maxLength={1000} disabled={busy} data-testid="finding-remediation-title" value={finding.remediation_title||''} onChange={event=>put('remediation_title',event.target.value)}/></div>
        <div className="review-finding-two-columns">
          <div className="review-finding-field"><span className="review-finding-label">Owner</span><AssigneeSelect label="Owner" showManagePeople={false} clientId={clientId} users={users} value={finding.owner_id} disabled={busy} onChange={value=>put('owner_id',value)}/><p className="review-finding-help">Initial owner for the finding and its action item.</p></div>
          <div className="review-finding-field"><label htmlFor={id+'-due'}>Due date <span className="review-finding-optional">Optional</span></label><Input id={id+'-due'} type="date" disabled={busy} value={finding.due_date||''} onChange={event=>put('due_date',event.target.value)}/><div className="review-finding-quick-dates" role="group" aria-label="Quick due dates">{[[14,'2 weeks'],[30,'30 days'],[60,'60 days'],[90,'90 days']].map(([days,label])=><button type="button" key={days} disabled={busy} onClick={()=>put('due_date',findingQuickDueDate(days))}>{label}</button>)}</div></div>
        </div>
        <div className="review-finding-field review-finding-remediation-notes"><label htmlFor={id+'-plan'}>Remediation notes</label><Textarea id={id+'-plan'} disabled={busy} value={finding.remediation_plan||''} onChange={event=>put('remediation_plan',event.target.value)} placeholder="Steps, dependencies, who else is involved."/></div>
      </section>
    </div>
    <footer className="review-finding-footer">
      <p className="review-finding-summary"><Info size={14} aria-hidden="true"/><span>Pending draft: <strong>{severityLabel}</strong> finding and action item · <strong>{owner}</strong> · {due?`due ${due}`:'No due date'}. Both will reference this Review occurrence after an accepted save.</span></p>
      <div className="review-finding-buttons"><Button type="button" variant="outline" disabled={busy} onClick={onCancel}>Cancel</Button><Button type="submit" disabled={busy} data-testid="finding-save">Save finding and action</Button></div>
    </footer>
  </>;
}
