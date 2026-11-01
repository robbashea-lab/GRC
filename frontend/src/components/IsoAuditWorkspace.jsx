import {useCallback,useEffect,useId,useLayoutEffect,useRef,useState} from 'react';
import {AlertCircle,CheckCircle2,Clock,Minus,Search} from 'lucide-react';
import {isoGuideEntry} from './IsoRequirementGuide';
import IsoGuidedAssessor from './IsoGuidedAssessor';
import IsoAuditGuide from './IsoAuditGuide';
import AssessmentLayout,{AssessmentChecklist,AssessmentRequirement} from './AssessmentLayout';
import isoCriteria from '@catalogs/operatorGuidance/isoAssessmentCriteria.json';
import RemediationTickets from './RemediationTickets';
import TicketAssignment from './TicketAssignment';
import {auditProgrammeMetrics,auditProgrammeYears} from '@/lib/isoProgramMetrics';
import {isoAuditTiming} from '@/lib/isoGuidedProgram';
import {calendarDay} from '@/lib/managementDates';
import {ProgramVisualSummary,ProgramVisualColumns,ProgramVisualGroup} from './ProgramVisualPrimitives';
import './IsoAssessment.css';
import './IsoAuditProgram.css';
import './BrawndoCisSafeguard.css';
import {useRescueFocus} from '@/lib/focusRescue';
import {useSearchParams} from 'react-router-dom';
import api,{formatError} from '@/lib/api';
import {useAuth} from '@/context/AuthContext';
import {isInternal} from '@/lib/permissions';
import {isoAuditCatalog,auditPackage,auditActivationPlan,auditQuarter,auditProgress,auditItemComplete,blankAuditItem,AUDIT_STATUSES,AUDIT_RESULTS} from '@/lib/isoAudit';
import {frameworkDefinition} from '@/lib/frameworks';
import {sourcePresentation} from '@/lib/frameworkWorkspace';
import {occurrenceId} from '@/lib/reviewOccurrences';
import {recordUuid} from '@/lib/recordUuid';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {Textarea} from './ui/textarea';
import AssigneeSelect from './AssigneeSelect';
import StatusBadge from './StatusBadge';
import AssessmentShell,{AssessmentStep} from './AssessmentShell';
import {EvidenceCatalogPicker,EvidenceDownload} from './EvidencePanel';
import RecordDrawer from './RecordDrawer';
import {SCHEMAS} from '@/lib/schemas';
import {AlertDialog,AlertDialogContent,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction} from './ui/alert-dialog';

const SELECT='block w-full border border-line rounded p-2 bg-surface-card text-sm';
const content=value=><p className="whitespace-pre-wrap text-sm">{value}</p>;
const writableReview=(user,r)=>isInternal(user)||user?.role==='client_grc_manager'||user?.role==='client_contributor'&&[r.owner_id,r.reviewer_id].includes(user.user_id);
const AUDIT_TONES={not_started:'none',in_progress:'part',reviewed:'impl',not_applicable:'none'};
const auditPercent=(complete,total)=>total?(complete/total*100).toFixed(1):null;
const auditStates=records=>records.flatMap(record=>(auditPackage(record.iso_audit.package_key)?.items||[]).map(definition=>record.iso_audit.items[definition.key]||blankAuditItem()));
const auditStatusCounts=states=>Object.fromEntries(Object.keys(AUDIT_STATUSES).map(status=>[status,states.filter(state=>state.status===status).length]));
const auditResultsRecorded=states=>states.filter(state=>!!AUDIT_RESULTS[state.result]).length;
const AuditProgressBar=({complete,total,label})=><span className="sbar iso-audit-progress-bar" role="img" aria-label={`${label}: ${complete} of ${total} checks complete`}>{complete>0&&<i className="s-impl" style={{flex:complete}}/>}{total>complete&&<i className="s-none" style={{flex:total-complete}}/>}</span>;

function AuditStatusBar({states,label}){
  const counts=auditStatusCounts(states);
  return <span className="sbar" role="img" aria-label={`${label}: ${Object.entries(AUDIT_STATUSES).map(([status,title])=>`${title}: ${counts[status]}`).join(', ')}`}>
    {Object.entries(AUDIT_STATUSES).map(([status,title])=>counts[status]>0&&<i key={status} className={`s-${AUDIT_TONES[status]}`} style={{flex:counts[status]}} title={`${title}: ${counts[status]} of ${states.length}`}/>)}
  </span>;
}

