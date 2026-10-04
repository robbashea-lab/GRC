import {useEffect,useRef} from 'react';
import {useSearchParams} from 'react-router-dom';
import {useOrg} from '@/context/OrgContext';
import BrawndoActionItems from './BrawndoActionItems';

// One population and drawer in normal and Demo workspaces.
export default function ActionItems(){
  const {currentClientId}=useOrg(),[params,setParams]=useSearchParams(),previous=useRef(currentClientId);
  useEffect(()=>{
    if(previous.current===currentClientId)return;
    previous.current=currentClientId;
    const next=new URLSearchParams(params);
    ['owner','unassigned','finding_id','id','view','q'].forEach(k=>next.delete(k));
    setParams(next,{replace:true});
  },[currentClientId,params,setParams]);
  return <BrawndoActionItems key={currentClientId}/>;
}
