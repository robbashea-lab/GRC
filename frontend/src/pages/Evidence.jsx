import {useTableControls,ColumnControl,TableFilterChips} from '@/components/TableControls';
import {tableColumns} from '@/lib/tableColumns';
import {columnOptions} from '@/lib/tableFilters';
import {useRef,useState} from 'react';
import api,{formatError} from '@/lib/api';
import {useOrg} from '@/context/OrgContext';
import {useAuth} from '@/context/AuthContext';
import PageHeader from '@/components/PageHeader';
import RecordDrawer from '@/components/RecordDrawer';
import {useEvidenceCatalog,EvidencePagination} from '@/components/EvidencePanel';
import {EvidenceSource,resolveEvidenceSource,downloadEvidence,uploaderLabel,evidenceSourceLabel} from '@/lib/evidenceContext';
import {UploadCloud,Trash2,Download,File as FileIcon} from 'lucide-react';
import {toast} from 'sonner';
import {Input} from '@/components/ui/input';

const fileData=file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});
export default function Evidence(){
  const {currentClient,currentClientId}=useOrg(),{user}=useAuth();
  const inputRef=useRef(null),scopeRef=useRef(currentClientId);scopeRef.current=currentClientId;
  const [dragOver,setDragOver]=useState(false),[search,setSearch]=useState({}),[paging,setPaging]=useState({}),[drawer,setDrawer]=useState(null);
  const q=search.scope===currentClientId?search.value:'';
  const table=useTableControls({columns:tableColumns('evidence'),rows:[],module:'evidence',scope:`${user?.user_id}:${currentClientId}`});
  const state=JSON.stringify(table.state),pageKey=`${currentClientId}:${q}:${state}`,page=paging.key===pageKey?paging.page:1;
  const setPage=value=>setPaging({key:pageKey,page:value});
  const now=new Date(),today=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const result=useEvidenceCatalog({client_id:currentClientId,q,state,page,page_size:25,today}),data=result.data;
  table.options=column=>columnOptions({...column,optionsOnly:true,options:(data?.facets?.[column.key]||[]).map(value=>({value,label:column.key==='linked_type'?evidenceSourceLabel(value):value}))},[]);
  const canWrite=['super_admin','platform_admin','client_contributor'].includes(user?.role),canDelete=['super_admin','platform_admin'].includes(user?.role);
  const clear=()=>{setSearch({scope:currentClientId,value:''});table.clear();};
  async function openSource(ref){
    const scope=currentClientId;
    try {const target=await resolveEvidenceSource(ref,scope);if(scopeRef.current===scope)setDrawer({...target,scope});}catch(e){toast.error(formatError(e));}
  }
  async function upload(files){
    if(!canWrite)return;
    for(const file of files)try{await api.post('/evidence',{client_id:currentClientId,filename:file.name,mime_type:file.type,content_base64:await fileData(file)});toast.success(`Uploaded ${file.name}`);}catch(e){toast.error(formatError(e));}
    result.reload();
  }
  async function remove(row){
    if(!confirm(`Delete "${row.filename}"?`))return;
    try{await api.delete(`/evidence/${row.evidence_id}`);toast.success('Deleted');setPage(1);result.reload();}catch(e){toast.error(formatError(e));}
  }
  return <div><PageHeader title="Evidence & Documents" subtitle={`${currentClient?.name||''} · Artifacts and their authoritative source records.`}/><div className="page-content space-y-4">
    {canWrite&&<div data-testid="evidence-dropzone" role="button" tabIndex={0} aria-label="Upload evidence files" onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();inputRef.current?.click();}}} onDragOver={e=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)} onDrop={e=>{e.preventDefault();setDragOver(false);upload(Array.from(e.dataTransfer.files));}} onClick={()=>inputRef.current?.click()} className={`rounded-md border border-dashed p-4 text-center cursor-pointer ${dragOver?'border-brand-charcoal bg-surface-subtle':'border-line-strong bg-surface-card hover:bg-surface-app'}`}><UploadCloud className="h-5 w-5 mx-auto text-ink-muted mb-1"/><div className="text-sm font-medium">Drop files here or click to upload</div><div className="text-xs text-ink-secondary mt-1">Files remain associated with this client.</div><input ref={inputRef} type="file" multiple className="hidden" data-testid="evidence-file-input" onChange={e=>{upload(Array.from(e.target.files||[]));e.target.value='';}}/></div>}
    <div className="flex items-center gap-3"><Input className="max-w-md" aria-label="Search Evidence" placeholder="Search filename or source…" value={q} onChange={e=>setSearch({scope:currentClientId,value:e.target.value})}/>{q&&<button type="button" className="text-xs underline" onClick={()=>setSearch({scope:currentClientId,value:''})}>Clear search</button>}<span className="ml-auto text-xs text-ink-secondary" role="status">{result.loading?'Loading…':data?`${data.total} / ${data.unfiltered_total} files`:''}</span></div>
    <TableFilterChips table={table}/>
    {data?.facets_limited&&<p className="text-xs text-ink-secondary">Showing the first 200 filter values. Use search to find additional filenames, sources or uploaders.</p>}
    {result.error&&<p role="alert">Evidence could not be loaded: {result.error} <button className="underline" onClick={result.reload}>Retry</button></p>}
    <div className="register-table-frame bg-surface-card border border-line rounded-lg overflow-x-auto"><table className="w-full"><thead><tr>{['filename','mime_type','uploaded_by_email','created_at','linked_type'].map(key=><th key={key} className="tbl-head"><ColumnControl table={table} columnKey={key}/></th>)}<th className="tbl-head w-24">Actions</th></tr></thead><tbody>
      {result.loading&&<tr><td colSpan={6} className="tbl-cell py-8 text-center">Loading Evidence…</td></tr>}
      {data&&!data.items.length&&<tr><td colSpan={6} className="tbl-cell py-8 text-center text-ink-help">{data.unfiltered_total?<>No Evidence matches the current search and filters. <button className="underline" onClick={clear}>Clear filters</button></>:'No Evidence uploaded yet.'}</td></tr>}
      {data?.items.map((row,index)=><tr key={row.evidence_id} className="row-hover" data-testid={`evidence-row-${index}`}><td className="tbl-cell font-medium text-ink-primary"><div className="flex gap-2"><FileIcon className="h-3.5 w-3.5 shrink-0 text-ink-help"/><span className="break-words">{row.filename}</span></div></td><td className="tbl-cell text-ink-secondary">{row.mime_type||'—'}</td><td className="tbl-cell text-ink-secondary">{uploaderLabel(row)}</td><td className="tbl-cell text-ink-secondary whitespace-nowrap">{row.created_at?new Date(row.created_at).toLocaleString():'Not recorded'}</td><td className="tbl-cell"><EvidenceSource source={row.context?.source} onOpen={openSource}/>{row.context?.source?.kind==='tasks'&&row.context.finding&&<p className="text-xs text-ink-secondary mt-1">Finding: {row.context.finding.title}{row.context.review?` · ${row.context.review.title} — ${row.context.review.period}`:''}</p>}</td><td className="tbl-cell whitespace-nowrap"><button aria-label={`Download ${row.filename}`} title={`Download ${row.filename}`} data-testid={`evidence-download-${index}`} onClick={()=>downloadEvidence(row).catch(e=>toast.error(formatError(e)))} className="p-1 mr-1 rounded hover:bg-surface-subtle text-ink-secondary"><Download className="h-3.5 w-3.5"/></button>{canDelete&&<button aria-label={`Delete ${row.filename}`} title={`Delete ${row.filename}`} data-testid={`evidence-delete-${index}`} onClick={()=>remove(row)} className="p-1 rounded hover:bg-semantic-critical-bg text-ink-help hover:text-semantic-critical"><Trash2 className="h-3.5 w-3.5"/></button>}</td></tr>)}
    </tbody></table></div>
    {data&&<EvidencePagination data={data} page={page} setPage={setPage}/>}
  </div>{drawer?.scope===currentClientId&&<RecordDrawer open onOpenChange={open=>{if(!open)setDrawer(null);}} {...drawer} clientId={currentClientId} onSaved={result.reload}/>}</div>;
}