function AuditCompletionSummary({progress,records,scope,id}){
  const states=auditStates(records),counts=auditStatusCounts(states),unknown=states.length-Object.values(counts).reduce((sum,count)=>sum+count,0);
  const dates=states.map(state=>state.updated_at).filter(value=>typeof value==='string'&&value.includes('T')&&calendarDay(value)!==null&&Number.isFinite(Date.parse(value))&&Date.parse(value)<=Date.now()).sort((a,b)=>Date.parse(b)-Date.parse(a));
  const saved=dates[0]?new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(new Date(dates[0])):null;
  return <ProgramVisualSummary id={id} label="Audit workpaper completion" footer={<>Completion counts examined workpapers with a recorded result or justified N/A. Audit conclusions, package closure and corrective-action closure remain separate.{unknown>0&&<> {unknown} saved workpaper statuses are unavailable.</>}</>}>
    <div className="now-head"><span className="now-label">Audit workpaper completion</span><strong className="now-value">{progress.total?<>{auditPercent(progress.complete,progress.total)}<span className="unit">%</span></>:'—'}</strong><p>{progress.complete} of {progress.total} planned checks complete</p><small>{saved?`Workpapers saved ${saved}`:'Workpaper save date unavailable'}</small></div>
    <div className="now-detail"><div className="bd-head"><span className="bd-title">{scope}</span><span>{progress.total?`${auditResultsRecorded(states)} results recorded`:'Not scheduled'}</span></div>
      <AuditStatusBar states={states} label="Audit workpaper status"/>
      <div className="lg iso-audit-status-legend" aria-label="Saved audit workpaper statuses">{Object.entries(AUDIT_STATUSES).map(([status,title])=><div key={status} className="lg-cell"><span className="lg-label"><i className={`key s-${AUDIT_TONES[status]}`}/>{title}</span><span className="lg-val"><b>{states.length?`${auditPercent(counts[status],states.length)}%`:'—'}</b><span>{counts[status]} of {states.length}</span></span></div>)}</div>
    </div>
  </ProgramVisualSummary>;
}

function AuditWorkpaperRow({definition,state,onOpen}){
  const Icon=state.result==='conforming'?CheckCircle2:state.result==='observation'||state.result==='nonconformity'?AlertCircle:state.status==='in_progress'?Clock:Minus;
  const completion=auditItemComplete(state)?state.status==='not_applicable'?'Justified N/A':'Examination complete':state.status==='reviewed'?'Result needed':state.status==='not_applicable'?'N/A rationale needed':'Examination pending';
  return <button type="button" data-audit-item={definition.key} className="sg iso-audit-item" onClick={onOpen} aria-label={`Open audit workpaper ${definition.reference} ${definition.title}`}>
    <span className="sg-id">{definition.reference}</span><span className="sg-t">{definition.title}<small>{definition.area}</small></span>
    <span className="st"><i className={`s-${AUDIT_TONES[state.status]||'none'}`}/>{AUDIT_STATUSES[state.status]||'Status unavailable'}</span>
    <span className="ver"><Icon size={14} aria-hidden="true"/><span>{AUDIT_RESULTS[state.result]||'Result not recorded'}<small>{completion}</small></span></span><span className="chev" aria-hidden="true">›</span>
  </button>;
}

function IssuedReport({id}) {
  const [report,setReport]=useState(null),[error,setError]=useState('');
  useEffect(()=>{const c=new AbortController();setReport(null);setError('');
    if(id)api.get('/evidence-library/items/'+id,{signal:c.signal}).then(r=>{if(!c.signal.aborted)setReport(r.data);}).catch(e=>{if(!c.signal.aborted)setError(formatError(e));});
    return()=>c.abort();
  },[id]);
  if(!id)return <p className="text-sm">No issued report linked</p>;
  if(error)return <p role="alert">{error}</p>;
  return report?<div className="brawndo-linked-row"><span>{report.display_name||report.filename}</span><EvidenceDownload row={report}/></div>:<p role="status">Loading issued report…</p>;
}

