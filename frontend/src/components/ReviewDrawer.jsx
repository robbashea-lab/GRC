
import { useCallback, useEffect, useRef, useState } from 'react';
import {useCreateIntent} from '@/lib/createIntent';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import api, { formatError } from '@/lib/api';
import { SCHEMAS } from '@/lib/schemas';
import { FRAMEWORKS } from '@/lib/frameworks';
import { occurrenceId, reviewSchedule, reviewView } from '@/lib/reviewOccurrences';
import { useAuth } from '@/context/AuthContext';
import AssigneeSelect from './AssigneeSelect';
import {assessedRisk} from '@/lib/grcWork';
import {recordUuid} from '@/lib/recordUuid';
import StatusBadge from './StatusBadge';
import RecordDrawer from './RecordDrawer';
import { historicalRemediation, reviewRemediation, remediationOrigin } from '@/lib/remediation';
import CorrectiveActions from './CorrectiveActions';
import EvidencePanel from './EvidencePanel';
import {resolveEvidenceSource} from '@/lib/evidenceContext';

const tabs = ['Overview','Related','Evidence','Comments','Activity'];
const configFields = SCHEMAS.reviews.fields.filter(f => ['title','review_type','policy_id','owner_id','due_date','recurrence','custom_recurrence_days'].includes(f.name));
const date = value => value ? new Date(String(value).slice(0,10) + 'T00:00:00').toLocaleDateString() : '—';
const outcome = o => o.outcome === 'no_findings' ? 'No Findings' : o.outcome === 'findings_raised' ? `${o.finding_count} Finding${o.finding_count === 1 ? '' : 's'}` : o.outcome || 'Legacy completion';
const fileData = file => new Promise((resolve,reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file); });

