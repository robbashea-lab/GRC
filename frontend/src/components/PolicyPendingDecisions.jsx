import {useEffect,useRef,useState} from 'react';
import api,{formatError} from '@/lib/api';
export default function PolicyPendingDecisions({clientId,rows,onOpen}) {
  const [result,setResult]=useState(null);
  const [opening,setOpening]=useState(null),[openError,setOpenError]=useState('');
  const detailRequest=useRef(null);
  useEffect(()=>{
    const c=new AbortController();setResult(null);setOpening(null);setOpenError('');
    if(clientId) api.get('/policies/pending-decisions',{params:{client_id:clientId},signal:c.signal})
      .then(({data})=>{if(!c.signal.aborted)setResult({clientId,items:data});})
      .catch(e=>{if(!c.signal.aborted)setResult({clientId,error:formatError(e)});});
    return()=>{c.abort();detailRequest.current?.abort();};
  },[clientId,rows]);
  async function openPolicy(id) {
    detailRequest.current?.abort();
    const c=new AbortController();detailRequest.current=c;setOpening(id);setOpenError('');
    try {
      // Pending summaries can include records outside the register's bounded page.
      // Reauthorize and load current content instead of opening a partial record.
      const {data}=await api.get('/policies/'+encodeURIComponent(id),{signal:c.signal});
      if(c.signal.aborted)return;
      if(data.client_id!==clientId||data.policy_id!==id)throw new Error('This Policy is unavailable in the current client.');
      onOpen(data);
    }catch(e){if(!c.signal.aborted)setOpenError(formatError(e));}
    finally{if(!c.signal.aborted)setOpening(null);}
  }
  if(!result||result.clientId!==clientId)return null;
  if(result.error)return <p role="alert" className="text-sm text-ink-secondary mb-3">Pending decisions could not be loaded: {result.error}</p>;
  return <details className="mb-3 border border-line rounded-md p-3 text-sm" open={result.items.length>0||undefined}>
    <summary className="cursor-pointer font-medium">Policies awaiting my approval ({result.items.length})</summary>
    {openError&&<p role="alert" className="mt-2 text-ink-secondary">Policy could not be opened: {openError} Select it again to retry.</p>}
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">{result.items.map(p=><button type="button" key={p.policy_id} disabled={opening!==null} aria-busy={opening===p.policy_id} className="text-link underline text-left disabled:opacity-60" onClick={()=>openPolicy(p.policy_id)}>{p.title}{opening===p.policy_id?' · Loading…':''}</button>)}</div>
  </details>;
}
