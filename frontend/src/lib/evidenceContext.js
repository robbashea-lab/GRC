import api from './api';
import {occurrenceId} from './reviewOccurrences';
export {evidenceSources,evidenceKind,evidenceSourceLabel,uploaderLabel,sourceReference} from './evidenceReferences';

export async function resolveEvidenceSource(ref,clientId){
  if(!ref?.available)throw new Error('Source unavailable.');
  const {data}=await api.get(`/${ref.kind}/${encodeURIComponent(ref.id)}`);
  if(data.client_id!==clientId)throw new Error('Source not found for this client.');
  let initialValues={};
  if(ref.kind==='reviews'){
    const occurrence=data.occurrences?.find(o=>o.occurrence_id===ref.occurrence_id);
    if(occurrence)initialValues={occurrence};
    else if(ref.occurrence_id!==occurrenceId(data))throw new Error('The original Review occurrence is unavailable.');
  }
  return {kind:ref.kind,record:data,initialValues};
}
export async function downloadEvidence(row){
  const {data}=await api.get(`/evidence/${encodeURIComponent(row.evidence_id)}/download`);
  const a=document.createElement('a');
  a.href=data.content_base64.startsWith('data:')?data.content_base64:`data:${data.mime_type||'application/octet-stream'};base64,${data.content_base64}`;
  a.download=data.filename;a.click();
}

export function EvidenceSource({source,onOpen}){
  if(!source)return <span className="text-ink-help">Not linked to a record</span>;
  return <div className="min-w-0"><span className="text-xs text-ink-secondary">{source.label} · </span>{source.available?<button type="button" className="text-link underline text-left break-words" aria-label={`Open ${source.label}: ${source.title}${source.period?' — '+source.period:''}`} onClick={()=>onOpen(source)}>{source.title}</button>:<span className="text-ink-help">Source unavailable</span>}{source.period&&<div className="text-xs text-ink-secondary">{source.period}</div>}{source.archived&&<div className="text-xs text-ink-help">Archived source</div>}</div>;
}
