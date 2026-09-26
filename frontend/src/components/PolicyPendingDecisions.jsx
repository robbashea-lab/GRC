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
  if(result.error)return <p role="alert" className="register-notice">Pending decisions could not be loaded: {result.error}</p>;
  // Nothing awaiting a decision: no empty bar. Otherwise one compact notice above the register.
  if(!result.items.length)return null;
  return <section className="register-notice" aria-label="Policies awaiting my approval">
    <span className="register-notice-title">Awaiting my approval ({result.items.length})</span>
    {result.items.map(p=><button type="button" key={p.policy_id} disabled={opening!==null} aria-busy={opening===p.policy_id} className="register-link disabled:opacity-60" onClick={()=>openPolicy(p.policy_id)}>{p.title}{opening===p.policy_id?' · Loading…':''}</button>)}
    {openError&&<p role="alert" className="w-full text-ink-secondary">Policy could not be opened: {openError} Select it again to retry.</p>}
  </section>;
}