export default function ReviewDrawer({open,onOpenChange,record,clientId,onSaved,initialValues}) {
  const {user} = useAuth();
  const admin = ['super_admin','platform_admin'].includes(user?.role);
  const writable = admin || user?.role === 'client_contributor';
  const [riskDraft,setRiskDraft] = useState(null);
  const [riskOutcome,setRiskOutcome]=useState("Reviewed — No Change");
  const [current,setCurrent] = useState(null), [form,setForm] = useState({});
  const [history,setHistory] = useState([]), [selected,setSelected] = useState(null);
  const [tab,setTab] = useState('Overview'), [busy,setBusy] = useState(false);
  const [members,setMembers] = useState([]), [related,setRelated] = useState({});
  const [policies,setPolicies] = useState([]);
  const [showHistorical,setShowHistorical] = useState(false);
  const [evidenceVersion,setEvidenceVersion] = useState(0), [comments,setComments] = useState([]), [activity,setActivity] = useState([]);
  const [comment,setComment] = useState(''), [finding,setFinding] = useState(null), [linked,setLinked] = useState(null);
  const riskBase=useRef(null);
  const generation = useRef(0);
  const shown = selected || current;
  const cid = current?.client_id || record?.client_id || clientId;
  const createRecord = useCreateIntent((...args) => api.post(...args), cid);
  const rid = shown?.review_id;
  const oid = selected?.occurrence_id || (shown ? occurrenceId(shown) : null);
  const frozen = !!selected || ['completed','cancelled'].includes(current?.status);
  const person = id => members.find(m => m.user_id === id)?.name || members.find(m => m.user_id === id)?.email || id || 'Unassigned';

  useEffect(() => {
    if (!open) return;
    const sequence = generation;
    sequence.current++;
    setCurrent(record ? reviewView(record) : null);
    setForm(record ? {...record,due_date:record.due_date?.slice(0,10) || ''} : {title:'',review_type:'',owner_id:'',due_date:'',recurrence:'none',notes:''});
    setTab('Overview'); setSelected(initialValues?.occurrence || null); setRiskDraft(null);setRiskOutcome("Reviewed — No Change"); riskBase.current=null; setHistory([]); setComments([]); setActivity([]); setRelated({});
    setComment(''); setFinding(null); setLinked(null); setMembers([]);
    const version = generation.current;
    api.get(`/clients/${record?.client_id || clientId}/members`).then(({data}) => { if (generation.current === version) setMembers(data); }).catch(e => toast.error(formatError(e)));
    setPolicies([]);
    api.get('/policies',{params:{client_id:record?.client_id || clientId}}).then(({data})=>{if(generation.current===version)setPolicies(data);}).catch(e=>toast.error(formatError(e)));
    return () => { sequence.current++; };
  }, [open,record,clientId,initialValues?.occurrence]);

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
      setHistory(h.data); setRelated(r.data);
      if(current.risk_id) {const risk=r.data.risks?.find(x=>x.risk_id===current.risk_id); if(risk){const next={likelihood_score:risk.likelihood_score,impact_score:risk.impact_score,assessment_rationale:risk.assessment_rationale||'',treatment:risk.treatment||'monitor'},base=riskBase.current;setRiskDraft(previous=>previous&&base?Object.fromEntries(Object.keys(next).map(k=>[k,previous[k]!==base[k]?previous[k]:next[k]])):next);riskBase.current=next;}} setEvidenceVersion(v=>v+1); setComments(c.data); setActivity(a.data);
    } catch(e) { if (version === generation.current) toast.error(formatError(e)); }
  }, [open,rid,oid,current?.review_id,current?.risk_id,selected]);
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
    const fields = admin ? [...configFields.map(f => f.name),'notes'] : ['notes'];
    return Object.fromEntries(fields.map(k => [k,k === 'custom_recurrence_days' ? (form[k] ? Number(form[k]) : null) : form[k] || null])
      .filter(([k,v]) => !current || (k === 'due_date' ? (current[k]?.slice(0,10) || null) !== v : (current[k] || null) !== v)));
  }
  async function saveChanges() {
    const patch = changes();
    if (!current) {
      const {data} = await createRecord('/reviews',{...patch,client_id:cid});
      setCurrent(data); setForm({...data,due_date:data.due_date?.slice(0,10) || ''}); onSaved?.(); return data;
    }
    if (Object.keys(patch).length) {
      const {data} = await api.patch(`/reviews/${current.review_id}`,{...patch,expected_occurrence_id:occurrenceId(current),expected_updated_at:current.updated_at??null});
      setCurrent(data); onSaved?.(); return data;
    }
    return current;
  }
  const lifecycle = action => run(async () => {
    const saved = await saveChanges();
    const {data} = await api.post(`/reviews/${saved.review_id}/${action}`,{occurrence_id:occurrenceId(saved),...(action==='complete'&&saved.risk_id?{risk_assessment:riskDraft||{},risk_outcome:riskOutcome}:{})});
    const updated = data.review || data;
    setCurrent(updated); setForm({...updated,due_date:updated.due_date?.slice(0,10) || ''});
    if (data.occurrence) setHistory(items => [data.occurrence,...items.filter(o => o.occurrence_id !== data.occurrence.occurrence_id)]);
    setSelected(null); setComment(''); onSaved?.();
    toast.success(action === 'start' ? 'Review started' : updated.status === 'completed' ? 'Completed and preserved in Review history' : 'Occurrence completed; next Review scheduled');
  });
  function picker(label,value,onChange,options,disabled=false,testId) {
    return <div className="space-y-1"><Label>{label}</Label><Select value={value || '__none__'} onValueChange={v => onChange(v === '__none__' ? '' : v)} disabled={disabled}>
      <SelectTrigger aria-label={label} data-testid={testId}><SelectValue /></SelectTrigger><SelectContent>
        <SelectItem value="__none__">{label.includes('Owner') ? 'Unassigned' : 'Select…'}</SelectItem>
        {options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent></Select></div>;
  }
  const chooseHistory = o => { generation.current++; setSelected(o); setTab('Overview'); setComments([]); setActivity([]); };
  const configuration = selected || form;
  const derived = reviewSchedule(configuration);
  useEffect(()=>{setShowHistorical(false);},[rid,oid,open]);
  const remediation = reviewRemediation(related);
  const groups = remediation.groups.filter(({finding}) => showHistorical || finding.status !== 'closed');
  const allRelatedRows = Object.entries({...related,tasks:remediation.standaloneTasks}).flatMap(([kind,items]) => ['tasks','policies','vendors','risks','framework_assessments'].includes(kind) ? items.map(item => ({kind,item})) : []);
  const historicalCount = remediation.groups.filter(({finding})=>finding.status==='closed').length + allRelatedRows.filter(({kind,item})=>historicalRemediation(kind,item)).length;
  const relatedRows = allRelatedRows.filter(({kind,item})=>showHistorical || !historicalRemediation(kind,item));
  return <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent className="record-drawer w-full sm:max-w-2xl p-0 flex flex-col" data-testid="reviews-drawer">
      <SheetHeader className="px-6 py-4 border-b border-line">
        <div className="flex justify-between gap-3"><div><div className="text-xs text-ink-help">Review {selected ? '· Historical occurrence' : ''}</div><SheetTitle className="font-heading text-xl">{shown?.title || 'New review'}</SheetTitle>
          {shown && <div className="mt-2"><StatusBadge value={shown.status} /></div>}</div>
          <button aria-label="Close record" data-testid="drawer-close" onClick={() => onOpenChange(false)}><X className="h-4 w-4" /></button></div>
        {current && <div className="flex gap-1 mt-3 -mb-3 overflow-x-auto">{tabs.map(t => <button key={t} data-testid={`tab-${t.toLowerCase()}`} className={`drawer-tab ${tab === t ? 'active' : ''}`} onClick={() => { setTab(t); if (t === 'Related' || t === 'Activity') reload(); }}>{t}</button>)}</div>}
      </SheetHeader>
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
        {selected && <Button size="sm" variant="link" onClick={() => {generation.current++;setSelected(null);setTab('Overview');}}>Back to current Review</Button>}
        {tab === 'Overview' && <>
          {shown?.framework_key && <section className="rounded-md border border-line p-3 space-y-2 text-sm"><h3 className="font-medium">{FRAMEWORKS.find(f=>f.key===shown.framework_key)?.label||shown.framework_key} · {shown.framework_version}</h3><p>Requirements: {shown.framework_safeguards?.join(', ')}</p><p>{shown.framework_basis}</p>{shown.framework_purpose&&<p>{shown.framework_purpose}</p>}{shown.framework_evidence_expectations&&<p>Evidence: {shown.framework_evidence_expectations}</p>}{shown.framework_completion_criteria&&<p>Completion: {shown.framework_completion_criteria}</p>}<p>Source cadence: {shown.framework_source_cadence}</p><p>Omnisciente default: {shown.framework_default_cadence} · Client cadence: {shown.recurrence || 'Not scheduled'}</p>{shown.framework_driver_active===false&&<p className="text-ink-secondary">Historical mapping retained; no longer an active onboarding driver.</p>}</section>}
          {current?.risk_id&&<section className="space-y-3 border border-line rounded-md p-3"><h3 className="font-medium text-sm">Risk reassessment</h3><p className="text-sm text-ink-secondary">Confirm the current assessment or record what changed. Use the linked Risk for acceptance, closure, and treatment work.</p>
            {selected?.risk_after?<div className="text-sm">{outcome(selected)} · Score {selected.risk_before?.risk_score??'—'} → {selected.risk_after.risk_score??'—'}<p>{selected.risk_after.assessment_rationale}</p><p>Treatment: {selected.risk_before?.treatment} → {selected.risk_after.treatment}</p></div>:riskDraft&&<><div className="grid grid-cols-2 gap-3">{['likelihood_score','impact_score'].map(k=><div key={k}>{picker(k==='likelihood_score'?'Risk likelihood':'Risk impact',String(riskDraft[k]||''),v=>setRiskDraft({...riskDraft,[k]:v?Number(v):null}),[1,2,3,4,5].map(n=>({value:String(n),label:String(n)})),frozen||!writable)}</div>)}</div><p className="text-sm">Score {assessedRisk(riskDraft).risk_score??'—'} · {assessedRisk(riskDraft).risk_level||'Needs assessment'}</p><Label>Assessment rationale</Label><Textarea aria-label="Review assessment rationale" disabled={frozen||!writable} value={riskDraft.assessment_rationale} onChange={e=>setRiskDraft({...riskDraft,assessment_rationale:e.target.value})}/>{picker('Risk treatment',riskDraft.treatment,v=>setRiskDraft({...riskDraft,treatment:v}),['mitigate','transfer','avoid','monitor',...(riskDraft.treatment==='accept'?['accept']:[])].map(v=>({value:v,label:v})),frozen||!writable)}</>}
            {!frozen&&writable&&picker("Review recommendation",riskOutcome,setRiskOutcome,["Reviewed — No Change","Additional Action Required","Closure Recommended"].map(value=>({value,label:value})))}
            {selected?.risk_review_recommendation&&<p className="text-sm">{selected.risk_review_recommendation}</p>}
            {related.risks?.filter(r=>r.risk_id===current.risk_id).map(r=><Button key={r.risk_id} size="sm" variant="outline" onClick={()=>setLinked({kind:'risks',record:r})}>Open Risk · {r.display_id||r.title}</Button>)}
          </section>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {configFields.filter(f => (f.name !== 'custom_recurrence_days' || configuration.recurrence === 'custom') && (f.name !== 'policy_id' || configuration.review_type === 'policy' || configuration.policy_id)).map(f => {
              const disabled = frozen || !admin, value = configuration[f.name] || '';
              if (f.type === 'policy') return <div key={f.name}>{picker(f.label,value,v=>setForm(p=>({...p,[f.name]:v})),policies.map(p=>({value:p.policy_id,label:p.title})),disabled || !!current,`field-${f.name}`)}</div>;
              if (f.type === 'user') return <div key={f.name}><Label>{f.label}</Label><AssigneeSelect clientId={cid} label={f.label} value={value} onChange={v=>setForm(p=>({...p,[f.name]:v}))} disabled={disabled} users={members} testId={`field-${f.name}`}/></div>;
              if (f.type === 'select') return <div key={f.name}>{picker(f.label,value,v => setForm(p => ({...p,[f.name]:v})), [...f.options,...(value && !f.options.some(o => o.value === value) ? [{value,label:value}] : [])],disabled,`field-${f.name}`)}</div>;
              return <div key={f.name} className={f.name === 'title' ? 'sm:col-span-2' : ''}><Label htmlFor={`review-${f.name}`}>{f.label}</Label><Input id={`review-${f.name}`} type={f.type || 'text'} value={f.type === 'date' ? value.slice(0,10) : value} disabled={disabled} onChange={e => setForm(p => ({...p,[f.name]:e.target.value}))} data-testid={`field-${f.name}`} /></div>;
            })}
            <div><Label>Occurrence</Label><p className="text-sm py-2" data-testid="review-period">{selected?.period || derived.period}</p></div>
            <div><Label>Next Review Date</Label><p className="text-sm py-2" data-testid="review-next-date">{date(selected?.next_review_date || derived.next_review_date)}</p></div>
          </div>
          <div><Label htmlFor="review-notes">Notes</Label><Textarea id="review-notes" data-testid="field-notes" rows={5} value={(selected || form).notes || ''} disabled={frozen || !writable} onChange={e => setForm(p => ({...p,notes:e.target.value}))} /></div>
          {selected && <p className="text-sm">Completed {date(selected.completed_at || selected.completion_date)} by {selected.completed_by_name || person(selected.completed_by)} · {outcome(selected)}</p>}
          {current && !frozen && writable && <div className="flex flex-wrap gap-2">
            {current.status !== 'in_progress' && <Button size="sm" variant="outline" disabled={busy || current.status === 'needs_scheduling'} data-testid="review-start" onClick={() => lifecycle('start')}>Start Review</Button>}
            <Button size="sm" disabled={busy || current.status === 'needs_scheduling'} data-testid="review-complete" onClick={() => lifecycle('complete')}>Complete Review</Button>
            <Button size="sm" variant="outline" disabled={busy} data-testid="quick-create-finding" onClick={() => setFinding({request_id:recordUuid(),title:'',description:'',severity:'medium',owner_id:current.owner_id || '',due_date:'',remediation_title:'',remediation_plan:''})}>Raise Finding</Button>
          </div>}
          {current && !selected && <section className="border-t border-line pt-4" data-testid="review-history"><h3 className="font-medium text-sm mb-3">Review History</h3>
            {!history.length ? <p className="text-sm text-ink-help">No completed occurrences yet.</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{['Occurrence','Due','Completed','Completed By','Outcome'].map(t => <th className="text-left font-medium py-2 pr-3" key={t}>{t}</th>)}</tr></thead><tbody>{history.map(o => <tr key={o.occurrence_id} className="border-t border-line"><td className="py-2 pr-3"><button className="underline text-left" onClick={() => chooseHistory(o)}>{o.period}</button></td><td className="pr-3">{date(o.due_date)}</td><td className="pr-3">{date(o.completed_at)}</td><td className="pr-3">{o.completed_by_name || person(o.completed_by)}</td><td>{outcome(o)}</td></tr>)}</tbody></table></div>}
          </section>}
        </>}
        {tab === 'Related' && <>
          <p className="text-sm text-ink-secondary">{selected?'Linked records from this occurrence.':'Linked records across this Review’s occurrences.'} Statuses below are current; use Activity for the transition history.</p>
          {!!remediation.groups.length && <h3 className="text-sm font-medium">Findings &amp; Remediation</h3>}
          {historicalCount > 0 && <Button size="sm" variant="ghost" aria-pressed={showHistorical} onClick={()=>setShowHistorical(v=>!v)}>{showHistorical ? 'Hide completed / closed records' : `Show completed / closed records (${historicalCount})`}</Button>}
          {groups.map(({finding,actions})=><section key={finding.finding_id} data-testid="review-remediation-group" className="border border-line rounded-md p-3 space-y-3 text-sm">
            <div><span className="text-ink-secondary">Finding: </span><button className="underline text-left font-medium" onClick={()=>setLinked({kind:'findings',record:finding})}>{finding.title}</button><div className="mt-1">Current Finding Status: <StatusBadge value={finding.status}/></div><p className="text-xs text-ink-secondary mt-1">Origin: {remediationOrigin(finding,current,history)}</p></div>
            <CorrectiveActions actions={actions} members={members} onOpen={action=>setLinked({kind:'tasks',record:action})} itemTestId="review-corrective-action"/>
            {(finding.validated_at || finding.closed_at) && <div className="text-xs text-ink-help">Closed {date(finding.closed_at || finding.validated_at)} by {person(finding.closed_by || finding.validated_by)}</div>}
          </section>)}
          {!relatedRows.length ? (!groups.length && <p className="text-sm text-ink-help">{historicalCount&&!showHistorical?'No outstanding remediation or other active related records.':'No related records.'}</p>) : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{['Type / ID','Item','Owner','Status / Completion','Due'].map(t => <th key={t} className="text-left py-2 pr-3">{t}</th>)}</tr></thead><tbody>{relatedRows.map(({kind,item}) => {
            const id = item[{tasks:'task_id',findings:'finding_id',policies:'policy_id',vendors:'vendor_id',risks:'risk_id',framework_assessments:'framework_assessment_id'}[kind]];
            return <tr key={id} className="border-t border-line"><td className="py-3 pr-3 text-xs">{{tasks:'Action Item',findings:'Finding',policies:'Policy',vendors:'Vendor',risks:'Risk',framework_assessments:'Framework Requirement'}[kind]}<button className="block underline break-all text-left" onClick={() => setLinked({kind,record:item})}>{id}</button></td><td className="pr-3"><button className="underline text-left" onClick={() => setLinked({kind,record:item})}>{item.title || item.name}</button></td><td className="pr-3">{person(item.assignee_id || item.owner_id)}</td><td className="pr-3"><StatusBadge value={kind==='tasks'&&item.status==='done'?'completed':item.status} />{(item.completed_at || item.closed_at || item.validated_at) && <div className="text-xs mt-1">{item.status === 'closed' ? 'Closed' : 'Completed'} {date(item.completed_at || item.closed_at || item.validated_at)} by {person(item.completed_by || item.closed_by || item.validated_by)}</div>}</td><td>{date(item.due_date)}</td></tr>;
          })}</tbody></table></div>}
        </>}
        {tab === 'Evidence' && <>
          {!frozen && writable && <Label className="block rounded-md border border-dashed border-line p-5 text-sm">Attach evidence to this occurrence<Input className="mt-2" type="file" multiple disabled={busy} data-testid="drawer-evidence-input" onChange={e => { const files = Array.from(e.target.files); run(async () => { for (const file of files) await api.post('/evidence',{client_id:cid,linked_type:'review',linked_id:rid,occurrence_id:oid,filename:file.name,mime_type:file.type,content_base64:await fileData(file)}); await reload(); toast.success('Evidence attached'); }); }} /></Label>}
          <EvidencePanel clientId={cid} kind="reviews" id={rid} occurrenceId={oid} refreshKey={evidenceVersion} onOpen={async ref=>{const version=generation.current;try{const target=await resolveEvidenceSource(ref,cid);if(version===generation.current)setLinked(target);}catch(e){toast.error(formatError(e));}}}/>
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
      <div className="px-6 py-3 border-t border-line bg-surface-subtle flex justify-end gap-2"><Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Close</Button>{!frozen && (current ? writable : admin) && tab === 'Overview' && <Button size="sm" data-testid="drawer-save" disabled={busy || !form.title?.trim() || !form.review_type} onClick={() => run(async () => { await saveChanges(); await reload(); toast.success('Saved'); })}>{current ? 'Save changes' : 'Create'}</Button>}</div>
    </SheetContent>
    {linked && <RecordDrawer open kind={linked.kind} record={linked.record} clientId={cid} users={members} onOpenChange={v => {if (!v) {setLinked(null);reload();}}} onSaved={() => {reload();onSaved?.();}} />}
    <Sheet open={!!finding} onOpenChange={v => {if (!v) setFinding(null);}}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto" data-testid="review-finding-form"><SheetHeader><SheetTitle>Raise Finding</SheetTitle></SheetHeader>
        {finding && <form className="mt-5 space-y-4" onSubmit={e => {e.preventDefault();run(async () => {await api.post(`/reviews/${current.review_id}/create-finding`,{...finding,owner_id:finding.owner_id || null,occurrence_id:occurrenceId(current)});setFinding(null);await reload();onSaved?.();toast.success('Finding and Action Item created');});}}>
          <Label className="block">Finding title *<Input required data-testid="finding-title" value={finding.title} onChange={e => setFinding(p => ({...p,title:e.target.value}))} /></Label>
          <Label className="block">Description<Textarea value={finding.description} onChange={e => setFinding(p => ({...p,description:e.target.value}))} /></Label>
          {picker('Severity',finding.severity,v => setFinding(p => ({...p,severity:v})),SCHEMAS.findings.fields.find(f => f.name === 'severity').options)}
          <div><Label>Owner</Label><AssigneeSelect clientId={cid} value={finding.owner_id} onChange={v=>setFinding(p=>({...p,owner_id:v}))} users={members}/></div>
          <Label className="block">Due date<Input type="date" value={finding.due_date} onChange={e => setFinding(p => ({...p,due_date:e.target.value}))} /></Label>
          <Label className="block">Corrective action *<Input required data-testid="finding-remediation-title" value={finding.remediation_title} onChange={e => setFinding(p => ({...p,remediation_title:e.target.value}))} /></Label>
          <Label className="block">Remediation notes<Textarea value={finding.remediation_plan} onChange={e => setFinding(p => ({...p,remediation_plan:e.target.value}))} /></Label>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setFinding(null)}>Cancel</Button><Button type="submit" disabled={busy} data-testid="finding-save">Save finding and action</Button></div>
        </form>}
      </SheetContent>
    </Sheet>
  </Sheet>;
}
