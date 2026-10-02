import {auditProgress} from './isoAudit';

export function implementationCounts(rows) {
  return {implemented:rows.filter(r=>r.status==='addressed').length,
    partial:rows.filter(r=>r.status==='in_progress').length,
    notImplemented:rows.filter(r=>r.status==='needs_attention').length,
    notAssessed:rows.filter(r=>r.status==='not_assessed').length};
}

export function isoProgramMetrics(rows) {
  const clauses=rows.filter(r=>r.specification==='isms_clause');
  const controls=rows.filter(r=>r.specification==='annex_control');
  const applicable=controls.filter(r=>r.soa_applicability==='included');
  const excluded=controls.filter(r=>r.soa_applicability==='excluded').length;
  return {requirements:{total:clauses.length,...implementationCounts(clauses)},
    soa:{total:controls.length,applicable:applicable.length,excluded,undetermined:controls.length-applicable.length-excluded,decided:applicable.length+excluded},
    annex:{total:applicable.length,...implementationCounts(applicable)}};
}

// Surface legacy contradictions; never reinterpret or migrate saved decisions.
export const isoAssessmentConflicts=rows=>rows.filter(r=>r.status==='not_applicable'&&(r.specification==='isms_clause'||r.soa_applicability==='included'));

// Use Review deadlines for programme organization, including retained occurrences.
// Completion counts examined workpapers, independently of findings closure.
export function auditProgrammeMetrics(reviews,year) {
  const seen=new Set(),quarters=Array.from({length:4},(_,i)=>({quarter:i+1,total:0,complete:0,records:[]}));
  for(const review of reviews) {
    for(const record of [review,...(review.occurrences||[])]) {
      if(!record.iso_audit||!/^\d{4}-\d{2}-\d{2}/.test(record.due_date||''))continue;
      const date=new Date(record.due_date.slice(0,10)+'T12:00:00Z');
      if(!Number.isFinite(+date)||date.toISOString().slice(0,10)!==record.due_date.slice(0,10)||date.getUTCFullYear()!==Number(year))continue;
      const key=review.review_id+':'+(record.occurrence_id||record.current_occurrence_id||`${record.iso_audit.package_key}:${record.iso_audit.cycle}`);
      if(seen.has(key))continue;
      seen.add(key);
      const quarter=quarters[Math.floor(date.getUTCMonth()/3)],progress=auditProgress(record.iso_audit);
      quarter.total+=progress.total;quarter.complete+=progress.complete;
      quarter.records.push({review_id:review.review_id,package_key:record.iso_audit.package_key,occurrence_id:record===review?null:record.occurrence_id});
    }
  }
  return {year,quarters,total:quarters.reduce((n,q)=>n+q.total,0),complete:quarters.reduce((n,q)=>n+q.complete,0)};
}

export const auditProgrammeYears=reviews=>[...new Set(reviews.flatMap(r=>[r,...(r.occurrences||[])]).filter(r=>r.iso_audit&&/^\d{4}-\d{2}-\d{2}/.test(r.due_date||'')).map(r=>r.due_date.slice(0,4)))].sort();
