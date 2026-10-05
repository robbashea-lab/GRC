import AssessmentShell,{AssessmentStep as Step} from './AssessmentShell';
import BrawndoCisFindings from './BrawndoCisFindings';

import AssessmentLayout,{AssessmentChecklist,AssessmentRequirement} from './AssessmentLayout';
import summaryData from '@catalogs/operatorGuidance/socRequirementGuide.json';
import presentationData from '@catalogs/operatorGuidance/socAssessmentPresentation.json';
import {Button} from './ui/button';
import {Textarea} from './ui/textarea';




import {sourcePresentation} from '@/lib/frameworkWorkspace';
import socGuidance from '@catalogs/operatorGuidance/socAssessmentGuidance.json';
import {FrameworkHeader} from './BrawndoCisOverview';
import {CIS_TONE} from './CisStatus';
import {CisBreadcrumb,VERIFICATION_LABELS,verificationOf} from './BrawndoCisControls';
import {SocStatusPill,socCategoryCrumb} from './PrestigeSocNavigator';


import './BrawndoCisSafeguard.css';
import './PrestigeSocAssessment.css';

export const SOC_STATUS_OPTIONS=[['addressed','Implemented'],['in_progress','Partially Implemented'],['needs_attention','Not Implemented'],['not_assessed','Not Assessed'],['not_applicable','Not Applicable']];
const VERIFICATION_TONE={not_verified:'neutral',needs_validation:'moderate',gap_identified:'critical',verified:'success'};
export const SOC_CURRENT_HELP='Document how the organization currently addresses this criterion. Describe the relevant policies, technical controls, operational processes, responsible parties, recurring activities, and other implementation details necessary to understand how the control environment operates in practice.';
export const SOC_CRITERIA_NOTE='These guidance categories are not maturity levels or mandatory stages. Operational Practices and Enhanced Assurance do not represent additional SOC 2 requirements; assess the controls and commitments the organization has actually adopted.';

export const PrestigeSocHeader=props=><FrameworkHeader eyebrow="SOC 2 readiness" title="SOC 2" {...props}/>;

export default function PrestigeSocAssessment({state,actions}){
  const {open,record,definition,form,current,ctx,error,busy,dirty,feedback,writable,position,related,finding,breadcrumb}=state;
  const {put,save,saveAndNext,close,previous,next,retry,run,setFinding,setNested,setFeedback}=actions;
  const disabled=!writable||busy||!ctx,source=sourcePresentation(definition),presentation=presentationData.criteria[definition.id];
  const entry=socGuidance.criteria[definition.id],practical=entry?.practical;
  const saved=verificationOf(current),context=definition.category==='security'?'Security · Common Criteria':socCategoryCrumb(definition.category);
  return <AssessmentShell open={open} title={definition.title} description={<span className="psoc-context">{context}</span>}
    status={<><span aria-label="Saved implementation status"><SocStatusPill status={current.status}/></span><span aria-label="Saved verification" className={`cis-flag cis-tone-${VERIFICATION_TONE[saved]}`}>{VERIFICATION_LABELS[saved]}</span></>}
    {...{position,previous,next,close,busy}} testId="prestige-soc-assessment" ariaModal crumbs={breadcrumb?.length?<CisBreadcrumb items={breadcrumb} label="SOC 2 location"/>:null} returnSelector={`[data-testid="requirement-${definition.id}"]`}
    footer={<><div className="min-w-0 flex-1">{error&&<div role="alert" className="text-sm text-semantic-critical mb-1">{error}{!ctx&&<Button variant="outline" size="sm" onClick={retry}>Retry</Button>}</div>}<span role="status" className="text-sm text-ink-secondary">{dirty?['Unsaved assessment changes',feedback].filter(Boolean).join(' · '):feedback||(!writable?'Read-only assessment':'Changes remain in your draft until saved.')}</span></div><div className="flex flex-wrap gap-2">{writable&&<><Button variant={saveAndNext?'outline':'default'} disabled={disabled} onClick={save}>{busy?'Working…':'Save assessment'}</Button>{saveAndNext&&<Button disabled={disabled||!!finding} onClick={saveAndNext}>Save & next</Button>}</>}</div></>}>
    {!ctx&&!error&&<p role="status" className="py-3 text-sm">Loading assessment…</p>}
    <AssessmentLayout criteriaSummary="Omnisciente guidance for assessing this criterion. These are not additional SOC 2 requirements." criteriaTitle="SOC 2 assessment criteria" reference={`SOC 2 · Criterion ${definition.id}`} key={record.client_id+':'+definition.id} summary={summaryData.requirements[definition.id]?.plain}
      requirement={<AssessmentRequirement heading="What SOC 2 requires" text={source.text||practical?.summary} official={!!source.text} trigger={presentation?.trigger} source={presentation?.source||source.url} label="Official AICPA source"/>}
      checklist={<AssessmentChecklist title={`${definition.id} checklist`} items={entry?.assessment_criteria} historicalItems={entry?.items} value={form.soc_assessment_checks||[]} disabled={disabled} onChange={value=>put('soc_assessment_checks',value)}/>}
      findings={<BrawndoCisFindings {...{record,definition,current,ctx,related,writable,busy,finding,setFinding,run,setNested,setFeedback}}/>}
      review={practical?.review} outcome={practical?.outcome}>
    <div className="assessment-implementation">
    <Step title="Implementation status"><fieldset disabled={disabled}><legend className="sr-only">Implementation status</legend><div className="brawndo-status-options">{SOC_STATUS_OPTIONS.map(([status,label])=><label key={status} className={`cis-tone-${CIS_TONE[status]} ${form.status===status?'is-selected':''}`}><input type="radio" name="psoc-status" value={status} checked={form.status===status} onChange={()=>put('status',status)}/><span className="cis-dot" aria-hidden="true"/><span>{label}</span></label>)}</div></fieldset>{form.status==='not_applicable'&&<label className="block text-sm">Why is this criterion not applicable?<Textarea aria-label="N/A Rationale" disabled={disabled} value={form.na_rationale||''} onChange={e=>put('na_rationale',e.target.value)} maxLength={4000}/></label>}</Step>
    <div><Step title="Current implementation"><label className="block text-sm"><span className="sr-only">Current implementation</span><Textarea aria-label="Current implementation" rows={5} disabled={disabled} maxLength={20000} value={form.implementation||''} onChange={e=>put('implementation',e.target.value)}/></label></Step>
</div></div>

    {writable&&<Button size="sm" variant="ghost" disabled={disabled||form.status==='not_assessed'} onClick={()=>save({recordAssessment:true})}>Record assessment</Button>}
    </AssessmentLayout>
  </AssessmentShell>;
}
