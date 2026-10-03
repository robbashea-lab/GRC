// Legacy last_assessed also served as the optimistic write token for drafts.
// Do not manufacture judgment dates from it; keep the token for old callers.
export function socAssessmentDate(record){
  if(record.assessment_recorded_at)return record.assessment_recorded_at.slice(0,10);
  return record.last_assessed&&record.status!=='not_assessed'?'Legacy date unconfirmed':'Not assessed';
}
export const socSavedDate=record=>(record.last_saved||record.last_assessed)?.slice(0,10)||'Not saved';
