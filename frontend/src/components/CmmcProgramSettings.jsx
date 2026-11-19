import {createElement,useEffect,useRef,useState} from 'react';
import api,{formatError} from '@/lib/api';
import {activeDefinitions} from '@/lib/frameworks';
import {recordUuid} from '@/lib/recordUuid';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from './ui/dialog';

export function CmmcLevelSelect({value=2,onChange,disabled=false}) {
  return <label className="block text-sm">CMMC level<select aria-label="CMMC level" value={value} disabled={disabled} onChange={event=>onChange(Number(event.target.value))} className="block mt-1 border border-line rounded p-2 bg-surface-card">
    {[1,2].map(level=>createElement('option',{key:level,value:level},`Level ${level} · ${activeDefinitions('cmmc',{level}).length} mapped checks`))}
  </select></label>;
}

export default function CmmcProgramSettings({clientId,configuration,onSaved}) {
  const [level,setLevel]=useState(configuration.level),[open,setOpen]=useState(false),[busy,setBusy]=useState(false);
  const [reason,setReason]=useState(''),[date,setDate]=useState(new Date().toISOString().slice(0,10)),[error,setError]=useState('');
  const submission=useRef(null),reduction=level<configuration.level;
  useEffect(()=>{setLevel(configuration.level);setOpen(false);setError('');submission.current=null;},[clientId,configuration]);
  async function save() {
    submission.current||={key:recordUuid(),body:{client_id:clientId,level,expected_updated_at:configuration.expected_updated_at??null,confirm_reduction:reduction,reason,effective_date:date}};
    setBusy(true);setError('');
    try {
      await api.patch('/frameworks/cmmc/configuration',submission.current.body,{headers:{'Idempotency-Key':submission.current.key}});
      submission.current=null;setOpen(false);onSaved?.();
    } catch(failure) {
      if([403,422,428].includes(failure.response?.status))submission.current=null;
      setError(formatError(failure));
    } finally {setBusy(false);}
  }
  return <section className="border border-line rounded p-3 space-y-3" aria-label="CMMC scope settings">
    <CmmcLevelSelect value={level} onChange={setLevel} disabled={busy||!!submission.current}/>
    <p className="text-xs text-ink-secondary">Retained assessment records support Level 1 and Level 2. Assessment progress is not a CMMC status, affirmation or certification.</p>
    <Button size="sm" variant="outline" onClick={()=>setOpen(true)}>Review scope change</Button>
    <Dialog open={open} onOpenChange={value=>{if(!busy&&!submission.current)setOpen(value);}}><DialogContent>
      <DialogHeader><DialogTitle>Confirm CMMC scope change</DialogTitle><DialogDescription>Level {configuration.level} → Level {level}. Existing answers, evidence and history remain retained.</DialogDescription></DialogHeader>
      <p className="text-sm">Only the active scope changes. Other programs, open corrective work and existing Review schedules remain intact.</p>
      <label className="text-sm">Reason{reduction?' (required)':' (optional)'}<Input value={reason} maxLength={2000} disabled={busy||!!submission.current} onChange={event=>setReason(event.target.value)}/></label>
      <label className="text-sm">Effective context date<Input type="date" value={date} max={new Date().toISOString().slice(0,10)} disabled={busy||!!submission.current} onChange={event=>setDate(event.target.value)}/></label>
      {error&&<div role="alert"><p>{error} Retry the same submission to recover an interrupted change.</p><Button variant="outline" disabled={busy} onClick={()=>{submission.current=null;setOpen(false);onSaved?.();}}>Reload current scope</Button></div>}
      <DialogFooter><Button variant="outline" disabled={busy||!!submission.current} onClick={()=>setOpen(false)}>Cancel</Button><Button disabled={busy||!date||reduction&&!reason.trim()} onClick={save}>{busy?'Saving…':submission.current?'Retry scope change':'Confirm scope change'}</Button></DialogFooter>
    </DialogContent></Dialog>
  </section>;
}
