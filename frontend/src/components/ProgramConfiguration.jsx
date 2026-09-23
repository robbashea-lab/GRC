import {useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import api, {formatError} from '@/lib/api';
import {FRAMEWORKS} from '@/lib/frameworks';
import {APPLICABILITY} from '@/lib/onboardingHandoff';
import {useCompliance} from '@/context/ComplianceContext';
import {Button} from './ui/button';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from './ui/dialog';
import {Input} from './ui/input';

export default function ProgramConfiguration({clientId, onSaved}) {
  const [snapshot,setSnapshot]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0);
  const compliance=useCompliance();
  const [proposal,setProposal]=useState(null),[reason,setReason]=useState(''),[effectiveDate,setEffectiveDate]=useState('');
  useEffect(()=>{
    const controller=new AbortController();setSnapshot(null);setError('');setProposal(null);
    api.get('/onboarding/handoff',{params:{client_id:clientId},signal:controller.signal})
      .then(({data})=>{if(!controller.signal.aborted)setSnapshot(data);})
      .catch(e=>{if(!controller.signal.aborted)setError(formatError(e));});
    return()=>controller.abort();
  },[clientId,revision]);
  async function change(key,applicability){
    setBusy(true);setError('');
    try{await api.patch(`/onboarding/programs/${key}`,{client_id:clientId,applicability,...(applicability==='retired'?{reason,effective_date:effectiveDate}:{}),expected_updated_at:snapshot.records.requirements.find(row=>row.baseline_key===key)?.updated_at??null});compliance.refresh?.();setProposal(null);setRevision(n=>n+1);onSaved?.();}
    catch(e){setError(formatError(e));}finally{setBusy(false);}
  }
  return <section className="border border-line rounded-lg p-4 mb-5 space-y-3" aria-label="Program configuration">
    <h3 className="text-sm font-semibold">Program configuration</h3>
    <p className="text-xs text-ink-secondary">Adjust applicability without repeating onboarding. Operational programs initialize their assessments and reuse mapped Reviews. Existing work and history are retained when a program is removed.</p>
    {error&&<div role="alert" className="text-sm"><p>{error}</p><Button variant="outline" size="sm" onClick={()=>setRevision(n=>n+1)}>Retry configuration</Button></div>}
    {!snapshot&&!error&&<p role="status" className="text-sm">Loading program configuration…</p>}
    {snapshot?.client.client_id===clientId && (snapshot.completed ? <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{FRAMEWORKS.map(f=>{
      const value=snapshot.records.requirements.find(r=>r.baseline_key===f.key)?.baseline_response || 'does_not_apply';
      const initialized=snapshot.records.framework_assessments.some(a=>a.framework_key===f.key);
      const propose=next=>{setReason('');setEffectiveDate(new Date().toISOString().slice(0,10));setProposal({framework:f,value:next});};
      return <div key={f.key}><label className="text-sm">{f.name}<select disabled={busy} aria-label={`Applicability — ${f.name}`} className="block mt-1 border border-line rounded p-2 bg-surface-card w-full" value={value} onChange={e=>propose(e.target.value)}>{APPLICABILITY.map(([v,label])=><option value={v} key={v}>{label}</option>)}<option value="retired">No Longer Applies / Retired</option></select></label>{f.implemented&&value==='applies'&&!initialized&&<Button variant="ghost" size="sm" disabled={busy} onClick={()=>propose('applies')}>Initialize {f.label}</Button>}</div>;
    })}</div> : <Link className="text-sm text-link underline" to="/onboarding">Continue onboarding</Link>)}
    <Dialog open={!!proposal} onOpenChange={open=>{if(!open&&!busy)setProposal(null);}}><DialogContent><DialogHeader><DialogTitle>Confirm program change</DialogTitle><DialogDescription>{proposal?.framework.name} · {proposal?.value==='retired'?'No Longer Applies / Retired':APPLICABILITY.find(([v])=>v===proposal?.value)?.[1]}</DialogDescription></DialogHeader>
      <div className="text-sm space-y-3">
        {proposal?.value==='applies'?<p>{proposal.framework.implemented?'Enable the existing program workspace, initialize missing requirement assessments, and reuse or create mapped recurring Review plans. Existing assessment results, Review owners and dates remain intact.':'Enable the existing program workspace. Detailed assessments, Scope / SSP and POA&M initialization are not implemented for this program; this change does not create those capabilities.'}</p>:<p>Update current applicability and remove the active framework relationship. Existing assessments, Evidence, Findings and Action Items remain. Recurring Reviews continue until an authorized user explicitly cancels or retires them.</p>}
        <p>The original onboarding baseline will not change. This change takes effect immediately and is recorded in activity history.</p>
        {proposal?.value==='retired'&&<><label className="block">Retirement reason<Input value={reason} maxLength={2000} onChange={e=>setReason(e.target.value)}/></label><label className="block">Effective date<Input type="date" max={new Date().toISOString().slice(0,10)} value={effectiveDate} onChange={e=>setEffectiveDate(e.target.value)}/></label></>}
        {error&&<p role="alert">{error}</p>}
      </div><DialogFooter><Button variant="outline" disabled={busy} onClick={()=>setProposal(null)}>Cancel</Button><Button disabled={busy||(proposal?.value==='retired'&&(!reason.trim()||!effectiveDate))} onClick={()=>change(proposal.framework.key,proposal.value)}>{busy?'Saving…':'Confirm Program Change'}</Button></DialogFooter>
    </DialogContent></Dialog></section>;
}
