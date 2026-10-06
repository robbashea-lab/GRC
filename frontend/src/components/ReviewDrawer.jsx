import {riskTreatments} from "@/lib/brawndoRisks";
import RemediationTickets from './RemediationTickets';
import {readEvidenceFile as fileData} from '@/lib/evidenceFile';
import { personLabel } from '@/lib/people';

import { useCallback, useEffect, useRef, useState } from 'react';
import {useCreateIntent} from '@/lib/createIntent';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {Dialog,DialogContent,DialogDescription} from '@/components/ui/dialog';
import {AlertDialog,AlertDialogContent,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction} from '@/components/ui/alert-dialog';
import {isReferencePresentation,isPrestigeReference} from '@/lib/reference';
import ReviewExpectations,{ReviewFacts} from './BrawndoReviewDetails';
import IsoManagementReviewGuide,{isIsoManagementReview} from './IsoManagementReviewGuide';
import './BrawndoCisAssessment.css';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import api, { formatError } from '@/lib/api';
import { SCHEMAS } from '@/lib/schemas';
import RequirementBasis, {GovernanceContextFields} from './RequirementBasis';
import { occurrenceId, reviewSchedule, reviewView } from '@/lib/reviewOccurrences';
import { useAuth } from '@/context/AuthContext';
import AssigneeSelect from './AssigneeSelect';
import {assessedRisk} from '@/lib/grcWork';
import {recordUuid} from '@/lib/recordUuid';
import StatusBadge from './StatusBadge';
import RecordDrawer from './RecordDrawer';
import { historicalRemediation, reviewRemediation } from '@/lib/remediation';
import {reviewStatus} from './RecordSummary';
import EvidencePanel from './EvidencePanel';
import {resolveEvidenceSource} from '@/lib/evidenceContext';
import {auditPackage,auditProgress} from '@/lib/isoAudit';
import CisReviewBrief from './CisReviewBrief';
import {cisReviewBriefs} from '@/lib/cisOperations';

const tabs = ['Overview','Requirements','Related','Evidence','Comments','Activity'];
const configFields = SCHEMAS.reviews.fields.filter(f => ['title','review_type','policy_id','owner_id','due_date','recurrence','custom_recurrence_days'].includes(f.name));
const date = value => value ? new Date(String(value).slice(0,10) + 'T00:00:00').toLocaleDateString() : '—';
const outcome = o => o.outcome === 'no_findings' ? 'No findings recorded' : o.outcome === 'findings_raised' ? `${o.finding_count} Finding${o.finding_count === 1 ? '' : 's'}` : o.outcome || 'Legacy completion';
const evaluationFields=[['conclusion','Reviewer conclusion',20000],['tested_scope','Scope examined',4000],['tested_period','Period examined',4000],['no_evidence_reason','Supporting records / reason no separate artifact is appropriate',4000]];

