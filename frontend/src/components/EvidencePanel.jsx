import {useEffect,useState} from 'react';
import { isInternal } from '@/lib/permissions';
import {Download} from 'lucide-react';
import {Button} from './ui/button';
import api,{formatError} from '@/lib/api';
import {downloadEvidence,EvidenceSource,uploaderLabel} from '@/lib/evidenceContext';
import {toast} from 'sonner';
import {useAuth} from '@/context/AuthContext';
import {Input} from './ui/input';
import {displayRecordedAt} from '@/lib/managementDates';

function ReuseEvidence({clientId,kind,id,occurrenceId,onSaved}){
  const [q,setQ]=useState(''),[page,setPage]=useState(1),[busy,setBusy]=useState(false);
  const {data,error,loading}=useEvidenceCatalog({client_id:clientId,q,page,page_size:25});
  async function link(row){setBusy(true);try{await api.post(`/evidence-library/items/${row.evidence_id}/relationships`,{linked_type:kind,linked_id:id,occurrence_id:occurrenceId||null,expected_updated_at:row.updated_at||null});toast.success('Existing Evidence linked — no file copied');onSaved();}catch(e){toast.error(formatError(e));}finally{setBusy(false);}}
  return <div className="space-y-2"><Input aria-label="Find existing Evidence" placeholder="Search existing Evidence…" value={q} onChange={e=>{setQ(e.target.value);setPage(1);}}/>{loading&&<p>Loading…</p>}{error&&<p role="alert">{error}</p>}<div className="max-h-60 overflow-auto divide-y divide-line">{data?.items.map(row=><div key={row.evidence_id} className="flex items-center justify-between gap-3 py-2"><span className="text-sm break-words">{row.display_name||row.filename}</span><Button size="sm" variant="outline" disabled={busy} onClick={()=>link(row)}>Link file</Button></div>)}</div>{data&&<EvidencePagination data={data} page={page} setPage={setPage}/>}</div>;
}

