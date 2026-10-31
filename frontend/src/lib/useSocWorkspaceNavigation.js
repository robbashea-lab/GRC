import {useCallback,useLayoutEffect,useMemo,useRef,useState} from 'react';

function target(location,query){
  return {location,params:new URLSearchParams(query),query,
    key:JSON.stringify([location.key,location.pathname,query,location.hash])};
}

// Same-page URL changes ask the mounted native editor to close before replacing its identity.
export function useSocWorkspaceNavigation({enabled,origin,location,params,setParams:routerSetParams,records=[],additionalRecord}){
  const query=params.toString(),actual=useMemo(()=>target(location,query),[location,query]),pathname=location.pathname;
  const [state,setState]=useState(()=>({enabled,origin,pathname,accepted:actual,pending:null,closeRequest:0}));
  const approval=useRef(null),current=useRef(null);
  const sameContext=enabled&&state.enabled&&state.origin===origin&&state.pathname===pathname;
  const currentId=state.accepted.params.get('assessment');
  const assessmentCurrent=sameContext&&!!currentId&&records.some(row=>row.framework_assessment_id===currentId);
  // ISO audit workpapers have local item identities, while package/occurrence/section live in the URL.
  // Only the actually mounted workpaper may hold those same-origin URL identities for its native guard.
  const auditCurrent=sameContext&&additionalRecord?.origin===origin&&additionalRecord.query
    &&Object.entries(additionalRecord.query).every(([key,value])=>state.accepted.params.get(key)===value);
  const validCurrent=assessmentCurrent||auditCurrent;
  const approved=approval.current?.origin===origin&&approval.current?.pathname===pathname?approval.current:null;
  const waiting=!!approved&&actual.key===approved.from;
  const permitted=!!approved&&!waiting&&(approved.any||approved.query===actual.query);
  const identityChanged=assessmentCurrent&&currentId!==params.get('assessment')
    ||auditCurrent&&Object.entries(additionalRecord.query).some(([key,value])=>params.get(key)!==value);
  const guarding=validCurrent&&identityChanged&&!waiting&&!permitted;
  const effective=sameContext&&(guarding||waiting&&validCurrent)?state.accepted:actual;
  const pending=guarding?actual:null;
  current.current={enabled,origin,pathname,actual,effective,pending,routerSetParams};

  useLayoutEffect(()=>{
    if(!sameContext){
      approval.current=null;
      if(state.enabled!==enabled||state.origin!==origin||state.pathname!==pathname||state.accepted.key!==actual.key||state.pending||state.closeRequest){
        setState({enabled,origin,pathname,accepted:actual,pending:null,closeRequest:0});
      }
      return;
    }
    if(waiting&&validCurrent)return;
    approval.current=null;
    if(guarding){
      if(state.pending?.key!==actual.key)setState({...state,pending:actual,closeRequest:state.closeRequest+1});
    }else if(state.accepted.key!==actual.key||state.pending){
      setState({...state,accepted:actual,pending:null});
    }
  },[enabled,origin,pathname,actual,sameContext,waiting,validCurrent,guarding,state]);

  const setParams=useCallback((next,options)=>{
    const latest=current.current;
    if(!latest.enabled){latest.routerSetParams(next,options);return;}
    const value=typeof next==='function'?next(new URLSearchParams(latest.effective.params)):next;
    const nextParams=new URLSearchParams(value);
    approval.current={origin:latest.origin,pathname:latest.pathname,from:latest.actual.key,query:nextParams.toString()};
    setState(previous=>previous.pending?{...previous,pending:null}:previous);
    latest.routerSetParams(nextParams,options);
  },[]);
  const acceptPending=useCallback(()=>{
    const latest=current.current;
    if(!latest.enabled||!latest.pending)return false;
    approval.current=null;
    setState(previous=>({...previous,accepted:latest.pending,pending:null}));
    return true;
  },[]);
  const keepEditing=useCallback(()=>{
    const latest=current.current;
    if(!latest.enabled||!latest.pending)return;
    // A distinct restored entry makes another Back reach the native guard again.
    setParams(latest.effective.params,{replace:false,state:latest.effective.location.state});
  },[setParams]);
  const allowNextLocation=useCallback(()=>{
    const latest=current.current;
    if(!latest.enabled)return;
    approval.current={origin:latest.origin,pathname:latest.pathname,from:latest.actual.key,any:true};
    setState(previous=>previous.pending?{...previous,pending:null}:previous);
  },[]);

  return {params:effective.params,location:effective.location,setParams,
    closeRequest:sameContext?state.closeRequest:0,acceptPending,keepEditing,allowNextLocation};
}
