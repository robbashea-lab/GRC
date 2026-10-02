import {useCallback,useEffect,useRef,useState} from 'react';
import api,{formatError} from './api';

const kinds=['tasks','findings','reviews','risks','vendors','policies'];
const empty={data:{},users:[],loading:false,error:''};

// Both register presentations read the same authoritative records and reject stale client loads.
export function useActionRegisterData(clientId) {
  const [state,setState]=useState({...empty,clientId:null});
  const sequence=useRef(0);
  const load=useCallback(async()=>{
    const version=++sequence.current;
    if(!clientId){setState({...empty,clientId});return;}
    setState(previous=>({...previous,loading:true,error:''}));
    try {
      const results=await Promise.all([
        ...kinds.map(kind=>api.get('/'+kind,{params:{client_id:clientId}})),
        api.get(`/clients/${clientId}/members`),
        api.get('/onboarding/state',{params:{client_id:clientId}}),
      ]);
      const data=Object.fromEntries(kinds.map((kind,index)=>[kind,results[index].data.filter(row=>row.client_id===clientId)]));
      const ids=[...new Set([...data.tasks,...data.findings].map(row=>row.framework_assessment_id).filter(Boolean))];
      const frameworks=await Promise.all(ids.map(id=>api.get('/framework_assessments/'+encodeURIComponent(id)).catch(error=>{
        // A deleted or inaccessible historical origin remains a visible unavailable link.
        if([403,404].includes(error.response?.status))return {data:null};
        throw error;
      })));
      if(version!==sequence.current)return;
      setState({clientId,data:{...data,
        assessments:(results[kinds.length+1].data.assessments||[]).filter(row=>row.client_id===clientId),
        framework_assessments:frameworks.map(result=>result.data).filter(row=>row?.client_id===clientId),
      },users:results[kinds.length].data||[],loading:false,error:''});
    } catch(error) {
      if(version===sequence.current)setState({...empty,clientId,error:formatError(error)});
    }
  },[clientId]);
  useEffect(()=>{
    const generation=sequence;
    setState({...empty,clientId,loading:!!clientId});
    load();
    return ()=>{generation.current++;};
  },[clientId,load]);
  // Hide the old tenant synchronously, before effects start its replacement request.
  return {...(state.clientId===clientId?state:{...empty,loading:!!clientId}),load};
}
