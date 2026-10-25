import RegisterIdentityLogo from '@/components/RegisterIdentityLogo';
import {registerCatalogLogo} from '@/lib/registerCatalogLogo';
import {useEffect,useRef,useState} from 'react';
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
import {AIIntakeView,useAIIntake} from '@/components/AIIntake';
import {ranks} from '@/lib/tableFilters';
import {AI_RELATIONSHIP_NOTICE} from '@/lib/aiGovernance';
import {isReferencePresentation,isCisReference,isReferenceWorkflow} from '@/lib/reference';
import {AI_VIEWS,aiMatches,aiNeedsAttention} from '@/lib/brawndoAI';
import BrawndoAICards from '@/components/BrawndoAICards';
import {BrawndoSurface,BrawndoPageHeader,BrawndoChips} from '@/components/BrawndoPage';
import {useAdditionalSectionsSurface,useAdditionalSectionsPresentation} from '@/lib/brawndoAdditionalScope';
import AIRegisterFirst from '@/components/AIRegisterFirst';
import AIOnboardingWizard from '@/components/AIOnboardingWizard';
import AIRecordView from '@/components/AIRecordView';
import AIProfileDialog from '@/components/AIProfileDialog';
import RecordDrawer from '@/components/RecordDrawer';
import {SCHEMAS} from '@/lib/schemas';
import evidenceSources from '@/lib/evidenceSources.json';
import {resolveEvidenceSource} from '@/lib/evidenceContext';
import AdditionalPagePending from '@/components/AdditionalPagePending';

