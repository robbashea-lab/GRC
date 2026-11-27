import {occurrenceId} from '../lib/reviewOccurrences';

export const completionColumns=['Review','Type','Origin','Period','Due date','Completed on','Completed by','Outcome',
  'Recurring ticket',"This cycle's ticket",'Checklist','Exceptions','Evidence files','Evidence count','Notes',
  'Occurrence ID','Record source','Supporting result reference','Support to record','Evidence IDs'];

export function completionExport(reviews,fromDate,toDate) {
  const valid=value=>{
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return false;
    const parsed=new Date(value+'T00:00:00Z');
    return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===value;
  };
  if(!valid(fromDate)||!valid(toDate)||fromDate>toDate)throw Object.assign(new Error('Choose a valid start date on or before the end date'),{status:422});
  const rows=[],seen=new Set();
  for(const review of reviews) {
    const occurrences=review.occurrences?.length?review.occurrences:review.status==='completed'?[{
      ...review,occurrence_id:occurrenceId(review),completed_at:review.completion_date||review.completion_snapshot?.at,
      completed_by:review.completion_snapshot?.by,legacy:true}]:[];
    for(const occurrence of occurrences) {
      const completed=occurrence.completed_at||occurrence.completion_date||'',key=JSON.stringify([review.review_id,occurrence.occurrence_id]);
      if(!completed||completed.slice(0,10)<fromDate||completed.slice(0,10)>toDate||seen.has(key))continue;
      seen.add(key);
      const coverage=occurrence.coverage_evaluation,evaluation=coverage||occurrence,checklist=evaluation.checklist||{},
        steps=evaluation.checklist_results||checklist.steps||[],evidence=occurrence.evidence||[],setup=occurrence.activity_setup||{};
      let summary=steps.length?[['Pass','pass'],['Exception','exceptions'],['N/A','not applicable'],['NMI','not managed by iVenture']]
        .map(([result,label])=>`${steps.filter(step=>step.result===result).length} ${label}`).join(', '):'Not recorded';
      if(coverage)summary=`Annual coverage from ${coverage.source_review_id}: ${summary}`;
      rows.push([occurrence.title||review.title,occurrence.review_type||'',occurrence.source||occurrence.framework_basis||'',
        occurrence.period||'',occurrence.due_date||'',completed,occurrence.completed_by_name||occurrence.completed_by||'Not recorded',
        evaluation.checklist_outcome||occurrence.outcome||'',setup.recurring_ticket_number||'',setup.cycle_ticket_number||'',summary,
        steps.filter(step=>step.result==='Exception').map(step=>(step.text||step.t||'')+((step.reason||step.note)?` — ${step.reason||step.note}`:'')).join(' | '),
        evidence.map(item=>item.filename||item.evidence_id||'').join('; '),evidence.length,occurrence.notes||'',occurrence.occurrence_id||'',
        occurrence.legacy?'Retained legacy record':'Completed in GoverNara',evaluation.supporting_reference||checklist.supporting_reference||'',
        (checklist.required_support||[]).join('; '),evidence.map(item=>item.evidence_id||'').join('; ')]);
    }
  }
  if(rows.length>100000)throw Object.assign(new Error('Narrow the completion period; no partial export was generated'),{status:413});
  rows.sort((a,b)=>String(a[0]||'').localeCompare(String(b[0]||''))||a[5].localeCompare(b[5])||a[15].localeCompare(b[15]));
  const cell=value=>{
    let text=value==null?'':typeof value==='object'?JSON.stringify(value):String(value);
    if(/^[=+@\-\t\r]/.test(text))text="'"+text;
    return '"'+text.replaceAll('"','""')+'"';
  };
  return [completionColumns,...rows].map(row=>row.map(cell).join(',')).join('\r\n');
}
