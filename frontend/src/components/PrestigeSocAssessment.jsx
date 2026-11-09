import AssessmentShell,{AssessmentStep as Step} from './AssessmentShell';
import BrawndoCisFindings from './BrawndoCisFindings';

import AssessmentLayout,{AssessmentRequirement} from './AssessmentLayout';
import summaryData from '@catalogs/operatorGuidance/socRequirementGuide.json';
import presentationData from '@catalogs/operatorGuidance/socAssessmentPresentation.json';
import {Button} from './ui/button';
import {Textarea} from './ui/textarea';
import SocGuidedAssessor from './SocGuidedAssessor';
import AssessmentItems from './AssessmentItems';
import AssessmentRolloutFrame from './AssessmentRolloutFrame';
import AssessmentRequirementDisclosure from './AssessmentRequirementDisclosure';
import {assessmentRolloutEntry} from '@/lib/assessmentRolloutPresentation';
import {socGuidedEnabled} from '@/lib/socGuidedAssessment';
import {useAuth} from '@/context/AuthContext';




import {sourcePresentation} from '@/lib/frameworkWorkspace';
import socGuidance from '@catalogs/operatorGuidance/socAssessmentGuidance.json';
import {FrameworkHeader} from './BrawndoCisOverview';
import {CIS_TONE} from './CisStatus';
import {CisBreadcrumb,VERIFICATION_LABELS,verificationOf} from './BrawndoCisControls';
import {SOC_STATUS_LABELS,SocStatusPill,socCategoryCrumb} from './PrestigeSocNavigator';


import './BrawndoCisSafeguard.css';
import './PrestigeSocAssessment.css';
import './CisSequentialInterview.css';

export const SOC_STATUS_OPTIONS=['addressed','in_progress','needs_attention','not_assessed','not_applicable'].map(status=>[status,SOC_STATUS_LABELS[status]]);
const VERIFICATION_TONE={not_verified:'neutral',needs_validation:'moderate',gap_identified:'critical',verified:'success'};
export const SOC_CURRENT_HELP='Document how the organization currently addresses this criterion. Describe the relevant policies, technical controls, operational processes, responsible parties, recurring activities, and other implementation details necessary to understand how the control environment operates in practice.';
export const SOC_CRITERIA_NOTE='These guidance categories are not maturity levels or mandatory stages. Operational Practices and Enhanced Assurance do not represent additional SOC 2 requirements; assess the controls and commitments the organization has actually adopted.';

export const PrestigeSocHeader=props=><FrameworkHeader eyebrow="SOC 2 readiness" title="SOC 2" {...props}/>;

