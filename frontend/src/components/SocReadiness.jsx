import {useEffect,useState} from 'react';
import api,{formatError} from '@/lib/api';
import {SOC_CATEGORIES} from '@/lib/socReadiness';
import socGuidance from '@catalogs/operatorGuidance/socAssessmentGuidance.json';
import descriptionGuidance from '@catalogs/operatorGuidance/socDescriptionPreparation.json';
import {Link} from 'react-router-dom';
import {Button} from './ui/button';
import {Textarea} from './ui/textarea';

export function SocDescriptionPreparation(){
  return <details className="border border-line rounded bg-surface-card p-3 text-sm" data-guidance-version={descriptionGuidance.version}>
    <summary className="cursor-pointer font-medium">System-description preparation</summary>
    <p className="my-3 text-xs text-ink-secondary">Program-level preparation guidance, not nine additional controls or an assessment score. Internal readiness, not an auditor opinion.</p>
    <ul className="space-y-2">{descriptionGuidance.items.map(item=><li key={item.id}><strong>{item.id}</strong> · {item.text}</li>)}</ul>
    <p className="my-3">Use an existing Review and Notes, an external description or equivalent record. Record the responsible owner, reference/version examined, reporting period and remaining gaps. Reuse existing work before creating a Review; choose a cadence or trigger suited to your program.</p>
    <div className="flex flex-wrap gap-4"><Link className="text-link underline" to="/reviews">Open Reviews</Link><a className="text-link underline" href={descriptionGuidance.source} target="_blank" rel="noopener noreferrer">AICPA description criteria ↗</a></div>
  </details>;
}

export function SocProgramSettings({clientId,configuration,writable,onSaved}){
  const [form,setForm]=useState(configuration),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{setForm(configuration);setError('');},[configuration,clientId]);
  const put=(key,value)=>setForm(p=>({...p,[key]:value}));
  async function save(){
    setBusy(true);setError('');
    try{await api.patch('/frameworks/soc-2/configuration',{client_id:clientId,...form});onSaved();}
    catch(e){setError(formatError(e));}finally{setBusy(false);}
  }
  return <details className="border border-line rounded bg-surface-card p-3 text-sm"><summary className="cursor-pointer font-medium">SOC 2 scope</summary><p className="text-xs text-ink-secondary my-3">Configure the ongoing operational program, not an audit or certification period. Common Criteria remain in scope. Deselecting additional categories retains their assessment history.</p>{error&&<p role="alert" className="text-semantic-critical mb-3">{error}</p>}<p className="text-xs text-ink-secondary my-3">{socGuidance.context.baseline}</p><fieldset disabled={!writable||busy} className="space-y-3"><div className="flex flex-wrap gap-x-5 gap-y-2">{Object.entries(SOC_CATEGORIES).map(([key,label])=><label className="flex items-center gap-2" key={key}><input type="checkbox" aria-label={label} checked={form.categories.includes(key)} disabled={key==='security'||!writable||busy} onChange={e=>put('categories',e.target.checked?[...form.categories,key]:form.categories.filter(c=>c!==key))}/>{label}</label>)}</div><label className="block">System boundary and service commitments<Textarea aria-label="System boundary and service commitments" maxLength={4000} value={form.system_description} onChange={e=>put('system_description',e.target.value)}/></label>{writable&&<Button onClick={save}>{busy?'Saving…':'Save SOC 2 scope'}</Button>}</fieldset></details>;
}
