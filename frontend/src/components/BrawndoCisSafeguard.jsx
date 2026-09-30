import AssessmentShell,{AssessmentStep as Step} from './AssessmentShell';
import {Button} from './ui/button';
import {Textarea} from './ui/textarea';
import AssigneeSelect from './AssigneeSelect';
import {personLabel} from '@/lib/people';
import {operatorGuidance} from '@/lib/frameworkOperator';
import {sourcePresentation} from '@/lib/frameworkWorkspace';
import {TIERS,tiersFor,tierProgress,tierSignal,normalizeChecklist} from '@/lib/cisTiers';
import {CIS_TONE,CisStatusPill} from './CisStatus';
import {VERIFICATION_LABELS,verificationOf,CisBreadcrumb} from './BrawndoCisControls';
import './BrawndoCisAssessment.css';
import './BrawndoCisSafeguard.css';

// Brawndo CIS IG1 safeguard workspace. Persistence, draft guards and navigation stay in FrameworkDrawer;
// the checklist is practical guidance and never sets status or verification.
export const STATUS_OPTIONS=[['addressed','Implemented'],['in_progress','Partially Implemented'],['needs_attention','Not Implemented'],['not_assessed','Not Assessed'],['not_applicable','Not Applicable']];
const VERIFICATION_TONE={not_verified:'neutral',needs_validation:'moderate',gap_identified:'critical',verified:'success'};
export const CURRENT_HELP='Describe how this safeguard is currently being addressed, including technology, process, ownership, and recurring activities.';
export const GUIDANCE_NOTE='Practical verification guidance to support assessment of this safeguard. These are not additional CIS requirements.';

