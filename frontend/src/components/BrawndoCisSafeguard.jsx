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
import {useBrawndoFullRecord} from '@/lib/brawndoFullRecord';
import {safeguardDateFooter} from '@/lib/brawndoSafeguardDates';
import {safeguard11Eligible} from '@/lib/brawndoSafeguard11';
import {activePlans} from '@/lib/frameworks';
import './BrawndoSafeguard11.css';

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
  const brawndoRecord=useBrawndoFullRecord(record,clientId);
  const safeguard11=safeguard11Eligible({visualReference,brawndoRecord,record,current,definition,ctx});
  const displayBreadcrumb=safeguard11&&definition.control_name?breadcrumb?.map(entry=>entry.label===`Control ${definition.control}`?{...entry,label:`${entry.label} · ${definition.control_name}`}:entry):breadcrumb;
  const inventoryReviewPlan=safeguard11&&activePlans(record.framework_key,ctx.configuration).some(plan=>plan.safeguards.includes(id)&&plan.default_cadence==='semiannual');
  const savedFooter=visualReference&&brawndoRecord&&current.client_id===clientId
    &&current.framework_key===record.framework_key&&current.framework_assessment_id===record.framework_assessment_id
    &&current.definition_id===record.definition_id;
  const savedDateFooter=safeguardDateFooter(current);
  const footerStatus=dirty?['Unsaved assessment changes',feedback].filter(Boolean).join(' · '):feedback||(!writable?'Read-only assessment':'Changes remain in your draft until saved.');
  let footerContent=footerStatus;
  if(savedFooter){
    if(busy)footerContent='Working…';
    else if(!dirty)footerContent=<>
      {savedDateFooter.dateTime?<>{savedDateFooter.label} <time dateTime={savedDateFooter.dateTime} title={savedDateFooter.dateTime} aria-label={`${savedDateFooter.label.replace(':','')} ${savedDateFooter.dateTime}`}>{savedDateFooter.display}</time></>:savedDateFooter.text}
      {!writable?' · Read-only assessment':''}{feedback?` · ${feedback}`:''}
    </>;
  }
  const sectionCounts=visualReference?{
    items:Array.isArray(current.items_to_address)?current.items_to_address.filter(item=>item.state==='open').length:null,
    findings:ctx&&current.work?.context_complete===true&&Array.isArray(related?.findings)?directFindings(current,related).length:null,
  }:undefined;
  const checklist=<AssessmentChecklist title={`Safeguard ${id} checklist`} items={criteria?.criteria} historicalItems={criteria?.legacy_criteria} value={form.cis_assessment_criteria||[]} disabled={disabled} onChange={value=>put('cis_assessment_criteria',value)}/>;
  const officialRequirement=<AssessmentRequirement reference={`CIS v8.1 · Safeguard ${id}`} heading="What CIS requires" text={source.text} official trigger={visualReference?undefined:presentation?.trigger} source={presentation?.source||criteria?.source||source.url} label="Official CIS source"/>;
  // The visual card retains the complete native guidance; it never supplies assessment answers.
  const nativeGuidance=<details className={safeguard11?'brawndo-cis-native-guidance sg11-native-guidance':'brawndo-cis-native-guidance'}><summary>Assessment guidance &amp; working checklist</summary>
    <p>{GUIDANCE_NOTE}</p><div className="brawndo-cis-native-guidance-grid">{checklist}
      {[["Getting started",summary?.start],["Evidence examples",summary?.evidence],["Questions to consider",summary?.ask],["Common gaps",summary?.gaps]].map(([title,text])=>text&&<section key={title}><h3>{title}</h3><p>{text}</p></section>)}
      {[["Review guidance",guidance.review],["Supporting evidence",guidance.evidence],["Expected outcome",guidance.outcome]].map(([title,paragraphs])=>paragraphs?.length>0&&<section key={title}><h3>{title}</h3>{paragraphs.map(text=><p key={text}>{text}</p>)}</section>)}
    </div>
  </details>;
  const requirement=safeguard11?<><section className="sg11-requirement">
    <header className="sg11-requirement-head"><h3>What CIS requires</h3><span>Official requirement · CIS Controls v8.1 · Safeguard {id} · verbatim</span></header>
    <div className="sg11-requirement-body"><blockquote data-source-kind="official">{source.text}</blockquote></div>
    <footer className="sg11-requirement-foot">{presentation?.trigger&&<span>{presentation.trigger}</span>}<span>IG{ctx.configuration.implementation_group}</span>{source.url&&<a href={source.url} target="_blank" rel="noopener noreferrer">Official CIS source ↗</a>}</footer>
  </section>{nativeGuidance}</>:visualReference?<section className="brawndo-cis-visual-requirement">
    <h3>Requirement summary</h3>{summary?.plain&&<p>{summary.plain}</p>}
    {presentation?.trigger&&<p className="brawndo-cis-required-trigger"><strong>Required operation / trigger:</strong> {presentation.trigger}</p>}
    <details className="brawndo-cis-official-requirement"><summary>What CIS requires · official text, CIS v8.1 safeguard {id}</summary>{officialRequirement}</details>
    {nativeGuidance}
  </section>:officialRequirement;
  return <AssessmentShell open={open} title={definition.title} description={<span className="sr-only">Safeguard assessment workspace</span>}
    className={visualReference?'brawndo-cis-visual-safeguard'+(safeguard11?' brawndo-safeguard11':''):undefined}
    closeInNavigation={visualReference}
    status={<><span aria-label="Saved implementation status"><CisStatusPill status={current.status} framework="cis-ig1"/></span><span aria-label="Saved verification" className={`cis-flag cis-tone-${VERIFICATION_TONE[saved]}`}>{VERIFICATION_LABELS[saved]}</span></>}
    {...{position,previous,next,close,busy}} testId="brawndo-cis-assessment" ariaModal
    crumbs={displayBreadcrumb?.length?<CisBreadcrumb items={displayBreadcrumb} label={`${programLabel} location`}/>:null}
    returnSelector={`[data-testid="requirement-${id}"]`}
    footer={<><div className="min-w-0 flex-1">{error&&<div role="alert" className="text-sm text-semantic-critical mb-1">{error}{!ctx&&<Button variant="outline" size="sm" onClick={retry}>Retry</Button>}</div>}<span role="status" className="text-sm text-ink-secondary">{footerContent}</span>{finding&&<p id="bcsg-finding-draft" className="text-xs text-ink-secondary">Create or cancel the open Finding before using Save & next.</p>}</div>
      <div className="flex flex-wrap gap-2">{visualReference&&state.manageRecord&&<Button variant="outline" disabled={busy} onClick={state.manageRecord}>Manage</Button>}{writable&&<><Button variant={saveAndNext?'outline':'default'} disabled={disabled} onClick={save}>{busy?'Working…':'Save assessment'}</Button>{saveAndNext&&<Button disabled={disabled||otherDraft} aria-describedby={finding?'bcsg-finding-draft':undefined} onClick={saveAndNext}>Save & next</Button>}</>}</div></>}>
    {!ctx&&!error&&<p role="status" className="py-3 text-sm">Loading assessment…</p>}
    <AssessmentLayout inlineWorkflow criteriaSummary="Omnisciente guidance for assessing this safeguard. These are not additional CIS requirements." criteriaTitle="CIS assessment criteria" reference={`CIS v8.1 · Safeguard ${id}`} key={clientId+':'+id} summary={visualReference?undefined:summary?.plain} summaryLabel={visualReference?'Guided assessment':undefined}
      requirement={requirement} checklist={checklist} sectionCounts={sectionCounts} safeguard11={safeguard11}
      findings={<BrawndoCisFindings {...{record,definition,current,ctx,related,writable,busy,finding,setFinding,run,setNested,setFeedback,safeguard11,error}}/>}
      interview={({open,close,reveal})=>guideConfiguration?<GuidedAssessor inline inlineOpen={open} onInlineClose={close} onFreshInterviewReady={visualReference?reveal:undefined} visualReference={visualReference} safeguard11={safeguard11} clientId={clientId} framework={record.framework_key} configuration={guideConfiguration} record={{...record,title:definition.title}} current={current} related={related} people={ctx?.users} inventoryContext={inventoryContext} contextComplete={!!ctx&&current.work?.context_complete===true} assessmentDirty={dirty&&!state.focusedImplementationOnly} onOpenNative={(kind,record)=>kind==='evidence'?actions.download?.(record):setNested({kind,record})} form={form} disabled={disabled} onApply={actions.applyGuided} onSaveAssessment={actions.saveGuidedAssessment} onDraftChange={actions.setGuidedDraft} onUpdateImplementation={disabled?undefined:actions.stageGuidedImplementation}/>:null}
      itemsToAddress={<><AssessmentItems safeguard11={safeguard11} record={current} ctx={ctx} disabled={disabled} onSaved={actions.itemsSaved} onCreateFinding={actions.createItemFinding} onDraftChange={actions.setItemsDraft}/>{inventoryReviewPlan&&state.manageRecord&&<section className="sg11-review-schedule"><Button variant="outline" disabled={busy||!ctx} onClick={state.manageRecord}>Schedule six-monthly review in Manage</Button></section>}</>} findingDraft={!!finding}
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
