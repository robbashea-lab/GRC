import api from './api';
import {occurrenceId} from './reviewOccurrences';
export {evidenceSources,evidenceKind,evidenceSourceLabel,uploaderLabel,sourceReference} from './evidenceReferences';

export async function resolveEvidenceSource(ref,clientId){
  if(!ref?.available)throw new Error('Source unavailable.');
  const route=ref.kind==='organizational_controls'?'organizational-controls':ref.kind;
  const {data}=await api.get(`/${route}/${encodeURIComponent(ref.id)}`);
  if(data.client_id!==clientId)throw new Error('Source not found for this client.');
  let initialValues={};
  if(ref.kind==='reviews'){
    const occurrence=data.occurrences?.find(o=>o.occurrence_id===ref.occurrence_id);
    if(occurrence)initialValues={occurrence};
    else if(ref.occurrence_id!==occurrenceId(data))throw new Error('The original Review occurrence is unavailable.');
  }
  return {kind:ref.kind,record:data,initialValues};
}
function decodeEvidenceContent(content){
  if(typeof content!=='string')throw new Error('Evidence file content is invalid.');
  let encoded=content;
  if(/^data:/i.test(content)){
    const header=content.match(/^data:[^,]*;base64,/i);
    if(!header)throw new Error('Evidence file content is invalid.');
    encoded=content.slice(header[0].length);
  }
  try{
    const binary=atob(encoded),bytes=new Uint8Array(binary.length);
    for(let index=0;index<binary.length;index++)bytes[index]=binary.charCodeAt(index);
    return bytes;
  }
  catch{throw new Error('Evidence file content could not be decoded.');}
}
export async function downloadEvidence(row){
  const {data}=await api.get(`/evidence/${encodeURIComponent(row.evidence_id)}/download`);
  // Standard responses contain raw base64; Explore uploads retain FileReader data URLs.
  const bytes=decodeEvidenceContent(data?.content_base64);
  // Treat attachments as bytes even if a browser ignores the download attribute.
  const url=URL.createObjectURL(new Blob([bytes],{type:'application/octet-stream'}));
  try{
    const a=document.createElement('a');a.href=url;a.download=data.filename;a.click();
  }finally{URL.revokeObjectURL(url);}
}

export function EvidenceSource({source,onOpen}){
  if(!source)return <span className="text-ink-help">Not linked to a record</span>;
  return <div className="min-w-0"><span className="text-xs text-ink-secondary">{source.label} · </span>{source.available?<button type="button" className="register-link break-words" aria-label={`Open ${source.label}: ${source.title}${source.period?' — '+source.period:''}`} onClick={()=>onOpen(source)}>{source.title}</button>:<span className="text-ink-help">Source unavailable</span>}{source.period&&<div className="text-xs text-ink-secondary">{source.period}</div>}{source.archived&&<div className="text-xs text-ink-help">Archived source</div>}</div>;
}
