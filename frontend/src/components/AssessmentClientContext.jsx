import {createContext,useCallback,useContext,useEffect,useMemo,useRef,useState} from 'react';
import {contextIdentityMatches} from '@/lib/assessmentClientContext';

const AssessmentClientContext=createContext(null);
export const useAssessmentClientContext=()=>useContext(AssessmentClientContext);
export function AssessmentClientContextProvider({record,scopeKey,available=true,children}) {
  const [serviceRead,setServiceRead]=useState(null),[source,setSource]=useState(null);
  const current=useRef(scopeKey);current.current=scopeKey;
  const publishServices=useCallback(next=>{if(current.current===scopeKey)setServiceRead(previous=>current.current===scopeKey?(next?{...next,scopeKey}:previous?.scopeKey===scopeKey?null:previous):previous);},[scopeKey]);
  const publishSource=useCallback(next=>{if(current.current===scopeKey)setSource(previous=>current.current===scopeKey?(next?{...next,scopeKey}:previous?.scopeKey===scopeKey?null:previous):previous);},[scopeKey]);
  const value=useMemo(()=>({record,publishServices,publishSource,
    services:available&&serviceRead?.scopeKey===scopeKey&&contextIdentityMatches(record,serviceRead?.record)?serviceRead:null,
    source:available&&source?.scopeKey===scopeKey&&contextIdentityMatches(record,source?.record)?source:null}),[record,scopeKey,available,serviceRead,source,publishServices,publishSource]);
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