export default function PrestigeSocAssessment({state,actions}){
  const {user}=useAuth()||{};
  const {open,record,definition,form,current,ctx,error,busy,dirty,relatedDraft,otherDraft,feedback,writable,position,related,finding,breadcrumb}=state;
  const {put,save,saveAndNext,saveGuidedAssessment,setGuidedDraft,close,previous,next,retry,run,setFinding,setNested,setFeedback,itemsSaved,createItemFinding,setItemsDraft}=actions;
  const disabled=!writable||busy||!ctx,source=sourcePresentation(definition),presentation=presentationData.criteria[definition.id];
  const entry=socGuidance.criteria[definition.id],practical=entry?.practical;
  const saved=verificationOf(current),context=definition.category==='security'?'Security · Common Criteria':socCategoryCrumb(definition.category);
  const rollout=state.assessmentRollout===true;
  const status=<><span aria-label="Saved implementation status"><SocStatusPill status={current.status}/></span><span aria-label="Saved verification" className={`cis-flag cis-tone-${VERIFICATION_TONE[saved]}`}>{VERIFICATION_LABELS[saved]}</span></>;
  const findings=<BrawndoCisFindings {...{record,definition,current,ctx,related,writable,busy,finding,setFinding,run,setNested,setFeedback}}/>;
  const itemsToAddress=<AssessmentItems record={current} ctx={ctx} disabled={disabled} onSaved={itemsSaved} onCreateFinding={createItemFinding} onDraftChange={setItemsDraft}/>;
  const guideConfiguration=ctx?.configuration||state.guidedConfiguration;
  const guideAvailable=!!guideConfiguration&&(!rollout||socGuidedEnabled(record.client_id,user,record.framework_key,guideConfiguration,record.definition_id));
  const interview=guideAvailable?({open,close,historyOpen,onHistoryOpenChange,onHistoryCloseAutoFocus,implementationReviewContainer,pilotPortalContainer})=><SocGuidedAssessor sequential inline inlineOpen={open} onInlineClose={close}
    assessmentRollout={rollout} implementationReviewContainer={implementationReviewContainer} pilotPortalContainer={pilotPortalContainer}
    interviewHistoryOpen={historyOpen} onInterviewHistoryOpenChange={onHistoryOpenChange} onInterviewHistoryCloseAutoFocus={onHistoryCloseAutoFocus}
    clientId={record.client_id} configuration={guideConfiguration} record={record} current={current} form={form}
    assessmentDirty={dirty&&(!rollout||!state.focusedImplementationOnly)} relatedDraft={relatedDraft} contextComplete disabled={disabled}
    onDraftChange={setGuidedDraft} onSaveAssessment={saveGuidedAssessment} onUpdateImplementation={disabled?undefined:actions.stageGuidedImplementation}/>:null;
  const nativeControls=<>
    <div className={'assessment-implementation'+(rollout?' gn-assessment-state':'')}>
      <Step title="Implementation status"><fieldset disabled={disabled}><legend className="sr-only">Implementation status</legend><div className={'brawndo-status-options'+(rollout?' gn-status-group':'')}>{SOC_STATUS_OPTIONS.map(([value,label])=><label key={value} className={`cis-tone-${CIS_TONE[value]} ${form.status===value?'is-selected':''}${rollout?' gn-status-option':''}`}><input type="radio" name="psoc-status" value={value} checked={form.status===value} onChange={()=>put('status',value)}/><span className="cis-dot" aria-hidden="true"/><span>{label}</span></label>)}</div></fieldset>{form.status==='not_applicable'&&<label className="block text-sm">Why is this criterion not applicable?<Textarea aria-label="N/A Rationale" disabled={disabled} value={form.na_rationale||''} onChange={e=>put('na_rationale',e.target.value)} maxLength={4000}/></label>}</Step>
      <div><Step title="Current implementation"><label className="block text-sm"><span className="sr-only">Current implementation</span><Textarea className={rollout?'gn-field':undefined} aria-label="Current implementation" rows={rollout?6:5} disabled={disabled} maxLength={20000} value={form.implementation||''} onChange={e=>put('implementation',e.target.value)}/></label>{rollout&&<p className="gn-small gn-muted">Editable wording based on reported practice. Save assessment to retain changes.</p>}</Step></div>
    </div>
    {writable&&<Button className={rollout?'gn-button gn-quiet':undefined} size="sm" variant="ghost" disabled={disabled||form.status==='not_assessed'} onClick={()=>save({recordAssessment:true})}>Record assessment</Button>}
  </>;
  if(rollout){
    const metadata=assessmentRolloutEntry('soc-2',definition.id,{module:'criterion'});
    const requirementText=metadata&&!metadata.hold?metadata.requirement.text:summaryData.requirements[definition.id]?.plain||source.text||practical?.summary;
    const officialSource=metadata?.sources.find(item=>item?.locator?.includes('printed'))||metadata?.sources[0];
    const requirement=<AssessmentRequirementDisclosure frameworkLabel="SOC 2" reference={metadata?.reference||`SOC 2 · Criterion ${definition.id}`}
      text={<><p className="gn-small gn-muted">Requirement summary · Omnisciente</p><div data-source-kind="authored">{requirementText}</div>{source.text&&<div data-source-kind="official">{source.text}</div>}</>}
      trigger={metadata&&!metadata.hold?metadata.requirement.trigger:presentation?.trigger}
      source={{url:officialSource?.url||presentation?.source||source.url,label:'Official AICPA source'}}/>;
    return <AssessmentRolloutFrame {...{state,actions,status,requirement,interview,findings,itemsToAddress}} frameworkLabel="SOC 2" testId="prestige-soc-assessment">{nativeControls}</AssessmentRolloutFrame>;
  }
  return <AssessmentShell open={open} title={definition.title} description={<span className="psoc-context">{context}</span>}
    status={status}
    {...{position,previous,next,close,busy}} testId="prestige-soc-assessment" ariaModal crumbs={breadcrumb?.length?<CisBreadcrumb items={breadcrumb} label="SOC 2 location"/>:null} returnSelector={`[data-testid="requirement-${definition.id}"]`}
    footer={<><div className="min-w-0 flex-1">{error&&<div role="alert" className="text-sm text-semantic-critical mb-1">{error}{!ctx&&<Button variant="outline" size="sm" onClick={retry}>Retry</Button>}</div>}<span role="status" className="text-sm text-ink-secondary">{dirty?['Unsaved assessment changes',feedback].filter(Boolean).join(' · '):feedback||(!writable?'Read-only assessment':'Changes remain in your draft until saved.')}</span></div><div className="flex flex-wrap gap-2">{writable&&<><Button variant={saveAndNext?'outline':'default'} disabled={disabled} onClick={save}>{busy?'Working…':'Save assessment'}</Button>{saveAndNext&&<Button disabled={disabled||!!otherDraft||!!finding} onClick={saveAndNext}>Save & next</Button>}</>}</div></>}>
    {!ctx&&!error&&<p role="status" className="py-3 text-sm">Loading assessment…</p>}
    <AssessmentLayout inlineWorkflow guidedWorkflow criteriaSummary="Omnisciente guidance for assessing this criterion. These are not additional SOC 2 requirements." criteriaTitle="SOC 2 assessment criteria" reference={`SOC 2 · Criterion ${definition.id}`} key={record.client_id+':'+definition.id}
      requirement={<section className="cis-native-requirement"><details className="cis-collapsible-requirement"><summary>What SOC 2 requires · Criterion {definition.id}</summary><p>{summaryData.requirements[definition.id]?.plain}</p><AssessmentRequirement heading="What SOC 2 requires" text={source.text||practical?.summary} official={!!source.text}/></details><div className="cis-native-requirement-meta">{presentation?.trigger&&<span><strong>Required operation / trigger:</strong> {presentation.trigger}</span>}{(presentation?.source||source.url)&&<a href={presentation?.source||source.url} target="_blank" rel="noopener noreferrer">Official AICPA source</a>}</div></section>}
      interview={interview}
      itemsToAddress={itemsToAddress} findingDraft={!!finding}
      findings={findings}
      review={practical?.review} outcome={practical?.outcome}>
    {nativeControls}
    </AssessmentLayout>
  </AssessmentShell>;
}
