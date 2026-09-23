import {frameworkDefinition} from './frameworks';
import {calendarDay} from './managementDates';
import {reviewView} from './reviewOccurrences';

// Same assessment-resolution contract as backend/framework_summary.py.
export function reviewedProgress(rows, key) {
  const validNa = row => {
    const spec=frameworkDefinition(key,row.definition_id)?.specification;
    if(['isms_clause','addressable'].includes(spec))return false;
    return spec==='annex_control'
      ? row.soa_applicability==='excluded'&&!!row.soa_justification?.trim()
      : !!row.na_rationale?.trim();
  };
  const na=rows.filter(r=>r.status==='not_applicable'), valid=na.filter(validNa).length;
  const resolved=rows.filter(r=>r.status==='addressed').length+valid;
  return {total:rows.length,resolved,valid_na:valid,invalid_na:na.length-valid,percent:rows.length?Math.round(resolved/rows.length*100):null};
}

export function ongoingProgram(reviews,today=new Date().toISOString()) {
  const day=calendarDay(today), groups={past_due:[],due_soon:[],current:[],unscheduled:[]};
  for(const raw of reviews){
    if(raw.archived||raw.archived_at||['completed','cancelled','closed','retired'].includes(raw.status)||!raw.recurrence||['none','one_time'].includes(raw.recurrence))continue;
    const r=reviewView(raw);
    const due=calendarDay(r.due_date);
    const state=due===null?'unscheduled':due<day?'past_due':due<=day+30?'due_soon':'current';
    groups[state].push({id:r.review_id,title:r.title||'Review',due_date:r.due_date,status:r.status,kind:'reviews'});
  }
  Object.values(groups).forEach(rows=>rows.sort((a,b)=>(a.due_date||'9999').localeCompare(b.due_date||'9999')||a.id.localeCompare(b.id)));
  const candidates=[...groups.past_due,...groups.due_soon,...groups.current];
  return {groups,summary:{total:Object.values(groups).reduce((n,v)=>n+v.length,0),counts:Object.fromEntries(Object.entries(groups).map(([k,v])=>[k,v.length])),next:candidates[0]||null}};
}
