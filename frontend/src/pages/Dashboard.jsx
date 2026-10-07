import {useEffect,useRef,useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import api,{formatError} from '@/lib/api';
import {useOrg} from '@/context/OrgContext';
import {useAuth} from '@/context/AuthContext';
import PageHeader from '@/components/PageHeader';
import RegisterLoadError from '@/components/RegisterLoadError';
import ClientWorkDashboard from '@/components/ClientWorkDashboard';
import DashboardItemSummary from '@/components/DashboardItemSummary';
import {loadClientDashboard} from '@/lib/loadClientDashboard';
import {loadDashboardItem} from '@/lib/dashboardItemSummary';
import {WORK_FILTERS} from '@/lib/dashboardWorkQueue';
import {brawndoWorkspacePilot} from '@/lib/brawndoWorkspacePilot';
import RecordDrawer from '@/components/RecordDrawer';
import {SCHEMAS} from '@/lib/schemas';

const SCOPE={kind:'org'};
export default function Dashboard(){
  const {currentClient,currentClientId}=useOrg(),{user}=useAuth(),[params,setParams]=useSearchParams();
  const [snapshot,setSnapshot]=useState(null),[error,setError]=useState(null),[revision,setRevision]=useState(0),[selection,setSelection]=useState(null);
  const [linked,setLinked]=useState(null),[refreshVersion,setRefreshVersion]=useState(0),[refreshError,setRefreshError]=useState('');
  const pilot=brawndoWorkspacePilot(currentClientId,user),linkedOpener=useRef(null),refreshRequest=useRef(null);
  const detailRequest=useRef(null),opener=useRef(null),selectionVersion=useRef(0),activeClient=useRef(currentClientId);activeClient.current=currentClientId;
  const requestKey=JSON.stringify([currentClientId,user?.user_id,revision]);
  const filter=WORK_FILTERS.some(f=>f.key===params.get('work'))?params.get('work'):'all';
  useEffect(()=>{
    const controller=new AbortController();setError(null);setSelection(null);setLinked(null);setRefreshError('');detailRequest.current?.abort();refreshRequest.current?.abort();
    if(currentClientId)loadClientDashboard(api,{clientId:currentClientId,user,scope:SCOPE,signal:controller.signal,workQueue:true})
      .then(result=>{if(!controller.signal.aborted)setSnapshot({key:requestKey,result});})
      .catch(e=>{if(!controller.signal.aborted)setError({key:requestKey,message:formatError(e)});});
    return()=>{controller.abort();detailRequest.current?.abort();refreshRequest.current?.abort();};
  },[currentClientId,user,requestKey]);
  const shell=body=><div><PageHeader title={`${currentClient?.name||'Client'} Dashboard`}/><div className="section-body">{body}</div></div>;
  if(!currentClientId)return shell(<p>Select a client to view its GRC program.</p>);
  if(error?.key===requestKey)return shell(<RegisterLoadError error={error.message} onRetry={()=>setRevision(n=>n+1)} name="Dashboard"/>);
  const data=snapshot?.key===requestKey?snapshot.result:null;
  if(!data)return shell(<p role="status">Loading dashboard…</p>);
  function onFilter(value){const next=new URLSearchParams(params);next.set('work',value);setParams(next);}
  async function openItem(item,element){
    selectionVersion.current++;
    detailRequest.current?.abort();const controller=new AbortController();detailRequest.current=controller;opener.current=element||document.activeElement;
    setSelection({item,loading:true});
    try{const loaded=await loadDashboardItem(api,item,currentClientId,controller.signal);if(!controller.signal.aborted&&activeClient.current===currentClientId)setSelection({item:loaded});}
    catch(e){if(!controller.signal.aborted&&activeClient.current===currentClientId)setSelection({item,error:formatError(e)});}
  }
  const close=()=>{selectionVersion.current++;detailRequest.current?.abort();setSelection(null);};
  async function loadDetail(key,offset,signal,options={}){
    const {data:result}=await api.get('/dashboard',{params:{client_id:currentClientId,scope:'org',work_queue:true,detail:key,offset,limit:25,...options},signal});
    if(result.client_id!==currentClientId)throw new Error('Dashboard detail belongs to another client.');return result;
  }
  async function refreshSaved(){
    const selectedVersion=selectionVersion.current;
    refreshRequest.current?.abort();const controller=new AbortController();refreshRequest.current=controller;setRefreshError('');
    try{
      const result=await loadClientDashboard(api,{clientId:currentClientId,user,scope:SCOPE,signal:controller.signal,workQueue:true});
      if(controller.signal.aborted||activeClient.current!==currentClientId)return;
      setSnapshot({key:requestKey,result});setRefreshVersion(n=>n+1);
      if(selection?.item){const item=await loadDashboardItem(api,selection.item,currentClientId,controller.signal);if(!controller.signal.aborted&&activeClient.current===currentClientId&&selectionVersion.current===selectedVersion)setSelection({item});}
    }catch(e){if(!controller.signal.aborted&&activeClient.current===currentClientId)setRefreshError('The record was saved, but dashboard refresh failed: '+formatError(e));}
  }
  return <><ClientWorkDashboard key={requestKey} queue={data.queue} programs={data.programs} programRows={data.programRows} clientName={currentClient?.name||'Client'}
    filter={filter} onFilter={onFilter} onOpen={openItem} loadDetail={loadDetail} refreshVersion={refreshVersion} workspacePilot={pilot}/>
    {refreshError&&<p role="alert">{refreshError} <button onClick={refreshSaved}>Retry dashboard refresh</button></p>}
    {selection&&<DashboardItemSummary selection={selection} onClose={close} opener={opener.current} onOpenRecord={pilot?(item,element)=>{linkedOpener.current=element;setLinked(item);}:undefined}/>}
    {linked&&<RecordDrawer open kind={linked.kind} record={linked.record} initialValues={linked.initialValues} schema={SCHEMAS[linked.kind]?.fields} clientId={currentClientId} reviewsPilot onSaved={refreshSaved} onOpenChange={open=>{if(!open){setLinked(null);requestAnimationFrame(()=>linkedOpener.current?.focus({preventScroll:true}));}}}/>}</>;
}