function AuditItemWorkspace({review,centralReview=review,item,position,previous,next,onClose,onSaved,users,configuration,frozen=false,closeRequest=0,onCloseCancelled}) {
  const {user}=useAuth(),initial=review.iso_audit.items[item.key]||blankAuditItem();
  const [form,setForm]=useState(initial),[saved,setSaved]=useState(initial),[error,setError]=useState(''),[busy,setBusy]=useState(false),[feedback,setFeedback]=useState('');
  const [version,setVersion]=useState(review.updated_at),[finding,setFinding]=useState(null),[nested,setNested]=useState(null),[pending,setPending]=useState(null),[related,setRelated]=useState(null),[evidence,setEvidence]=useState([]),[relatedRevision,setRelatedRevision]=useState(0);
  const oid=review.occurrence_id||occurrenceId(review),writable=!frozen&&writableReview(user,review),dirty=JSON.stringify(form)!==JSON.stringify(saved);
  const put=(k,v)=>{setFeedback('');setForm(old=>({...old,[k]:v}));};
  const leave=useCallback(fn=>{if(busy)return;if(dirty||finding)setPending(()=>fn);else fn();},[busy,dirty,finding]);
  const handledCloseRequest=useRef(closeRequest),externalClosePending=useRef(false);
  useEffect(()=>{
    if(busy||!closeRequest||handledCloseRequest.current===closeRequest)return;
    handledCloseRequest.current=closeRequest;externalClosePending.current=true;
    leave(()=>{externalClosePending.current=false;onClose();});
  },[busy,closeRequest,leave,onClose]);
  const cancelLeave=()=>{setPending(null);if(externalClosePending.current){externalClosePending.current=false;onCloseCancelled?.();}};
  useEffect(()=>{if(!dirty&&!finding)return;const warn=e=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty,finding]);
  useEffect(()=>{
    const c=new AbortController();
    api.get('/related',{params:{entity_type:'reviews',entity_id:review.review_id,occurrence_id:oid},signal:c.signal}).then(r=>setRelated(r.data)).catch(e=>{if(!c.signal.aborted)setError(formatError(e));});
    return()=>c.abort();
  },[review.review_id,oid,version,relatedRevision]);
  useEffect(()=>{
    const c=new AbortController();
    Promise.all(form.evidence_ids.map(id=>api.get('/evidence-library/items/'+id,{signal:c.signal}).then(r=>r.data))).then(rows=>{if(!c.signal.aborted)setEvidence(rows);}).catch(e=>{if(!c.signal.aborted)setError(formatError(e));});
    return()=>c.abort();
  },[form.evidence_ids]);
  async function save(){
    setBusy(true);setError('');
    try{const {data}=await api.patch('/reviews/'+review.review_id+'/iso-audit/'+item.key,{...Object.fromEntries(Object.keys(blankAuditItem()).map(k=>[k,form[k]])),occurrence_id:oid,expected_updated_at:version??null});
      setVersion(data.updated_at);setSaved(form);setFeedback('Audit workpaper saved.');onSaved(data);return true;
    }catch(e){setError(formatError(e));return false;}finally{setBusy(false);}
  }
  async function createFinding(){
    setBusy(true);setError('');
    try{
      const {data}=await api.post('/reviews/'+review.review_id+'/create-finding',{...finding,occurrence_id:oid,audit_item_key:item.key,expected_updated_at:version??null});
      // Creating the shared Finding is durable independently from the workpaper draft.
      setForm(old=>({...old,finding_ids:[...new Set([...old.finding_ids,data.finding_id])]}));
      setSaved(old=>({...old,finding_ids:[...new Set([...old.finding_ids,data.finding_id])]}));
      const refreshed=await api.get('/reviews/'+review.review_id);
      setVersion(refreshed.data.updated_at);onSaved(refreshed.data);
      setFinding(null);setRelated(old=>({...old,findings:[...(old?.findings||[]).filter(f=>f.finding_id!==data.finding_id),data]}));
      setRelatedRevision(n=>n+1);
      setFeedback('Ticket saved and linked to this audit item. Other workpaper edits remain unsaved.');
    }catch(e){setError(formatError(e));}finally{setBusy(false);}
  }
  const source=sourcePresentation(frameworkDefinition('iso-27001',item.definition_id)),criteria=isoCriteria.requirements[item.definition_id],guide=isoGuideEntry(item.definition_id);
  const linkedFindings=(related?.findings||[]).filter(f=>form.finding_ids.includes(f.finding_id));
  const disabled=!writable||busy;
  return <><AssessmentShell ariaModal testId="iso-audit-workpaper" title={'ISO audit · '+item.reference+' — '+item.title} description={auditPackage(review.iso_audit.package_key).title+' · '+item.area+' · Cycle '+review.iso_audit.cycle}
    onEscapeKeyDown={e=>{if(document.activeElement?.closest('[data-testid="iso-audit-workpaper"] [data-testid="iso-guided-assessment"] .omni-workspace-window'))e.preventDefault();}}
    status={<span className="text-sm">{AUDIT_STATUSES[saved.status]} · {AUDIT_RESULTS[saved.result]||'Result not recorded'}{frozen?' · Historical workpaper':''}</span>}
    position={position} previous={previous?()=>leave(previous):null} next={next?()=>leave(next):null} close={()=>leave(onClose)} busy={busy} returnSelector={`[data-audit-item="${item.key}"]`}
    footer={<><div className="min-w-0 flex-1">{error&&<p role="alert" className="text-sm text-semantic-critical">{error}</p>}<p role="status" className="text-sm">{feedback||'Audit progress is separate from the result.'}{dirty&&' · Unsaved workpaper changes'}</p>{finding&&<p className="text-xs">Finish or cancel the Finding draft before Save & next.</p>}</div><Button variant="ghost" disabled={busy} onClick={()=>leave(onClose)}>Close assessment</Button>{writable&&<><Button variant="outline" disabled={busy} onClick={save}>Save assessment</Button>{next&&<Button disabled={busy||!!finding} onClick={async()=>{if(await save())next();}}>Save & next</Button>}</>}</>}>
    <IsoGuidedAssessor clientId={review.client_id} configuration={configuration} programLabel="Internal Audit" programContent={({close})=><IsoAuditGuide review={review} item={item} historical={frozen} onOpen={()=>{close();setNested({kind:'reviews',record:centralReview,initialValues:frozen?{occurrence:review}:undefined});}}/>}/>
    <AssessmentLayout criteriaSummary="Omnisciente guidance for assessing this requirement. These are not additional ISO requirements." criteriaTitle="ISO assessment criteria" reference={`ISO/IEC 27001:2022 · ${item.definition_id}`} key={review.client_id+':'+review.review_id+':'+oid+':'+item.key}
      summary={`Examine ${item.reference} against the agreed audit criteria and record an independent conclusion. ${item.intent}`}
      requirement={<details className="iso-audit-source"><summary>{item.definition_id.startsWith('A.')?'Annex A control & reference':'ISMS requirement & reference'}</summary><AssessmentRequirement heading={item.definition_id.startsWith('A.')?'Annex A control & reference':'ISMS requirement & reference'} text={source.text||guide?.plain} official={!!source.text} trigger={criteria?.trigger} source={source.url} label="Official ISO source"/></details>}
      checklist={<AssessmentChecklist title={`${item.reference} checklist`} items={criteria?.coverage==='verified'?criteria.criteria:[]} value={form.assessment_checks||[]} disabled={disabled} onChange={value=>put('assessment_checks',value)}/>}
      findings={<AssessmentStep title="Findings"><p className="text-xs text-ink-secondary">Observations and Nonconformities need a shared Finding before package closure. Completing the audit does not complete remediation.</p>
      <RemediationTickets records={{findings:linkedFindings,tasks:(related?.tasks||[]).filter(t=>form.finding_ids.includes(t.finding_id)),reviews:[centralReview]}} clientId={review.client_id} users={users} onOpen={setNested} disabled={busy}/>
      {writable&&!finding&&<><Button size="sm" variant="outline" disabled={busy} onClick={()=>setFinding({title:item.reference+' — '+(AUDIT_RESULTS[form.result]||'Audit gap'),description:form.notes,remediation_title:'Address '+item.reference+' audit gap',severity:'medium',request_id:recordUuid()})}>Raise Finding</Button><label className="block mt-3">Link an existing package Finding<select aria-label="Link audit Finding" className={SELECT} value="" disabled={busy} onChange={e=>put('finding_ids',[...new Set([...form.finding_ids,e.target.value])])}><option value="">Select Finding</option>{(related?.findings||[]).filter(f=>!form.finding_ids.includes(f.finding_id)).map(f=><option key={f.finding_id} value={f.finding_id}>{f.title}</option>)}</select></label></>}
      {finding&&<fieldset disabled={busy} className="space-y-3 brawndo-inset"><p>Origin: ISO audit · {item.reference} — {item.title} · {auditPackage(review.iso_audit.package_key).title} · Cycle {review.iso_audit.cycle}</p><label>Severity<select aria-label="Finding severity" className={SELECT} value={finding.severity} onChange={e=>setFinding({...finding,severity:e.target.value})}>{['low','medium','high','critical'].map(value=><option key={value}>{value}</option>)}</select></label>{[['title','Finding title'],['description','Finding description'],['remediation_title','Corrective action']].map(([k,label])=><label className="block" key={k}>{label}{k==='description'?<Textarea aria-label={label} value={finding[k]} onChange={e=>setFinding({...finding,[k]:e.target.value})}/>:<Input aria-label={label} value={finding[k]} onChange={e=>setFinding({...finding,[k]:e.target.value})}/>}</label>)}<TicketAssignment clientId={review.client_id} users={users} {...{finding,setFinding}} defaultOwner={review.owner_id} disabled={busy}/><Button disabled={busy||!finding.title.trim()||!finding.remediation_title.trim()} onClick={createFinding}>Create Finding & Action</Button><Button variant="ghost" onClick={()=>setFinding(null)}>Cancel</Button></fieldset>}
    </AssessmentStep>}
      review={[item.verify,item.inspect,item.questions].filter(Boolean)} outcome={[item.intent]}>
    <div className="assessment-implementation">    <AssessmentStep title="Audit progress & result"><fieldset disabled={disabled} className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-4"><label>Audit progress<select aria-label="Audit progress" className={SELECT} value={form.status} onChange={e=>put('status',e.target.value)}>{Object.entries(AUDIT_STATUSES).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
        <label>Audit result<select aria-label="Audit result" className={SELECT} value={form.result} onChange={e=>put('result',e.target.value)}><option value="">Not assessed</option>{Object.entries(AUDIT_RESULTS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label></div>
      <p className="text-xs text-ink-secondary">Reviewed means the examination was performed. It counts as complete only when its result is recorded. N/A requires documented justification; Annex A applicability remains in the SoA.</p>
      {form.status==='not_applicable'&&<label className="block">N/A rationale<Textarea aria-label="Audit N/A rationale" value={form.na_rationale} maxLength={4000} onChange={e=>put('na_rationale',e.target.value)}/></label>}
      </fieldset></AssessmentStep><div><AssessmentStep title="Auditor notes"><fieldset disabled={disabled}><label className="block">Auditor notes<Textarea aria-label="Auditor notes" className="brawndo-narrative" rows={5} maxLength={20000} value={form.notes} onChange={e=>put('notes',e.target.value)}/></label>
    </fieldset></AssessmentStep>
</div></div>
    <AssessmentStep title="Evidence & validation"><p className="text-xs text-ink-secondary">Workpaper evidence selections save with this assessment. Library files are not copied or changed.</p>
      <ul>{evidence.map(e=><li key={e.evidence_id} className="brawndo-linked-row"><span>{e.display_name||e.filename} · {e.evidence_type||e.mime_type}</span><span><EvidenceDownload row={e}/>{writable&&<Button size="sm" variant="ghost" disabled={busy} onClick={()=>put('evidence_ids',form.evidence_ids.filter(id=>id!==e.evidence_id))}>Unlink</Button>}</span></li>)}</ul>
      {!form.evidence_ids.length&&<p>No evidence linked to this workpaper.</p>}
      {writable&&<EvidenceCatalogPicker clientId={review.client_id} linkedIds={form.evidence_ids} disabled={busy} onLink={id=>put('evidence_ids',[...new Set([...form.evidence_ids,id])])}/>}
    </AssessmentStep>
    <details><summary>Audit context</summary><h3>Audit context</h3><p>{auditQuarter(review.due_date)} · Due {review.due_date?.slice(0,10)}</p><p>Auditor: {users.find(u=>u.user_id===review.owner_id)?.name||'Historical / unassigned'}</p><details><summary>Scope & objectivity</summary>{content(review.scope||'Scope not recorded')}{content(review.audit_independence||'Objectivity not recorded')}</details><Button variant="outline" size="sm" onClick={()=>setNested({kind:'reviews',record:centralReview,initialValues:frozen?{occurrence:review}:undefined})}>Open central Review</Button><p className="text-xs">Audit progress and results do not update implementation assessments or close remediation.</p><details><summary>Methodology source</summary><p className="text-xs">{isoAuditCatalog.source.filename} · {auditPackage(review.iso_audit.package_key).source_sheet} · row {item.source_row}. User-provided audit guidance, not official ISO text.</p></details></details>
    </AssessmentLayout>
  </AssessmentShell><AlertDialog open={!!pending} onOpenChange={v=>{if(!v)cancelLeave();}}><AlertDialogContent><AlertDialogTitle>Leave unsaved changes?</AlertDialogTitle><AlertDialogDescription>The saved audit workpaper is unchanged. Keep editing or discard this draft.</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel>Keep editing</AlertDialogCancel><AlertDialogAction onClick={()=>{const fn=pending;setPending(null);externalClosePending.current=false;fn?.();}}>Discard changes</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    {nested&&<RecordDrawer {...nested} open clientId={review.client_id} users={users} schema={SCHEMAS[nested.kind]?.fields} onOpenChange={v=>{if(!v)setNested(null);}} onSaved={()=>{setRelatedRevision(n=>n+1);if(nested.kind==='reviews')setFeedback('Central Review changed. Close and reopen the package to load its latest cycle before editing further.');}}/>}
  </>;
}

export default function IsoAuditWorkspace({clientId,configuration,navigation,navigationOrigin,onWorkpaperChange}) {
  const {user}=useAuth(),[routerParams,routerSetParams]=useSearchParams();
  const params=navigation?.params||routerParams,setParams=navigation?.setParams||routerSetParams;
  const [data,setData]=useState(null),[users,setUsers]=useState([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0);
  const [draft,setDraft]=useState({start_date:'',first_package:isoAuditCatalog.packages[0].key,auditor_id:null,scope:'',independence:''}),[preview,setPreview]=useState(false);
  const [itemKey,setItemKey]=useState(null),[search,setSearch]=useState(''),[nested,setNested]=useState(null),packageHeading=useRef(null);
  const [expandedAreas,setExpandedAreas]=useState([]),areaPrefix=useId();
  const selectedPackage=params.get('package'),selectedOccurrence=params.get('audit_occurrence');
  useEffect(()=>{setExpandedAreas([]);},[clientId,selectedPackage,selectedOccurrence]);
  useEffect(()=>{
    const c=new AbortController();setError('');setData(null);setUsers([]);setItemKey(null);setSearch('');
    Promise.all([api.get('/iso-audit',{params:{client_id:clientId},signal:c.signal}),api.get('/clients/'+clientId+'/members',{signal:c.signal})]).then(([a,b])=>{if(!c.signal.aborted){setData(a.data);setUsers(b.data);if(a.data.program?.status==='configuring')setDraft(a.data.program.configuration);}}).catch(e=>{if(!c.signal.aborted)setError(formatError(e));});
    return()=>c.abort();
  },[clientId,revision]);
  const selectPackage=key=>{const p=new URLSearchParams(params);if(key)p.set('package',key);else p.delete('package');p.delete('audit_occurrence');setParams(p);setItemKey(null);setSearch('');};
  const current=data?.reviews.find(r=>r.iso_audit.package_key===params.get('package'));
  const historical=current?.occurrences?.find(o=>o.occurrence_id===params.get('audit_occurrence')),review=historical||current;
  useRescueFocus(packageHeading,review?.review_id);
  const pack=review&&auditPackage(review.iso_audit.package_key),items=pack?.items.filter(i=>(i.reference+' '+i.title+' '+i.area).toLowerCase().includes(search.toLowerCase()))||[];
  const item=pack?.items.find(i=>i.key===itemKey),index=items.findIndex(i=>i.key===itemKey),plan=auditActivationPlan(draft.start_date,draft.first_package);
  const areas=[];
  for(const definition of pack?.items||[]){let area=areas.find(group=>group.label===definition.area);if(!area){area={label:definition.area,items:[]};areas.push(area);}area.items.push(definition);}
  useEffect(()=>{if(item)setExpandedAreas(current=>current.includes(item.area)?current:[...current,item.area]);},[item]);
  const matchingKeys=new Set(items.map(definition=>definition.key)),filtering=!!search.trim();
  const allAreasExpanded=areas.length>0&&areas.every(area=>expandedAreas.includes(area.label));
  const section=params.get('iso_view'),assessment=params.get('assessment');
  useLayoutEffect(()=>{
    if(!item||!onWorkpaperChange)return;
    onWorkpaperChange({origin:navigationOrigin,query:{iso_view:section,package:selectedPackage,audit_occurrence:selectedOccurrence,assessment}});
    return()=>onWorkpaperChange(null);
  },[item,review?.review_id,navigationOrigin,onWorkpaperChange,section,selectedPackage,selectedOccurrence,assessment]);
  const closeWorkpaper=()=>{setItemKey(null);if(!navigation?.acceptPending())setRevision(n=>n+1);};
  const moveWorkpaper=key=>{if(navigation?.acceptPending()){setItemKey(null);return;}setItemKey(key);};
  async function run(fn){setBusy(true);setError('');try{await fn();}catch(e){setError(formatError(e));}finally{setBusy(false);}}
  const savedReview=r=>setData(old=>({...old,reviews:old.reviews.map(x=>x.review_id===r.review_id?r:x)}));
  const writable=review&&!historical&&writableReview(user,review);
  if(!data)return <div role={error?'alert':'status'}>{error||'Loading audit program…'}{error&&<Button onClick={()=>setRevision(n=>n+1)}>Retry</Button>}</div>;
  const years=auditProgrammeYears(data.reviews),now=String(new Date().getFullYear()),year=params.get('audit_year')||(years.includes(now)?now:years.at(-1)||now),progress=auditProgrammeMetrics(data.reviews,year);
  const yearOptions=[...new Set([...years,year])].sort();
  const openAudit=record=>{const p=new URLSearchParams(params);p.set('package',record.package_key);if(record.occurrence_id)p.set('audit_occurrence',record.occurrence_id);else p.delete('audit_occurrence');setParams(p);setItemKey(null);setSearch('');};
  const summaryRecords=review?[review]:progress.quarters.flatMap(quarter=>quarter.records.map(record=>{const central=data.reviews.find(candidate=>candidate.review_id===record.review_id);return record.occurrence_id?central?.occurrences?.find(occurrence=>occurrence.occurrence_id===record.occurrence_id):central;}).filter(Boolean));
  const summaryProgress=review?auditProgress(review.iso_audit):progress;
  return <section className="iso-audit-program" aria-label="Internal Audit Program">
    {!item&&<IsoGuidedAssessor clientId={clientId} configuration={configuration} programLabel="Internal Audit" programContent={({close})=><IsoAuditGuide review={review} onOpen={review?()=>{close();setNested({kind:'reviews',record:current,initialValues:historical?{occurrence:historical}:undefined});}:undefined}/>}/>}
    <p className="text-sm text-ink-secondary">Quarterly grouping organizes this program; ISO requires planned intervals and does not mandate quarters. Audit completion is independent of corrective-action closure.</p>
    <AuditCompletionSummary id={`${areaPrefix}-audit-summary`} progress={summaryProgress} records={summaryRecords} scope={review?`${pack.title} · Cycle ${review.iso_audit.cycle}`:`Planned audit work · ${year}`}/>
    <label className="f-field iso-audit-year">Audit-program year <select aria-label="Audit-program year" value={year} onChange={e=>{const p=new URLSearchParams(params);p.set('audit_year',e.target.value);setParams(p);}}>{yearOptions.map(y=><option key={y}>{y}</option>)}</select></label>
    <div className="iso-program-grid" aria-label="Quarterly audit progress">{progress.quarters.map(q=><section key={q.quarter} className="pcard iso-audit-quarter"><h3>Q{q.quarter} · {year}</h3><p>{q.total?`${q.complete} of ${q.total} planned checks complete · ${Math.round(q.complete/q.total*100)}%`:'Not scheduled'}</p><AuditProgressBar complete={q.complete} total={q.total} label={`Q${q.quarter} ${year}`}/>{q.records.map(r=><Button key={r.review_id+':'+r.occurrence_id} variant="ghost" size="sm" onClick={()=>openAudit(r)}>{auditPackage(r.package_key).title}{r.occurrence_id?' · historical occurrence':''}</Button>)}</section>)}</div>
    {error&&<p role="alert" className="text-semantic-critical">{error}</p>}
    {!data.program||data.program.status==='configuring'?<section className="border border-line rounded-lg p-4 space-y-4"><h3 className="font-medium">{data.program?'Finish interrupted activation':'Program not activated'}</h3><p className="text-sm">Choose a prospective start. No audit deadlines are backdated to onboarding. Existing internal-audit Reviews remain unchanged; inspect them before activating a new package schedule.</p>
      {isInternal(user)?<fieldset disabled={busy} className="space-y-3">
        <div className="grid sm:grid-cols-2 gap-4"><label>Start date<Input type="date" aria-label="Audit program start date" min={new Date().toISOString().slice(0,10)} value={draft.start_date} onChange={e=>{setDraft({...draft,start_date:e.target.value});setPreview(false);}}/></label><label>First audit package<select className={SELECT} aria-label="First audit package" value={draft.first_package} onChange={e=>{setDraft({...draft,first_package:e.target.value});setPreview(false);}}>{isoAuditCatalog.packages.map(p=><option key={p.key} value={p.key}>{p.title}</option>)}</select></label></div>
        <div>Assigned auditor<AssigneeSelect label="Assigned auditor" clientId={clientId} users={users} value={draft.auditor_id} onChange={id=>{setDraft({...draft,auditor_id:id});setPreview(false);}}/></div>
        <label className="block">Program scope<Textarea aria-label="Audit program scope" maxLength={4000} value={draft.scope} onChange={e=>{setDraft({...draft,scope:e.target.value});setPreview(false);}}/></label>
        <label className="block">Objectivity and independence arrangements<Textarea aria-label="Audit independence arrangements" maxLength={4000} value={draft.independence} onChange={e=>{setDraft({...draft,independence:e.target.value});setPreview(false);}}/></label>
        <p className="text-xs text-ink-secondary">Document how auditors avoid auditing their own work, including independent review of the audit program itself. Assignments and package schedules remain editable in Reviews.</p>
        <Button variant="outline" disabled={!plan.length||!draft.auditor_id||!draft.scope.trim()||!draft.independence.trim()} onClick={()=>setPreview(true)}>Preview audit cycle</Button>
        {preview&&<div className="space-y-3"><ul className="text-sm space-y-2">{plan.map(p=><li key={p.package_key}>{p.title} · {auditQuarter(p.due_date)} · due {p.due_date}</li>)}</ul><p className="text-xs">Each package repeats annually, staggered by quarter. This is an organization-defined schedule, not an ISO-prescribed frequency.</p><Button onClick={()=>run(async()=>{const r=await api.post('/iso-audit/activate',{...draft,client_id:clientId});setData(r.data);})}>Activate audit program</Button></div>}
      </fieldset>:<p>A service-provider administrator can configure this program.</p>}
    </section>:<>
      <p className="text-xs text-ink-secondary">Activated {data.program.activated_at.slice(0,10)} · program starts {data.program.configuration.start_date}. Current assignments and due dates come from Reviews.</p>
      <Button variant="ghost" size="sm" onClick={()=>selectPackage(null)}>All audit packages</Button>
      {!review?<section className="pcard iso-audit-packages" aria-label="Audit packages"><div className="card-head"><div><h2>Audit packages</h2><p>Open planned audit work; completion and audit conclusions remain separate.</p></div></div><div className="reg"><ProgramVisualColumns groupingLabel="Audit package" mixLabel="Workpaper status" primaryLabel="Complete" secondaryLabel="Results recorded"/>{data.reviews.map(r=>{const p=auditProgress(r.iso_audit),states=auditStates([r]),last=r.occurrences?.filter(o=>o.iso_audit&&o.completed_at).at(-1),timing=isoAuditTiming(r);return <ProgramVisualGroup key={r.review_id} group={{name:auditPackage(r.iso_audit.package_key).title,summary:p,rows:states,available:true}} onActivate={()=>selectPackage(r.iso_audit.package_key)}
        metadata={<>{auditQuarter(r.due_date)} · Cycle {r.iso_audit.cycle} · {timing.label} · {p.nonconformities} Nonconformities · {p.observations} Observations{last&&<> · Last completed {last.completed_at.slice(0,10)}{last.finding_count?' · Findings raised':''}</>}</>}
        statusBar={<AuditStatusBar states={states} label={auditPackage(r.iso_audit.package_key).title}/>} primaryMeasure={<><b>{p.complete} of {p.total}</b><span>{auditPercent(p.complete,p.total)}%</span></>} secondaryMeasure={<b>{auditResultsRecorded(states)} of {p.total}</b>}/>;})}</div></section>:<>
        <header className="flex flex-wrap justify-between gap-3"><div><h3 ref={packageHeading} className="font-semibold">{pack.title}</h3><p className="text-sm">Cycle {review.iso_audit.cycle} · {auditQuarter(review.due_date)} · {auditProgress(review.iso_audit).complete} / {pack.items.length} complete</p><p className="text-xs text-ink-secondary">Auditor: {users.find(u=>u.user_id===review.owner_id)?.name||'Historical / unassigned'} · Due {review.due_date?.slice(0,10)}</p></div><Button variant="outline" onClick={()=>setNested({kind:'reviews',record:current,initialValues:historical?{occurrence:historical}:undefined})}>Open central Review</Button></header>
        <p className="text-sm">{review.scope}</p>
        <label className="text-sm block">Audit occurrence<select className={SELECT} aria-label="Audit occurrence" value={historical?.occurrence_id||''} onChange={e=>{const p=new URLSearchParams(params);if(e.target.value)p.set('audit_occurrence',e.target.value);else p.delete('audit_occurrence');setParams(p);setItemKey(null);}}><option value="">{'Current cycle '+current.iso_audit.cycle}</option>{current.occurrences?.filter(o=>o.iso_audit).map(o=><option key={o.occurrence_id} value={o.occurrence_id}>{'Cycle '+o.iso_audit.cycle+' · completed '+o.completed_at.slice(0,10)}</option>)}</select></label>
        <section className="pcard iso-audit-register" aria-label="Audit workpapers"><div className="card-head"><div><h2>Audit workpapers</h2><p>Expand native audit areas to inspect their workpapers.</p></div></div><div className="filters"><label className="f-search"><span className="sr-only">Search audit items</span><Search aria-hidden="true"/><input type="search" aria-label="Search audit items" placeholder="Reference, title or audit area…" value={search} onChange={e=>setSearch(e.target.value)}/></label>
          <div className="f-right">{filtering?<button type="button" className="link" onClick={()=>setSearch('')}>Clear audit search</button>:<button type="button" className="link" onClick={()=>setExpandedAreas(allAreasExpanded?[]:areas.map(area=>area.label))}>{allAreasExpanded?'Collapse all audit areas':'Expand all audit areas'}</button>}</div>
        </div><div className="summary"><span role="status">{items.length} of {pack.items.length} checks in this view.</span><span>Grouped by native audit area · Program order</span></div>
        <div className="reg iso-audit-areas"><ProgramVisualColumns groupingLabel="Audit area" mixLabel="Workpaper status" primaryLabel="Complete" secondaryLabel="Results recorded"/>{areas.map((area,areaIndex)=>{
          const hits=area.items.filter(definition=>matchingKeys.has(definition.key));if(!hits.length)return null;
          const open=filtering||expandedAreas.includes(area.label),panelId=`${areaPrefix}-${areaIndex}`,complete=area.items.filter(definition=>auditItemComplete(review.iso_audit.items[definition.key]||blankAuditItem())).length;
          const toggle=()=>setExpandedAreas(current=>current.includes(area.label)?current.filter(label=>label!==area.label):[...current,area.label]);
          const states=area.items.map(definition=>review.iso_audit.items[definition.key]||blankAuditItem());
          return <ProgramVisualGroup key={area.label} group={{name:area.label,rows:area.items,available:true,summary:{}}} dataControl={area.label} open={open} panelId={panelId} disabled={filtering} disabledReason={filtering?'Matching results stay expanded; clear audit search to collapse.':undefined} onActivate={filtering?undefined:toggle}
            metadata={`${complete} of ${area.items.length} checks complete`} statusBar={<AuditStatusBar states={states} label={area.label}/>} primaryMeasure={<><b>{complete} of {area.items.length}</b><span>{auditPercent(complete,area.items.length)}%</span></>} secondaryMeasure={<b>{auditResultsRecorded(states)} of {area.items.length}</b>}>
            {hits.map(definition=><AuditWorkpaperRow key={definition.key} definition={definition} state={review.iso_audit.items[definition.key]||blankAuditItem()} onOpen={()=>setItemKey(definition.key)}/>)}
          </ProgramVisualGroup>;
        })}</div>
        {!items.length&&<p role="status">No audit items match this search.</p>}
        </section>
        <details className="border border-line rounded p-4"><summary className="cursor-pointer text-sm font-medium">Issued report & package closure</summary><p className="text-xs my-3">All items need an audit result or justified N/A. Observations and Nonconformities require a shared Finding. Link the issued report, then complete the central Review. Open remediation remains open.</p>
          <IssuedReport id={review.iso_audit.report_evidence_id}/>
          {writable&&<EvidenceCatalogPicker clientId={clientId} disabled={busy} label="Link issued audit report" linkedIds={[review.iso_audit.report_evidence_id]} onLink={id=>run(async()=>{const r=await api.patch('/reviews/'+review.review_id+'/iso-audit',{report_evidence_id:id,occurrence_id:occurrenceId(review),expected_updated_at:review.updated_at??null});savedReview(r.data);})}/>}
        </details>
        {item&&<AuditItemWorkspace key={(review.occurrence_id||occurrenceId(review))+':'+itemKey} {...{review,item,users,configuration}} centralReview={current} frozen={!!historical} position={(index+1)+' of '+items.length} previous={index>0?()=>moveWorkpaper(items[index-1].key):null} next={index>=0&&index<items.length-1?()=>moveWorkpaper(items[index+1].key):null} onClose={closeWorkpaper} closeRequest={navigation?.closeRequest} onCloseCancelled={navigation?.keepEditing} onSaved={savedReview}/>}
      </>}
    </>}
    {nested&&<RecordDrawer {...nested} open clientId={clientId} users={users} schema={SCHEMAS[nested.kind]?.fields} onOpenChange={v=>{if(!v){setNested(null);setRevision(n=>n+1);}}} onSaved={()=>setRevision(n=>n+1)}/>}
  </section>;
}
