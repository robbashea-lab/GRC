import {useEffect,useState} from 'react';
import api,{formatError} from '@/lib/api';
export default function PolicyPendingDecisions({clientId,rows,onOpen}) {
  const [result,setResult]=useState(null);
  useEffect(()=>{
    const c=new AbortController();setResult(null);
    if(clientId) api.get('/policies/pending-decisions',{params:{client_id:clientId},signal:c.signal})
      .then(({data})=>{if(!c.signal.aborted)setResult({clientId,items:data});})
      .catch(e=>{if(!c.signal.aborted)setResult({clientId,error:formatError(e)});});
    return()=>c.abort();
  },[clientId,rows]);
  if(!result||result.clientId!==clientId)return null;
  if(result.error)return <p role="alert" className="text-sm text-ink-secondary mb-3">Pending decisions could not be loaded: {result.error}</p>;
  return <details className="mb-3 border border-line rounded-md p-3 text-sm" open={result.items.length>0||undefined}>
    <summary className="cursor-pointer font-medium">Policies awaiting my approval ({result.items.length})</summary>
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">{result.items.map(p=><button type="button" key={p.policy_id} className="text-link underline text-left" onClick={()=>onOpen(rows.find(r=>r.policy_id===p.policy_id)||p)}>{p.title}</button>)}</div>
  </details>;
}
