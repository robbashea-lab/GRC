import {CisBreadcrumb} from './BrawndoCisControls';
import AssessmentShell,{AssessmentStep as Step} from './AssessmentShell';
import OrganizationalControls from './OrganizationalControls';
import { EvidenceCatalogPicker } from './EvidencePanel';
import { personLabel } from '@/lib/people';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {Textarea} from './ui/textarea';
import AssigneeSelect from './AssigneeSelect';
import StatusBadge from './StatusBadge';
import FrameworkReviewSetup from './FrameworkReviewSetup';
import FrameworkMappings from './FrameworkMappings';
import {operatorGuidance,operatorStatuses,operatorProgram,operatorVocabulary,STATUS_HELP} from '@/lib/frameworkOperator';
import {sourcePresentation} from '@/lib/frameworkWorkspace';
import {actionStatus} from '@/lib/actionItems';
import {recordUuid} from '@/lib/recordUuid';
import {readEvidenceFile} from '@/lib/evidenceFile';
import api from '@/lib/api';
import {isBrawndoReference} from '@/lib/reference';
import {useOrg} from '@/context/OrgContext';
import {CIS_TONE,CisStatusPill} from './CisStatus';
import {verificationLadder,verificationChecks,stackCapability,ageDays,STALE_DAYS} from '@/lib/cisVerification';
import './BrawndoCisAssessment.css';
import './BrawndoCisWorkspace.css';

const LADDER_STATE={done:'confirmed',partial:'partly confirmed',missing:'not established',gap:'gap identified'};

// Explicit synthetic-client identity, not a mutable display-name match. This is
// presentation gating only; the normal adapter/server still owns authorization.
export {isBrawndoReference};
export function isBrawndoCisPrototype(clientId,record,user){
  return isBrawndoReference(clientId,user) &&
    record?.client_id===clientId && record.framework_key==='cis-ig1';
}
const RECORD_IDS={reviews:'review_id',findings:'finding_id',tasks:'task_id',risks:'risk_id',policies:'policy_id',requirements:'requirement_id',vendors:'vendor_id'};

