import '@/components/RegisterSignalBar.css';
import {ageDays,STALE_DAYS} from '@/lib/cisVerification';
import {useTableControls,ColumnControl,TableFilterChips} from '@/components/TableControls';
import {tableColumns} from '@/lib/tableColumns';
import {columnOptions} from '@/lib/tableFilters';
import {useRef,useState} from 'react';
import api,{formatError} from '@/lib/api';
import {useOrg} from '@/context/OrgContext';
import {useAuth} from '@/context/AuthContext';
import PageHeader from '@/components/PageHeader';
import {HeaderActions,PrimaryAction,SecondaryAction,SearchField,SortableHeader} from '@/components/Register';
import {HistoryDate} from '@/components/RegisterCells';
import TableLoadingRow from '@/components/TableLoadingRow';
import RegisterLoadError from '@/components/RegisterLoadError';
import RecordDrawer from '@/components/RecordDrawer';
import {useEvidenceCatalog,EvidencePagination} from '@/components/EvidencePanel';
import {EvidenceSource,resolveEvidenceSource,downloadEvidence,uploaderLabel,evidenceSourceLabel} from '@/lib/evidenceContext';
import {FolderArchive,Trash2,Download,File as FileIcon} from 'lucide-react';
import {toast} from 'sonner';

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
  const canWrite=['super_admin','platform_admin','client_grc_manager','client_contributor'].includes(user?.role),canDelete=['super_admin','platform_admin'].includes(user?.role);
  const clear=()=>{setSearch({scope:currentClientId,value:''});table.clear();setArea(null);setSource(null);setSelectedSet(null);};
  async function openSource(ref){
    const scope=currentClientId;
    try {const target=await resolveEvidenceSource(ref,scope);if(scopeRef.current===scope)setDrawer({...target,scope});}catch(e){toast.error(formatError(e));}
  }
  async function remove(row){
    if(!window.confirm(`Delete "${row.filename}" from the library? ${row.references?.length||0} source/supporting references. Retained history and bytes are not erased; retention rules apply.`))return;
    try{await api.delete(`/evidence/${row.evidence_id}`);toast.success('Deleted');setPage(1);result.reload();}catch(e){toast.error(formatError(e));}
  }
  const ageViews=[['evidence_date','older12','Older than 12 months'],['created_at','last30','Added in last 30 days']];
  return <div className="register-surface"><PageHeader title="Evidence Library" subtitle="Evidence files and their provenance, organized by where the work happened."
      action={canWrite&&<HeaderActions><PrimaryAction label="Add Evidence" onClick={()=>setAdding(true)} testid="add-evidence"/></HeaderActions>}/>
    <div className="register-toolbar">
      <SearchField label="Search Evidence" placeholder="Search filename or source…" value={q} onChange={value=>setSearch({scope:currentClientId,value})} testid="evidence-search"/>
      <div className="quick-filters inline-flex items-center" role="group" aria-label="Evidence views">{ageViews.map(([key,range,label])=>{const on=(table.state.filters?.[key]||[]).includes(range);
        return <button key={range} type="button" aria-pressed={on} data-testid={`evidence-view-${range}`} onClick={()=>{setAll(true);setArea(null);setSource(null);setSelectedSet(null);table.setFilter(key,on?[]:[range]);}}>{label}</button>;})}</div>
      <div className="inline-flex flex-wrap items-center gap-3 text-xs">{['program_areas','evidence_type','years'].map(key=><ColumnControl key={key} table={table} columnKey={key}/>)}
        <details className="evidence-more"><summary className="cursor-pointer text-ink-secondary">More filters</summary><div className="evidence-more-panel">{['frameworks','refresh_status','mime_type','uploaded_by_email','created_at','evidence_date','effective_date'].map(key=><ColumnControl key={key} table={table} columnKey={key}/>)}</div></details></div>
      <span className="register-count" role="status">{result.loading?'Loading…':data?`${data.total} / ${data.unfiltered_total} files`:''}</span>
    </div>
    {!area&&<nav aria-label="Browse Evidence by source" className="evidence-areas">
      <span className="evidence-areas-label">Browse</span>
      {PROGRAM_AREAS.map(a=><button key={a} type="button" className="evidence-area" data-testid={`evidence-area-${a}`} onClick={()=>{setArea(a);setSource(null);setSelectedSet(null);}}>
        <FolderArchive aria-hidden="true"/>{a==='Unassigned'?'Needs Classification':a}<span>{data?.program_counts?.[a]??0}</span></button>)}
    </nav>}
    <div className="section-body space-y-3">
    <TableFilterChips table={table}/>
    {area&&<nav aria-label="Evidence location" className="flex flex-wrap items-center gap-2 text-sm"><button className="register-link" onClick={clear}>Evidence Library</button><span aria-hidden="true">/</span><button className="register-link" onClick={()=>{setSource(null);setSelectedSet(null);}}>{area==='Unassigned'?'Needs Classification':area}</button>{source&&<><span aria-hidden="true">/</span><button className="register-link" onClick={()=>setSelectedSet(null)}>{source.title}</button></>}{selectedSet&&<><span aria-hidden="true">/</span><span>{selectedSet.period}</span></>}</nav>}
    {area&&area!=='Unassigned'&&!source&&<SourcePicker key={area} clientId={currentClientId} kind={AREA_KIND[area]} onSelect={setSource}/>}
    {source?.kind==='reviews'&&!selectedSet&&<ReviewEvidenceSets key={source.id} review={source} onSelect={setSelectedSet} onOpen={openSource}/>}
    {scopedRoot&&<section className="rounded-md border border-line bg-surface-card p-3 space-y-2"><div className="flex justify-between gap-3"><h2 className="font-semibold text-sm">{root.title}{root.period&&' — '+root.period}</h2><SecondaryAction label={`Open ${root.label}`} onClick={()=>openSource(root)}/></div>{selectedSet?.set&&<p className="text-xs text-ink-secondary">{selectedSet.set.status} · {selectedSet.set.completed_by_name||'Reviewer not recorded'} · {selectedSet.set.completed_at?.slice(0,10)||'Not completed'} · {selectedSet.set.outcome?.replaceAll('_',' ')||'No outcome yet'}</p>}<p className="text-xs text-ink-secondary">Open the authoritative record for related Findings, Actions, comments, current document and version history.</p></section>}
    {selectedSet&&<EvidenceSetRecords key={selectedSet.occurrence_id} source={selectedSet} onOpen={openSource}/>}
    <h2 className="text-sm font-semibold">{scopedRoot?'Evidence in this context':all||area||q?'Evidence Items':'Recent Evidence'}</h2>

    {data?.facets_limited&&<p className="text-xs text-ink-secondary">Showing the first 200 filter values. Use search to find additional filenames, sources or uploaders.</p>}
    <RegisterLoadError error={result.error&&`${result.error}`} onRetry={result.reload} name="Evidence"/>
    <div className="register-table-frame overflow-x-auto"><table className="w-full"><thead><tr>{['filename','evidence_type','uploaded_by_email','created_at','linked_type'].map(key=><SortableHeader key={key} table={table} columnKey={key}/>)}<th className="tbl-head w-20"><span className="sr-only">Actions</span></th></tr></thead><tbody className="divide-y divide-line">
      {result.loading&&<TableLoadingRow colSpan={6}/>}
      {data&&!data.items.length&&<tr><td colSpan={6} className="empty-state">{data.unfiltered_total?<>No Evidence matches the current search and filters. <button className="register-link" onClick={clear}>Clear filters</button></>:'No Evidence uploaded yet.'}</td></tr>}
      {data?.items.map((row,index)=><tr key={row.evidence_id} className="row-hover row-open" data-testid={`evidence-row-${index}`} onClick={()=>setItemId(row.evidence_id)}>
        <td className="tbl-cell"><div className="flex gap-2"><FileIcon aria-hidden="true" className="h-3.5 w-3.5 mt-0.5 shrink-0 text-ink-help"/><button type="button" className="register-record-link" onClick={e=>{e.stopPropagation();setItemId(row.evidence_id);}}>{row.display_name||row.filename}</button></div></td>
        <td className="tbl-cell text-ink-secondary">{row.evidence_type||'Other'}</td>
        <td className="tbl-cell text-ink-secondary">{uploaderLabel(row)}</td>
        <td className="tbl-cell whitespace-nowrap"><HistoryDate value={row.created_at} empty="Not recorded"/>{(ageDays(row.evidence_date||row.created_at)??0)>STALE_DAYS&&<span className="register-subline is-attention">Over 12 months old</span>}</td>
        <td className="tbl-cell" onClick={e=>e.stopPropagation()}><EvidenceSource source={row.context?.source||row.references?.find(ref=>ref.available)} onOpen={openSource}/>{row.context?.source?.kind==='tasks'&&row.context.finding&&<span className="register-subline">Finding: {row.context.finding.title}{row.context.review?` · ${row.context.review.title} — ${row.context.review.period}`:''}</span>}</td>
        <td className="tbl-cell whitespace-nowrap" onClick={e=>e.stopPropagation()}><button type="button" aria-label={`Download ${row.filename}`} title={`Download ${row.filename}`} data-testid={`evidence-download-${index}`} onClick={()=>downloadEvidence(row).catch(e=>toast.error(formatError(e)))} className="register-icon-button"><Download className="h-3.5 w-3.5" aria-hidden="true"/></button>{canDelete&&<button type="button" aria-label={`Delete ${row.filename}`} title={`Delete ${row.filename}`} data-testid={`evidence-delete-${index}`} onClick={()=>remove(row)} className="register-icon-button is-destructive"><Trash2 className="h-3.5 w-3.5" aria-hidden="true"/></button>}</td></tr>)}
    </tbody></table></div>
    {data&&<EvidencePagination data={data} page={page} setPage={setPage}/>}
  </div>{adding&&<EvidenceUpload clientId={currentClientId} onClose={()=>setAdding(false)} onSaved={result.reload}/>} {itemId&&<EvidenceItemDrawer key={itemId} id={itemId} onClose={()=>setItemId(null)} onOpen={openSource} onChanged={result.reload}/>} {drawer?.scope===currentClientId&&<RecordDrawer open onOpenChange={open=>{if(!open)setDrawer(null);}} {...drawer} clientId={currentClientId} onSaved={result.reload}/>}</div>;
}
