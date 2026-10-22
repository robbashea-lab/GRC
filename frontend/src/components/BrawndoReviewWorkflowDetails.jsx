import {useEffect,useState} from 'react';
import {Input} from './ui/input';
import {Textarea} from './ui/textarea';
import AssigneeSelect from './AssigneeSelect';
import {SCHEMAS} from '@/lib/schemas';
import {reviewDaysUntil} from '@/lib/brawndoReviews';

export function reviewDueHelp(record,now=new Date()) {
  const days=reviewDaysUntil(record,now);
  if(days===null)return {text:'Not scheduled',tone:'muted'};
  const count=Math.abs(days),unit=count===1?'day':'days';
  return {text:days<0?`Overdue by ${count} ${unit}`:days===0?'Due today':`Due in ${days} ${unit}`,
    tone:days<0?'error':days<=14?'warning':'muted'};
}

// Native draft and command ownership stay in ReviewDrawer. This is only its approved field arrangement.
export default function BrawndoReviewWorkflowDetails({record,source,clientId,clientName='Client',users,admin,writable,frozen,busy,onChange,onOrigin,picker}) {
  const [now,setNow]=useState(()=>new Date());
  useEffect(()=>{const timer=setInterval(()=>setNow(new Date()),60000);return()=>clearInterval(timer);},[]);
  const disabled=frozen||!admin||busy,due=reviewDueHelp(record,now),primary=source.primary;
  const recurrenceHelp=source.classification==='required'
    ? `${source.comparison.state==='meets'?'Meets':'CIS'}${source.comparison.state==='meets'?' CIS':''} ${primary.definition.id}${source.comparison.state==='meets'?':':' requires'} ${(primary.frequencyLabel||source.minimumCadence).toLowerCase()}.`
    : source.classification==='organizational'?(source.context.cadence_rationale||(source.context.category==='organizational'?`Set by ${clientName}. Source frequency not recorded.`:source.label)):'Source frequency not recorded.';
  return <section className="review-workflow-details-section">
    <h3 className="review-workflow-details-heading">Details <span>Edit and save. Changes are recorded in Activity.</span></h3>
    <div className="review-workflow-details">
      <div className="review-workflow-field is-full"><label htmlFor="review-title">Title</label><Input id="review-title" data-testid="field-title" value={record.title||''} disabled={disabled} onChange={e=>onChange('title',e.target.value)}/></div>
      <div className="review-workflow-field"><label>Assigned reviewer</label><AssigneeSelect clientId={clientId} label="Assigned reviewer" value={record.owner_id||''} users={users} disabled={disabled} onChange={value=>onChange('owner_id',value)} testId="field-owner_id" showManagePeople={false} showGuidance={false} popoverClassName="review-workflow-assignee-popover"/><span className="review-workflow-help">Active platform users with access to {clientName}.</span></div>
      <div className="review-workflow-field"><label htmlFor="review-due_date">Due date</label><Input id="review-due_date" data-testid="field-due_date" type="date" value={record.due_date?.slice(0,10)||''} disabled={disabled} onChange={e=>onChange('due_date',e.target.value)}/>{!frozen&&<span className={`review-workflow-help is-${due.tone}`}>{due.text}</span>}</div>
      <div className="review-workflow-field">{picker('Recurrence',record.recurrence,value=>onChange('recurrence',value),SCHEMAS.reviews.fields.find(field=>field.name==='recurrence').options,disabled,'field-recurrence')}<span className={`review-workflow-help is-${source.comparison.state==='meets'?'success':source.comparison.state==='below'?'warning':'muted'}`}>{recurrenceHelp}</span></div>
      <div className="review-workflow-field"><label>Origin</label><button type="button" className="review-workflow-origin" onClick={onOrigin}><span className={`review-workflow-chip is-${source.classification==='required'?'success':'info'}`}>{source.classification==='required'?'Required':source.classification==='organizational'?'Org-defined':'Unresolved'}</span><span>{primary?`CIS IG${primary.implementationGroup} · Safeguard ${primary.definition.id}`:source.supports.length?`Supports ${source.supports.map(group=>group.label).join(' · ')}`:source.label}</span></button><span className="review-workflow-help">Why this review exists. Details in Requirement.</span></div>
      {record.recurrence==='custom'&&<div className="review-workflow-field"><label htmlFor="review-custom-days">Custom recurrence days</label><Input id="review-custom-days" data-testid="field-custom_recurrence_days" type="number" min={1} value={record.custom_recurrence_days||''} disabled={disabled} onChange={e=>onChange('custom_recurrence_days',e.target.value===''?'':Number(e.target.value))}/></div>}
      <div className="review-workflow-field is-full"><label htmlFor="review-notes">Notes for this occurrence</label><Textarea id="review-notes" data-testid="field-notes" value={record.notes||''} disabled={frozen||!writable||busy} onChange={e=>onChange('notes',e.target.value)} placeholder="e.g. Reviewed all M365 accounts against the HR roster. Disabled 2 leavers. No other changes this quarter."/></div>
    </div>
  </section>;
}
