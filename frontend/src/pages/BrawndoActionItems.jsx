import {useCallback,useEffect,useRef,useState} from 'react';
import {Navigate,useLocation,useSearchParams} from 'react-router-dom';
import {useAuth} from '@/context/AuthContext';
import {useOrg} from '@/context/OrgContext';
import api,{formatError} from '@/lib/api';
import {isBrawndoReference} from '@/lib/reference';
import {unifiedActions,pilotActionMatches,pilotActionStatus,pilotActionColumns,pilotPriority,finished} from '@/lib/brawndoActions';
import {tableColumns} from '@/lib/tableColumns';
import RecordListPage from './RecordListPage';
import RecordDrawer from '@/components/RecordDrawer';
import PageHeader from '@/components/PageHeader';
import {HeaderActions,PrimaryAction,SearchField,ViewTabs,RegisterCount,SortableHeader} from '@/components/Register';
import {useTableControls,TableFilterChips,FilterEmpty} from '@/components/TableControls';
import {DueDate,OwnerCell} from '@/components/RegisterCells';
import StatusBadge,{SeverityBadge} from '@/components/StatusBadge';
import RegisterLoadError from '@/components/RegisterLoadError';
import TableLoadingRow from '@/components/TableLoadingRow';
import {Button} from '@/components/ui/button';
import {AlertCircle,CalendarDays,ListChecks,UserRound,ArrowRight} from 'lucide-react';
import '@/components/ClientWorkDashboard.css';

const views=[['active','Active'],['overdue','Overdue'],['in_progress','In Progress'],['open','Open'],['completed','Completed']].map(([id,label])=>({id,label}));
const summaries=[['overdue','Overdue','pastDue',AlertCircle],['upcoming','Upcoming (30 days)','due30',CalendarDays],['active','All Open','all',ListChecks],['unassigned','Unassigned','unassigned',UserRound]];
const labels={open:'Open',in_progress:'In Progress',overdue:'Overdue',completed:'Completed'};

export function FindingsRoute(){
  const {currentClientId}=useOrg(),{user}=useAuth(),location=useLocation();
  return isBrawndoReference(currentClientId,user)?<Navigate replace to={'/action-items'+location.search} state={location.state}/>:<RecordListPage kind="findings"/>;
}

