import AssessmentShell,{AssessmentStep as Step} from './AssessmentShell';
import {Button} from './ui/button';
import {Textarea} from './ui/textarea';
import AssessmentLayout,{AssessmentChecklist,AssessmentRequirement} from './AssessmentLayout';
import summaryData from '@catalogs/operatorGuidance/cisRequirementGuide.json';
import presentationData from '@catalogs/operatorGuidance/cisAssessmentPresentation.json';

import criteriaData from '@catalogs/operatorGuidance/cisAssessmentCriteria.json';
import guidanceData from '@catalogs/operatorGuidance/cisAssessmentGuidance.json';

import {sourcePresentation} from '@/lib/frameworkWorkspace';

import {CIS_TONE,CisStatusPill} from './CisStatus';
import {VERIFICATION_LABELS,verificationOf,CisBreadcrumb} from './BrawndoCisControls';
import BrawndoCisFindings from './BrawndoCisFindings';
import './BrawndoCisAssessment.css';
import {cisLabel} from '@/lib/cisScope';
import './BrawndoCisSafeguard.css';
import GuidedAssessor from './GuidedAssessor';

// Shared CIS IG1 workspace. The historical name is retained for existing callers.
// Read-only guidance never writes assessment responses, status or verification.
export const STATUS_OPTIONS=[['addressed','Implemented'],['in_progress','Partially Implemented'],['needs_attention','Not Implemented'],['not_assessed','Not Assessed'],['not_applicable','Not Applicable']];
const VERIFICATION_TONE={not_verified:'neutral',needs_validation:'moderate',gap_identified:'critical',verified:'success'};
export const CURRENT_HELP='Document how the organization currently satisfies this safeguard. Describe relevant technology, processes, responsible parties and recurring activities.';

export const GUIDANCE_NOTE='Omnisciente guidance for assessing this safeguard, not additional CIS requirements.';

export default function BrawndoCisSafeguard({state,actions}){
  const {open,record,definition,form,current,ctx,error,busy,dirty,feedback,writable,position,breadcrumb,related,finding,otherDraft}=state;
  const {put,save,saveAndNext,close,previous,next,retry,run,setFinding,setNested,setFeedback}=actions;
  const clientId=record.client_id,id=definition.id,disabled=!writable||busy||!ctx;
  const source=sourcePresentation(definition),criteria=criteriaData.requirements[id];
  const guidance=guidanceData.requirements[id];
  const saved=verificationOf(current),presentation=presentationData.requirements[id];
  const programLabel=ctx?cisLabel(ctx.configuration):breadcrumb?.[0]?.label||'CIS';
  return <AssessmentShell open={open} title={definition.title} description={<span className="sr-only">Safeguard assessment workspace</span>}
    status={<><span aria-label="Saved implementation status"><CisStatusPill status={current.status} framework="cis-ig1"/></span><span aria-label="Saved verification" className={`cis-flag cis-tone-${VERIFICATION_TONE[saved]}`}>{VERIFICATION_LABELS[saved]}</span></>}
    {...{position,previous,next,close,busy}} testId="brawndo-cis-assessment" ariaModal
    crumbs={breadcrumb?.length?<CisBreadcrumb items={breadcrumb} label={`${programLabel} location`}/>:null}
    returnSelector={`[data-testid="requirement-${id}"]`}
    footer={<><div className="min-w-0 flex-1">{error&&<div role="alert" className="text-sm text-semantic-critical mb-1">{error}{!ctx&&<Button variant="outline" size="sm" onClick={retry}>Retry</Button>}</div>}<span role="status" className="text-sm text-ink-secondary">{dirty?['Unsaved assessment changes',feedback].filter(Boolean).join(' · '):feedback||(!writable?'Read-only assessment':'Changes remain in your draft until saved.')}</span>{finding&&<p id="bcsg-finding-draft" className="text-xs text-ink-secondary">Create or cancel the open Finding before using Save & next.</p>}</div>
      <div className="flex flex-wrap gap-2">{writable&&<><Button variant={saveAndNext?'outline':'default'} disabled={disabled} onClick={save}>{busy?'Working…':'Save assessment'}</Button>{saveAndNext&&<Button disabled={disabled||otherDraft} aria-describedby={finding?'bcsg-finding-draft':undefined} onClick={saveAndNext}>Save & next</Button>}</>}</div></>}>
    {!ctx&&!error&&<p role="status" className="py-3 text-sm">Loading assessment…</p>}
    <AssessmentLayout criteriaSummary="Omnisciente guidance for assessing this safeguard. These are not additional CIS requirements." criteriaTitle="CIS assessment criteria" reference={`CIS v8.1 · Safeguard ${id}`} key={clientId+':'+id} summary={summaryData.requirements[id]?.plain}
      requirement={<AssessmentRequirement reference={`CIS v8.1 · Safeguard ${id}`} heading="What CIS requires" text={source.text} official trigger={presentation?.trigger} source={presentation?.source||criteria?.source||source.url} label="Official CIS source"/>}
      checklist={<AssessmentChecklist title={`Safeguard ${id} checklist`} items={criteria?.criteria} historicalItems={criteria?.legacy_criteria} value={form.cis_assessment_criteria||[]} disabled={disabled} onChange={value=>put('cis_assessment_criteria',value)}/>}
      findings={<BrawndoCisFindings {...{record,definition,current,ctx,related,writable,busy,finding,setFinding,run,setNested,setFeedback}}/>}
      review={guidance.review} outcome={guidance.outcome}>
    <div className="assessment-implementation">
    <Step title="Implementation status">
      <fieldset disabled={disabled}><legend className="sr-only">Implementation status</legend>
        <div className="brawndo-status-options">{STATUS_OPTIONS.map(([status,label])=><label key={status} className={`cis-tone-${CIS_TONE[status]} ${form.status===status?'is-selected':''}`}>
          <input type="radio" name="bcsg-status" value={status} checked={form.status===status} onChange={()=>put('status',status)}/><span className="cis-dot" aria-hidden="true"/><span>{label}</span>
        </label>)}</div>
      </fieldset>
      {form.status==='not_applicable'&&<label className="block text-sm">Why is this safeguard not applicable?<Textarea aria-label="N/A Rationale" disabled={disabled} value={form.na_rationale||''} onChange={e=>put('na_rationale',e.target.value)} maxLength={4000}/></label>}
    </Step>
    <div><Step title="Current implementation">
      <label className="block text-sm"><span className="sr-only">Current implementation</span>
        <Textarea aria-label="Current implementation" rows={5} disabled={disabled} maxLength={20000} value={form.implementation||''} onChange={e=>put('implementation',e.target.value)}/></label>
    </Step>
</div></div>
    {form.notes&&<details className="brawndo-disclosure"><summary>Previously recorded notes</summary><Textarea aria-label="Previously recorded notes" disabled={disabled} value={form.notes} onChange={e=>put('notes',e.target.value)}/></details>}
    </AssessmentLayout>
    {ctx&&<GuidedAssessor clientId={clientId} framework={record.framework_key} configuration={ctx.configuration} record={{...record,title:definition.title}} form={form} disabled={disabled} onApply={actions.applyGuided} onDraftChange={actions.setGuidedDraft}/>}
  </AssessmentShell>;
}
