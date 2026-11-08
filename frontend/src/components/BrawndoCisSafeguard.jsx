import AssessmentShell,{AssessmentStep as Step} from './AssessmentShell';
import {useEffect,useRef,useState} from 'react';
import {BookOpen,CalendarClock,ChevronDown,ExternalLink,ArrowRight} from 'lucide-react';
import {Button} from './ui/button';
import {Textarea} from './ui/textarea';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './ui/dialog';
import {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuItem} from './ui/dropdown-menu';
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
import {useOrg} from '@/context/OrgContext';
import {focusedOmniEnabled} from '@/lib/focusedOmni';
import {useBrawndoFullRecord} from '@/lib/brawndoFullRecord';
import {safeguardDateFooter} from '@/lib/brawndoSafeguardDates';
import {safeguard11Eligible} from '@/lib/brawndoSafeguard11';
import {activePlans} from '@/lib/frameworks';
import './BrawndoSafeguard11.css';
import {PREVIEW_MODE} from '@/lib/api';
import {brawndoAssessmentPilotEligible} from '@/lib/brawndoAssessmentPilot';
import './BrawndoAssessmentPilot.css';

// Shared CIS IG1 workspace. The historical name is retained for existing callers.
// Read-only guidance never writes assessment responses, status or verification.
export const STATUS_OPTIONS=[['addressed','Implemented'],['in_progress','Partially Implemented'],['needs_attention','Not Implemented'],['not_assessed','Not Assessed'],['not_applicable','Not Applicable']];
const VERIFICATION_TONE={not_verified:'neutral',needs_validation:'moderate',gap_identified:'critical',verified:'success'};
export const CURRENT_HELP='Document how the organization currently satisfies this safeguard. Describe relevant technology, processes, responsible parties and recurring activities.';

export const GUIDANCE_NOTE='Omnisciente guidance for assessing this safeguard, not additional CIS requirements.';

