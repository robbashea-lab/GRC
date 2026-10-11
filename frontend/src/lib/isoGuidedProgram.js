import {calendarDay,managementDay} from './managementDates';

export function isoAuditTiming(review,today=new Date()) {
  if (review.status==='cancelled') return {key:'cancelled',label:'Cancelled'};
  if (review.completed_at || review.status==='completed') return {key:'complete',label:'Completed'};
  const due=calendarDay(review.due_date),now=managementDay(today);
  if (due===null) return {key:'unscheduled',label:'Needs scheduling'};
  return due<now ? {key:'overdue',label:'Overdue'} : {key:'upcoming',label:due===now?'Due today':'Upcoming'};
}

// One entry per authoritative assessment; SoA and Annex A are not two gaps.
export function isoRecommendedWork(rows,reviews=[],drafts={},today=new Date()) {
  const queue=[],seen=new Set();
  for (const row of rows) {
    if(row.framework_key!=='iso-27001'||seen.has(row.framework_assessment_id))continue;
    seen.add(row.framework_assessment_id);
    const annex=row.specification==='annex_control';
    const undecided=annex&&(!['included','excluded'].includes(row.soa_applicability)||!row.soa_justification?.trim());
    if(undecided){queue.push({key:row.framework_assessment_id,view:'soa',row,order:0,reason:'Record or review the control necessity decision and its risk, scope or obligation basis.'});continue;}
    if(annex&&row.soa_applicability==='excluded')continue;
    let order,reason;
    if(row.status==='needs_attention'){order=1;reason='A recorded implementation gap needs attention.';}
    else if(row.status==='not_assessed'){order=2;reason='No implementation assessment is recorded.';}
    else if(row.status==='in_progress'){order=3;reason='Review partial implementation or outstanding substantive questions.';}
    else if(row.work?.open_findings>0||row.work?.overdue_reviews>0){order=4;reason='Review the linked open Findings or overdue Reviews.';}
    else continue;
    const draft=drafts[row.definition_id];
    if(draft?.revision&&!draft.completed)reason+=' Saved interview progress is available to resume.';
    queue.push({key:row.framework_assessment_id,view:annex?'annex_control':'isms_clause',row,order,reason});
  }
  for (const review of reviews) {
    if(!review.iso_audit)continue;
    const timing=isoAuditTiming(review,today);
    if(['complete','cancelled'].includes(timing.key))continue;
    queue.push({key:'audit:'+review.review_id,view:'audit',review,order:timing.key==='overdue'?1:timing.key==='unscheduled'?4:5,
      reason:timing.key==='overdue'?'The recorded audit deadline has passed.':timing.key==='unscheduled'?'This audit activity has no recorded deadline.':'Prepare for the scheduled audit; open work is not overdue before its deadline.',timing});
  }
  return queue.sort((a,b)=>a.order-b.order||(calendarDay(a.review?.due_date)??Infinity)-(calendarDay(b.review?.due_date)??Infinity)||a.key.localeCompare(b.key,undefined,{numeric:true}));
}
