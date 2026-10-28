import {cisClientProgram} from '@/lib/cisExperience';
import {sharedClientPrograms,sharedAppearanceEligible,sharedPresentationEligible} from '@/lib/sharedExperience';
import {frameworkDashboardPrograms} from '@/lib/frameworkDashboard';
import {visualCorrectionSurface} from '@/lib/visualCorrectionScope';
import {selectedClient} from '@/lib/clientSelection';
import {useEffect,useRef,useState} from 'react';
import {Link,useLocation,useSearchParams} from 'react-router-dom';
import api,{formatError} from '@/lib/api';
import {useOrg} from '@/context/OrgContext';
import {useAuth} from '@/context/AuthContext';
import PageHeader from '@/components/PageHeader';
import RegisterLoadError from '@/components/RegisterLoadError';
import ClientWorkDashboard from '@/components/ClientWorkDashboard';
import BrawndoDemoDashboard,{CisDashboardPending} from '@/components/BrawndoDemoDashboard';
import BrawndoDemoProgram from '@/components/BrawndoDemoProgram';
import FrameworkProgramCard from '@/components/FrameworkProgramCard';
import {BRAWNDO_DEMO_DASHBOARD_ENABLED,brawndoDemoDashboard} from '@/lib/brawndoDemoDashboard';
import {loadCompleteDemoWork} from '@/lib/brawndoDemoWork';
import {usePortfolioRefresh} from '@/lib/usePortfolioRefresh';
import DashboardItemSummary from '@/components/DashboardItemSummary';
import {loadClientDashboard} from '@/lib/loadClientDashboard';
import {loadDashboardItem} from '@/lib/dashboardItemSummary';
import {WORK_FILTERS} from '@/lib/dashboardWorkQueue';
import {isWorkspacePresentation} from '@/lib/reference';
import RecordDrawer from '@/components/RecordDrawer';
import {SCHEMAS} from '@/lib/schemas';

