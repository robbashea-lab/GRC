import {DEMO_INLINE_LIMIT,lastStorageError} from '../lib/demoStorageErrors';
// Large file contents never enter Web Storage. This cache is deliberately
// bounded and document-local: reload/eviction leaves the metadata intact.
const files=new Map(),MAX_CACHE_BYTES=8*1024*1024;
export const payloadBytes=value=>typeof value==='string'?value.length*2:0;
export const fileBytes=value=>{const raw=(value||'').split(',').pop();return Math.floor(raw.length*3/4)-(raw.endsWith('==')?2:raw.endsWith('=')?1:0);};
export function lightweightStore(db){
  let remaining=256*1024; // Aggregate UTF-16 payload budget, independent of metadata.
  return {...db,evidence:(db.evidence||[]).map(e=>{
    const {content_base64,...metadata}=e;
    const bytes=payloadBytes(content_base64);
    if(content_base64&&(fileBytes(content_base64)>DEMO_INLINE_LIMIT||bytes>remaining))return {...metadata,demo_file_storage:'session_only'};
    remaining-=bytes;return e;
  })};
}
export function rememberFiles(db){
  const ids=new Set((db.evidence||[]).map(e=>e.evidence_id));
  for(const id of files.keys())if(!ids.has(id))files.delete(id);
  const persisted=lightweightStore(db);
  for(const [i,e] of (db.evidence||[]).entries())if(e.content_base64&&!persisted.evidence[i].content_base64){files.delete(e.evidence_id);files.set(e.evidence_id,{client_id:e.client_id,content:e.content_base64});}
  let bytes=[...files.values()].reduce((n,f)=>n+payloadBytes(f.content),0);
  for(const [id,f] of files){if(bytes<=MAX_CACHE_BYTES)break;files.delete(id);bytes-=payloadBytes(f.content);}
}
export function restoreFiles(db){
  for(const e of db.evidence||[]){const f=files.get(e.evidence_id);if(!e.content_base64&&e.demo_file_storage==='session_only'&&f?.client_id===e.client_id)e.content_base64=f.content;}
  return db;
}
export const clearFileCache=()=>files.clear();
export function storageDiagnostics(saved,db){
  const payloads=(db.evidence||[]).filter(e=>e.content_base64);
  return {storage:'sessionStorage',approximate_bytes:saved.length*2,evidence_records:(db.evidence||[]).length,persisted_payload_count:payloads.length,persisted_payload_bytes:payloads.reduce((n,e)=>n+payloadBytes(e.content_base64),0),memory_file_count:files.size,memory_file_bytes:[...files.values()].reduce((n,f)=>n+payloadBytes(f.content),0),last_error:lastStorageError()};
}
