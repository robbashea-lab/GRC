import {isoGuideEntry} from './IsoRequirementGuide';
import AssessmentLayout,{AssessmentChecklist,AssessmentRequirement} from './AssessmentLayout';
import isoCriteria from '@catalogs/operatorGuidance/isoAssessmentCriteria.json';
import BrawndoCisFindings from './BrawndoCisFindings';
import './IsoAssessment.css';
import './BrawndoCisSafeguard.css';
import {CisBreadcrumb} from './BrawndoCisControls';
import AssessmentShell,{AssessmentStep as Step} from './AssessmentShell';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {Textarea} from './ui/textarea';
import {operatorGuidance,operatorStatuses,operatorProgram,operatorVocabulary} from '@/lib/frameworkOperator';
import {sourcePresentation} from '@/lib/frameworkWorkspace';

import {useOrg} from '@/context/OrgContext';
import {CIS_TONE,CisStatusPill} from './CisStatus';
import {verificationLadder,stackCapability} from '@/lib/cisVerification';
import './BrawndoCisAssessment.css';
import './BrawndoCisWorkspace.css';



export default function FrameworkAssessmentWorkspace({state,actions}){
  const {open,record,definition,form,current,ctx,related,error,busy,dirty,feedback,writable,finding,position,otherDraft,breadcrumb}=state;
  const {put,save,saveAndNext,run,setFinding,setNested,close,previous,next,retry,setFeedback}=actions;
  const clientId=record.client_id,framework=record.framework_key,isCis=framework==='cis-ig1',isIso=framework==='iso-27001';
  const isoGuide=isIso?isoGuideEntry(definition.id):null,criteria=isoCriteria.requirements[definition.id];
  const program=operatorProgram(framework),vocab=operatorVocabulary(framework);
  const guide=operatorGuidance(framework,definition),source=sourcePresentation(definition),statuses=operatorStatuses(framework);
  const disabled=!writable||busy||!ctx;
  const stack=useOrg()?.currentClient?.profile?.technical?.security_technology||[];
  const today=new Date(),ladder=verificationLadder(current,{stack,today}),presumed=isCis?stackCapability(definition.id,stack):null;
  return <AssessmentShell open={open} title={definition.title}
    description={`${definition.control_name||definition.category||definition.specification||'Framework assessment'} · ${definition.source_citation||definition.id}`}
    status={<><span aria-label="Saved conclusion"><CisStatusPill status={current.status} framework={framework}/></span><span className="text-xs text-ink-secondary">Last assessed: {current.last_assessed?.slice(0,10)||'Not assessed'}</span></>}
    {...{position,previous,next,close,busy}} testId={isIso?'iso-assessment-workspace':clientId==='demo_brawndo'&&isCis?'brawndo-cis-assessment':'framework-assessment-workspace'}
    ariaModal crumbs={breadcrumb?.length?<CisBreadcrumb items={breadcrumb} label={`${program} location`}/>:null}
    returnSelector={`[data-testid="requirement-${definition.id}"] button, [data-testid="requirement-${definition.id}"][tabindex], .cis-summary-head button`}
    footer={<><div className="min-w-0 flex-1">{error&&<div role="alert" className="text-sm text-semantic-critical mb-1">{error}{!ctx&&<Button variant="outline" size="sm" onClick={retry}>Retry</Button>}</div>}<span role="status" className="text-sm text-ink-secondary">{dirty?['Unsaved assessment changes',feedback].filter(Boolean).join(' · '):feedback||(!writable?'Read-only assessment':'Changes remain in your draft until saved.')}</span>{otherDraft&&<p id="brawndo-other-draft" className="text-xs text-ink-secondary">Finish or cancel the open Finding before using Save & next.</p>}</div><div className="flex flex-wrap gap-2">{writable&&<><Button variant={saveAndNext?'outline':'default'} disabled={disabled} onClick={save}>{busy?'Working…':'Save assessment'}</Button>{saveAndNext&&<Button disabled={disabled||otherDraft} aria-describedby={otherDraft?'brawndo-other-draft':undefined} onClick={saveAndNext}>Save & next</Button>}</>}</div></>}>
    <AssessmentLayout criteriaSummary="Omnisciente guidance for assessing this requirement. These are not additional ISO requirements." criteriaTitle="ISO assessment criteria" reference={`ISO/IEC 27001:2022 · ${definition.id}`} key={clientId+':'+definition.id} summary={isoGuide?.plain||guide.meaning}
      requirement={<AssessmentRequirement heading={definition.specification==='isms_clause'?'ISMS requirement & reference':'Annex A control & reference'} text={source.text||guide.meaning} official={!!source.text} trigger={criteria?.trigger} source={source.url} label="Official ISO source"/>}
      checklist={<AssessmentChecklist title={`${definition.specification==='isms_clause'?'Clause':'Control'} ${definition.id} checklist`} items={criteria?.coverage==='verified'?criteria.criteria:[]} value={form.iso_assessment_checks||[]} disabled={disabled} onChange={value=>put('iso_assessment_checks',value)}/>}
      findings={<BrawndoCisFindings {...{record,definition,current,ctx,related,writable,busy,finding,setFinding,run,setNested,setFeedback}}/>}
      review={isoGuide?.review} outcome={isoGuide?.outcome}>
              {definition.specification==='annex_control'&&<fieldset disabled={disabled} className="space-y-3 brawndo-inset">
                <h4>Statement of Applicability</h4><p className="text-sm text-ink-secondary">Applicability is a risk-treatment decision, separate from implementation. Excluding a control does not erase its assessment or history.</p>
                <label className="block">Applicability<select aria-label="SoA applicability" value={form.soa_applicability||''} onChange={e=>put('soa_applicability',e.target.value)}><option value="">Undetermined</option><option value="included">Applicable</option><option value="excluded">Not Applicable</option></select></label>
                <label className="block">Applicability justification<Textarea aria-label="SoA justification" value={form.soa_justification||''} maxLength={4000} onChange={e=>put('soa_justification',e.target.value)}/></label>
              </fieldset>}
            <div className="assessment-implementation">
            <Step title="Implementation status">
              {isIso&&current.status==='not_applicable'&&(definition.specification==='isms_clause'||current.soa_applicability==='included')&&<p role="alert" className="brawndo-caution">Legacy conflict: this mandatory requirement or applicable control has a Not Applicable implementation status. Review the decision explicitly; the saved value and history have not been changed.</p>}
              <fieldset disabled={disabled}><legend className="sr-only">Assessment status</legend>
                <div className="brawndo-status-options">{['addressed','in_progress','needs_attention','not_applicable','not_assessed'].filter(status=>status!=='not_applicable'||definition.specification!=='isms_clause').map(status=><label key={status} className={`cis-tone-${CIS_TONE[status]} ${form.status===status?'is-selected':''}`}>
                  <input type="radio" name="brawndo-assessment-status" value={status} checked={form.status===status} onChange={()=>put('status',status)}/><span className="cis-dot" aria-hidden="true"/><span>{statuses[status]}</span>
                </label>)}</div>
              </fieldset>

              {isCis&&form.status==='addressed'&&current.status!=='addressed'&&!ladder.find(l=>l.key==='evidence').state.match(/done|partial/)&&<p className="brawndo-caution" role="note">No evidence is linked. Implemented should reflect verified operation, not a statement that a control exists.</p>}
              {form.status==='not_applicable'&&definition.specification!=='annex_control'&&<label className="block">Why is this {vocab.item.toLowerCase()} not applicable?<Textarea aria-label="N/A Rationale" disabled={disabled} value={form.na_rationale||''} onChange={e=>put('na_rationale',e.target.value)} maxLength={4000}/></label>}
            </Step>
            <div><Step title="Current implementation">
              <fieldset disabled={disabled} className="space-y-4">

                {presumed&&!form.technology?.trim()&&<p className="text-xs text-ink-secondary">Client Profile lists {presumed} in the service stack. That suggests the capability exists; confirm deployment, coverage and configuration before relying on it.</p>}
                <label className="block">{isIso?'Current implementation':'Current state'}<Textarea aria-label={isIso?'Current implementation':'How is this requirement implemented?'} className="brawndo-narrative" rows={5} maxLength={20000} value={form.implementation||''} onChange={e=>put('implementation',e.target.value)} placeholder="What actually operates today: scope, coverage, who performs it, how often, and known exceptions."/></label>
                <details><summary>Technology / process</summary>                <label className="block">Delivered by (technology / process)<Input aria-label="Technology / Processes Used" value={form.technology||''} onChange={e=>put('technology',e.target.value)}/></label></details>
                {form.notes&&<details className="brawndo-disclosure"><summary>Previously recorded notes</summary><p className="text-xs text-ink-secondary">Retained separately to preserve existing information.</p><Textarea aria-label="Previously recorded notes" value={form.notes} onChange={e=>put('notes',e.target.value)}/></details>}
              </fieldset>
            </Step>
        </div></div>
    </AssessmentLayout>
  </AssessmentShell>;
}
