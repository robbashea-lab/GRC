import AssessmentShell,{AssessmentStep as Step} from './AssessmentShell';
import AssessmentHistory from './AssessmentHistory';
import {Button} from './ui/button';
import {Textarea} from './ui/textarea';
import AssigneeSelect from './AssigneeSelect';
import {personLabel} from '@/lib/people';
import criteriaData from '@catalogs/operatorGuidance/cisAssessmentCriteria.json';
import guidanceData from '@catalogs/operatorGuidance/cisAssessmentGuidance.json';
import CisRequirementGuide from './CisRequirementGuide';
import {sourcePresentation} from '@/lib/frameworkWorkspace';

import {CIS_TONE,CisStatusPill} from './CisStatus';
import {VERIFICATION_LABELS,verificationOf,CisBreadcrumb} from './BrawndoCisControls';
import BrawndoCisFindings from './BrawndoCisFindings';
import CisOperationPanel from './CisOperationPanel';
import CisSupportingRecords from './CisSupportingRecords';
import './BrawndoCisAssessment.css';
import {cisLabel,cisScopeLabel} from '@/lib/cisScope';
import './BrawndoCisSafeguard.css';

// Shared CIS IG1 workspace. The historical name is retained for existing callers.
// Read-only guidance never writes assessment responses, status or verification.
export const STATUS_OPTIONS=[['addressed','Implemented'],['in_progress','Partially Implemented'],['needs_attention','Not Implemented'],['not_assessed','Not Assessed'],['not_applicable','Not Applicable']];
const VERIFICATION_TONE={not_verified:'neutral',needs_validation:'moderate',gap_identified:'critical',verified:'success'};
export const CURRENT_HELP='Document how the organization currently satisfies this safeguard. Describe relevant technology, processes, responsible parties and recurring activities.';

export const GUIDANCE_NOTE='Omnisciente guidance for assessing this safeguard, not additional CIS requirements.';

