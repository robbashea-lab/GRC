import {Fragment,useEffect,useMemo,useRef,useState} from 'react';
import {Download,File as FileIcon,Folder,Plus,Search,ArrowDown,Sun} from 'lucide-react';
import api,{formatError} from '@/lib/api';
import {displayDay} from '@/lib/managementDates';
import {useBrawndoTheme} from '@/lib/brawndoTheme';
import {collectEvidencePages,evidenceOverview,evidenceCoverage,evidenceFileSize} from '@/lib/brawndoAdditionalEvidence';
import {EvidenceSource,downloadEvidence,uploaderLabel} from '@/lib/evidenceContext';
import {useEvidenceCatalog,EvidencePagination} from './EvidencePanel';
import {PROGRAM_AREAS} from './EvidenceLibraryControls';
import {toast} from 'sonner';
import './AdditionalEvidence.css';

const areaName=area=>area==='Unassigned'?'Needs Classification':area;
const assertClient=(rows,clientId)=>{if(!Array.isArray(rows)||rows.some(row=>row?.client_id!==clientId))throw new Error('Client data mismatch');return rows;};
export const initialEvidenceView=()=>({area:'',folder:null,recent:false,q:'',type:'',year:'',page:1,archived:false,sort:{key:'created_at',dir:'desc'},missing:false});

function useEvidenceOverview(clientId,revision){
  const [state,setState]=useState({}),[attempt,setAttempt]=useState(0),key=`${clientId}:${revision}:${attempt}`;
  useEffect(()=>{
    const controller=new AbortController(),signal=controller.signal;setState({key,loading:true});
    async function load(){
      const [files,assessmentResponse,reviewResponse]=await Promise.all([
        collectEvidencePages(async page=>(await api.get('/evidence/catalog',{params:{client_id:clientId,page,page_size:100},signal})).data,{signal}),
        api.get('/frameworks/cis-ig1',{params:{client_id:clientId},signal}),
        api.get('/reviews',{params:{client_id:clientId},signal})
      ]);
      assertClient(files,clientId);if(new Set(files.map(file=>file.evidence_id)).size!==files.length)throw new Error('Evidence changed while loading the overview. Reload to refresh it.');
      const framework=assessmentResponse.data;
      assertClient(framework.assessments,clientId);
      if(!Array.isArray(framework.active_definition_ids)||typeof framework.selected!=='boolean'||typeof framework.configured!=='boolean')throw new Error('Framework context is incomplete');
      const reviews=assertClient(reviewResponse.data,clientId),reviewSets=[];
      if(reviews.length>1000)throw new Error('Review coverage is unavailable for this library size. Paged files remain available.');
      let periodCount=0;
      for(const review of reviews){
        const periods=await collectEvidencePages(async page=>(await api.get(`/evidence-library/reviews/${encodeURIComponent(review.review_id)}/sets`,{params:{page},signal})).data,{signal});
        periodCount+=periods.length;if(periodCount>10000)throw new Error('Review coverage is unavailable for this library size. Paged files remain available.');
        reviewSets.push({reviewId:review.review_id,title:review.title,cadence:review.recurrence,periods});
      }
      const group=framework.configuration?.implementation_group;
      return {files,overview:evidenceOverview(files,framework,reviewSets),safeguardLabel:`CIS${[1,2,3].includes(group)?` IG${group}`:''} safeguards with evidence`,coverage:evidenceCoverage(reviewSets)};
    }
    load().then(data=>{if(!signal.aborted)setState({key,...data});}).catch(error=>{if(!signal.aborted)setState({key,error:formatError(error)});});
    return()=>controller.abort();
  },[clientId,key]);
  return {...(state.key===key?state:{loading:true}),reload:()=>setAttempt(value=>value+1)};
}

