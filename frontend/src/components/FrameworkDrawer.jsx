import {readEvidenceFile as readFile} from '@/lib/evidenceFile';
import { EvidenceCatalogPicker } from './EvidencePanel';
import { personLabel } from '@/lib/people';
import {useCallback,useEffect,useId,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {inventorySummaryEnabled} from '@/lib/omniInventorySummary';
import {socGuidedEnabled} from '@/lib/socGuidedAssessment';
import {isoGuidedEnabled} from '@/lib/isoGuidedAssessment';
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription} from './ui/sheet';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {Textarea} from './ui/textarea';
import nativeApi,{formatError,PREVIEW_MODE} from '@/lib/api';
import {AssessmentCommandApi,assessmentSecurityScope,useAssessmentApi,useScopedAssessmentApi} from '@/lib/assessmentCommandScope';
import {useClientWorkspaceAvailable} from '@/lib/useSurfaceRef';
import {AssessmentSurfaceAvailability,useAssessmentSurfaceAvailable} from '@/lib/assessmentSurfaceAvailability';
import {useAuth} from '@/context/AuthContext';
import {useOrg} from '@/context/OrgContext';
import {cisExperienceEligible,cisClientProgram} from '@/lib/cisExperience';
import {brawndoAssessmentPilotEligible} from '@/lib/brawndoAssessmentPilot';
import {assessmentRolloutEligible} from '@/lib/assessmentRolloutEligibility';
import {selectedClient} from '@/lib/clientSelection';
import {frameworkCatalog,frameworkDefinition,frameworkWorkspace} from '@/lib/frameworks';
import {recordUuid} from '@/lib/recordUuid';
import {frameworkContextRequest,frameworkContextResponse,frameworkContextScope,useFrameworkContextIntent} from '@/lib/frameworkContextIntent';
import {clientDestination} from '@/lib/clientSelection';
import {canOperate} from '@/lib/permissions';
import {useEvidenceDownload} from '@/lib/evidenceContext';
import policyCatalog from '@catalogs/onboardingCatalog.json';
import {actionStatus} from '@/lib/actionItems';
import {SCHEMAS} from '@/lib/schemas';
import RecordDrawer from './RecordDrawer';
import RemediationTickets from './RemediationTickets';
import TicketAssignment from './TicketAssignment';
import AssigneeSelect from './AssigneeSelect';
import FrameworkMappings from './FrameworkMappings';
import CsfProfile from './CsfProfile';
import {EMPTY_CSF_PROFILE,CSF_GAPS} from '@/lib/csfProfile';
import OrganizationalControls from './OrganizationalControls';
import FrameworkContext from './FrameworkContext';
import {operatorStatuses,operatorProgram,STATUS_HELP} from '@/lib/frameworkOperator';
import FrameworkReviewSetup from './FrameworkReviewSetup';
import FrameworkAssessmentWorkspace from './FrameworkAssessmentWorkspace';
import AssessmentItems from './AssessmentItems';
import {projectItemDraft} from '@/lib/assessmentItemDraft';
import AssessmentRolloutFrame from './AssessmentRolloutFrame';
import {AssessmentStep as Step} from './AssessmentShell';
import {CIS_ORDER,implementationTone,CisStatusPill} from './CisStatus';
import BrawndoCisFindings,{directFindings} from './BrawndoCisFindings';
import GenericGuidedAssessor from './GenericGuidedAssessor';
// Pure native evaluators only: this module has no Demo seed, store or transport imports.
import {generatedItems} from '@/preview/assessmentItems';
import R4AssessmentContext from './R4AssessmentContext';
import {AssessmentClientContextProvider,AssessmentClientContextSource} from './AssessmentClientContext';
import AssessmentPolicyLinks from './AssessmentPolicyLinks';
import R4FrameworkSource from './R4FrameworkSource';
import {genericGuidedFramework} from '@/lib/genericGuidedAssessment';
import {cmmcRequirementPresentation} from '@/lib/cmmcScope';
import {OMNI_ESCAPE_EVENT} from './OmniWindow';
import './R4Framework.css';
import {cisVisualRecordMatches} from '@/lib/brawndoCisVisual';
import BrawndoCisSafeguard from './BrawndoCisSafeguard';
import PrestigeSocAssessment from './PrestigeSocAssessment';
import FrameworkRecordAccess from './FrameworkRecordAccess';
import {AlertDialog,AlertDialogContent,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction} from './ui/alert-dialog';