export default function BrawndoCisSafeguard({state,actions}){
  const {open,record,definition,form,current,ctx,error,busy,dirty,feedback,writable,position,breadcrumb,related,finding,otherDraft}=state;
  const {put,save,saveAndNext,close,previous,next,retry,run,setFinding,setNested,setReviewDraft,reviewSaved,setFeedback}=actions;
  const clientId=record.client_id,id=definition.id,disabled=!writable||busy||!ctx;
  const source=sourcePresentation(definition),criteria=criteriaData.requirements[id];
  const guidance=guidanceData.requirements[id];
  const verification=verificationOf(form),saved=verificationOf(current);
  const programLabel=ctx?cisLabel(ctx.configuration):breadcrumb?.[0]?.label||'CIS';
  return <AssessmentShell open={open} title={`${programLabel} ${id} — ${definition.title}`} description={<span className="sr-only">Safeguard assessment workspace</span>}
    status={<><span aria-label="Saved implementation status"><CisStatusPill status={current.status} framework="cis-ig1"/></span><span aria-label="Saved verification" className={`cis-flag cis-tone-${VERIFICATION_TONE[saved]}`}>{VERIFICATION_LABELS[saved]}</span></>}
    {...{position,previous,next,close,busy}} testId="brawndo-cis-assessment" ariaModal
    crumbs={breadcrumb?.length?<CisBreadcrumb items={breadcrumb}/>:null}
    returnSelector={`[data-testid="requirement-${id}"]`}
    footer={<><div className="min-w-0 flex-1">{error&&<div role="alert" className="text-sm text-semantic-critical mb-1">{error}{!ctx&&<Button variant="outline" size="sm" onClick={retry}>Retry</Button>}</div>}<span role="status" className="text-sm text-ink-secondary">{dirty?['Unsaved assessment changes',feedback].filter(Boolean).join(' · '):feedback||(!writable?'Read-only assessment':'Changes are saved when you choose Save assessment.')}</span>{finding&&<p id="bcsg-finding-draft" className="text-xs text-ink-secondary">Create or cancel the open Finding before using Save & next.</p>}</div>
      <div className="flex flex-wrap gap-2"><Button variant="ghost" disabled={busy} onClick={close}>Close assessment</Button>{writable&&<><Button variant={saveAndNext?'outline':'default'} disabled={disabled} onClick={save}>{busy?'Working…':'Save assessment'}</Button>{saveAndNext&&<Button disabled={disabled||otherDraft} aria-describedby={finding?'bcsg-finding-draft':undefined} onClick={saveAndNext}>Save & next</Button>}</>}</div></>}>
    {!ctx&&!error&&<p role="status" className="py-3 text-sm">Loading assessment…</p>}
    <div className="bcsg-metadata">
    <div className="bcsg-owner"><span>Owner</span><AssigneeSelect clientId={clientId} label="Owner" value={form.owner_id} onChange={v=>put('owner_id',v)} users={ctx?.users||[]} disabled={disabled} showGuidance={false}/></div>
    <label className="bcsg-verification">Verification<select aria-label="Verification result" disabled={disabled} value={verification} onChange={e=>put('verification',e.target.value)}>{Object.entries(VERIFICATION_LABELS).map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></label>
    <p className="bcsg-meta">Last assessed: {current.last_assessed?.slice(0,10)||'Not assessed'}{current.last_assessed&&current.assessed_by?` · ${personLabel(ctx?.users,current.assessed_by,'Not recorded')}`:''}</p>
    </div>
    <div className="cis-assessment-layout">
    {ctx&&definition.implementation_group>(ctx.configuration.implementation_group||1)&&<p role="status" className="text-sm">Retained out-of-scope safeguard. History and linked work remain available; this assessment is excluded from active program totals.</p>}
    <details key={`${clientId}:${id}`} className="cis-guide-disclosure"><summary>Requirement guide</summary><CisRequirementGuide safeguardId={id}/></details>
    <div className="cis-guidance-layout">
    <div className="cis-guidance-main">
    <Step number="1" title="What CIS Requires">
      <p className="brawndo-requirement-title">{definition.title}</p>
      {source.text?<><p className="text-xs text-ink-secondary">Official requirement</p><p className="whitespace-pre-wrap" data-testid="cis-official-text">{source.text}</p></>:<><p className="text-xs text-ink-secondary">Requirement summary · Omnisciente</p><p>{definition.guidance}</p></>}
      {source.url&&<a className="bcsg-ref" href={criteria?.source||source.url} target="_blank" rel="noopener noreferrer">Official CIS reference ↗</a>}
    </Step>
    <p className="text-xs text-ink-secondary">{cisScopeLabel(definition)}</p>
    <Step number="2" title="CIS Assessment Criteria">
      <p className="text-sm text-ink-secondary">{GUIDANCE_NOTE}</p>
      <p className="text-xs text-ink-secondary" data-testid="criteria-source">Sources: CIS Safeguard {id} · v8.1</p>
      <div className="cis-assessment-guidance" data-guidance-revision={guidanceData.revision}>
        {[['review','What to review and confirm'],['evidence','Examples of supporting evidence'],['outcome','What good looks like']].map(([key,title])=><section key={key} aria-labelledby={`cis-guidance-${key}`}>
          <h4 id={`cis-guidance-${key}`}>{title}</h4>
          {key==='evidence'&&<p className="text-sm text-ink-secondary">Use relevant examples or equivalent support from the client, MSP/MSSP or responsible provider; not every artifact is needed.</p>}
          <ul>{guidance[key].map(text=><li key={text}>{text}</li>)}</ul>
        </section>)}
      </div>
    </Step>
    </div>
    </div>
    <div className="cis-implementation-layout">
    <Step number="3" title="Implementation Status">
      <fieldset disabled={disabled}><legend className="sr-only">Implementation status</legend>
        <div className="brawndo-status-options">{STATUS_OPTIONS.map(([status,label])=><label key={status} className={`cis-tone-${CIS_TONE[status]} ${form.status===status?'is-selected':''}`}>
          <input type="radio" name="bcsg-status" value={status} checked={form.status===status} onChange={()=>put('status',status)}/><span className="cis-dot" aria-hidden="true"/><span>{label}</span>
        </label>)}</div>
      </fieldset>
      {form.status==='not_applicable'&&<label className="block text-sm">Why is this safeguard not applicable?<Textarea aria-label="N/A Rationale" disabled={disabled} value={form.na_rationale||''} onChange={e=>put('na_rationale',e.target.value)} maxLength={4000}/></label>}
    </Step>
    <Step number="4" title="Current Implementation">
      <p id="bcsg-current-help" className="text-xs text-ink-secondary">{CURRENT_HELP}</p>
      <label className="block text-sm"><span className="sr-only">Current implementation</span>
        <Textarea aria-label="Current implementation" aria-describedby="bcsg-current-help" rows={5} disabled={disabled} maxLength={20000} value={form.implementation||''} onChange={e=>put('implementation',e.target.value)}/></label>
    </Step>
    </div>
    <BrawndoCisFindings {...{record,definition,current,ctx,related,writable,busy,finding,setFinding,run,setNested,setFeedback}}/>
    <CisOperationPanel {...{form,definition,put,disabled}} contacts={ctx?.contacts||[]}/>
    <CisSupportingRecords {...{record,current,definition,ctx,related,writable,busy,run,setNested,setReviewDraft,reviewSaved}}/>
    {otherDraft&&!finding&&<p role="status" className="text-xs text-ink-secondary">Save or cancel recurring Review setup before using Save & next.</p>}
    {form.notes&&<details className="brawndo-disclosure"><summary>Previously recorded notes</summary><Textarea aria-label="Previously recorded notes" disabled={disabled} value={form.notes} onChange={e=>put('notes',e.target.value)}/></details>}
    <AssessmentHistory record={current} users={ctx?.users} activity={ctx?.activity}/>
    </div>
  </AssessmentShell>;
}