export function useEvidenceCatalog(params,refreshKey=0){
  const key=JSON.stringify(params),[result,setResult]=useState({}),[version,setVersion]=useState(0);
  useEffect(()=>{
    let active=true;setResult({key,loading:true});
    api.get('/evidence/catalog',{params:JSON.parse(key)}).then(({data})=>{if(active)setResult({key,data});}).catch(e=>{if(active)setResult({key,error:formatError(e)});});
    return()=>{active=false;};
  },[key,version,refreshKey]);
  return {...(result.key===key?result:{loading:true}),reload:()=>setVersion(v=>v+1)};
}
// Link picker over the paged, searchable Evidence Library catalog. It never loads the whole
// Library, so a large client cannot silently lose items off the end of a capped list.
export function EvidenceCatalogPicker({clientId,linkedIds=[],onLink,disabled=false,label='Link existing Evidence'}){
  const [q,setQ]=useState(''),[page,setPage]=useState(1);
  const {data,error,loading}=useEvidenceCatalog({client_id:clientId,q,page,page_size:25});
  const linked=new Set(linkedIds),items=(data?.items||[]).filter(e=>!linked.has(e.evidence_id));
  const name=e=>e.display_name||e.filename;
  const status=loading?'Loading available evidence…':!data?.total?(q.trim()?'No evidence matches your search.':'No evidence in this client’s Library yet.'):`${data.total} Library item${data.total===1?'':'s'}${q.trim()?' match':''}${data.total>data.page_size?` · page ${page} of ${Math.ceil(data.total/data.page_size)}`:''}${items.length<data.items.length?` · ${data.items.length-items.length} already linked`:''}`;
  return <div className="space-y-2">
    <label className="block">Find existing evidence<Input aria-label="Find existing evidence" value={q} onChange={e=>{setQ(e.target.value);setPage(1);}} placeholder="Search name, filename or type"/></label>
    <label className="block">{label}<select aria-label={label} className="block mt-1 w-full max-w-full rounded-md border border-line bg-surface-card px-2 py-1.5 text-sm" disabled={disabled||!items.length} value="" onChange={e=>{if(e.target.value)onLink(e.target.value);}}><option value="">Select Evidence Library item</option>{items.map(e=><option key={e.evidence_id} value={e.evidence_id}>{name(e)}{e.created_at?` · ${String(e.created_at).slice(0,10)}`:''}</option>)}</select></label>
    {error?<p role="alert" className="text-xs">{error}</p>:<p role="status" className="text-xs text-ink-secondary">{status}</p>}
    {data?.total>data?.page_size&&<EvidencePagination data={data} page={page} setPage={setPage}/>}
  </div>;
}
export function EvidencePagination({data,page,setPage}){
  return <div className="flex items-center justify-between gap-3 text-xs text-ink-secondary" aria-label="Evidence pagination"><span>{data.total?`${(page-1)*data.page_size+1}–${Math.min(page*data.page_size,data.total)}`:'0'} of {data.total} files</span><div className="flex gap-2"><Button type="button" size="sm" variant="outline" disabled={page<=1} onClick={()=>setPage(page-1)}>Previous</Button><Button type="button" size="sm" variant="outline" disabled={page*data.page_size>=data.total} onClick={()=>setPage(page+1)}>Next</Button></div></div>;
}
export function EvidenceDownload({row}){
  return <button type="button" aria-label={`Download ${row.filename}`} title={`Download ${row.filename}`} className="shrink-0 p-2 rounded hover:bg-surface-subtle text-ink-secondary" onClick={()=>downloadEvidence(row).catch(e=>toast.error(formatError(e)))}><Download aria-hidden="true" className="h-3.5 w-3.5"/></button>;
}
function RelationshipAction({row,kind,id,occurrenceId,onDelete,onChanged,allowLink}){
  const {user}=useAuth(),[busy,setBusy]=useState(false);
  const ref=row.references?.find(r=>r.kind===kind&&r.id===id&&(kind!=='reviews'||r.occurrence_id===occurrenceId));
  if(ref?.origin==='supporting'&&!ref.module_owned&&allowLink&&isInternal(user))return <button type="button" className="text-xs underline p-2" disabled={busy} onClick={async()=>{if(!window.confirm('Unlink this supporting Evidence? The file and other relationships remain.'))return;setBusy(true);try{await api.post(`/evidence-library/items/${row.evidence_id}/relationships`,{linked_type:kind,linked_id:id,occurrence_id:occurrenceId||null,remove:true,expected_updated_at:row.updated_at||null});onChanged();}catch(e){toast.error(formatError(e));}finally{setBusy(false);}}}>Unlink</button>;
  return ref?.origin==='upload'&&onDelete?<button type="button" className="text-xs underline p-2" aria-label={`Delete ${row.filename}`} onClick={async()=>{await onDelete(row);onChanged();}}>Delete</button>:null;
}
const headings={direct:'Direct Evidence',actions:'Evidence from Corrective Actions',findings:'Evidence from Linked Findings',review:'Evidence from Source Review',treatment:'Related Treatment Evidence'};
export default function EvidencePanel({clientId,kind,id,occurrenceId,onOpen,refreshKey=0,validatedAt,onDelete,allowLink=true}){
  const {user}=useAuth(),[reuse,setReuse]=useState(false);
  const scope=`${clientId}:${kind}:${id}:${occurrenceId||''}`,[paging,setPaging]=useState({scope,page:1});
  const page=paging.scope===scope?paging.page:1,setPage=value=>setPaging({scope,page:value});
  const result=useEvidenceCatalog({client_id:clientId,entity_type:kind,entity_id:id,...(occurrenceId?{occurrence_id:occurrenceId}:{}),page,page_size:25},refreshKey);
  const {data}=result;
  if(result.loading)return <p role="status" className="text-sm text-ink-secondary">Loading Evidence…</p>;
  if(result.error)return <div role="alert" className="text-sm">Evidence could not be loaded: {result.error} <button type="button" className="underline" onClick={result.reload}>Retry</button></div>;
  if(!data)return null;
  return <section aria-label="Evidence context" className="space-y-4 text-sm">
    <p className="text-xs text-ink-secondary">Files remain attached to their stated source. Related Evidence is shown here without copying it.</p>
    {allowLink&&isInternal(user)&&<div><Button size="sm" variant="outline" onClick={()=>setReuse(!reuse)}>{reuse?'Cancel linking':'Link existing Evidence'}</Button>{reuse&&<ReuseEvidence clientId={clientId} kind={kind} id={id} occurrenceId={occurrenceId} onSaved={()=>{setReuse(false);result.reload();}}/>}</div>}
    {validatedAt&&<p className="text-xs text-ink-secondary">Current retained Evidence; not an immutable snapshot of files inspected at validation. Validation recorded {new Date(validatedAt).toLocaleDateString()}.</p>}
    {Object.entries(headings).filter(([key])=>key==='direct'||data.counts[key]).map(([key,label])=>{
      const rows=data.items.filter(r=>r.category===key),groups=new Map();
      rows.forEach(r=>{const group=`${r.linked_type}:${r.linked_id}:${r.context?.review?.occurrence_id||''}`;groups.set(group,[...(groups.get(group)||[]),r]);});
      return <section key={key} aria-label={label} className="space-y-2"><h3 className="font-medium">{label} <span className="text-ink-secondary font-normal">({data.counts[key]||0})</span></h3>
        {!data.counts[key]?<p className="text-ink-help">No Evidence is directly attached to this {kind==='tasks'?'Action Item':kind==='reviews'?'Review occurrence':kind==='findings'?'Finding':'record'}.</p>:!rows.length?<p className="text-ink-help">These files are on another page.</p>:Array.from(groups.entries()).map(([group,files])=><div key={group} className="border border-line rounded-md p-3 space-y-2">
          <EvidenceSource source={files[0].context?.source} onOpen={onOpen}/>
          {files.map(row=><div key={row.evidence_id} className="flex items-start justify-between gap-2 border-t border-line pt-2" data-testid="context-evidence-file"><div className="min-w-0"><div className="font-medium break-words">{row.filename}</div><div className="text-xs text-ink-secondary">{uploaderLabel(row)} · {displayRecordedAt(row.created_at)||'Upload date not recorded'}</div>{validatedAt&&row.created_at>validatedAt&&<div className="text-xs text-ink-secondary">Uploaded after validation</div>}</div><div className="flex items-center"><EvidenceDownload row={row}/>{key==='direct'&&<RelationshipAction row={row} kind={kind} id={id} occurrenceId={occurrenceId} onDelete={onDelete} allowLink={allowLink} onChanged={()=>{setPage(1);result.reload();}}/>}</div></div>)}
        </div>)}
      </section>;
    })}
    <EvidencePagination data={data} page={page} setPage={setPage}/>
  </section>;
}
