import {useEffect,useState} from 'react';
import {Download} from 'lucide-react';
import {Button} from './ui/button';
import api,{formatError} from '@/lib/api';
import {downloadEvidence,EvidenceSource,uploaderLabel} from '@/lib/evidenceContext';
import {toast} from 'sonner';

export function useEvidenceCatalog(params,refreshKey=0){
  const key=JSON.stringify(params),[result,setResult]=useState({}),[version,setVersion]=useState(0);
  useEffect(()=>{
    let active=true;setResult({key,loading:true});
    api.get('/evidence/catalog',{params:JSON.parse(key)}).then(({data})=>{if(active)setResult({key,data});}).catch(e=>{if(active)setResult({key,error:formatError(e)});});
    return()=>{active=false;};
  },[key,version,refreshKey]);
  return {...(result.key===key?result:{loading:true}),reload:()=>setVersion(v=>v+1)};
}
export function EvidencePagination({data,page,setPage}){
  return <div className="flex items-center justify-between gap-3 text-xs text-ink-secondary" aria-label="Evidence pagination"><span>{data.total?`${(page-1)*data.page_size+1}–${Math.min(page*data.page_size,data.total)}`:'0'} of {data.total} files</span><div className="flex gap-2"><Button type="button" size="sm" variant="outline" disabled={page<=1} onClick={()=>setPage(page-1)}>Previous</Button><Button type="button" size="sm" variant="outline" disabled={page*data.page_size>=data.total} onClick={()=>setPage(page+1)}>Next</Button></div></div>;
}
export function EvidenceDownload({row}){
  return <button type="button" aria-label={`Download ${row.filename}`} title={`Download ${row.filename}`} className="shrink-0 p-2 rounded hover:bg-surface-subtle text-ink-secondary" onClick={()=>downloadEvidence(row).catch(e=>toast.error(formatError(e)))}><Download aria-hidden="true" className="h-3.5 w-3.5"/></button>;
}
const headings={direct:'Direct Evidence',actions:'Evidence from Corrective Actions',findings:'Evidence from Linked Findings',review:'Evidence from Source Review',treatment:'Related Treatment Evidence'};
export default function EvidencePanel({clientId,kind,id,occurrenceId,onOpen,refreshKey=0,validatedAt,onDelete}){
  const scope=`${clientId}:${kind}:${id}:${occurrenceId||''}`,[paging,setPaging]=useState({scope,page:1});
  const page=paging.scope===scope?paging.page:1,setPage=value=>setPaging({scope,page:value});
  const result=useEvidenceCatalog({client_id:clientId,entity_type:kind,entity_id:id,...(occurrenceId?{occurrence_id:occurrenceId}:{}),page,page_size:25},refreshKey);
  const {data}=result;
  if(result.loading)return <p role="status" className="text-sm text-ink-secondary">Loading Evidence…</p>;
  if(result.error)return <div role="alert" className="text-sm">Evidence could not be loaded: {result.error} <button type="button" className="underline" onClick={result.reload}>Retry</button></div>;
  if(!data)return null;
  return <section aria-label="Evidence context" className="space-y-4 text-sm">
    <p className="text-xs text-ink-secondary">Files remain attached to their stated source. Related Evidence is shown here without copying it.</p>
    {validatedAt&&<p className="text-xs text-ink-secondary">Current retained Evidence; not an immutable snapshot of files inspected at validation. Validation recorded {new Date(validatedAt).toLocaleDateString()}.</p>}
    {Object.entries(headings).filter(([key])=>key==='direct'||data.counts[key]).map(([key,label])=>{
      const rows=data.items.filter(r=>r.category===key),groups=new Map();
      rows.forEach(r=>{const group=`${r.linked_type}:${r.linked_id}:${r.context?.review?.occurrence_id||''}`;groups.set(group,[...(groups.get(group)||[]),r]);});
      return <section key={key} aria-label={label} className="space-y-2"><h3 className="font-medium">{label} <span className="text-ink-secondary font-normal">({data.counts[key]||0})</span></h3>
        {!data.counts[key]?<p className="text-ink-help">No Evidence is directly attached to this {kind==='tasks'?'Action Item':kind==='reviews'?'Review occurrence':kind==='findings'?'Finding':'record'}.</p>:!rows.length?<p className="text-ink-help">These files are on another page.</p>:Array.from(groups.entries()).map(([group,files])=><div key={group} className="border border-line rounded-md p-3 space-y-2">
          <EvidenceSource source={files[0].context?.source} onOpen={onOpen}/>
          {files.map(row=><div key={row.evidence_id} className="flex items-start justify-between gap-2 border-t border-line pt-2" data-testid="context-evidence-file"><div className="min-w-0"><div className="font-medium break-words">{row.filename}</div><div className="text-xs text-ink-secondary">{uploaderLabel(row)} · {row.created_at?new Date(row.created_at).toLocaleString():'Upload date not recorded'}</div>{validatedAt&&row.created_at>validatedAt&&<div className="text-xs text-ink-secondary">Uploaded after validation</div>}</div><div className="flex items-center"><EvidenceDownload row={row}/>{key==='direct'&&onDelete&&<button type="button" className="text-xs underline p-2" aria-label={`Delete ${row.filename}`} onClick={async()=>{await onDelete(row);setPage(1);result.reload();}}>Delete</button>}</div></div>)}
        </div>)}
      </section>;
    })}
    <EvidencePagination data={data} page={page} setPage={setPage}/>
  </section>;
}