export default function AdditionalEvidence({clientId,clientName='Client',canUpload,onUpload,onOpenItem,onOpenSource,revision=0,viewState,onViewStateChange}){
  const [theme,setTheme]=useBrawndoTheme();
  const [localView,setLocalView]=useState(initialEvidenceView);
  const {area,folder,recent,q,type,year,page,archived,sort,missing}=viewState||localView;
  const setView=onViewStateChange||setLocalView;
  const coverageRef=useRef(null);
  const state=JSON.stringify({include_archived:archived,filters:{...(area?{program_areas:[area]}:{}),...(folder?{folder_paths:[folder.path]}:{}),...(recent?{created_at:['last90']}:{}),...(type?{evidence_type:[type]}:{}),...(year?{years:[year]}:{})},sort});
  const result=useEvidenceCatalog({client_id:clientId,q,state,page,page_size:25},revision),summary=useEvidenceOverview(clientId,revision);
  const data=Array.isArray(result.data?.items)&&result.data.items.every(row=>row?.client_id===clientId)?result.data:null;
  const sourceMismatch=result.data&&!data;
  const folders=(data?.folder_counts||[]).filter(f=>f.area===area);
  const coverageRows=summary.coverage?.rows.filter(row=>!missing||row.missing)||[];
  const facets=data?.facets||{};
  const counts=useMemo(()=>Object.fromEntries(PROGRAM_AREAS.map(a=>[a,(summary.files||[]).filter(file=>file.program_areas?.includes(a)).length])),[summary.files]);
  function change(key,value){setView(current=>({...current,[key]:value,page:1}));}
  function browse(nextArea,nextFolder=null){setView(current=>({...current,area:nextArea,folder:nextFolder,recent:false,page:1}));}
  function toggleRecent(){setView(current=>({...current,area:'',folder:null,recent:!current.recent,page:1}));}
  function showCoverage(){coverageRef.current?.scrollIntoView?.({behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});}
  function sortBy(key){setView(current=>({...current,sort:{key,dir:current.sort.key===key&&current.sort.dir==='asc'?'desc':'asc'},page:1}));}
  function setPage(value){setView(current=>({...current,page:value}));}
  const overview=summary.overview;
  const figures=[
    {key:'files',label:'Files',value:overview?.files,selected:!area&&!folder&&!recent,onClick:()=>browse('')},
    {key:'recent',label:'Added in the last 90 days',value:overview?.recent,selected:recent,onClick:toggleRecent},
    {key:'cis',label:summary.safeguardLabel||'CIS safeguards with evidence',value:overview?.safeguards,detail:overview?`of ${overview.safeguardTotal}`:null,selected:area==='Frameworks'&&!recent,onClick:()=>browse(area==='Frameworks'?'':'Frameworks')},
    {key:'coverage',label:'Review periods with evidence',value:overview?.periods,detail:overview?`of ${overview.periodTotal}`:null,selected:false,onClick:showCoverage},
  ];
  return <div className="brawndo-additional bae-page">
    <header className="bae-page-head"><div><h1>{clientName} Evidence Library</h1><p>Evidence repository</p></div><div className="bae-head-actions"><button type="button" className="bae-btn bae-ghost" aria-label={`Switch to ${theme==='dark'?'light':'dark'} theme`} onClick={()=>setTheme(theme==='dark'?'light':'dark')}><Sun size={15} aria-hidden="true"/>{theme==='dark'?'Light':'Dark'}</button>{canUpload&&<button type="button" className="bae-btn bae-primary" data-testid="add-evidence" onClick={()=>onUpload(area)}><Plus size={15} aria-hidden="true"/>Add evidence</button>}</div></header>
    <section className="bae-card" aria-label="Evidence overview"><div className="bae-overview">
      <div className="bae-metrics" aria-label="Evidence summary">{figures.map(figure=><button type="button" className="bae-metric" key={figure.key} data-testid={`evidence-figure-${figure.key}`} aria-pressed={figure.selected} aria-controls={figure.key==='coverage'?'bae-review-coverage':undefined} onClick={figure.onClick}><span>{figure.label}</span><strong>{figure.value??'—'}{figure.detail&&<em>{figure.detail}</em>}</strong></button>)}</div>
      {summary.loading&&<p role="status" className="bae-note">Loading the authorized evidence overview…</p>}{summary.error&&<p role="alert" className="bae-note">Overview unavailable: {summary.error} <button type="button" className="bae-retry" onClick={summary.reload}>Retry overview</button></p>}
      <div className="bae-section-head"><h2>Browse</h2><span className="bae-note">Files appear from existing relationships. A file can sit in more than one folder.</span></div>
      <div className="bae-folders" role="group" aria-label="Evidence areas">{PROGRAM_AREAS.map(a=><button key={a} type="button" aria-pressed={area===a} className={`bae-folder${overview&&counts[a]===0?' bae-zero':''}`} onClick={()=>browse(area===a?'':a)}><Folder size={18} aria-hidden="true"/><b>{areaName(a)}</b><small>files</small><span className="bae-n">{overview?counts[a]:'—'}</span></button>)}</div>
      {area&&<nav aria-label="Evidence location" className="bae-breadcrumb"><button type="button" onClick={()=>browse('')}>Evidence Library</button><span>›</span><button type="button" onClick={()=>browse(area)} aria-current={!folder?'page':undefined}>{areaName(area)}</button>{folder&&<><span>›</span><span aria-current="page">{folder.label}</span></>}</nav>}
      {area&&folders.length>0&&<div className="bae-subfolders" aria-label={`${areaName(area)} folders`}>{folders.map(f=><button type="button" key={f.path} aria-pressed={folder?.path===f.path} onClick={()=>browse(area,folder?.path===f.path?null:f)}>{f.label}<span>{f.count}</span></button>)}</div>}
    </div></section>
    <section className="bae-card" aria-label="Evidence files">
      <div className="bae-filters"><label className="bae-search"><Search size={15} aria-hidden="true"/><span className="sr-only">Search Evidence</span><input type="search" placeholder="Search files, safeguards, reviews…" value={q} onChange={e=>change('q',e.target.value)} data-testid="evidence-search"/></label>
        <div className="bae-filter-right"><label>Type <select value={type} onChange={e=>change('type',e.target.value)} aria-label="Evidence type"><option value="">All</option>{(facets.evidence_type||[]).map(value=><option key={value}>{value}</option>)}</select></label><label>Year <select value={year} onChange={e=>change('year',e.target.value)} aria-label="Evidence year"><option value="">All</option>{(facets.years||[]).map(value=><option key={value}>{value}</option>)}</select></label></div>
      </div>
      <div className="bae-table" role="table" aria-label="Evidence files"><div className="bae-thead" role="row">{[['File','filename'],['Type'],['Linked to'],['Uploaded by','uploaded_by_email'],['Date','created_at'],['Download']].map(([label,key])=><div role="columnheader" key={label} {...(key&&sort.key===key?{'aria-sort':sort.dir==='asc'?'ascending':'descending'}:{})}>{key?<button type="button" onClick={()=>sortBy(key)}>{label}<ArrowDown size={10} aria-hidden="true"/></button>:label==='Download'?<span className="sr-only">{label}</span>:label}</div>)}</div>
        {result.loading&&<p role="status" className="bae-empty">Loading evidence…</p>}{(result.error||sourceMismatch)&&<p role="alert" className="bae-empty">Evidence could not be loaded: {sourceMismatch?'Client data mismatch':result.error} <button type="button" onClick={result.reload}>Retry</button></p>}
        {data&&!data.items.length&&<p className="bae-empty">{q||area||recent||type||year?'No evidence matches these filters.':'No evidence yet. Files uploaded from source records appear here automatically.'}</p>}
        {data?.items.map((row,index)=><div role="row" className="bae-row" key={row.evidence_id} data-testid={`evidence-row-${index}`} onClick={()=>onOpenItem(row.evidence_id)}>
          <div role="cell" className="bae-file"><FileIcon size={16} aria-hidden="true"/><div><button type="button" className="bae-name" onClick={e=>{e.stopPropagation();onOpenItem(row.evidence_id);}}>{row.display_name||row.filename}</button><div className="bae-meta">{[row.version?`Version ${row.version}`:null,evidenceFileSize(row),row.archived_at?'Archived':null].filter(Boolean).join(' · ')}</div></div></div>
          <div role="cell" className="bae-type">{row.evidence_type||'Other'}</div><div role="cell" className="bae-links" onClick={e=>e.stopPropagation()}><EvidenceSource source={row.context?.source||row.references?.find(ref=>ref.available)} onOpen={onOpenSource}/>{row.context?.source?.kind==='tasks'&&row.context.finding&&<small>Finding: {row.context.finding.title}</small>}{row.references?.length>1&&<small>+{row.references.length-1} linked context{row.references.length>2?'s':''}</small>}</div>
          <div role="cell" className="bae-uploader">{uploaderLabel(row)}</div><div role="cell" className="bae-date">{displayDay(row.created_at)||'Not recorded'}</div><div role="cell" className="bae-download"><button type="button" aria-label={`Download ${row.filename}`} title={`Download ${row.filename}`} data-testid={`evidence-download-${index}`} onClick={e=>{e.stopPropagation();downloadEvidence(row).catch(error=>toast.error(formatError(error)));}}><Download size={16} aria-hidden="true"/></button></div>
        </div>)}
      </div>
      <div className="bae-summary"><label><input type="checkbox" checked={archived} onChange={e=>change('archived',e.target.checked)}/>Include archived evidence</label>{data&&<EvidencePagination data={data} page={page} setPage={setPage}/>}</div>
    </section>
    <section className="bae-card bae-coverage" id="bae-review-coverage" ref={coverageRef} aria-labelledby="bae-coverage-heading"><div className="bae-overview"><div className="bae-section-head"><div><h2 id="bae-coverage-heading">Review evidence, last 12 months</h2><p>Each mark is a retained review period that was closed.</p></div><div className="bae-segments" role="group" aria-label="Show reviews">{[[false,'All'],[true,'Missing evidence']].map(([value,label])=><button key={label} type="button" aria-pressed={missing===value} onClick={()=>setView(current=>({...current,missing:value}))}>{label}<span>{summary.coverage?.rows.filter(row=>!value||row.missing).length??'—'}</span></button>)}</div></div>
      {summary.loading&&<p role="status" className="bae-note">Loading retained Review periods…</p>}{summary.error&&<p className="bae-note">Review coverage is unavailable.</p>}
      {summary.coverage&&<div className="bae-cov-grid"><div className="bae-cov-axis">{summary.coverage.months.map((month,index)=>{
        const showYear=index===0||month.key.endsWith('-01');
        return <span key={month.key} className={showYear?'bae-year':undefined} title={`${month.label} ${month.year}`}>{showYear?`${month.label} ’${String(month.year).slice(-2)}`:month.label}</span>;
      })}</div>{coverageRows.map(review=><Fragment key={review.reviewId}><div className="bae-cov-name"><span title={review.title}>{review.title}</span>{review.cadence&&<small>{review.cadence}</small>}</div><div className={`bae-cov-count${review.missing?' bae-gap':''}`}>{review.withEvidence} of {review.periods.length}</div><div className="bae-cov-cells">{summary.coverage.months.map(month=><span key={month.key}>{review.periods.filter(period=>period.due_date?.slice(0,7)===month.key).map(period=><button key={period.occurrence_id} type="button" className={`bae-dot ${period.evidence_count>0?'bae-ok':'bae-no'}`} aria-label={`${review.title}: ${period.period||displayDay(period.due_date)}, ${period.evidence_count} evidence files`} title={`${period.period||displayDay(period.due_date)} · ${period.evidence_count} evidence files`} onClick={()=>onOpenSource({kind:'reviews',id:review.reviewId,occurrence_id:period.occurrence_id,available:true})}/>)}</span>)}</div></Fragment>)}</div>}
      {summary.coverage&&!coverageRows.length&&<p className="bae-note">{missing?'No retained completed periods are proved to be missing evidence.':'No retained Review periods are available.'}</p>}
      <div className="bae-cov-legend"><span><i className="bae-dot bae-ok"/>Closed with evidence</span><span><i className="bae-dot bae-no"/>Closed without evidence</span></div>
    </div></section>
  </div>;
}