export default function BrawndoCisSafeguard({state,actions}){
  const {user,workspaceMode}=useAuth();
  const {currentClient}=useOrg()||{};
  const [implementationReviewContainer,setImplementationReviewContainer]=useState(null);
  const [detailsView,setDetailsView]=useState(null);
  const detailsTrigger=useRef(null),detailsDestination=useRef(false),recordedNotesField=useRef(null),recordedNotesHeading=useRef(null);
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
  const assessmentConcept=brawndoAssessmentPilotEligible({demoMode:PREVIEW_MODE,workspaceMode,user,safeguard11,directProgramOpener:state.directProgramOpener,record,current,ctx,pathname:window.location.pathname});
  useEffect(()=>setDetailsView(null),[assessmentConcept,record.framework_assessment_id,user?.user_id]);
  const nativeBreadcrumb=safeguard11&&definition.control_name?breadcrumb?.map(entry=>entry.label===`Control ${definition.control}`?{...entry,label:`${entry.label} · ${definition.control_name}`}:entry):breadcrumb;
  const displayBreadcrumb=assessmentConcept&&currentClient?.client_id===clientId&&currentClient.name
    ?[{label:currentClient.name},...(nativeBreadcrumb||[])]:nativeBreadcrumb;
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
  const officialRequirement=assessmentConcept?<div className="gn-requirement-copy" data-source-kind="official">{source.text}</div>
    :<AssessmentRequirement reference={`CIS v8.1 · Safeguard ${id}`} heading="What CIS requires" text={source.text} official/>;
  const officialUrl=presentation?.source||criteria?.source||source.url;
  const requirementMeta=assessmentConcept?<div className="cis-native-requirement-meta gn-requirement-foot">
    {presentation?.trigger&&<div className="gn-trigger"><CalendarClock className="gn-icon" aria-hidden="true"/><p><span className="gn-trigger-label">Required operation / trigger</span>Review and update the inventory <mark>at least every six months</mark>.</p></div>}
    {officialUrl&&<a className="gn-source" href={officialUrl} target="_blank" rel="noopener noreferrer">Official CIS source<ExternalLink className="gn-icon" aria-hidden="true"/></a>}
  </div>:<div className="cis-native-requirement-meta">{presentation?.trigger&&<span><strong>Required operation / trigger:</strong> {presentation.trigger}</span>}{officialUrl&&<a href={officialUrl} target="_blank" rel="noopener noreferrer">Official CIS source</a>}</div>;
  const requirement=<section className="cis-native-requirement"><details className={'cis-collapsible-requirement'+(assessmentConcept?' gn-requirement':'')}><summary>{assessmentConcept?<><span className="gn-summary-left"><BookOpen className="gn-icon" aria-hidden="true"/>What CIS requires <span className="gn-summary-ref">CIS v8.1 · {id}</span></span><ChevronDown className="gn-icon gn-chevron" aria-hidden="true"/></>:<>What CIS requires · CIS v8.1 safeguard {id}</>}</summary>{officialRequirement}{assessmentConcept&&requirementMeta}</details>{!assessmentConcept&&requirementMeta}</section>;
  const returnToDetails=event=>{event.preventDefault();detailsTrigger.current?.focus({preventScroll:true});};
  const detailsMenu=assessmentConcept?<DropdownMenu onOpenChange={open=>{if(open)detailsDestination.current=false;}}>
    <DropdownMenuTrigger asChild><Button ref={detailsTrigger} className="gn-button gn-details-trigger" variant="outline" disabled={busy}>Assessment details<ChevronDown className="gn-icon" aria-hidden="true"/></Button></DropdownMenuTrigger>
    <DropdownMenuContent className="gn-details-menu" portalContainer={state.pilotPortalContainer||undefined} align="end"
      onCloseAutoFocus={event=>{if(detailsDestination.current)event.preventDefault();}}>
      <DropdownMenuItem disabled={!state.manageRecord||busy} onSelect={()=>{detailsDestination.current=true;state.manageRecord?.();}}>Ownership &amp; assessment history</DropdownMenuItem>
      <DropdownMenuItem disabled={!form.notes&&!current.notes||busy} onSelect={()=>{detailsDestination.current=true;setDetailsView('notes');}}>Recorded notes</DropdownMenuItem>
      <DropdownMenuItem disabled={!guideConfiguration||!ctx||busy} onSelect={()=>{detailsDestination.current=true;setDetailsView('history');}}>Interview history</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>:null;
  return <AssessmentShell open={open} title={definition.title} description={<span className="sr-only">Safeguard assessment workspace</span>}
    surfaceRef={assessmentConcept?state.pilotSurfaceRef:undefined}
    navigationActions={detailsMenu}
    className={visualReference?'brawndo-cis-visual-safeguard'+(safeguard11?' brawndo-safeguard11':'')+(assessmentConcept?' brawndo-assessment-pilot gn-window':''):undefined}
    closeInNavigation={visualReference}
    status={<><span aria-label="Saved implementation status"><CisStatusPill status={current.status} framework="cis-ig1"/></span><span aria-label="Saved verification" className={`cis-flag cis-tone-${VERIFICATION_TONE[saved]}`}>{VERIFICATION_LABELS[saved]}</span></>}
    {...{position,previous,next,close,busy}} testId="brawndo-cis-assessment" ariaModal
    crumbs={displayBreadcrumb?.length?<CisBreadcrumb items={displayBreadcrumb} label={`${programLabel} location`}/>:null}
    returnSelector={`[data-testid="requirement-${id}"]`}
    footer={<><div className="min-w-0 flex-1">{error&&<div role="alert" className="text-sm text-semantic-critical mb-1">{error}{!ctx&&<Button variant="outline" size="sm" onClick={retry}>Retry</Button>}</div>}<span role="status" className="text-sm text-ink-secondary">{footerContent}</span>{finding&&<p id="bcsg-finding-draft" className="text-xs text-ink-secondary">Create or cancel the open Finding before using Save & next.</p>}</div>
      <div className={'flex flex-wrap gap-2'+(assessmentConcept?' gn-footer-actions':'')}>{visualReference&&!assessmentConcept&&state.manageRecord&&<Button variant="outline" disabled={busy} onClick={state.manageRecord}>Manage</Button>}{writable&&<><Button className={assessmentConcept?'gn-button':undefined} variant={saveAndNext?'outline':'default'} disabled={disabled} onClick={save}>{busy?'Working…':'Save assessment'}</Button>{saveAndNext&&<Button className={assessmentConcept?'gn-button gn-primary':undefined} disabled={disabled||otherDraft} aria-describedby={finding?'bcsg-finding-draft':undefined} onClick={saveAndNext}>Save & next{assessmentConcept&&<ArrowRight className="gn-icon" aria-hidden="true"/>}</Button>}</>}</div></>}>
    {!ctx&&!error&&<p role="status" className="py-3 text-sm">Loading assessment…</p>}
    <AssessmentLayout inlineWorkflow guidedWorkflow criteriaSummary="Omnisciente guidance for assessing this safeguard. These are not additional CIS requirements." criteriaTitle="CIS assessment criteria" reference={`CIS v8.1 · Safeguard ${id}`} key={clientId+':'+id} summary={visualReference?undefined:summary?.plain} summaryLabel={visualReference?'Guided assessment':undefined}
      requirement={requirement} checklist={checklist} sectionCounts={sectionCounts} safeguard11={safeguard11}
      findings={<BrawndoCisFindings {...{record,definition,current,ctx,related,writable,busy,finding,setFinding,run,setNested,setFeedback,safeguard11,error}}/>}
      interview={({open,close})=>guideConfiguration?<GuidedAssessor sequential inline inlineOpen={open} onInlineClose={close} visualReference={visualReference} safeguard11={safeguard11} assessmentConcept={assessmentConcept} implementationReviewContainer={assessmentConcept?implementationReviewContainer:undefined} pilotPortalContainer={assessmentConcept?state.pilotPortalContainer:undefined}
        interviewHistoryOpen={assessmentConcept&&detailsView==='history'} onInterviewHistoryOpenChange={open=>{if(!open)setDetailsView(null);}} onInterviewHistoryCloseAutoFocus={returnToDetails}
        clientId={clientId} framework={record.framework_key} configuration={guideConfiguration} record={{...record,title:definition.title}} current={current} related={related} people={ctx?.users} inventoryContext={inventoryContext} contextComplete={!!ctx&&current.work?.context_complete===true} assessmentDirty={dirty&&!state.focusedImplementationOnly} onOpenNative={(kind,record)=>kind==='evidence'?actions.download?.(record):setNested({kind,record})} form={form} disabled={disabled} onApply={actions.applyGuided} onSaveAssessment={actions.saveGuidedAssessment} onDraftChange={actions.setGuidedDraft} onUpdateImplementation={disabled?undefined:actions.stageGuidedImplementation}/>:null}
      itemsToAddress={<><AssessmentItems safeguard11={safeguard11} record={current} ctx={ctx} disabled={disabled} onSaved={actions.itemsSaved} onCreateFinding={actions.createItemFinding} onDraftChange={actions.setItemsDraft}/>{inventoryReviewPlan&&state.manageRecord&&<section className="sg11-review-schedule"><Button variant="outline" disabled={busy||!ctx} onClick={state.manageRecord}>Schedule six-monthly review in Manage</Button></section>}</>} findingDraft={!!finding}
      review={guidance.review} outcome={guidance.outcome}>
    <div className={'assessment-implementation'+(assessmentConcept?' gn-assessment-state':'')}>
    <Step title="Implementation status">
      <fieldset disabled={disabled}><legend className="sr-only">Implementation status</legend>
        <div className={'brawndo-status-options'+(assessmentConcept?' gn-status-group':'')}>{STATUS_OPTIONS.map(([status,label])=><label key={status} className={`cis-tone-${implementationTone(status,record.framework_key)} ${form.status===status?'is-selected':''}${assessmentConcept?' gn-status-option':''}`}>
          <input type="radio" name="bcsg-status" value={status} checked={form.status===status} onChange={()=>put('status',status)}/><span className="cis-dot" aria-hidden="true"/><span>{label}</span>
        </label>)}</div>
      </fieldset>
      {form.status==='not_applicable'&&<label className="block text-sm">Why is this safeguard not applicable?<Textarea aria-label="N/A Rationale" disabled={disabled} value={form.na_rationale||''} onChange={e=>put('na_rationale',e.target.value)} maxLength={4000}/></label>}
    </Step>
    <div><Step title="Current implementation">
      <label className="block text-sm"><span className="sr-only">Current implementation</span>
        <Textarea className={assessmentConcept?'gn-field':undefined} id={assessmentConcept?'gn-current-implementation':undefined} aria-label="Current implementation" rows={assessmentConcept?6:5} disabled={disabled} maxLength={20000} value={form.implementation||''} onChange={e=>put('implementation',e.target.value)}/></label>
      {assessmentConcept&&<><p className="gn-small gn-muted">Editable wording based on reported practice. Save assessment to retain changes.</p><div className="gn-wording-entry-container" ref={setImplementationReviewContainer}/></>}
    </Step>
</div></div>
    {!assessmentConcept&&form.notes&&<details className="brawndo-disclosure"><summary>Previously recorded notes</summary><Textarea aria-label="Previously recorded notes" disabled={disabled} value={form.notes} onChange={e=>put('notes',e.target.value)}/></details>}
    {assessmentConcept&&<Dialog open={detailsView==='notes'} onOpenChange={open=>{if(!open)setDetailsView(null);}}>
      <DialogContent aria-modal="true" className="brawndo-assessment-pilot brawndo-pilot-child-dialog gn-dialog-box gn-wording-box"
        portalContainer={state.pilotPortalContainer||undefined} overlayClassName="brawndo-assessment-pilot brawndo-pilot-child-overlay gn-dialog-layer" showCloseButton={false}
        onOpenAutoFocus={event=>{event.preventDefault();(disabled?recordedNotesHeading.current:recordedNotesField.current)?.focus({preventScroll:true});}}
        onCloseAutoFocus={returnToDetails} onEscapeKeyDown={event=>event.stopPropagation()} onPointerDownOutside={event=>event.preventDefault()}>
        <DialogTitle ref={recordedNotesHeading} tabIndex={-1}>Recorded notes</DialogTitle>
        <DialogDescription>Notes remain part of this assessment draft. Use Save assessment to retain changes.</DialogDescription>
        <Textarea ref={recordedNotesField} className="gn-field" aria-label="Recorded notes" disabled={disabled} value={form.notes||''} onChange={event=>put('notes',event.target.value)}/>
        <div className="gn-dialog-actions"><Button className="gn-button" variant="outline" onClick={()=>setDetailsView(null)}>Back to assessment</Button></div>
      </DialogContent>
    </Dialog>}
    </AssessmentLayout>
  </AssessmentShell>;
}