const SCOPE={kind:'org'};
export default function Dashboard(){
  const org=useOrg(),auth=useAuth(),{currentClient,currentClientId}=org,{user,workspaceMode}=auth,[params,setParams]=useSearchParams();
  const {pathname,search}=useLocation();
  const demoDashboard=brawndoDemoDashboard({...org,...auth,pathname,authLoading:auth.loading,orgLoading:org.loading,orgError:org.error,authError:auth.error,selectedClientId:selectedClient(),routeClientId:new URLSearchParams(search).get('client_id')});
  const commonDashboard=BRAWNDO_DEMO_DASHBOARD_ENABLED&&pathname==='/dashboard'&&sharedAppearanceEligible({...org,...auth,authLoading:auth.loading,orgLoading:org.loading,orgError:org.error,authError:auth.error,selectedClientId:selectedClient(),routeClientId:new URLSearchParams(search).get('client_id')});
  // Appearance rechecks must not change the native data scope or discard open editor drafts.
  const demoPresentation=commonDashboard&&visualCorrectionSurface({...org,...auth,pathname,authLoading:auth.loading,authError:auth.error,orgLoading:org.loading,orgError:org.error,selectedClientId:selectedClient(),routeClientId:new URLSearchParams(search).get('client_id')})==='dashboard';
  const conceptFrame=BRAWNDO_DEMO_DASHBOARD_ENABLED&&pathname==='/dashboard'&&sharedPresentationEligible({...org,...auth,authLoading:auth.loading,authError:auth.error,orgLoading:org.loading,orgError:org.error,selectedClientId:selectedClient(),routeClientId:new URLSearchParams(search).get('client_id')});
  const [snapshot,setSnapshot]=useState(null),[error,setError]=useState(null),[revision,setRevision]=useState(0),[selection,setSelection]=useState(null);
  const [linked,setLinked]=useState(null),[refreshVersion,setRefreshVersion]=useState(0),[refreshError,setRefreshError]=useState('');
  const pilot=isWorkspacePresentation(currentClientId,user),linkedOpener=useRef(null),refreshRequest=useRef(null);
  const detailRequest=useRef(null),opener=useRef(null),selectionVersion=useRef(0);
  const configuredCis=cisClientProgram(currentClient);
  const configuredPrograms=sharedClientPrograms(currentClient);
  const recordContextKey=JSON.stringify([currentClientId,user?.user_id,workspaceMode,user?.workspace_mode,revision]);
  const requestKey=JSON.stringify([recordContextKey,demoDashboard,configuredCis?.version,configuredCis?.implementationGroup,configuredPrograms]);
  const activeRequest=useRef(requestKey);activeRequest.current=requestKey;
  const filter=WORK_FILTERS.some(f=>f.key===params.get('work'))?params.get('work'):'all';
  useEffect(()=>{
    setSelection(null);setLinked(null);setRefreshError('');detailRequest.current?.abort();refreshRequest.current?.abort();
    return()=>{detailRequest.current?.abort();refreshRequest.current?.abort();};
  },[recordContextKey]);
  useEffect(()=>{
    const controller=new AbortController();setError(null);
    if(currentClientId)loadClientDashboard(api,{clientId:currentClientId,user,scope:SCOPE,signal:controller.signal,workQueue:true,includeProgramMetadata:demoDashboard})
      .then(result=>{if(!controller.signal.aborted)setSnapshot({key:requestKey,result});})
      .catch(e=>{if(!controller.signal.aborted)setError({key:requestKey,message:formatError(e)});});
    return()=>controller.abort();
  },[currentClientId,user,requestKey,demoDashboard]);
  // Keep native dirty drawers intact; background reads update only dashboard projections.
  usePortfolioRefresh(()=>{if(commonDashboard&&!linked&&snapshot?.key===requestKey)refreshDashboard(false);});
  const shell=body=>conceptFrame?<CisDashboardPending client={currentClient}>{body}</CisDashboardPending>:<div><PageHeader title={`${currentClient?.name||'Client'} Dashboard`}/><div className="section-body">{body}</div></div>;
  function nativeRecord(){return linked?.key===recordContextKey?<RecordDrawer key="dashboard-native-record" open kind={linked.kind} record={linked.record} initialValues={linked.initialValues} schema={SCHEMAS[linked.kind]?.fields} clientId={currentClientId} reviewsPilot onSaved={()=>refreshDashboard()} onOpenChange={open=>{if(!open){setLinked(null);requestAnimationFrame(()=>{const target=linkedOpener.current?.isConnected?linkedOpener.current:demoPresentation?document.getElementById('bdd-work-heading'):null;target?.focus({preventScroll:true});});}}}/>:null;}
  // A stored selection is not a resolved client; wait before choosing any client presentation.
  if(org.loading&&(!currentClient||currentClient.client_id!==currentClientId))return <div className="section-body" role="status">Loading workspace…</div>;
  if(!currentClientId)return shell(<p>Select a client to view its GRC program.</p>);
  if(conceptFrame&&!demoPresentation)return <>{shell(<p role="status">Loading dashboard…</p>)}{nativeRecord()}</>;
  if(error?.key===requestKey)return <>{shell(<RegisterLoadError error={error.message} onRetry={()=>setRevision(n=>n+1)} name="Dashboard"/>)}{nativeRecord()}</>;
  const data=snapshot?.key===requestKey?snapshot.result:null;
  if(!data)return <>{shell(<p role="status">Loading dashboard…</p>)}{nativeRecord()}</>;
  function onFilter(value){const next=new URLSearchParams(params);next.set('work',value);setParams(next);}
  async function openItem(item,element){
    selectionVersion.current++;
    detailRequest.current?.abort();const controller=new AbortController();detailRequest.current=controller;opener.current=element||document.activeElement;
    setSelection({item,loading:true,key:requestKey});
    try{const loaded=await loadDashboardItem(api,item,currentClientId,controller.signal);if(!controller.signal.aborted&&activeRequest.current===requestKey)setSelection({item:loaded,key:requestKey});}
    catch(e){if(!controller.signal.aborted&&activeRequest.current===requestKey)setSelection({item,error:formatError(e),key:requestKey});}
  }
  const close=()=>{selectionVersion.current++;detailRequest.current?.abort();setSelection(null);};
  async function loadDetail(key,offset,signal,options={}){
    const {data:result}=await api.get('/dashboard',{params:{client_id:currentClientId,scope:'org',work_queue:true,...(commonDashboard?{work_metadata:true}:{}),detail:key,offset,limit:25,...options},signal});
    if(result.client_id!==currentClientId)throw new Error('Dashboard detail belongs to another client.');return result;
  }
  async function refreshDashboard(saved=true){
    const selectedVersion=selectionVersion.current;
    refreshRequest.current?.abort();const controller=new AbortController();refreshRequest.current=controller;setRefreshError('');
    try{
      const result=await loadClientDashboard(api,{clientId:currentClientId,user,scope:SCOPE,signal:controller.signal,workQueue:true,includeProgramMetadata:demoDashboard});
      if(controller.signal.aborted||activeRequest.current!==requestKey)return;
      setSnapshot({key:requestKey,result});setRefreshVersion(n=>n+1);
      if(saved&&selection?.item){
        // Event dates and eligible owners belong to the queue projection, not generic record fields.
        const rows=commonDashboard?await loadCompleteDemoWork(loadDetail,controller.signal):null;
        const selected=rows?rows.find(row=>row.key===selection.item.key):selection.item;
        if(!selected){
          if(!controller.signal.aborted&&activeRequest.current===requestKey&&selectionVersion.current===selectedVersion)setSelection(null);
          return;
        }
        const item=await loadDashboardItem(api,selected,currentClientId,controller.signal);
        if(!controller.signal.aborted&&activeRequest.current===requestKey&&selectionVersion.current===selectedVersion)setSelection({item,key:requestKey});
      }
    }catch(e){if(!controller.signal.aborted&&activeRequest.current===requestKey)setRefreshError((saved?'The record was saved, but dashboard refresh failed: ':'Dashboard refresh failed: ')+formatError(e));}
  }
  const programs=demoDashboard?frameworkDashboardPrograms(data.programs,data.programMetadata,currentClientId):[];
  const otherPrograms=data.programs.filter(value=>!['cis-ig1','iso-27001','soc-2'].includes(value.key));
  const trackedProgramUnavailable=!programs.length&&(demoDashboard||data.programs.some(value=>['cis-ig1','iso-27001','soc-2'].includes(value.key)));
  const program=programs.find(value=>value.framework_key===params.get('program'))||programs[0];
  const chooseProgram=key=>{const next=new URLSearchParams(params);next.set('program',key);setParams(next);};
  return <>{demoPresentation?<BrawndoDemoDashboard key={requestKey} queue={data.queue} programs={data.programs} client={currentClient} members={data.members}
    filter={filter} onFilter={onFilter} onOpen={openItem} loadDetail={loadDetail} refreshVersion={refreshVersion} concept programOptions={programs} selectedProgram={program} onProgramSelect={chooseProgram}>
      {program?<BrawndoDemoProgram key={program.program_id} client={currentClient} program={program} members={data.members} refreshToken={refreshVersion} cisDashboardProfile concept domainSource={data.programSources?.[program.framework_key]||data.cisDomainSource} contextKey={requestKey}/>:trackedProgramUnavailable?<section className="bdd-card" aria-label={configuredCis?`CIS IG${configuredCis.implementationGroup} Status`:'Program Status'}><header><h2>{configuredCis?`CIS IG${configuredCis.implementationGroup} Status`:'Program Status'}</h2></header><p className="bdd-empty" role="status">The configured {currentClient.name} {configuredCis?`CIS v8.1 IG${configuredCis.implementationGroup} program`:'program'} is unavailable. Review its native configuration.</p></section>:null}
      {otherPrograms.map(value=>data.programRows?.[value.key]
        ? <div key={value.key} className="bdash" style={{padding:0,minHeight:0}}><FrameworkProgramCard program={value} rows={data.programRows[value.key]} workspacePilot={pilot}/></div>
        : <section key={value.key} className="bdd-card"><header><h2>{value.label}</h2></header><p className="bdd-empty">{value.explanation} <Link to={value.to}>Open workspace</Link></p></section>)}
      {!data.programs.length&&!demoDashboard&&<section className="bdd-card"><p className="bdd-empty">No frameworks configured. <Link to="/client-profile">Review client configuration</Link></p></section>}
    </BrawndoDemoDashboard>:<ClientWorkDashboard key={requestKey} queue={data.queue} programs={data.programs} programRows={data.programRows} clientName={currentClient?.name||'Client'}
    filter={filter} onFilter={onFilter} onOpen={openItem} loadDetail={loadDetail} refreshVersion={refreshVersion} workspacePilot={pilot}/>}
    {refreshError&&<p role="alert">{refreshError} <button onClick={()=>refreshDashboard(false)}>Retry dashboard refresh</button></p>}
    {selection?.key===requestKey&&<DashboardItemSummary selection={selection} onClose={close} opener={opener.current} fallbackFocus={demoPresentation?()=>document.getElementById('bdd-work-heading'):undefined} onOpenRecord={pilot?(item,element)=>{linkedOpener.current=element;setLinked({...item,key:recordContextKey});}:undefined}/>}
    {nativeRecord()}</>;
}
