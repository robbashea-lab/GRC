import { useCallback, useEffect, useRef, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, Download } from 'lucide-react';
import { toast } from 'sonner';
import api, { formatError } from '@/lib/api';
import { SCHEMAS } from '@/lib/schemas';
import { occurrenceId, reviewSchedule, reviewView } from '@/lib/reviewOccurrences';
import { useAuth } from '@/context/AuthContext';
import StatusBadge from './StatusBadge';
import RecordDrawer from './RecordDrawer';

const tabs = ['Overview','Related','Evidence','Comments','Activity'];
const configFields = SCHEMAS.reviews.fields.filter(f => ['title','review_type','owner_id','due_date','recurrence','custom_recurrence_days'].includes(f.name));
const date = value => value ? new Date(String(value).slice(0,10) + 'T00:00:00').toLocaleDateString() : '—';
const outcome = o => o.outcome === 'no_findings' ? 'No Findings' : o.outcome === 'findings_raised' ? `${o.finding_count} Finding${o.finding_count === 1 ? '' : 's'}` : 'Legacy completion';
const fileData = file => new Promise((resolve,reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file); });

export default function ReviewDrawer({open,onOpenChange,record,clientId,onSaved}) {
  const {user} = useAuth();
  const admin = ['super_admin','platform_admin'].includes(user?.role);
  const writable = admin || user?.role === 'client_contributor';
  const [current,setCurrent] = useState(null), [form,setForm] = useState({});
  const [history,setHistory] = useState([]), [selected,setSelected] = useState(null);
  const [tab,setTab] = useState('Overview'), [busy,setBusy] = useState(false);
  const [members,setMembers] = useState([]), [related,setRelated] = useState({});
  const [evidence,setEvidence] = useState([]), [comments,setComments] = useState([]), [activity,setActivity] = useState([]);
  const [comment,setComment] = useState(''), [finding,setFinding] = useState(null), [linked,setLinked] = useState(null);
  const generation = useRef(0);
  const shown = selected || current;
  const cid = current?.client_id || record?.client_id || clientId;
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
    setTab('Overview'); setSelected(null); setHistory([]); setEvidence([]); setComments([]); setActivity([]); setRelated({});
    setComment(''); setFinding(null); setLinked(null); setMembers([]);
    const version = generation.current;
    api.get(`/clients/${record?.client_id || clientId}/members`).then(({data}) => { if (generation.current === version) setMembers(data); }).catch(e => toast.error(formatError(e)));
    return () => { sequence.current++; };
  }, [open,record,clientId]);

  const reload = useCallback(async () => {
    if (!open || !rid || !oid) return;
    const version = generation.current;
    try {
      const [h,r,e,c,a] = await Promise.all([
        api.get(`/reviews/${current.review_id}/history`),
        api.get('/related',{params:{entity_type:'reviews',entity_id:rid,...(selected ? {occurrence_id:oid} : {})}}),
        api.get('/evidence',{params:{client_id:cid,linked_type:'review',linked_id:rid,occurrence_id:oid}}),
        api.get('/comments',{params:{entity_type:'reviews',entity_id:rid,occurrence_id:oid}}),
        api.get(`/reviews/${rid}/activity`,{params:selected ? {occurrence_id:oid} : {}})
      ]);
      if (version !== generation.current) return;
      setHistory(h.data); setRelated(r.data); setEvidence(e.data); setComments(c.data); setActivity(a.data);
    } catch(e) { if (version === generation.current) toast.error(formatError(e)); }
  }, [open,rid,oid,cid,current?.review_id,selected]);
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
      const {data} = await api.post('/reviews',{...patch,client_id:cid});
      setCurrent(data); setForm({...data,due_date:data.due_date?.slice(0,10) || ''}); onSaved?.(); return data;
    }
    if (Object.keys(patch).length) {
      const {data} = await api.patch(`/reviews/${current.review_id}`,{...patch,expected_occurrence_id:occurrenceId(current)});
      setCurrent(data); onSaved?.(); return data;
    }
    return current;
  }
  const lifecycle = action => run(async () => {
    const saved = await saveChanges();
    const {data} = await api.post(`/reviews/${saved.review_id}/${action}`,{occurrence_id:occurrenceId(saved)});
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
  const chooseHistory = o => { generation.current++; setSelected(o); setTab('Overview'); setEvidence([]); setComments([]); setActivity([]); };
  const configuration = selected || form;
  const derived = reviewSchedule(configuration);
  const relatedRows = Object.entries(related).flatMap(([kind,items]) => ['findings','tasks','policies','vendors','risks'].includes(kind) ? items.map(item => ({kind,item})) : []);
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {configFields.filter(f => f.name !== 'custom_recurrence_days' || configuration.recurrence === 'custom').map(f => {
              const disabled = frozen || !admin, value = configuration[f.name] || '';
              if (f.type === 'select' || f.type === 'user') return <div key={f.name}>{picker(f.label,value,v => setForm(p => ({...p,[f.name]:v})), f.type === 'user' ? members.map(m => ({value:m.user_id,label:m.name || m.email})) : [...f.options,...(value && !f.options.some(o => o.value === value) ? [{value,label:value}] : [])],disabled,`field-${f.name}`)}</div>;
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
            <Button size="sm" variant="outline" disabled={busy} data-testid="quick-create-finding" onClick={() => setFinding({request_id:crypto.randomUUID(),title:'',description:'',severity:'medium',owner_id:current.owner_id || '',due_date:'',remediation_title:'',remediation_plan:''})}>Raise Finding</Button>
          </div>}
          {current && !selected && <section className="border-t border-line pt-4" data-testid="review-history"><h3 className="font-medium text-sm mb-3">Review History</h3>
            {!history.length ? <p className="text-sm text-ink-help">No completed occurrences yet.</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{['Occurrence','Due','Completed','Completed By','Outcome'].map(t => <th className="text-left font-medium py-2 pr-3" key={t}>{t}</th>)}</tr></thead><tbody>{history.map(o => <tr key={o.occurrence_id} className="border-t border-line"><td className="py-2 pr-3"><button className="underline text-left" onClick={() => chooseHistory(o)}>{o.period}</button></td><td className="pr-3">{date(o.due_date)}</td><td className="pr-3">{date(o.completed_at)}</td><td className="pr-3">{o.completed_by_name || person(o.completed_by)}</td><td>{outcome(o)}</td></tr>)}</tbody></table></div>}
          </section>}
        </>}
        {tab === 'Related' && <>
          {!selected && <p className="text-sm text-ink-secondary">Linked records across this Review's occurrences.</p>}
          {!relatedRows.length ? <p className="text-sm text-ink-help">No related records.</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{['Type / ID','Item','Owner','Status / Completion','Due'].map(t => <th key={t} className="text-left py-2 pr-3">{t}</th>)}</tr></thead><tbody>{relatedRows.map(({kind,item}) => {
            const id = item.task_id || item.finding_id || item.policy_id || item.vendor_id || item.risk_id;
            return <tr key={id} className="border-t border-line"><td className="py-3 pr-3 text-xs">{kind === 'tasks' ? 'Action Item' : kind.slice(0,-1)}<button className="block underline break-all text-left" onClick={() => setLinked({kind,record:item})}>{id}</button></td><td className="pr-3"><button className="underline text-left" onClick={() => setLinked({kind,record:item})}>{item.title || item.name}</button></td><td className="pr-3">{person(item.assignee_id || item.owner_id)}</td><td className="pr-3"><StatusBadge value={item.status} />{(item.completed_at || item.closed_at || item.validated_at) && <div className="text-xs mt-1">{item.status === 'closed' ? 'Closed' : 'Completed'} {date(item.completed_at || item.closed_at || item.validated_at)} by {person(item.completed_by || item.closed_by || item.validated_by)}</div>}</td><td>{date(item.due_date)}</td></tr>;
          })}</tbody></table></div>}
        </>}
        {tab === 'Evidence' && <>
          {!frozen && writable && <Label className="block rounded-md border border-dashed border-line p-5 text-sm">Attach evidence to this occurrence<Input className="mt-2" type="file" multiple disabled={busy} data-testid="drawer-evidence-input" onChange={e => { const files = Array.from(e.target.files); run(async () => { for (const file of files) await api.post('/evidence',{client_id:cid,linked_type:'review',linked_id:rid,occurrence_id:oid,filename:file.name,mime_type:file.type,content_base64:await fileData(file)}); await reload(); toast.success('Evidence attached'); }); }} /></Label>}
          {!evidence.length && <p className="text-sm text-ink-help">No evidence attached.</p>}
          {evidence.map(e => <div key={e.evidence_id} className="border-b border-line py-2 flex justify-between gap-3 text-sm"><span>{e.filename}</span><Button size="sm" variant="ghost" aria-label={`Download ${e.filename}`} onClick={() => run(async () => { const {data} = await api.get(`/evidence/${e.evidence_id}/download`); const a = document.createElement('a'); a.href = data.content_base64.startsWith('data:') ? data.content_base64 : `data:${data.mime_type};base64,${data.content_base64}`; a.download = data.filename; a.click(); })}><Download className="h-4 w-4" /></Button></div>)}
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
          {picker('Owner',finding.owner_id,v => setFinding(p => ({...p,owner_id:v})),members.map(m => ({value:m.user_id,label:m.name || m.email})))}
          <Label className="block">Due date<Input type="date" value={finding.due_date} onChange={e => setFinding(p => ({...p,due_date:e.target.value}))} /></Label>
          <Label className="block">Corrective action *<Input required data-testid="finding-remediation-title" value={finding.remediation_title} onChange={e => setFinding(p => ({...p,remediation_title:e.target.value}))} /></Label>
          <Label className="block">Remediation notes<Textarea value={finding.remediation_plan} onChange={e => setFinding(p => ({...p,remediation_plan:e.target.value}))} /></Label>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setFinding(null)}>Cancel</Button><Button type="submit" disabled={busy} data-testid="finding-save">Save finding and action</Button></div>
        </form>}
      </SheetContent>
    </Sheet>
  </Sheet>;
}
