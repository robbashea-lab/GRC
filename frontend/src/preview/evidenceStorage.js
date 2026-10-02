import {DEMO_INLINE_LIMIT,lastStorageError} from '../lib/demoStorageErrors';
// Large file contents never enter Web Storage. This cache is deliberately
// bounded and document-local: reload/eviction leaves the metadata intact.
const files=new Map(),MAX_CACHE_BYTES=8*1024*1024;
export const payloadBytes=value=>typeof value==='string'?value.length*2:0;
export const fileBytes=value=>{const raw=(value||'').split(',').pop();return Math.floor(raw.length*3/4)-(raw.endsWith('==')?2:raw.endsWith('=')?1:0);};
const SNAPSHOT_FIELDS=['title','review_type','recurrence','owner_id','reviewer_id','scope','framework_drivers','baseline_key','framework_key','framework_safeguards','framework_plan_key','governance_context','policy_id'];
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const copy=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
const compactReviews=reviews=>(reviews||[]).map(review=>({...review,occurrences:(review.occurrences||[]).map(occurrence=>{
  const inherited=SNAPSHOT_FIELDS.filter(field=>Object.hasOwn(occurrence,field)&&same(occurrence[field],review[field]));
  if(!inherited.length)return occurrence;
  const compact={...occurrence,_review_inherited:inherited};for(const field of inherited)delete compact[field];return compact;
})}));
const expandReviews=reviews=>(reviews||[]).map(review=>({...review,occurrences:(review.occurrences||[]).map(occurrence=>{
  if(!occurrence._review_inherited)return occurrence;
  const expanded={...occurrence};for(const field of expanded._review_inherited)expanded[field]=copy(review[field]);delete expanded._review_inherited;return expanded;
})}));
export function lightweightStore(db,previousEvidence=[]){
  let remaining=64*1024; // Aggregate UTF-16 payload budget, independent of metadata.
  const evidence=db.evidence||[],previous=new Map(previousEvidence.map(e=>[e.evidence_id,e]));
  // Reserve already-persisted bytes first: prepending another client's upload must
  // not demote a durable file to the reload-sensitive memory cache.
  const retained=new Set(evidence.filter(e=>e.content_base64&&previous.get(e.evidence_id)?.client_id===e.client_id&&previous.get(e.evidence_id).content_base64===e.content_base64));
  const inline=new Set();
  for(const e of [...retained,...evidence.filter(e=>!retained.has(e))]){
    const bytes=payloadBytes(e.content_base64);
    if(e.content_base64&&fileBytes(e.content_base64)<=DEMO_INLINE_LIMIT&&bytes<=remaining){inline.add(e);remaining-=bytes;}
  }
  return {...db,reviews:compactReviews(db.reviews),evidence:evidence.map(e=>{
    const {content_base64,...metadata}=e;
    return content_base64&&!inline.has(e)?{...metadata,demo_file_storage:'session_only'}:e;
  })};
}
export function rememberFiles(db,persisted=lightweightStore(db)){
  const ids=new Set((db.evidence||[]).map(e=>e.evidence_id));
  for(const id of files.keys())if(!ids.has(id))files.delete(id);
  for(const [i,e] of (db.evidence||[]).entries())if(e.content_base64&&!persisted.evidence[i].content_base64){files.delete(e.evidence_id);files.set(e.evidence_id,{client_id:e.client_id,content:e.content_base64});}
  let bytes=[...files.values()].reduce((n,f)=>n+payloadBytes(f.content),0);
  for(const [id,f] of files){if(bytes<=MAX_CACHE_BYTES)break;files.delete(id);bytes-=payloadBytes(f.content);}
}
export function restoreFiles(db){
  for(const e of db.evidence||[]){const f=files.get(e.evidence_id);if(!e.content_base64&&e.demo_file_storage==='session_only'&&f?.client_id===e.client_id){e.content_base64=f.content;delete e.demo_file_storage;}}
  db.reviews=expandReviews(db.reviews);
  return db;
}
export const clearFileCache=()=>files.clear();
export function storageDiagnostics(saved,db){
  const payloads=(db.evidence||[]).filter(e=>e.content_base64);
  return {storage:'sessionStorage',approximate_bytes:saved.length*2,evidence_records:(db.evidence||[]).length,persisted_payload_count:payloads.length,persisted_payload_bytes:payloads.reduce((n,e)=>n+payloadBytes(e.content_base64),0),memory_file_count:files.size,memory_file_bytes:[...files.values()].reduce((n,f)=>n+payloadBytes(f.content),0),last_error:lastStorageError()};
}
