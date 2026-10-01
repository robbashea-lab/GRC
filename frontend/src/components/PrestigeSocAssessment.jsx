import {Moon,Sun} from 'lucide-react';
import AssessmentShell,{AssessmentStep as Step} from './AssessmentShell';
import {Button} from './ui/button';
import {Textarea} from './ui/textarea';
import AssigneeSelect from './AssigneeSelect';
import {personLabel} from '@/lib/people';
import {operatorGuidance} from '@/lib/frameworkOperator';
import {sourcePresentation} from '@/lib/frameworkWorkspace';
import {useBrawndoTheme} from '@/lib/brawndoTheme';
import {CIS_TONE} from './CisStatus';
import {CisBreadcrumb,VERIFICATION_LABELS,verificationOf} from './BrawndoCisControls';
import {SocStatusPill,socCategoryCrumb} from './PrestigeSocNavigator';
import './BrawndoCisSafeguard.css';
import './PrestigeSocAssessment.css';

export const SOC_STATUS_OPTIONS=[['addressed','Implemented'],['in_progress','Partially Implemented'],['needs_attention','Not Implemented'],['not_assessed','Not Assessed'],['not_applicable','Not Applicable']];
const VERIFICATION_TONE={not_verified:'neutral',needs_validation:'moderate',gap_identified:'critical',verified:'success'};
export const SOC_CURRENT_HELP='Document how the organization currently addresses this criterion. Describe the relevant policies, technical controls, operational processes, responsible parties, recurring activities, and other implementation details necessary to understand how the control environment operates in practice.';
export const SOC_CRITERIA_NOTE='These Omnisciente assessment prompts are based on criterion-level review of the applicable Trust Services Criterion and relevant points of focus. Source wording and points of focus are not reproduced, and the prompts do not prescribe a specific control implementation.';

export function PrestigeSocHeader({resume,onContinue}){
  const [theme,setTheme]=useBrawndoTheme();
  return <header className="bcis-head"><div><p className="bcis-eyebrow">Prestige Worldwide · SOC 2 readiness</p><h1>SOC 2</h1></div><div className="bcis-actions"><button type="button" className="bcis-theme" onClick={()=>setTheme(theme==='dark'?'light':'dark')} aria-pressed={theme==='dark'} aria-label={theme==='dark'?'Switch to light mode':'Switch to dark mode'}>{theme==='dark'?<Sun size={16} aria-hidden="true"/>:<Moon size={16} aria-hidden="true"/>}<span>{theme==='dark'?'Light':'Dark'}</span></button>{resume&&<Button className="bcis-primary" onClick={onContinue} aria-label={`Continue assessment: ${resume.definition_id} ${resume.title}`}>Continue with {resume.definition_id}</Button>}</div></header>;
}

