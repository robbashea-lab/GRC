import FrameworkCategoryNavigator,{SoaTable} from '@/components/FrameworkCategoryNavigator';
import IsoAuditWorkspace from '@/components/IsoAuditWorkspace';
import IsoGovernanceReviews from '@/components/IsoGovernanceReviews';
import {useEffect,useMemo,useState} from 'react';
import { isInternal } from '@/lib/permissions';
import {Link,useLocation,useNavigate,useSearchParams} from 'react-router-dom';
import {useAuth} from '@/context/AuthContext';
import api,{formatError} from '@/lib/api';
import {frameworkCatalog} from '@/lib/frameworks';
import {SearchField} from '@/components/Register';
import RegisterLoadError from '@/components/RegisterLoadError';
import {Button} from '@/components/ui/button';
import FrameworkDrawer from '@/components/FrameworkDrawer';
import {SocProgramSettings} from '@/components/SocReadiness';
import {socConfiguration} from '@/lib/socReadiness';
import {operatorStatuses,operatorVocabulary,assessmentProgress} from '@/lib/frameworkOperator';
import CisWorkspaceSummary from '@/components/CisWorkspaceSummary';
import CisResultTable from '@/components/CisResultTable';
import ProgramContext from '@/components/ProgramContext';
import OrganizationalControls from '@/components/OrganizationalControls';
import {CisStatusBar,CisStatusPill,statusCounts} from '@/components/CisStatus';
import {cisSummary,freshness,lacksEvidence} from '@/lib/cisVerification';
import '@/components/BrawndoCisWorkspace.css';
import {groupRequirements,nextAssessment,matchesAssessment,sectionSummary,needsAttention,hierarchyPath,visibleSections} from '@/lib/frameworkWorkspace';

