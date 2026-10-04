import {useEffect,useRef,useState} from 'react';
import IsoRequirementGuide from './IsoRequirementGuide';
import RemediationTickets from './RemediationTickets';
import TicketAssignment from './TicketAssignment';
import {auditProgrammeMetrics,auditProgrammeYears} from '@/lib/isoProgramMetrics';
import './IsoAssessment.css';
import './BrawndoCisSafeguard.css';
import {useRescueFocus} from '@/lib/focusRescue';
import {useSearchParams} from 'react-router-dom';
import api,{formatError} from '@/lib/api';
import {useAuth} from '@/context/AuthContext';
import {isInternal} from '@/lib/permissions';
import {isoAuditCatalog,auditPackage,auditActivationPlan,auditQuarter,auditProgress,blankAuditItem,AUDIT_STATUSES,AUDIT_RESULTS} from '@/lib/isoAudit';
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

function AuditItemWorkspace({review,centralReview=review,item,position,previous,next,onClose,onSaved,users,frozen=false}) {
  const {user}=useAuth(),initial=review.iso_audit.items[item.key]||blankAuditItem();
  const [form,setForm]=useState(initial),[saved,setSaved]=useState(initial),[error,setError]=useState(''),[busy,setBusy]=useState(false),[feedback,setFeedback]=useState('');
  const [version,setVersion]=useState(review.updated_at),[finding,setFinding]=useState(null),[nested,setNested]=useState(null),[pending,setPending]=useState(null),[related,setRelated]=useState(null),[evidence,setEvidence]=useState([]),[relatedRevision,setRelatedRevision]=useState(0);
  const oid=review.occurrence_id||occurrenceId(review),writable=!frozen&&writableReview(user,review),dirty=JSON.stringify(form)!==JSON.stringify(saved);
  const put=(k,v)=>{setFeedback('');setForm(old=>({...old,[k]:v}));};
  const leave=fn=>{if(busy)return;if(dirty||finding)setPending(()=>fn);else fn();};
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
  const source=sourcePresentation(frameworkDefinition('iso-27001',item.definition_id));
  const linkedFindings=(related?.findings||[]).filter(f=>form.finding_ids.includes(f.finding_id));
  const disabled=!writable||busy;
  return <><AssessmentShell ariaModal title={'ISO audit · '+item.reference+' — '+item.title} description={auditPackage(review.iso_audit.package_key).title+' · '+item.area+' · Cycle '+review.iso_audit.cycle}
    status={<span className="text-sm">{AUDIT_STATUSES[saved.status]} · {AUDIT_RESULTS[saved.result]||'Result not recorded'}{frozen?' · Historical workpaper':''}</span>}
    position={position} previous={previous?()=>leave(previous):null} next={next?()=>leave(next):null} close={()=>leave(onClose)} busy={busy} returnSelector={`[data-audit-item="${item.key}"]`}
    context={<><h3>Audit context</h3><p>{auditQuarter(review.due_date)} · Due {review.due_date?.slice(0,10)}</p><p>Auditor: {users.find(u=>u.user_id===review.owner_id)?.name||'Historical / unassigned'}</p><details><summary>Scope & objectivity</summary>{content(review.scope||'Scope not recorded')}{content(review.audit_independence||'Objectivity not recorded')}</details><Button variant="outline" size="sm" onClick={()=>setNested({kind:'reviews',record:centralReview,initialValues:frozen?{occurrence:review}:undefined})}>Open central Review</Button><p className="text-xs">Audit progress and results do not update implementation assessments or close remediation.</p><details><summary>Methodology source</summary><p className="text-xs">{isoAuditCatalog.source.filename} · {auditPackage(review.iso_audit.package_key).source_sheet} · row {item.source_row}. User-provided audit guidance, not official ISO text.</p></details></>}
    footer={<><div className="min-w-0 flex-1">{error&&<p role="alert" className="text-sm text-semantic-critical">{error}</p>}<p role="status" className="text-sm">{feedback||'Audit progress is separate from the result.'}{dirty&&' · Unsaved workpaper changes'}</p>{finding&&<p className="text-xs">Finish or cancel the Finding draft before Save & next.</p>}</div><Button variant="ghost" disabled={busy} onClick={()=>leave(onClose)}>Close assessment</Button>{writable&&<><Button variant="outline" disabled={busy} onClick={save}>Save assessment</Button>{next&&<Button disabled={busy||!!finding} onClick={async()=>{if(await save())next();}}>Save & next</Button>}</>}</>}>
    <details className="iso-guide-disclosure" key={item.key}><summary>Requirement guide</summary><IsoRequirementGuide id={item.definition_id} auditItem={item}/></details>
    <AssessmentStep number="1" title="Audit criteria & guidance"><p className="font-medium">{item.reference} · {item.title}</p><p className="text-xs text-ink-secondary">{item.type} · {item.area}</p>{source.url&&<a href={source.url} target="_blank" rel="noopener noreferrer" className="text-link underline">Official ISO reference ↗</a>}
      <p className="text-xs text-ink-secondary">Audit methodology from the supplied program, not official ISO text.</p>{content(item.guidance)}<h4>Intent</h4>{content(item.intent)}
      <div className="iso-guidance-columns"><section><h4>What to review and confirm</h4>{content(item.verify)}</section><section><h4>Examples of supporting evidence</h4>{content(item.evidence)}</section><section><h4>What good looks like</h4>{content(item.intent)}<p>Retain sampled evidence and an independent conclusion against the agreed criteria, with accountable follow-up.</p></section></div>
      <details><summary>What to inspect, questions & typical records</summary><h4>What to look at</h4>{content(item.inspect)}<h4>Questions to ask</h4>{content(item.questions)}<h4>Typical records</h4>{content(item.evidence)}{item.guidance_notes&&content(item.guidance_notes)}</details>
    </AssessmentStep>
    <AssessmentStep number="2" title="Audit workpaper"><fieldset disabled={disabled} className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-4"><label>Audit progress<select aria-label="Audit progress" className={SELECT} value={form.status} onChange={e=>put('status',e.target.value)}>{Object.entries(AUDIT_STATUSES).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
        <label>Audit result<select aria-label="Audit result" className={SELECT} value={form.result} onChange={e=>put('result',e.target.value)}><option value="">Not assessed</option>{Object.entries(AUDIT_RESULTS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label></div>
      <p className="text-xs text-ink-secondary">Reviewed means the examination was performed. It counts as complete only when its result is recorded. N/A requires documented justification; Annex A applicability remains in the SoA.</p>
      {form.status==='not_applicable'&&<label className="block">N/A rationale<Textarea aria-label="Audit N/A rationale" value={form.na_rationale} maxLength={4000} onChange={e=>put('na_rationale',e.target.value)}/></label>}
      <label className="block">Auditor notes<Textarea aria-label="Auditor notes" className="brawndo-narrative" rows={5} maxLength={20000} value={form.notes} onChange={e=>put('notes',e.target.value)}/></label>
    </fieldset></AssessmentStep>
    <AssessmentStep number="3" title="Evidence & validation"><p className="text-xs text-ink-secondary">Workpaper evidence selections save with this assessment. Library files are not copied or changed.</p>
      <ul>{evidence.map(e=><li key={e.evidence_id} className="brawndo-linked-row"><span>{e.display_name||e.filename} · {e.evidence_type||e.mime_type}</span><span><EvidenceDownload row={e}/>{writable&&<Button size="sm" variant="ghost" disabled={busy} onClick={()=>put('evidence_ids',form.evidence_ids.filter(id=>id!==e.evidence_id))}>Unlink</Button>}</span></li>)}</ul>
      {!form.evidence_ids.length&&<p>No evidence linked to this workpaper.</p>}
      {writable&&<EvidenceCatalogPicker clientId={review.client_id} linkedIds={form.evidence_ids} disabled={busy} onLink={id=>put('evidence_ids',[...new Set([...form.evidence_ids,id])])}/>}
    </AssessmentStep>
    <AssessmentStep number="4" title="Findings & remediation"><p className="text-xs text-ink-secondary">Observations and Nonconformities need a shared Finding before package closure. Completing the audit does not complete remediation.</p>
      <RemediationTickets records={{findings:linkedFindings,tasks:(related?.tasks||[]).filter(t=>form.finding_ids.includes(t.finding_id)),reviews:[centralReview]}} clientId={review.client_id} users={users} onOpen={setNested} disabled={busy}/>
      {writable&&!finding&&<><Button size="sm" variant="outline" disabled={busy} onClick={()=>setFinding({title:item.reference+' — '+(AUDIT_RESULTS[form.result]||'Audit gap'),description:form.notes,remediation_title:'Address '+item.reference+' audit gap',severity:'medium',request_id:recordUuid()})}>Create Finding</Button><label className="block mt-3">Link an existing package Finding<select aria-label="Link audit Finding" className={SELECT} value="" disabled={busy} onChange={e=>put('finding_ids',[...new Set([...form.finding_ids,e.target.value])])}><option value="">Select Finding</option>{(related?.findings||[]).filter(f=>!form.finding_ids.includes(f.finding_id)).map(f=><option key={f.finding_id} value={f.finding_id}>{f.title}</option>)}</select></label></>}
      {finding&&<fieldset disabled={busy} className="space-y-3 brawndo-inset">{[['title','Finding title'],['description','Finding description'],['remediation_title','Remediation Action title']].map(([k,label])=><label className="block" key={k}>{label}{k==='description'?<Textarea aria-label={label} value={finding[k]} onChange={e=>setFinding({...finding,[k]:e.target.value})}/>:<Input aria-label={label} value={finding[k]} onChange={e=>setFinding({...finding,[k]:e.target.value})}/>}</label>)}<TicketAssignment clientId={review.client_id} users={users} {...{finding,setFinding}} defaultOwner={review.owner_id} disabled={busy}/><Button onClick={createFinding}>Create Finding & Action</Button><Button variant="ghost" onClick={()=>setFinding(null)}>Cancel Finding</Button></fieldset>}
    </AssessmentStep>
  </AssessmentShell><AlertDialog open={!!pending} onOpenChange={v=>{if(!v)setPending(null);}}><AlertDialogContent><AlertDialogTitle>Leave unsaved changes?</AlertDialogTitle><AlertDialogDescription>The saved audit workpaper is unchanged. Keep editing or discard this draft.</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel>Keep editing</AlertDialogCancel><AlertDialogAction onClick={()=>{const fn=pending;setPending(null);fn?.();}}>Discard changes</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    {nested&&<RecordDrawer {...nested} open clientId={review.client_id} users={users} schema={SCHEMAS[nested.kind]?.fields} onOpenChange={v=>{if(!v)setNested(null);}} onSaved={()=>{setRelatedRevision(n=>n+1);if(nested.kind==='reviews')setFeedback('Central Review changed. Close and reopen the package to load its latest cycle before editing further.');}}/>}
  </>;
}

export default function IsoAuditWorkspace({clientId}) {
  const {user}=useAuth(),[params,setParams]=useSearchParams();
  const [data,setData]=useState(null),[users,setUsers]=useState([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0);
  const [draft,setDraft]=useState({start_date:'',first_package:isoAuditCatalog.packages[0].key,auditor_id:null,scope:'',independence:''}),[preview,setPreview]=useState(false);
  const [itemKey,setItemKey]=useState(null),[search,setSearch]=useState(''),[nested,setNested]=useState(null),packageHeading=useRef(null);
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
  async function run(fn){setBusy(true);setError('');try{await fn();}catch(e){setError(formatError(e));}finally{setBusy(false);}}
  const savedReview=r=>setData(old=>({...old,reviews:old.reviews.map(x=>x.review_id===r.review_id?r:x)}));
  const writable=review&&!historical&&writableReview(user,review);
  if(!data)return <div role={error?'alert':'status'}>{error||'Loading audit program…'}{error&&<Button onClick={()=>setRevision(n=>n+1)}>Retry</Button>}</div>;
  const years=auditProgrammeYears(data.reviews),now=String(new Date().getFullYear()),year=params.get('audit_year')||(years.includes(now)?now:years.at(-1)||now),progress=auditProgrammeMetrics(data.reviews,year);
  const openAudit=record=>{const p=new URLSearchParams(params);p.set('package',record.package_key);if(record.occurrence_id)p.set('audit_occurrence',record.occurrence_id);else p.delete('audit_occurrence');setParams(p);setItemKey(null);setSearch('');};
  return <section className="space-y-4" aria-label="Internal Audit Program">
    <p className="text-sm text-ink-secondary">Quarterly grouping organizes this program; ISO requires planned intervals and does not mandate quarters. Audit completion is independent of corrective-action closure.</p>
    <label className="block text-sm">Audit-program year <select aria-label="Audit-program year" className={SELECT} value={year} onChange={e=>{const p=new URLSearchParams(params);p.set('audit_year',e.target.value);setParams(p);}}>{(years.length?years:[now]).map(y=><option key={y}>{y}</option>)}</select></label>
    <div className="iso-program-grid" aria-label="Quarterly audit progress">{progress.quarters.map(q=><section key={q.quarter} className="bcis-card p-4"><h3>Q{q.quarter} · {year}</h3><p>{q.total?`${q.complete} of ${q.total} planned checks complete · ${Math.round(q.complete/q.total*100)}%`:'Not scheduled'}</p>{q.records.map(r=><Button key={r.review_id+':'+r.occurrence_id} variant="ghost" size="sm" onClick={()=>openAudit(r)}>{auditPackage(r.package_key).title}{r.occurrence_id?' · historical occurrence':''}</Button>)}</section>)}</div>
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
      {!review?<div className="framework-category-list">{data.reviews.map(r=>{const p=auditProgress(r.iso_audit),last=r.occurrences?.filter(o=>o.iso_audit&&o.completed_at).at(-1);return <button key={r.review_id} className="framework-category-row" onClick={()=>selectPackage(r.iso_audit.package_key)}><h3 className="font-medium">{auditPackage(r.iso_audit.package_key).title}</h3><p className="text-sm">{auditQuarter(r.due_date)} · Cycle {r.iso_audit.cycle} · {p.complete} / {p.total} complete</p><p className="text-xs text-ink-secondary">{r.status.replaceAll('_',' ')} · {p.nonconformities} Nonconformities · {p.observations} Observations</p>{last&&<p className="text-xs">Last completed {last.completed_at.slice(0,10)}{last.finding_count?' · Findings raised':''}</p>}</button>;})}</div>:<>
        <header className="flex flex-wrap justify-between gap-3"><div><h3 ref={packageHeading} className="font-semibold">{pack.title}</h3><p className="text-sm">Cycle {review.iso_audit.cycle} · {auditQuarter(review.due_date)} · {auditProgress(review.iso_audit).complete} / {pack.items.length} complete</p><p className="text-xs text-ink-secondary">Auditor: {users.find(u=>u.user_id===review.owner_id)?.name||'Historical / unassigned'} · Due {review.due_date?.slice(0,10)}</p></div><Button variant="outline" onClick={()=>setNested({kind:'reviews',record:current,initialValues:historical?{occurrence:historical}:undefined})}>Open central Review</Button></header>
        <p className="text-sm">{review.scope}</p>
        <label className="text-sm block">Audit occurrence<select className={SELECT} aria-label="Audit occurrence" value={historical?.occurrence_id||''} onChange={e=>{const p=new URLSearchParams(params);if(e.target.value)p.set('audit_occurrence',e.target.value);else p.delete('audit_occurrence');setParams(p);setItemKey(null);}}><option value="">{'Current cycle '+current.iso_audit.cycle}</option>{current.occurrences?.filter(o=>o.iso_audit).map(o=><option key={o.occurrence_id} value={o.occurrence_id}>{'Cycle '+o.iso_audit.cycle+' · completed '+o.completed_at.slice(0,10)}</option>)}</select></label>
        <Input aria-label="Search audit items" placeholder="Reference, title or audit area…" value={search} onChange={e=>setSearch(e.target.value)}/>
        <div className="divide-y divide-line border border-line rounded-lg">{items.map(i=>{const state=review.iso_audit.items[i.key]||blankAuditItem();return <button key={i.key} data-audit-item={i.key} className="w-full p-3 text-left flex flex-wrap justify-between gap-2 hover:bg-surface-subtle" onClick={()=>setItemKey(i.key)}><span className="text-sm">{i.reference} · {i.title}<span className="block text-xs text-ink-secondary">{i.area}</span></span><span className="text-xs">{AUDIT_STATUSES[state.status]} · {AUDIT_RESULTS[state.result]||'Result not recorded'}</span></button>;})}</div>
        {!items.length&&<p role="status">No audit items match this search.</p>}
        <details className="border border-line rounded p-4"><summary className="cursor-pointer text-sm font-medium">Issued report & package closure</summary><p className="text-xs my-3">All items need an audit result or justified N/A. Observations and Nonconformities require a shared Finding. Link the issued report, then complete the central Review. Open remediation remains open.</p>
          <IssuedReport id={review.iso_audit.report_evidence_id}/>
          {writable&&<EvidenceCatalogPicker clientId={clientId} disabled={busy} label="Link issued audit report" linkedIds={[review.iso_audit.report_evidence_id]} onLink={id=>run(async()=>{const r=await api.patch('/reviews/'+review.review_id+'/iso-audit',{report_evidence_id:id,occurrence_id:occurrenceId(review),expected_updated_at:review.updated_at??null});savedReview(r.data);})}/>}
        </details>
        {item&&<AuditItemWorkspace key={(review.occurrence_id||occurrenceId(review))+':'+itemKey} {...{review,item,users}} centralReview={current} frozen={!!historical} position={(index+1)+' of '+items.length} previous={index>0?()=>setItemKey(items[index-1].key):null} next={index>=0&&index<items.length-1?()=>setItemKey(items[index+1].key):null} onClose={()=>{setItemKey(null);setRevision(n=>n+1);}} onSaved={savedReview}/>}
      </>}
    </>}
    {nested&&<RecordDrawer {...nested} open clientId={clientId} users={users} schema={SCHEMAS[nested.kind]?.fields} onOpenChange={v=>{if(!v){setNested(null);setRevision(n=>n+1);}}} onSaved={()=>setRevision(n=>n+1)}/>}
  </section>;
}