export default function ReviewDrawer({open,onOpenChange,record,clientId,onSaved,initialValues,reviewsPilot=false}) {
  const {user} = useAuth();
  const pilot=(reviewsPilot || isPrestigeReference(clientId,user)) && isReferencePresentation(clientId,user) && (!record || record.client_id===clientId);
  const opener=useRef(null),heading=useRef(null),cisBriefOpener=useRef(null);
  const [pending,setPending]=useState(null);
  const admin = ['super_admin','platform_admin'].includes(user?.role);
  const writable = admin || user?.role === 'client_grc_manager' || user?.role === 'client_contributor' &&
    [record?.owner_id, record?.reviewer_id].includes(user?.user_id);
  const [riskDraft,setRiskDraft] = useState(null);
  const [riskOutcome,setRiskOutcome]=useState("Reviewed — No Change");
  const [riskNext,setRiskNext]=useState("");
  const [confirmComplete,setConfirmComplete]=useState(false);
  const [evaluation,setEvaluation]=useState({});
  const [current,setCurrent] = useState(null), [form,setForm] = useState({});
  const [history,setHistory] = useState([]), [selected,setSelected] = useState(null);
  const [tab,setTab] = useState('Overview'), [busy,setBusy] = useState(false);
  const [members,setMembers] = useState([]), [related,setRelated] = useState({});
  const [basisLoading,setBasisLoading]=useState(false),[basisError,setBasisError]=useState('');
  const [policies,setPolicies] = useState([]);
  const [showHistorical,setShowHistorical] = useState(false);
  const [evidenceVersion,setEvidenceVersion] = useState(0), [comments,setComments] = useState([]), [activity,setActivity] = useState([]);
  const [comment,setComment] = useState(''), [finding,setFinding] = useState(null), [linked,setLinked] = useState(null);
  const riskBase=useRef(null);
  const generation = useRef(0);
  const shown = selected || current;
  const cid = current?.client_id || record?.client_id || clientId;
  const createRecord = useCreateIntent((...args) => api.post(...args), cid);
  const updateRecord = useCreateIntent((...args)=>api.patch(...args), `${user?.user_id}:${cid}:${record?.review_id}:update`, true);
  const createFinding = useCreateIntent(async (...args) => {
    try { return await api.post(...args); }
    catch(error) {
      // This command's identity is in the body, not only the transport header.
      if(error.response?.headers?.['x-create-rejected']==='true')setFinding(draft=>draft?.request_id===args[1].request_id?{...draft,request_id:recordUuid()}:draft);
      throw error;
    }
  }, `${cid}:${record?.review_id}:${finding?.request_id}`);
  const rid = shown?.review_id;
  const oid = selected?.occurrence_id || (shown ? occurrenceId(shown) : null);
  const frozen = !!selected || ['completed','cancelled'].includes(current?.status);
  const person = id => personLabel(members, id);

  useEffect(() => {
    if (!open) return;
    const sequence = generation;
    sequence.current++;
    setCurrent(record ? reviewView(record) : null);
    setForm(record ? {...record,due_date:record.due_date?.slice(0,10) || ''} : {title:'',review_type:'',owner_id:'',due_date:'',recurrence:'none',notes:''});
    setTab('Overview'); setSelected(initialValues?.occurrence || null); setRiskDraft(null);setRiskNext("");setRiskOutcome("Reviewed — No Change"); riskBase.current=null; setHistory([]); setComments([]); setActivity([]); setRelated({});
    setComment(''); setFinding(null); setLinked(null); setMembers([]);setPending(null);
    setEvaluation({});
    const version = generation.current;
    setBasisLoading(pilot ? !!record : true);setBasisError('');
    api.get(`/clients/${record?.client_id || clientId}/members`).then(({data}) => { if (generation.current === version) setMembers(data); }).catch(e => toast.error(formatError(e)));
    setPolicies([]);
    api.get('/policies',{params:{client_id:record?.client_id || clientId}}).then(({data})=>{if(generation.current===version)setPolicies(data);}).catch(e=>toast.error(formatError(e)));
    return () => { sequence.current++; };
  }, [open,record,clientId,initialValues?.occurrence,pilot]);

  const reload = useCallback(async () => {
    if (!open || !rid || !oid) return;
    const version = generation.current;
    try {
      const [h,r,c,a] = await Promise.all([
        api.get(`/reviews/${current.review_id}/history`),
        api.get('/related',{params:{entity_type:'reviews',entity_id:rid,...(selected ? {occurrence_id:oid} : {})}}),
        api.get('/comments',{params:{entity_type:'reviews',entity_id:rid,occurrence_id:oid}}),
        api.get(`/reviews/${rid}/activity`,{params:selected ? {occurrence_id:oid} : {}})
      ]);
      if (version !== generation.current) return;
      setHistory(h.data); setRelated(r.data);setBasisError('');
      if(current.risk_id) {const risk=r.data.risks?.find(x=>x.risk_id===current.risk_id); if(risk){const next={likelihood_score:risk.likelihood_score,impact_score:risk.impact_score,assessment_rationale:risk.assessment_rationale||'',treatment:risk.treatment||(pilot?'':'monitor')},base=riskBase.current;setRiskDraft(previous=>previous&&base?Object.fromEntries(Object.keys(next).map(k=>[k,previous[k]!==base[k]?previous[k]:next[k]])):next);riskBase.current=next;}} setEvidenceVersion(v=>v+1); setComments(c.data); setActivity(a.data);
    } catch(e) { if (version === generation.current) {setBasisError(formatError(e));toast.error(formatError(e));} }
    finally {if(version===generation.current)setBasisLoading(false);}
  }, [open,rid,oid,current?.review_id,current?.risk_id,selected,pilot]);
  useEffect(() => { reload(); },[reload]);
  useEffect(() => {
    if (!open || !['Related','Activity'].includes(tab)) return;
    const timer = setInterval(reload,10000);
    window.addEventListener('focus',reload);
    return () => { clearInterval(timer); window.removeEventListener('focus',reload); };
  },[open,tab,reload]);
  const run = async fn => {
    if (busy) return;
    setBusy(true);
    try { await fn(); } catch(e) { toast.error(formatError(e)); } finally { setBusy(false); }
  };
  function changes() {
    const fields = admin ? [...configFields.map(f => f.name),'notes','governance_context'] : ['notes'];
    return Object.fromEntries(fields.map(k => [k,k === 'custom_recurrence_days' ? (form[k] ? Number(form[k]) : null) : form[k] || null])
      .filter(([k,v]) => !current || (k === 'due_date' ? (current[k]?.slice(0,10) || null) !== v : JSON.stringify(current[k] || null) !== JSON.stringify(v))));
  }
  const draftProtected=pilot||cisReviewBriefs(current||record||{}).length>0||isIsoManagementReview(shown,related);
  const dirty=!frozen&&Object.values(evaluation).some(Boolean) || draftProtected && !frozen && (current ? Object.keys(changes()).length>0 : !!(form.title||form.review_type||form.owner_id||form.due_date||form.notes||form.governance_context||form.policy_id||form.custom_recurrence_days||form.recurrence&&form.recurrence!=='none')) ||
    draftProtected && (!!comment.trim()||!!finding||!!riskDraft&&JSON.stringify(riskDraft)!==JSON.stringify(riskBase.current)||!frozen&&!!current?.risk_id&&(riskOutcome!=="Reviewed — No Change"||!!riskNext));
  function leave(action,hasDraft=dirty) {
    if(draftProtected&&busy)return;
    if(hasDraft)setPending(()=>action);
    else action();
  }
  function close(value) { if(value)onOpenChange(true);else leave(()=>onOpenChange(false)); }
  useEffect(()=>{
    if(!open||!dirty)return undefined;
    const warn=e=>{e.preventDefault();e.returnValue='';};
    window.addEventListener('beforeunload',warn);
    return ()=>window.removeEventListener('beforeunload',warn);
  },[open,dirty]);
  async function saveChanges() {
    if(updateRecord.unconfirmed())throw new Error('Save is unconfirmed. Use Retry unconfirmed save before another edit or Review action.');
    const patch = changes();
    if (!current) {
      const {data} = await createRecord('/reviews',{...patch,client_id:cid});
      setCurrent(data); setForm({...data,due_date:data.due_date?.slice(0,10) || ''}); onSaved?.(); return data;
    }
    if (Object.keys(patch).length) {
      const {data} = await updateRecord(`/reviews/${current.review_id}`,{...patch,expected_occurrence_id:occurrenceId(current),expected_updated_at:current.updated_at??null});
      setCurrent(data); onSaved?.(); return data;
    }
    return current;
  }
  const lifecycle = action => run(async () => {
    if(draftProtected&&(comment.trim()||finding)) throw new Error('Post or discard the unfinished comment or Finding before starting or completing this Review.');
    const saved = await saveChanges();
    const {data} = await api.post(`/reviews/${saved.review_id}/${action}`,{occurrence_id:occurrenceId(saved),...(action==='complete'?evaluation:{}),...(action==='complete'&&saved.risk_id?{risk_assessment:pilot&&riskDraft?Object.fromEntries(Object.entries(riskDraft).filter(([k,v])=>(v??'')!==(riskBase.current?.[k]??''))):riskDraft||{},risk_outcome:riskOutcome,...(pilot&&riskNext?{risk_next_review:riskNext}:{})}:{})});
    const updated = data.review || data;
    setCurrent(updated); setForm({...updated,due_date:updated.due_date?.slice(0,10) || ''});
    if (data.occurrence) setHistory(items => [data.occurrence,...items.filter(o => o.occurrence_id !== data.occurrence.occurrence_id)]);
    setSelected(null); setRiskNext(''); setComment(''); onSaved?.();
    if(action==='complete')setEvaluation({});
    toast.success(action === 'start' ? 'Review started' : updated.status === 'completed' ? 'Completed and preserved in Review history' : 'Occurrence completed; next Review scheduled');
  });
  function picker(label,value,onChange,options,disabled=false,testId) {
    return <div className="space-y-1"><Label>{label}</Label><Select value={value || '__none__'} onValueChange={v => onChange(v === '__none__' ? '' : v)} disabled={disabled}>
      <SelectTrigger aria-label={label} data-testid={testId}><SelectValue /></SelectTrigger><SelectContent>
        <SelectItem value="__none__">{label.includes('Owner') ? 'Unassigned' : pilot&&label==='Risk treatment'?'Not Yet Decided':'Select…'}</SelectItem>
        {options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent></Select></div>;
  }
  const chooseHistory = o => leave(()=>{ setEvaluation({});if(draftProtected){setForm({...current,due_date:current.due_date?.slice(0,10)||''});setComment('');setFinding(null);setRiskDraft(riskBase.current);setRiskOutcome("Reviewed — No Change");setRiskNext('');} generation.current++; setSelected(o); setTab('Overview'); setComments([]); setActivity([]); });
  const configuration = selected || form;
  const derived = reviewSchedule(configuration);
  useEffect(()=>{setShowHistorical(false);},[rid,oid,open]);
  const remediation = reviewRemediation(related);
  const groups = remediation.groups.filter(({finding}) => showHistorical || finding.status !== 'closed');
  const allRelatedRows = Object.entries({...related,tasks:remediation.standaloneTasks}).flatMap(([kind,items]) => ['tasks','policies','vendors','risks','framework_assessments'].includes(kind) ? items.map(item => ({kind,item})) : []);
  const historicalCount = remediation.groups.filter(({finding})=>finding.status==='closed').length + allRelatedRows.filter(({kind,item})=>historicalRemediation(kind,item)).length;
  const relatedRows = allRelatedRows.filter(({kind,item})=>showHistorical || !historicalRemediation(kind,item));
  return <Dialog open={open} onOpenChange={close}>
    <DialogContent aria-modal="true" {...{
      onPointerDownOutside:e=>e.preventDefault(),
      onOpenAutoFocus:e=>{opener.current=document.activeElement;e.preventDefault();heading.current?.focus();},
      onCloseAutoFocus:e=>{e.preventDefault();const target=opener.current?.isConnected?opener.current:document.querySelector('[data-testid="reviews-search"]');target?.focus({preventScroll:true});}
    }}
      className="brawndo-cis-assessment approved-review-dialog bg-surface-card" data-testid="reviews-drawer">
      <DialogDescription className="sr-only">Conduct this Review, edit its schedule and assigned reviewer, and access evidence, related work and completion history.</DialogDescription>
      <SheetHeader className="px-6 py-4 pr-12 border-b border-line shrink-0">
        <div className="flex justify-between gap-3"><div>{(!pilot||selected)&&<div className="text-xs text-ink-help">{selected?'Historical occurrence':'Review'}</div>}<SheetTitle ref={heading} tabIndex={-1} data-review-title className="font-heading text-xl">{shown?.title || 'New review'}</SheetTitle>
          {!pilot&&shown && <div className="mt-2"><StatusBadge value={selected ? shown.status : reviewStatus(shown)} /></div>}</div>
          </div>
        <div className="flex gap-1 mt-3 -mb-3 overflow-x-auto">{(current?tabs:['Overview','Requirements']).map(t => <button key={t} data-testid={`tab-${t.toLowerCase()}`} className={`drawer-tab ${tab === t ? 'active' : ''}`} onClick={() => { setTab(t); if (t === 'Related' || t === 'Activity') reload(); }}>{t}</button>)}</div>
      </SheetHeader>
      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-5">
        {selected && <Button size="sm" variant="link" onClick={() => {generation.current++;setSelected(null);setTab('Overview');}}>Back to current Review</Button>}
        {tab === 'Overview' && <>
          <ReviewFacts record={shown} users={members} history={history} status={!pilot&&shown?reviewStatus(shown):undefined}/>
          {shown?.iso_audit&&<section className="border border-line rounded p-3 space-y-2 text-sm" aria-label="Audit workpapers">
            <h3 className="font-medium">{auditPackage(shown.iso_audit.package_key)?.title}</h3>
            <p>Cycle {shown.iso_audit.cycle} · {auditProgress(shown.iso_audit).complete} of {auditProgress(shown.iso_audit).total} workpapers complete</p>
            <p>Closure requires completed workpapers, Findings for recorded exceptions, and the issued report. Remediation remains independently tracked.</p>
            <a className="text-link underline" target="_blank" rel="noopener noreferrer" href={'/compliance/iso-27001?iso_view=audit&package='+encodeURIComponent(shown.iso_audit.package_key)+(selected?'&audit_occurrence='+encodeURIComponent(oid):'')}>Open {selected?'historical':'current'} audit workpapers in a new tab ↗</a>
          </section>}
          {selected?.iso_soa_snapshot&&<details className="border border-line rounded p-3 text-sm"><summary>Annex A SoA snapshot captured at completion</summary>
            <p className="my-2">{selected.iso_soa_snapshot.assessments.length} Annex A control records · captured {date(selected.iso_soa_snapshot.captured_at)}. This historical snapshot does not change with the current SoA. Necessary custom controls and a controlled complete SoA are outside this snapshot; inspect this occurrence's retained supporting records, not current Control design. A supporting link is not a completeness conclusion.</p>
            <ul className="divide-y divide-line">{selected.iso_soa_snapshot.assessments.map(a=><li className="py-2" key={a.framework_assessment_id}><strong>{a.definition_id}</strong> · {({included:'Applicable',excluded:'Not Applicable'})[a.soa_applicability]||'Undetermined'} · {({addressed:'Implemented',in_progress:'Partially Implemented',needs_attention:'Needs Validation',not_applicable:'Not Applicable'})[a.status]||'Not Assessed'}<p>{a.soa_justification}</p><p className="whitespace-pre-wrap">{a.implementation}</p></li>)}</ul>
          </details>}
          {current?.risk_id&&<section className="space-y-3 border border-line rounded-md p-3"><h3 className="font-medium text-sm">Risk reassessment</h3><p className="text-sm text-ink-secondary">Confirm the current assessment or record what changed. Use the linked Risk for acceptance, closure, and treatment work.</p>
            {selected?.risk_after?<div className="text-sm">{outcome(selected)} · Score {selected.risk_before?.risk_score??'—'} → {selected.risk_after.risk_score??'—'}<p>{selected.risk_after.assessment_rationale}</p><p>Treatment: {selected.risk_before?.treatment} → {selected.risk_after.treatment}</p></div>:riskDraft&&<><div className="grid grid-cols-2 gap-3">{['likelihood_score','impact_score'].map(k=><div key={k}>{picker(k==='likelihood_score'?'Risk likelihood':'Risk impact',String(riskDraft[k]||''),v=>setRiskDraft({...riskDraft,[k]:v?Number(v):null}),[1,2,3,4,5].map(n=>({value:String(n),label:String(n)})),frozen||!writable)}</div>)}</div><p className="text-sm">Score {assessedRisk(riskDraft).risk_score??'—'} · {assessedRisk(riskDraft).risk_level||'Needs assessment'}</p><Label>Assessment rationale</Label><Textarea aria-label="Review assessment rationale" disabled={frozen||!writable} value={riskDraft.assessment_rationale} onChange={e=>setRiskDraft({...riskDraft,assessment_rationale:e.target.value})}/>{picker('Risk treatment',riskDraft.treatment,v=>setRiskDraft({...riskDraft,treatment:v}),(pilot?Object.entries({...riskTreatments,...(riskDraft.treatment==='monitor'?{monitor:'Monitoring (legacy treatment)'}:{})}).filter(([v])=>v!=='accept'||riskDraft.treatment==='accept').map(([value,label])=>({value:value||'__none__',label})).filter(o=>o.value!=='__none__'):['mitigate','transfer','avoid','monitor',...(riskDraft.treatment==='accept'?['accept']:[])].map(v=>({value:v,label:v}))),frozen||!writable)}</>}
            {pilot&&!frozen&&<div className="space-y-2 text-sm"><p>Reviewer: {user?.name||user?.email}. The actual completion date is recorded when you complete the Review.</p><p>Next Review: {current.next_review_date?.slice(0,10)||'no recurring date'}, based on the scheduled due date and the selected cadence.</p>{['super_admin','platform_admin'].includes(user?.role)&&<Label>Next Review override (optional)<Input aria-label="Next Review override" type="date" value={riskNext} onChange={e=>setRiskNext(e.target.value)}/></Label>}</div>}
            {!frozen&&writable&&picker("Review recommendation",riskOutcome,setRiskOutcome,["Reviewed — No Change","Additional Action Required","Closure Recommended"].map(value=>({value,label:value})))}
            {selected?.risk_review_recommendation&&<p className="text-sm">{selected.risk_review_recommendation}</p>}
            {related.risks?.filter(r=>r.risk_id===current.risk_id).map(r=><Button key={r.risk_id} size="sm" variant="outline" onClick={()=>setLinked({kind:'risks',record:r})}>Open Risk · {r.display_id||r.title}</Button>)}
          </section>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {configFields.filter(f => (f.name !== 'custom_recurrence_days' || configuration.recurrence === 'custom') && (f.name !== 'policy_id' || !pilot && (configuration.review_type === 'policy' || configuration.policy_id))).map(field => {
              const f=field.name==='owner_id'?{...field,label:'Assigned Reviewer'}:field;
              const disabled = frozen || !admin, value = configuration[f.name] || '';
              if (f.type === 'policy') return <div key={f.name}>{picker(f.label,value,v=>setForm(p=>({...p,[f.name]:v})),policies.map(p=>({value:p.policy_id,label:p.title})),disabled || !!current,`field-${f.name}`)}</div>;
              if (f.type === 'user') return <div key={f.name}><Label>{f.label}</Label><AssigneeSelect showManagePeople={false} clientId={cid} label={f.label} value={value} onChange={v=>setForm(p=>({...p,[f.name]:v}))} disabled={disabled} users={members} testId={`field-${f.name}`}/></div>;
              if (f.type === 'select') return <div key={f.name}>{picker(f.label,value,v => setForm(p => ({...p,[f.name]:v})), [...f.options,...(value && !f.options.some(o => o.value === value) ? [{value,label:value}] : [])],disabled,`field-${f.name}`)}</div>;
              return <div key={f.name} className={f.name === 'title' ? 'sm:col-span-2' : ''}><Label htmlFor={`review-${f.name}`}>{f.label}</Label><Input id={`review-${f.name}`} type={f.type || 'text'} value={f.type === 'date' ? value.slice(0,10) : value} disabled={disabled} onChange={e => setForm(p => ({...p,[f.name]:e.target.value}))} data-testid={`field-${f.name}`} /></div>;
            })}
            <div><Label>Occurrence</Label><p className="text-sm py-2" data-testid="review-period">{selected?.period || derived.period}</p></div>
            <div><Label>Next Review Date</Label><p className="text-sm py-2" data-testid="review-next-date">{date(selected?.next_review_date || derived.next_review_date)}</p></div>
          </div>
          <div><Label htmlFor="review-notes">Notes</Label><Textarea id="review-notes" data-testid="field-notes" rows={5} value={(selected || form).notes || ''} disabled={frozen || !writable} onChange={e => setForm(p => ({...p,notes:e.target.value}))} /></div>
          {current&&<details className="border border-line rounded p-3 text-sm"><summary className="cursor-pointer font-medium">Review evaluation</summary>
            <p className="my-2 text-ink-secondary">Completion records the activity; Finding counts and effectiveness are separate. Notes, existing records or external references may support your judgment. A separate uploaded file is not required. Evaluation below is recorded when you complete this occurrence.</p>
            {frozen?(()=>{const recorded=selected||current.occurrences?.find(o=>o.occurrence_id===oid)||{};return <div className="space-y-2">{evaluationFields.map(([key,label])=>recorded[key]?<p key={key} className="whitespace-pre-wrap break-words"><strong>{label}: </strong>{recorded[key]}</p>:null)}{'checklist_confirmed' in recorded&&<p>Reviewer checklist confirmed: {recorded.checklist_confirmed?'Yes':'No'} (not an effectiveness conclusion)</p>}{!evaluationFields.some(([key])=>recorded[key])&&!('checklist_confirmed' in recorded)&&<p>No evaluation recorded for this occurrence.</p>}</div>;})():<fieldset disabled={!writable||busy} className="space-y-2">{evaluationFields.map(([key,label,max])=><label key={key} className="block">{label}<Textarea aria-label={label} maxLength={max} rows={key==='conclusion'?3:2} value={evaluation[key]||''} onChange={e=>setEvaluation(p=>({...p,[key]:e.target.value}))}/></label>)}<label className="flex gap-2 items-center"><input type="checkbox" checked={evaluation.checklist_confirmed||false} onChange={e=>setEvaluation(p=>({...p,checklist_confirmed:e.target.checked}))}/>Reviewer checklist confirmed (not an effectiveness conclusion)</label></fieldset>}
          </details>}
          {selected && <p className="text-sm">Completed {date(selected.completed_at || selected.completion_date)} by {selected.completed_by_name || person(selected.completed_by)} · {outcome(selected)}</p>}
          {current && !frozen && writable && <div className="flex flex-wrap gap-2">
            {current.status !== 'in_progress' && <Button size="sm" variant="outline" disabled={busy || current.status === 'needs_scheduling'} data-testid="review-start" onClick={() => lifecycle('start')}>Start Review</Button>}
            <Button size="sm" disabled={busy || current.status === 'needs_scheduling'} data-testid="review-complete" onClick={() => {
              // Brawndo: completion closes the occurrence and schedules the next one, so it is confirmed first.
              if(!pilot) return lifecycle('complete');
              if(comment.trim()||finding) return lifecycle('complete');
              setConfirmComplete(true);
            }}>Complete Review</Button>
            <Button size="sm" variant="outline" disabled={busy} data-testid="quick-create-finding" onClick={() => setFinding({request_id:recordUuid(),title:'',description:'',severity:'medium',owner_id:current.owner_id || '',due_date:'',remediation_title:'',remediation_plan:''})}>Raise Finding</Button>
          </div>}
          {current && !selected && <section className="border-t border-line pt-4" data-testid="review-history"><h3 className="font-medium text-sm mb-3">Review History</h3>
            {!history.length ? <p className="text-sm text-ink-help">No completed occurrences yet.</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{['Occurrence','Due','Completed','Completed By','Outcome'].map(t => <th className="text-left font-medium py-2 pr-3" key={t}>{t}</th>)}</tr></thead><tbody>{history.map(o => <tr key={o.occurrence_id} className="border-t border-line"><td className="py-2 pr-3"><button className="underline text-left" onClick={() => chooseHistory(o)}>{o.period}</button></td><td className="pr-3">{date(o.due_date)}</td><td className="pr-3">{date(o.completed_at)}</td><td className="pr-3">{o.completed_by_name || person(o.completed_by)}</td><td>{outcome(o)}</td></tr>)}</tbody></table></div>}
          </section>}
        </>}
        {tab === 'Requirements' && <>
          {pilot?<ReviewExpectations record={{...(selected||form),client_id:cid}} related={related} policies={policies} onOpen={setLinked} historical={!!selected} loading={basisLoading} error={basisError} disabled={frozen||!admin} onChange={governance_context=>setForm(p=>({...p,governance_context}))}
            policyPicker={!current&&form.review_type==='policy'?picker('Supporting policy',form.policy_id,v=>setForm(p=>({...p,policy_id:v})),policies.filter(p=>!(p.schedule_from_reviews&&p.next_review_date)).map(p=>({value:p.policy_id,label:p.title})),!admin):null}/>:
          <RequirementBasis kind="reviews" record={shown} related={related} onOpen={setLinked} historical={!!selected} loading={basisLoading} error={basisError} users={members} readable/>}
          {!pilot&&<GovernanceContextFields expanded value={(selected||form).governance_context} cadence disabled={frozen||!admin} onChange={governance_context=>setForm(p=>({...p,governance_context}))}/>}
          <CisReviewBrief record={{...current,...shown,client_id:cid}} historical={!!selected} onOpen={(r,target)=>{cisBriefOpener.current=target;setLinked({kind:'framework_assessments',record:r});}}/>
          <IsoManagementReviewGuide record={shown} related={related} historical={!!selected}/>
        </>}
        {tab === 'Related' && <>
          <p className="text-sm text-ink-secondary">{selected?'Linked records from this occurrence.':'Linked records across this Review’s occurrences.'} Statuses below are current; use Activity for the transition history.</p>
          {!!remediation.groups.length && <h3 className="text-sm font-medium">Findings &amp; Remediation</h3>}
          {historicalCount > 0 && <Button size="sm" variant="ghost" aria-pressed={showHistorical} onClick={()=>setShowHistorical(v=>!v)}>{showHistorical ? 'Hide completed / closed records' : `Show completed / closed records (${historicalCount})`}</Button>}
          <RemediationTickets records={{findings:groups.map(g=>g.finding),tasks:groups.flatMap(g=>g.actions),reviews:[current]}} clientId={cid} users={members} onOpen={setLinked} disabled={busy}/>
          {!relatedRows.length ? (!groups.length && <p className="text-sm text-ink-help">{historicalCount&&!showHistorical?'No outstanding remediation or other active related records.':'No related records.'}</p>) : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{['Type / ID','Item','Owner','Status / Completion','Due'].map(t => <th key={t} className="text-left py-2 pr-3">{t}</th>)}</tr></thead><tbody>{relatedRows.map(({kind,item}) => {
            const id = item[{tasks:'task_id',findings:'finding_id',policies:'policy_id',vendors:'vendor_id',risks:'risk_id',framework_assessments:'framework_assessment_id'}[kind]];
            return <tr key={id} className="border-t border-line"><td className="py-3 pr-3 text-xs">{{tasks:'Action Item',findings:'Finding',policies:'Policy',vendors:'Vendor',risks:'Risk',framework_assessments:'Framework Requirement'}[kind]}<button className="block underline break-all text-left" onClick={() => setLinked({kind,record:item})}>{id}</button></td><td className="pr-3"><button className="underline text-left" onClick={() => setLinked({kind,record:item})}>{item.title || item.name}</button></td><td className="pr-3">{person(item.assignee_id || item.owner_id)}</td><td className="pr-3"><StatusBadge value={kind==='tasks'&&item.status==='done'?'completed':item.status} />{(item.completed_at || item.closed_at || item.validated_at) && <div className="text-xs mt-1">{item.status === 'closed' ? 'Closed' : 'Completed'} {date(item.completed_at || item.closed_at || item.validated_at)} by {person(item.completed_by || item.closed_by || item.validated_by)}</div>}</td><td>{date(item.due_date)}</td></tr>;
          })}</tbody></table></div>}
        </>}
        {tab === 'Evidence' && <>
          {!frozen && writable && <Label className="block rounded-md border border-dashed border-line p-5 text-sm">Attach evidence to this occurrence<Input className="mt-2" type="file" multiple disabled={busy} data-testid="drawer-evidence-input" onChange={e => { const files = Array.from(e.target.files); run(async () => { for (const file of files) await api.post('/evidence',{client_id:cid,linked_type:'review',linked_id:rid,occurrence_id:oid,filename:file.name,mime_type:file.type,content_base64:await fileData(file)}); await reload(); toast.success('Evidence attached'); }); }} /></Label>}
          <EvidencePanel clientId={cid} kind="reviews" id={rid} occurrenceId={oid} refreshKey={evidenceVersion} allowLink={!frozen} onOpen={async ref=>{const version=generation.current;try{const target=await resolveEvidenceSource(ref,cid);if(version===generation.current)setLinked(target);}catch(e){toast.error(formatError(e));}}}/>
        </>}
        {tab === 'Comments' && <>
          {!comments.length && <p className="text-sm text-ink-help">No comments yet.</p>}
          {comments.map(c => <div key={c.comment_id} className="border border-line rounded-md p-3 text-sm"><div className="text-xs text-ink-help mb-2">{c.user_name || c.user_email} · {date(c.created_at)}</div><p className="whitespace-pre-wrap">{c.body}</p></div>)}
          {!frozen && writable && <><Textarea aria-label="Comment" data-testid="comment-input" value={comment} onChange={e => setComment(e.target.value)} placeholder="Add a comment…" /><Button size="sm" data-testid="comment-submit" disabled={busy || !comment.trim()} onClick={() => run(async () => { await api.post('/comments',{entity_type:'reviews',entity_id:rid,occurrence_id:oid,body:comment}); setComment(''); await reload(); })}>Post comment</Button></>}
        </>}
        {tab === 'Activity' && <>
          {!selected && <p className="text-sm text-ink-secondary">Major events across this Review's occurrences.</p>}
          {!activity.length && <p className="text-sm text-ink-help">No activity for this occurrence yet.</p>}
          {activity.map(a => <div key={a.log_id || a.audit_id} className="border-b border-line py-2 text-sm"><div className="text-xs text-ink-help">{new Date(a.at).toLocaleString()} · {a.meta?.by_name || a.user_name || a.user_email}</div><p>{a.action}{a.meta?.task_id ? ` · ${a.meta.task_id}` : a.meta?.finding_id ? ` · ${a.meta.finding_id}` : ''}{a.meta?.filename ? ` · ${a.meta.filename}` : ''}{a.meta?.due_date ? ` · ${date(a.meta.due_date)}` : ''}</p></div>)}
        </>}
      </div>
      <div className="px-6 py-3 border-t border-line bg-surface-subtle flex shrink-0 justify-end gap-2">{updateRecord.unconfirmed()&&<><p role="status">Save is unconfirmed. Retry the original save before another edit.</p><Button size="sm" disabled={busy||!writable} onClick={()=>run(async()=>{const {data}=await updateRecord.retry();setCurrent(data);await reload();onSaved?.();toast.success('Saved');})}>Retry unconfirmed save</Button></>}<Button variant="outline" size="sm" onClick={() => close(false)}>Close</Button>{!frozen && (current ? writable : admin) && ['Overview','Requirements'].includes(tab) && <Button size="sm" data-testid="drawer-save" disabled={busy || !form.title?.trim() || !form.review_type} onClick={() => run(async () => { await saveChanges(); await reload(); toast.success('Saved'); })}>{current ? 'Save changes' : 'Create'}</Button>}</div>
    </DialogContent>
    {<AlertDialog open={!!pending} onOpenChange={v=>{if(!v)setPending(null);}}>
      <AlertDialogContent><AlertDialogTitle>Leave unsaved changes?</AlertDialogTitle>
        <AlertDialogDescription>Saved records are unchanged. Keep editing, or discard the unfinished draft for this action.</AlertDialogDescription>
        <AlertDialogFooter><AlertDialogCancel>Keep editing</AlertDialogCancel><AlertDialogAction onClick={()=>{const action=pending;setPending(null);action?.();}}>Discard changes</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>}
    {pilot&&<AlertDialog open={confirmComplete} onOpenChange={setConfirmComplete}>
      <AlertDialogContent data-testid="review-complete-confirm"><AlertDialogTitle>Complete this review?</AlertDialogTitle>
        <AlertDialogDescription>This will close the current occurrence and schedule the next review according to its existing cadence.</AlertDialogDescription>
        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction data-testid="review-complete-confirmed" onClick={()=>{setConfirmComplete(false);lifecycle('complete');}}>Complete Review</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>}
    {linked && <RecordDrawer open kind={linked.kind} record={linked.record} clientId={cid} users={members} onOpenChange={v => {if (!v) {setLinked(null);reload();const target=cisBriefOpener.current;cisBriefOpener.current=null;if(target)requestAnimationFrame(()=>{if(target.isConnected)target.focus({preventScroll:true});});}}} onSaved={() => {reload();onSaved?.();}} />}
    <Sheet open={!!finding} onOpenChange={v => {if (!v) leave(()=>setFinding(null),true);}}>
      <SheetContent description="Describe the gap identified in this Review and the corrective Action required to address it." className="w-full sm:max-w-xl overflow-y-auto" data-testid="review-finding-form"><SheetHeader><SheetTitle>Raise Finding</SheetTitle></SheetHeader>
        {finding && <form className="mt-5 space-y-4" onSubmit={e => {e.preventDefault();run(async () => {await createFinding(`/reviews/${current.review_id}/create-finding`,{...finding,owner_id:finding.owner_id || null,occurrence_id:occurrenceId(current)});setFinding(null);await reload();onSaved?.();toast.success('Finding and Action Item created');});}}>
          <Label className="block">Finding title *<Input required data-testid="finding-title" value={finding.title} onChange={e => setFinding(p => ({...p,title:e.target.value}))} /></Label>
          <Label className="block">Description<Textarea value={finding.description} onChange={e => setFinding(p => ({...p,description:e.target.value}))} /></Label>
          {picker('Severity',finding.severity,v => setFinding(p => ({...p,severity:v})),SCHEMAS.findings.fields.find(f => f.name === 'severity').options)}
          <div><Label>Owner</Label><AssigneeSelect showManagePeople={false} clientId={cid} value={finding.owner_id} onChange={v=>setFinding(p=>({...p,owner_id:v}))} users={members}/></div>
          <Label className="block">Due date<Input type="date" value={finding.due_date} onChange={e => setFinding(p => ({...p,due_date:e.target.value}))} /></Label>
          <Label className="block">Corrective action *<Input required data-testid="finding-remediation-title" value={finding.remediation_title} onChange={e => setFinding(p => ({...p,remediation_title:e.target.value}))} /></Label>
          <Label className="block">Remediation notes<Textarea value={finding.remediation_plan} onChange={e => setFinding(p => ({...p,remediation_plan:e.target.value}))} /></Label>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => leave(()=>setFinding(null),true)}>Cancel</Button><Button type="submit" disabled={busy} data-testid="finding-save">Save finding and action</Button></div>
        </form>}
      </SheetContent>
    </Sheet>
  </Dialog>;
}