const FILTERS={all:'All',attention:'Needs Attention',in_progress:'In Progress',not_assessed:'Not Assessed',assessed:'Assessed'};
// Derived view names in the framework's own conclusion vocabulary.
const viewLabels=v=>({attention:'Needs attention',gaps:`${v.statuses.in_progress} or ${v.statuses.needs_attention.toLowerCase()}`,addressed:v.statuses.addressed,in_progress:v.statuses.in_progress,needs_attention:v.statuses.needs_attention,not_assessed:'Not yet assessed',not_applicable:'Not applicable',stale:'Validation older than 12 months',unevidenced:`${v.statuses.addressed} without evidence`,unremediated:'Gaps without a Finding',overdue_actions:'Overdue remediation',assessed:'Assessed'});
const ISO_VIEWS={
  isms_clause:{label:'ISMS Requirements',matches:r=>r.specification==='isms_clause'},
  annex_control:{label:'Statement of Applicability',matches:r=>r.specification==='annex_control'},
  audit:{label:'Internal Audit Program',matches:()=>false},
};
function readPreference(key){try{return JSON.parse(sessionStorage.getItem(key))||{};}catch{return {};}}
function SafeguardSignals({row}){
  const fresh=freshness(row),w=row.work||{};
  const items=[fresh.state==='stale'&&['moderate',fresh.label],lacksEvidence(row)&&['moderate','No evidence'],
    w.overdue_actions>0&&['critical',`${w.overdue_actions} overdue action${w.overdue_actions===1?'':'s'}`],
    w.overdue_reviews>0&&['critical',`${w.overdue_reviews} overdue review${w.overdue_reviews===1?'':'s'}`],
    w.open_findings>0&&['neutral',`${w.open_findings} open finding${w.open_findings===1?'':'s'}`]].filter(Boolean);
  return items.map(([tone,label])=><span key={label} className={`cis-flag cis-tone-${tone}`}>{label}</span>);
}
function CisSection({node,summary,next,open,id,toggle,openRecord,framework}){
  const counts=statusCounts(node.rows),v=operatorVocabulary(framework),parent=node.children.length>0;
  return <section className={`cis-section ${open?'is-open':''}`} aria-label={node.label} style={node.depth?{marginLeft:`${node.depth*1.25}rem`}:undefined}>
    <div className="cis-section-head">
      <button type="button" className="cis-section-toggle" aria-expanded={open} aria-controls={id} onClick={()=>toggle(node.key)}>
        <span className="cis-chevron" aria-hidden="true"/>
        <span className="min-w-0"><span className="cis-section-title">{node.label}</span>
          <span className="cis-section-meta">{counts.addressed} of {summary.total} {v.statuses.addressed.toLowerCase()}{counts.not_applicable?` · ${counts.not_applicable} N/A`:''}{summary.total-counts.addressed-counts.not_applicable?` · ${summary.total-counts.addressed-counts.not_applicable} remaining`:''}{summary.findings?` · ${summary.findings} open finding${summary.findings===1?'':'s'}`:''}</span></span>
      </button>
      <CisStatusBar counts={counts} className="cis-section-bar"/>
      <span className="cis-section-action">{next&&<Button size="sm" variant="ghost" aria-label={`Continue ${node.label}`} onClick={()=>openRecord(next)}>Continue</Button>}</span>
    </div>
    {open&&!parent&&<ul id={id} className="cis-safeguards">{node.rows.map(row=><li key={row.framework_assessment_id} data-testid={'requirement-'+row.definition_id}>
      <button type="button" className="cis-safeguard" onClick={()=>openRecord(row)}>
        <span className="cis-safeguard-id">{row.definition_id}</span>
        <span className="cis-safeguard-title">{row.title}</span>
        <span className="cis-safeguard-signals"><SafeguardSignals row={row}/></span>
        <CisStatusPill status={row.status} framework={framework}/>
      </button>
    </li>)}</ul>}
  </section>;
}
function Sections({nodes,expanded,toggle,openRecord,statuses,prototype,framework}){
  return <div className={prototype?'cis-sections':'space-y-3'}>{visibleSections(nodes,expanded).map(node=>{
    const summary=sectionSummary(node.rows),next=nextAssessment(node.rows),open=expanded.includes(node.key),id='framework-section-'+node.key.replaceAll('/','-');
    if(prototype)return <CisSection key={node.key} {...{node,summary,next,open,id,toggle,openRecord,framework}}/>;
    return <section key={node.key} className={`rounded-lg border border-line bg-surface-card ${node.depth?'ml-3 sm:ml-6':''}`} aria-label={node.label}>
      <div className="p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0"><h3 className="font-semibold text-sm">{node.label}</h3><p className="text-xs text-ink-secondary mt-1">{prototype?`${summary.total} safeguard${summary.total===1?'':'s'} · ${summary.assessed} assessed${summary.attention?` · ${summary.attention} need attention`:''}${summary.reviews?` · ${summary.reviews} linked review${summary.reviews===1?'':'s'}`:''}${summary.findings?` · ${summary.findings} open finding${summary.findings===1?'':'s'}`:''}`:<>{summary.total} requirements · {summary.assessed} assessed · {summary.attention} need attention · {summary.reviews} linked Reviews · {summary.findings} open Findings</>}</p></div>
        <div className="flex gap-1">{next&&<Button size="sm" variant="ghost" aria-label={`Continue ${node.label}`} onClick={()=>openRecord(next)}>Continue Assessment</Button>}<Button size="sm" variant="outline" aria-expanded={open} aria-controls={id} onClick={()=>toggle(node.key)}>{open?'Collapse':'Expand'}</Button></div>
      </div>
      {open&&<div id={id} className="border-t border-line p-3">{node.children.length?<p className="text-xs text-ink-secondary">{node.children.length} sections below</p>:<ul className="divide-y divide-line">{node.rows.map(row=><li key={row.framework_assessment_id} data-testid={'requirement-'+row.definition_id} className="py-3 flex flex-wrap justify-between gap-2">
        <button className="text-left text-link font-medium text-sm min-w-0 flex-1" onClick={()=>openRecord(row)}>{row.definition_id} · {row.title}</button>
        <div className="text-xs text-ink-secondary text-right"><p className={row.status==='needs_attention'?'text-semantic-critical':row.status==='in_progress'?'text-semantic-warning':''}>{statuses[row.status]||'Not Assessed'}</p>{row.csf_profile?.target_selected&&<p>Target priority: {row.csf_profile.priority||'Not prioritized'}</p>}{row.work?.overdue_reviews>0&&<p className="text-semantic-critical">{row.work.overdue_reviews} overdue Reviews</p>}{prototype&&row.work?.overdue_actions>0&&<p className="text-semantic-critical">{row.work.overdue_actions} overdue Action Items</p>}{row.work?.open_findings>0&&<p>{row.work.open_findings} open Findings</p>}</div>
      </li>)}</ul>}</div>}
    </section>;
  })}</div>;
}
export default function FrameworkWorkspace({frameworkKey,clientId}){
  const [params,setParams]=useSearchParams(),{user}=useAuth(),location=useLocation(),navigate=useNavigate();
  // The reference workspace (summary, derived views, result table) serves every assessed framework,
  // in that framework's own vocabulary. CMMC has no assessment tracking yet.
  const prototype=frameworkKey!=='cmmc',categoryFirst=['cis-ig1','iso-27001','soc-2'].includes(frameworkKey);
  const vocab=operatorVocabulary(frameworkKey),VIEW_LABELS=viewLabels(vocab);
  const preferenceKey=`framework-workspace:${user?.user_id}:${clientId}:${frameworkKey}`;
  const [preference,setPreference]=useState(()=>readPreference(preferenceKey));
  const [expanded,setExpanded]=useState(()=>readPreference(preferenceKey).section?[readPreference(preferenceKey).section]:[]);
  const [data,setData]=useState(null),[error,setError]=useState(''),[revision,setRevision]=useState(0),[search,setSearch]=useState(''),[filter,setFilter]=useState('all');
  const [view,setView]=useState('all'),[showRetained,setShowRetained]=useState(false);
  const [controlsOpen,setControlsOpen]=useState(false);
  // A dashboard deep link (?view=) opens the reference workspace on that derived view.
  const initialView=prototype?params.get('view'):null;
  useEffect(()=>{const p=readPreference(preferenceKey);setPreference(p);setExpanded(p.section?[p.section]:[]);setData(null);setSearch('');setFilter(initialView&&VIEW_LABELS[initialView]?initialView:'all');setView('all');setShowRetained(false);},[preferenceKey]);// eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{const c=new AbortController();setError('');if(!clientId)return;api.get('/frameworks/'+frameworkKey,{params:{client_id:clientId},signal:c.signal}).then(r=>{if(!c.signal.aborted)setData(r.data);}).catch(e=>{if(!c.signal.aborted)setError(formatError(e));});return()=>c.abort();},[frameworkKey,clientId,revision]);
  const remember=value=>{const p={...preference,...value};setPreference(p);try{sessionStorage.setItem(preferenceKey,JSON.stringify(p));}catch{/* UI preference only; assessment persistence is server-owned. */}};
  const catalog=frameworkCatalog(frameworkKey),statuses=operatorStatuses(frameworkKey);
  const rows=useMemo(()=>{
    const byId=new Map((data?.assessments||[]).filter(a=>a.client_id===clientId).map(a=>[a.definition_id,a]));
    return (data?.definitions||[]).filter(d=>byId.has(d.id)).map(d=>({...d,...byId.get(d.id),work:data.work?.[byId.get(d.id).framework_assessment_id]}));
  },[data,clientId]);
  const isoView=frameworkKey==='iso-27001'?(rows.find(r=>r.framework_assessment_id===params.get('assessment'))?.specification||
    (ISO_VIEWS[params.get('iso_view')]?params.get('iso_view'):'isms_clause')):'all';
  const scoped=rows.filter(r=>{
    if(frameworkKey==='soc-2'&&!showRetained&&!data?.active_definition_ids?.includes(r.definition_id))return false;
    if(frameworkKey==='nist-csf-2'&&view!=='all')return r.csf_profile?.target_selected&&(view==='target'||r.csf_profile.gap_state==='gap');
    if(frameworkKey==='iso-27001')return ISO_VIEWS[isoView].matches(r);
    return true;
  });
  const visible=scoped.filter(r=>matchesAssessment(r,filter,search)),nodes=groupRequirements(frameworkKey,visible);
  const linkedViewKey=prototype&&data&&filter!=='all'&&filter===initialView?`${clientId}:${filter}`:null;
  useEffect(()=>{if(linkedViewKey)setExpanded(groupRequirements(frameworkKey,visible).map(n=>n.key));},[linkedViewKey]);// eslint-disable-line react-hooks/exhaustive-deps
  const selected=rows.find(r=>r.framework_assessment_id===params.get('assessment'))||null;
  // A requirement opened here is one history entry: Previous/Next replace it and closing steps back to the view it
  // was opened from. A deep-linked requirement has no such entry, so closing replaces the URL instead.
  const openRecord=row=>{remember({lastId:row.framework_assessment_id,section:hierarchyPath(frameworkKey,row)[0].id});const next=new URLSearchParams(params);next.set('assessment',row.framework_assessment_id);const within=params.has('assessment');setParams(next,{replace:within,state:{fromWorkspace:within?!!location.state?.fromWorkspace:true}});};
  const closeRecord=()=>{if(location.state?.fromWorkspace)navigate(-1);else{const next=new URLSearchParams(params);next.delete('assessment');setParams(next,{replace:true});}setRevision(n=>n+1);};
  const toggle=key=>{setExpanded(old=>old.includes(key)?old.filter(k=>k!==key):[...old,key]);remember({section:key.split('/')[0]});};
  const allKeys=ns=>ns.flatMap(n=>[n.key,...allKeys(n.children)]);
  const dropLinkedView=()=>{if(params.get('view')){const n=new URLSearchParams(params);n.delete('view');setParams(n,{replace:true});}};
  const chooseFilter=key=>{dropLinkedView();setFilter(key);if(prototype)setExpanded(allKeys(groupRequirements(frameworkKey,scoped.filter(r=>matchesAssessment(r,key,search)))));};
  const changeSearch=value=>{setSearch(value);if(prototype&&value.trim())setExpanded(allKeys(groupRequirements(frameworkKey,scoped.filter(r=>matchesAssessment(r,filter,value)))));};
  if(error)return <RegisterLoadError error={error} onRetry={prototype?()=>setRevision(n=>n+1):undefined} name="workspace"/>;
  if(!data)return <p role="status" className="text-sm text-ink-secondary">Loading program workspace…</p>;
  if(!data.configured)return <section className="border border-line bg-surface-card rounded p-6 text-sm"><p>{data.selected?'Program selected for this client.':'Program not currently selected.'}</p><p className="text-ink-secondary mt-2">Select Applies in Client Profile to initialize this program after onboarding. Existing records are not reset.</p><Link className="text-link underline" to="/client-profile?tab=program">Configure in Client Profile</Link></section>;
  const progress=assessmentProgress(scoped),resume=nextAssessment(scoped,preference.lastId),index=scoped.findIndex(r=>r.framework_assessment_id===selected?.framework_assessment_id);
  const attention=scoped.filter(needsAttention).length;
  const lastOpened=prototype&&scoped.find(r=>r.framework_assessment_id===preference.lastId);
  return <div className="space-y-4" data-testid={frameworkKey==='cis-ig1'?'cis-workspace':'framework-workspace'}>
    {!data.selected&&<p className="text-sm text-ink-secondary">Historical program · Assessments and linked work are retained.</p>}
    {prototype&&!(frameworkKey==='iso-27001'&&isoView==='audit')&&<CisWorkspaceSummary framework={frameworkKey} scopeLabel={frameworkKey==='iso-27001'?ISO_VIEWS[isoView]?.label:undefined} summary={cisSummary(scoped)} filter={filter} onFilter={chooseFilter} resume={resume} onContinue={()=>openRecord(resume)}><ProgramContext frameworkKey={frameworkKey} rows={frameworkKey==='iso-27001'?rows:scoped} configuration={data.configuration} controls={data.organizational_controls}/></CisWorkspaceSummary>}
    {frameworkKey==='iso-27001'&&<><nav aria-label="ISO workspace sections" className="flex flex-wrap gap-2">{Object.entries(ISO_VIEWS).map(([key,v])=><Button key={key} variant={isoView===key?'default':'outline'} aria-pressed={isoView===key} onClick={()=>{const n=new URLSearchParams(params);n.set('iso_view',key);n.delete('assessment');n.delete('package');n.delete('audit_occurrence');setParams(n);setSearch('');setFilter('all');}}>{v.label}</Button>)}</nav>{isoView==='audit'?<IsoAuditWorkspace clientId={clientId}/>:<IsoGovernanceReviews clientId={clientId} soa={isoView==='annex_control'}/>}</>}
    {!(frameworkKey==='iso-27001'&&isoView==='audit')&&<>
    {lastOpened&&lastOpened!==resume&&<button className="text-sm text-link underline text-left" onClick={()=>openRecord(lastOpened)}>Return to last opened: {lastOpened.definition_id} · {lastOpened.title}</button>}
    {!prototype&&<><section aria-label="Assessment progress" className="space-y-2"><h2 className="font-semibold">Assessment Progress</h2><p className="text-sm">{progress.assessed} / {progress.applicable} applicable {(catalog?.labels?.items||'requirements').toLowerCase()} assessed · {scoped.length-progress.assessed-progress.excluded} not assessed · {progress.excluded} N/A</p><p className="text-xs text-ink-secondary">Assessment coverage includes partial and unresolved results. It is not certification or a compliance percentage.</p></section>
    <section className="border border-line rounded-lg p-4 bg-surface-card flex flex-wrap justify-between items-center gap-3" aria-label="Continue where you left off"><div><h2 className="text-sm font-semibold">Continue where you left off</h2><p className="text-sm text-ink-secondary mt-1">{resume?`${resume.definition_id} · ${resume.title}`:'No pending assessments or linked work requiring attention.'}</p></div>{resume&&<Button onClick={()=>openRecord(resume)}>Continue Assessment</Button>}</section>
    <div className="flex flex-wrap items-center gap-3 text-sm"><button className="text-link" onClick={()=>chooseFilter('attention')}>Needs Attention · {attention} items</button><span className="text-xs text-ink-secondary">Assessment gaps and linked operational work are separate conditions.</span></div></>}
    {frameworkKey==='soc-2'&&<><SocProgramSettings clientId={clientId} configuration={data.configuration||socConfiguration()} writable={data.selected&&isInternal(user)} onSaved={()=>setRevision(n=>n+1)}/><label className="text-xs flex gap-2"><input type="checkbox" checked={showRetained} onChange={e=>setShowRetained(e.target.checked)}/>Include retained out-of-scope criteria</label></>}
    {frameworkKey==='nist-csf-2'&&<label className="text-sm">CSF profile view<select className="border border-line rounded p-2 ml-2 bg-surface-card" aria-label="CSF profile view" value={view} onChange={e=>setView(e.target.value)}><option value="all">Current Profile</option>{[['target','Target Profile'],['gaps','Recorded Gaps']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>}
    {['cis-ig1','iso-27001','soc-2'].includes(frameworkKey)&&<details className="border border-line rounded p-3" onToggle={e=>setControlsOpen(e.currentTarget.open)}><summary className="cursor-pointer font-medium text-sm">Client organizational Controls</summary>{controlsOpen&&<OrganizationalControls clientId={clientId} onSaved={()=>setRevision(n=>n+1)}/>}</details>}
    {prototype?<div className="cis-toolbar">
      <SearchField value={search} onChange={changeSearch} label={`Search ${vocab.items}`} placeholder="Search by number or title…"/>
      {(search||filter!=='all')&&<p role="status" className="text-sm text-ink-secondary">{filter!=='all'&&<span className="cis-active-view">{VIEW_LABELS[filter]}</span>}Showing {visible.length} of {scoped.length} {vocab.items}</p>}
      {(search||filter!=='all')&&<Button size="sm" variant="ghost" onClick={()=>{dropLinkedView();setSearch('');setFilter('all');}}>Clear search and filters</Button>}
      {!categoryFirst&&!(search.trim()||filter!=='all')&&<div className="ml-auto flex gap-1"><Button variant="ghost" size="sm" onClick={()=>setExpanded(allKeys(nodes))}>Expand all</Button><Button variant="ghost" size="sm" onClick={()=>setExpanded([])}>Collapse all</Button></div>}
    </div>:<>
    <SearchField value={search} onChange={changeSearch} label="Search requirements" placeholder="Search requirements…"/>
    <div className="flex flex-wrap gap-1 items-center">{Object.entries(FILTERS).map(([key,label])=><Button key={key} size="sm" variant={filter===key?'default':'ghost'} aria-pressed={filter===key} onClick={()=>chooseFilter(key)}>{label}</Button>)}<div className="ml-auto flex gap-1"><Button variant="ghost" size="sm" onClick={()=>setExpanded(allKeys(nodes))}>Expand all</Button><Button variant="ghost" size="sm" onClick={()=>setExpanded([])}>Collapse all</Button></div></div></>}
    {!visible.length&&<p role="status" className="text-sm">{prototype?`No ${vocab.items} match this view.`:'No requirements match these filters.'}</p>}
    {params.get('assessment')&&!selected&&<p role="status">This assessment is not available in the current client workspace.</p>}
    {prototype&&(filter!=='all'||search.trim())?(frameworkKey==='iso-27001'&&isoView==='annex_control'?<SoaTable rows={visible} onOpen={openRecord}/>:<CisResultTable framework={frameworkKey} rows={visible} onOpen={openRecord} label={filter!=='all'?VIEW_LABELS[filter]:'Search results'}/>):categoryFirst?<FrameworkCategoryNavigator key={clientId+frameworkKey+isoView} framework={frameworkKey} rows={visible} onOpen={openRecord} soa={frameworkKey==='iso-27001'&&isoView==='annex_control'} preference={preference['category:'+isoView]} onSelect={path=>remember({['category:'+isoView]:path})}/>:<Sections {...{nodes,expanded,toggle,openRecord,statuses,prototype,framework:frameworkKey}}/>}
    </>}
    {selected&&<FrameworkDrawer key={clientId+':'+selected.framework_assessment_id} open record={selected} clientId={clientId} onSaved={()=>setRevision(n=>n+1)} onOpenChange={v=>{if(!v)closeRecord();}} onPrevious={index>0?()=>openRecord(scoped[index-1]):null} onNext={index>=0&&index<scoped.length-1?()=>openRecord(scoped[index+1]):null} position={index>=0?`${index+1} of ${scoped.length} in framework order`:'Retained assessment'}/>}
  </div>;
}
