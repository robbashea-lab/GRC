import {createElement,useEffect,useRef,useState} from 'react';
import {cisAvailableGroups,cisScopeCounts} from '@/lib/cisScope';
import api,{formatError} from '@/lib/api';
import {recordUuid} from '@/lib/recordUuid';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from './ui/dialog';

export function CisGroupSelect({value,onChange,disabled=false}){
  // JSX instrumentation wraps dynamic text in spans; options require native text.
  return <label className="block text-sm">CIS implementation group<select aria-label="CIS implementation group" className="block mt-1 border border-line rounded p-2 bg-surface-card" value={value||1} disabled={disabled} onChange={e=>onChange(Number(e.target.value))}>{cisAvailableGroups().map(group=>createElement('option',{key:group,value:group},`IG${group} · ${cisScopeCounts[group]} safeguards${group>1?', including earlier groups':''}`))}</select></label>;
}
export default function CisProgramSettings({clientId,configuration,onSaved}){
  const [group,setGroup]=useState(configuration.implementation_group||1),[open,setOpen]=useState(false),[reason,setReason]=useState(''),[date,setDate]=useState(new Date().toISOString().slice(0,10)),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [conflict,setConflict]=useState(false);
  const submission=useRef(null),reduction=group<configuration.implementation_group;
  useEffect(()=>{setGroup(configuration.implementation_group||1);setOpen(false);setError('');submission.current=null;},[clientId,configuration]);
  async function save(){
    submission.current||={key:recordUuid(),body:{client_id:clientId,implementation_group:group,expected_updated_at:configuration.expected_updated_at??null,confirm_reduction:reduction,reason,effective_date:date}};
    setBusy(true);setError('');setConflict(false);
    try{await api.patch('/frameworks/cis-ig1/configuration',submission.current.body,{headers:{'Idempotency-Key':submission.current.key}});setOpen(false);submission.current=null;onSaved?.();}
    catch(e){const status=e.response?.status;setConflict(status===409);if([403,422,428].includes(status))submission.current=null;setError(formatError(e));}finally{setBusy(false);}
  }
  return <section className="border border-line rounded p-3 space-y-3" aria-label="CIS scope settings"><CisGroupSelect value={group} disabled={busy||!!submission.current} onChange={setGroup}/><p className="text-xs text-ink-secondary">One cumulative CIS v8.1 program. Changing scope preserves assessment identities, answers, relationships and history.</p><Button size="sm" variant="outline" onClick={()=>setOpen(true)}>Review scope change</Button>
    <Dialog open={open} onOpenChange={value=>{if(!busy&&!submission.current)setOpen(value);}}><DialogContent><DialogHeader><DialogTitle>Confirm CIS scope change</DialogTitle><DialogDescription>{reduction?`Reduce the active program from ${cisScopeCounts[configuration.implementation_group]} to ${cisScopeCounts[group]} safeguards. The ${cisScopeCounts[configuration.implementation_group]-cisScopeCounts[group]} removed safeguards remain available as retained history.`:'Initialize missing safeguards for the selected cumulative scope.'}</DialogDescription></DialogHeader>
      <p className="text-sm">Existing answers, evidence, links and completed Reviews remain. Actions stay open and Reviews keep their descriptions, dates and recurrence. Out-of-scope CIS drivers become inactive on reduction; other framework drivers continue. Existing schedules are not automatically adjusted.</p>
      <label className="text-sm">Reason{reduction?' (required)':' (optional)'}<Input value={reason} maxLength={2000} disabled={busy||!!submission.current} onChange={e=>setReason(e.target.value)}/></label><label className="text-sm">Effective context date<Input type="date" value={date} max={new Date().toISOString().slice(0,10)} disabled={busy||!!submission.current} onChange={e=>setDate(e.target.value)}/></label><p className="text-xs text-ink-secondary">Active scope changes immediately. The date records context; it does not backdate results.</p>
      {error&&<p role="alert">{error} Retry this same submission to recover any interrupted initialization.</p>}{conflict&&<Button variant="outline" onClick={()=>{submission.current=null;setOpen(false);onSaved?.();}}>Reload current scope</Button>}<DialogFooter><Button variant="outline" disabled={busy||!!submission.current} onClick={()=>setOpen(false)}>Cancel</Button><Button disabled={busy||!date||reduction&&!reason.trim()} onClick={save}>{busy?'Saving…':submission.current?'Retry scope change':'Confirm scope change'}</Button></DialogFooter>
    </DialogContent></Dialog></section>;
}
