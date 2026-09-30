import {useRef,useState} from 'react';
import {useOrg} from '@/context/OrgContext';
import {useAuth} from '@/context/AuthContext';
import {useCompliance} from '@/context/ComplianceContext';
import {canOperate} from '@/lib/permissions';
import {SCHEMAS} from '@/lib/schemas';
import {FRAMEWORKS} from '@/lib/frameworks';
import {formatError} from '@/lib/api';
import PageHeader from '@/components/PageHeader';
import {PrimaryAction,SearchField} from '@/components/Register';
import {HistoryDate} from '@/components/RegisterCells';
import RegisterLoadError from '@/components/RegisterLoadError';
import RecordDrawer from '@/components/RecordDrawer';
import {useEvidenceCatalog,EvidencePagination} from '@/components/EvidencePanel';
import {EvidenceSource,resolveEvidenceSource,downloadEvidence,uploaderLabel} from '@/lib/evidenceContext';
import {Folder,Download,File as FileIcon,ChevronRight,Plus} from 'lucide-react';
import {toast} from 'sonner';
import EvidenceItemDrawer from '@/components/EvidenceItemDrawer';
import {EvidenceUpload,PROGRAM_AREAS} from '@/components/EvidenceLibraryControls';
import '@/components/EvidenceRepository.css';
import {isBrawndoReference} from '@/lib/reference';
import {BrawndoSurface,BrawndoPageHeader} from '@/components/BrawndoPage';
import './BrawndoEvidence.css';

