import AssessmentShell,{AssessmentStep as Step} from './AssessmentShell';
import AssessmentHistory from './AssessmentHistory';
import RemediationTickets from './RemediationTickets';
import TicketAssignment from './TicketAssignment';
import SocRequirementGuide from './SocRequirementGuide';
import {Button} from './ui/button';
import {Textarea} from './ui/textarea';
import AssigneeSelect from './AssigneeSelect';
import {personLabel} from '@/lib/people';
import {socAssessmentDate,socSavedDate} from '@/lib/socAssessmentDates';
import {operatorGuidance} from '@/lib/frameworkOperator';
import {sourcePresentation} from '@/lib/frameworkWorkspace';
import socGuidance from '@catalogs/operatorGuidance/socAssessmentGuidance.json';
import {FrameworkHeader} from './BrawndoCisOverview';
import {CIS_TONE} from './CisStatus';
import {CisBreadcrumb,VERIFICATION_LABELS,verificationOf} from './BrawndoCisControls';
import {SocStatusPill,socCategoryCrumb} from './PrestigeSocNavigator';
import api from '@/lib/api';
import {recordUuid} from '@/lib/recordUuid';
import './BrawndoCisSafeguard.css';
import './PrestigeSocAssessment.css';

export const SOC_STATUS_OPTIONS=[['addressed','Implemented'],['in_progress','Partially Implemented'],['needs_attention','Not Implemented'],['not_assessed','Not Assessed'],['not_applicable','Not Applicable']];
const VERIFICATION_TONE={not_verified:'neutral',needs_validation:'moderate',gap_identified:'critical',verified:'success'};
export const SOC_CURRENT_HELP='Document how the organization currently addresses this criterion. Describe the relevant policies, technical controls, operational processes, responsible parties, recurring activities, and other implementation details necessary to understand how the control environment operates in practice.';
export const SOC_CRITERIA_NOTE='These guidance categories are not maturity levels or mandatory stages. Operational Practices and Enhanced Assurance do not represent additional SOC 2 requirements; assess the controls and commitments the organization has actually adopted.';

export const PrestigeSocHeader=props=><FrameworkHeader eyebrow="SOC 2 readiness" title="SOC 2" {...props}/>;

