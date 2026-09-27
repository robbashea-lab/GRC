import {useEffect,useState} from 'react';
import api,{formatError} from '@/lib/api';
import {Button} from './ui/button';
import ReviewDrawer from './ReviewDrawer';

export default function IsoGovernanceReviews({clientId,soa=false}) {
  const [rows,setRows]=useState([]),[error,setError]=useState(''),[selected,setSelected]=useState(null),[revision,setRevision]=useState(0);
  useEffect(()=>{const c=new AbortController();api.get('/reviews',{params:{client_id:clientId},signal:c.signal}).then(r=>setRows(r.data)).catch(e=>{if(!c.signal.aborted)setError(formatError(e));});return()=>c.abort();},[clientId,revision]);
  const keys=soa?['iso-soa-review']:['iso-risk-assessment','iso-management-review','iso-corrective-review'];
  const reviews=rows.filter(r=>(r.framework_drivers||[r]).some(d=>keys.includes(d.framework_plan_key)));
  return <section className="border border-line rounded-lg p-4 space-y-2" aria-label={soa?'SoA governance':'ISMS governance'}>
    <h3 className="text-sm font-semibold">{soa?'Statement of Applicability governance':'ISMS governance Reviews'}</h3>
    <p className="text-xs text-ink-secondary">{soa?'All 93 Annex A controls remain visible, including exclusions. The central SoA Review owns its schedule; future completed occurrences retain the then-current SoA. Earlier occurrences are not backfilled.':'Risk assessment, Management Review and corrective-action governance use the central Reviews queue.'}</p>
    {error&&<p role="alert" className="text-sm">{error}</p>}
    <div className="flex flex-wrap gap-2">{reviews.map(r=><Button key={r.review_id} size="sm" variant="outline" onClick={()=>setSelected(r)}>{r.title} · {r.due_date?.slice(0,10)||'Needs scheduling'}</Button>)}</div>
    {!reviews.length&&!error&&<p className="text-xs text-ink-secondary">No configured Review found. Use the requirement’s Reviews & recurrence setup to link or schedule existing work.</p>}
    {selected&&<ReviewDrawer open record={selected} clientId={clientId} onOpenChange={v=>{if(!v){setSelected(null);setRevision(n=>n+1);}}} onSaved={()=>setRevision(n=>n+1)}/>}
  </section>;
}