const text=(key,label)=>({key,label,sortable:true});
export default function AIGovernance(){
  const {currentClientId}=useOrg(),{user,workspaceMode}=useAuth();
  const identity=JSON.stringify([currentClientId,user?.user_id,user?.role,workspaceMode,user?.workspace_mode]);
  return <AIWorkspace key={identity} identity={identity}/>;
}
function AIWorkspace({identity}){
  const {currentClientId,currentClient}=useOrg(),{user}=useAuth();
  const reference=isReferencePresentation(currentClientId,user),approvalPilot=isCisReference(currentClientId,user,currentClient),referenceWorkflow=isReferenceWorkflow(currentClientId,user,currentClient);
  const [showInactive,setShowInactive]=useState(false),[guided,setGuided]=useState(false),[relatedRevision,setRelatedRevision]=useState(0);
  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const [profileOpen,setProfileOpen]=useState(false),[nativeEdit,setNativeEdit]=useState(false),[nested,setNested]=useState(null),[relatedError,setRelatedError]=useState('');
  const [snapshot,setSnapshot]=useState(null),[error,setError]=useState(''),[revision,setRevision]=useState(0),[selected,setSelected]=useState(null),[search,setSearch]=useState(''),[quick,setQuick]=useState('active');
  const relatedRequest=useRef(0),originRecord=useRef(selected);
  if(originRecord.current!==selected){originRecord.current=selected;relatedRequest.current+=1;}
  const key=`${identity}:${revision}`;
  useEffect(()=>{const c=new AbortController();setSelected(null);setError('');if(!currentClientId)return;Promise.all([api.get('/ai_systems',{params:{client_id:currentClientId},signal:c.signal}),api.get(`/clients/${currentClientId}/members`,{signal:c.signal}),api.get('/ai-intake',{params:{client_id:currentClientId},signal:c.signal})]).then(([rows,members,intake])=>{if(!c.signal.aborted){if(rows.data.some(r=>r.client_id!==currentClientId))throw new Error('Client data mismatch');if(intake.data?.client_id!==currentClientId)throw new Error('AI intake could not be verified for this client.');setSnapshot({key,identity,clientId:currentClientId,rows:rows.data,members:members.data,intake:intake.data});}}).catch(e=>{if(!c.signal.aborted)setError(formatError(e));});return()=>c.abort();},[currentClientId,key,identity]);
  useEffect(()=>{setQuick('active');setSearch('');setShowInactive(false);},[currentClientId]);
  const data=snapshot?.identity===identity&&(reference?snapshot.clientId===currentClientId:snapshot.key===key)?snapshot:null,rows=data?.rows||[],members=data?.members||[];
  const additional=useAdditionalSectionsSurface('ai-governance',data&&!error&&data.identity===identity&&data.intake?.client_id===currentClientId?data.clientId:null);
  const additionalPresentation=useAdditionalSectionsPresentation('ai-governance');
  const columns=[text('display_id','ID'),text('name','AI System / Use Case'),{...text('owner_id','Owner'),filter:true,emptyLabel:'Unassigned',optionsOnly:true,options:members.map(u=>({value:u.user_id,label:u.name||u.email}))},text('provider','Provider'),{...text('purposes','Purpose / Use'),filter:true},{...text('risk_tier','Risk Tier'),filter:true,rank:ranks,emptyLabel:'Not Screened'},{...text('status','Status'),filter:true},{...text('last_review','Last Review'),filter:true,dateKind:'history',emptyLabel:'Never Reviewed'},{...text('next_review','Next Review'),filter:true,dateKind:'future',emptyLabel:'No Review Scheduled'}];
  const table=useTableControls({columns,rows,module:'ai-governance',scope:`${user?.user_id}:${currentClientId}`});
  const today=new Date().toISOString().slice(0,10),active=r=>!['suspended','retired'].includes(r.status);
  const presets=[['active','All Active',active],['due','Due for Review',r=>active(r)&&(typeof r.next_review!=='string'||r.next_review.slice(0,10)<=today)],['high','High Risk',r=>active(r)&&r.risk_tier==='high'],['third','Third-Party',r=>active(r)&&(r.vendor_id||r.provider||r.screening?.third_party)],['customer','Customer-Facing',r=>active(r)&&(r.purposes?.includes('Customer-Facing')||r.screening?.customer_facing)],['inactive','Inactive',r=>!active(r)]];
  const searched=rows.filter(r=>[r.display_id,r.name,r.provider,r.description,...(reference?[r.product_model,r.environment]:[]),...(r.purposes||[])].join(' ').toLowerCase().includes(search.toLowerCase()));
  const visible=referenceWorkflow?searched.filter(r=>quick==='attention'?aiNeedsAttention(r):aiMatches(r,quick,showInactive)):table.apply(searched.filter(presets.find(p=>p[0]===quick)?.[2]||active));
  const writable=isInternal(user);
  const [intakeEnabled,setIntakeEnabled]=useState(false);
  // Activate only where native intake is displayed, then retain its draft during appearance refreshes.
  useEffect(()=>{if(additional||data?.intake.usage==='no')setIntakeEnabled(true);},[additional,data?.intake.usage]);
  const intakeEditor=useAIIntake({clientId:currentClientId,canWrite:writable,onSaved:()=>setRevision(n=>n+1),enabled:intakeEnabled});
  function clear(){table.clear();setSearch('');setQuick('active');setShowInactive(false);}
  if(!currentClientId)return <p className="page-content">Select a client.</p>;
  const counts=Object.fromEntries(presets.map(([id,,test])=>[id,rows.filter(test).length]));
  const canAdd=writable&&!!data&&!error&&data.intake.usage!=='no';
  async function openRelated(kind,id,source){
    const generation=++relatedRequest.current,origin=selected;
    const stillCurrent=()=>mounted.current&&relatedRequest.current===generation&&originRecord.current===origin;
    const verify=row=>{if(row.client_id!==currentClientId||row[evidenceSources[kind]?.key]!==id)throw new Error('Related record identity could not be verified.');};
    setRelatedError('');
    try{
      if(source){const resolved=await resolveEvidenceSource(source,currentClientId);verify(resolved.record);if(stillCurrent())setNested(resolved);return;}
      if(!['risks','vendors','reviews','findings','tasks','policies','requirements'].includes(kind))throw new Error('This related record cannot be opened here.');
      const response=await api.get(`/${kind}/${encodeURIComponent(id)}`);
      verify(response.data);
      if(stillCurrent())setNested({kind,record:response.data});
    }catch(cause){if(stillCurrent())setRelatedError(formatError(cause));}
  }
  async function refreshRelatedRecord(){
    setNested(null);setRelatedRevision(value=>value+1);
    if(!selected?.ai_system_id)return;
    const id=selected.ai_system_id;
    try{
      const {data:records}=await api.get('/ai_systems',{params:{client_id:currentClientId}});
      const row=records.find(record=>record.ai_system_id===id&&record.client_id===currentClientId);
      if(!row)throw new Error('The updated AI record could not be verified. Close and reload the register.');
      if(mounted.current)setSelected(current=>current?.ai_system_id===id?row:current);
    }catch(cause){if(mounted.current)setRelatedError(formatError(cause));}
  }
  const SUBTITLE='AI systems and use cases, screened for governance attention. Not a legal classification.';
  const addAction=canAdd?<PrimaryAction label="New AI System" onClick={()=>setSelected({})} testid="new-ai-system"/>:null;
  // The complete native drawer stays outside the appearance branch so refreshes retain its draft.
  const Shell=reference?BrawndoSurface:'div';
  return <>{additionalPresentation&&!additional?<AdditionalPagePending className="baai-page" headerClassName="baai-page-head" title={`${currentClient.name} AI Governance`} subtitle={SUBTITLE} name="AI systems" loadingMessage="Loading AI systems…" error={error} onRetry={()=>setRevision(n=>n+1)}/>:additional?<><AIRegisterFirst clientName={currentClient?.name||'Organization'} rows={rows} users={members} intake={data.intake} canCreate={canAdd} onOpen={row=>{setGuided(true);setNativeEdit(false);setSelected(row);}} onCreate={()=>{setGuided(true);setNativeEdit(false);setSelected({});}} onProfile={()=>setProfileOpen(true)} onRelated={openRelated} query={search} view={quick} showInactive={showInactive} onSearch={setSearch} onView={setQuick} onShowInactive={setShowInactive}/>
    {rows.some(row=>row.relationship_integrity_warning)&&<p role="status" className="register-notice">{AI_RELATIONSHIP_NOTICE}</p>}
  </>:
  <Shell className="register-surface brawndo-ai-page">{reference?<BrawndoPageHeader eyebrow={`${currentClient?.name||'Client'} · AI systems`} title="AI Governance" subtitle={SUBTITLE}>{addAction}</BrawndoPageHeader>:<PageHeader title="AI Governance" subtitle={SUBTITLE}
      action={addAction?<HeaderActions>{addAction}</HeaderActions>:null}/>}
    {data?.intake.usage==='no'&&<div className="register-notice">AI usage is marked No. Historical records remain accessible; update intake before adding new systems.<AIIntakeView state={intakeEditor}/></div>}
    {!approvalPilot&&data?.intake.usage==='unsure'&&<p className="register-notice">AI applicability is not yet confirmed. Record known use cases and confirm intake in Client Profile.</p>}
    {rows.some(r=>r.relationship_integrity_warning)&&<p role="status" className="register-notice">{AI_RELATIONSHIP_NOTICE}</p>}
    <div className="register-toolbar">
      <SearchField label="Search AI systems" placeholder="Search AI systems…" value={search} onChange={setSearch} testid="ai-system-search"/>
      {referenceWorkflow?<BrawndoChips label="AI system views" chips={[...AI_VIEWS.filter(([id])=>approvalPilot||id!=='pending'),...(quick==='attention'?[['attention','Needing attention']]:[])].map(([id,label])=>({id,label,pressed:quick===id,onClick:()=>setQuick(id),testid:`ai-system-view-${id}`}))}/>:<ViewTabs views={presets.map(([id,label])=>({id,label}))} active={quick} onPick={setQuick} counts={counts} label="AI system views" testid="ai-system-views" testIdPrefix="ai-system-view-"/>}
      {referenceWorkflow&&<><label className="flex gap-2 text-sm"><input type="checkbox" checked={showInactive} onChange={e=>setShowInactive(e.target.checked)}/>Show Archived/Inactive</label>{(search||quick!=='active'||showInactive)&&<button className="text-sm text-link" onClick={clear}>Clear filters</button>}</>}
      <RegisterCount shown={visible.length} total={rows.length}/>
    </div>
    <div className="register-body">
      {!referenceWorkflow&&<TableFilterChips table={table}/>}
      <RegisterLoadError error={error} onRetry={()=>setRevision(n=>n+1)} name="AI systems"/>
      {referenceWorkflow?<>{!data&&!error&&<p role="status">Loading AI systems…</p>}{data&&!visible.length&&<p className="empty-state">{rows.length?'No AI systems match these filters.':'No AI systems recorded yet.'}</p>}{data&&<BrawndoAICards approvalPilot={approvalPilot} rows={visible} users={members} onOpen={setSelected}/>}</>:<div className="register-table-frame overflow-x-auto"><table className="w-full">
        <caption className="sr-only">AI systems and use cases. Screening tiers prioritize governance attention; organizational exposure belongs in Risks, and deficiencies and remediation in Findings and Action Items.</caption>
        <thead><tr>{columns.map(c=><SortableHeader key={c.key} table={table} column={c}/>)}</tr></thead>
        <tbody className="divide-y divide-line">
          {!data&&!error&&<TableLoadingRow colSpan={columns.length}/>}
          {data&&!visible.length&&<tr><td colSpan={columns.length} className="empty-state">{rows.length?<FilterEmpty table={table} name="AI systems" onClear={clear}/>:'No AI systems recorded yet.'}</td></tr>}
          {data&&visible.map(r=><tr key={r.ai_system_id} className="row-hover row-open" data-testid={`ai-system-row-${r.display_id}`} onClick={()=>setSelected(r)}>
            <td className="tbl-cell font-mono text-xs text-ink-help whitespace-nowrap">{r.display_id}</td>
            <td className="tbl-cell"><div className="register-identity"><RegisterIdentityLogo kind="ai" src={registerCatalogLogo('ai_systems',r)}/><button type="button" className="register-record-link" onClick={e=>{e.stopPropagation();setSelected(r);}}>{r.name}</button></div></td>
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
  </Shell>}
  {relatedError&&<p role="alert" className="register-notice">{relatedError}</p>}
  {selected&&data&&(guided&&!nativeEdit?(selected.ai_system_id?<AIRecordView refreshKey={relatedRevision} record={selected} clientId={currentClientId} users={members} canWrite={writable&&additional} onClose={()=>{setSelected(null);setRevision(value=>value+1);}} onEdit={()=>setNativeEdit(true)} onRelated={openRelated}/>:<AIOnboardingWizard contextAvailable={additional} clientId={currentClientId} users={members} onClose={()=>setSelected(null)} onVendor={id=>openRelated('vendors',id)} onSaved={()=>{setSelected(null);setRevision(n=>n+1);}}/>):<AIDrawer key={`${identity}:${selected.ai_system_id||'new'}`} open contextAvailable={!guided||additional} conceptPresentation={!nativeEdit&&(guided||additional)} template={selected.template} record={selected.ai_system_id?selected:null} clientId={currentClientId} users={members} onOpenChange={v=>{if(!v){setSelected(null);setNativeEdit(false);setRevision(n=>n+1);}}} onSaved={()=>setRevision(n=>n+1)}/>)}
  {profileOpen&&data&&<AIProfileDialog clientId={currentClientId} clientName={currentClient?.name||'Organization'} intake={data.intake} canWrite={writable&&additional} onClose={()=>setProfileOpen(false)} onSaved={()=>{setProfileOpen(false);setRevision(n=>n+1);}}/>}
  {nested&&<RecordDrawer {...nested} open clientId={currentClientId} users={members} schema={SCHEMAS[nested.kind]?.fields} onOpenChange={open=>{if(!open){relatedRequest.current+=1;setNested(null);}}} onSaved={refreshRelatedRecord}/>}
  </>;
}