const areaName=a=>a==='Unassigned'?'Needs Classification':a;
const reviewTypes=SCHEMAS.reviews.fields.find(f=>f.name==='review_type').options;
const folderName=f=>f.area==='Reviews'?(reviewTypes.find(t=>t.value===f.key)?`${reviewTypes.find(t=>t.value===f.key).label} Reviews`:f.label):f.area==='Frameworks'?(FRAMEWORKS.find(t=>t.key===f.key)?.label||f.label):f.label;
export default function Evidence(){const {currentClientId}=useOrg(),{user}=useAuth();return <EvidenceWorkspace key={`${user?.user_id}:${currentClientId}`}/>;}
function EvidenceWorkspace(){
  const {currentClientId,currentClient}=useOrg(),{user}=useAuth(),compliance=useCompliance();
  const pilot=isBrawndoReference(currentClientId,user);
  const scopeRef=useRef(currentClientId);scopeRef.current=currentClientId;
  const [area,setArea]=useState(''),[folder,setFolder]=useState(null),[q,setQ]=useState(''),[page,setPage]=useState(1),[all,setAll]=useState(false);
  const [adding,setAdding]=useState(false),[itemId,setItemId]=useState(null),[drawer,setDrawer]=useState(null);
  const [archived,setArchived]=useState(false);
  const landing=!area&&!q&&!all;
  const state=JSON.stringify({include_archived:archived,filters:{...(area?{program_areas:[area]}:{}),...(folder?{folder_paths:[folder.path]}:{})}});
  const result=useEvidenceCatalog({client_id:currentClientId,q,state,page,page_size:landing?5:25}),data=result.data;
  const go=(nextArea='',nextFolder=null)=>{setArea(nextArea);setFolder(nextFolder);setQ('');setPage(1);setAll(false);if(!nextArea)setArchived(false);};
  const groups=(data?.folder_counts||[]).filter(f=>f.area===area).sort((a,b)=>folderName(a).localeCompare(folderName(b)));
  const enabled=new Set(compliance.items.map(f=>f.key));
  const visibleGroups=area==='Frameworks'?compliance.items.map(f=>groups.find(g=>g.key===f.key)||{area:'Frameworks',key:f.key,label:f.label,path:JSON.stringify(['Frameworks',f.key]),count:0}):groups;
  const showFiles=landing||!!q||!!folder||all||area==='Unassigned'||area&&!groups.length;
  async function openSource(ref){try{const target=await resolveEvidenceSource(ref,currentClientId);if(scopeRef.current===currentClientId)setDrawer(target);}catch(e){toast.error(formatError(e));}}
  const tile=(key,name,count,onClick)=><button type="button" key={key} className="evidence-folder" onClick={onClick}><Folder aria-hidden="true" size={23}/><span><strong>{name}</strong><small>{count} {count===1?'file':'files'}</small></span><ChevronRight aria-hidden="true" size={15}/></button>;
  const body=<>
    {pilot?<BrawndoPageHeader eyebrow={`${currentClient?.name||'Client'} · Evidence repository`} title="Evidence Library">{canOperate(user)&&<button type="button" className="bpage-btn bpage-btn-primary" onClick={()=>setAdding(true)} data-testid="add-evidence"><Plus size={16} aria-hidden="true"/>Add Evidence</button>}</BrawndoPageHeader>
    :<PageHeader title="Evidence Library" subtitle="Evidence organized by work area and record type." action={canOperate(user)&&<PrimaryAction label="Add Evidence" onClick={()=>setAdding(true)} testid="add-evidence"/>}/>}
    <div className="register-toolbar"><SearchField label="Search Evidence" placeholder={area?`Search within ${areaName(area)}…`:'Search evidence…'} value={q} onChange={v=>{setQ(v);setPage(1);}} testid="evidence-search"/>{q&&<button className="register-link" onClick={()=>{setQ('');setPage(1);}}>Clear search</button>}</div>
    <div className="section-body space-y-5">
      {area&&<nav aria-label="Evidence location" className="evidence-breadcrumbs"><button onClick={()=>go()}>Evidence Library</button><ChevronRight aria-hidden="true" size={14}/>{folder?<><button onClick={()=>go(area)}>{areaName(area)}</button><ChevronRight aria-hidden="true" size={14}/><span aria-current="page">{folderName(folder)}</span></>:<span aria-current="page">{areaName(area)}</span>}</nav>}
      <RegisterLoadError error={result.error} onRetry={result.reload} name="Evidence"/>
      {result.loading&&<p role="status" className="text-sm text-ink-secondary">Loading evidence…</p>}
      {!area&&!q&&!all&&<section aria-label="Browse evidence"><h2 className="text-sm font-semibold mb-3">Browse</h2><div className="evidence-folders">{PROGRAM_AREAS.map(a=>tile(a,areaName(a),data?.program_counts?.[a]||0,()=>go(a)))}</div></section>}
      {area&&!folder&&!q&&<section aria-label={`${areaName(area)} folders`}><h2 className="font-semibold mb-1">{areaName(area)}</h2><p className="text-sm text-ink-secondary mb-3">{area==='Unassigned'?'Link these files to their originating work to classify them.':'Files appear here from existing source and supporting relationships.'}</p>
        {area==='Frameworks'&&compliance.error&&<p role="alert">Framework configuration could not be loaded: {compliance.error}</p>}
        <div className="evidence-folders">{visibleGroups.map(f=>tile(f.path,folderName(f),f.count,()=>go(area,f)))}</div>
        {area==='Frameworks'&&groups.some(f=>!enabled.has(f.key))&&<p className="text-sm text-ink-secondary mt-3">Evidence from inactive or unrecorded frameworks remains available in search and All files below.</p>}
        {!!groups.length&&<button className="register-link text-sm mt-3" onClick={()=>setAll(!all)}>{all?'Hide files':'All files in this area'}</button>}
      </section>}
      {showFiles&&data&&<section aria-label="Evidence files"><div className="flex justify-between items-center gap-3 mb-3"><h2 className="text-sm font-semibold">{landing?'Recent uploads':q?'Search results':folder?folderName(folder):'Files'}</h2>{landing&&<button className="register-link text-sm" onClick={()=>setAll(true)}>View all evidence</button>}{all&&!area&&<button className="register-link text-sm" onClick={()=>go()}>Browse folders</button>}</div>
        {!landing&&<label className="flex items-center gap-2 text-sm mb-3"><input type="checkbox" checked={archived} onChange={e=>{setArchived(e.target.checked);setPage(1);}}/>Include archived evidence</label>}
        {!data.items.length?<div className="empty-state">{q?'No evidence matches your search.':area==='Unassigned'?'No evidence needs classification.':'No evidence yet. Files uploaded from the source record appear here automatically.'}</div>:<div className="register-table-frame overflow-x-auto" role="region" aria-label="Evidence files" tabIndex={0}><table className="w-full"><thead><tr>{['File','Type','Linked To','Uploaded By','Date','Actions'].map(t=><th scope="col" className="tbl-head" key={t}>{t}</th>)}</tr></thead><tbody>{data.items.map((row,index)=><tr key={row.evidence_id} className="row-hover" data-testid={`evidence-row-${index}`}>
          <td className="tbl-cell"><div className="flex gap-2 items-start"><FileIcon aria-hidden="true" size={16} className="shrink-0 mt-1"/><button className="register-record-link" onClick={()=>setItemId(row.evidence_id)}>{row.display_name||row.filename}</button></div></td>
          <td className="tbl-cell">{row.evidence_type||'Other'}{row.archived_at&&<span className="register-subline">Archived</span>}</td><td className="tbl-cell"><EvidenceSource source={row.context?.source||row.references?.find(r=>r.available)} onOpen={openSource}/>{row.context?.source?.kind==='tasks'&&row.context.finding&&<span className="register-subline">Finding: {row.context.finding.title}</span>}{row.references?.length>1&&<span className="register-subline">{row.references.length} linked contexts</span>}</td><td className="tbl-cell">{uploaderLabel(row)}</td><td className="tbl-cell"><HistoryDate value={row.created_at} empty="Not recorded"/></td>
          <td className="tbl-cell"><button className="register-icon-button" aria-label={`Download ${row.filename}`} title={`Download ${row.filename}`} data-testid={`evidence-download-${index}`} onClick={()=>downloadEvidence(row).catch(e=>toast.error(formatError(e)))}><Download size={16} aria-hidden="true"/></button></td>
        </tr>)}</tbody></table></div>}{!landing&&<EvidencePagination data={data} page={page} setPage={setPage}/>}</section>}
    </div>
    {adding&&<EvidenceUpload clientId={currentClientId} initialArea={area||'Unassigned'} onClose={()=>setAdding(false)} onSaved={result.reload}/>}
    {itemId&&<EvidenceItemDrawer key={itemId} id={itemId} onClose={()=>setItemId(null)} onOpen={openSource} onChanged={result.reload}/>}
    {drawer&&<RecordDrawer open onOpenChange={v=>{if(!v)setDrawer(null);}} {...drawer} clientId={currentClientId} onSaved={result.reload}/>}
  </>;
  return pilot?<BrawndoSurface className="register-surface evidence-repository bevidence" data-testid="brawndo-evidence">{body}</BrawndoSurface>:<div className="register-surface evidence-repository">{body}</div>;
}
