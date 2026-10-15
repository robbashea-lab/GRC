import {useEffect,useRef} from 'react';
import {useLocation,useSearchParams} from 'react-router-dom';
import {useOrg} from '@/context/OrgContext';
import {useAuth} from '@/context/AuthContext';
import {brawndoDemoActionsGate} from '@/lib/brawndoDemoActions';
import BrawndoDemoActionItems from './BrawndoDemoActionItems';
import BrawndoActionItems from './BrawndoActionItems';

// One population and drawer in normal and Demo workspaces.
export default function ActionItems(){
  const org=useOrg(),auth=useAuth(),location=useLocation();
  const {currentClientId}=org,[params,setParams]=useSearchParams(),previous=useRef(currentClientId);
  useEffect(()=>{
    if(previous.current===currentClientId)return;
    previous.current=currentClientId;
    const next=new URLSearchParams(params);
    ['owner','unassigned','finding_id','task_id','id','view','q','quick','source','sort','page'].forEach(k=>next.delete(k));
    setParams(next,{replace:true});
  },[currentClientId,params,setParams]);
  const gate={...org,...auth,pathname:location.pathname,authLoading:auth.loading,orgLoading:org.loading,orgError:org.error};
  const pilot=brawndoDemoActionsGate(gate);
  const scope=JSON.stringify([auth.user?.user_id,auth.user?.role,auth.user?.client_ids,auth.user?.password_change_required,auth.workspaceMode,auth.user?.workspace_mode,currentClientId]);
  const retainedScope=useRef(null);
  // Native write notifications refresh OrgContext. Conceal, rather than discard,
  // the same authorized editor while its client list is being rechecked.
  if(pilot)retainedScope.current=scope;
  const suspended=!pilot&&(auth.loading||org.loading)&&retainedScope.current===scope&&brawndoDemoActionsGate({...gate,authLoading:false,orgLoading:false});
  if(!pilot&&!suspended)retainedScope.current=null;
  return pilot||suspended?<><div hidden={suspended}><BrawndoDemoActionItems key={scope} suspended={!!suspended}/></div>{suspended&&<p role="status">Checking workspace access…</p>}</>:<BrawndoActionItems key={currentClientId}/>;
}
