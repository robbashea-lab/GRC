import {useEffect,useRef,useState} from 'react';
import {zipSync,strToU8} from 'fflate';
import api,{formatError,PREVIEW_MODE} from './api';
import {collectEvidencePages} from './brawndoAdditionalEvidence';
import {EVIDENCE_AREAS} from './evidenceRepository';
import {uploaderLabel} from './evidenceReferences';

export const EVIDENCE_ARCHIVE_LIMITS=Object.freeze({files:250,sourceBytes:32*1024*1024,entryBytes:48*1024*1024,indexBytes:1024*1024});
const AREAS=new Set([...Object.values(EVIDENCE_AREAS),'Unassigned']);
const fallback=' No archive was downloaded. Download files individually, or choose a smaller folder.';
const fail=message=>{throw new Error(message+fallback);};
function check(signal,isCurrent){
  if(signal?.aborted){const error=new Error('Evidence archive cancelled. No archive was downloaded.');error.name='AbortError';throw error;}
  if(!isCurrent())fail('Workspace access changed while preparing the archive.');
}
const safeName=(value,max=90)=>Array.from(String(value).normalize('NFC').replace(/[<>:"/\\|?*\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g,'_').replace(/[. ]+$/g,'')).slice(0,max).join('')||'file';
const csv=value=>{let text=String(value??'');if(/^\s*[=+@-]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
const sizeOf=row=>row.size_bytes??row.file_size??row.size;
function identity(row,clientId){
  if(!row||row.client_id!==clientId||typeof row.evidence_id!=='string'||!row.evidence_id.trim()
    ||!Number.isInteger(row.version)||row.version<1||!(typeof row.sha256==='string'&&/^[a-f0-9]{64}$/i.test(row.sha256)||PREVIEW_MODE&&row.sha256==null)
    ||!Number.isSafeInteger(sizeOf(row))||sizeOf(row)<0||sizeOf(row)>8*1024*1024||typeof row.filename!=='string'||!row.filename.trim())fail('File identity, version, checksum or size is unavailable.');
  return JSON.stringify([row.evidence_id,row.client_id,row.version,row.sha256?.toLowerCase()??null,sizeOf(row),row.filename,row.updated_at??null,row.archived_at??null]);
}
function population(rows,clientId){
  const ids=new Set();
  return rows.map(row=>{const key=identity(row,clientId);if(ids.has(row.evidence_id))fail('The evidence catalog returned duplicate file identities.');ids.add(row.evidence_id);return [key,[...(row.program_areas||[])].sort(),[...(row.folder_paths||[])].sort()];}).sort((a,b)=>a[0].localeCompare(b[0]));
}
function contentBytes(payload,expectedSize,remaining){
  if(typeof payload!=='string')fail('A file has no available contents.');
  let encoded=payload;
  if(/^data:/i.test(encoded)){const prefix=/^data:[^,\r\n]*;base64,/i.exec(encoded);if(!prefix)fail('A file has invalid encoded contents.');encoded=encoded.slice(prefix[0].length);}
  if(encoded.length>4*Math.ceil(Math.min(expectedSize,remaining)/3))fail('A file exceeds the expected or safe archive size.');
  if(encoded.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded))fail('A file has invalid encoded contents.');
  const size=encoded.length/4*3-(encoded.endsWith('==')?2:encoded.endsWith('=')?1:0);
  if(size!==expectedSize)fail('A file size changed or its contents are incomplete.');
  if(size>remaining)fail('This selection exceeds the safe in-browser archive size.');
  const binary=atob(encoded),bytes=new Uint8Array(size);
  for(let index=0;index<size;index++)bytes[index]=binary.charCodeAt(index);
  return bytes;
}
function entryName(row,index){
  const dot=row.filename.lastIndexOf('.'),extension=dot>0?safeName(row.filename.slice(dot),18):'',stem=dot>0?row.filename.slice(0,dot):row.filename;
  // The ordinal prevents collisions even when legacy IDs or names normalize alike.
  return `${safeName(stem)}--${safeName(row.evidence_id,45)}-v${row.version}-${String(index+1).padStart(4,'0')}${extension}`;
}

// The exact complete authorized population is frozen, verified, then checked again;
// a failed member never becomes a partial successful archive.
export async function buildEvidenceArchive({clientId,params={},folderArea=null,storedOnly=false,selectedFiles=null,signal,isCurrent,limits=EVIDENCE_ARCHIVE_LIMITS}){
  if(!clientId||typeof isCurrent!=='function')fail('Select an authorized client.');
  const mode=PREVIEW_MODE,currentScope=isCurrent;
  isCurrent=()=>currentScope()&&PREVIEW_MODE===mode;
  const query=JSON.parse(JSON.stringify(params));
  delete query.page;delete query.page_size;query.client_id=clientId;
  if(selectedFiles&&selectedFiles.length>limits.files)fail('This selection exceeds the safe in-browser archive size.');
  const selectedIds=selectedFiles&&new Set(selectedFiles.map(row=>row.evidence_id));
  const selectedPopulation=selectedFiles&&JSON.stringify(population(selectedFiles,clientId));
  async function load(){
    const rows=await collectEvidencePages(async page=>{check(signal,isCurrent);const response=await api.get('/evidence/catalog',{params:{...query,page,page_size:100},signal});check(signal,isCurrent);return response.data;},
      {signal,maxItems:selectedFiles?undefined:limits.files});
    check(signal,isCurrent);
    if(rows.some(row=>row.client_id!==clientId))fail('The evidence selection contains a different client.');
    // Imported evidence references belong in a report index. Only records
    // explicitly marked reference-only may be omitted from its stored-file ZIP.
    const selected=rows.filter(row=>(!storedOnly||row.file_available!==false)&&(!selectedIds||selectedIds.has(row.evidence_id)));
    if(selectedPopulation&&JSON.stringify(population(selected,clientId))!==selectedPopulation)fail('The evidence selection changed while preparing the archive.');
    return JSON.parse(JSON.stringify(selected));
  }
  const rows=await load();
  if(!rows.length)fail('No evidence files match this selection.');
  const frozen=JSON.stringify(population(rows,clientId));
  if(rows.reduce((sum,row)=>sum+sizeOf(row),0)>limits.sourceBytes)fail('This selection exceeds the safe in-browser archive size.');
  if(folderArea!==null&&!AREAS.has(folderArea))fail('The selected evidence folder is unavailable.');
  if(!globalThis.crypto?.subtle)fail('Checksum verification is unavailable in this browser.');
  const entries=Object.create(null),index=[['Archive path','Evidence ID','Version','SHA-256','Checksum source','Filename','Type','Linked contexts','Uploaded by','Uploaded at']];
  let sourceBytes=0,entryBytes=0;
  for(const [position,row] of rows.entries()){
    check(signal,isCurrent);
    const expected=identity(row,clientId),path='/evidence-library/items/'+encodeURIComponent(row.evidence_id);
    const {data:before}=await api.get(path,{signal});check(signal,isCurrent);
    if(identity(before,clientId)!==expected)fail('An evidence file changed before download.');
    const {data}=await api.get('/evidence/'+encodeURIComponent(row.evidence_id)+'/download',{signal});check(signal,isCurrent);
    if(data?.filename!==row.filename||data.evidence_id!==undefined&&data.evidence_id!==row.evidence_id||data.client_id!==undefined&&data.client_id!==clientId||data.version!==undefined&&data.version!==row.version)fail('The downloaded file identity changed.');
    const bytes=contentBytes(data?.content_base64,sizeOf(row),limits.sourceBytes-sourceBytes);sourceBytes+=bytes.length;
    const digest=await globalThis.crypto.subtle.digest('SHA-256',bytes);check(signal,isCurrent);
    const sha=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
    const computed=PREVIEW_MODE&&row.sha256==null&&data.computed_sha256_source==='verified_immutable_fixture_bytes'&&/^[a-f0-9]{64}$/i.test(data.computed_sha256||'');
    const expectedSha=row.sha256?.toLowerCase()||(computed?data.computed_sha256.toLowerCase():null);
    if(!expectedSha||sha!==expectedSha)fail('An evidence checksum is unavailable or did not match the saved file.');
    const {data:after}=await api.get(path,{signal});check(signal,isCurrent);
    if(identity(after,clientId)!==expected)fail('An evidence file changed during download.');
    const areas=folderArea?[folderArea]:[...new Set(row.program_areas?.length?row.program_areas:['Unassigned'])];
    if(areas.some(area=>!AREAS.has(area))||folderArea&&!row.program_areas?.includes(folderArea))fail('An evidence folder relationship changed.');
    // A report package includes one copy per selected evidence identity.
    const entryAreas=selectedFiles?areas.sort().slice(0,1):areas;
    for(const area of entryAreas){
      entryBytes+=bytes.length;if(entryBytes>limits.entryBytes)fail('Folder copies exceed the safe in-browser archive size.');
      const name=area+'/'+entryName(row,position);entries[name]=[bytes,{level:0}];
      index.push([name,row.evidence_id,row.version,sha,computed?'Computed at download from verified immutable fixture bytes':'Recorded SHA-256',row.filename,row.evidence_type||'Other',(row.references||[]).map(ref=>[ref.label||ref.kind,ref.title||ref.id,ref.period].filter(Boolean).join(' · ')).join('; '),uploaderLabel(row),row.uploaded_at||row.created_at||'Not recorded']);
    }
  }
  const indexBytes=strToU8(index.map(row=>row.map(csv).join(',')).join('\r\n')+'\r\n');
  if(indexBytes.length>limits.indexBytes||entryBytes+indexBytes.length>limits.entryBytes)fail('The archive index exceeds the safe in-browser archive size.');
  const current=await load();check(signal,isCurrent);
  if(JSON.stringify(population(current,clientId))!==frozen)fail('The evidence selection changed while preparing the archive.');
  entries['index.csv']=[indexBytes,{level:0}];
  const bytes=zipSync(entries,{level:0});check(signal,isCurrent);
  return {bytes,fileCount:rows.length,entryCount:index.length-1};
}

export async function downloadEvidenceArchive(options){
  const mode=PREVIEW_MODE,context={...options,isCurrent:()=>options.isCurrent()&&PREVIEW_MODE===mode};
  const result=await buildEvidenceArchive(context);check(context.signal,context.isCurrent);
  const url=URL.createObjectURL(new Blob([result.bytes],{type:'application/zip'}));
  try{check(context.signal,context.isCurrent);const link=document.createElement('a');link.href=url;link.download=safeName(options.filename||'evidence-archive.zip',180);document.body.appendChild(link);try{link.click();}finally{link.remove();}}
  finally{URL.revokeObjectURL(url);}
  return result;
}

export function useEvidenceArchive(clientId,identity){
  const live=useRef(null),request=useRef(null),mounted=useRef(false);live.current={clientId,identity};
  const [state,setState]=useState({busy:false,error:'',message:''});
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;request.current?.abort();};},[]);
  useEffect(()=>{request.current?.abort();request.current=null;setState({busy:false,error:'',message:''});},[clientId,identity]);
  async function run(params={},folderArea=null){
    if(request.current||!clientId)return;
    const controller=new AbortController(),scope={clientId,identity};request.current=controller;
    const isCurrent=()=>mounted.current&&live.current.clientId===scope.clientId&&live.current.identity===scope.identity;
    setState({busy:true,error:'',message:'Preparing and verifying the complete evidence selection…'});
    try{const result=await downloadEvidenceArchive({clientId,params,folderArea,signal:controller.signal,isCurrent,filename:'evidence-'+(folderArea||'all')+'.zip'});if(isCurrent()&&!controller.signal.aborted)setState({busy:false,error:'',message:`ZIP download started: ${result.fileCount} verified files, ${result.entryCount} folder entries.`});}
    catch(error){if(isCurrent())setState({busy:false,error:formatError(error),message:''});}
    finally{if(request.current===controller)request.current=null;}
  }
  return {...state,run,cancel:()=>request.current?.abort()};
}
