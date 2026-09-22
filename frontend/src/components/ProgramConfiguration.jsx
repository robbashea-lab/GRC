import {useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import api, {formatError} from '@/lib/api';
import {FRAMEWORKS} from '@/lib/frameworks';
import {APPLICABILITY} from '@/lib/onboardingHandoff';
import {useCompliance} from '@/context/ComplianceContext';
import {Button} from './ui/button';

export default function ProgramConfiguration({clientId, onSaved}) {
  const [snapshot,setSnapshot]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0);
  const compliance=useCompliance();
  useEffect(()=>{
    const controller=new AbortController();setSnapshot(null);setError('');
    api.get('/onboarding/handoff',{params:{client_id:clientId},signal:controller.signal})
      .then(({data})=>{if(!controller.signal.aborted)setSnapshot(data);})
      .catch(e=>{if(!controller.signal.aborted)setError(formatError(e));});
    return()=>controller.abort();
  },[clientId,revision]);
  async function change(key,applicability){
    setBusy(true);setError('');
    try{await api.patch(`/onboarding/programs/${key}`,{client_id:clientId,applicability});compliance.refresh?.();setRevision(n=>n+1);onSaved?.();}
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
      return <div key={f.key}><label className="text-sm">{f.name}<select disabled={busy} aria-label={`Applicability — ${f.name}`} className="block mt-1 border border-line rounded p-2 bg-surface-card w-full" value={value} onChange={e=>change(f.key,e.target.value)}>{APPLICABILITY.map(([v,label])=><option value={v} key={v}>{label}</option>)}</select></label>{f.implemented&&value==='applies'&&!initialized&&<Button variant="ghost" size="sm" disabled={busy} onClick={()=>change(f.key,'applies')}>Initialize {f.label}</Button>}</div>;
    })}</div> : <Link className="text-sm text-link underline" to="/onboarding">Continue onboarding</Link>)}
  </section>;
}
