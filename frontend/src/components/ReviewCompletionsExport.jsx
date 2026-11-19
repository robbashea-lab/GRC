import {useEffect,useRef,useState} from 'react';
import {Download} from 'lucide-react';
import api,{formatError} from '@/lib/api';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './ui/dialog';

const day=date=>[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
const validDay=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
export default function ReviewCompletionsExport({clientId,scopeKey,disabled=false}){
  const [open,setOpen]=useState(false),[from,setFrom]=useState(()=>{const date=new Date();date.setMonth(date.getMonth()-12);return day(date);}),[to,setTo]=useState(()=>day(new Date()));
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const request=useRef(null),active=useRef(scopeKey);active.current=scopeKey;
  useEffect(()=>{setOpen(false);setBusy(false);setError('');setMessage('');return()=>{request.current?.abort();request.current=null;};},[clientId,scopeKey]);
  const valid=validDay(from)&&validDay(to)&&from<=to;
  async function download(event){
    event.preventDefault();if(!valid||disabled||!clientId||request.current)return;
    const controller=new AbortController();request.current=controller;setBusy(true);setError('');setMessage('');
    try{
      const {data,headers}=await api.get('/reviews/completions/export',{params:{client_id:clientId,from_date:from,to_date:to},responseType:'blob',signal:controller.signal});
      if(controller.signal.aborted||active.current!==scopeKey)return;
      const blob=data instanceof Blob?data:typeof data==='string'?new Blob([data],{type:'text/csv;charset=utf-8'}):null;
      if(!blob?.size||blob.type.includes('json')||blob.type.includes('html'))throw new Error('The review service did not return a completion CSV.');
      const filename=/filename="?([^";]+)"?/i.exec(headers?.['content-disposition']||'')?.[1]||`review-completions-${from}-${to}.csv`;
      const href=URL.createObjectURL(blob),link=document.createElement('a');link.href=href;link.download=filename.replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_');document.body.appendChild(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(href),1000);setMessage('Completion CSV download started.');
    }catch(failure){let text=formatError(failure);if(failure.response?.data instanceof Blob){try{const body=JSON.parse(await failure.response.data.text());if(typeof body.detail==='string')text=body.detail;}catch{/* Preserve the safe transport message. */}}if(!controller.signal.aborted&&active.current===scopeKey)setError(text);}
    finally{if(request.current===controller)request.current=null;if(!controller.signal.aborted&&active.current===scopeKey)setBusy(false);}
  }
  return <><button type="button" className="ghost native-completions-trigger" disabled={disabled||!clientId} onClick={()=>{setError('');setMessage('');setOpen(true);}}><Download size={15} aria-hidden="true"/>Export completions</button><Dialog open={open} onOpenChange={value=>{if(!busy)setOpen(value);}}><DialogContent className="native-completion-export max-w-lg"><DialogTitle>Export review completions</DialogTitle><DialogDescription>Export actual saved review completions in the selected date range. The register CSV remains available separately.</DialogDescription><form onSubmit={download}><fieldset disabled={busy}><label>From<input type="date" aria-label="Completion export from" required value={from} onChange={event=>setFrom(event.target.value)}/></label><label>To<input type="date" aria-label="Completion export to" required value={to} onChange={event=>setTo(event.target.value)}/></label></fieldset>{!valid&&<p role="alert">Choose valid dates with From on or before To.</p>}{error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}<div className="native-export-actions"><button type="button" className="ghost" disabled={busy} onClick={()=>setOpen(false)}>Cancel</button><button type="submit" className="cta" disabled={busy||!valid}>{busy?'Preparing CSV…':'Export CSV'}</button></div></form></DialogContent></Dialog></>;
}
