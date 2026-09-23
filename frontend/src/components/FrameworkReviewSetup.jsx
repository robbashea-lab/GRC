import {useState} from 'react';
import {Button} from './ui/button';
import {Input} from './ui/input';
import AssigneeSelect from './AssigneeSelect';
import api,{formatError} from '@/lib/api';
import {existingFrameworkReview} from '@/lib/frameworks';

export default function FrameworkReviewSetup({record,definition,catalog,reviews=[],users=[],clientId,writable,onSaved,onOpen,onDraftChange}){
  const plans=catalog.review_plans.filter(p=>p.safeguards.includes(definition.id));
  const [draft,setDraft]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const change=value=>{setDraft(value);onDraftChange?.(!!value);};
  const selectPlan=key=>{const p=plans.find(p=>p.key===key);change({plan_key:key||null,title:p?.title||definition.title+' review',owner_id:record.owner_id||null,recurrence:p?.default_cadence||'quarterly',due_date:'',review_id:(p?existingFrameworkReview(reviews,p)?.review_id:null)||''});};
  async function save(){setBusy(true);setError('');try{const {data}=await api.post(`/framework_assessments/${record.framework_assessment_id}/reviews`,{...draft,review_id:draft.review_id||null});change(null);onSaved?.(data);}catch(e){setError(formatError(e));}finally{setBusy(false);}}
  return <section className="space-y-3 text-sm" aria-label="Linked governance Reviews">
    {reviews.filter(r=>(record.related_links||[]).some(l=>l.kind==='reviews'&&l.id===r.review_id)||(r.framework_key===record.framework_key&&r.framework_safeguards?.includes(definition.id))).map(r=><div key={r.review_id} className="border-l-2 border-line pl-3"><button className="text-link font-medium" onClick={()=>onOpen(r)}>{r.title}</button><p className="text-xs text-ink-secondary">Actual cadence: {r.recurrence} · Next: {r.due_date?.slice(0,10)||'Needs scheduling'} · Last completed: {r.occurrences?.at(-1)?.completed_at?.slice(0,10)||'Not recorded'}</p></div>)}
    {writable&&!draft&&<Button variant="outline" size="sm" onClick={()=>selectPlan(plans[0]?.key||'')}>Create or link recurring Review</Button>}
    {draft&&<fieldset disabled={busy} className="border border-line rounded-lg p-4 space-y-3"><legend className="font-semibold px-1">Recurring Review setup</legend>
      {plans.length>0&&<label className="block">Governance activity<select aria-label="Governance activity" className="block w-full border border-line rounded p-2 bg-surface-card" value={draft.plan_key||''} onChange={e=>selectPlan(e.target.value)}>{plans.map(p=><option key={p.key} value={p.key}>{p.title}</option>)}<option value="">Organization-defined activity</option></select></label>}
      <p className="text-xs text-ink-secondary">Related requirements: {(plans.find(p=>p.key===draft.plan_key)?.safeguards||[definition.id]).join(', ')}. One Review supports all these mappings. Existing equivalent Reviews are reused without changing their schedules.</p>
      <label className="block">Use existing Review<select aria-label="Use existing Review" className="block w-full border border-line rounded p-2 bg-surface-card" value={draft.review_id} onChange={e=>change({...draft,review_id:e.target.value})}><option value="">Create a normal Review</option>{reviews.map(r=><option key={r.review_id} value={r.review_id}>{r.title}</option>)}</select></label>
      {!draft.review_id&&<><label className="block">Review title<Input aria-label="Review title" maxLength={500} value={draft.title} onChange={e=>change({...draft,title:e.target.value})}/></label><AssigneeSelect clientId={clientId} label="Review Owner" users={users} value={draft.owner_id} onChange={owner_id=>change({...draft,owner_id})}/><div className="grid sm:grid-cols-2 gap-3"><label>Review cadence<select aria-label="Review cadence" className="block w-full border border-line rounded p-2 bg-surface-card" value={draft.recurrence} onChange={e=>change({...draft,recurrence:e.target.value})}>{['monthly','quarterly','semiannual','annual'].map(c=><option key={c}>{c}</option>)}</select></label><label>Next due<Input aria-label="Next due" type="date" value={draft.due_date} onChange={e=>change({...draft,due_date:e.target.value})}/></label></div><p className="text-xs text-ink-secondary">The organization approves this schedule. Operational source duties may be more frequent than this governance Review. No date leaves the Review needing scheduling.</p></>}
      {error&&<p role="alert">{error}</p>}<div className="flex gap-2"><Button onClick={save}>{busy?'Saving…':'Save Review'}</Button><Button variant="ghost" onClick={()=>change(null)}>Cancel Review setup</Button></div>
    </fieldset>}
  </section>;
}
