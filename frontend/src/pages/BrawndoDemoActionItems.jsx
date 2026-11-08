import {useBrawndoTheme} from '@/lib/brawndoTheme';
import {CisActionItemsOverview,CisActionItemsSummary,ActionConceptPriority,ActionConceptDue,useActionConceptClock} from '@/components/CisActionItemsConcept';
import {quarterlyChartScope} from '@/lib/quarterlyProgramTimeline';
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {Search,Plus} from 'lucide-react';
import {useLocation,useNavigationType,useSearchParams} from 'react-router-dom';
import {useAuth} from '@/context/AuthContext';
import {useOrg} from '@/context/OrgContext';
import {useActionRegisterData} from '@/lib/useActionRegisterData';
import {unifiedActions} from '@/lib/brawndoActions';
import {ticketStage} from '@/lib/remediationTickets';
import {brawndoEligibleOwnerIds,brawndoTicketMetrics,brawndoTicketMatches,brawndoNeedsOwner,brawndoDueWindow} from '@/lib/brawndoDemoActions';
import {canOperate,isInternal} from '@/lib/permissions';
import {personLabel} from '@/lib/people';
import {displayDay,displayRecordedAt} from '@/lib/managementDates';
import {daysDue} from '@/lib/actionItems';
import {recordUuid} from '@/lib/recordUuid';
import {BrawndoSurface,BrawndoPageHeader} from '@/components/BrawndoPage';
import SurfaceThemeAction from '@/components/SurfaceThemeAction';
import RecordDrawer from '@/components/RecordDrawer';
import {ActionOwner,actionSourceChip} from './BrawndoActionPresentation';

const labels={open:'Open',in_progress:'In progress',blocked:'Blocked',pending_validation:'Pending validation',completed:'Completed',accepted:'Accepted',cancelled:'Cancelled'};
const windows=[['overdue','Overdue'],['next14','Next 14 days'],['15_30','15–30 days'],['31_60','31–60 days'],['later','Later']];
const sourceKey=row=>row.source.kind||row.source.type||'unknown';
const sourceLabel=key=>({framework_assessments:'Assessment',reviews:'Review',risks:'Risk',vendors:'Vendor',policies:'Policy',assessments:'Audit / Assessment',manual:'Manual',unknown:'Origin not recorded'})[key]||key;
const priorities={critical:4,immediate:4,high:3,medium:2,moderate:2,low:1,informational:0};

