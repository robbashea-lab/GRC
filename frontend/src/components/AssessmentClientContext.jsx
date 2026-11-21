import {createContext,useCallback,useContext,useEffect,useMemo,useState} from 'react';
import {contextIdentityMatches} from '@/lib/assessmentClientContext';

const AssessmentClientContext=createContext(null);
export const useAssessmentClientContext=()=>useContext(AssessmentClientContext);
export function AssessmentClientContextProvider({record,scopeKey,children}) {
  const [serviceRead,setServiceRead]=useState(null),[source,setSource]=useState(null);
  const publishServices=useCallback(next=>setServiceRead(next?{...next,scopeKey}:null),[scopeKey]);
  const publishSource=useCallback(next=>setSource(next?{...next,scopeKey}:null),[scopeKey]);
  const value=useMemo(()=>({record,publishServices,publishSource,
    services:serviceRead?.scopeKey===scopeKey&&contextIdentityMatches(record,serviceRead?.record)?serviceRead:null,
    source:source?.scopeKey===scopeKey&&contextIdentityMatches(record,source?.record)?source:null}),[record,scopeKey,serviceRead,source,publishServices,publishSource]);
  return <AssessmentClientContext.Provider value={value}>{children}</AssessmentClientContext.Provider>;
}
export function AssessmentClientContextSource({record,definition,related,users,configuration,onOpenRecord}) {
  const publish=useAssessmentClientContext()?.publishSource;
  useEffect(()=>{
    publish?.({record,definition,related,users,configuration,onOpenRecord});
    return()=>publish?.(null);
  },[publish,record,definition,related,users,configuration,onOpenRecord]);
  return null;
}