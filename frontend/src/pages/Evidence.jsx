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
import {FolderArchive,Trash2,Download,File as FileIcon} from 'lucide-react';
import {toast} from 'sonner';
import {Input} from '@/components/ui/input';

import {Button} from '@/components/ui/button';
import EvidenceItemDrawer from '@/components/EvidenceItemDrawer';
import {EvidenceUpload,ReviewEvidenceSets,EvidenceSetRecords,SourcePicker,PROGRAM_AREAS,AREA_KIND} from '@/components/EvidenceLibraryControls';
const extraColumns=[['program_areas','Program Area'],['evidence_type','Evidence Type'],['years','Period / Year'],['frameworks','Framework'],['refresh_status','Refresh / Expiration']].map(([key,label])=>({key,label,filter:true,sortable:false}));
export default function Evidence(){const {currentClientId}=useOrg();return <EvidenceWorkspace key={currentClientId}/>;}
function EvidenceWorkspace(){
  const {currentClient,currentClientId}=useOrg(),{user}=useAuth();
  const scopeRef=useRef(currentClientId);scopeRef.current=currentClientId;
  const [adding,setAdding]=useState(false),[itemId,setItemId]=useState(null),[area,setArea]=useState(null),[source,setSource]=useState(null),[selectedSet,setSelectedSet]=useState(null),[all,setAll]=useState(false),[search,setSearch]=useState({}),[paging,setPaging]=useState({}),[drawer,setDrawer]=useState(null);
  const q=search.scope===currentClientId?search.value:'';
  const table=useTableControls({columns:[...tableColumns('evidence'),...extraColumns,...['evidence_date','effective_date'].map(key=>({...tableColumns('evidence').find(c=>c.key==='created_at'),key,label:key==='evidence_date'?'Evidence Date':'Effective Date'}))],rows:[],module:'evidence',scope:`${user?.user_id}:${currentClientId}`});
  const root=selectedSet||source,scopedRoot=root&&(root.kind!=='reviews'||selectedSet);
  const state=JSON.stringify({...table.state,filters:{...table.state.filters,...(area?{program_areas:[area]}:{})}}),pageKey=`${currentClientId}:${q}:${state}:${root?.id}:${root?.occurrence_id}`,page=paging.key===pageKey?paging.page:1;
  const setPage=value=>setPaging({key:pageKey,page:value});
  const now=new Date(),today=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const result=useEvidenceCatalog({client_id:currentClientId,q,state,page,page_size:25,today,...(scopedRoot?{entity_type:root.kind,entity_id:root.id,...(root.occurrence_id?{occurrence_id:root.occurrence_id}:{})}:{})}),data=result.data;
  table.options=column=>columnOptions({...column,optionsOnly:true,options:(data?.facets?.[column.key]||[]).map(value=>({value,label:column.key==='linked_type'?evidenceSourceLabel(value):value}))},[]);
  const canWrite=['super_admin','platform_admin','client_contributor'].includes(user?.role),canDelete=['super_admin','platform_admin'].includes(user?.role);
  const clear=()=>{setSearch({scope:currentClientId,value:''});table.clear();setArea(null);setSource(null);setSelectedSet(null);};
  async function openSource(ref){
    const scope=currentClientId;
    try {const target=await resolveEvidenceSource(ref,scope);if(scopeRef.current===scope)setDrawer({...target,scope});}catch(e){toast.error(formatError(e));}
  }
  async function remove(row){
    if(!window.confirm(`Delete "${row.filename}" from the library? ${row.references?.length||0} source/supporting references. Retained history and bytes are not erased; retention rules apply.`))return;
    try{await api.delete(`/evidence/${row.evidence_id}`);toast.success('Deleted');setPage(1);result.reload();}catch(e){toast.error(formatError(e));}
  }
  return <div><PageHeader title="Evidence Library" subtitle={`${currentClient?.name||''} · Upload where work happens. Find it here with its history intact.`} action={canWrite&&<Button onClick={()=>setAdding(true)}>Add Evidence</Button>}/><div className="page-content space-y-4">

    <div className="flex items-center gap-3"><Input className="max-w-md" aria-label="Search Evidence" placeholder="Search filename or source…" value={q} onChange={e=>setSearch({scope:currentClientId,value:e.target.value})}/>{q&&<button type="button" className="text-xs underline" onClick={()=>setSearch({scope:currentClientId,value:''})}>Clear search</button>}<span className="ml-auto text-xs text-ink-secondary" role="status">{result.loading?'Loading…':data?`${data.total} / ${data.unfiltered_total} files`:''}</span></div>
    <TableFilterChips table={table}/>
    <div className="flex flex-wrap gap-4 text-sm"><Button variant="outline" onClick={()=>{clear();setAll(!all);}}>{all?'Browse Evidence':'All Evidence'}</Button>{['program_areas','evidence_type','years'].map(key=><ColumnControl key={key} table={table} columnKey={key}/>)}<details><summary className="cursor-pointer">More filters</summary><div className="flex flex-wrap gap-3 p-3 border border-line rounded bg-surface-card">{['frameworks','refresh_status','mime_type','uploaded_by_email','created_at','evidence_date','effective_date'].map(key=><ColumnControl key={key} table={table} columnKey={key}/>)}</div></details></div>
    {!all&&!area&&<section aria-label="Browse Evidence" className="grid grid-cols-2 md:grid-cols-4 gap-3">{PROGRAM_AREAS.map(a=><button key={a} className="rounded-md border border-line bg-surface-card p-3 text-left hover:bg-surface-subtle focus-visible:outline focus-visible:outline-2" onClick={()=>{setArea(a);setSource(null);setSelectedSet(null);}}><FolderArchive aria-hidden="true" className="h-4 w-4 text-ink-secondary mb-2"/><span className="font-medium text-sm">{a==='Unassigned'?'Needs Classification':a}</span><span className="block text-xs text-ink-secondary mt-1">{data?.program_counts?.[a]??0} files</span></button>)}</section>}
    {area&&<nav aria-label="Evidence location" className="flex flex-wrap items-center gap-2 text-sm"><button className="underline" onClick={clear}>Evidence Library</button><span>/</span><button className="underline" onClick={()=>{setSource(null);setSelectedSet(null);}}>{area}</button>{source&&<><span>/</span><button className="underline" onClick={()=>setSelectedSet(null)}>{source.title}</button></>}{selectedSet&&<><span>/</span><span>{selectedSet.period}</span></>}</nav>}
    {area&&area!=='Unassigned'&&!source&&<SourcePicker key={area} clientId={currentClientId} kind={AREA_KIND[area]} onSelect={setSource}/>}
    {source?.kind==='reviews'&&!selectedSet&&<ReviewEvidenceSets key={source.id} review={source} onSelect={setSelectedSet} onOpen={openSource}/>}
    {scopedRoot&&<section className="rounded-md border border-line bg-surface-card p-3 space-y-2"><div className="flex justify-between gap-3"><h2 className="font-semibold text-sm">{root.title}{root.period&&' — '+root.period}</h2><Button size="sm" variant="outline" onClick={()=>openSource(root)}>Open {root.label}</Button></div>{selectedSet?.set&&<p className="text-xs text-ink-secondary">{selectedSet.set.status} · {selectedSet.set.completed_by_name||'Reviewer not recorded'} · {selectedSet.set.completed_at?.slice(0,10)||'Not completed'} · {selectedSet.set.outcome?.replaceAll('_',' ')||'No outcome yet'}</p>}<p className="text-xs text-ink-secondary">Open the authoritative record for related Findings, Actions, comments, current document and version history.</p></section>}
    {selectedSet&&<EvidenceSetRecords key={selectedSet.occurrence_id} source={selectedSet} onOpen={openSource}/>}
    <h2 className="text-sm font-semibold">{scopedRoot?'Evidence in this context':all||area||q?'Evidence Items':'Recent Evidence'}</h2>

    {data?.facets_limited&&<p className="text-xs text-ink-secondary">Showing the first 200 filter values. Use search to find additional filenames, sources or uploaders.</p>}
    {result.error&&<p role="alert">Evidence could not be loaded: {result.error} <button className="underline" onClick={result.reload}>Retry</button></p>}
    <div className="register-table-frame bg-surface-card border border-line rounded-lg overflow-x-auto"><table className="w-full"><thead><tr>{['filename','evidence_type','uploaded_by_email','created_at','linked_type'].map(key=><th key={key} className="tbl-head"><ColumnControl table={table} columnKey={key}/></th>)}<th className="tbl-head w-24">Actions</th></tr></thead><tbody>
      {result.loading&&<tr><td colSpan={6} className="tbl-cell py-8 text-center">Loading Evidence…</td></tr>}
      {data&&!data.items.length&&<tr><td colSpan={6} className="tbl-cell py-8 text-center text-ink-help">{data.unfiltered_total?<>No Evidence matches the current search and filters. <button className="underline" onClick={clear}>Clear filters</button></>:'No Evidence uploaded yet.'}</td></tr>}
      {data?.items.map((row,index)=><tr key={row.evidence_id} className="row-hover" data-testid={`evidence-row-${index}`}><td className="tbl-cell font-medium text-ink-primary"><div className="flex gap-2"><FileIcon className="h-3.5 w-3.5 shrink-0 text-ink-help"/><button className="break-words text-left underline underline-offset-4" onClick={()=>setItemId(row.evidence_id)}>{row.display_name||row.filename}</button></div></td><td className="tbl-cell text-ink-secondary">{row.evidence_type||'Other'}</td><td className="tbl-cell text-ink-secondary">{uploaderLabel(row)}</td><td className="tbl-cell text-ink-secondary whitespace-nowrap">{row.created_at?new Date(row.created_at).toLocaleString():'Not recorded'}</td><td className="tbl-cell"><EvidenceSource source={row.context?.source||row.references?.find(ref=>ref.available)} onOpen={openSource}/>{row.context?.source?.kind==='tasks'&&row.context.finding&&<p className="text-xs text-ink-secondary mt-1">Finding: {row.context.finding.title}{row.context.review?` · ${row.context.review.title} — ${row.context.review.period}`:''}</p>}</td><td className="tbl-cell whitespace-nowrap"><button aria-label={`Download ${row.filename}`} title={`Download ${row.filename}`} data-testid={`evidence-download-${index}`} onClick={()=>downloadEvidence(row).catch(e=>toast.error(formatError(e)))} className="p-1 mr-1 rounded hover:bg-surface-subtle text-ink-secondary"><Download className="h-3.5 w-3.5"/></button>{canDelete&&<button aria-label={`Delete ${row.filename}`} title={`Delete ${row.filename}`} data-testid={`evidence-delete-${index}`} onClick={()=>remove(row)} className="p-1 rounded hover:bg-semantic-critical-bg text-ink-help hover:text-semantic-critical"><Trash2 className="h-3.5 w-3.5"/></button>}</td></tr>)}
    </tbody></table></div>
    {data&&<EvidencePagination data={data} page={page} setPage={setPage}/>}
  </div>{adding&&<EvidenceUpload clientId={currentClientId} onClose={()=>setAdding(false)} onSaved={result.reload}/>} {itemId&&<EvidenceItemDrawer key={itemId} id={itemId} onClose={()=>setItemId(null)} onOpen={openSource} onChanged={result.reload}/>} {drawer?.scope===currentClientId&&<RecordDrawer open onOpenChange={open=>{if(!open)setDrawer(null);}} {...drawer} clientId={currentClientId} onSaved={result.reload}/>}</div>;
}