export default function PrestigeSocAssessment({state,actions}){
  const {open,record,definition,form,current,ctx,error,busy,dirty,feedback,writable,position,related,finding,breadcrumb}=state;
  const {put,save,saveAndNext,close,previous,next,retry,run,download,setFinding,setNested,setFeedback}=actions;
  const disabled=!writable||busy||!ctx,guidance=operatorGuidance('soc-2',definition),source=sourcePresentation(definition);
  const entry=socGuidance.criteria[definition.id],items=entry?.items||[],practical=entry?.practical,checks=form.soc_assessment_checks||[];
  const verification=verificationOf(form),saved=verificationOf(current),context=definition.category==='security'?'Security · Common Criteria':socCategoryCrumb(definition.category);
  return <AssessmentShell open={open} title={`SOC 2 ${definition.id} — ${definition.title}`} description={<span className="psoc-context">{context}</span>}
    status={<><span aria-label="Saved implementation status"><SocStatusPill status={current.status}/></span><span aria-label="Saved verification" className={`cis-flag cis-tone-${VERIFICATION_TONE[saved]}`}>{VERIFICATION_LABELS[saved]}</span></>}
    {...{position,previous,next,close,busy}} testId="prestige-soc-assessment" ariaModal crumbs={breadcrumb?.length?<CisBreadcrumb items={breadcrumb} label="SOC 2 location"/>:null} returnSelector={`[data-testid="requirement-${definition.id}"]`}
    footer={<><div className="min-w-0 flex-1">{error&&<div role="alert" className="text-sm text-semantic-critical mb-1">{error}{!ctx&&<Button variant="outline" size="sm" onClick={retry}>Retry</Button>}</div>}<span role="status" className="text-sm text-ink-secondary">{dirty?'Unsaved assessment changes':feedback||(!writable?'Read-only assessment':'Changes are saved when you choose Save assessment.')}</span></div><div className="flex flex-wrap gap-2"><Button variant="ghost" disabled={busy} onClick={close}>Close assessment</Button>{writable&&<><Button variant={saveAndNext?'outline':'default'} disabled={disabled} onClick={save}>{busy?'Working…':'Save assessment'}</Button>{saveAndNext&&<Button disabled={disabled} onClick={saveAndNext}>Save & next</Button>}</>}</div></>}>
    {!ctx&&!error&&<p role="status" className="py-3 text-sm">Loading assessment…</p>}
    <div className="bcsg-metadata"><div className="bcsg-owner"><span>Owner</span><AssigneeSelect clientId={record.client_id} label="Owner" value={form.owner_id} onChange={v=>put('owner_id',v)} users={ctx?.users||[]} disabled={disabled} showGuidance={false}/></div><label className="bcsg-verification">Verification<select aria-label="Verification result" disabled={disabled} value={verification} onChange={e=>put('verification',e.target.value)}>{Object.entries(VERIFICATION_LABELS).map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></label><div className="bcsg-meta"><p>Last saved: {socSavedDate(current)}</p><p>Last assessed: {socAssessmentDate(current)}{current.assessment_recorded_by?` · ${personLabel(ctx?.users,current.assessment_recorded_by,'Not recorded')}`:''}</p>{writable&&<Button size="sm" variant="ghost" disabled={disabled||form.status==='not_assessed'} onClick={()=>save({recordAssessment:true})}>Record assessment</Button>}<p className="text-xs">Saving a changed assessment status records your judgment. Narrative-only saves retain its date; Record assessment reaffirms it.</p></div></div>
    <div className="psoc-assessment-layout">
    <details className="psoc-guide-disclosure" key={`${record.client_id}:${definition.id}`}><summary>Requirement guide</summary><SocRequirementGuide criterionId={definition.id}/></details>
    <Step number="1" title="What SOC 2 Requires"><p className="brawndo-requirement-title"><strong>{definition.id}</strong> · {definition.title}</p>{source.text?<><p className="text-xs text-ink-secondary">Official criterion text</p><p className="whitespace-pre-wrap" data-testid="soc-official-text">{source.text}</p></>:<><p className="text-xs text-ink-secondary">Requirement summary · Omnisciente</p><p data-testid="soc-requirement-summary">{practical?.summary||items.filter(i=>i.tier==='criterion_requirements').map(i=>i.text).join(' ')||guidance.meaning||definition.guidance}</p></>}{source.url&&<a className="bcsg-ref" href={source.url} target="_blank" rel="noopener noreferrer">AICPA Reference ↗</a>}</Step>
    <Step number="2" title="SOC 2 Assessment Guidance">
      <p className="text-xs text-ink-secondary">Omnisciente assessment guidance. Internal readiness, not an auditor opinion.</p>
      {practical?<div className="psoc-guidance" data-guidance-version={socGuidance.version}>
        <section className="psoc-tier" aria-labelledby="psoc-criterion-requirements">
          <h4 id="psoc-criterion-requirements">SOC 2 Criterion Requirements</h4>
          <div className="psoc-guidance-columns">
          {[['review','What to review and confirm'],['evidence','Examples of supporting evidence'],['outcome','What good looks like']].map(([key,title])=><section key={key} className="psoc-guidance-group" aria-labelledby={`psoc-guidance-${key}`}>
            <h5 id={`psoc-guidance-${key}`}>{title}</h5>
            {key==='evidence'&&socGuidance.context?.evidence&&<p className="text-sm text-ink-secondary">{socGuidance.context.evidence}</p>}
            <ul>{practical[key].map(text=><li key={text}>{text}</li>)}</ul>
          </section>)}
          </div>
        </section>
        {[['operational','Operational Practices'],['enhanced','Enhanced Assurance']].map(([key,title])=>practical[key].length?<section key={key} className="psoc-tier" aria-labelledby={`psoc-guidance-${key}`}>
          <h4 id={`psoc-guidance-${key}`}>{title}</h4>
          <ul>{practical[key].map(text=><li key={text}>{text}</li>)}</ul>
        </section>:null)}
      </div>:<p className="text-sm text-ink-secondary">Assessment guidance has not been reviewed for this criterion.</p>}
      <p className="psoc-guidance-note">{SOC_CRITERIA_NOTE}</p>
      {practical&&socGuidance.context&&<details className="psoc-guidance-context"><summary>How to use this guidance</summary>{['categories','obligations','type2','gaps'].map(key=>socGuidance.context[key]&&<p key={key}>{socGuidance.context[key]}</p>)}</details>}
      {!!checks.length&&<details className="psoc-previous-checks"><summary>Previous checklist responses · {checks.length}</summary><p>Retained from the previous checklist, not recalculated against this guidance. These responses do not set Implementation Status or Verification.</p><ul>{checks.map(id=><li key={id}>{items.find(item=>item.id===id)?.text||id}</li>)}</ul></details>}
    </Step>
    <div className="psoc-implementation-layout">
    <Step number="3" title="Implementation Status"><fieldset disabled={disabled}><legend className="sr-only">Implementation status</legend><div className="brawndo-status-options">{SOC_STATUS_OPTIONS.map(([status,label])=><label key={status} className={`cis-tone-${CIS_TONE[status]} ${form.status===status?'is-selected':''}`}><input type="radio" name="psoc-status" value={status} checked={form.status===status} onChange={()=>put('status',status)}/><span className="cis-dot" aria-hidden="true"/><span>{label}</span></label>)}</div></fieldset>{form.status==='not_applicable'&&<label className="block text-sm">Why is this criterion not applicable?<Textarea aria-label="N/A Rationale" disabled={disabled} value={form.na_rationale||''} onChange={e=>put('na_rationale',e.target.value)} maxLength={4000}/></label>}</Step>
    <Step number="4" title="Current Implementation"><p id="psoc-current-help" className="text-xs text-ink-secondary">{SOC_CURRENT_HELP}</p><label className="block text-sm"><span className="sr-only">Current implementation</span><Textarea aria-label="Current implementation" aria-describedby="psoc-current-help" rows={5} disabled={disabled} maxLength={20000} value={form.implementation||''} onChange={e=>put('implementation',e.target.value)}/></label></Step>
    </div>
    <section className="psoc-findings" aria-label="Criterion Findings">
      <h3>Findings</h3>
      <p className="text-xs text-ink-secondary">Completing remediation does not change the assessment conclusion automatically.</p>
      <RemediationTickets records={{...related,framework_assessments:[current]}} clientId={record.client_id} users={ctx?.users} onOpen={setNested} disabled={busy}/>
      {writable&&<div className="space-y-2">
        <Button variant="outline" disabled={disabled||!!finding} onClick={()=>setFinding({title:`${definition.id} · ${definition.title} — implementation gap`,description:current.implementation||'',remediation_title:`Address ${definition.id} implementation gap`,severity:'medium',request_id:recordUuid()})}>Raise Finding</Button>
        {finding&&<div className="space-y-2">
          <label className="block text-sm">Finding title<input aria-label="Finding title" className="w-full border border-line rounded p-2" value={finding.title} onChange={e=>setFinding({...finding,title:e.target.value})}/></label>
          <label className="block text-sm">Remediation Action title<input aria-label="Remediation Action title" className="w-full border border-line rounded p-2" value={finding.remediation_title} onChange={e=>setFinding({...finding,remediation_title:e.target.value})}/></label>
          <label className="block text-sm">Finding description<Textarea aria-label="Finding description" value={finding.description} onChange={e=>setFinding({...finding,description:e.target.value})}/></label>
          <TicketAssignment clientId={record.client_id} users={ctx?.users} {...{finding,setFinding}} defaultOwner={current.owner_id} disabled={busy}/>
          <label className="block text-sm">Severity<select aria-label="Finding severity" value={finding.severity} onChange={e=>setFinding({...finding,severity:e.target.value})}>{['low','medium','high','critical'].map(s=><option key={s}>{s}</option>)}</select></label>
          <Button disabled={busy||!finding.title.trim()||!finding.remediation_title.trim()} onClick={()=>run(async()=>{await api.post(`/framework_assessments/${record.framework_assessment_id}/findings`,finding);setFinding(null);setFeedback('Finding and remediation Action created.');})}>Create Finding & Action</Button>
          <Button variant="ghost" onClick={()=>setFinding(null)}>Cancel</Button>
        </div>}
      </div>}
    </section>
    <details className="psoc-linked">
      <summary>Linked work and history</summary>
      <p className="text-xs text-ink-secondary">These are existing governance records. Completing remediation does not change the assessment conclusion automatically.</p>
      <p className="text-xs text-ink-secondary">System boundaries and service commitments remain in Client Profile. Use <a className="text-link underline" href="/systems" target="_blank" rel="noopener noreferrer">Systems &amp; Scope ↗</a> for system records and link relevant supporting evidence here.</p>
      {!!current.management_controls?.length&&<ul>{current.management_controls.map((control,index)=><li key={control.control_id||index}><strong>{control.name||'Previously recorded control'}</strong><p className="whitespace-pre-wrap">{control.description}</p><p className="text-xs text-ink-secondary">Retained description · {control.frequency||'Frequency not recorded'} · Design: {control.design||'Not recorded'} · Operation: {control.operating||'Not recorded'}</p></li>)}</ul>}
      {!!ctx?.retainedControls?.length&&<ul>{ctx.retainedControls.map(control=><li key={control.control_id}><button type="button" onClick={()=>setNested({kind:'organizational_controls',record:control})}>Open retained supporting record · {control.control_id}</button></li>)}</ul>}
      {[
        ['reviews','Reviews','review_id'],
        ['risks','Risks','risk_id'],['policies','Policies','policy_id'],['evidence','Evidence','evidence_id']
      ].map(([kind,label,id])=><section key={kind}>
        <h3>{label} · {related?.[kind]?.length||0}</h3>
        <ul>{related?.[kind]?.map(item=><li key={item[id]}>
          {kind==='evidence'
            ? <button type="button" disabled={busy} onClick={()=>download(item)}>{item.filename}</button>
            : <button type="button" onClick={()=>setNested({kind,record:item})}>{item.title||item.name||item[id]}</button>}
          {item.status&&` · ${item.status.replaceAll('_',' ')}`}
        </li>)}</ul>
      </section>)}
    </details>
    <AssessmentHistory record={current} users={ctx?.users} activity={ctx?.activity}/>
    </div>
  </AssessmentShell>;
}