export default function BrawndoCisSafeguard({state,actions}){
  const {open,record,definition,form,current,ctx,error,busy,dirty,feedback,writable,position,breadcrumb}=state;
  const {put,save,saveAndNext,close,previous,next,retry}=actions;
  const clientId=record.client_id,id=definition.id,disabled=!writable||busy||!ctx;
  const source=sourcePresentation(definition),guide=operatorGuidance('cis-ig1',definition);
  const tiers=tiersFor(id),checklist=normalizeChecklist(form.verification_checklist,id),progress=tierProgress(checklist,id),signal=tierSignal(progress);
  const toggle=(tier,check)=>{const on=checklist[tier].includes(check);put('verification_checklist',{...checklist,[tier]:on?checklist[tier].filter(c=>c!==check):[...checklist[tier],check]});};
  const verification=verificationOf(form),saved=verificationOf(current);
  return <AssessmentShell open={open} title={`CIS IG1 ${id} — ${definition.title}`} description={<span className="sr-only">Safeguard assessment workspace</span>}
    status={<><span aria-label="Saved implementation status"><CisStatusPill status={current.status} framework="cis-ig1"/></span><span aria-label="Saved verification" className={`cis-flag cis-tone-${VERIFICATION_TONE[saved]}`}>{VERIFICATION_LABELS[saved]}</span></>}
    {...{position,previous,next,close,busy}} testId="brawndo-cis-assessment"
    crumbs={breadcrumb?.length?<CisBreadcrumb items={breadcrumb}/>:null}
    returnSelector={`[data-testid="requirement-${id}"]`}
    footer={<><div className="min-w-0 flex-1">{error&&<div role="alert" className="text-sm text-semantic-critical mb-1">{error}{!ctx&&<Button variant="outline" size="sm" onClick={retry}>Retry</Button>}</div>}<span role="status" className="text-sm text-ink-secondary">{dirty?'Unsaved assessment changes':feedback||(!writable?'Read-only assessment':'Changes are saved when you choose Save assessment.')}</span></div>
      <div className="flex flex-wrap gap-2"><Button variant="ghost" disabled={busy} onClick={close}>Close assessment</Button>{writable&&<><Button variant={saveAndNext?'outline':'default'} disabled={disabled} onClick={save}>{busy?'Working…':'Save assessment'}</Button>{saveAndNext&&<Button disabled={disabled} onClick={saveAndNext}>Save & next</Button>}</>}</div></>}>
    {!ctx&&!error&&<p role="status" className="py-3 text-sm">Loading assessment…</p>}
    <div className="bcsg-owner"><span>Owner</span><AssigneeSelect clientId={clientId} label="Owner" value={form.owner_id} onChange={v=>put('owner_id',v)} users={ctx?.users||[]} disabled={disabled}/></div>
    <Step number="1" title="What CIS Requires">
      <p className="brawndo-requirement-title">{definition.title}</p>
      {source.text?<p className="whitespace-pre-wrap" data-testid="cis-official-text">{source.text}</p>:<><p>{guide.meaning||definition.guidance}</p><p className="text-xs text-ink-secondary">Omnisciente summary — not official CIS text</p></>}
      {source.url&&<a className="bcsg-ref" href={source.url} target="_blank" rel="noopener noreferrer">Official CIS reference ↗</a>}
    </Step>
    <Step number="2" title="Verification Guidance">
      <p className="text-sm text-ink-secondary">{GUIDANCE_NOTE}</p>
      {tiers?<fieldset disabled={disabled} className="bcsg-tiers">{TIERS.map(([key,label])=><div key={key} className="bcsg-tier" role="group" aria-labelledby={`bcsg-${key}`}>
        <h4 id={`bcsg-${key}`}><span>{label}</span><span className="bcsg-count" data-testid={`tier-${key}`}>{progress[key].done} / {progress[key].total}</span></h4>
        <ul>{tiers[key].map(c=><li key={c.id}><label><input type="checkbox" checked={checklist[key].includes(c.id)} onChange={()=>toggle(key,c.id)}/><span>{c.text}</span></label></li>)}</ul>
      </div>)}</fieldset>:<p className="text-sm">No verification guidance is available for this safeguard.</p>}
    </Step>
    <Step number="3" title="Implementation Status">
      <fieldset disabled={disabled}><legend className="sr-only">Implementation status</legend>
        <div className="brawndo-status-options">{STATUS_OPTIONS.map(([status,label])=><label key={status} className={`cis-tone-${CIS_TONE[status]} ${form.status===status?'is-selected':''}`}>
          <input type="radio" name="bcsg-status" value={status} checked={form.status===status} onChange={()=>put('status',status)}/><span className="cis-dot" aria-hidden="true"/><span>{label}</span>
        </label>)}</div>
      </fieldset>
      {form.status==='not_applicable'&&<label className="block text-sm">Why is this safeguard not applicable?<Textarea aria-label="N/A Rationale" disabled={disabled} value={form.na_rationale||''} onChange={e=>put('na_rationale',e.target.value)} maxLength={4000}/></label>}
    </Step>
    <Step number="4" title="Current Implementation">
      <label className="block text-sm"><span className="sr-only">Current implementation</span>
        <Textarea aria-label="Current implementation" aria-describedby="bcsg-current-help" rows={5} disabled={disabled} maxLength={20000} value={form.implementation||''} onChange={e=>put('implementation',e.target.value)}/></label>
      <p id="bcsg-current-help" className="text-xs text-ink-secondary">{CURRENT_HELP}</p>
      {(current.technology||current.notes)&&<details className="bcsg-legacy"><summary>Previously recorded</summary><dl>{current.technology&&<><dt>Delivered by</dt><dd>{current.technology}</dd></>}{current.notes&&<><dt>Notes</dt><dd className="whitespace-pre-wrap">{current.notes}</dd></>}</dl></details>}
    </Step>
    <Step number="5" title="Verification">
      <label className="block text-sm">Verification<select aria-label="Verification result" aria-describedby={signal?'bcsg-signal':undefined} disabled={disabled} value={verification} onChange={e=>put('verification',e.target.value)}>{Object.entries(VERIFICATION_LABELS).map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></label>
      {signal&&<p id="bcsg-signal" className="text-xs text-ink-secondary" data-testid="tier-signal">Checklist: {signal}</p>}
    </Step>
    <p className="bcsg-meta">Last assessed: {current.last_assessed?.slice(0,10)||'Not assessed'}{current.assessed_by?` · ${personLabel(ctx?.users,current.assessed_by,'Not recorded')}`:''}</p>
  </AssessmentShell>;
}
