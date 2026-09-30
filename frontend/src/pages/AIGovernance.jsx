import {useEffect,useState} from 'react';
import { isInternal } from '@/lib/permissions';
import {useOrg} from '@/context/OrgContext';
import {useAuth} from '@/context/AuthContext';
import api,{formatError} from '@/lib/api';
import PageHeader from '@/components/PageHeader';
import {useTableControls,TableFilterChips,FilterEmpty} from '@/components/TableControls';
import {HeaderActions,PrimaryAction,SearchField,ViewTabs,RegisterCount,SortableHeader} from '@/components/Register';
import {DueDate,HistoryDate,OwnerCell} from '@/components/RegisterCells';
import StatusBadge,{SeverityBadge} from '@/components/StatusBadge';
import TableLoadingRow from '@/components/TableLoadingRow';
import RegisterLoadError from '@/components/RegisterLoadError';
import AIDrawer from '@/components/AIDrawer';
import AIIntake from '@/components/AIIntake';
import {ranks} from '@/lib/tableFilters';
import {isBrawndoReference} from '@/lib/reference';
import {AI_VIEWS,aiMatches} from '@/lib/brawndoAI';
import BrawndoAICards from '@/components/BrawndoAICards';

const text=(key,label)=>({key,label,sortable:true});
export default function AIGovernance(){
  const {currentClientId}=useOrg(),{user}=useAuth();
  const pilot=isBrawndoReference(currentClientId,user);
  const [showInactive,setShowInactive]=useState(false);
  const [snapshot,setSnapshot]=useState(null),[error,setError]=useState(''),[revision,setRevision]=useState(0),[selected,setSelected]=useState(null),[search,setSearch]=useState(''),[quick,setQuick]=useState('active');
  const key=`${currentClientId}:${revision}`;
  useEffect(()=>{const c=new AbortController();setSelected(null);setError('');if(!currentClientId)return;Promise.all([api.get('/ai_systems',{params:{client_id:currentClientId},signal:c.signal}),api.get(`/clients/${currentClientId}/members`,{signal:c.signal}),api.get('/ai-intake',{params:{client_id:currentClientId},signal:c.signal})]).then(([rows,members,intake])=>{if(!c.signal.aborted){if(rows.data.some(r=>r.client_id!==currentClientId))throw new Error('Client data mismatch');setSnapshot({key,clientId:currentClientId,rows:rows.data,members:members.data,intake:intake.data});}}).catch(e=>{if(!c.signal.aborted)setError(formatError(e));});return()=>c.abort();},[currentClientId,key]);
  useEffect(()=>{setQuick('active');setSearch('');setShowInactive(false);},[currentClientId]);
  const data=snapshot&&(pilot?snapshot.clientId===currentClientId:snapshot.key===key)?snapshot:null,rows=data?.rows||[],members=data?.members||[];
  const columns=[text('display_id','ID'),text('name','AI System / Use Case'),{...text('owner_id','Owner'),filter:true,emptyLabel:'Unassigned',optionsOnly:true,options:members.map(u=>({value:u.user_id,label:u.name||u.email}))},text('provider','Provider'),{...text('purposes','Purpose / Use'),filter:true},{...text('risk_tier','Risk Tier'),filter:true,rank:ranks,emptyLabel:'Not Screened'},{...text('status','Status'),filter:true},{...text('last_review','Last Review'),filter:true,dateKind:'history',emptyLabel:'Never Reviewed'},{...text('next_review','Next Review'),filter:true,dateKind:'future',emptyLabel:'No Review Scheduled'}];
  const table=useTableControls({columns,rows,module:'ai-governance',scope:`${user?.user_id}:${currentClientId}`});
  const today=new Date().toISOString().slice(0,10),active=r=>!['suspended','retired'].includes(r.status);
  const presets=[['active','All Active',active],['due','Due for Review',r=>active(r)&&(!r.next_review||r.next_review.slice(0,10)<=today)],['high','High Risk',r=>active(r)&&r.risk_tier==='high'],['third','Third-Party',r=>active(r)&&(r.vendor_id||r.provider||r.screening?.third_party)],['customer','Customer-Facing',r=>active(r)&&(r.purposes?.includes('Customer-Facing')||r.screening?.customer_facing)],['inactive','Inactive',r=>!active(r)]];
  const searched=rows.filter(r=>[r.display_id,r.name,r.provider,r.description,...(pilot?[r.product_model,r.environment]:[]),...(r.purposes||[])].join(' ').toLowerCase().includes(search.toLowerCase()));
  const visible=pilot?searched.filter(r=>aiMatches(r,quick,showInactive)):table.apply(searched.filter(presets.find(p=>p[0]===quick)?.[2]||active));
  const writable=isInternal(user);
  function clear(){table.clear();setSearch('');setQuick('active');setShowInactive(false);}
  if(!currentClientId)return <p className="page-content">Select a client.</p>;
  const counts=Object.fromEntries(presets.map(([id,,test])=>[id,rows.filter(test).length]));
  const canAdd=writable&&data?.intake.usage!=='no';
  return <div className="register-surface"><PageHeader title="AI Governance" subtitle="AI systems and use cases, screened for governance attention. Not a legal classification."
      action={canAdd?<HeaderActions><PrimaryAction label="New AI System" onClick={()=>setSelected({})} testid="new-ai-system"/></HeaderActions>:null}/>
    {data?.intake.usage==='no'&&<div className="register-notice">AI usage is marked No. Historical records remain accessible; update intake before adding new systems.<AIIntake clientId={currentClientId} canWrite={writable} onSaved={()=>setRevision(n=>n+1)}/></div>}
    {!pilot&&data?.intake.usage==='unsure'&&<p className="register-notice">AI applicability is not yet confirmed. Record known use cases and confirm intake in Client Profile.</p>}
    <div className="register-toolbar">
      <SearchField label="Search AI systems" placeholder="Search AI systems…" value={search} onChange={setSearch} testid="ai-system-search"/>
      <ViewTabs views={(pilot?AI_VIEWS:presets).map(([id,label])=>({id,label}))} active={quick} onPick={setQuick} counts={pilot?undefined:counts} label="AI system views" testid="ai-system-views" testIdPrefix="ai-system-view-"/>
      {pilot&&<><label className="flex gap-2 text-sm"><input type="checkbox" checked={showInactive} onChange={e=>setShowInactive(e.target.checked)}/>Show Archived/Inactive</label>{(search||quick!=='active'||showInactive)&&<button className="text-sm text-link" onClick={clear}>Clear filters</button>}</>}
      <RegisterCount shown={visible.length} total={rows.length}/>
    </div>
    <div className="register-body">
      {!pilot&&<TableFilterChips table={table}/>}
      <RegisterLoadError error={error} onRetry={()=>setRevision(n=>n+1)} name="AI systems"/>
      {pilot?<>{!data&&!error&&<p role="status">Loading AI systems…</p>}{data&&!visible.length&&<p className="empty-state">{rows.length?'No AI systems match these filters.':'No AI systems recorded yet.'}</p>}{data&&<BrawndoAICards rows={visible} users={members} onOpen={setSelected}/>}</>:<div className="register-table-frame overflow-x-auto"><table className="w-full">
        <caption className="sr-only">AI systems and use cases. Screening tiers prioritize governance attention; organizational exposure belongs in Risks, and deficiencies and remediation in Findings and Action Items.</caption>
        <thead><tr>{columns.map(c=><SortableHeader key={c.key} table={table} column={c}/>)}</tr></thead>
        <tbody className="divide-y divide-line">
          {!data&&!error&&<TableLoadingRow colSpan={columns.length}/>}
          {data&&!visible.length&&<tr><td colSpan={columns.length} className="empty-state">{rows.length?<FilterEmpty table={table} name="AI systems" onClear={clear}/>:'No AI systems recorded yet.'}</td></tr>}
          {data&&visible.map(r=><tr key={r.ai_system_id} className="row-hover row-open" data-testid={`ai-system-row-${r.display_id}`} onClick={()=>setSelected(r)}>
            <td className="tbl-cell font-mono text-xs text-ink-help whitespace-nowrap">{r.display_id}</td>
            <td className="tbl-cell"><button type="button" className="register-record-link" onClick={e=>{e.stopPropagation();setSelected(r);}}>{r.name}</button></td>
            <td className="tbl-cell"><OwnerCell people={members} id={r.owner_id} status={r.status}/></td>
            <td className="tbl-cell text-ink-secondary">{r.provider||<span className="register-empty">—</span>}</td>
            <td className="tbl-cell text-ink-secondary">{r.purposes?.join(', ')||<span className="register-empty">—</span>}</td>
            <td className="tbl-cell">{r.risk_tier?<SeverityBadge value={r.risk_tier}/>:<span className="register-empty">Not screened</span>}</td>
            <td className="tbl-cell"><StatusBadge value={r.status}/></td>
            <td className="tbl-cell"><HistoryDate value={r.last_review} empty="Never reviewed"/></td>
            <td className="tbl-cell">{r.next_review?<DueDate iso={r.next_review} closed={['suspended','retired'].includes(r.status)}/>:<span className="register-empty">Not scheduled</span>}</td>
          </tr>)}
        </tbody>
      </table></div>}
    </div>
  {selected&&data&&<AIDrawer key={`${currentClientId}:${selected.ai_system_id||'new'}`} open record={selected.ai_system_id?selected:null} clientId={currentClientId} users={members} onOpenChange={v=>{if(!v){setSelected(null);setRevision(n=>n+1);}}} onSaved={()=>setRevision(n=>n+1)}/>}</div>;
}
