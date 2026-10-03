import {useEffect,useState} from 'react';
import api,{formatError} from '@/lib/api';
import {cisReviewBriefs} from '@/lib/cisOperations';

export default function CisReviewBrief({record,onOpen,historical=false}){
  const briefs=cisReviewBriefs(record||{}),cid=record?.client_id;
  const [workspace,setWorkspace]=useState(null),[error,setError]=useState('');
  const relevant=briefs.length>0;
  useEffect(()=>{if(!relevant||!cid)return;const c=new AbortController();setWorkspace(null);setError('');api.get('/frameworks/cis-ig1',{params:{client_id:cid},signal:c.signal}).then(({data})=>{if(!c.signal.aborted)setWorkspace({cid,rows:data.assessments});}).catch(e=>{if(!c.signal.aborted)setError(formatError(e));});return()=>c.abort();},[cid,relevant]);
  if(!relevant)return null;
  return <details className="border border-line rounded p-3 text-sm" data-testid="cis-review-brief">
    <summary className="cursor-pointer font-medium">CIS execution brief</summary>
    <p className="text-xs text-ink-secondary my-3">Current shared CIS v8.1 guidance—not {historical?'a replacement for the historical conclusion':'a mandatory checklist'}. Client-written descriptions and completed history are unchanged. Supporting records may be combined; no separate upload is required.</p>
    {briefs.map(brief=><section key={brief.key} className="space-y-2 mb-3">
      <h3 className="font-medium">{brief.title}{!brief.active&&' · Retained program mapping'}</h3>
      <p className="text-xs text-ink-secondary">Governance schedule: {record.recurrence||'Not scheduled'} · Operational duties: {brief.source_cadence}</p>
      <ul className="space-y-3">{brief.items.map(d=>{const row=workspace?.cid===cid&&workspace.rows?.find(r=>r.definition_id===d.id);return <li key={d.id}>
        {row?<button className="text-link text-left" onClick={event=>onOpen(row,event.currentTarget)}>{d.id} · {d.title}</button>:<span>{d.id} · {d.title} · {error?'Assessment unavailable':workspace?'No retained assessment':'Loading assessment link…'}</span>}
        <p>{d.review}</p><p className="text-xs text-ink-secondary">Expected outcome: {d.outcome}</p><p className="text-xs text-ink-secondary">Supporting examples: {d.evidence}</p><p className="text-xs text-ink-secondary">Operation / trigger: {d.source_cadence}</p>
      </li>;})}</ul>
    </section>)}
    {error&&<p role="alert" className="text-xs">Safeguard links could not be loaded: {error}</p>}
  </details>;
}