export default function PrestigeSocAssessment({state,actions}){
  const {open,record,definition,form,current,ctx,error,busy,dirty,feedback,writable,position,breadcrumb}=state;
  const {put,save,saveAndNext,close,previous,next,retry}=actions;
  const disabled=!writable||busy||!ctx,guidance=operatorGuidance('soc-2',definition),source=sourcePresentation(definition);
  const verification=verificationOf(form),saved=verificationOf(current),context=definition.category==='security'?'Security · Common Criteria':socCategoryCrumb(definition.category);
  return <AssessmentShell open={open} title={`SOC 2 ${definition.id} — ${definition.title}`} description={<span className="psoc-context">{context}</span>}
    status={<><span aria-label="Saved implementation status"><SocStatusPill status={current.status}/></span><span aria-label="Saved verification" className={`cis-flag cis-tone-${VERIFICATION_TONE[saved]}`}>{VERIFICATION_LABELS[saved]}</span></>}
    {...{position,previous,next,close,busy}} testId="prestige-soc-assessment" ariaModal crumbs={breadcrumb?.length?<CisBreadcrumb items={breadcrumb} label="SOC 2 location"/>:null} returnSelector={`[data-testid="requirement-${definition.id}"]`}
    footer={<><div className="min-w-0 flex-1">{error&&<div role="alert" className="text-sm text-semantic-critical mb-1">{error}{!ctx&&<Button variant="outline" size="sm" onClick={retry}>Retry</Button>}</div>}<span role="status" className="text-sm text-ink-secondary">{dirty?'Unsaved assessment changes':feedback||(!writable?'Read-only assessment':'Changes are saved when you choose Save assessment.')}</span></div><div className="flex flex-wrap gap-2"><Button variant="ghost" disabled={busy} onClick={close}>Close assessment</Button>{writable&&<><Button variant={saveAndNext?'outline':'default'} disabled={disabled} onClick={save}>{busy?'Working…':'Save assessment'}</Button>{saveAndNext&&<Button disabled={disabled} onClick={saveAndNext}>Save & next</Button>}</>}</div></>}>
    {!ctx&&!error&&<p role="status" className="py-3 text-sm">Loading assessment…</p>}
    <div className="bcsg-metadata"><div className="bcsg-owner"><span>Owner</span><AssigneeSelect clientId={record.client_id} label="Owner" value={form.owner_id} onChange={v=>put('owner_id',v)} users={ctx?.users||[]} disabled={disabled} showGuidance={false}/></div><label className="bcsg-verification">Verification<select aria-label="Verification result" disabled={disabled} value={verification} onChange={e=>put('verification',e.target.value)}>{Object.entries(VERIFICATION_LABELS).map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></label><p className="bcsg-meta">Last assessed: {current.last_assessed?.slice(0,10)||'Not assessed'}{current.assessed_by?` · ${personLabel(ctx?.users,current.assessed_by,'Not recorded')}`:''}</p></div>
    <Step number="1" title="What SOC 2 Requires"><p className="brawndo-requirement-title"><strong>{definition.id}</strong> · {definition.title}</p>{source.text?<p className="whitespace-pre-wrap" data-testid="soc-official-text">{source.text}</p>:<><p className="text-xs text-ink-secondary">Omnisciente explanation — not official AICPA text</p><p>{guidance.meaning||definition.guidance}</p></>}{source.url&&<a className="bcsg-ref" href={source.url} target="_blank" rel="noopener noreferrer">AICPA Reference ↗</a>}</Step>
    <Step number="2" title="SOC 2 Assessment Criteria"><p className="text-sm text-ink-secondary">{SOC_CRITERIA_NOTE}</p><ul className="psoc-criteria"><li><strong>Assessment focus</strong><span>{guidance.implementation}</span></li><li><strong>Support to examine</strong><span>{guidance.evidence||definition.evidence_guidance}</span></li></ul></Step>
    <Step number="3" title="Implementation Status"><fieldset disabled={disabled}><legend className="sr-only">Implementation status</legend><div className="brawndo-status-options">{SOC_STATUS_OPTIONS.map(([status,label])=><label key={status} className={`cis-tone-${CIS_TONE[status]} ${form.status===status?'is-selected':''}`}><input type="radio" name="psoc-status" value={status} checked={form.status===status} onChange={()=>put('status',status)}/><span className="cis-dot" aria-hidden="true"/><span>{label}</span></label>)}</div></fieldset>{form.status==='not_applicable'&&<label className="block text-sm">Why is this criterion not applicable?<Textarea aria-label="N/A Rationale" disabled={disabled} value={form.na_rationale||''} onChange={e=>put('na_rationale',e.target.value)} maxLength={4000}/></label>}</Step>
    <Step number="4" title="Current Implementation"><p id="psoc-current-help" className="text-xs text-ink-secondary">{SOC_CURRENT_HELP}</p><label className="block text-sm"><span className="sr-only">Current implementation</span><Textarea aria-label="Current implementation" aria-describedby="psoc-current-help" rows={5} disabled={disabled} maxLength={20000} value={form.implementation||''} onChange={e=>put('implementation',e.target.value)}/></label></Step>
  </AssessmentShell>;
}
