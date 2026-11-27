import {useEffect,useState} from 'react';
import api,{formatError} from '@/lib/api';
import {catalog} from '@/lib/aiGovernance';
import {Button} from './ui/button';

export function useAIIntake({clientId,canWrite=true,onSaved,enabled=true}){
  const [data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{if(!enabled||!clientId)return;const c=new AbortController();setData(null);setError('');api.get('/ai-intake',{params:{client_id:clientId},signal:c.signal}).then(r=>{if(!c.signal.aborted)setData(r.data);}).catch(e=>{if(!c.signal.aborted)setError(formatError(e));});return()=>c.abort();},[clientId,enabled]);
  async function save(){setBusy(true);setError('');try{const response=await api.post('/ai-intake',{...data,client_id:clientId,expected_updated_at:data.updated_at??null});setData(response.data);onSaved?.();}catch(e){setError(formatError(e));}finally{setBusy(false);}}
  return {data:data?.client_id===clientId?data:null,error,busy,save,onChange:setData,canWrite};
}

export function AIIntakeView({state,render}){
  if(render)return render(state);
  const {data,error,busy,save,onChange,canWrite}=state;
  return <section className="border border-line rounded-md p-4 my-4 space-y-3" data-testid="ai-intake"><h3 className="text-sm font-semibold">AI applicability intake</h3><p className="text-sm text-ink-muted">Does the organization develop, provide, deploy, or materially use AI systems? This is an intake signal, not a legal applicability assessment.</p>{error&&<p role="alert" className="text-sm text-semantic-critical">{error}</p>}{data&&<fieldset disabled={!canWrite||busy} className="space-y-3"><div className="flex gap-2">{['yes','no','unsure'].map(value=><button type="button" key={value} aria-pressed={data.usage===value} onClick={()=>onChange({...data,usage:value})} className={`border border-line rounded px-3 py-1.5 text-sm ${data.usage===value?'bg-selected-bg':'bg-surface-card'}`}>{value[0].toUpperCase()+value.slice(1)}</button>)}</div>{data.usage==='yes'&&<div className="grid sm:grid-cols-2 gap-2">{catalog.intake_indicators.map(v=><label className="text-sm flex gap-2" key={v}><input type="checkbox" checked={data.indicators.includes(v)} onChange={e=>onChange({...data,indicators:e.target.checked?[...data.indicators,v]:data.indicators.filter(x=>x!==v)})}/>{v}</label>)}</div>}<Button type="button" variant="outline" onClick={save}>{busy?'Saving…':'Save AI intake'}</Button></fieldset>}</section>;
}

export default function AIIntake({render,...props}){
  const state=useAIIntake(props);
  return <AIIntakeView state={state} render={render}/>;
}
