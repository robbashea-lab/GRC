import {calendarDay} from './managementDates';

const DATE_ONLY=/^\d{4}-\d{2}-\d{2}$/;
const INSTANT=/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/i;
const dayLabel=date=>new Intl.DateTimeFormat('en-US',{timeZone:'UTC',year:'numeric',month:'short',day:'numeric'}).format(date);

// Scenario dates are a separate read model; native save/concurrency fields are never backfilled.
export function safeguardDateFooter(record) {
  const metadata=record?.demo_date_metadata;
  if(record?.client_id==='demo_brawndo'&&record.framework_key==='cis-ig1'&&metadata
    &&metadata.client_id===record.client_id&&metadata.framework_key===record.framework_key
    &&metadata.assessment_id===record.framework_assessment_id&&metadata.definition_id===record.definition_id
    &&metadata.status===record.status&&['demo_fixture','accepted_native'].includes(metadata.provenance)
    &&metadata.scenario_version==='brawndo-cis-ig1-history-v2'
    &&typeof metadata.event_id==='string'&&metadata.event_id.length>0
    &&typeof metadata.scenario_anchor==='string'&&INSTANT.test(metadata.scenario_anchor)
    &&!Number.isNaN(Date.parse(metadata.scenario_anchor))&&calendarDay(metadata.scenario_anchor)!==null
    &&typeof metadata.effective_date==='string'&&DATE_ONLY.test(metadata.effective_date)&&calendarDay(metadata.effective_date)!==null
    &&((metadata.kind==='implementation_transition'&&record.status==='addressed'
      &&['not_assessed','needs_attention','in_progress'].includes(metadata.before_status))
      ||(metadata.kind==='assessment_review'&&['in_progress','needs_attention'].includes(record.status)))) {
    const label=metadata.kind==='implementation_transition'?'Completed on':'Assessment reviewed on';
    return {label,dateTime:metadata.effective_date,display:dayLabel(new Date(calendarDay(metadata.effective_date)*86400000)),provenance:metadata.provenance};
  }
  const saved=typeof record?.last_saved==='string'&&INSTANT.test(record.last_saved)?new Date(record.last_saved):null;
  if(saved&&calendarDay(record.last_saved)!==null&&!Number.isNaN(saved.getTime())) {
    const timestamp=saved.toISOString();
    return {label:'Last saved:',dateTime:timestamp,display:`${dayLabel(saved)} · ${new Intl.DateTimeFormat('en-US',{timeZone:'UTC',hour:'numeric',minute:'2-digit',second:'2-digit',timeZoneName:'short'}).format(saved)}`};
  }
  return {text:record?.status==='not_assessed'&&!record.last_saved&&!record.last_assessed&&!record.assessment_history?.length?'Not yet assessed.':'Last saved: unavailable'};
}
