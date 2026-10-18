import AssessmentShell,{AssessmentStep as Step} from './AssessmentShell';
import {Button} from './ui/button';
import {Textarea} from './ui/textarea';
import AssessmentLayout,{AssessmentChecklist,AssessmentRequirement} from './AssessmentLayout';
import summaryData from '@catalogs/operatorGuidance/cisRequirementGuide.json';
import presentationData from '@catalogs/operatorGuidance/cisAssessmentPresentation.json';

import criteriaData from '@catalogs/operatorGuidance/cisAssessmentCriteria.json';
import guidanceData from '@catalogs/operatorGuidance/cisAssessmentGuidance.json';

import {sourcePresentation} from '@/lib/frameworkWorkspace';

import {implementationTone,CisStatusPill} from './CisStatus';
import {VERIFICATION_LABELS,verificationOf,CisBreadcrumb} from './BrawndoCisControls';
import BrawndoCisFindings,{directFindings} from './BrawndoCisFindings';
import './BrawndoCisAssessment.css';
import {cisLabel} from '@/lib/cisScope';
import './BrawndoCisSafeguard.css';
import './BrawndoCisVisualSafeguard.css';
import GuidedAssessor from './GuidedAssessor';
import AssessmentItems from './AssessmentItems';
import {useAuth} from '@/context/AuthContext';
import {focusedOmniEnabled} from '@/lib/focusedOmni';

// Shared CIS IG1 workspace. The historical name is retained for existing callers.
// Read-only guidance never writes assessment responses, status or verification.
export const STATUS_OPTIONS=[['addressed','Implemented'],['in_progress','Partially Implemented'],['needs_attention','Not Implemented'],['not_assessed','Not Assessed'],['not_applicable','Not Applicable']];
const VERIFICATION_TONE={not_verified:'neutral',needs_validation:'moderate',gap_identified:'critical',verified:'success'};
export const CURRENT_HELP='Document how the organization currently satisfies this safeguard. Describe relevant technology, processes, responsible parties and recurring activities.';

export const GUIDANCE_NOTE='Omnisciente guidance for assessing this safeguard, not additional CIS requirements.';