const IDS={reviews:'review_id',findings:'finding_id',tasks:'task_id',risks:'risk_id',policies:'policy_id',requirements:'requirement_id',evidence:'evidence_id',vendors:'vendor_id'};
const SELECT='w-full border border-line bg-surface-card rounded p-2 text-sm';
function FrameworkDrawerContent({open,onOpenChange,record,requestedRecord=record,onRecordAccepted,onRecordRetained,onLeaveDiscard,clientId,onSaved,onPrevious,onNext,position,breadcrumb,recordManagement=false,reviewManagement=false,onReviews,visualReference=false,cisVisualOrigin,onManage,closeRequest=0,onCloseCancelled,isoView}){
  const auth=useAuth(),org=useOrg()||{},{user}=auth,aid=record.framework_assessment_id,definition=frameworkDefinition(record.framework_key,record.definition_id);
  const frameworkKey=record.framework_key,recordClientId=record.client_id,definitionId=record.definition_id,frameworkVersion=record.framework_version;
  const demoMode=PREVIEW_MODE||auth.demoMode===true,workspaceMode=auth.workspaceMode,userWorkspaceMode=user?.workspace_mode;
  const actorOriginKey=JSON.stringify([user?.user_id,user?.role,user?.workspace_mode,auth.workspaceMode,PREVIEW_MODE]);
  const cisIdentityContext={...org,...auth,authLoading:auth.loading,authError:auth.error,orgLoading:org.loading,orgError:org.error,
    selectedClientId:selectedClient(),routeClientId:new URLSearchParams(window.location.search).get('client_id')};
  const nativeCisExperience=cisExperienceEligible(cisIdentityContext);
  const inheritedCisVisual=cisVisualOrigin?.key===actorOriginKey && cisVisualOrigin.clientId===clientId
    && cisVisualOrigin.programId===`${clientId}:cis-ig1`
    && cisVisualOrigin.assessmentId===aid && cisVisualOrigin.definitionId===record.definition_id && record.framework_key==='cis-ig1'
    && nativeCisExperience;
  const visualOriginKey=visualReference||inheritedCisVisual?actorOriginKey:null;
  const catalog=frameworkCatalog(record.framework_key),isCsf=record.framework_key==='nist-csf-2',isSoc=record.framework_key==='soc-2',isCis=record.framework_key==='cis-ig1',item=catalog?.labels?.item||(isCis?'Safeguard':'Requirement'),program=operatorProgram(record.framework_key);
  const statuses=operatorStatuses(record.framework_key);
  const statusChoiceId=useId();
  const workspace=record.client_id===clientId?frameworkWorkspace(record.framework_key):'generic';
  const brawndoCis=workspace==='cis';
  const pilotContextOnly=brawndoCis&&!recordManagement&&!reviewManagement&&visualReference===true
    && auth.workspaceMode==='demo'&&user?.workspace_mode==='demo'&&(PREVIEW_MODE||auth.demoMode===true)
    && clientId==='demo_brawndo'&&record.client_id===clientId&&record.definition_id==='1.1'&&record.framework_version==='8.1'
    && window.location.pathname==='/compliance/cis-ig1'&&nativeCisExperience
    && cisClientProgram(cisIdentityContext.currentClient)?.implementationGroup===1;
  const prestigeSoc=workspace==='soc';
  const prototype=['cis-ig1','iso-27001','soc-2'].includes(record.framework_key);
  const genericPresentation=genericGuidedFramework(record.framework_key);
  const writable=['super_admin','platform_admin','client_grc_manager'].includes(user?.role) ||
    user?.role==='client_contributor' && record?.owner_id===user?.user_id;
  const [tab,setTab]=useState(recordManagement&&record.framework_key==='iso-27001'?'Related':''),[form,setForm]=useState(record),[readContext,setCtx]=useState(null),[error,setError]=useState(''),[operationBusy,setBusy]=useState(false),[revision,setRevision]=useState(0),[nested,setNested]=useState(null),[comment,setComment]=useState(''),[finding,setFinding]=useState(null),[link,setLink]=useState({kind:'risks',id:''});
  const [reviewDraft,setReviewDraft]=useState(false),[guidedDraft,setGuidedDraft]=useState(false);
  const [coordination,setCoordination]=useState(null),[contextDraft,setContextDraft]=useState(false);
  const contextIdentity=useMemo(()=>({mode:workspaceMode,actorId:user?.user_id,clientId,frameworkKey,assessmentId:aid}),[workspaceMode,user?.user_id,clientId,frameworkKey,aid]);
  const contextSubmission=useRef(null);
  const guardedDownload=useEvidenceDownload(clientId,aid,open);
  const parentClientAvailable=useClientWorkspaceAvailable(),parentAssessmentAvailable=useAssessmentSurfaceAvailable();
  const inheritedCommandApi=useAssessmentApi();
  const requestedAid=requestedRecord.framework_assessment_id,requestedDefinitionId=requestedRecord.definition_id,requestedVersion=requestedRecord.framework_version;
  const requestedIdentity=JSON.stringify([requestedRecord.client_id,requestedRecord.framework_key,requestedAid,requestedRecord.definition_id,requestedRecord.framework_version]);
  const readIdentity=JSON.stringify([requestedIdentity,workspaceMode,user?.user_id,user?.role,user?.status,user?.updated_at,user?.client_ids,user?.all_clients,auth.loading,!!auth.error,org.loading,!!org.error,org.workspaceIdentity,parentClientAvailable,parentAssessmentAvailable]);
  const readOwner=useRef(null);
  if(readOwner.current?.identity!==readIdentity||readOwner.current?.inherited!==inheritedCommandApi)readOwner.current={identity:readIdentity,inherited:inheritedCommandApi};
  const contextOwner=readOwner.current;
  const activeContextOwner=useRef(contextOwner),activeContextOperation=useRef(null);activeContextOwner.current=contextOwner;
  const requestedMatches=requestedAid===aid&&requestedRecord.client_id===recordClientId&&requestedRecord.framework_key===frameworkKey
    &&requestedRecord.definition_id===definitionId&&requestedRecord.framework_version===frameworkVersion;
  const ctx=requestedMatches&&readContext?.authorityOwner===contextOwner?readContext:null;
  const parentAvailable=parentClientAvailable&&parentAssessmentAvailable&&!!user?.user_id&&user?.status!=='disabled'&&!user?.password_change_required
    &&auth.loading!==true&&!auth.error&&org.loading!==true&&!org.error;
  const commandIdentity=JSON.stringify([requestedIdentity,org.workspaceIdentity,assessmentSecurityScope(user,workspaceMode,clientId)]);
  const inheritedCommandOwner=inheritedCommandApi.assessmentCommandOwner;
  const commandEpoch=useRef(null);
  if(commandEpoch.current?.identity!==commandIdentity||commandEpoch.current?.inherited!==inheritedCommandOwner)commandEpoch.current={identity:commandIdentity,inherited:inheritedCommandOwner};
  const commandOwner=commandEpoch.current;
  const authorityReady=parentAvailable&&!!ctx?.current&&frameworkContextResponse(ctx.current,contextIdentity)
    &&ctx.current.definition_id===definitionId&&ctx.current.framework_version===frameworkVersion;
  const operationWritable=canOperate(user),pendingMutations=useRef(new Set()),memoryIntents=useRef(new Set());
  const [writeVersion,setWriteVersion]=useState(0);
  const authority=useRef(null),notifyWrite=useCallback(()=>{if(authority.current)setWriteVersion(value=>value+1);},[]);
  authority.current={owner:contextOwner,commandOwner,readable:parentAvailable&&requestedMatches,available:authorityReady&&operationWritable,pendingMutations:pendingMutations.current,memoryIntents:memoryIntents.current,onWriteChange:notifyWrite};
  const api=useScopedAssessmentApi(authority,contextOwner);
  const contextCommand=useFrameworkContextIntent(contextIdentity,api),busy=operationBusy;
  const draftIdentity=frameworkContextScope(contextIdentity);
  const guidedOwner=useRef({identity:draftIdentity});
  if(guidedOwner.current?.identity!==draftIdentity)guidedOwner.current={identity:draftIdentity};
  const guidedScope=guidedOwner.current;
  const [guidedItemsDraft,setGuidedItemsDraft]=useState(null);
  const activeGuidedItemsDraft=guidedItemsDraft?.scope===guidedScope&&guidedItemsDraft.commandOwner===commandOwner?guidedItemsDraft:null;
  const proposedItems=activeGuidedItemsDraft?.items??null;
  const [genericInterviewScope,setGenericInterviewScope]=useState(null),genericGuideOwner=useRef(null);
  const genericInterviewOpen=genericInterviewScope===guidedScope;
  const genericDraftChanged=useCallback(value=>{if(guidedOwner.current===guidedScope)setGuidedDraft(value);},[guidedScope]);
  const genericOpenChanged=useCallback(value=>{if(guidedOwner.current===guidedScope)setGenericInterviewScope(value?guidedScope:null);},[guidedScope]);
  useLayoutEffect(()=>{
    guidedOwner.current=guidedScope;
    return()=>{if(guidedOwner.current===guidedScope)guidedOwner.current=null;};
  },[guidedScope]);
  const contextReadGeneration=useRef(0);
  useLayoutEffect(()=>{authority.current={owner:contextOwner,commandOwner,readable:parentAvailable&&requestedMatches,available:authorityReady&&operationWritable,pendingMutations:pendingMutations.current,memoryIntents:memoryIntents.current,onWriteChange:notifyWrite};return()=>{if(authority.current?.owner===contextOwner)authority.current=null;};},[contextOwner,commandOwner,parentAvailable,requestedMatches,authorityReady,operationWritable,notifyWrite]);
  useLayoutEffect(()=>{
    activeContextOwner.current=contextOwner;
    if(activeContextOperation.current&&activeContextOperation.current!==commandOwner){activeContextOperation.current=null;setBusy(false);}
    return()=>{if(activeContextOwner.current===contextOwner)activeContextOwner.current=null;};
  },[contextOwner,commandOwner]);
  const [controlDraft,setControlDraft]=useState(false);
  const [itemsDraft,setItemsDraft]=useState(false);
  const [stagedImplementationForm,setStagedImplementationForm]=useState(null);
  const [savedForm,setSavedForm]=useState(record),[feedback,setFeedback]=useState(''),[pending,setPending]=useState(null),[resolvedTarget,setResolvedTarget]=useState(null);
  const [assessmentSurface,setAssessmentSurface]=useState(null);
  const pendingFocus=useRef(null),restorePilotFocus=useRef(false);
  const guideConfiguration=useRef(null);
  const liveGuideContext=ctx?.current?.framework_assessment_id===aid&&ctx.current.client_id===clientId&&ctx.current.framework_key===record.framework_key?ctx:null;
  const liveCisContext=brawndoCis?liveGuideContext:null;
  // Retain only mount readiness across refreshes; native writes still require the live context.
  if(genericPresentation&&liveGuideContext)genericGuideOwner.current=guidedScope;
  const genericGuideMounted=genericGuideOwner.current===guidedScope;
  const cisVisualReference=!!visualOriginKey&&cisVisualRecordMatches(record,liveCisContext,visualOriginKey);
  // Appearance follows this live, verified opener only; it grants no native write permission.
  const nestedCisVisualOrigin=cisVisualReference?{key:visualOriginKey,clientId,programId:liveCisContext.visualOrigin.programId,assessmentId:aid,definitionId:record.definition_id}:undefined;
  if(!prototype||ctx!==null&&!liveGuideContext||guideConfiguration.current&&(guideConfiguration.current.assessment_id!==aid||guideConfiguration.current.client_id!==clientId||guideConfiguration.current.framework_key!==record.framework_key))guideConfiguration.current=null;
  if(liveGuideContext)guideConfiguration.current={client_id:clientId,assessment_id:aid,framework_key:record.framework_key,configuration:liveGuideContext.configuration};
  // Keep only this identity's guide mounted on context failure; saving still requires live context.
  const guidedConfiguration=ctx===null?guideConfiguration.current?.configuration:null;
  const dirty=JSON.stringify(form)!==JSON.stringify(savedForm)||!!coordination||contextDraft,linkDraft=recordManagement&&!!link.id;
  const childSaveUnsettled=useCallback(()=>pendingMutations.current.size>0||[...memoryIntents.current].some(intent=>intent.unconfirmed()),[]);
  const leave=useCallback(fn=>{
    if(operationBusy)return;
    if(childSaveUnsettled()){setError('A linked record save is unconfirmed. Finish or retry it in its original editor before leaving.');return;}
    if(dirty||guidedItemsDraft||guidedDraft||reviewDraft||controlDraft||itemsDraft||finding||comment.trim()||linkDraft){
      pendingFocus.current=document.activeElement;restorePilotFocus.current=false;
      setPending(()=>()=>{
        if(activeContextOwner.current!==contextOwner||authority.current?.owner!==contextOwner)return;
        if(childSaveUnsettled()){setError('Finish the original linked record save before leaving.');return;}
        const latest=nativeSnapshot.current;
        const baseline=latest.current&&frameworkContextResponse(latest.current,contextIdentity)
          &&latest.current.definition_id===definitionId&&latest.current.framework_version===frameworkVersion?latest.current:latest.savedForm;
        onLeaveDiscard?.(baseline);fn();
      });
    }else fn();
  },[operationBusy,childSaveUnsettled,dirty,guidedItemsDraft,guidedDraft,reviewDraft,controlDraft,itemsDraft,finding,comment,linkDraft,contextOwner,contextIdentity,definitionId,frameworkVersion,onLeaveDiscard]);
  const latestLeave=useRef(leave),switchPending=useRef(null),acceptRecord=useRef(onRecordAccepted),retainRecord=useRef(onRecordRetained);
  latestLeave.current=leave;acceptRecord.current=onRecordAccepted;retainRecord.current=onRecordRetained;
  useLayoutEffect(()=>{
    if(requestedMatches||!childSaveUnsettled())return;
    // Refusing an external target must restore a reachable original editor,
    // not leave its uncertain command hidden behind the refused target.
    switchPending.current=null;setPending(null);
    setFeedback('The original editor is retained. Finish its unconfirmed save before opening another record.');
    retainRecord.current?.();
  },[requestedMatches,contextOwner,writeVersion,childSaveUnsettled]);
  useEffect(()=>{
    if(requestedMatches){if(switchPending.current){switchPending.current=null;setPending(null);}return;}
    const target=resolvedTarget;
    if(!target||target.owner!==contextOwner||target.generation!==contextReadGeneration.current||operationBusy||childSaveUnsettled()||switchPending.current===contextOwner)return;
    switchPending.current=contextOwner;
    latestLeave.current(()=>{
      if(activeContextOwner.current!==target.owner||contextReadGeneration.current!==target.generation||switchPending.current!==target.owner)return;
      switchPending.current=null;acceptRecord.current?.(target.record);
    });
  },[resolvedTarget,requestedMatches,contextOwner,operationBusy,childSaveUnsettled,writeVersion]);
  // A newly mounted editor adopts the current token; later requests use its native leave guard.
  const handledCloseRequest=useRef(closeRequest),externalClosePending=useRef(false);
  useEffect(()=>{
    if((!isSoc&&record.framework_key!=='iso-27001')||!open||busy||childSaveUnsettled()||!closeRequest||handledCloseRequest.current===closeRequest)return;
    handledCloseRequest.current=closeRequest;
    externalClosePending.current=true;
    leave(()=>{externalClosePending.current=false;onOpenChange(false);});
  },[isSoc,record.framework_key,open,busy,closeRequest,leave,onOpenChange,childSaveUnsettled,writeVersion]);
  function cancelLeave(){
    setPending(null);
    if(switchPending.current){switchPending.current=null;onRecordRetained?.();}
    if(externalClosePending.current){externalClosePending.current=false;onCloseCancelled?.();}
  }
  useEffect(()=>{if(!dirty&&!guidedItemsDraft&&!guidedDraft&&!reviewDraft&&!controlDraft&&!itemsDraft&&!finding&&!comment.trim()&&!linkDraft)return;const warn=e=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty,guidedItemsDraft,guidedDraft,reviewDraft,controlDraft,itemsDraft,finding,comment,linkDraft]);
  useEffect(()=>{
    const c=new AbortController();
    const request=++contextReadGeneration.current,owner=activeContextOwner.current;
    const acceptsRead=()=>!c.signal.aborted&&request===contextReadGeneration.current&&activeContextOwner.current===owner;
    if(!parentAvailable){setCtx(null);setError('Assessment access is temporarily unavailable. Your draft is retained.');return()=>c.abort();}
    // Equivalent DTO copies must not restart the read loop; only these identity fields are consumed.
    const openerRecord={framework_assessment_id:requestedAid,client_id:recordClientId,framework_key:frameworkKey,definition_id:requestedDefinitionId,framework_version:requestedVersion};
    // Keep native linked rows mounted during same-origin refreshes. Clear a
    // changed visual origin so an away/back switch cannot reuse its old receipt.
    setCtx(old=>!acceptsRead()?old:prototype&&old?.current?.framework_assessment_id===aid&&old.current.client_id===clientId
      &&(old.visualOrigin?.key??null)===visualOriginKey?{...old,itemCountRead:null}:null);
    setError(previous=>acceptsRead()?'':previous);const opts={params:{client_id:clientId},signal:c.signal};
    // Only the exact pilot may omit unused detail reads. Other native openers retain their ordered reads.
    Promise.all([nativeApi.get(`/framework_assessments/${requestedAid}/related`,{signal:c.signal}),nativeApi.get('/clients/'+clientId+'/members',{signal:c.signal}),pilotContextOnly?Promise.resolve({data:[]}):nativeApi.get('/contacts',opts),pilotContextOnly?Promise.resolve({data:[]}):nativeApi.get('/comments',{params:{entity_type:'framework_assessments',entity_id:requestedAid},signal:c.signal}),pilotContextOnly?Promise.resolve({data:[]}):nativeApi.get(`/framework_assessments/${requestedAid}/activity`,{signal:c.signal}),nativeApi.get('/frameworks/'+frameworkKey,opts)]).then(async ([related,users,contacts,comments,activity,workspace])=>{
      if(!acceptsRead())return;
      const context={authorityOwner:owner,itemCountRead:{owner,generation:request},programSelected:workspace.data.selected===true,programConfigured:workspace.data.configured===true,framework:workspace.data.framework,visualOrigin:visualOriginKey?{key:visualOriginKey,selected:workspace.data.selected,configured:workspace.data.configured,framework:workspace.data.framework,programId:workspace.data.implementation_position?.program_id}:null,related:related.data,users:users.data,configuration:{...(workspace.data.configuration||{}),...(['soc-2','iso-27001'].includes(frameworkKey)?{__program_active:workspace.data.selected}: {})},retainedControls:(workspace.data.organizational_controls||[]).filter(control=>control.assessment_ids?.includes(requestedAid)),inventoryContext:workspace.data.assessments.find(a=>a.client_id===clientId&&a.framework_key==='cis-ig1'&&a.definition_id==='1.1'),current:(found=>found&&{...found,work:workspace.data.work?.[requestedAid]})(workspace.data.assessments.find(a=>a.framework_assessment_id===requestedAid))};
      const freshPilot=pilotContextOnly&&cisVisualRecordMatches(openerRecord,context,visualOriginKey)
        &&brawndoAssessmentPilotEligible({demoMode,workspaceMode,user:{workspace_mode:userWorkspaceMode},
          safeguard11:true,directProgramOpener:visualReference===true,record:openerRecord,current:context.current,ctx:context,pathname:window.location.pathname});
      // The earlier client DTO is only a hint: a fresh scope/record mismatch restores full context before rendering.
      if(pilotContextOnly&&!freshPilot)[contacts,comments,activity]=await Promise.all([
        nativeApi.get('/contacts',opts),nativeApi.get('/comments',{params:{entity_type:'framework_assessments',entity_id:requestedAid},signal:c.signal}),
        nativeApi.get(`/framework_assessments/${requestedAid}/activity`,{signal:c.signal})]);
      if(!acceptsRead())return;
      if(!context.current||context.current.client_id!==clientId||context.current.framework_key!==frameworkKey
        ||context.current.definition_id!==requestedDefinitionId||context.current.framework_version!==requestedVersion){
        setCtx(null);return;
      }
      if(!requestedMatches){
        setResolvedTarget({owner,generation:request,record:context.current});
        return;
      }
      if(acceptsRead())setCtx(old=>acceptsRead()?({...context,contacts:contacts.data,comments:comments.data,activity:activity.data,
        options:{...(prototype&&old?.current?.framework_assessment_id===requestedAid&&old.current.client_id===clientId?old.options:{}),reviews:related.data.reviews||[]}}):old);
    }).catch(e=>{if(acceptsRead()){setCtx(old=>acceptsRead()?null:old);setError(previous=>acceptsRead()?formatError(e):previous);}});return()=>c.abort();
  },[aid,requestedAid,requestedDefinitionId,requestedVersion,requestedMatches,requestedIdentity,parentAvailable,clientId,recordClientId,frameworkKey,definitionId,frameworkVersion,revision,prototype,actorOriginKey,visualOriginKey,pilotContextOnly,demoMode,workspaceMode,userWorkspaceMode,visualReference,contextOwner]);
  const contextLoaded=!!ctx;
  useEffect(()=>{
    if(!contextLoaded)return;
    const kind=reviewDraft?'reviews':tab==='Related'?link.kind:null;
    if(!kind)return;
    const c=new AbortController();
    const request=contextReadGeneration.current,owner=activeContextOwner.current;
    const acceptsRead=()=>!c.signal.aborted&&request===contextReadGeneration.current&&activeContextOwner.current===owner;
    api.get('/'+kind,{params:{client_id:clientId},signal:c.signal}).then(({data})=>{
      if(acceptsRead())setCtx(old=>acceptsRead()&&old?{...old,options:{...old.options,[kind]:data}}:old);
    }).catch(e=>{if(acceptsRead())setError(previous=>acceptsRead()?formatError(e):previous);});
    return()=>c.abort();
  },[contextLoaded,clientId,aid,tab,link.kind,reviewDraft,revision,api]);
  async function run(fn,owner=null){
    const epoch=contextOwner,operation=commandOwner,ordinary=owner===operation;
    const live=()=>{
      if(ordinary){try{api.assertAssessmentCurrent(true,true,'settle');return true;}catch{return false;}}
      return authority.current?.available&&activeContextOwner.current===epoch&&(owner===null||owner===epoch||guidedOwner.current===owner);
    };
    if(!authority.current?.available||!live())return false;
    activeContextOperation.current=ordinary?operation:epoch;
    setBusy(true);setError('');
    try{await fn();if(!live())return false;setRevision(n=>n+1);onSaved?.();return true;}
    catch(e){if(live())setError(formatError(e));return false;}
    finally{if(live()){if(activeContextOperation.current===(ordinary?operation:epoch))activeContextOperation.current=null;setBusy(false);}}
  }
  const put=(key,value)=>{if(activeContextOwner.current!==contextOwner||authority.current?.commandOwner!==commandOwner)return;setFeedback('');setForm(p=>({...p,[key]:value,...(p.guided_assessment_source&&['status','implementation'].includes(key)?{guided_assessment_source:undefined}:{}),...(brawndoCis&&p.cis_operation&&['owner_id','process_owner_id','implementation'].includes(key)?{cis_operation:{...p.cis_operation,confirmed:false}}:{})}));};
  const applyGuided=values=>{if(activeContextOwner.current!==contextOwner||authority.current?.commandOwner!==commandOwner||!authority.current?.available)return false;setForm(p=>({...p,...values,...(p.cis_operation?{cis_operation:{...p.cis_operation,confirmed:false}}:{})}));setGuidedDraft(false);setFeedback('Guided pilot applied to draft. Review and Save assessment; verification is unchanged.');return true;};
  const stageGuidedImplementation=(text,expected,proposal=null)=>{
    const latest=nativeSnapshot.current;
    if(activeContextOwner.current!==contextOwner||authority.current?.commandOwner!==commandOwner||!authority.current?.available||guidedOwner.current!==guidedScope||!latest?.writable||latest.busy||(latest.form.implementation||'')!==expected)return false;
    const implementationOnly=JSON.stringify(latest.form)===JSON.stringify(latest.savedForm)||stagedImplementationForm===JSON.stringify(latest.form);
    if(proposal){
      if(guidedItemsDraft?.scope===guidedScope&&guidedItemsDraft.operations.length){setError('Save or discard the pending Item edits before applying another interview.');return false;}
      if(!latest.guidedContextAvailable||latest.relatedDraft||latest.contextDraft||!implementationOnly){
        setError('Finish or discard the other assessment and related-record edits before applying this interview.');return false;
      }
      if(proposal.client_id!==clientId||proposal.assessment_id!==aid||proposal.actor_id!==user?.user_id
        ||proposal.completed!==true||proposal.narrative!==text||typeof proposal.version!=='string'
        ||!Number.isInteger(proposal.revision)||proposal.revision<1||typeof proposal.generated_at!=='string'||!proposal.generated_at.trim()
        ||!proposal.answers||typeof proposal.answers!=='object'||Array.isArray(proposal.answers)){
        setError('The completed interview does not match this assessment. Reopen the current guide before applying.');return false;
      }
      let items;
      try{
        // Read-only proposed origins. Discard adapter IDs/fingerprints/history: native Save is authoritative.
        const evidence=latest.evidence;
        const evidenceLinked=Array.isArray(evidence)?evidence.length>0:null;
        items=generatedItems(record,proposal,{evidenceLinked}).map(({question_id,kind,text,item_type})=>({question_id,kind,text,item_type}));
      }catch(error){setError(formatError(error));return false;}
      const source=Object.fromEntries(['version','revision','generated_at'].map(key=>[key,proposal[key]]));
      const next={...latest.form,implementation:text,guided_assessment_source:source,
        ...(latest.form.cis_operation&&text!==latest.savedForm.implementation?{cis_operation:{...latest.form.cis_operation,confirmed:false}}:{})};
      const snapshot=JSON.stringify(next);
      setForm(next);setStagedImplementationForm(snapshot);setGuidedDraft(false);
      setGuidedItemsDraft({scope:guidedScope,commandOwner,source,items,answers:proposal.answers,operations:[],
        expected_items_revision:latest.savedForm.items_revision||0,form:snapshot,baseline:JSON.stringify(latest.savedForm)});
      setFeedback('Current implementation and proposed Items remain unsaved. Save assessment commits them; status and verification are unchanged.');
      return true;
    }
    const next={...latest.form,implementation:text,...(latest.form.guided_assessment_source?{guided_assessment_source:undefined}:{}),
      ...(latest.form.cis_operation?{cis_operation:{...latest.form.cis_operation,confirmed:false}}:{})};
    setForm(next);setStagedImplementationForm(implementationOnly?JSON.stringify(next):null);
    setGuidedItemsDraft(null);
    setFeedback('Omni answer is saved to the interview. Current implementation remains a draft until Save assessment. Status and verification are unchanged.');return true;
  };
  const guidedSavePending=useRef(false);
  async function patchAssessment(body,{ordinary=true}={}){
    if(!authority.current?.available||authority.current.commandOwner!==commandOwner)throw new Error('Reload the current assessment context before saving. Your draft is retained.');
    if(contextDraft)throw new Error('Apply or discard context edits before saving the assessment.');
    const payload=coordination?{...body,coordination}:body;
    if(!coordination&&!contextCommand.unconfirmed()){
      const ordinaryPatch=ordinary&&!Object.hasOwn(body,'guided_assessment_source')&&!Object.hasOwn(body,'item_draft');
      const response=await api.patch('/framework_assessments/'+aid,payload,ordinaryPatch?{assessmentOperation:true}:undefined);
      return ordinaryPatch?{...response,ordinaryAssessmentOwner:commandOwner}:response;
    }
    if(!frameworkContextResponse(record,contextIdentity))throw new Error('The assessment identity does not match this client workspace.');
    if(!contextCommand.unconfirmed())contextSubmission.current={form:JSON.stringify(form)};
    const response=await contextCommand('/framework_assessments/'+aid,payload);
    if(activeContextOwner.current!==contextOwner||!authority.current?.available)throw new Error('This assessment editor has ended. Reopen the current record.');
    return {...response,contextReceipt:{payload,draft:contextSubmission.current}};
  }
  function acceptAssessment(response){
    const {data,contextReceipt}=response;
    const ordinary=response.ordinaryAssessmentOwner===commandOwner;
    if(ordinary)api.assertAssessmentCurrent(true,true,'settle');
    else if(activeContextOwner.current!==contextOwner||!authority.current?.available)throw new Error('This assessment editor has ended. Its draft has not been replaced.');
    if(!frameworkContextResponse(data,contextIdentity)||data.definition_id!==definitionId||data.framework_version!==frameworkVersion)
      throw new Error('The assessment save response does not match this record. Its draft has not been replaced.');
    // The matching confirmed receipt also supersedes pre-commit joined reads
    // from a newer raw read epoch under the same surviving ordinary operation.
    contextReadGeneration.current++;
    setCtx(previous=>previous&&frameworkContextResponse(previous.current,contextIdentity)
      ?{...previous,current:{...data,work:previous.current?.work},itemCountRead:null}:previous);
    setSavedForm(data);
    setGuidedItemsDraft(previous=>previous?.scope===guidedScope&&previous.commandOwner===commandOwner&&data.guided_assessment_source
      &&['version','revision','generated_at'].every(key=>data.guided_assessment_source[key]===previous.source[key])?null:previous);
    if(!contextReceipt){setForm(data);return false;}
    const newerForm=!contextReceipt.draft||JSON.stringify(nativeSnapshot.current.form)!==contextReceipt.draft.form;
    const newer=newerForm||nativeSnapshot.current.contextDraft
      ||JSON.stringify(nativeSnapshot.current.coordination)!==JSON.stringify(contextReceipt.payload.coordination);
    setForm(previous=>newerForm?{...previous,last_saved:data.last_saved,last_assessed:data.last_assessed}:data);
    setCoordination(previous=>JSON.stringify(previous)===JSON.stringify(contextReceipt.payload.coordination)?null:previous);
    contextSubmission.current=null;
    return newer;
  }
  async function retryContextSave(){
    const request=contextCommand.pendingRequest();
    if(!writable||!canOperate(user)||!frameworkContextResponse(record,contextIdentity)
      ||!frameworkContextRequest(request,contextIdentity))return false;
    return run(async()=>{
      const response=await contextCommand.retry();
      if(activeContextOwner.current!==contextOwner||!authority.current?.available)throw new Error('This assessment editor has ended. Reopen the current record.');
      const newer=acceptAssessment({...response,contextReceipt:{payload:request[1],draft:contextSubmission.current}});
      setFeedback(newer?'The original assessment save is confirmed. Newer edits remain unsaved.':'The original assessment save is confirmed.');
      await org.refresh?.();
    },contextOwner);
  }
  const nativeSnapshot=useRef(null);nativeSnapshot.current={form,savedForm,current:ctx?.current,coordination,contextDraft,busy,writable,guidedDraft,guidedItemsDraft,assessmentDirty:dirty,guidedContextAvailable:!!liveGuideContext,evidence:liveGuideContext?.related?.evidence,relatedDraft:itemsDraft||reviewDraft||controlDraft||itemsDraft||!!finding||!!comment.trim()||linkDraft};
  function canDiscardGenericAssessment(){
    const latest=nativeSnapshot.current;
    return guidedOwner.current===guidedScope&&activeContextOwner.current===contextOwner
      &&latest.writable&&!latest.busy&&latest.guidedContextAvailable&&!latest.contextDraft
      &&!latest.coordination&&!latest.relatedDraft&&!contextCommand.unconfirmed();
  }
  function discardGenericAssessment(){
    if(!canDiscardGenericAssessment())return;
    pendingFocus.current=document.activeElement;restorePilotFocus.current=false;
    setPending(()=>()=>{
      if(!canDiscardGenericAssessment())return;
      setForm(nativeSnapshot.current.savedForm);
      setGuidedItemsDraft(previous=>previous?.scope===guidedScope?null:previous);
      setStagedImplementationForm(null);setFeedback('');
    });
  }
  async function saveGenericAndNext(){
    const latest=nativeSnapshot.current;
    if(guidedOwner.current!==guidedScope||!latest.writable||latest.busy||!latest.guidedContextAvailable
      ||latest.guidedDraft||latest.relatedDraft||latest.contextDraft)return;
    if(await save()&&guidedOwner.current===guidedScope&&activeContextOwner.current===contextOwner
      &&!nativeSnapshot.current.guidedDraft&&!nativeSnapshot.current.relatedDraft&&!nativeSnapshot.current.contextDraft)onNext?.();
  }
  async function saveGuidedAssessment(values,expected){
    const latest=nativeSnapshot.current;
    const socEnabled=isSoc&&socGuidedEnabled(clientId,user,record.framework_key,ctx?.configuration,record.definition_id);
    const isoEnabled=isoGuidedEnabled(clientId,user,record.framework_key,ctx?.configuration,record.definition_id);
    if((!isoEnabled&&!socEnabled&&!inventorySummaryEnabled(clientId,user,record.framework_key,ctx?.configuration,record))||prototype&&!latest.guidedContextAvailable||!latest.writable||latest.busy||guidedSavePending.current)return false;
    if(latest.relatedDraft){setError('Finish or discard the related-record draft before saving this summary.');return false;}
    if(JSON.stringify(latest.form)!==expected||JSON.stringify(latest.form)!==JSON.stringify(latest.savedForm)){
      setError('The native assessment has unsaved or changed content. Review it before saving this summary.');return false;
    }
    guidedSavePending.current=true;
    try{
      if(isoEnabled)return await run(async()=>{
        const decision=Object.hasOwn(values,'soa_applicability');
        const fields=decision?['soa_applicability','soa_justification']:['implementation','status','guided_assessment_source'];
        const body=Object.fromEntries(fields.map(key=>[key,values[key]]));
        const response=await patchAssessment({...body,expected_last_assessed:latest.savedForm.last_saved||latest.savedForm.last_assessed||null},{ordinary:false});
        const {data}=response,newer=acceptAssessment(response);setCtx(previous=>previous?{...previous,current:{...data,work:previous.current?.work}}:previous);
        if(!decision&&!newer)setGuidedDraft(false);
        setFeedback(decision?'Applicability decision saved. Implementation and prior approvals are unchanged.':'Assessment saved. Applicability, verification and linked work are unchanged.');
      },contextOwner);
      if(socEnabled)return await run(async()=>{
        const response=await patchAssessment({implementation:values.implementation,status:values.status,guided_assessment_source:values.guided_assessment_source,record_assessment:values.status!=='not_assessed',expected_last_assessed:latest.savedForm.last_saved||latest.savedForm.last_assessed||null},{ordinary:false});
        const newer=acceptAssessment(response);if(!newer)setGuidedDraft(false);setFeedback('Assessment saved. Verification and linked work are unchanged.');
      },contextOwner);
      const assessment={...latest.form,implementation:values.implementation,status:values.status,guided_assessment_source:values.guided_assessment_source,...(latest.form.cis_operation?{cis_operation:{...latest.form.cis_operation,confirmed:false}}:{})};
      const success=await save({assessment});
      if(success)setGuidedDraft(false);
      return success;
    }finally{guidedSavePending.current=false;}
  }
  const who=id=>personLabel(ctx?.users,id,'Not recorded');
  async function save({recordAssessment=false,assessment=form}={}){
    if(!writable)return false;
    if(contextDraft){setError('Apply or discard the context edits before saving the assessment.');return false;}
    let newer=false;
    const strictDraft=!!guidedItemsDraft||assessment!==form||!!assessment.guided_assessment_source&&JSON.stringify(assessment.guided_assessment_source)!==JSON.stringify(savedForm.guided_assessment_source);
    const saved=await run(async()=>{
      let body;
      if(guidedItemsDraft){
        if(guidedItemsDraft.scope!==guidedScope||guidedItemsDraft.commandOwner!==commandOwner||guidedOwner.current!==guidedScope||!nativeSnapshot.current.guidedContextAvailable||recordAssessment
          ||nativeSnapshot.current.relatedDraft||JSON.stringify(assessment)!==guidedItemsDraft.form
          ||JSON.stringify(savedForm)!==guidedItemsDraft.baseline){
          throw new Error('Save this guided draft separately. Restore other assessment edits or cancel and reopen; no fields were omitted and your edits remain here.');
        }
        body={implementation:assessment.implementation,guided_assessment_source:guidedItemsDraft.source,
          expected_last_assessed:savedForm.last_saved??savedForm.last_assessed??null,
          ...(guidedItemsDraft.operations.length?{item_draft:{expected_revision:guidedItemsDraft.expected_items_revision,operations:guidedItemsDraft.operations}}:{})};
      }else{
        const fields=['status','implementation','technology','notes','na_rationale','owner_id','process_owner_id','addressable_decision','addressable_rationale',...(definition.specification==='annex_control'?['soa_applicability','soa_justification']:[]),...(isCsf?['csf_profile']:[]),...(record.framework_key==='iso-27001'?['iso_assessment_checks']:[]),...(brawndoCis?['verification','cis_assessment_criteria']:prestigeSoc?['verification','soc_assessment_checks']:[])];
        body=Object.fromEntries(fields.map(key=>[key,assessment[key]??(key==='csf_profile'?EMPTY_CSF_PROFILE:key==='verification'?'not_verified':['cis_assessment_criteria','soc_assessment_checks','iso_assessment_checks'].includes(key)?[]:key.endsWith('_id')?null:'')]));
        if(brawndoCis&&assessment.cis_operation)body.cis_operation=assessment.cis_operation;
        if(assessment.guided_assessment_source&&JSON.stringify(assessment.guided_assessment_source)!==JSON.stringify(savedForm.guided_assessment_source))body.guided_assessment_source=Object.fromEntries(['version','revision','generated_at'].map(key=>[key,assessment.guided_assessment_source[key]]));
        if(isSoc&&recordAssessment)body.record_assessment=true;
        if(Object.hasOwn(assessment,'policy_link_ids')&&JSON.stringify(assessment.policy_link_ids)!==JSON.stringify(savedForm.policy_link_ids)){
          const withoutPolicies=value=>Object.fromEntries(Object.entries(value).filter(([key])=>key!=='policy_link_ids'));
          if(!recordAssessment&&JSON.stringify(withoutPolicies(assessment))===JSON.stringify(withoutPolicies(savedForm)))body={};
          body.policy_link_ids=assessment.policy_link_ids;
        }
        body.expected_last_assessed=savedForm.last_saved??savedForm.last_assessed??null;
      }
      const response=await patchAssessment(body,{ordinary:!strictDraft}),{data}=response;
      if(guidedItemsDraft&&(guidedOwner.current!==guidedScope||!frameworkContextResponse(data,contextIdentity)))throw new Error('This assessment editor has ended or the save response does not match it. Reopen the current record to read the saved result.');
      newer=acceptAssessment(response);
      if(brawndoCis||assessment!==form)setCtx(previous=>previous?{...previous,current:{...data,work:previous.current?.work}}:previous);
      setFeedback(newer?'The original assessment save is confirmed. Newer edits remain unsaved.':isSoc?(recordAssessment||(data.assessment_recorded_at??null)!==(savedForm.assessment_recorded_at??null)?'Assessment recorded.':'Changes saved; assessment date unchanged.'):'Assessment saved.');
    },strictDraft||coordination||contextCommand.unconfirmed()?contextOwner:commandOwner);
    return saved&&!newer;
  }
  async function download(e){await run(()=>guardedDownload(e),contextOwner);}
  const current=(prototype?liveGuideContext?.current:ctx?.current)||(prototype&&savedForm.client_id===clientId&&savedForm.framework_assessment_id===aid&&savedForm.framework_key===record.framework_key?savedForm:record),related=ctx?.related||{};
  const currentRolloutPresentation=assessmentRolloutEligible({clientId,record,current,ctx,user});
  const retainedRollout=useRef(false);
  if(ctx)retainedRollout.current=currentRolloutPresentation;
  const rolloutPresentation=currentRolloutPresentation||!ctx&&retainedRollout.current;
  const pilotPresentation=pilotContextOnly&&cisVisualReference&&brawndoAssessmentPilotEligible({demoMode:PREVIEW_MODE,
    workspaceMode:auth.workspaceMode,user,safeguard11:true,directProgramOpener:visualReference===true,
    record,current,ctx:liveCisContext,pathname:window.location.pathname});
  const pilotDialogProps=pilotPresentation||rolloutPresentation||genericPresentation?{className:'brawndo-assessment-pilot gn-dialog-box',
    overlayClassName:'brawndo-assessment-pilot gn-dialog-layer',portalContainer:assessmentSurface||undefined,
    onEscapeKeyDown:()=>{restorePilotFocus.current=true;},
    onCloseAutoFocus:event=>{
      if(!restorePilotFocus.current)return;
      event.preventDefault();restorePilotFocus.current=false;
      const opener=pendingFocus.current;
      const target=opener?.isConnected&&!opener.closest('[hidden],[inert],[aria-hidden="true"],[data-state="closed"]')
        ?opener:assessmentSurface?.querySelector('.gn-details-trigger');
      target?.focus({preventScroll:true});
    }}:{};
  function itemsSaved(data){
    if(activeContextOwner.current!==contextOwner||authority.current?.commandOwner!==commandOwner||!authority.current?.available)return;
    const draft=nativeSnapshot.current.guidedItemsDraft;
    if(draft&&(draft.scope!==guidedScope||draft.commandOwner!==commandOwner))return;
    if(data.framework_assessment_id!==aid||data.client_id!==clientId)return;
    const fields={items_to_address:data.items_to_address,items_revision:data.items_revision,item_controls:data.item_controls};
    setForm(previous=>({...previous,...fields}));setSavedForm(previous=>({...previous,...fields}));
    setCtx(previous=>previous?{...previous,current:{...previous.current,...fields}}:previous);
    // Item resolution is independent; carry only its native receipt into the pending comparison snapshots.
    setGuidedItemsDraft(previous=>previous?.scope===guidedScope&&previous.commandOwner===commandOwner?{...previous,
      form:JSON.stringify({...JSON.parse(previous.form),...fields}),
      baseline:JSON.stringify({...JSON.parse(previous.baseline),...fields})}:previous);
    setStagedImplementationForm(previous=>previous?JSON.stringify({...JSON.parse(previous),...fields}):previous);
    onSaved?.();
  }
  function createItemFinding(item){
    if(activeContextOwner.current!==contextOwner||authority.current?.commandOwner!==commandOwner||!authority.current?.available||guidedOwner.current!==guidedScope||!writable||busy||!liveGuideContext||nativeSnapshot.current.assessmentDirty||guidedItemsDraft||finding||item.finding_id||!current.item_controls?.[item.item_id]?.can_create_finding)return;
    // Match the API's code-point limit without splitting surrogate pairs.
    const title=Array.from(item.text).slice(0,200).join('');
    setFinding({request_id:recordUuid(),item_id:item.item_id,title,description:item.text+(item.resolution?'\n\nRecorded resolution: '+item.resolution:''),severity:'medium',owner_id:current.owner_id||'',due_date:'',remediation_title:title});
  }
  function stageItemOperation(operation){
    const latest=nativeSnapshot.current,draft=latest.guidedItemsDraft;
    if(activeContextOwner.current!==contextOwner||authority.current?.commandOwner!==commandOwner||!authority.current?.available||guidedOwner.current!==guidedScope||draft?.scope!==guidedScope||draft.commandOwner!==commandOwner||!latest.writable||latest.busy
      ||!latest.guidedContextAvailable||JSON.stringify(latest.form)!==draft.form||draft.operations.length>=100)return false;
    try{projectItemDraft(current,draft.items,[...draft.operations,operation],draft.answers);}
    catch(failure){setError(formatError(failure));return false;}
    const next={...draft,operations:[...draft.operations,operation]};
    // Acknowledge the staged edit immediately, including another input before React's next render.
    latest.guidedItemsDraft=next;setGuidedItemsDraft(next);
    return true;
  }
  // Only a completed read can establish an omitted legacy Items list as empty.
  const omittedItemsLoaded=!!liveGuideContext&&liveGuideContext.current===current&&!error
    &&liveGuideContext.itemCountRead?.owner===contextOwner
    &&liveGuideContext.itemCountRead?.generation===contextReadGeneration.current
    &&!Object.hasOwn(current,'items_to_address');
  let openItemCount=null;
  try{if(Array.isArray(current.items_to_address)||omittedItemsLoaded)openItemCount=projectItemDraft(current,proposedItems,activeGuidedItemsDraft?.operations||[],activeGuidedItemsDraft?.answers||{}).filter(item=>item.state==='open').length;}
  catch{/* The Item view reports the projection error; unavailable is not zero. */}
  const itemControls={scope:guidedScope,commandScope:frameworkContextScope(contextIdentity),writable,pending:proposedItems!==null,
    sectionCounts:{items:openItemCount,findings:ctx&&current.work?.context_complete===true&&Array.isArray(related.findings)?directFindings(current,related).length:null},
    operations:writable&&authorityReady&&activeGuidedItemsDraft?activeGuidedItemsDraft.operations:[],
    answers:activeGuidedItemsDraft?.answers||{},onOperation:stageItemOperation,
    onRefresh:()=>{setRevision(value=>value+1);onSaved?.();},onOpenWork:setNested,
    clientLabel:org.currentClient?.name||org.currentClient?.client_name};
  async function saveOwner(){return run(async()=>{const {data}=await api.patch(`/framework_assessments/${aid}`,{owner_id:form.owner_id||null,...(record.framework_key==='iso-27001'?{process_owner_id:form.process_owner_id||null}:{}),expected_last_assessed:savedForm.last_saved??savedForm.last_assessed??null},{assessmentOperation:true});setForm(data);setSavedForm(data);setFeedback('Changes saved.');},commandOwner);}
  const retainedContext=frameworkContextRequest(contextCommand.pendingRequest(),contextIdentity);
  const recoveryUrl=clientDestination(clientId,`/compliance/${encodeURIComponent(frameworkKey)}?assessment=${encodeURIComponent(aid)}`);
  const applyCoordination=useCallback(proposal=>{if(activeContextOwner.current!==contextOwner||!authority.current?.available||!['super_admin','platform_admin'].includes(user?.role))return false;setCoordination(proposal);return true;},[contextOwner,user?.role]);
  const contextEditor=<>{retainedContext&&writable&&canOperate(user)&&<section className="panel space-y-2" aria-label="Unconfirmed assessment save"><p>The original assessment and shared-context save is unconfirmed. Retry sends only that original request; newer assessment edits remain in this draft.</p><Button variant="outline" disabled={busy} onClick={retryContextSave}>Retry unconfirmed assessment save</Button><p><a href={recoveryUrl} onClick={event=>{event.preventDefault();leave(()=>window.location.assign(recoveryUrl));}}>Open assessment recovery</a></p></section>}{!recordManagement&&!reviewManagement&&<>{ctx?.itemCountRead?.owner===contextOwner&&ctx.itemCountRead?.generation===contextReadGeneration.current&&!error&&<><AssessmentClientContextSource record={current} definition={definition} related={related} users={ctx.users} configuration={ctx.configuration}/><AssessmentPolicyLinks record={current} value={form.policy_link_ids} related={related.policies} disabled={busy||!writable||!['super_admin','platform_admin'].includes(user?.role)} onChange={value=>put('policy_link_ids',value)}/></>}{ctx&&<R4FrameworkSource framework={record.framework_key} definition={definition} configuration={ctx.configuration}/>}<R4AssessmentContext key={aid} record={record} disabled={busy||!ctx||ctx.itemCountRead?.owner!==contextOwner||ctx.itemCountRead?.generation!==contextReadGeneration.current||contextCommand.unconfirmed()||!['super_admin','platform_admin'].includes(user?.role)} value={coordination} onApply={applyCoordination} onDraftChange={setContextDraft}/></>}</>;
  const overlays=<><AssessmentSurfaceAvailability.Provider value={parentAvailable}><AlertDialog open={!!pending} onOpenChange={v=>{if(!v)cancelLeave();}}>
    <AlertDialogContent {...pilotDialogProps}>
      <AlertDialogTitle>{pilotPresentation?'Unsaved changes':'Leave unsaved changes?'}</AlertDialogTitle>
      <AlertDialogDescription>Your saved assessment is unchanged. Continue editing or discard this draft.</AlertDialogDescription>
      <AlertDialogFooter className={pilotPresentation?'gn-dialog-actions':undefined}>
        <AlertDialogCancel className={pilotPresentation?'gn-button':undefined} onClick={pilotPresentation?()=>{restorePilotFocus.current=true;}:undefined}>Keep editing</AlertDialogCancel>
        <AlertDialogAction className={pilotPresentation?'gn-button gn-primary':undefined} onClick={()=>{const fn=pending;setPending(null);fn?.();}}>{pilotPresentation?'Discard & close':'Discard changes'}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog></AssessmentSurfaceAvailability.Provider>{nested&&<RecordDrawer {...nested} open clientId={clientId} users={ctx?.users||[]} cisVisualOrigin={nestedCisVisualOrigin} schema={SCHEMAS[nested.kind]?.fields} onOpenChange={v=>{if(!v){setNested(null);setRevision(n=>n+1);}}} onSaved={()=>{setRevision(n=>n+1);onSaved?.();}}/>}</>;
  const owned=children=><AssessmentCommandApi.Provider value={api}><AssessmentClientContextProvider record={record} scopeKey={contextOwner} available={authorityReady}><AssessmentSurfaceAvailability.Provider value={authorityReady}>{children}</AssessmentSurfaceAvailability.Provider></AssessmentClientContextProvider></AssessmentCommandApi.Provider>;
  if(recordManagement||reviewManagement)return owned(<><FrameworkRecordAccess reviewsOnly={reviewManagement} state={{itemControls,guidedItemsDraft:proposedItems,itemWorkDisabled:dirty||!!guidedItemsDraft,contextEditor,isoView,assessmentRollout:rolloutPresentation,open,current,definition,catalog,ctx,form,dirty,busy,error,feedback,writable,comment,link}} controlsManagement={current.framework_key==='iso-27001'&&!reviewManagement?<OrganizationalControls clientId={current.client_id} onDraftChange={setControlDraft} onSaved={()=>{setRevision(n=>n+1);onSaved?.();}}/>:undefined} actions={{put,saveOwner,run,setComment,setLink,setNested,setReviewDraft,close:()=>leave(()=>onOpenChange(false)),openReviews:url=>leave(()=>onReviews?.(url)),reviewSaved:()=>{setRevision(n=>n+1);onSaved?.();setFeedback('Review linked.');}}}/>{overlays}</>);
if(prototype)return owned(<>{brawndoCis?<BrawndoCisSafeguard state={{itemControls,guidedItemsDraft:proposedItems,itemWorkDisabled:dirty||!!guidedItemsDraft,detailsOwner:commandOwner,contextEditor,assessmentRollout:rolloutPresentation,visualReference:cisVisualReference,directProgramOpener:visualReference===true,pilotSurfaceRef:setAssessmentSurface,pilotPortalContainer:assessmentSurface,manageRecord:onManage?()=>leave(onManage):undefined,open,record,definition,form,current,ctx:liveCisContext,guidedConfiguration,related,finding,error,busy,dirty,focusedImplementationOnly:stagedImplementationForm===JSON.stringify(form),feedback,writable,position,otherDraft:itemsDraft||guidedDraft||reviewDraft||!!finding,breadcrumb:breadcrumb?.map(c=>c.onClick?{...c,onClick:()=>leave(c.onClick)}:c)}} actions={{itemsSaved,createItemFinding,setItemsDraft,put,save,run,download,applyGuided,saveGuidedAssessment,stageGuidedImplementation,setGuidedDraft,setFinding,setNested,setFeedback,setReviewDraft,reviewSaved:()=>{setRevision(n=>n+1);onSaved?.();setFeedback('Review linked.');},retry:()=>setRevision(n=>n+1),close:()=>leave(()=>onOpenChange(false)),previous:onPrevious?()=>leave(onPrevious):null,next:onNext?()=>leave(onNext):null,saveAndNext:onNext?async()=>{if(!itemsDraft&&!guidedDraft&&!reviewDraft&&!finding&&await save())onNext();}:null}}/>:prestigeSoc?<PrestigeSocAssessment state={{itemControls,guidedItemsDraft:proposedItems,itemWorkDisabled:dirty||!!guidedItemsDraft,contextEditor,isoView,assessmentRollout:rolloutPresentation,pilotSurfaceRef:setAssessmentSurface,pilotPortalContainer:assessmentSurface,manageRecord:onManage?()=>leave(onManage):undefined,focusedImplementationOnly:stagedImplementationForm===JSON.stringify(form),open,record,definition,form,current,ctx,guidedConfiguration,error,busy,dirty,relatedDraft:itemsDraft||reviewDraft||controlDraft||!!finding||!!comment.trim()||linkDraft,otherDraft:itemsDraft||guidedDraft||reviewDraft||controlDraft||!!finding||!!comment.trim(),feedback,writable,position,related,finding,breadcrumb:breadcrumb?.map(c=>c.onClick?{...c,onClick:()=>leave(c.onClick)}:c)}} actions={{itemsSaved,createItemFinding,setItemsDraft,put,save,stageGuidedImplementation,saveGuidedAssessment,setGuidedDraft,run,download,setFinding,setNested,setFeedback,retry:()=>setRevision(n=>n+1),close:()=>leave(()=>onOpenChange(false)),previous:onPrevious?()=>leave(onPrevious):null,next:onNext?()=>leave(onNext):null,saveAndNext:onNext?async()=>{if(!itemsDraft&&!guidedDraft&&!reviewDraft&&!controlDraft&&!finding&&!comment.trim()&&await save())onNext();}:null}}/>:<FrameworkAssessmentWorkspace
    state={{itemControls,guidedItemsDraft:proposedItems,itemWorkDisabled:dirty||!!guidedItemsDraft,contextEditor,isoView,assessmentRollout:rolloutPresentation,pilotSurfaceRef:setAssessmentSurface,pilotPortalContainer:assessmentSurface,manageRecord:onManage?()=>leave(onManage):undefined,focusedImplementationOnly:stagedImplementationForm===JSON.stringify(form),open,record,definition,catalog,form,current,ctx,guidedConfiguration,related,error,busy,dirty,feedback,writable,comment,finding,tab,position,link,breadcrumb:breadcrumb?.map(c=>c.onClick?{...c,onClick:()=>leave(c.onClick)}:c),otherDraft:itemsDraft||guidedDraft||reviewDraft||controlDraft||!!finding||!!comment.trim(),relatedDraft:itemsDraft||reviewDraft||controlDraft||!!finding||!!comment.trim()}}
    actions={{itemsSaved,createItemFinding,setItemsDraft,put,save,stageGuidedImplementation,saveGuidedAssessment,setGuidedDraft,run,download,setComment,setFinding,setTab,setNested,setFeedback,setReviewDraft,setLink,setControlDraft,
      controlSaved:()=>{setRevision(n=>n+1);onSaved?.();},
      retry:()=>setRevision(n=>n+1),close:()=>leave(()=>onOpenChange(false)),
      previous:onPrevious?()=>leave(onPrevious):null,next:onNext?()=>leave(onNext):null,
      saveAndNext:onNext?async()=>{if(!itemsDraft&&!guidedDraft&&!reviewDraft&&!controlDraft&&!finding&&!comment.trim()&&await save())onNext();}:null,
      reviewSaved:()=>{setRevision(n=>n+1);onSaved?.();setFeedback('Review linked.');}}}
  />}{overlays}</>);
  const displayDefinition=record.framework_key==='cmmc'?cmmcRequirementPresentation(definition,ctx?.configuration):definition;
  const statusHelpId='assessment-status-help-'+statusChoiceId;
  const statusChoices=[...CIS_ORDER.filter(value=>Object.hasOwn(statuses,value)),
    ...Object.keys(statuses).filter(value=>!CIS_ORDER.includes(value))];
  const nativeAssessmentContent=<>
    {<div className="space-y-4"><FrameworkContext framework={record.framework_key} definition={definition} catalog={catalog} related={related} loading={!ctx}/><FrameworkReviewSetup record={current} definition={definition} catalog={catalog} reviews={ctx?.options.reviews||[]} users={ctx?.users||[]} clientId={clientId} writable={writable&&!busy&&!!ctx} onDraftChange={setReviewDraft} onOpen={r=>setNested({kind:'reviews',record:r})} onSaved={()=>{setRevision(n=>n+1);onSaved?.();setFeedback('Review linked.');}}/><fieldset disabled={!writable||busy||!ctx} className="space-y-4">{genericPresentation?<div className="assessment-implementation">
      <Step title="Implementation status">
        <fieldset disabled={!writable||busy||!ctx}><legend className="sr-only">Implementation status</legend>
          <div className="brawndo-status-options gn-status-group" role="radiogroup" aria-label="Implementation status" aria-describedby={statusHelpId}>
            {statusChoices.map(value=><label key={value} className={`cis-tone-${implementationTone(value,record.framework_key)} ${form.status===value?'is-selected':''} gn-status-option`}>
              <input type="radio" name={'framework-assessment-status-'+statusChoiceId} value={value} checked={form.status===value} onChange={()=>put('status',value)}/>
              <span className="cis-dot" aria-hidden="true"/><span>{statuses[value]}</span>
            </label>)}
          </div>
          <p id={statusHelpId} className="text-xs text-ink-secondary">{STATUS_HELP[form.status]?.replaceAll('Assessment notes','Current implementation')}</p>
        </fieldset>
      </Step>
      <Step title="Current implementation">
        <label className="block"><span className="sr-only">Current implementation</span><Textarea aria-label="Current implementation" className="gn-field" rows={6} placeholder="Current practice, scope, observations, evidence reviewed and the reason for this assessment." maxLength={20000} value={form.implementation||''} onChange={e=>put('implementation',e.target.value)}/></label>
      </Step>
    </div>:<><label className="block text-sm font-medium">Assessment<select aria-label="Assessment Status" aria-describedby="assessment-status-help" className={SELECT} value={form.status} onChange={e=>put('status',e.target.value)}>{Object.entries(statuses).map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></label><p id="assessment-status-help" className="text-xs text-ink-secondary">{STATUS_HELP[form.status]}</p><label className="block text-sm">Assessment notes<Textarea aria-label="Assessment notes" placeholder="Current practice, scope, observations, evidence reviewed and the reason for this assessment." maxLength={20000} value={form.implementation||''} onChange={e=>put('implementation',e.target.value)}/></label></>}{definition.specification==='addressable'&&<div className="space-y-3"><p className="text-sm">{definition.decision_guidance}</p><label className="block text-sm">Addressability decision<select aria-label="Addressability decision" className={SELECT} value={form.addressable_decision||''} onChange={e=>put('addressable_decision',e.target.value)}><option value="">Not yet determined</option><option value="as_written">Implement as written</option><option value="equivalent_alternative">Equivalent alternative</option><option value="not_reasonable_appropriate">Neither is reasonable and appropriate</option></select></label><label className="block text-sm">Decision rationale<Textarea aria-label="Decision rationale" maxLength={4000} value={form.addressable_rationale||''} onChange={e=>put('addressable_rationale',e.target.value)}/></label></div>}{definition.specification==='annex_control'&&<section className="space-y-3 border border-line rounded p-3"><h3 className="text-sm font-semibold">Statement of Applicability</h3><p className="text-xs text-ink-secondary">Selection follows risk treatment. Document why the control is included or excluded; link Risks, Policies, Reviews and Evidence through Linked records below. Exclusion requires Not Applicable status.</p><label className="block text-sm">SoA applicability<select aria-label="SoA applicability" className={SELECT} value={form.soa_applicability||''} onChange={e=>put('soa_applicability',e.target.value)}><option value="">Not yet determined</option><option value="included">Included</option><option value="excluded">Excluded</option></select></label><label className="block text-sm">SoA justification<Textarea aria-label="SoA justification" maxLength={4000} value={form.soa_justification||''} onChange={e=>put('soa_justification',e.target.value)}/></label></section>}<div className="space-y-3 mt-3"><label className="block text-sm">Technology / Products<Input aria-label="Technology / Products" value={form.technology||''} onChange={e=>put('technology',e.target.value)}/></label><div className="grid sm:grid-cols-2 gap-3"><div className="text-sm">Assessment Owner<AssigneeSelect clientId={clientId} label="Assessment Owner" value={form.owner_id} onChange={v=>put('owner_id',v)} users={ctx?.users||[]} disabled={!writable||busy||!ctx}/></div><label className="block text-sm">Process Owner (Contact)<select aria-label="Process Owner (Contact)" className={SELECT} value={form.process_owner_id||''} onChange={e=>put('process_owner_id',e.target.value||null)}><option value="">Unassigned</option>{ctx?.contacts.map(c=><option key={c.contact_id} value={c.contact_id}>{c.name}</option>)}</select><span className="block mt-1.5 text-xs text-ink-secondary">Business responsibility only; does not grant platform access.</span></label></div>{form.notes&&<><label className="block text-sm">Additional notes (previously recorded)<Textarea aria-label="Additional notes (previously recorded)" value={form.notes} onChange={e=>put('notes',e.target.value)}/></label><span className="text-xs text-ink-secondary">Retained separately; use Assessment notes for the primary narrative.</span></>}</div>{form.status==='not_applicable'&&definition.specification!=='annex_control'&&<label className="block text-sm">N/A Rationale (required)<Textarea aria-label="N/A Rationale" value={form.na_rationale||''} onChange={e=>put('na_rationale',e.target.value)}/></label>}<p className="text-xs text-ink-muted">Evidence and completed remediation do not change the assessment automatically. Review the result, then save your current conclusion.</p></fieldset>{['in_progress','needs_attention'].includes(form.status)&&<div className="border-t border-line pt-3 text-sm"><p>Record the gap and supporting evidence. A Finding identifies the deficiency; its Action Item manages remediation.</p><div className="flex gap-2 mt-2"><Button variant="outline" onClick={()=>setTab('Evidence')}>Link evidence</Button><Button variant="outline" onClick={()=>setTab('Related')}>Findings &amp; actions</Button></div></div>}</div>}
    {isCsf&&<fieldset disabled={!writable||busy||!ctx} className="space-y-4"><CsfProfile value={form.csf_profile} current={form} onChange={v=>put('csf_profile',v)}/></fieldset>}
    {['cis-ig1','iso-27001'].includes(record.framework_key)&&<OrganizationalControls clientId={clientId} assessmentId={aid} onDraftChange={setControlDraft} onSaved={()=>{setRevision(n=>n+1);onSaved?.();}}/>}
    <section className="border-t border-line mt-4 pt-4 space-y-2"><h3 className="text-sm font-semibold">Linked records &amp; activity</h3><div className="flex flex-wrap gap-2">{Object.entries(IDS).filter(([kind])=>['reviews','evidence','findings','tasks','risks'].includes(kind)||related[kind]?.length).map(([kind])=><Button key={kind} variant="outline" size="sm" onClick={()=>setTab(kind==='evidence'?'Evidence':'Related')}>{kind==='tasks'?'Action Items':kind.charAt(0).toUpperCase()+kind.slice(1)} {related[kind]?.length||0}</Button>)}<Button variant="outline" size="sm" onClick={()=>setTab('History')}>Activity / History</Button>{tab&&<Button variant="ghost" size="sm" onClick={()=>setTab('')}>Close linked details</Button>}</div></section>
    {tab==='Related'&&<div className="space-y-5"><FrameworkMappings framework={record.framework_key} definition={definition.id}/>{!!catalog.policy_mappings.filter(m=>m.safeguards.includes(definition.id)).length&&<section className="space-y-2"><h3 className="text-sm font-semibold">Supporting policy areas</h3><p className="text-xs text-ink-secondary">These are support mappings, not prescribed document titles or automatic proof of effectiveness.</p>{catalog.policy_mappings.filter(m=>m.safeguards.includes(definition.id)).map((m,i)=>{const policies=(related.policies||[]).filter(p=>p.baseline_key===m.policy_key);return <div className="border border-line rounded p-3 text-sm" key={m.policy_key+i}><p className="font-medium">{policyCatalog.policies.find(p=>p.key===m.policy_key)?.name||m.policy_key}</p><p className="text-xs text-ink-secondary">{m.basis||m.classification} · {m.rationale||m.reason}</p>{ctx&&(policies.length?policies.map(p=><button key={p.policy_id} className="block text-link text-left mt-1" onClick={()=>setNested({kind:'policies',record:p})}>{p.title} · {p.presence?.replaceAll('_',' ')||'Presence not verified'} · {p.status?.replaceAll('_',' ')}</button>):<p className="mt-1 text-ink-secondary">No policy mapped to this area. Link an existing Policy below or manage the gap in Policies.</p>)}</div>;})}</section>}<RemediationTickets records={{...related,framework_assessments:[current]}} clientId={clientId} users={ctx?.users} onOpen={setNested} disabled={busy}/>{Object.entries(related).filter(([k,v])=>IDS[k]&&!['evidence','findings','tasks'].includes(k)&&v.length).map(([kind,rows])=><section key={kind}><h3 className="text-sm font-semibold capitalize mb-2">{kind==='tasks'?'Action Items':kind}</h3><ul className="space-y-2">{rows.map(r=><li key={r[IDS[kind]]} className="border border-line rounded p-3 text-sm"><button className="text-link text-left" onClick={()=>setNested({kind,record:r})}>{r.title||r.name}</button><p className="text-xs text-ink-muted">{kind==='tasks'?actionStatus(r.status):r.status==='remediated'?'Pending Validation':r.status?.replaceAll('_',' ')}{kind==='reviews'&&` · Next: ${r.due_date?.slice(0,10)||'Needs scheduling'} · Last: ${r.occurrences?.at(-1)?.completed_at?.slice(0,10)||'No completed occurrence'} · Outcome: ${r.occurrences?.at(-1)?.outcome||'—'}`}</p></li>)}</ul></section>)}{ctx&&!Object.values(related).some(v=>v.length)&&<p className="text-sm text-ink-muted">No related records yet.</p>}
      {writable&&<fieldset disabled={busy} className="space-y-3 border-t border-line pt-4">{!genericPresentation&&<><Button variant="outline" onClick={()=>setFinding({title:`${definition.id} · ${definition.title} — implementation gap`,description:current.implementation||'',remediation_title:`Address ${definition.id} implementation gap`,severity:'medium',request_id:recordUuid()})}>Raise Finding</Button>{finding&&<div className="space-y-3 border border-line rounded p-4"><p className="text-xs text-ink-muted">Source: {program} · {definition.id}. Creates one normal Finding and one remediation Action Item.</p>{[['title','Finding title'],['remediation_title','Remediation Action title'],['description','Finding description']].map(([k,label])=><label className="block text-sm" key={k}>{label}<Input aria-label={label} value={finding[k]} onChange={e=>setFinding({...finding,[k]:e.target.value})}/></label>)}<label className="block text-sm">Severity<select aria-label="Finding severity" className={SELECT} value={finding.severity} onChange={e=>setFinding({...finding,severity:e.target.value})}>{['low','medium','high','critical'].map(s=><option key={s}>{s}</option>)}</select></label><TicketAssignment clientId={clientId} users={ctx?.users} {...{finding,setFinding}} defaultOwner={current.owner_id} disabled={busy}/><Button disabled={!!finding.item_id&&(dirty||!!guidedItemsDraft)} onClick={()=>{if(finding.item_id&&(nativeSnapshot.current.assessmentDirty||guidedItemsDraft))return;return run(async()=>{await api.post(`/framework_assessments/${aid}/findings`,finding);setFinding(null);setFeedback('Ticket saved. Open it below to continue; assessment changes remain separate.');});}}>Create Finding & Action</Button><Button variant="ghost" onClick={()=>setFinding(null)}>Cancel</Button></div>}
</>}
        <h3 className="text-sm font-semibold">Link an existing record</h3><label className="block text-sm">Record type<select aria-label="Related record type" className={SELECT} value={link.kind} onChange={e=>setLink({kind:e.target.value,id:''})}>{Object.keys(IDS).filter(k=>k!=='evidence').map(k=><option key={k} value={k}>{k==='tasks'?'Action Items':k}</option>)}</select></label><label className="block text-sm">Record<select aria-label="Related record" className={SELECT} value={link.id} onChange={e=>setLink({...link,id:e.target.value})}><option value="">Select record</option>{ctx?.options[link.kind]?.map(r=><option key={r[IDS[link.kind]]} value={r[IDS[link.kind]]}>{r.title||r.name}</option>)}</select></label><Button variant="outline" disabled={!link.id||busy} onClick={()=>run(()=>api.post(`/framework_assessments/${aid}/links`,link))}>Link record</Button></fieldset>}
    </div>}
    {tab==='Evidence'&&<div className="space-y-4"><p className="text-sm text-ink-muted">One Evidence Library item, linked to this {item.toLowerCase()}. Evidence from mapped Review occurrences is also shown. Unlink removes this assessment’s current relationship only; the Library artifact and original provenance are retained.</p>{writable&&<fieldset disabled={busy} className="space-y-3"><label className="block text-sm">Upload Evidence<input type="file" aria-label="Upload Evidence" onChange={e=>{const f=e.target.files?.[0];if(f)run(async()=>api.post('/evidence',{client_id:clientId,linked_type:'framework_assessment',linked_id:aid,filename:f.name,mime_type:f.type||'application/octet-stream',content_base64:await readFile(f)}));}}/></label><div className="text-sm"><EvidenceCatalogPicker clientId={clientId} linkedIds={related.evidence?.map(e=>e.evidence_id)} onLink={id=>run(()=>api.post(`/framework_assessments/${aid}/links`,{kind:'evidence',id}))}/></div></fieldset>}<ul className="space-y-2">{related.evidence?.map(e=><li className="text-sm border border-line rounded p-3" key={e.evidence_id}><button className="text-link" onClick={()=>download(e)}>{e.filename}</button><p className="text-xs text-ink-muted">{e.created_at?.slice(0,10)} · {e.linked_type}</p>{writable&&<Button variant="ghost" disabled={busy} aria-label={`Unlink ${e.filename} from this assessment`} onClick={()=>run(()=>api.delete(`/framework_assessments/${aid}/links`,{data:{kind:'evidence',id:e.evidence_id}}))}>Unlink from assessment</Button>}</li>)}</ul>{ctx&&!related.evidence?.length&&<p className="text-sm">No linked Evidence.</p>}</div>}
    {<section className="space-y-4 border-t border-line mt-4 pt-4"><h3 className="text-sm font-semibold">Notes</h3><ul className="space-y-3">{ctx?.comments.map(c=><li key={c.comment_id} className="border-b border-line pb-3 text-sm"><p>{c.body}</p><p className="text-xs text-ink-muted">{c.author_name||c.user_name} · {c.created_at}</p></li>)}</ul>{writable&&<><Textarea aria-label={`${item} comment`} value={comment} onChange={e=>setComment(e.target.value)}/><Button disabled={busy||!comment.trim()} onClick={()=>run(async()=>{await api.post('/comments',{client_id:clientId,entity_type:'framework_assessments',entity_id:aid,body:comment});setComment('');})}>Add comment</Button></>}</section>}
    {tab==='History'&&<div className="space-y-5"><h3 className="text-sm font-semibold">Assessment history · {current.assessment_history?.length||0}</h3><ul className="space-y-3">{current.assessment_history?.slice().reverse().map((h,i)=><li className="text-sm border-b border-line pb-3" key={i}><p>{statuses[h.status]} · {h.at} · {who(h.by)}</p><p className="text-xs text-ink-muted whitespace-pre-wrap">{h.implementation}{h.notes&&`\nAdditional notes: ${h.notes}`}{h.addressable_decision&&` · ${h.addressable_decision}: ${h.addressable_rationale}`}{h.soa_applicability&&` · SoA ${h.soa_applicability}: ${h.soa_justification}`}{h.na_rationale&&` · N/A: ${h.na_rationale}`}</p>{h.csf_profile&&<p className="text-xs text-ink-secondary whitespace-pre-wrap">Target: {h.csf_profile.target_selected?'Selected':'Not selected'} · {h.csf_profile.priority||'Not prioritized'} · {CSF_GAPS[h.csf_profile.gap_state]}{`\n${h.csf_profile.target_outcome}\n${h.csf_profile.gap_notes}`}</p>}{h.management_controls?.map(c=><p key={c.control_id} className="text-xs text-ink-secondary mt-2 whitespace-pre-wrap">{c.name} · {c.design} / {c.operating} · {c.period_start||'No period'} — {c.period_end} · {c.collected_instances??'—'} / {c.expected_instances??'—'} instances{`\n${c.description}\n${c.testing_notes}`}</p>)}</li>)}</ul>{!current.assessment_history?.length&&<p className="text-sm text-ink-secondary">No saved assessments yet. Your first saved assessment will appear here.</p>}<h3 className="text-sm font-semibold">Activity</h3><ul className="space-y-2">{ctx?.activity.map((a,i)=><li key={a.audit_id||i} className="text-sm">{a.action}<p className="text-xs text-ink-muted">{a.at} · {a.user_name||a.user_email}</p></li>)}</ul></div>}
  </>;
  if(genericPresentation)return owned(<><AssessmentRolloutFrame key={aid}
    state={{itemControls,open,record,definition:displayDefinition,current,form,ctx:liveGuideContext,busy,error,dirty,writable,feedback,
      position,breadcrumb:breadcrumb?.map(crumb=>crumb.onClick?{...crumb,onClick:()=>leave(crumb.onClick)}:crumb),
      otherDraft:itemsDraft||guidedDraft||reviewDraft||controlDraft||!!finding||!!comment.trim()||linkDraft,
      finding,interviewActive:genericInterviewOpen,pilotSurfaceRef:setAssessmentSurface,pilotPortalContainer:assessmentSurface,
      manageRecord:onManage?()=>leave(onManage):undefined,discardDisabled:!dirty||!canDiscardGenericAssessment()}}
    actions={{put,save,discardAssessment:discardGenericAssessment,saveAndNext:onNext?saveGenericAndNext:null,
      retry:()=>setRevision(value=>value+1),close:()=>leave(()=>onOpenChange(false)),
      previous:onPrevious?()=>leave(onPrevious):null,next:onNext?()=>leave(onNext):null}}
    frameworkLabel={program} testId="framework-drawer" interviewHistoryAvailable={genericGuideMounted&&!!user?.user_id}
    status={<><span aria-label="Saved conclusion">{statuses[current.status]?<CisStatusPill status={current.status} framework={record.framework_key}/>:'Status not recorded'}</span>
      <span className="text-xs text-ink-secondary">Owner: {current.owner_id?who(current.owner_id):'Unassigned'} · Last assessed: {current.last_assessed?.slice(0,10)||'Not assessed'}</span></>}
    requirement={contextEditor}
    interview={genericGuideMounted?({historyOpen,onHistoryOpenChange,onHistoryCloseAutoFocus,pilotPortalContainer})=> <GenericGuidedAssessor key={draftIdentity} inline record={record} form={form}
      assessmentDirty={dirty} disabled={!writable||busy||!liveGuideContext}
      onDraftChange={genericDraftChanged} onInlineOpenChange={genericOpenChanged}
      historyScope={guidedScope} interviewHistoryOpen={historyOpen} onInterviewHistoryOpenChange={onHistoryOpenChange}
      onInterviewHistoryCloseAutoFocus={onHistoryCloseAutoFocus} pilotPortalContainer={pilotPortalContainer}
      onUpdateImplementation={stageGuidedImplementation}/>:null}
    itemsToAddress={<AssessmentItems standard={genericPresentation} portalContainer={assessmentSurface} controls={itemControls} proposedItems={proposedItems} workDisabled={dirty||!!guidedItemsDraft}
      record={current} ctx={liveGuideContext} disabled={!writable||busy||!liveGuideContext}
      onDraftChange={setItemsDraft} onSaved={itemsSaved} onCreateFinding={createItemFinding}/>}
    findings={<BrawndoCisFindings workDisabled={dirty||!!guidedItemsDraft}
      {...{record,definition,current,related,writable,busy,finding,setFinding,run,setNested,setFeedback}}
      ctx={liveGuideContext}/>}
    sectionCounts={{items:liveGuideContext?(current.items_to_address||[]).filter(item=>item.state==='open').length:null,
      findings:liveGuideContext?(related.findings||[]).filter(item=>item.client_id===clientId).length:null}}>
    <div hidden={genericInterviewOpen} inert={genericInterviewOpen?'':undefined}>{nativeAssessmentContent}</div>
  </AssessmentRolloutFrame>{overlays}</>);
  return owned(<><Sheet open={open} onOpenChange={v=>{if(!v)leave(()=>onOpenChange(false));}}><SheetContent ref={setAssessmentSurface} className="w-full sm:max-w-3xl overflow-y-auto bg-surface-card" data-testid="framework-drawer" data-assessment-shell onEscapeKeyDown={event=>{const guide=assessmentSurface?.querySelector('.omni-workspace-window');if(guide){event.preventDefault();event.stopPropagation();guide.dispatchEvent(new Event(OMNI_ESCAPE_EVENT));}}}><SheetHeader><SheetTitle>{program} {displayDefinition.id} · {displayDefinition.title}</SheetTitle><SheetDescription>Assess the scoped implementation, link evidence and follow remediation.</SheetDescription></SheetHeader>
    <div className="sticky top-0 z-10 bg-surface-card py-2 flex flex-wrap items-center justify-between gap-2 mt-3"><div className="text-xs text-ink-secondary"><p>{position||'Assessment record'}</p><p className="font-medium text-ink-primary mt-1" aria-label="Saved conclusion">Saved assessment: {statuses[current.status]||'Status not recorded'}</p><p>Owner: {current.owner_id?who(current.owner_id):'Unassigned'} · Last assessed: {current.last_assessed?.slice(0,10)||'Not assessed'}</p></div><div className="flex gap-1"><Button variant="ghost" size="sm" disabled={!onPrevious||busy} onClick={()=>leave(onPrevious)}>Previous</Button><Button variant="ghost" size="sm" disabled={!onNext||busy} onClick={()=>leave(onNext)}>Next</Button></div></div>
    {!ctx&&!error&&<p role="status" className="text-xs text-ink-secondary mb-3">Loading linked work…</p>}
    {error&&<p role="alert" className="text-sm text-semantic-critical mb-3">{error}</p>}
    {genericGuidedFramework(record.framework_key)&&ctx&&<GenericGuidedAssessor key={draftIdentity} record={record} form={form} assessmentDirty={dirty} disabled={!writable||busy||!ctx} onDraftChange={setGuidedDraft} onUpdateImplementation={stageGuidedImplementation}/>}
    {contextEditor}
    {genericGuidedFramework(record.framework_key)&&ctx&&<AssessmentItems standard={genericPresentation} portalContainer={assessmentSurface} controls={itemControls} proposedItems={proposedItems} workDisabled={dirty||!!guidedItemsDraft} record={current} ctx={ctx} disabled={!writable||busy||!ctx} onDraftChange={setItemsDraft} onSaved={itemsSaved} onCreateFinding={createItemFinding}/>}
    {nativeAssessmentContent}
    <div className="sticky bottom-0 bg-surface-card border-t border-line py-3 mt-4 flex flex-wrap items-center justify-between gap-2"><span role="status" className="text-xs text-ink-secondary">{dirty?'Unsaved assessment changes':feedback||('Last assessed: '+(current.last_assessed?.slice(0,10)||'Not assessed'))}</span>{writable&&<Button disabled={busy||!ctx} onClick={save}>{busy?'Saving…':'Save assessment'}</Button>}</div>
  </SheetContent></Sheet>{overlays}</>);
}

// Security changes retire the whole private draft tree. An unresolved ID is
// only a read target; it cannot seed a different record with this owner's draft.
function FrameworkDraftOwner(props){
  const [accepted,setAccepted]=useState({record:props.record,generation:0});
  const [keepFor,setKeepFor]=useState(null);
  const requestKey=JSON.stringify([props.record.framework_assessment_id,props.record.definition_id,props.record.framework_version]);
  const requested=keepFor===requestKey?accepted.record:props.record;
  useEffect(()=>{if(keepFor&&keepFor!==requestKey)setKeepFor(null);},[keepFor,requestKey]);
  const currentRequest=useRef(requested);currentRequest.current=requested;
  return <FrameworkDrawerContent {...props} key={accepted.generation} record={accepted.record} requestedRecord={requested}
    onRecordAccepted={record=>{
      const current=currentRequest.current;
      if(current.framework_assessment_id!==record.framework_assessment_id||current.definition_id!==record.definition_id||current.framework_version!==record.framework_version)return;
      setKeepFor(null);setAccepted(previous=>({record,generation:previous.generation+1}));
    }}
    onRecordRetained={()=>setKeepFor(requestKey)}
    onLeaveDiscard={record=>setAccepted(previous=>({record,generation:previous.generation+1}))}/>;
}
export default function FrameworkDrawer(props){
  const {record}=props,{user,workspaceMode}=useAuth();
  const key=JSON.stringify([workspaceMode,user?.user_id,user?.status??'active',!!user?.password_change_required,
    props.clientId,record.client_id,record.framework_key]);
  return <FrameworkDraftOwner key={key} {...props}/>;
}
