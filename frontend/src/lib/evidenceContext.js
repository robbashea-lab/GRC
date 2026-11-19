import {useCallback,useEffect,useRef} from 'react';
import {useAuth} from '@/context/AuthContext';
import {useOrg} from '@/context/OrgContext';
import api from './api';
import {occurrenceId} from './reviewOccurrences';
export {evidenceSources,evidenceKind,evidenceSourceLabel,uploaderLabel,sourceReference} from './evidenceReferences';

export async function resolveEvidenceSource(ref,clientId){
  if(!ref?.available)throw new Error('Source unavailable.');
  let data;
  if(ref.kind==='ai_systems'){
    if(!ref.id||!clientId)throw new Error('Source not found for this client.');
    // AI exposes scoped collection reads in both Explore and authenticated use.
    const {data:rows}=await api.get('/ai_systems',{params:{client_id:clientId}});
    const matches=Array.isArray(rows)?rows.filter(row=>row?.ai_system_id===ref.id&&row.client_id===clientId):[];
    if(matches.length!==1)throw new Error('Source not found for this client.');
    data=matches[0];
  }else{
    const route=ref.kind==='organizational_controls'?'organizational-controls':ref.kind;
    ({data}=await api.get(`/${route}/${encodeURIComponent(ref.id)}`));
  }
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
export async function downloadEvidence(row,{signal,isCurrent=()=>true}={}){
  const current=()=>!signal?.aborted&&isCurrent();
  if(!current())return false;
  const path=`/evidence/${encodeURIComponent(row.evidence_id)}/download`;
  let data;
  try{({data}=signal?await api.get(path,{signal}):await api.get(path));}
  catch(error){if(!current())return false;throw error;}
  if(!current())return false;
  // Standard responses contain raw base64; Explore uploads retain FileReader data URLs.
  const bytes=decodeEvidenceContent(data?.content_base64);
  // Treat attachments as bytes even if a browser ignores the download attribute.
  const url=URL.createObjectURL(new Blob([bytes],{type:'application/octet-stream'}));
  try{
    if(!current())return false;
    const a=document.createElement('a');a.href=url;a.download=data.filename;a.click();
    return true;
  }finally{URL.revokeObjectURL(url);}
}

// Each mounted owner cancels only its own downloads when its authority or visible scope changes.
export function useEvidenceDownload(clientId,owner='',active=true){
  const {user,workspaceMode}=useAuth()||{},org=useOrg()||{};
  const scope=JSON.stringify([clientId,owner,active,user?.user_id,user?.email,user?.role,user?.status,
    user?.updated_at,user?.client_ids,!!user?.all_clients,!!user?.password_change_required,
    workspaceMode,user?.workspace_mode,org.currentClientId,org.currentClient?.client_id,
    org.currentClient?.status,org.currentClient?.archived,org.currentClient?.archived_at]);
  const live=useRef(scope),mounted=useRef(false),requests=useRef(new Set());live.current=scope;
  const abort=useCallback(()=>{for(const controller of requests.current)controller.abort();requests.current.clear();},[]);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;abort();};},[abort]);
  useEffect(()=>()=>abort(),[scope,abort]);
  return async row=>{
    if(!active||!mounted.current||live.current!==scope)return false;
    const controller=new AbortController();requests.current.add(controller);
    const isCurrent=()=>mounted.current&&live.current===scope;
    try{return await downloadEvidence(row,{signal:controller.signal,isCurrent});}
    finally{requests.current.delete(controller);}
  };
}

export function EvidenceSource({source,onOpen}){
  if(!source)return <span className="text-ink-help">Not linked to a record</span>;
  return <div className="min-w-0"><span className="text-xs text-ink-secondary">{source.label} · </span>{source.available?<button type="button" className="register-link break-words" aria-label={`Open ${source.label}: ${source.title}${source.period?' — '+source.period:''}`} onClick={()=>onOpen(source)}>{source.title}</button>:<span className="text-ink-help">Source unavailable</span>}{source.period&&<div className="text-xs text-ink-secondary">{source.period}</div>}{source.archived&&<div className="text-xs text-ink-help">Archived source</div>}</div>;
}