export default function BrawndoCisSafeguard({state,actions}){
  const {user}=useAuth();
  const {open,record,definition,form,current,ctx,error,busy,dirty,feedback,writable,position,breadcrumb,related,finding,otherDraft}=state;
  const guideConfiguration=ctx?ctx.configuration:state.guidedConfiguration;
  const {put,save,saveAndNext,close,previous,next,retry,run,setFinding,setNested,setFeedback}=actions;
  const clientId=record.client_id,id=definition.id,disabled=!writable||busy||!ctx;
  const source=sourcePresentation(definition),criteria=criteriaData.requirements[id];
  const guidance=guidanceData.requirements[id];
  const saved=verificationOf(current),presentation=presentationData.requirements[id];
  const programLabel=ctx?cisLabel(ctx.configuration):breadcrumb?.[0]?.label||'CIS';
  const inventoryContext=id==='1.2'&&focusedOmniEnabled(clientId,user,record.framework_key,ctx?.configuration,id)?ctx?.inventoryContext:undefined;
  const visualReference=state.visualReference===true,summary=summaryData.requirements[id];
  const sectionCounts=visualReference?{
    items:Array.isArray(current.items_to_address)?current.items_to_address.filter(item=>item.state==='open').length:null,
    findings:ctx&&current.work?.context_complete===true&&Array.isArray(related?.findings)?directFindings(current,related).length:null,
  }:undefined;
  const checklist=<AssessmentChecklist title={`Safeguard ${id} checklist`} items={criteria?.criteria} historicalItems={criteria?.legacy_criteria} value={form.cis_assessment_criteria||[]} disabled={disabled} onChange={value=>put('cis_assessment_criteria',value)}/>;
  const officialRequirement=<AssessmentRequirement reference={`CIS v8.1 · Safeguard ${id}`} heading="What CIS requires" text={source.text} official trigger={visualReference?undefined:presentation?.trigger} source={presentation?.source||criteria?.source||source.url} label="Official CIS source"/>;
  // The visual card retains the complete native guidance; it never supplies assessment answers.
  const requirement=visualReference?<section className="brawndo-cis-visual-requirement">
    <h3>Requirement summary</h3>{summary?.plain&&<p>{summary.plain}</p>}
    {presentation?.trigger&&<p className="brawndo-cis-required-trigger"><strong>Required operation / trigger:</strong> {presentation.trigger}</p>}
    <details className="brawndo-cis-official-requirement"><summary>What CIS requires · official text, CIS v8.1 safeguard {id}</summary>{officialRequirement}</details>
    <details className="brawndo-cis-native-guidance"><summary>Assessment guidance &amp; working checklist</summary>
      <p>{GUIDANCE_NOTE}</p><div className="brawndo-cis-native-guidance-grid">{checklist}
        {[["Getting started",summary?.start],["Evidence examples",summary?.evidence],["Questions to consider",summary?.ask],["Common gaps",summary?.gaps]].map(([title,text])=>text&&<section key={title}><h3>{title}</h3><p>{text}</p></section>)}
        {[["Review guidance",guidance.review],["Supporting evidence",guidance.evidence],["Expected outcome",guidance.outcome]].map(([title,paragraphs])=>paragraphs?.length>0&&<section key={title}><h3>{title}</h3>{paragraphs.map(text=><p key={text}>{text}</p>)}</section>)}
      </div>
    </details>
  </section>:officialRequirement;
  return <AssessmentShell open={open} title={definition.title} description={<span className="sr-only">Safeguard assessment workspace</span>}
    className={visualReference?'brawndo-cis-visual-safeguard':undefined}
    closeInNavigation={visualReference}
    status={<><span aria-label="Saved implementation status"><CisStatusPill status={current.status} framework="cis-ig1"/></span><span aria-label="Saved verification" className={`cis-flag cis-tone-${VERIFICATION_TONE[saved]}`}>{VERIFICATION_LABELS[saved]}</span></>}
    {...{position,previous,next,close,busy}} testId="brawndo-cis-assessment" ariaModal
    crumbs={breadcrumb?.length?<CisBreadcrumb items={breadcrumb} label={`${programLabel} location`}/>:null}
    returnSelector={`[data-testid="requirement-${id}"]`}
    footer={<><div className="min-w-0 flex-1">{error&&<div role="alert" className="text-sm text-semantic-critical mb-1">{error}{!ctx&&<Button variant="outline" size="sm" onClick={retry}>Retry</Button>}</div>}<span role="status" className="text-sm text-ink-secondary">{dirty?['Unsaved assessment changes',feedback].filter(Boolean).join(' · '):feedback||(!writable?'Read-only assessment':'Changes remain in your draft until saved.')}</span>{finding&&<p id="bcsg-finding-draft" className="text-xs text-ink-secondary">Create or cancel the open Finding before using Save & next.</p>}</div>
      <div className="flex flex-wrap gap-2">{visualReference&&state.manageRecord&&<Button variant="outline" disabled={busy} onClick={state.manageRecord}>Manage</Button>}{writable&&<><Button variant={saveAndNext?'outline':'default'} disabled={disabled} onClick={save}>{busy?'Working…':'Save assessment'}</Button>{saveAndNext&&<Button disabled={disabled||otherDraft} aria-describedby={finding?'bcsg-finding-draft':undefined} onClick={saveAndNext}>Save & next</Button>}</>}</div></>}>
    {!ctx&&!error&&<p role="status" className="py-3 text-sm">Loading assessment…</p>}
    <AssessmentLayout inlineWorkflow criteriaSummary="Omnisciente guidance for assessing this safeguard. These are not additional CIS requirements." criteriaTitle="CIS assessment criteria" reference={`CIS v8.1 · Safeguard ${id}`} key={clientId+':'+id} summary={visualReference?undefined:summary?.plain} summaryLabel={visualReference?'Guided assessment':undefined}
      requirement={requirement} checklist={checklist} sectionCounts={sectionCounts}
      findings={<BrawndoCisFindings {...{record,definition,current,ctx,related,writable,busy,finding,setFinding,run,setNested,setFeedback}}/>}
      interview={({open,close,reveal})=>guideConfiguration?<GuidedAssessor inline inlineOpen={open} onInlineClose={close} onFreshInterviewReady={visualReference?reveal:undefined} visualReference={visualReference} clientId={clientId} framework={record.framework_key} configuration={guideConfiguration} record={{...record,title:definition.title}} current={current} related={related} people={ctx?.users} inventoryContext={inventoryContext} contextComplete={!!ctx&&current.work?.context_complete===true} assessmentDirty={dirty&&!state.focusedImplementationOnly} onOpenNative={(kind,record)=>kind==='evidence'?actions.download?.(record):setNested({kind,record})} form={form} disabled={disabled} onApply={actions.applyGuided} onSaveAssessment={actions.saveGuidedAssessment} onDraftChange={actions.setGuidedDraft} onUpdateImplementation={disabled?undefined:actions.stageGuidedImplementation}/>:null}
      itemsToAddress={<AssessmentItems record={current} ctx={ctx} disabled={disabled} onSaved={actions.itemsSaved} onCreateFinding={actions.createItemFinding} onDraftChange={actions.setItemsDraft}/>} findingDraft={!!finding}
      review={guidance.review} outcome={guidance.outcome}>
    <div className="assessment-implementation">
    <Step title="Implementation status">
      <fieldset disabled={disabled}><legend className="sr-only">Implementation status</legend>
        <div className="brawndo-status-options">{STATUS_OPTIONS.map(([status,label])=><label key={status} className={`cis-tone-${implementationTone(status,record.framework_key)} ${form.status===status?'is-selected':''}`}>
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
  </AssessmentShell>;
}