// Mounted only by the narrow route gate, keyed to authenticated actor, mode and client.
export default function BrawndoDemoActionItems({suspended=false}){
  const [theme]=useBrawndoTheme();
  const now=useActionConceptClock();
  const auth=useAuth(),{user}=auth,org=useOrg(),{currentClientId,currentClient}=org;
  const {data,users,loading,error,load}=useActionRegisterData(currentClientId,{retainOnRefreshError:true});
  const [params,setParams]=useSearchParams(),location=useLocation(),navigationType=useNavigationType();
  const [drawer,setDrawer]=useState(null),[linkError,setLinkError]=useState(''),[refreshError,setRefreshError]=useState('');
  const [pendingNavigation,setPendingNavigation]=useState(null),[closeRequest,setCloseRequest]=useState(0);
  const urlQuery=params.get('q')||'',[query,setQuery]=useState(urlQuery);
  const searchRevision=useRef(0),searchOwner=useRef(null);searchOwner.current ||= recordUuid();
  const opened=useRef(''),mounted=useRef(true),conceptFocus=useRef(null);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useLayoutEffect(()=>{
    if(suspended)document.documentElement.dataset.brawndoDemoActionsSuspended='true';
    else delete document.documentElement.dataset.brawndoDemoActionsSuspended;
    return()=>{delete document.documentElement.dataset.brawndoDemoActionsSuspended;};
  },[suspended]);
  useEffect(()=>{const own=location.state?.actionSearch;if(navigationType!=='POP'&&own?.owner===searchOwner.current&&own.revision<searchRevision.current)return;setQuery(urlQuery);},[urlQuery,location.state,navigationType]);
  const rows=unifiedActions(data,currentClientId).map(row=>({...row,source:{...row.source,type:row.source.type||(['manual'].includes(row.raw.source_type||row.raw.source)?'manual':'unknown')}})),eligible=brawndoEligibleOwnerIds(users),metrics=brawndoTicketMetrics(rows,eligible,now);
  const view=params.get('view')||(params.get('signal')==='material'?'high_critical':'active'),quick=params.get('quick')||'',source=params.get('source')||'',sort=params.get('sort')||'due';
  const owner=params.get('owner')==='__me__'?user.user_id:params.get('owner')||'',unassigned=params.get('unassigned')==='1';
  const effectiveQuick=quick||(!['active','completed','all'].includes(view)?view:'');
  const filtered=rows.filter(row=>brawndoTicketMatches({...row,actionSearchText:[row.actionSearchText,personLabel(users,row.owner_id)].join(' ')},{view,q:query,source,owner,unassigned,quick},eligible));
  filtered.sort((a,b)=>{
    const date=row=>brawndoDueWindow(row)==='unscheduled'?null:daysDue(row);
    if(['due','due-desc'].includes(sort)&&(date(a)===null||date(b)===null))return date(a)===date(b)?a.ticketId.localeCompare(b.ticketId):date(a)===null?1:-1;
    const diff=sort==='title'?String(a.title).localeCompare(String(b.title)):sort==='owner'?personLabel(users,a.owner_id).localeCompare(personLabel(users,b.owner_id)):sort==='priority'?(priorities[b.primary?.priority]??-1)-(priorities[a.primary?.priority]??-1):sort==='status'?ticketStage(a).localeCompare(ticketStage(b)):sort==='due-desc'?date(b)-date(a):date(a)-date(b);
    return (Number.isNaN(diff)?0:diff)||a.ticketId.localeCompare(b.ticketId);
  });
  const lastPage=Math.max(1,Math.ceil(filtered.length/10)),page=Math.min(lastPage,Math.max(1,Number.parseInt(params.get('page'),10)||1)),start=(page-1)*10,pageRows=filtered.slice(start,start+10);
  const ready=!loading&&!error;
  function change(values,{replace=false}={}){
    const next=new URLSearchParams(params);Object.entries(values).forEach(([key,value])=>value===null||value===''?next.delete(key):next.set(key,String(value)));
    if(!('page' in values))next.delete('page');
    setParams(next,{replace});
  }
  function changeQuery(value){setQuery(value);const next=new URLSearchParams(params);next.set('q',value);next.delete('page');setParams(next,{replace:true,state:{...location.state,actionSearch:{owner:searchOwner.current,revision:++searchRevision.current}}});}
  function chooseQuick(value){change({view:'active',quick:effectiveQuick===value?'':value,owner:null,unassigned:null});}
  function open(row){conceptFocus.current=null;change({finding_id:row.finding?.finding_id||null,task_id:row.finding?null:row.raw.task_id,id:null});}
  const findingId=params.get('finding_id'),taskId=params.get('task_id'),legacyId=params.get('id');
  const deepKey=JSON.stringify([findingId,taskId,legacyId]);
  useEffect(()=>{
    if(!ready)return;
    if(opened.current===deepKey)return;
    opened.current=deepKey;
    function navigate(next,message=''){
      if(drawer?.record&&drawer.ticketKey!==next?.ticketKey){setPendingNavigation({drawer:next,error:message});setCloseRequest(value=>value+1);}
      else if(!drawer?.record){setDrawer(next);setLinkError(message);}
    }
    if(!findingId&&!taskId&&!legacyId){if(drawer?.record)navigate(null);return;}
    const finding=(data.findings||[]).find(row=>row.finding_id===(findingId||legacyId));
    const task=(data.tasks||[]).find(row=>row.task_id===(taskId||legacyId));
    if(findingId&&taskId||legacyId&&finding&&task&&!findingId&&!taskId){navigate(null,'This link is ambiguous. Choose the ticket from the register.');return;}
    const target=findingId?finding:taskId?task:finding||task;
    if(!target||target.client_id!==currentClientId){navigate(null,'The requested ticket is unavailable for this client.');return;}
    const ticketKey=rows.find(row=>target.task_id?row.actions.some(action=>action.task_id===target.task_id):row.finding?.finding_id===target.finding_id)?.ticketId;
    navigate({kind:target.task_id?'tasks':'findings',record:target,ticketKey,onReturnFocus:target.task_id&&conceptFocus.current?.taskId===target.task_id?conceptFocus.current.returnFocus:undefined});
  },[ready,deepKey,findingId,taskId,legacyId,data,currentClientId,drawer,rows]);
  function close(){opened.current=deepKey;conceptFocus.current=null;setDrawer(null);setLinkError('');change({finding_id:null,task_id:null,id:null},{replace:true});}
  function drawerClosed(){
    if(pendingNavigation){setDrawer(pendingNavigation.drawer);setLinkError(pendingNavigation.error);setPendingNavigation(null);}
    else close();
  }
  function keepEditing(){
    setPendingNavigation(null);
    // Restore a distinct entry so a subsequent Back still reaches the register's guard.
    change({finding_id:drawer.kind==='findings'?drawer.record.finding_id:null,task_id:drawer.kind==='tasks'?drawer.record.task_id:null,id:null});
  }
  async function saved(){const result=await load();if(mounted.current&&result?.ok===false)throw new Error('The record was saved, but the register could not refresh. '+result.error);}
  async function creationSaved(){try{await saved();if(mounted.current)setRefreshError('');}catch(failure){if(mounted.current)setRefreshError(failure.message);}}
  // Only the new Finding-to-Risk command needs this acknowledged parent read.
  // Other native saves keep their established callback and draft behavior.
  const riskRefreshKey=JSON.stringify([user?.user_id,user?.role,auth.workspaceMode,user?.workspace_mode,currentClientId,currentClient?.client_id,
    drawer?.kind,drawer?.record?.client_id,drawer?.record?.finding_id,drawer?.record?.task_id,!!suspended,auth.loading,org.loading,auth.error,org.error]);
  const riskRefreshContext=useRef({key:riskRefreshKey,generation:0});
  if(riskRefreshContext.current.key!==riskRefreshKey){riskRefreshContext.current.key=riskRefreshKey;riskRefreshContext.current.generation++;}
  const riskRefreshGeneration=riskRefreshContext.current.generation;
  async function riskLinked(){
    const current=()=>mounted.current&&riskRefreshContext.current.generation===riskRefreshGeneration&&!suspended
      &&auth.loading===false&&org.loading===false&&!auth.error&&!org.error&&drawer?.record?.client_id===currentClientId;
    const failure='The register refresh is unconfirmed. Reload the register before continuing.';
    if(!current())throw new Error(failure);
    const result=await load();
    if(!current()||result?.ok!==true)throw new Error(failure+(result?.error?' '+result.error:''));
    return result;
  }
  const total=metrics.active.length,quickLabels={active:'Active tickets',upcoming:'Due in 30 days',overdue:'Overdue',unassigned:'Needs an owner',high_critical:'High-severity findings',unscheduled:'Unscheduled',...Object.fromEntries(windows)};
  return <BrawndoSurface className="brawndo-demo-actions cia-root cia-page" data-visual-surface="action-items">
    <BrawndoPageHeader title={`${currentClient.name} Action Items`} subtitle="Corrective actions from findings, risks, reviews and manual entries"
      renderThemeAction={props=><SurfaceThemeAction {...props} className="bpage-btn"/>}>
      {isInternal(user)&&<button className="bda-button" onClick={()=>setDrawer({kind:'findings',record:null})}>New finding</button>}
      {canOperate(user)&&<button className="bda-button bda-primary" onClick={()=>setDrawer({kind:'tasks',record:null})}><Plus size={15} aria-hidden="true"/>New action item</button>}
    </BrawndoPageHeader>
    <CisActionItemsSummary metrics={metrics} ready={ready} activeKey={!['completed','all'].includes(view)?effectiveQuick||'active':null} onSelect={key=>key==='active'?change({view:'active',quick:null,owner:null,unassigned:null}):chooseQuick(key)}/>
    <CisActionItemsOverview rows={rows} users={users} now={now} scopeKey={quarterlyChartScope(user,auth.workspaceMode,currentClient)} theme={theme} recordOpen={!!drawer} available={ready} onOpen={(event,returnFocus)=>{conceptFocus.current={taskId:event.task.task_id,returnFocus};change({finding_id:null,task_id:event.task.task_id,id:null});}}/>
    <section className="bda-register cia-register" aria-labelledby="bda-register-title"><header className="cia-register-head"><div><h2 id="bda-register-title">Action items register</h2>{view==='completed'&&<p>Finished actions, with native completion and Finding validation.</p>}</div><div className="bda-tabs cia-tabs" role="group" aria-label="Ticket population">{[['active','Active',metrics.active.length],['completed','Completed',metrics.completed.length]].map(([key,label])=><button key={key} aria-pressed={view===key||key==='active'&&!['completed','all'].includes(view)} onClick={()=>change({view:key,quick:null,owner:null,unassigned:null})}>{label}</button>)}</div></header>
      <div className="bda-controls"><label className="bda-search"><span className="sr-only">Search action items</span><Search size={15} aria-hidden="true"/><input type="search" placeholder="Search actions and findings…" maxLength={200} value={query} onChange={event=>changeQuery(event.target.value)} data-testid="ai-search"/></label>{view!=='completed'&&<div className="bda-tabs bda-show" role="group" aria-label="Show actions">{[['','All'],['overdue','Overdue'],['in_progress','In progress'],['open','Open'],['pending_validation','Pending validation']].map(([key,label])=><button key={key} aria-pressed={view!=='all'&&effectiveQuick===key} onClick={()=>change({view:'active',quick:key,owner:null,unassigned:null})}>{label}<span>{key?metrics.active.filter(row=>brawndoTicketMatches(row,{quick:key},eligible)).length:total}</span></button>)}</div>}<div className="bda-more-controls"><label>Source <select value={source} onChange={event=>change({source:event.target.value})}><option value="">All sources</option>{[...new Set(rows.map(sourceKey))].sort().map(key=><option key={key} value={key}>{sourceLabel(key)}</option>)}</select></label><label>Sort <select value={sort} onChange={event=>change({sort:event.target.value})}><option value="due">Due date, soonest</option><option value="due-desc">Due date, latest</option><option value="priority">Priority</option><option value="title">Action A–Z</option><option value="owner">Owner A–Z</option><option value="status">Status</option></select></label><label>Status <select value={view==='all'&&!effectiveQuick?'__all__':effectiveQuick} onChange={event=>change({view:'all',quick:event.target.value==='__all__'?'':event.target.value})}><option value="">All in this view</option><option value="__all__">All records</option>{effectiveQuick&&!labels[effectiveQuick]&&<option value={effectiveQuick}>{quickLabels[effectiveQuick]||effectiveQuick}</option>}{Object.entries(labels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label></div></div>
      <div className="bda-results"><span role="status" aria-live="polite">{loading?'Loading authorized tickets…':error?'Tickets unavailable':`${filtered.length} matching ticket${filtered.length===1?'':'s'}${filtered.length?` · ${start+1}–${Math.min(start+10,filtered.length)}`:''}`}</span>{(effectiveQuick||owner||unassigned||source||query)&&<button className="bda-chip" onClick={()=>change({view:['all','completed'].includes(view)?view:'active',quick:null,owner:null,unassigned:null,source:null,q:null})}>{quickLabels[effectiveQuick]||labels[effectiveQuick]|| (owner?`Owner: ${personLabel(users,owner)}`:unassigned?'Needs an owner':'Filtered')} · Clear filters ×</button>}<nav aria-label="Action register pages"><span>Page {page} of {lastPage}</span><button disabled={!ready||page===1} onClick={()=>change({page:page-1})}>Previous</button><button disabled={!ready||page===lastPage} onClick={()=>change({page:page+1})}>Next</button></nav></div>
      {(error||linkError||refreshError)&&<p className="bda-error" role="alert">{refreshError||error||linkError} <button onClick={async()=>{opened.current='';setLinkError('');const result=await load();if(result?.ok)setRefreshError('');}}>Retry loading tickets</button></p>}
      {ready&&<div className={`bda-table-scroll${view==='completed'?' bda-done':''}`} role="region" aria-label="Action register table" tabIndex={0}><table><caption className="sr-only">Unique native tickets, ten per page. Actions linked to a Finding remain one ticket.</caption><thead><tr>{view!=='completed'&&<th aria-hidden="true" className="bda-check"/>}<th scope="col">Action</th>{view!=='completed'&&<th scope="col">Priority</th>}<th scope="col">Owner</th><th scope="col">{view==='completed'?'Completed':'Due'}</th><th scope="col">{view==='completed'?'Finding':'Status'}</th><th aria-hidden="true"/></tr></thead><tbody>{pageRows.map(row=>{
        const stage=ticketStage(row),needsOwner=brawndoNeedsOwner(row,eligible),findingTitle=row.finding?.title,sourceChip=actionSourceChip(row);
        return <tr key={row.ticketId} data-ticket-id={row.ticketId} className={view!=='completed'&&brawndoDueWindow(row)==='overdue'?'overdue-row':''} onClick={()=>open(row)}>
          {view!=='completed'&&<td className="bda-check" aria-hidden="true"/>}
          <td className="bda-item"><button className="bda-title" onClick={event=>{event.stopPropagation();open(row);}}>{row.title}</button><div className="bda-meta"><span className="bda-origin">{row.source.target?<button title={row.source.label} onClick={event=>{event.stopPropagation();setDrawer({kind:row.source.kind,record:row.source.target,initialValues:row.source.initialValues});}}>{sourceChip}</button>:<span title={row.source.id?'Linked source unavailable':undefined}>{sourceChip}</span>}</span>{sourceKey(row)==='framework_assessments'&&row.source.target&&<span className="bda-source-caption">{sourceLabel(sourceKey(row))}</span>}<small title={findingTitle||row.source.target?.title||''}>{findingTitle?`Finding: ${findingTitle}`:row.source.kind==='risks'?row.source.target?.title:''}</small></div>{row.finding?.status==='accepted'&&stage!=='accepted'&&<small className="bda-attention">Issue accepted · outstanding Actions remain active</small>}{row.diagnostic&&<small>{row.diagnostic}</small>}</td>
          {view!=='completed'&&<td className="bda-prio"><ActionConceptPriority value={row.primary?.priority}/></td>}
          <td className="bda-owner-cell"><ActionOwner name={personLabel(users,row.owner_id)} unavailable={needsOwner}>{needsOwner&&row.owner_id&&<small>Owner unavailable for assignment</small>}</ActionOwner></td>
          <td className="bda-due">{view==='completed'?<><span>{displayRecordedAt(row.primary?.completed_at)||'Completion date not recorded'}</span><small>{row.primary?.completed_by?`by ${personLabel(users,row.primary.completed_by)}`:'Historical completion'}</small></>:<ActionConceptDue date={row.due_date}/>}</td>
          <td className="bda-stage">{view==='completed'?row.finding?<span className="bda-status bda-status-completed">{row.finding.validated_at?'Validated '+displayDay(row.finding.validated_at):'Completed'}</span>:<span className="bda-no-finding">No finding linked</span>:<span className={`bda-status bda-status-${stage}`}>{labels[stage]}</span>}</td><td className="bda-chevron" aria-hidden="true">›</td>
        </tr>;
      })}</tbody></table>{!filtered.length&&<p className="bda-empty">No tickets match these filters.</p>}</div>}
    </section>
    {drawer&&<RecordDrawer key={drawer.ticketKey||'create:'+drawer.kind} {...drawer} presentation={drawer.record&&['tasks','findings'].includes(drawer.kind)?'brawndo-demo-actions':undefined} closeRequest={closeRequest} onCloseCancelled={keepEditing} open clientId={currentClientId} users={users} onSaved={drawer.record&&['tasks','findings'].includes(drawer.kind)?saved:creationSaved} onRiskLinked={drawer.record&&(drawer.kind==='findings'||drawer.kind==='tasks'&&drawer.record.finding_id)?riskLinked:undefined} onOpenChange={value=>{if(!value)drawerClosed();}}/>}
  </BrawndoSurface>;
}
