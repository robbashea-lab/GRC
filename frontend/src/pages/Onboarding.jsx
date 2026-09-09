import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '@/context/OrgContext';
import { useAuth } from '@/context/AuthContext';
import api, { formatError } from '@/lib/api';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ChevronLeft, ChevronRight, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

const STEPS=['Policies & Governance Documents','Compliance & Requirements','Recurring Reviews','Review & Create'];
const POLICY=[['yes','Yes','Reported Existing'],['no','No','Reported Missing'],['unsure','Unsure','Needs Confirmation']];
const REQUIREMENT=[['applies','Applies','Applies'],['does_not_apply','Does Not Apply','Does Not Apply'],['unsure','Unsure','Unsure']];
const TONE={yes:'bg-emerald-100 text-emerald-800 border-emerald-300',no:'bg-red-100 text-red-800 border-red-300',unsure:'bg-amber-100 text-amber-800 border-amber-300',applies:'bg-emerald-100 text-emerald-800 border-emerald-300',does_not_apply:'bg-slate-100 text-slate-700 border-slate-300'};
const groups=items=>[...new Set(items.map(i=>i.category))].map(category=>({category,items:items.filter(i=>i.category===category)}));
export default function Onboarding() {
  const {currentClient,currentClientId}=useOrg(), {user}=useAuth(), nav=useNavigate();
  const [loaded,setLoaded]=useState(null),[state,setState]=useState(null),[catalog,setCatalog]=useState(null),[error,setError]=useState(''),[saved,setSaved]=useState(''),[busy,setBusy]=useState(false);
  const pending=useRef(Promise.resolve()), generation=useRef(0);
  const canRun=['super_admin','platform_admin','client_contributor'].includes(user?.role);
  useEffect(()=>{
    let cancelled=false;generation.current++;setLoaded(null);setState(null);setError('');
    if(!currentClientId)return;
    api.get('/onboarding/baseline',{params:{client_id:currentClientId}}).then(({data})=>{if(cancelled)return;setCatalog(data.catalog);setState(data.state);setLoaded(currentClientId);setSaved('');}).catch(e=>{if(!cancelled)setError(formatError(e));});
    return()=>{cancelled=true;};
  },[currentClientId]);
  function update(next) {
    setState(next);setSaved('Saving progress…');
    const clientId=currentClientId, revision=generation.current;
    // Serialize drafts: a slower previous save cannot overwrite a later selection.
    pending.current=pending.current.catch(()=>{}).then(()=>api.post('/onboarding/baseline',{client_id:clientId,state:next,finalize:false}));
    pending.current.then(()=>{if(revision===generation.current)setSaved('Progress saved');}).catch(e=>{if(revision===generation.current){setSaved('Progress could not be saved');toast.error(formatError(e));}});
  }
  async function finalize(){
    setBusy(true);
    try{await pending.current;await api.post('/onboarding/baseline',{client_id:currentClientId,state,finalize:true});toast.success('Baseline saved. Selected review areas are ready for scheduling.');nav('/reviews?tab=needs_scheduling');}
    catch(e){toast.error(formatError(e));}finally{setBusy(false);}
  }
  if(!canRun)return <PageHeader title="GRC Program Onboarding" subtitle="You need contributor access to run this wizard."/>;
  if(!currentClientId)return <PageHeader title="GRC Program Onboarding" subtitle="Select a client organization from the sidebar first."/>;
  if(error)return <div role="alert" className="p-8">{error}</div>;
  if(!state||loaded!==currentClientId)return <div className="p-8 text-sm text-ink-muted">Loading onboarding…</div>;
  const step=Math.min(3,Math.max(0,state.step||0));
  const answer=(group,key,value)=>update({...state,[group]:{...state[group],[key]:value}});
  function responseStep(group,options){return <div className="space-y-4">{groups(catalog[group]).map(({category,items})=><section className="border border-slate-200 rounded-md overflow-hidden" key={category}><h3 className="px-4 py-3 bg-slate-50 text-sm font-medium">{category}</h3>{items.map(item=><div className="px-4 py-3 border-t border-slate-100" key={item.key}><div className="flex items-center justify-between gap-4"><div><span className="text-sm">{item.name}</span>{item.conditional&&<span className="text-xs text-ink-help"> · where applicable</span>}</div><div role="group" aria-label={item.name} className="flex gap-1">{options.map(([value,label])=><button type="button" key={value} aria-pressed={state[group]?.[item.key]===value} onClick={()=>answer(group,item.key,value)} className={`rounded-md border px-3 py-1.5 text-xs font-medium ${state[group]?.[item.key]===value?TONE[value]:'bg-white text-slate-500 border-slate-200'}`}>{label}</button>)}</div></div>{item.description&&<p className="text-xs text-ink-help mt-2">{item.description}</p>}</div>)}</section>)}</div>;}
  return <div><PageHeader title="GRC Program Onboarding" subtitle="Establish the client's initial GRC baseline: reported policies, applicable requirements, and review areas to prepare."/>
    <div className="px-8 pt-4 flex items-center gap-3 text-sm"><span>Active client · <strong>{currentClient?.name}</strong></span><span role="status" className="text-xs text-ink-help">{saved}</span>{state.completed&&<span className="text-xs text-ink-help">Revisiting saved baseline</span>}</div>
    <div className="p-8 max-w-6xl"><ol className="flex flex-wrap items-center gap-3 mb-6 text-xs font-medium" data-testid="onboarding-stepper">{STEPS.map((name,i)=><li key={name} className={`flex items-center gap-2 ${i===step?'text-slate-900':'text-slate-400'}`}><span className={`h-5 w-5 rounded-full border flex items-center justify-center text-[10px] ${i===step?'border-slate-900 bg-slate-900 text-white':'border-slate-300'}`}>{i+1}</span>{name}{i<3&&<ChevronRight className="h-3 w-3"/>}</li>)}</ol>
    <div className="bg-white border border-slate-200 rounded-lg p-6"><h2 className="text-base font-medium mb-2">{STEPS[step]}</h2>
      {step===0&&<><p className="text-sm text-ink-muted mb-5">Record whether the client reports having each document. A Yes response is not verification; a No response records a missing document.</p>{responseStep('policies',POLICY)}</>}
      {step===1&&responseStep('requirements',REQUIREMENT)}
      {step===2&&<><p className="text-sm text-ink-muted mb-5">These review areas have been identified for this client. During the onboarding call, confirm when each activity was last completed and establish the appropriate recurrence and next review date.</p>{groups(catalog.reviews).map(({category,items})=><section className="border border-slate-200 rounded-md mb-4" key={category}><h3 className="px-4 py-3 bg-slate-50 text-sm font-medium">{category}</h3>{items.map(item=><label key={item.key} className="flex items-center gap-3 px-4 py-3 border-t border-slate-100 text-sm"><Checkbox aria-label={item.name} checked={state.reviews.includes(item.key)} onCheckedChange={checked=>update({...state,reviews:checked?[...state.reviews,item.key]:state.reviews.filter(k=>k!==item.key)})}/><span>{item.name}</span><span className="ml-auto text-xs text-ink-help">{state.reviews.includes(item.key)?'Selected':'Not selected'}</span></label>)}</section>)}</>}
      {step===3&&<div className="space-y-6">{[['policies',POLICY,STEPS[0]],['requirements',REQUIREMENT,STEPS[1]]].map(([group,options,title])=><section key={group}><h3 className="text-sm font-medium mb-2">{title}</h3>{options.map(([value,,label])=><div key={value} className="mb-2 text-sm"><strong>{label} · {catalog[group].filter(i=>state[group]?.[i.key]===value).length}</strong><ul className="ml-5 list-disc text-ink-muted">{catalog[group].filter(i=>state[group]?.[i.key]===value).map(i=><li key={i.key}>{i.name}</li>)}</ul></div>)}{catalog[group].some(i=>!state[group]?.[i.key])&&<p className="text-sm text-semantic-critical">Answer every item before completing onboarding.</p>}</section>)}<section><h3 className="text-sm font-medium">Selected review areas · {state.reviews.length}</h3><p className="text-sm text-ink-muted my-2">New review records will be Needs Scheduling. No cadence, last completed date, next due date, or owner is assigned here. Existing scheduling and review details are preserved.</p><ul className="list-disc ml-5 text-sm">{catalog.reviews.filter(i=>state.reviews.includes(i.key)).map(i=><li key={i.key}>{i.name}</li>)}</ul></section></div>}
      <div className="mt-8 flex items-center justify-between"><Button variant="outline" disabled={step===0||busy} onClick={()=>update({...state,step:step-1})}><ChevronLeft className="h-4 w-4 mr-1"/>Back</Button>{step<3?<Button onClick={()=>update({...state,step:step+1})}>Next<ChevronRight className="h-4 w-4 ml-1"/></Button>:<Button disabled={busy} onClick={finalize}><CheckCircle2 className="h-4 w-4 mr-1"/>{busy?'Completing…':'Complete onboarding'}</Button>}</div>
    </div></div></div>;
}
