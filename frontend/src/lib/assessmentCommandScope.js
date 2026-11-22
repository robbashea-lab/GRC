import {createContext,useContext,useLayoutEffect,useMemo,useRef} from 'react';
import nativeApi from './api';
import {useCreateIntent} from './createIntent';
import {canOperate,editableFields,isInternal} from './permissions';

export const AssessmentCommandApi=createContext(null);
export const useAssessmentApi=()=>useContext(AssessmentCommandApi)||nativeApi;
// Mirror native operation capabilities for this client, rather than treating a
// role-label refresh as revocation of an already-running authorized operation.
export function assessmentSecurityScope(user,mode,clientId){
  const recognized=['super_admin','platform_admin','client_grc_manager','client_contributor','client_readonly','client_viewer'].includes(user?.role);
  const access=recognized&&(user?.role==='super_admin'||user?.role==='platform_admin'&&user?.all_clients===true
    ||(user?.client_ids||[]).includes(clientId));
  const fields=['reviews','tasks','findings','risks','policies','vendors','assets','framework_assessments'].map(kind=>{
    const allowed=editableFields(kind,user,{});return allowed===null?null:[...allowed].sort();
  });
  return JSON.stringify([mode,user?.user_id,user?.status??'active',!!user?.password_change_required,
    [...(user?.client_ids||[])].sort(),!!user?.all_clients,access,isInternal(user),canOperate(user),fields]);
}
const ended=()=>new Error('This assessment context is unavailable or has changed. Your draft and any unconfirmed command are retained.');

// Each render/authority generation gets an immutable facade. Old async handlers
// cannot adopt a restored generation after awaiting a file or another request.
export function useScopedAssessmentApi(authority,owner){
  const inherited=useAssessmentApi();
  const commandOwner=authority.current?.commandOwner||owner;
  return useMemo(()=>{
    const assertCurrent=(mutation=true,ordinaryOperation=false,phase='dispatch')=>{
      const operationSettlement=ordinaryOperation&&phase==='settle';
      const matches=ordinaryOperation?(authority.current?.commandOwner||authority.current?.owner)===commandOwner:authority.current?.owner===owner;
      if(!matches||!operationSettlement&&(!authority.current?.readable||mutation&&!authority.current?.available))throw ended();
      inherited.assertAssessmentCurrent?.(mutation,ordinaryOperation,phase);
    };
    const own=authority.current;
    const memorySets=[...new Set([own?.memoryIntents,...(inherited.assessmentMemoryIntentSets||[])].filter(Boolean))];
    const notify=()=>{authority.current?.onWriteChange?.();inherited.notifyAssessmentIntent?.();};
    const scoped={assertAssessmentCurrent:assertCurrent,assessmentCommandOwner:commandOwner,
      assessmentMemoryIntents:own?.memoryIntents,assessmentMemoryIntentSets:memorySets,
      assessmentPendingMutations:own?.pendingMutations,notifyAssessmentIntent:notify};
    for(const method of ['get','head','options','post','put','patch','delete']){
      const mutation=['post','put','patch','delete'].includes(method);
      const strictGuard=phase=>assertCurrent(mutation,false,phase);
      const operationGuard=phase=>assertCurrent(mutation,true,phase);
      scoped[method]=(...args)=>{
        const index=['post','put','patch'].includes(method)?2:1;
        const config=args[index]||{},priorGuard=config.assessmentAuthority;
        // Only the native assessment-only CAS PATCH retains its already-running
        // permission lease through an equivalent role/read refresh. Coordinated
        // saves and all nested commands retain strict read-epoch settlement.
        const ordinary=config.assessmentOperation===true&&method==='patch'
          &&/^\/framework_assessments\/[^/]+$/.test(args[0])&&Object.hasOwn(args[1]||{},'expected_last_assessed')&&!args[1]?.coordination
          &&!Object.hasOwn(args[1]||{},'guided_assessment_source')&&!Object.hasOwn(args[1]||{},'item_draft');
        const guard=ordinary?operationGuard:strictGuard;
        try{guard('dispatch');}catch(error){return Promise.reject(error);}
        const forwarded={...config};
        // The operation annotation is local to nested scope composition; only
        // its captured authority guard reaches the native Axios configuration.
        if(!inherited.assertAssessmentCurrent)delete forwarded.assessmentOperation;
        args[index]={...forwarded,assessmentAuthority:priorGuard?phase=>{guard(phase);priorGuard(phase);}:guard};
        const pending=mutation?authority.current?.pendingMutations:null,token={};
        if(pending){pending.add(token);notify();}
        const release=()=>{if(pending){pending.delete(token);notify();}};
        let result;
        try{result=inherited[method](...args);}catch(error){release();try{guard('settle');}catch(ended){return Promise.reject(ended);}return Promise.reject(error);}
        return Promise.resolve(result).then(response=>{
          guard('settle');return response;
        },error=>{
          // Do not let an ended response's x-create-rejected header acknowledge
          // an original command under a later epoch.
          guard('settle');throw error;
        }).finally(release);
      };
    }
    return scoped;
  },[authority,owner,commandOwner,inherited]);
}

// A fresh Retry can use its current render's facade without changing the
// retained request/key. An already-started handler keeps its old bound facade.
export function useAssessmentCreateIntent(post,scope,persist=false){
  const scoped=useContext(AssessmentCommandApi);
  const owner=useRef(null);
  if(!owner.current||owner.current.scoped!==scoped||owner.current.scope!==scope){
    const bound=(...args)=>post(...args);
    if(scoped){bound.assertCommandCurrent=()=>scoped.assertAssessmentCurrent();bound.onIntentChange=scoped.notifyAssessmentIntent;}
    owner.current={scoped,scope,post:bound};
  }
  const scopedPost=owner.current.post;
  const command=useCreateIntent(scoped?scopedPost:post,scope,persist,!!scoped);
  useLayoutEffect(()=>{
    if(!scoped||persist)return;
    const lease={unconfirmed:command.unconfirmed},sets=scoped.assessmentMemoryIntentSets||[];
    for(const set of sets)set.add(lease);
    scoped.notifyAssessmentIntent?.();
    return()=>{for(const set of sets)set.delete(lease);scoped.notifyAssessmentIntent?.();};
  },[scoped,persist,command]);
  return command;
}
