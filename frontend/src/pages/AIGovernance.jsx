import {useEffect,useState} from 'react';
import {useOrg} from '@/context/OrgContext';
import {useAuth} from '@/context/AuthContext';
import api,{formatError} from '@/lib/api';
import PageHeader from '@/components/PageHeader';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {useTableControls,ColumnControl,TableFilterChips} from '@/components/TableControls';
import AIDrawer from '@/components/AIDrawer';
import AIIntake from '@/components/AIIntake';
import {ranks} from '@/lib/tableFilters';

const text=(key,label)=>({key,label,sortable:true});
export default function AIGovernance(){
  const {currentClientId}=useOrg(),{user}=useAuth();
  const [snapshot,setSnapshot]=useState(null),[error,setError]=useState(''),[revision,setRevision]=useState(0),[selected,setSelected]=useState(null),[search,setSearch]=useState(''),[quick,setQuick]=useState('active');
  const key=`${currentClientId}:${revision}`;
  useEffect(()=>{const c=new AbortController();setSelected(null);setError('');if(!currentClientId)return;Promise.all([api.get('/ai_systems',{params:{client_id:currentClientId},signal:c.signal}),api.get(`/clients/${currentClientId}/members`,{signal:c.signal}),api.get('/ai-intake',{params:{client_id:currentClientId},signal:c.signal})]).then(([rows,members,intake])=>{if(!c.signal.aborted){if(rows.data.some(r=>r.client_id!==currentClientId))throw new Error('Client data mismatch');setSnapshot({key,rows:rows.data,members:members.data,intake:intake.data});}}).catch(e=>{if(!c.signal.aborted)setError(formatError(e));});return()=>c.abort();},[currentClientId,key]);
  useEffect(()=>{setQuick('active');setSearch('');},[currentClientId]);
  const data=snapshot?.key===key?snapshot:null,rows=data?.rows||[],members=data?.members||[];
  const columns=[text('display_id','ID'),text('name','AI System / Use Case'),{...text('owner_id','Owner'),filter:true,emptyLabel:'Unassigned',optionsOnly:true,options:members.map(u=>({value:u.user_id,label:u.name||u.email}))},text('provider','Provider'),{...text('purposes','Purpose / Use'),filter:true},{...text('risk_tier','Risk Tier'),filter:true,rank:ranks,emptyLabel:'Not Screened'},{...text('status','Status'),filter:true},{...text('last_review','Last Review'),filter:true,dateKind:'history',emptyLabel:'Never Reviewed'},{...text('next_review','Next Review'),filter:true,dateKind:'future',emptyLabel:'No Review Scheduled'}];
  const table=useTableControls({columns,rows,module:'ai-governance',scope:`${user?.user_id}:${currentClientId}`});
  const today=new Date().toISOString().slice(0,10),active=r=>!['suspended','retired'].includes(r.status);
  const presets=[['active','All Active',active],['due','Due for Review',r=>active(r)&&(!r.next_review||r.next_review.slice(0,10)<=today)],['high','High Risk',r=>active(r)&&r.risk_tier==='high'],['third','Third-Party',r=>active(r)&&(r.vendor_id||r.provider||r.screening?.third_party)],['customer','Customer-Facing',r=>active(r)&&(r.purposes?.includes('Customer-Facing')||r.screening?.customer_facing)],['inactive','Inactive',r=>!active(r)]];
  const visible=table.apply(rows.filter(presets.find(p=>p[0]===quick)[2]).filter(r=>[r.display_id,r.name,r.provider,r.description,...(r.purposes||[])].join(' ').toLowerCase().includes(search.toLowerCase())));
  const writable=['super_admin','platform_admin','client_contributor'].includes(user?.role);
  function clear(){table.clear();setSearch('');setQuick('active');}
  if(!currentClientId)return <p className="page-content">Select a client.</p>;
  return <div><PageHeader title="AI Governance" subtitle="AI Systems & Use Cases Register · Internal governance screening, not legal classification" action={writable&&data?.intake.usage!=='no'?<Button onClick={()=>setSelected({})}>Add AI System</Button>:null}/><div className="page-content space-y-4">{error?<p role="alert">{error} <button onClick={()=>setRevision(n=>n+1)}>Retry</button></p>:!data?<p>Loading AI Governance…</p>:<>
    {data.intake.usage==='no'&&<div className="text-sm text-ink-muted">AI usage is marked No. Historical records remain accessible; update intake before adding new systems.<AIIntake clientId={currentClientId} canWrite={writable} onSaved={()=>setRevision(n=>n+1)}/></div>}
    {data.intake.usage==='unsure'&&<p className="text-sm text-ink-muted">AI applicability is not yet confirmed. Record known use cases and confirm intake in Onboarding.</p>}
    <div className="flex flex-wrap gap-2 items-center"><Input className="max-w-xs" aria-label="Search AI systems" placeholder="Search AI systems…" value={search} onChange={e=>setSearch(e.target.value)}/>{presets.map(([id,label])=><button type="button" key={id} aria-pressed={quick===id} onClick={()=>setQuick(id)} className={`text-sm px-3 py-2 border border-line rounded ${quick===id?'bg-selected-bg':'bg-surface-card'}`}>{label}</button>)}</div><TableFilterChips table={table}/>
    <div className="register-table-frame border border-line rounded-md bg-surface-card overflow-x-auto"><table className="w-full text-sm"><thead><tr>{columns.map(c=><th className="tbl-head" key={c.key}><ColumnControl table={table} column={c}/></th>)}</tr></thead><tbody>{visible.map(r=><tr key={r.ai_system_id} className="row-hover border-t border-line" data-testid={`ai-row-${r.display_id}`}><td className="tbl-cell font-mono text-xs">{r.display_id}</td><td className="tbl-cell"><button className="text-link text-left font-medium" onClick={()=>setSelected(r)}>{r.name}</button></td><td className="tbl-cell">{members.find(u=>u.user_id===r.owner_id)?.name|| (r.owner_id?'Assigned user':'Unassigned')}</td><td className="tbl-cell">{r.provider||'—'}</td><td className="tbl-cell">{r.purposes?.join(', ')||'—'}</td><td className="tbl-cell capitalize">{r.risk_tier||'Not screened'}</td><td className="tbl-cell capitalize">{r.status.replaceAll('_',' ')}</td><td className="tbl-cell">{r.last_review?.slice(0,10)||'Never reviewed'}</td><td className="tbl-cell">{r.next_review?.slice(0,10)||'Not scheduled'}</td></tr>)}</tbody></table>{!visible.length&&<div className="p-6 text-sm text-ink-muted">{rows.length?'No AI systems match the current filters.':'No AI systems recorded yet.'}{rows.length>0&&<button className="text-link ml-2" onClick={clear}>Clear filters</button>}</div>}</div>
    <p className="text-xs text-ink-muted">Screening tiers prioritize governance attention. Organizational exposure belongs in Risks; deficiencies and remediation remain in Findings and Action Items.</p>
  </>}</div>{selected&&data&&<AIDrawer key={`${currentClientId}:${selected.ai_system_id||'new'}`} open record={selected.ai_system_id?selected:null} clientId={currentClientId} users={members} onOpenChange={v=>{if(!v){setSelected(null);setRevision(n=>n+1);}}} onSaved={()=>setRevision(n=>n+1)}/>}</div>;
}
