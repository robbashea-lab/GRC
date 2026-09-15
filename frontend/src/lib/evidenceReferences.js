import sources from './evidenceSources.json';
import {occurrenceId,reviewSchedule} from './reviewOccurrences';

export {sources as evidenceSources};
export const evidenceKind=type=>Object.keys(sources).find(kind=>sources[kind].aliases.includes(type));
export const evidenceSourceLabel=type=>sources[evidenceKind(type)]?.label || (type?'Source unavailable':'Not linked');
export const uploaderLabel=row=>row.uploader||row.uploaded_by_email||'Unknown uploader';
export function sourceReference(kind,row,id,occurrence) {
  const result={kind,id:id||row?.[sources[kind].key],label:sources[kind].label,available:!!row,title:row?.title||row?.name||'Source unavailable'};
  if(row){result.status=row.status;result.archived=!!(row.archived_at||row.status==='archived');}
  if(row&&kind==='reviews'){
    const oid=occurrence||'occ_'+row.review_id,old=row.occurrences?.find(o=>o.occurrence_id===oid),current=oid===occurrenceId(row);
    Object.assign(result,{occurrence_id:oid,period:old?.period||(old||current?reviewSchedule(old||row).period:'Occurrence not recorded'),available:!!(old||current)});
  }
  return result;
}
