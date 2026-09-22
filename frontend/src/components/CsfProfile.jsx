import {Textarea} from './ui/textarea';
import {EMPTY_CSF_PROFILE,CSF_GAPS,CSF_STATUSES} from '@/lib/csfProfile';
const SELECT='w-full border border-line bg-surface-card rounded p-2 text-sm';
export default function CsfProfile({value,current,onChange}){
  const p={...EMPTY_CSF_PROFILE,...value},set=(k,v)=>onChange({...p,[k]:v});
  return <section className="space-y-4 text-sm">
    <h3 className="font-semibold">Current and Target Profiles</h3>
    <p className="text-xs text-ink-secondary">Client-wide outcome profile. Current practice comes from this assessment. Targets and gaps are explicit management decisions, not computed maturity scores. Use linked Findings and Actions to manage remediation.</p>
    <div className="border border-line rounded p-3"><h4 className="font-medium">Current Profile · {CSF_STATUSES[current.status]}</h4><p className="mt-2 whitespace-pre-wrap">{current.implementation||'Current practice has not been documented. Use Implementation to assess it.'}</p></div>
    <label className="flex gap-2 items-center"><input type="checkbox" checked={p.target_selected} onChange={e=>set('target_selected',e.target.checked)}/>Include in Target Profile</label>
    <label className="block">Target outcome<Textarea aria-label="Target outcome" maxLength={4000} value={p.target_outcome} onChange={e=>set('target_outcome',e.target.value)}/></label>
    <div className="grid sm:grid-cols-2 gap-3"><label>Target priority<select aria-label="Target priority" className={SELECT} value={p.priority} onChange={e=>set('priority',e.target.value)}>{[['','Not prioritized'],['low','Low'],['medium','Medium'],['high','High'],['critical','Critical']].map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></label>
    <label>Gap decision<select aria-label="Gap decision" className={SELECT} value={p.gap_state} onChange={e=>set('gap_state',e.target.value)}>{Object.entries(CSF_GAPS).map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></label></div>
    <label className="block">Gap analysis / rationale<Textarea aria-label="Gap analysis / rationale" maxLength={4000} value={p.gap_notes} onChange={e=>set('gap_notes',e.target.value)}/></label>
    <p className="text-xs text-ink-secondary">Removing a target retains its notes and assessment history. Set Gap decision to Not evaluated before removing it. Aligned is an assessor statement; it does not change the implementation status or close linked work.</p>
  </section>;
}