export default function FrameworkAssessmentWorkspace({state,actions}){
  const {open,record,definition,catalog,form,current,ctx,related,error,busy,dirty,feedback,writable,comment,finding,tab,position,link,otherDraft,breadcrumb}=state;
  const {put,save,saveAndNext,run,download,setComment,setFinding,setTab,setNested,setReviewDraft,setLink,setControlDraft,controlSaved,close,previous,next,reviewSaved,retry}=actions;
  const clientId=record.client_id,aid=record.framework_assessment_id,framework=record.framework_key,isCis=framework==='cis-ig1';
  const program=operatorProgram(framework),vocab=operatorVocabulary(framework);
  const guide=operatorGuidance(framework,definition),source=sourcePresentation(definition),statuses=operatorStatuses(framework);
  const disabled=!writable||busy||!ctx;
  const evidenceLabel=e=>e.display_name||e.filename;
  const who=id=>personLabel(ctx?.users,id,'Not recorded');
  const records=(kind,rows=[])=>rows.map(r=><li key={r[RECORD_IDS[kind]]} className="brawndo-linked-row">
    <button type="button" className="text-link text-left" disabled={busy} onClick={()=>setNested({kind,record:r})}>{r.title||r.name}</button>
    {kind==='tasks'?<span className="text-xs text-ink-secondary">{actionStatus(r.status)}</span>:<StatusBadge value={r.status}/>}
  </li>);
  const stack=useOrg()?.currentClient?.profile?.technical?.security_technology||[];
  const today=new Date(),ladder=verificationLadder(current,{stack,today}),checks=verificationChecks(definition.id),presumed=isCis?stackCapability(definition.id,stack):null;
  const evidenceAge=e=>ageDays(e.evidence_date||e.created_at,today)??0;
  const overdueTask=t=>!['done','cancelled'].includes(t.status)&&t.due_date&&t.due_date.slice(0,10)<today.toISOString().slice(0,10);
  const gapWithoutFinding=['in_progress','needs_attention'].includes(current.status)&&!related.findings?.some(f=>!['closed','accepted'].includes(f.status)&&(f.framework_assessment_id===aid||current.related_links?.some(l=>l.kind==='findings'&&l.id===f.finding_id)));
  const startFinding=()=>setFinding({title:`${definition.id} · ${definition.title} — implementation gap`,description:form.implementation||'',remediation_title:`Address ${definition.id} implementation gap`,severity:'medium',request_id:recordUuid()});
  return <AssessmentShell open={open} title={`${program} ${definition.id} — ${definition.title}`}
    description={`${definition.control_name||definition.category||definition.specification||'Framework assessment'} · ${definition.source_citation||definition.id}`}
    status={<><span aria-label="Saved conclusion"><CisStatusPill status={current.status} framework={framework}/></span><span className="text-xs text-ink-secondary">Last assessed: {current.last_assessed?.slice(0,10)||'Not assessed'}</span></>}
    {...{position,previous,next,close,busy}} testId={clientId==='demo_brawndo'&&isCis?'brawndo-cis-assessment':'framework-assessment-workspace'}
    ariaModal crumbs={breadcrumb?.length?<CisBreadcrumb items={breadcrumb} label={`${program} location`}/>:null}
    returnSelector={`[data-testid="requirement-${definition.id}"] button, [data-testid="requirement-${definition.id}"][tabindex], .cis-summary-head button`}
    context={<>            <h3>Ownership & context</h3>
            <dl><dt>Last assessed</dt><dd>{current.last_assessed?.slice(0,10)||'Not assessed'}{current.assessed_by?` · ${who(current.assessed_by)}`:''}</dd></dl>
            <fieldset disabled={disabled} className="space-y-4">
              <div><label>Assessment Owner</label><AssigneeSelect clientId={clientId} label="Assessment Owner" value={form.owner_id} onChange={v=>put('owner_id',v)} users={ctx?.users||[]} disabled={disabled}/></div>
              <label className="block">Process Owner<select aria-label="Process Owner" value={form.process_owner_id||''} onChange={e=>put('process_owner_id',e.target.value||null)}><option value="">Unassigned</option>{ctx?.contacts.map(c=><option key={c.contact_id} value={c.contact_id}>{c.name}</option>)}</select></label>
            </fieldset>
            <details><summary>Reviews & recurrence · {related.reviews?.length||0}</summary>
              <p className="text-xs mt-3">Source cadence: {definition.source_cadence}</p><p className="text-xs text-ink-secondary my-3">The linked Review owns the operational schedule; a suggested setup interval is not automatically a framework requirement.</p>
              <FrameworkReviewSetup record={current} definition={definition} catalog={catalog} reviews={ctx?.options.reviews||[]} users={ctx?.users||[]} clientId={clientId} writable={!disabled} onDraftChange={setReviewDraft} onOpen={r=>setNested({kind:'reviews',record:r})} onSaved={reviewSaved}/>
            </details>
            {['risks','policies'].map(kind=><details key={kind}><summary>{kind==='risks'?'Risks':'Policies'} · {related[kind]?.length||0}</summary><ul>{records(kind,related[kind])}</ul></details>)}
            <details onToggle={e=>{if(e.currentTarget.open)setTab('Related');}}><summary>Other relationships & mappings</summary>
              {['requirements','vendors'].map(kind=><ul key={kind}>{records(kind,related[kind])}</ul>)}
              <FrameworkMappings framework={framework} definition={definition.id}/>
              {writable&&<fieldset disabled={disabled} className="space-y-3 mt-3"><label className="block">Record type<select aria-label="Related record type" value={link.kind} onChange={e=>{setTab('Related');setLink({kind:e.target.value,id:''});}}>{Object.keys(RECORD_IDS).map(kind=><option key={kind} value={kind}>{kind==='tasks'?'Action Items':kind}</option>)}</select></label><label className="block">Record<select aria-label="Related record" value={link.id} onChange={e=>setLink({...link,id:e.target.value})}><option value="">Select record</option>{ctx?.options[link.kind]?.map(r=><option key={r[RECORD_IDS[link.kind]]} value={r[RECORD_IDS[link.kind]]}>{r.title||r.name}</option>)}</select></label><Button size="sm" variant="outline" disabled={disabled||!link.id} onClick={()=>run(()=>api.post(`/framework_assessments/${aid}/links`,link))}>Link record</Button></fieldset>}
            </details>
            <details><summary>Discussion · {ctx?.comments.length||0}</summary><ul>{ctx?.comments.map(c=><li className="mt-3 text-sm whitespace-pre-wrap break-words" key={c.comment_id}>{c.body}<p className="text-xs">{c.author_name||c.user_name} · {c.created_at?.slice(0,10)}</p></li>)}</ul>{writable&&<fieldset disabled={disabled} className="mt-3 space-y-2"><Textarea aria-label={isCis?"Safeguard comment":"Requirement comment"} value={comment} onChange={e=>setComment(e.target.value)}/><Button size="sm" disabled={!comment.trim()||disabled} onClick={()=>run(async()=>{await api.post('/comments',{client_id:clientId,entity_type:'framework_assessments',entity_id:aid,body:comment});setComment('');})}>Add comment</Button></fieldset>}</details>
            <details><summary>View History</summary><ul>{current.assessment_history?.slice().reverse().map((h,i)=><li key={i} className="mt-3 text-sm whitespace-pre-wrap break-words"><p className="font-medium">{statuses[h.status]} · {h.at?.slice(0,10)}</p><p className="text-xs">{who(h.by)}</p><p>{h.implementation}</p>{h.notes&&<p>{h.notes}</p>}{h.na_rationale&&<p>N/A: {h.na_rationale}</p>}{h.soa_applicability&&<p>Applicability: {h.soa_applicability==='included'?'Applicable':'Not Applicable'} · {h.soa_justification}</p>}</li>)}</ul>{!current.assessment_history?.length&&<p className="text-xs mt-3">No saved assessments yet.</p>}<h4 className="mt-4 text-sm font-medium">Activity</h4>{ctx?.activity.map((a,i)=><p key={a.audit_id||i} className="mt-2 text-xs">{a.action} · {a.at} · {a.user_name||a.user_email}</p>)}</details>
</>} footer={<><div className="min-w-0 flex-1">{error&&<div role="alert" className="text-sm text-semantic-critical mb-1">{error}{!ctx&&<Button variant="outline" size="sm" onClick={retry}>Retry</Button>}</div>}<span role="status" className="text-sm text-ink-secondary">{dirty?'Unsaved assessment changes':feedback||(!writable?'Read-only assessment':'Assessment changes are saved when you choose Save assessment.')}</span>{otherDraft&&<p id="brawndo-other-draft" className="text-xs text-ink-secondary">Finish or cancel the open Finding, Control, Review setup or comment before using Save & next.</p>}</div><div className="flex flex-wrap gap-2"><Button variant="ghost" disabled={busy} onClick={close}>Close assessment</Button>{writable&&<><Button variant={saveAndNext?'outline':'default'} disabled={disabled} onClick={save}>{busy?'Working…':'Save assessment'}</Button>{saveAndNext&&<Button disabled={disabled||otherDraft} aria-describedby={otherDraft?'brawndo-other-draft':undefined} onClick={saveAndNext}>Save & next</Button>}</>}</div></>}>
    {!ctx&&!error&&<p role="status" className="py-3 text-sm">Loading linked work…</p>}
            <Step number="1" title={isCis?"What CIS requires":`${program} reference & intent`}>
              <p className="brawndo-requirement-title">{definition.title}</p>
              {source.mode!=='REFERENCE_ONLY'?<p className="whitespace-pre-wrap">{source.text}</p>:<p>{guide.meaning}</p>}
              <div className="brawndo-reference"><span>{catalog.title||program} {catalog.version} · {vocab.item} {definition.id} · {definition.source_cadence}</span>{source.url?<a href={source.url} target="_blank" rel="noopener noreferrer">Official {program} reference ↗</a>:<span>{source.citation} · Public link unavailable</span>}</div>
              {source.mode==='REFERENCE_ONLY'&&<p className="text-xs text-ink-secondary">Omnisciente summary, not official framework text.</p>}
              <details className="brawndo-disclosure"><summary>Implementation guidance</summary><p>{guide.implementation}</p><p className="text-sm text-ink-secondary mt-2">Typical supporting records: {guide.evidence}</p></details>
            </Step>
            <Step number="2" title={isCis?"Client status":"Implementation assessment"}>
              {definition.specification==='annex_control'&&<fieldset disabled={disabled} className="space-y-3 brawndo-inset">
                <h4>Statement of Applicability</h4><p className="text-sm text-ink-secondary">Applicability is a risk-treatment decision, separate from implementation. Excluding a control does not erase its assessment or history.</p>
                <label className="block">Applicability<select aria-label="SoA applicability" value={form.soa_applicability||''} onChange={e=>put('soa_applicability',e.target.value)}><option value="">Undetermined</option><option value="included">Applicable</option><option value="excluded">Not Applicable</option></select></label>
                <label className="block">Applicability justification<Textarea aria-label="SoA justification" value={form.soa_justification||''} maxLength={4000} onChange={e=>put('soa_justification',e.target.value)}/></label>
              </fieldset>}
              <fieldset disabled={disabled} aria-describedby="brawndo-status-help"><legend className="sr-only">Assessment status</legend>
                <div className="brawndo-status-options">{['addressed','in_progress','needs_attention','not_applicable','not_assessed'].filter(status=>status!=='not_applicable'||definition.specification!=='isms_clause').map(status=><label key={status} className={`cis-tone-${CIS_TONE[status]} ${form.status===status?'is-selected':''}`}>
                  <input type="radio" name="brawndo-assessment-status" value={status} checked={form.status===status} onChange={()=>put('status',status)}/><span className="cis-dot" aria-hidden="true"/><span>{statuses[status]}</span>
                </label>)}</div>
              </fieldset>
              <p id="brawndo-status-help" className="text-sm text-ink-secondary">{STATUS_HELP[form.status]?.replaceAll('Assessment notes','the current-state narrative')}</p>
              {isCis&&form.status==='addressed'&&current.status!=='addressed'&&!ladder.find(l=>l.key==='evidence').state.match(/done|partial/)&&<p className="brawndo-caution" role="note">No evidence is linked. Implemented should reflect verified operation, not a statement that a control exists.</p>}
              {form.status==='not_applicable'&&definition.specification!=='annex_control'&&<label className="block">Why is this {vocab.item.toLowerCase()} not applicable?<Textarea aria-label="N/A Rationale" disabled={disabled} value={form.na_rationale||''} onChange={e=>put('na_rationale',e.target.value)} maxLength={4000}/></label>}
            </Step>
            <Step number="3" title="Delivery & current state">
              <fieldset disabled={disabled} className="space-y-4">
                <label className="block">Delivered by (technology / process)<Input aria-label="Technology / Processes Used" value={form.technology||''} onChange={e=>put('technology',e.target.value)} placeholder="e.g. Intune compliance policy; quarterly HR reconciliation"/></label>
                {presumed&&!form.technology?.trim()&&<p className="text-xs text-ink-secondary">Client Profile lists {presumed} in the service stack. That suggests the capability exists; confirm deployment, coverage and configuration before relying on it.</p>}
                <label className="block">Current state<Textarea aria-label="How is this requirement implemented?" className="brawndo-narrative" rows={5} maxLength={20000} value={form.implementation||''} onChange={e=>put('implementation',e.target.value)} placeholder="What actually operates today: scope, coverage, who performs it, how often, and known exceptions."/></label>
                {form.notes&&<details className="brawndo-disclosure"><summary>Previously recorded notes</summary><p className="text-xs text-ink-secondary">Retained separately to preserve existing information.</p><Textarea aria-label="Previously recorded notes" value={form.notes} onChange={e=>put('notes',e.target.value)}/></details>}
              </fieldset>
            </Step>
            <Step number="4" title="Verification">
              <div className={isCis?"brawndo-verify-grid":""}>
                {isCis&&<div>
                  <h4>Verification status</h4>
                  <ol className="brawndo-ladder" aria-label="Verification status, based on the saved assessment and linked records">{ladder.map(step=><li key={step.key} className={`is-${step.state}`}>
                    <span className="brawndo-ladder-mark" aria-hidden="true"/><span className="min-w-0"><span className="block font-medium">{step.label}<span className="sr-only">: {LADDER_STATE[step.state]}</span></span><span className="block text-xs text-ink-secondary">{step.detail}</span></span></li>)}</ol>
                </div>}
                <div>
                  <h4>What to verify</h4>
                  {isCis&&checks.length?<ul className="brawndo-checks">{checks.map(c=><li key={c}>{c}</li>)}</ul>:<ul className="brawndo-checks">{guide.evidence.split(';').map(c=><li key={c}>{c.trim()}</li>)}</ul>}
                  <p className="text-xs text-ink-secondary mt-2">Omnisciente assessment guidance. Record what you confirmed in Current state.</p>
                </div>
              </div>
              <div className="brawndo-subhead"><h4>Evidence · {ctx?related.evidence?.length||0:'…'}</h4>{writable&&<Button variant="outline" size="sm" disabled={disabled} aria-expanded={tab==='Evidence'} onClick={()=>setTab(tab==='Evidence'?'':'Evidence')}>Link Evidence</Button>}</div>
              <ul>{related.evidence?.map(e=><li className="brawndo-linked-row" key={e.evidence_id}><div className="min-w-0"><button className="text-link text-left" aria-label={`Download ${evidenceLabel(e)}`} disabled={busy} onClick={()=>download(e)}>{evidenceLabel(e)}</button>{e.display_name&&e.display_name!==e.filename&&<p className="text-xs text-ink-secondary">{e.filename}</p>}</div><span className={`text-xs ${evidenceAge(e)>STALE_DAYS?'text-semantic-moderate-text':'text-ink-secondary'}`}>{[e.evidence_type,(e.evidence_date||e.created_at)?.slice(0,10),evidenceAge(e)>STALE_DAYS&&'over 12 months old'].filter(Boolean).join(' · ')}</span></li>)}</ul>
              {ctx&&!related.evidence?.length&&<p className="text-sm text-ink-secondary">No evidence linked. Link an existing Library item or upload one.</p>}
              {tab==='Evidence'&&writable&&<fieldset disabled={disabled} className="brawndo-inset space-y-3">
                <p className="text-xs text-ink-secondary">Evidence links and uploads save immediately. Assessment text is saved separately below.</p>
                <EvidenceCatalogPicker clientId={clientId} linkedIds={related.evidence?.map(e=>e.evidence_id)} disabled={disabled} onLink={id=>run(()=>api.post(`/framework_assessments/${aid}/links`,{kind:'evidence',id}))}/>
                <label className="block">Upload Evidence<input className="block mt-2 max-w-full" aria-label="Upload Evidence" type="file" onChange={e=>{const f=e.target.files?.[0];if(f)run(async()=>api.post('/evidence',{client_id:clientId,linked_type:'framework_assessment',linked_id:aid,filename:f.name,mime_type:f.type||'application/octet-stream',content_base64:await readEvidenceFile(f)}));}}/></label>
                {!!related.evidence?.length&&<details><summary>Manage current assessment links</summary>{related.evidence.map(e=><Button key={e.evidence_id} variant="ghost" size="sm" onClick={()=>run(()=>api.delete(`/framework_assessments/${aid}/links`,{data:{kind:'evidence',id:e.evidence_id}}))}>Unlink {e.filename}</Button>)}<p className="text-xs">Unlinking preserves the Library item and its original provenance.</p></details>}
              </fieldset>}
            </Step>
            <Step number="5" title="Required actions">
              {ctx&&gapWithoutFinding&&<p className="brawndo-caution" role="note">This {vocab.item.toLowerCase()} has a recorded gap but no Finding. Raise one so remediation is owned and tracked.</p>}
              <div className="brawndo-subhead"><h4>Findings · {related.findings?.length||0}</h4>{writable&&!finding&&<Button variant="outline" size="sm" disabled={disabled} onClick={startFinding}>Create Finding</Button>}</div>
              <ul>{records('findings',related.findings)}</ul>
              {ctx&&!related.findings?.length&&!gapWithoutFinding&&<p className="text-sm text-ink-secondary">No linked Findings.</p>}
              {finding&&<fieldset disabled={disabled} className="brawndo-inset space-y-3"><legend className="font-medium">New Finding</legend>
                {[['title','Finding title'],['remediation_title','Remediation Action title'],['description','Finding description']].map(([key,label])=>{const Field=key==='description'?Textarea:Input;return <label className="block" key={key}>{label}<Field aria-label={label} value={finding[key]} onChange={e=>setFinding({...finding,[key]:e.target.value})}/></label>;})}
                <label className="block">Severity<select aria-label="Finding severity" value={finding.severity} onChange={e=>setFinding({...finding,severity:e.target.value})}>{['low','medium','high','critical'].map(s=><option key={s}>{s}</option>)}</select></label>
                <p className="text-xs text-ink-secondary">The Finding records the gap; its Action Item is where remediation is assigned and tracked.</p>
                <div className="flex flex-wrap gap-2"><Button onClick={()=>run(async()=>{await api.post(`/framework_assessments/${aid}/findings`,finding);setFinding(null);})}>Create Finding & Action</Button><Button variant="ghost" onClick={()=>setFinding(null)}>Cancel Finding</Button></div>
              </fieldset>}
              <h4 className="mt-5">Remediation Action Items · {related.tasks?.length||0}</h4>
              <ul>{related.tasks?.map(t=><li key={t.task_id} className="brawndo-linked-row">
                <button type="button" className="text-link text-left" disabled={busy} onClick={()=>setNested({kind:'tasks',record:t})}>{t.title}</button>
                <span className={`text-xs ${overdueTask(t)?'text-semantic-critical font-medium':'text-ink-secondary'}`}>{[actionStatus(t.status),who(t.assignee_id),t.due_date&&(overdueTask(t)?`Overdue · ${t.due_date.slice(0,10)}`:`Due ${t.due_date.slice(0,10)}`)].filter(Boolean).join(' · ')}</span>
              </li>)}</ul>
              {ctx&&!related.tasks?.length&&<p className="text-sm text-ink-secondary">No linked Action Items.</p>}
            </Step>
{framework!=='iso-27001'&&<section className="brawndo-step" aria-label="Organizational Controls"><OrganizationalControls clientId={clientId} assessmentId={aid} onDraftChange={setControlDraft} onSaved={controlSaved}/></section>}

  </AssessmentShell>;
}