export default function BrawndoActionItems(){
  const {currentClientId}=useOrg(),{user}=useAuth();
  const [params,setParams]=useSearchParams(),view=params.get('view')||'active',q=params.get('q')||'';
  const [data,setData]=useState({}),[users,setUsers]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[drawer,setDrawer]=useState(null);
  const sequence=useRef(0),opened=useRef('');
  const load=useCallback(async()=>{
    const version=++sequence.current;setLoading(true);setError('');
    try{
      const kinds=['tasks','findings','reviews','risks','vendors','policies'];
      const results=await Promise.all(kinds.map(k=>api.get('/'+k,{params:{client_id:currentClientId}})));
      const records=Object.fromEntries(kinds.map((k,i)=>[k,results[i].data.filter(r=>r.client_id===currentClientId)]));
      const aids=[...new Set([...records.tasks,...records.findings].map(r=>r.framework_assessment_id).filter(Boolean))];
      const [people,assessments,...frameworks]=await Promise.all([api.get(`/clients/${currentClientId}/members`),api.get('/onboarding/state',{params:{client_id:currentClientId}}),...aids.map(id=>api.get('/framework_assessments/'+encodeURIComponent(id)).catch(()=>({data:null})))]);
      if(version!==sequence.current)return;
      setData({...records,assessments:assessments.data.assessments||[],framework_assessments:frameworks.map(r=>r.data).filter(r=>r?.client_id===currentClientId)});setUsers(people.data);
    }catch(e){if(version===sequence.current)setError(formatError(e));}
    finally{if(version===sequence.current)setLoading(false);}
  },[currentClientId]);
  useEffect(()=>{const generation=sequence;setData({});setDrawer(null);opened.current='';load();return()=>{generation.current++;};},[load]);
  const rows=unifiedActions(data,currentClientId);
  const table=useTableControls({columns:pilotActionColumns(tableColumns('action-items',{rows,users}),rows),rows,module:'brawndo-actions',scope:`${user?.user_id}:${currentClientId}`,
    onFilterChange:(key,values)=>{const next=new URLSearchParams(params);if(['status','due_date'].includes(key)&&values.length)next.set('view','all');if(key==='owner_id'||key===null){next.delete('owner');next.delete('unassigned');}if(next.toString()!==params.toString())setParams(next,{replace:true});}});
  function selectView(value){table.replaceState({...table.state,filters:{...table.state.filters,status:[],due_date:[],owner_id:[]}});const next=new URLSearchParams(params);next.set('view',value);next.delete('owner');next.delete('unassigned');setParams(next,{replace:true});}
  function open(row){setDrawer({kind:row.kind,record:row.raw});}
  const deepId=params.get('finding_id')||params.get('id');
  useEffect(()=>{
    if(loading||!deepId||opened.current===deepId)return;
    const finding=data.findings?.find(f=>f.finding_id===deepId&&f.client_id===currentClientId);
    opened.current=deepId;
    if(finding){const actions=data.tasks?.filter(t=>t.finding_id===finding.finding_id)||[];setDrawer(actions.length===1?{kind:'tasks',record:actions[0]}:{kind:'findings',record:finding});}else setError('The requested Finding is unavailable for this client.');
  },[deepId,loading,data.findings,data.tasks,currentClientId]);
  const pending=(data.findings||[]).filter(f=>!['closed','accepted'].includes(f.status)&&data.tasks?.some(t=>t.finding_id===f.finding_id)&&data.tasks.filter(t=>t.finding_id===f.finding_id).every(t=>['done','cancelled'].includes(t.status)));
  const filtered=table.apply(rows.filter(r=>pilotActionMatches(r,view)&&(!params.get('owner')||r.owner_id===(params.get('owner')==='__me__'?user.user_id:params.get('owner')))&&(params.get('unassigned')!=='1'||!r.owner_id)&&[r.title,r.raw.description,r.finding?.title,r.finding?.description,r.source.label,users.find(u=>u.user_id===r.owner_id)?.name].filter(Boolean).join(' ').toLowerCase().includes(q.trim().toLowerCase())));
  const canWrite=['super_admin','platform_admin','client_grc_manager','client_contributor'].includes(user?.role);
  return <div className="register-surface">
    <PageHeader title="Action Items" subtitle="Corrective actions and assigned work, with their original Finding and source retained." action={canWrite&&<HeaderActions>{['super_admin','platform_admin'].includes(user?.role)&&<Button variant="outline" onClick={()=>setDrawer({kind:'findings',record:null})}>New Finding</Button>}<PrimaryAction label="New Action Item" testid="new-action-item" onClick={()=>setDrawer({kind:'tasks',record:null})}/></HeaderActions>}/>
    <div className="client-work-filters mx-[var(--register-gutter)] my-4" aria-label="Action summaries">{summaries.map(([id,label,tone,Icon])=><button key={id} className={`client-work-filter filter-${tone}`} aria-pressed={view===id} onClick={()=>selectView(view===id?'all':id)}><Icon size={22} aria-hidden="true"/><span>{label}<strong>{loading&&!rows.length?'—':rows.filter(r=>pilotActionMatches(r,id)).length}</strong></span><ArrowRight size={16} aria-hidden="true"/></button>)}</div>
    {!!pending.length&&<details className="mx-[var(--register-gutter)] mb-3 text-sm"><summary className="cursor-pointer">{pending.length} Finding{pending.length===1?'':'s'} with no outstanding Actions still need resolution</summary><p className="text-ink-secondary my-2">Action completion does not validate or close a Finding.</p>{pending.map(f=><button key={f.finding_id} className="block text-link underline text-left mb-2" onClick={()=>setDrawer({kind:'findings',record:f})}>{f.title} · {f.status==='remediated'?'Pending validation':f.status}</button>)}</details>}
    <div className="register-toolbar"><SearchField label="Search action items" placeholder="Search action items…" testid="ai-search" value={q} onChange={value=>{const next=new URLSearchParams(params);next.set('q',value);setParams(next,{replace:true});}}/>
      <ViewTabs views={views} active={view} label="Action Item views" testid="ai-views" testIdPrefix="ai-view-" onPick={selectView}/>
      <Button variant="ghost" size="sm" disabled={view==='all'} onClick={()=>selectView('all')}>Clear summary filter</Button><RegisterCount shown={filtered.length} total={rows.length}/>
    </div>
    <div className="register-body">{(params.get('owner')||params.get('unassigned')==='1')&&<div className="text-sm my-2">Assigned To: {params.get('unassigned')==='1'?'Unassigned':users.find(u=>u.user_id===(params.get('owner')==='__me__'?user.user_id:params.get('owner')))?.name||'Selected user'} <button className="underline" onClick={()=>{const next=new URLSearchParams(params);next.delete('owner');next.delete('unassigned');setParams(next,{replace:true});}}>Clear assignment filter</button></div>}<TableFilterChips table={table}/><RegisterLoadError error={error} name="action items" onRetry={load}/>
      <div className="register-table-frame bg-surface-card border border-line rounded-lg overflow-x-auto"><table className="w-full text-sm min-w-[1050px]"><thead><tr>{['title','priority','owner_id','due_date','status','source_type'].map(key=><SortableHeader key={key} table={table} columnKey={key}/>)}</tr></thead><tbody className="divide-y divide-line">
        {loading&&!rows.length&&<TableLoadingRow colSpan={6}/>}
        {!loading&&!error&&!filtered.length&&<tr><td colSpan={6} className="py-10"><FilterEmpty table={table} name="action items" onClear={()=>setParams(new URLSearchParams('view=all'),{replace:true})}/></td></tr>}
        {filtered.map((r,i)=><tr key={r.kind+':'+r.id} data-testid={`ai-row-${i}`} className="row-hover row-open" onClick={()=>open(r)}>
          <td className="tbl-cell max-w-sm"><button className="register-record-link text-left" onClick={e=>{e.stopPropagation();open(r);}}>{r.title}</button><span className="register-subline">{r.itemType}{r.kind==='findings'?' · No corrective Action linked':''}</span>{r.finding&&r.kind==='tasks'&&<span className="register-subline line-clamp-2">{r.finding.title}</span>}</td>
          <td className="tbl-cell"><SeverityBadge value={r.priority||'unknown'} label={pilotPriority(r.priority)}/></td>
          <td className="tbl-cell"><OwnerCell people={users} id={r.owner_id} status={r.raw.status}/></td>
          <td className="tbl-cell">{r.due_date?<DueDate iso={r.due_date} closed={finished(r)}/>:<span className="text-ink-secondary">No due date</span>}</td>
          <td className="tbl-cell"><StatusBadge value={pilotActionStatus(r)} label={labels[pilotActionStatus(r)]}/>{['blocked','cancelled','accepted','remediated'].includes(r.raw.status)&&<span className="register-subline">{r.raw.status==='remediated'?'Pending validation':r.raw.status}</span>}</td>
          <td className="tbl-cell max-w-xs">{r.source.target?<button className="text-link underline text-left" onClick={e=>{e.stopPropagation();setDrawer({kind:r.source.kind,record:r.source.target,initialValues:r.source.initialValues});}}>{r.source.label}</button>:<span>{r.source.id?'Linked source unavailable':r.source.label}</span>}{r.source.detail&&<span className="register-subline">{r.source.detail}</span>}</td>
        </tr>)}
      </tbody></table></div>
    </div>
    {drawer&&<RecordDrawer open kind={drawer.kind} record={drawer.record} initialValues={drawer.initialValues} clientId={currentClientId} users={users} onSaved={load} onOpenChange={v=>{if(!v){setDrawer(null);const next=new URLSearchParams(params);next.delete('finding_id');next.delete('id');setParams(next,{replace:true});}}}/>}
  </div>;
}
