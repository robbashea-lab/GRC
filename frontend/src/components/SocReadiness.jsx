import {useEffect,useState} from 'react';
import api,{formatError} from '@/lib/api';
import {SOC_CATEGORIES} from '@/lib/socReadiness';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {Textarea} from './ui/textarea';

export function SocProgramSettings({clientId,configuration,writable,onSaved}){
  const [form,setForm]=useState(configuration),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{setForm(configuration);setError('');},[configuration,clientId]);
  const put=(key,value)=>setForm(p=>({...p,[key]:value}));
  async function save(){
    setBusy(true);setError('');
    try{await api.patch('/frameworks/soc-2/configuration',{client_id:clientId,...form});onSaved();}
    catch(e){setError(formatError(e));}finally{setBusy(false);}
  }
  return <details className="border border-line rounded bg-surface-card p-3 text-sm"><summary className="cursor-pointer font-medium">Scope and observation period settings</summary><p className="text-xs text-ink-secondary my-3">Internal Type 2 readiness, not an audit opinion. Common Criteria remain in scope. Select additional categories deliberately; deselection retains their assessment history.</p>{error&&<p role="alert" className="text-semantic-critical mb-3">{error}</p>}<fieldset disabled={!writable||busy} className="space-y-3"><div className="flex flex-wrap gap-x-5 gap-y-2">{Object.entries(SOC_CATEGORIES).map(([key,label])=><label className="flex items-center gap-2" key={key}><input type="checkbox" aria-label={label} checked={form.categories.includes(key)} disabled={key==='security'||!writable||busy} onChange={e=>put('categories',e.target.checked?[...form.categories,key]:form.categories.filter(c=>c!==key))}/>{label}</label>)}</div><label className="block">System boundary and service commitments<Textarea aria-label="System boundary and service commitments" maxLength={4000} value={form.system_description} onChange={e=>put('system_description',e.target.value)}/></label><div className="grid sm:grid-cols-2 gap-3">{[['period_start','Program period start'],['period_end','Program period end']].map(([key,label])=><label key={key}>{label}<Input type="date" aria-label={label} value={form[key]} onChange={e=>put(key,e.target.value)}/></label>)}</div><p className="text-xs text-ink-secondary">No minimum period or sample size is assumed. Changing these dates does not rewrite existing control observations.</p>{writable&&<Button onClick={save}>{busy?'Saving…':'Save SOC 2 scope'}</Button>}</fieldset></details>;
}
