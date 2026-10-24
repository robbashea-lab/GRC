import {cisClientProgram,cisPresentationEligible} from '@/lib/cisExperience';
import {visualCorrectionSurface} from '@/lib/visualCorrectionScope';
import {selectedClient} from '@/lib/clientSelection';
import {useEffect,useRef,useState} from 'react';
import {useLocation,useSearchParams} from 'react-router-dom';
import api,{formatError} from '@/lib/api';
import {useOrg} from '@/context/OrgContext';
import {useAuth} from '@/context/AuthContext';
import PageHeader from '@/components/PageHeader';
import RegisterLoadError from '@/components/RegisterLoadError';
import ClientWorkDashboard from '@/components/ClientWorkDashboard';
import BrawndoDemoDashboard,{CisDashboardPending} from '@/components/BrawndoDemoDashboard';
import BrawndoDemoProgram from '@/components/BrawndoDemoProgram';
import {BRAWNDO_DEMO_DASHBOARD_ENABLED,brawndoDemoDashboard,brawndoDemoProgram} from '@/lib/brawndoDemoDashboard';
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
  // Appearance rechecks must not change the native data scope or discard open editor drafts.
  const demoPresentation=demoDashboard&&visualCorrectionSurface({...org,...auth,pathname,authLoading:auth.loading,authError:auth.error,orgLoading:org.loading,orgError:org.error,selectedClientId:selectedClient(),routeClientId:new URLSearchParams(search).get('client_id')})==='dashboard';
  const conceptFrame=BRAWNDO_DEMO_DASHBOARD_ENABLED&&pathname==='/dashboard'&&cisPresentationEligible({...org,...auth,authLoading:auth.loading,authError:auth.error,orgLoading:org.loading,orgError:org.error,selectedClientId:selectedClient(),routeClientId:new URLSearchParams(search).get('client_id')});
  const [snapshot,setSnapshot]=useState(null),[error,setError]=useState(null),[revision,setRevision]=useState(0),[selection,setSelection]=useState(null);
  const [linked,setLinked]=useState(null),[refreshVersion,setRefreshVersion]=useState(0),[refreshError,setRefreshError]=useState('');
  const pilot=isWorkspacePresentation(currentClientId,user),linkedOpener=useRef(null),refreshRequest=useRef(null);
  const detailRequest=useRef(null),opener=useRef(null),selectionVersion=useRef(0);
  const configuredCis=cisClientProgram(currentClient);
  const recordContextKey=JSON.stringify([currentClientId,user?.user_id,workspaceMode,user?.workspace_mode,revision]);
  const requestKey=JSON.stringify([recordContextKey,demoDashboard,configuredCis?.version,configuredCis?.implementationGroup]);
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
  usePortfolioRefresh(()=>{if(demoDashboard&&!linked&&snapshot?.key===requestKey)refreshDashboard(false);});
  const shell=body=>conceptFrame?<CisDashboardPending client={currentClient}>{body}</CisDashboardPending>:<div><PageHeader title={`${currentClient?.name||'Client'} Dashboard`}/><div className="section-body">{body}</div></div>;
  function nativeRecord(){return linked?.key===recordContextKey?<RecordDrawer key="dashboard-native-record" open kind={linked.kind} record={linked.record} initialValues={linked.initialValues} schema={SCHEMAS[linked.kind]?.fields} clientId={currentClientId} reviewsPilot onSaved={()=>refreshDashboard()} onOpenChange={open=>{if(!open){setLinked(null);requestAnimationFrame(()=>{const target=linkedOpener.current?.isConnected?linkedOpener.current:demoPresentation?document.getElementById('bdd-work-heading'):null;target?.focus({preventScroll:true});});}}}/>:null;}
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
    const {data:result}=await api.get('/dashboard',{params:{client_id:currentClientId,scope:'org',work_queue:true,...(demoDashboard?{work_metadata:true}:{}),detail:key,offset,limit:25,...options},signal});
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
        const rows=demoDashboard?await loadCompleteDemoWork(loadDetail,controller.signal):null;
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
  const program=demoDashboard?brawndoDemoProgram(data.programs,data.programMetadata,currentClientId):null;
  return <>{demoPresentation?<BrawndoDemoDashboard key={requestKey} queue={data.queue} programs={data.programs} client={currentClient} members={data.members}
    filter={filter} onFilter={onFilter} onOpen={openItem} loadDetail={loadDetail} refreshVersion={refreshVersion} concept>
      {program?<BrawndoDemoProgram client={currentClient} program={program} members={data.members} refreshToken={refreshVersion} cisDashboardProfile concept domainSource={data.cisDomainSource} contextKey={requestKey}/>:<section className="bdd-card" aria-label={`CIS IG${cisClientProgram(currentClient)?.implementationGroup} Status`}><header><h2>CIS IG{cisClientProgram(currentClient)?.implementationGroup} Status</h2></header><p className="bdd-empty" role="status">The configured {currentClient.name} CIS v8.1 IG{cisClientProgram(currentClient)?.implementationGroup} program is unavailable. Review its native configuration.</p></section>}
    </BrawndoDemoDashboard>:<ClientWorkDashboard key={requestKey} queue={data.queue} programs={data.programs} programRows={data.programRows} clientName={currentClient?.name||'Client'}
    filter={filter} onFilter={onFilter} onOpen={openItem} loadDetail={loadDetail} refreshVersion={refreshVersion} workspacePilot={pilot}/>}
    {refreshError&&<p role="alert">{refreshError} <button onClick={()=>refreshDashboard(false)}>Retry dashboard refresh</button></p>}
    {selection?.key===requestKey&&<DashboardItemSummary selection={selection} onClose={close} opener={opener.current} fallbackFocus={demoPresentation?()=>document.getElementById('bdd-work-heading'):undefined} onOpenRecord={pilot?(item,element)=>{linkedOpener.current=element;setLinked({...item,key:recordContextKey});}:undefined}/>}
    {nativeRecord()}</>;
}
