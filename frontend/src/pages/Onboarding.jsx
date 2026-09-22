import {useEffect,useRef,useState} from 'react';
import {Link} from 'react-router-dom';
import {useOrg} from '@/context/OrgContext';
import {useAuth} from '@/context/AuthContext';
import api,{formatError} from '@/lib/api';
import PageHeader from '@/components/PageHeader';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import AIIntake from '@/components/AIIntake';
import OnboardingHandoff from '@/components/OnboardingHandoff';
import ClientRelationshipValue from '@/components/ClientRelationshipValue';
import {useCompliance} from '@/context/ComplianceContext';
import {APPLICABILITY, unansweredPolicies, onboardingPreview, reviewConfigurationIssues} from '@/lib/onboardingHandoff';
import {FRAMEWORKS,CATALOGS,existingFrameworkReview,CADENCES,onboardingDraft,selectedPrograms,reviewConfig,frameworkPlans,genericReviews,belowSource} from '@/lib/frameworks';
import {toast} from 'sonner';

const STEPS=['Compliance & Requirements','Policies & Governance Documents','Recurring Reviews','Review & Create'];
const ANSWERS=[['yes','Yes'],['no','No'],['unsure','Unsure']];
export default function Onboarding(){
  const {currentClient,currentClientId}=useOrg(),{user}=useAuth(),compliance=useCompliance();
  const [snapshot,setSnapshot]=useState(null),[validation,setValidation]=useState(false),[retry,setRetry]=useState(0);
  const [loaded,setLoaded]=useState(null),[state,setState]=useState(null),[catalog,setCatalog]=useState(null),[reviews,setReviews]=useState([]),[error,setError]=useState(''),[saved,setSaved]=useState(''),[busy,setBusy]=useState(false);
  const pending=useRef(Promise.resolve()),generation=useRef(0);
  const canRun=['super_admin','platform_admin','client_contributor'].includes(user?.role);
  useEffect(()=>{
    const c=new AbortController();generation.current++;setLoaded(null);setState(null);setSnapshot(null);setError('');setValidation(false);
    if(!currentClientId)return;
    Promise.all([api.get('/onboarding/baseline',{params:{client_id:currentClientId},signal:c.signal}),api.get('/onboarding/handoff',{params:{client_id:currentClientId},signal:c.signal})]).then(([baseline,handoff])=>{
      if(c.signal.aborted)return;setCatalog(baseline.data.catalog);setState(baseline.data.state.completed ? baseline.data.state : onboardingDraft(baseline.data.state));setReviews(handoff.data.records.reviews);setSnapshot(handoff.data);setLoaded(currentClientId);setSaved('');
    }).catch(e=>{if(!c.signal.aborted)setError(formatError(e));});return()=>c.abort();
  },[currentClientId,retry]);
  function update(next){
    setState(next);setSaved('Saving progress…');
    const cid=currentClientId,revision=generation.current;
    pending.current=pending.current.catch(()=>{}).then(()=>api.post('/onboarding/baseline',{client_id:cid,state:next,finalize:false}));
    pending.current.then(()=>{if(revision===generation.current)setSaved('Progress saved');}).catch(e=>{if(revision===generation.current){setSaved('Progress could not be saved');toast.error(formatError(e));}});
  }
  async function finalize(){
    if(unansweredPolicies(catalog,state).length){setValidation(true);update({...state,step:1});return;}
    if(reviewConfigurationIssues(state).length){setValidation(true);update({...state,step:2});return;}
    const cid=currentClientId,revision=generation.current;
    setBusy(true);try{
      await pending.current;
      await api.post('/onboarding/baseline',{client_id:cid,state,finalize:true});
      if(revision!==generation.current)return;
      toast.success('Onboarding complete. Review the remaining operational setup.');
      compliance.refresh?.();setRetry(n=>n+1);
    }catch(e){if(revision===generation.current)toast.error(formatError(e));}finally{setBusy(false);}
  }
  if(!canRun)return <PageHeader title="GRC Program Onboarding" subtitle="You need contributor access to run this wizard."/>;
  if(!currentClientId)return <PageHeader title="GRC Program Onboarding" subtitle="Select a client organization first."/>;
  if(error)return <div role="alert" className="page-content space-y-3"><p>{error}</p><Button variant="outline" onClick={()=>setRetry(n=>n+1)}>Retry onboarding</Button></div>;
  if(!state||loaded!==currentClientId)return <div role="status" className="page-content">Loading onboarding…</div>;
  if(state.completed)return <OnboardingHandoff snapshot={snapshot} state={state} catalog={catalog} clientId={currentClientId} canManage={['super_admin','platform_admin'].includes(user?.role)}/>;
  const step=Math.min(3,Math.max(0,state.step||0)),programs=selectedPrograms(state),plans=frameworkPlans(state),generic=genericReviews(catalog,state);
  const missing=unansweredPolicies(catalog,state),preview=onboardingPreview(catalog,state,snapshot.records);
  const existing=p=>existingFrameworkReview(reviews,p);
  const configure=(p,key,value)=>update({...state,framework_reviews:{...state.framework_reviews,[p.key]:{...reviewConfig(state,p),[key]:value}}});
  return <div><PageHeader title="GRC Program Onboarding" subtitle="Select applicable programs, capture governance documents, and confirm the actual Review program."/>
    <div className="page-gutter pt-4 flex flex-wrap gap-3 text-sm"><span>Active client · <strong>{currentClient?.name}</strong></span><span role="status" className="text-xs text-ink-muted">{saved}</span>{state.completed&&<span className="text-xs text-ink-muted">Revisiting saved onboarding · existing history is retained</span>}</div>
    <div className="page-content max-w-7xl"><ol className="onboarding-stepper flex flex-wrap gap-4 mb-6 text-sm" data-testid="onboarding-stepper">{STEPS.map((name,i)=><li key={name} aria-current={step===i?'step':undefined} className={step===i?'font-semibold text-ink-primary':'text-ink-muted'}>{i+1}. {name}</li>)}</ol>
    <section className="border border-line bg-surface-card rounded-lg p-6"><h2 className="text-base font-semibold mb-4">{STEPS[step]}</h2>
      {step===0&&<div className="space-y-5"><p className="text-sm text-ink-muted">Select relevant programs. A selection records applicability—not certification. General GRC onboarding does not require a framework.</p>
        <div className="grid md:grid-cols-2 gap-3">{FRAMEWORKS.map(f=><label key={f.key} className="onboarding-program-option border border-line rounded p-4"><span className="block text-sm font-medium">{f.name}</span><select aria-label={f.name} className="mt-2 border border-line rounded bg-surface-card p-2 text-sm" value={state.requirements[f.key]} onChange={e=>update({...state,requirements:{...state.requirements,[f.key]:e.target.value}})}>{APPLICABILITY.map(([v,label])=><option key={v} value={v}>{label}</option>)}</select><span className="block text-xs text-ink-muted mt-2">{f.implemented?'Requirement assessments and mapped Reviews available.':'Program workspace only. Detailed mapping is not yet configured.'}</span></label>)}</div>
        <AIIntake key={currentClientId} clientId={currentClientId} canWrite={canRun}/>
      </div>}
      {step===1&&<div className="space-y-3"><p className="text-sm text-ink-muted">Reported existence is not verification. Context is shown for selected operational programs. Shared policy families are reused; exact document titles are not framework mandates.</p><p role="status" className="text-sm font-medium">{catalog.policies.length-missing.length} of {catalog.policies.length} answered · {missing.length ? `${missing.length} responses still required` : 'All required responses recorded'}</p><p className="text-xs text-ink-secondary">Each response is required. Unsure is valid; owners, documents and schedules can be completed later.</p>{validation&&!!missing.length&&<p role="alert" className="text-sm text-semantic-critical">Choose Yes, No or Unsure for each unanswered Policy before continuing.</p>}{catalog.policies.map(p=>{
        const mappings=Object.entries(CATALOGS).filter(([key])=>state.requirements[key]==='applies').flatMap(([key,c])=>c.policy_mappings.filter(m=>m.policy_key===p.key).map(m=>({...m,framework_key:key})));
        return <div key={p.key} className="border border-line rounded p-4"><div className="flex flex-wrap justify-between gap-3"><div><p className="text-sm font-medium">{p.name}</p><p className="text-xs text-ink-muted">{p.category}{p.conditional?' · where applicable':''}</p>{!state.policies[p.key]&&<p id={`required-${p.key}`} className={`text-xs ${validation?'text-semantic-critical':'text-ink-secondary'}`}>Response required</p>}</div><div role="group" aria-label={p.name} aria-describedby={!state.policies[p.key]?`required-${p.key}`:undefined} className="flex gap-2">{ANSWERS.map(([v,label])=><button type="button" key={v} aria-pressed={state.policies[p.key]===v} className={`rounded border border-line px-3 py-1 text-sm hover:bg-surface-subtle focus-visible:outline focus-visible:outline-2 ${state.policies[p.key]===v?'bg-selected-bg font-semibold':''}`} onClick={()=>update({...state,policies:{...state.policies,[p.key]:v}})}>{label}</button>)}</div></div>{mappings.map((m,i)=><p key={i} className="text-xs text-ink-muted mt-2">{FRAMEWORKS.find(f=>f.key===m.framework_key)?.label} {m.safeguards.join(', ')} · {m.basis||m.classification} — {m.rationale||m.reason}</p>)}</div>;
      })}</div>}
      {step===2&&<div className="space-y-5"><p className="text-sm text-ink-muted">Selected operational frameworks contribute Review proposals. Shared governance Reviews are reused rather than duplicated. Operational frequencies remain separate from human Review cadence.</p>{!!reviewConfigurationIssues(state).length&&<p role="alert" className="text-sm text-semantic-critical">Custom cadence must be 1–3650 whole days: {reviewConfigurationIssues(state).map(p=>p.title).join(' · ')}. Scheduling dates and owners remain optional.</p>}
        {!!plans.length&&<div className="space-y-3">{plans.map(p=>{
          const config=reviewConfig(state,p),old=existing(p),actual=old?{recurrence:old.recurrence,custom_recurrence_days:old.custom_recurrence_days}:config;
          return <section key={p.key} className="border border-line rounded p-4 space-y-2" data-testid={`review-plan-${p.key}`}><label className="flex gap-2 text-sm font-medium"><input type="checkbox" checked={config.enabled} onChange={e=>configure(p,'enabled',e.target.checked)}/>{p.title}</label><p className="text-xs text-ink-muted">{FRAMEWORKS.find(f=>f.key===p.framework_key)?.label} {p.safeguards.join(', ')} · {p.basis}</p><p className="text-xs">Source cadence: {p.source_cadence}</p><p className="text-xs text-ink-muted">Omnisciente default: {p.default_cadence}. {p.reason}</p>
            {old?<p className="text-sm">Existing Review retained · {old.recurrence||'Needs scheduling'} · {old.due_date?.slice(0,10)||'No date'}. <Link className="text-link underline" to={`/reviews?open=${old.review_id}`}>Manage in Reviews</Link></p>:<fieldset disabled={!config.enabled} className="flex flex-wrap gap-3"><label className="text-sm">Client cadence<select aria-label={`Client cadence — ${p.title}`} className="block border border-line rounded bg-surface-card p-2" value={config.recurrence} onChange={e=>configure(p,'recurrence',e.target.value)}>{CADENCES.map(c=><option key={c}>{c}</option>)}</select></label>{config.recurrence==='custom'&&<label className="text-sm">Days<Input type="number" min="1" max="3650" aria-label={`Custom days — ${p.title}`} value={config.custom_recurrence_days} onChange={e=>configure(p,'custom_recurrence_days',Number(e.target.value))}/></label>}<label className="text-sm">First due date (optional)<Input type="date" aria-label={`First due date — ${p.title}`} value={config.due_date} onChange={e=>configure(p,'due_date',e.target.value)}/></label></fieldset>}
            {config.enabled&&belowSource(p,actual)&&<p role="status" className="text-xs text-semantic-duesoon-text">Selected cadence is below the mapped CIS source frequency. This is not a CIS-conformance determination.</p>}
          </section>;
        })}</div>}
        {!plans.length&&<p className="text-sm">No implemented framework selected. No framework-specific Reviews will be created.</p>}
        <details><summary className="text-sm cursor-pointer font-medium">Optional general GRC Reviews · {generic.length} selected</summary><p className="text-xs text-ink-muted my-3">Generic governance choices—not requirements of any placeholder framework. New general Reviews start Needs Scheduling.</p><div className="grid md:grid-cols-2 gap-3">{catalog.reviews.filter(r=>!plans.some(p=>p.baseline_key===r.key&&reviewConfig(state,p).enabled)).map(r=><label key={r.key} className="flex gap-2 text-sm"><input type="checkbox" checked={state.reviews.includes(r.key)} onChange={e=>update({...state,reviews:e.target.checked?[...state.reviews,r.key]:state.reviews.filter(k=>k!==r.key)})}/>{r.name}</label>)}</div></details>
      </div>}
      {step===3&&<div className="space-y-6"><section><h3 className="text-sm font-semibold">Selected Programs</h3><p className="text-sm text-ink-muted">{programs.map(p=>p.name).join(' · ')||'General GRC program — no formal framework selected'}</p></section>
        <section><h3 className="text-sm font-semibold">Operational Framework Configuration</h3><ul className="space-y-2 text-sm mt-2">{FRAMEWORKS.map(p=><li key={p.key}>{p.name} — {APPLICABILITY.find(([v])=>v===state.requirements[p.key])?.[1]}{state.requirements[p.key]==='applies' && (p.implemented?` · ${preview.assessmentsByProgram[p.key]||0} requirement assessments to create; existing responses and history retained.`:' · Detailed mapping not yet configured. No framework-specific Reviews.')}</li>)}</ul></section>
        <section><h3 className="text-sm font-semibold">Policies & Governance Documents</h3><p className="text-sm">{preview.policies.total} baseline Policy records · {preview.policies.create} to create · {preview.policies.retain} existing records retained</p><p className="text-sm text-ink-secondary">{preview.policies.yes} reported existing · {preview.policies.no} reported missing · {preview.policies.unsure} need confirmation</p>{!!missing.length&&<p role="alert" className="text-sm text-semantic-critical">Answer every Policy question before completing onboarding.</p>}</section>
        <section><h3 className="text-sm font-semibold">Recurring governance</h3><p className="text-sm">{preview.reviews.create} Reviews to create · {preview.reviews.retain} existing Reviews retained · {preview.reviews.scheduling} need scheduling · {preview.reviews.owners} have an owner</p><p className="text-xs text-ink-secondary">Ownership and scheduling are optional here. These counts reflect currently loaded records; completion preserves existing operational work.</p></section>
        <section><h3 className="text-sm font-semibold mb-2">People</h3><div className="grid sm:grid-cols-2 gap-3 text-sm"><div>Primary Contact<ClientRelationshipValue client={snapshot.client} primary/></div><div>GRC Lead<ClientRelationshipValue client={snapshot.client}/></div></div><p className="text-xs text-ink-secondary mt-2">{snapshot.people.contacts} business Contacts · {snapshot.people.active_client_users} active client platform Users. No accounts or assignments will be created.</p></section>
        <section><h3 className="text-sm font-semibold">Reviews to Create / Retain</h3><ul className="list-disc ml-5 text-sm space-y-1">{plans.filter(p=>reviewConfig(state,p).enabled).map(p=><li key={p.key}>{p.title} · {existing(p)?'Existing Review retained':`Create or share · ${reviewConfig(state,p).recurrence}`}</li>)}{generic.map(r=><li key={r.key}>{r.name} · Generic governance · create only if missing</li>)}</ul>{!generic.length&&!plans.some(p=>reviewConfig(state,p).enabled)&&<p className="text-sm text-ink-muted">No Reviews selected.</p>}<p className="text-xs text-ink-muted mt-3">Deselecting a program removes its current driver. Existing Reviews, Findings, Actions, Evidence and assessment history are never deleted.</p></section>
      </div>}
      <div className="mt-8 flex justify-between"><Button variant="outline" disabled={step===0||busy} onClick={()=>update({...state,step:step-1})}>Back</Button>{step<3?<Button onClick={()=>{if(step===1&&missing.length){setValidation(true);document.querySelector('[role="group"][aria-describedby] button')?.focus();return;}if(step===2&&reviewConfigurationIssues(state).length){document.querySelector('input[type="number"]:invalid')?.focus();return;}setValidation(false);update({...state,step:step+1});}}>Next</Button>:<Button disabled={busy} onClick={finalize}>{busy?'Saving…':'Complete onboarding'}</Button>}</div>
    </section></div>
  </div>;
}
