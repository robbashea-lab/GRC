import {useEffect,useId,useRef,useState} from 'react';
import {useAuth} from '@/context/AuthContext';
import api,{formatError} from '@/lib/api';
import {guidedCatalog,catalogForPilot,versionForSafeguard,catalogForVersion,pilotEnabled,prioritizeGuidedRows,visibleQuestions,generateResult,validateAnswers} from '@/lib/guidedAssessment';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './ui/dialog';
import {Button} from './ui/button';
import {Textarea} from './ui/textarea';
import OmniCharacter from './OmniCharacter';
import OmniDock from './OmniDock';
import OmniWindow from './OmniWindow';

import RefinedOmniInterview from './RefinedOmniInterview';

import {omniGroups,refinedSummary,recordedOmniReasons,multipleOmniSources} from '@/lib/refinedOmni';

import {brawndoWorkspacePilot} from '@/lib/brawndoWorkspacePilot';
import {focusedOmniEnabled,focusedRecommendations,nextFocusedQuestion,correctFocusedAnswer,focusedNarrative,focusedResult} from '@/lib/focusedOmni';
import {describeGuidedContext,prioritizeGuidedLifecycle,recordedDate} from '@/lib/guidedLifecycle';
import changeQuestions from '@catalogs/guidedCisChanges.json';
import {personLabel} from '@/lib/people';
import './GuidedAssessor.css';

import './RefinedOmni.css';


const STATUSES={addressed:'Implemented',in_progress:'Partially Implemented',needs_attention:'Not Implemented',not_assessed:'Not Assessed'};
const EMPTY_ROWS=[];
function readPreference(key){try{return JSON.parse(localStorage.getItem(key)||'{}');}catch{return {};}}
export default function GuidedAssessor(props){
  const {user}=useAuth();
  if(props.record?.client_id&&props.record.client_id!==props.clientId||!pilotEnabled(props.clientId,props.framework,props.configuration,props.record?.definition_id))return null;
  return <Pilot key={user?.user_id+':'+props.clientId+':'+props.record?.framework_assessment_id+(focusedOmniEnabled(props.clientId,user,props.framework,props.configuration,props.record?.definition_id)?':'+(props.invitationContext||'program'):'')} {...props}/>;
}
function Pilot({clientId,framework,configuration,invitationContext,inventoryContext,record,rows=EMPTY_ROWS,draftSummaries={},onSelect,onViewAll,form,onApply,onDraftChange,onUpdateImplementation,disabled=false,current=record,related={},contextComplete=false,assessmentDirty=false,onOpenNative,people=EMPTY_ROWS}){
  const {user}=useAuth(),key='guided-pilot-ui:'+user?.user_id+':'+clientId,initial=readPreference(key);
  const workspacePilot=brawndoWorkspacePilot(clientId,user),GuideContent=workspacePilot?OmniWindow:DialogContent;
  const focused=focusedOmniEnabled(clientId,user,framework,configuration,record?.definition_id);
  const botName=focused?'Omnibot':'Omni',invitationKey=key+':'+framework+':focused-invitations';

  const [invitationsDisabled]=useState(()=>readPreference(invitationKey).invitationsDisabled??!!initial.invitationsDisabled);

  const [quiet]=useState(()=>{try{return (sessionStorage.getItem(invitationKey+':quiet')??sessionStorage.getItem(key+':quiet'))==='1';}catch{return false;}});

  const [incremental,setIncremental]=useState(null),[reconciled,setReconciled]=useState(''),[reconciliationConfirmed,setReconciliationConfirmed]=useState(false),[saveNotice,setSaveNotice]=useState('');
  const [reuseAnswers,setReuseAnswers]=useState(false);
  const [stagedImplementation,setStagedImplementation]=useState(null),[changeTopic,setChangeTopic]=useState(''),[compareTarget,setCompareTarget]=useState(null);
  const focusedStarted=useRef(false);
  const nativeUpdate=useRef(onUpdateImplementation);nativeUpdate.current=onUpdateImplementation;
  const nativeApplication=useRef({onApply,form,assessmentDirty,current});nativeApplication.current={onApply,form,assessmentDirty,current};
  const [mode,setMode]=useState(record&&new URLSearchParams(window.location.search).get('guided')==='pilot'?'expanded':focused?'collapsed':initial.mode||'collapsed'),[greeting,setGreeting]=useState(false),[draft,setDraft]=useState(null),[answers,setAnswers]=useState({}),[step,setStep]=useState(0),[result,setResult]=useState(null),[narrative,setNarrative]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[restart,setRestart]=useState(false),[replace,setReplace]=useState(false);
  const launcher=useRef(null),heading=useRef(null),saved=useRef('{}');
  const identity=clientId+':'+record?.framework_assessment_id+':'+user?.user_id,activeIdentity=useRef(identity);activeIdentity.current=identity;
  useEffect(()=>()=>{activeIdentity.current=null;},[]);
  const [applied,setApplied]=useState(false),[contextPrompt,setContextPrompt]=useState(false);
  const [view,setView]=useState(workspacePilot?'position':'interview'),[loaded,setLoaded]=useState(!record),[changeAnswer,setChangeAnswer]=useState(''),[history,setHistory]=useState(null),[historyError,setHistoryError]=useState(''),[historyBusy,setHistoryBusy]=useState(false);
  const currentVersion=record?versionForSafeguard(record.definition_id,workspacePilot):catalogForPilot(workspacePilot).version;
  const version=draft?.version||currentVersion,updated=version!==currentVersion;

  const refined=focused&&!updated;

  const [confirmClose,setConfirmClose]=useState(false),[summaryEdited,setSummaryEdited]=useState(false),[summaryBasis,setSummaryBasis]=useState('');

  const dirty=JSON.stringify(answers)!==saved.current||!!result&&narrative!==(draft?.narrative||result.narrative)||refined&&summaryEdited&&narrative!==(draft?.narrative||'');
  const id=record?.definition_id,questions=id?visibleQuestions(id,answers,version):[],question=questions[Math.min(step,Math.max(0,questions.length-1))];
  const base=record?'/framework_assessments/'+record.framework_assessment_id+'/guided-assessment':null;
  const stateId=useId(),panelId=useId();
  const currentSignal=question&&answers[question.id]!==undefined&&(!workspacePilot||!result&&view==='interview')?(focused?focusedResult(id,answers,version):generateResult(id,answers,new Date(),version)).signals.filter(s=>s.questionId===question.id):[];
  const characterState=busy?'thinking':applied?'applied':result?result.gaps.length?'gap':result.missingRecorded||result.unknowns.length?'verification':'complete':currentSignal.some(s=>s.kind==='gap')?'gap':currentSignal.length?'verification':mode==='expanded'?'helpful':mode==='minimized'?'minimized':'idle';
  const stateText={idle:botName+' is available',helpful:'Guided review active',thinking:'Preparing the next step',gap:'Gap identified',verification:'Needs verification',complete:workspacePilot?'Interview complete':'Assessment complete',applied:'Recommendation applied',minimized:'Review minimized'}[characterState];
  const promptKey=key+':invite:'+id+':'+(current?.last_saved||current?.last_assessed||'initial')+':'+configuration?.implementation_group;
  const context=workspacePilot&&record?describeGuidedContext({record:current,draft,draftLoaded:loaded&&!!draft,workLoaded:contextComplete,historyComplete:Array.isArray(current?.assessment_history),expectedIdentity:{client_id:clientId,assessment_id:record.framework_assessment_id,user_id:user?.user_id},supportedVersions:draft&&catalogForVersion(draft.version)?[draft.version]:[],readOnly:disabled}):null;
  const overview=workspacePilot&&!record?prioritizeGuidedLifecycle(rows,{drafts:draftSummaries,contextComplete}):null;
  const currentRecommendation=context?.applicationState==='current'&&draft?.base_scope_fingerprint===draft?.current_scope_fingerprint;
  const needsComparison=!!draft?.revision&&context?.lineageStale!==false&&!currentRecommendation;
  const stagedNotice=stagedImplementation!==null?(current?.implementation===stagedImplementation&&form?.implementation===stagedImplementation?(assessmentDirty?'Interview answers and Current implementation are saved. Other native assessment changes remain unsaved; use Save assessment to persist them.':'Interview answers and Current implementation are saved. Implementation status and verification remain as recorded.'):form?.implementation===stagedImplementation?'Answer saved to the interview. Current implementation is an unsaved native draft. Use Save assessment to persist it; implementation and verification statuses are unchanged.':'Interview answers are saved. The staged narrative is no longer the native draft; compare the current implementation before updating it.') : '';
  useEffect(()=>{
    if(!focused||!record||!draft||!loaded||focusedStarted.current)return;
    focusedStarted.current=true;
    const supported=draft.completed&&draft.result?.status==='addressed'&&focusedResult(id,draft.answers,draft.version).status==='addressed';
    if(current?.status==='addressed'&&(!draft.revision||supported))setView('changes');
    else if(supported)setView('result');
    else{setResult(null);setStep(nextFocusedQuestion(id,draft.answers,draft.version));setView('interview');}
  },[focused,record,draft,loaded,current?.status,id]);
  useEffect(()=>{if(!applied)return;const timer=setTimeout(()=>setApplied(false),1200);return()=>clearTimeout(timer);},[applied]);
  useEffect(()=>{onDraftChange?.(dirty||!!incremental);return()=>onDraftChange?.(false);},[dirty,incremental,onDraftChange]);
  useEffect(()=>{
    if(focused){setContextPrompt(!invitationsDisabled&&!quiet);return;}
    if(workspacePilot){try{if(!initial.invitationsDisabled&&!sessionStorage.getItem(key+':quiet')&&!sessionStorage.getItem(promptKey))setContextPrompt(true);}catch{/* Invitations are optional. */}return;}
    if(record){try{if(!sessionStorage.getItem(key+':'+id+':prompt'))setContextPrompt(true);}catch{setContextPrompt(true);}return;}
    const sessionKey=key+':greeted';
    try{if(!sessionStorage.getItem(sessionKey)&&!initial.dismissGreeting&&mode!=='dismissed'){setGreeting(true);sessionStorage.setItem(sessionKey,'1');}}catch{/* Greeting preferences do not store assessment answers. */}
  },[]);// eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{
    const controller=new AbortController();

    if(workspacePilot){focusedStarted.current=false;setDraft(null);setResult(null);setAnswers({});saved.current='{}';setStep(0);setNarrative('');setError('');setBusy(false);setLoaded(!base);setSummaryEdited(false);setSummaryBasis('');setView('position');setHistory(null);setHistoryError('');setHistoryBusy(false);}

    if(base){api.get(base,{signal:controller.signal}).then(({data})=>{
      if(controller.signal.aborted)return;
      if(!data||!catalogForVersion(data.version)||!Number.isInteger(data.revision)||!Number.isInteger(data.step)||typeof data.completed!=='boolean')throw new Error('Saved interview could not be read. Close and reopen the assessment to retry; the assessment itself is unchanged.');
      validateAnswers(id,data.answers,data.version);
      setDraft(data);setAnswers(data.answers);saved.current=JSON.stringify(data.answers);setStep(data.step);

      if(data.completed){const output=workspacePilot?(data.result||{status:null,narrative:data.narrative||'',basis:[],gaps:[],unknowns:[],nextSteps:[],evidence:[],answers:[],missingRecorded:true}):generateResult(id,data.answers,data.generated_at?new Date(data.generated_at):new Date(),data.version);setResult(output);setNarrative(data.narrative||output.narrative);if(focused){setSummaryEdited(true);setSummaryBasis(JSON.stringify(data.answers));}}

      if(refined&&!data.completed&&data.narrative){setNarrative(data.narrative);setSummaryEdited(true);setSummaryBasis('');}
      setLoaded(true);
    }).catch(e=>{if(!controller.signal.aborted){setError(formatError(e));setLoaded(true);}});}
    return()=>controller.abort();
  },[base,id,clientId,user?.user_id]);// eslint-disable-line react-hooks/exhaustive-deps
  const changeMode=value=>{setMode(value);setGreeting(false);setContextPrompt(false);try{if(!focused)sessionStorage.setItem(workspacePilot?promptKey:key+':'+id+':prompt','1');localStorage.setItem(key,JSON.stringify({...readPreference(key),mode:value==='expanded'?'collapsed':value,...(!workspacePilot?{dismissGreeting:true}:{})}));}catch{/* Cosmetic preferences are optional. */}};

  const savedAnswers=loaded&&draft?.revision>0&&Object.keys(draft.answers||{}).length>0;

  const invitation=!focused?'':record?(!loaded||!draft?'I can help you review Safeguard '+id+'. Open my guide to check your saved assessment and next steps.':savedAnswers?(needsComparison?'Welcome back. Let’s compare your saved answers with the current assessment, then continue with the relevant changes.':draft.completed&&['not_assessed','needs_attention','in_progress'].includes(draft.result?.status)?'Your saved interview identifies unresolved work. The native assessment still records '+(STATUSES[current?.status]||'Not recorded')+'. Review the proposed reassessment before changing it.':currentRecommendation&&current?.status==='addressed'&&draft.completed?'Your implementation is saved. I can help you maintain Safeguard '+id+', update a recorded fact, or review outstanding verification.':draft.completed?'Your interview proposal is saved. Review it against the native assessment before applying and saving any changes.':'Welcome back. I can help you continue your saved interview for Safeguard '+id+' and work through the remaining requirements.'):current?.status==='addressed'?'Safeguard '+id+' has a saved Implemented position. I can help you review changes or outstanding verification; no new interview is required to keep the recorded assessment.':'Let’s work through Safeguard '+id+' together. I’ll ask about your current practices and help you prepare an implementation summary for your review.'):invitationContext==='control-1'?'I can help you work through Control 1’s safeguards. Open my guide to review your next steps.':'Hi, I’m Omnibot. I can help you choose your next safeguard and work through its assessment. Ready to get started?';

  const close=()=>{if(refined&&dirty){setConfirmClose(true);return;}changeMode('collapsed');};

  async function saveAndClose(){

    if(requireFocusedComparison())return;

    if(await save(step,!!result,answers,false,draft,result?{...result,narrative}:null)){setConfirmClose(false);changeMode('collapsed');}

  }

  function discardAndClose(){

    setAnswers(draft?.answers||{});saved.current=JSON.stringify(draft?.answers||{});setStep(draft?.step||0);

    setResult(draft?.completed?draft.result:null);setNarrative(draft?.narrative||'');setSummaryEdited(!!draft?.narrative);setSummaryBasis(draft?.completed?JSON.stringify(draft.answers):'');setIncremental(null);setConfirmClose(false);changeMode('collapsed');

  }

  async function readNewReviewBase(){
    const {data}=await api.get(base);
    if(data.revision!==draft.revision||data.current_assessment_token!==(current?.last_saved||current?.last_assessed||null)||data.current_scope_fingerprint!==draft.current_scope_fingerprint)throw new Error('The interview, assessment or scope changed. Reopen the assessment before starting a new review.');
    return data;
  }
  async function save(nextStep=step,completed=false,newAnswers=answers,fresh=false,reviewDraft=draft,outputOverride=null){
    if(!draft||disabled||busy||!workspacePilot&&updated&&Object.keys(newAnswers).length)return false;
    const savingIdentity=identity;
    setBusy(true);setError('');
    try{let startBase=reviewDraft;
      if(workspacePilot&&fresh){
        // A deliberate empty restart may follow native Save. Refresh only its
        // new base; an existing proposal always retains its original lineage.
        const data=await readNewReviewBase();if(activeIdentity.current!==savingIdentity)return false;
        startBase=data;
      }

      const output=completed?(outputOverride||result||(focused?focusedResult(id,newAnswers,version):generateResult(id,newAnswers,new Date(),version))):null,generatedNarrative=completed?(outputOverride?outputOverride.narrative:result?narrative:output.narrative):refined&&summaryEdited&&!fresh?narrative:'';

      const payload={version:workspacePilot&&!fresh?reviewDraft.version:currentVersion,answers:newAnswers,narrative:generatedNarrative,step:nextStep,completed,expected_revision:reviewDraft.revision};
      if(workspacePilot)Object.assign(payload,{result:output?.missingRecorded?null:output,...(fresh?{restart:true}:{}),...(fresh||reviewDraft.revision===0?{base_assessment_token:startBase.current_assessment_token,base_scope_fingerprint:startBase.current_scope_fingerprint}:{})});
      const {data}=await api.put(base,payload);if(activeIdentity.current!==savingIdentity)return false;setDraft(data);setAnswers(data.answers);saved.current=JSON.stringify(data.answers);setStep(nextStep);return data;}
    catch(e){if(activeIdentity.current===savingIdentity)setError(formatError(e));return false;}finally{if(activeIdentity.current===savingIdentity)setBusy(false);}
  }
  function requireFocusedComparison(){
    if(!focused||!draft?.revision||context?.lineageStale===false)return false;
    setReuseAnswers(false);
    if(updated){setCompareTarget(null);setRestart(true);}
    else setCompareTarget(question?.id||'resume');
    return true;
  }
  async function proceed(){
    if(requireFocusedComparison())return;
    const next=focused?questions.findIndex((q,index)=>index>step&&answers[q.id]===undefined):step+1;
    const final=step>=questions.length-1||next<0;
    if(focused&&final){await reviewFocusedProposal();return;}
    const data=await save(final?step:next,final);
    if(data&&final){const output=workspacePilot&&data.result?data.result:generateResult(id,data.answers,data.generated_at?new Date(data.generated_at):new Date(),data.version);setResult(output);setNarrative(data.narrative||output.narrative);setReplace(false);if(workspacePilot)setView('result');}
    heading.current?.focus();
  }
  function editFocusedFact(topic){
    if(context?.lineageStale!==false){setCompareTarget(topic);setReuseAnswers(false);return;}
    setResult(null);setReplace(false);setStep(Math.max(0,questions.findIndex(q=>q.id===topic)));setView('interview');
  }
  async function compareAndContinue(){
    if(updated){setCompareTarget(null);setReuseAnswers(false);setRestart(true);return;}
    const retained=answers,target=compareTarget,fresh=await save(0,false,{},true);if(!fresh)return;
    const next=target==='resume'?nextFocusedQuestion(id,retained,fresh.version):Math.max(0,visibleQuestions(id,retained,fresh.version).findIndex(q=>q.id===target));

    setResult(null);if(!refined||!summaryEdited)setNarrative('');setReplace(false);setCompareTarget(null);setReuseAnswers(false);setView('interview');setIncremental(null);setStagedImplementation(null);

    if(!await save(next,false,retained,false,fresh)){setAnswers(retained);setStep(next);setSaveNotice('The new review base is saved. Retained answers are still unsaved; retry saving them. The prior interview remains in history.');}
    else setSaveNotice('Confirmed answers retained against the current saved assessment. Review only the facts that changed; any new recommendation still needs your review and native Save.');
  }
  async function reviewFocusedProposal(){
    if(requireFocusedComparison())return;

    const generated=refined?refinedSummary(id,answers,version):focusedResult(id,answers,version);

    const output=summaryEdited?{...generated,narrative}:generated,expected=form?.implementation||'';

    if(expected.trim()){setIncremental({proposed:output.narrative,expected,output,purpose:'proposal'});setReconciled(expected);setReconciliationConfirmed(false);return;}
    await saveFocusedProposal(output);
  }
  async function saveFocusedProposal(output){
    if(requireFocusedComparison())return;
    const data=await save(step,true,answers,false,draft,output);if(!data)return;
    setResult(output);setNarrative(output.narrative);setReplace(false);setView('result');
    setIncremental(null);
    return data;
  }

  function putRefined(question,value){

    setAnswers(previous=>{

      const next=correctFocusedAnswer(id,previous,question,value,version);

      // Changing an answer keeps the group's reported context; inactive source details stay stored but are excluded from summaries.

      for(const group of omniGroups(id,previous,version))if(question.id===group.note&&previous[question.id+'_detail']!==undefined)next[question.id+'_detail']=previous[question.id+'_detail'];

      if(question.id==='sources'&&previous.sources_detail!==undefined)next.sources_detail=previous.sources_detail;

      return next;

    });

    setResult(null);setReplace(false);setIncremental(null);setSaveNotice('');setStagedImplementation(null);

  }

  function putRefinedDetail(key,value){setAnswers(previous=>({...previous,[key]:value}));setResult(null);setReplace(false);setSaveNotice('');}

  async function nextRefinedGroup(index,groups){

    if(requireFocusedComparison())return;

    const group=groups[index],root=id==='1.1'?'inventory':'process';

    if(group.ids.includes(root)&&!answers[root]){setError('Choose an answer before continuing. Not sure is a valid response.');return;}

    if(group.ids.includes('sources')&&multipleOmniSources(answers)&&!answers.sources_detail?.trim()){setError('List each source and what it covers, or record what still needs confirmation.');return;}

    const next=groups.find((g,i)=>i>index&&g.questions.length);

    if(!next){await reviewFocusedProposal();return;}

    const nextStep=visibleQuestions(id,answers,version).findIndex(q=>q.id===next.questions[0].id);

    if(await save(nextStep,false)){heading.current?.focus({preventScroll:true});}

  }

  async function useRefinedSummary(){

    if(requireFocusedComparison())return;

    const expected=JSON.stringify(form),savedToken=current?.last_saved;
    const data=await save(step,true,answers,false,draft,{...result,narrative});if(!data)return;
    if(nativeApplication.current.assessmentDirty||JSON.stringify(nativeApplication.current.form)!==expected||nativeApplication.current.current?.last_saved!==savedToken){setError('The native assessment changed while saving this summary. Review the current assessment before applying it.');return;}

    nativeApplication.current.onApply({implementation:data.narrative,status:data.result.status,guided_assessment_source:Object.fromEntries(['version','revision','generated_at'].map(k=>[k,data[k]]))});

    setApplied(true);setConfirmClose(false);changeMode('collapsed');

  }

  function backFromSummary(){
    const last=omniGroups(id,answers,version).filter(group=>group.questions.length).at(-1);
    setResult(null);setStep(questions.findIndex(q=>q.id===last.questions[0].id));setView('interview');
  }
  async function confirmRestart(){
    const retained=focused&&reuseAnswers&&version===currentVersion?answers:null;
    const fresh=await save(0,false,{},workspacePilot);if(!fresh)return;

    setResult(null);setNarrative('');setSummaryEdited(false);setSummaryBasis('');setRestart(false);setReuseAnswers(false);setView('interview');setIncremental(null);setSaveNotice('');

    if(retained&&Object.keys(retained).length){
      const next=nextFocusedQuestion(id,retained,fresh.version);
      if(!await save(next,false,retained,false,fresh)){
        setAnswers(retained);setStep(next);
        setSaveNotice('The empty new review was saved. Retained reported answers are still unsaved; retry saving them. The prior interview remains in history.');
      }
    }
  }
  const put=(value)=>{setAnswers(p=>focused?correctFocusedAnswer(id,p,question,value,version):({...p,[question.id]:value}));setResult(null);setReplace(false);setIncremental(null);setSaveNotice('');setStagedImplementation(null);};
  async function stageAnswer(text,expected){
    if(requireFocusedComparison())return;
    const data=await save(step,false);
    if(!data)return;
    if(!nativeUpdate.current?.(text,expected)){setError('The answer was saved, but the native implementation draft changed. Reconcile it before updating; no implementation was overwritten.');return;}
    setIncremental(null);setResult(null);setSaveNotice('');setStagedImplementation(text);
    setStep(nextFocusedQuestion(id,data.answers,data.version));
  }
  async function saveFocusedAnswer(){
    if(requireFocusedComparison())return;
    const proposed=focusedNarrative(id,answers,version),expected=form?.implementation||'';
    if(expected.trim()){
      setIncremental({proposed,expected});setReconciled(expected);setReconciliationConfirmed(false);
    }else await stageAnswer(proposed,expected);
  }
  const uncertain=question&&(question.id==='unresolved'?['Yes','Partially','Not sure']:['Partially','No','Not sure']).some(v=>Array.isArray(answers[question.id])?answers[question.id].includes(v):typeof answers[question.id]==='object'?Object.values(answers[question.id]||{}).includes(v):answers[question.id]===v);
  async function loadHistory(append=false){const readingIdentity=identity;setHistoryBusy(true);setHistoryError('');try{const {data}=await api.get(base+'/history',{params:{limit:25,...(append?{before_revision:history.next_before_revision}:{})}});if(activeIdentity.current===readingIdentity)setHistory({records:append?[...history.records,...data.items]:data.items,next_before_revision:data.next_before_revision});}catch(e){if(activeIdentity.current===readingIdentity)setHistoryError(formatError(e));}finally{if(activeIdentity.current===readingIdentity)setHistoryBusy(false);}}
  const startReview=async()=>{
    if(draft?.revision){setRestart(true);return;}
    if(workspacePilot&&draft&&!Object.keys(answers).length){
      const startingIdentity=identity;setBusy(true);setError('');
      try{const data=await readNewReviewBase();if(activeIdentity.current!==startingIdentity)return;setDraft(data);setView('interview');}
      catch(e){if(activeIdentity.current===startingIdentity)setError(formatError(e));}
      finally{if(activeIdentity.current===startingIdentity)setBusy(false);}
    }else setView('interview');
  };
  const action=name=>{if(name==='start'||name==='reassess')startReview();else if(name==='resume')setView('interview');else if(name==='findings')setView('linked');else if(name==='changes')setView('changes');else if(name==='result')setView('result');else setView('position');heading.current?.focus();};

  return <div className={'guided-pilot '+(workspacePilot?'guided-lifecycle ':'')+(refined?'omni-refined ':'')+(record?'guided-in-assessment':'')} data-testid="guided-pilot">

    <OmniDock preferenceKey={key} inAssessment={!!record} freePosition={workspacePilot} name={botName} focused={focused}>
      {greeting&&<div className="guided-greeting omni-entrance"><p>Hi, I’m Omni. How can I help you today?</p><p>I can help you review safeguards, identify missing requirements, and prepare your implementation summary.</p><button onClick={()=>changeMode('collapsed')} aria-label="Dismiss Omni greeting">Dismiss</button></div>}
      {mode==='dismissed'?<Button ref={launcher} size="sm" variant="outline" onClick={()=>changeMode('collapsed')}>Show {botName}</Button>:<>
      <button ref={launcher} className={'omni-launch-button '+(greeting?'omni-entrance ':'')+(mode==='minimized'?'is-minimized':'')} onClick={()=>changeMode('expanded')} aria-label={focused?"Open Omnibot guide":"Open Omni guided assessment"} aria-expanded={mode==='expanded'} aria-controls={mode==='expanded'?panelId:undefined} aria-describedby={stateId}><OmniCharacter state={characterState} approved={workspacePilot}/></button>
      {focused?<>

        {contextPrompt&&(mode==='collapsed'||mode==='minimized')&&<div className="guided-context-prompt" role="complementary" aria-label="Omnibot invitation"><p>{invitation}</p><button type="button" aria-label="Close invitation" className="omni-invitation-x" onClick={()=>{changeMode('collapsed');launcher.current?.focus({preventScroll:true});}}>×</button></div>}

      </>:contextPrompt&&(mode==='collapsed'||focused&&mode==='minimized')&&(workspacePilot||record)&&<div className="guided-context-prompt"><p>{workspacePilot?(record?context.summary:'Review the recorded CIS program position and choose the next safeguard.'):(draft?.completed?result?.unknowns.length?`${result.unknowns.length} items still need verification`:'Your recommendation is ready':draft?.revision?'Resume your review':'Ready to review this safeguard?')}</p>{!workspacePilot&&<p>I’ll walk you through each required element, identify anything missing or uncertain, and prepare your implementation summary.</p>}<button onClick={()=>changeMode('expanded')}>Review with Omni</button><button onClick={()=>changeMode('collapsed')}>Not now</button>{workspacePilot&&<><button onClick={()=>{try{sessionStorage.setItem(key+':quiet','1');}catch{}changeMode('collapsed');}}>Quiet for this session</button><button onClick={()=>{try{localStorage.setItem(key,JSON.stringify({...readPreference(key),invitationsDisabled:true}));}catch{}changeMode('collapsed');}}>Turn off invitations</button></>}</div>}
      </>}
      <span id={stateId} className="sr-only">{stateText}</span>
    </OmniDock>
    <Dialog modal={!workspacePilot} open={mode==='expanded'} onOpenChange={open=>{if(!open)close();}}>

      {mode==='expanded'&&<GuideContent id={panelId} className="guided-panel bg-surface-card" onOpenAutoFocus={e=>{e.preventDefault();heading.current?.focus({preventScroll:true});}} onCloseAutoFocus={e=>{e.preventDefault();launcher.current?.focus({preventScroll:true});}} onPointerDownOutside={e=>e.preventDefault()} {...(workspacePilot?{onMinimize:()=>changeMode('minimized'),onClose:close,name:botName,refined,program:!record,...(focused?{anchor:()=>launcher.current?.getBoundingClientRect()}:{} )}:{})}>

        <div className="omni-panel-header"><OmniCharacter state={characterState} approved={workspacePilot}/><div><DialogTitle {...(workspacePilot?{id:panelId+'-title'}:{})} ref={heading} tabIndex={refined?0:-1}>{record?(refined?'Omnibot guide':botName+' Guide')+' · Safeguard '+id:focused?'Guided assessment with Omnibot':'Guided Assessment with Omni'}</DialogTitle>{!refined&&<p className="omni-state-text" role="status">{stateText}</p>}</div></div>

        <DialogDescription className={refined?'sr-only':undefined} {...(workspacePilot?{id:panelId+'-description'}:{})}>{refined?'Review reported practices and prepare an implementation draft. Focus the heading and use arrow keys to move the window, or Alt and arrow keys to resize it.':<>{record?record.title:`CIS IG${configuration?.implementation_group||1} · CIS Controls v8.1`} · Deterministic guidance, not an independent assessment or evidence review.</>}</DialogDescription>

        <div className="guided-panel-body">
          {error&&<p role="alert">{error}</p>}
          {focused&&saveNotice&&<p role="status">{saveNotice}</p>}
          {focused&&dirty&&<p role="status">Interview edits are not saved yet. Save the interview separately from any native assessment changes.</p>}
          {focused&&stagedNotice&&<p role="status">{stagedNotice}</p>}
          {focused&&record&&draft?.revision>0&&context.lineageStale!==false&&<section>{needsComparison?<p role="alert">The saved assessment changed after this interview began. Compare its current implementation before continuing; your saved answers and history are retained.</p>:<p>This interview is the saved assessment source. To update its answers, confirm them against the current saved assessment; the recorded position remains unchanged.</p>}<p className="whitespace-pre-wrap">{current?.implementation||'No implementation narrative recorded.'}</p><Button variant="outline" disabled={disabled||busy||assessmentDirty||updated} onClick={()=>{setCompareTarget('resume');setReuseAnswers(false);}}>Compare & continue from saved assessment</Button>{assessmentDirty&&<p>Save or discard the native assessment draft before comparing the saved record.</p>}</section>}
          {focused&&compareTarget!==null&&<section role="group" aria-label="Compare saved assessment"><h3>Continue from the current saved assessment</h3><p>Saved status: {STATUSES[current?.status]||'Not recorded'}. Verification: {current?.verification?.replaceAll('_',' ')||'Not recorded'}.</p><p className="whitespace-pre-wrap">{current?.implementation||'No implementation narrative recorded.'}</p><p>A new review will preserve the prior interview in history and retain only the answers you confirm are still relevant. No native assessment or verification will be changed.</p><label><input type="checkbox" disabled={disabled||busy} checked={reuseAnswers} onChange={e=>setReuseAnswers(e.target.checked)}/> I compared the current saved assessment and confirmed these answers remain relevant; I will update any changed facts.</label><Button disabled={disabled||busy||assessmentDirty||!reuseAnswers} onClick={compareAndContinue}>Retain answers & continue</Button><Button variant="outline" disabled={busy} onClick={()=>{setCompareTarget(null);setReuseAnswers(false);}}>Cancel comparison</Button></section>}
          {focused&&record&&draft?.result?.status==='addressed'&&Object.keys(answers).length>0&&focusedResult(id,answers,version).status!=='addressed'&&<p role="alert">The prior completion recommendation is not supported by the current reported answers. Review the unresolved criteria before proposing Implemented.</p>}

          {focused&&record&&draft&&!refined&&<div className="guided-actions"><Button variant="outline" disabled={busy||!!incremental} onClick={()=>{setResult(null);setStep(nextFocusedQuestion(id,answers,version));setView('interview');}}>Review or correct answers</Button><Button variant="outline" disabled={busy||!!incremental} onClick={()=>setView('changes')}>Review changes</Button><Button variant="outline" disabled={busy||!!incremental} onClick={()=>setView('linked')}>Review linked records</Button></div>}

          {focused&&current?.status==='addressed'&&Object.keys(answers).length>0&&focusedResult(id,answers,version).status!=='addressed'&&<p role="alert">Recorded answers do not support the saved Implemented status. Reassess through the native review and save workflow; no status has been changed.</p>}
          {focused&&current?.status==='addressed'&&current.verification==='gap_identified'&&<p role="alert">Saved verification identifies a gap. Review the linked records and current operation; implementation status is unchanged.</p>}
          {focused&&record&&draft&&view==='changes'&&<section><p>Saved assessment: {STATUSES[current?.status]||'Not recorded'}. A changed tool or team does not establish implementation; review any effect on the existing requirements.</p><label>Fact or requirement to update<select aria-label="Fact or requirement to update" disabled={disabled||busy||updated||!!incremental||compareTarget!==null} value={changeTopic} onChange={e=>setChangeTopic(e.target.value)}><option value="">Choose the changed fact</option>{questions.map(q=><option key={q.id} value={q.id}>{q.prompt}</option>)}</select></label><Button disabled={disabled||busy||updated||!changeTopic||assessmentDirty||compareTarget!==null} onClick={()=>editFocusedFact(changeTopic)}>Update this fact</Button><p>Other answers remain available. Review the updated proposal before explicitly applying any status or narrative changes and using Save assessment.</p></section>}

          {focused&&record&&draft&&view==='interview'&&!refined&&answers[id==='1.1'?'inventory':'process']!==undefined&&<Button variant="outline" disabled={disabled||busy||!!incremental||compareTarget!==null} onClick={reviewFocusedProposal}>Review updated proposal</Button>}

          {incremental&&<section role="group" aria-label="Reconcile implementation narrative"><h3>Reconcile Current implementation</h3><p>Retain unrelated valid details and replace resolved gaps. This proposed text reports answers; it does not verify evidence.</p><p>{incremental.proposed}</p><label>Reconciled native implementation draft<Textarea aria-label="Reconciled native implementation draft" disabled={disabled||busy} value={reconciled} maxLength={20000} onChange={e=>{setReconciled(e.target.value);setReconciliationConfirmed(false);}}/></label><label><input type="checkbox" disabled={disabled||busy} checked={reconciliationConfirmed} onChange={e=>setReconciliationConfirmed(e.target.checked)}/> I reconciled these reported answers with the existing narrative and retained unrelated valid details.</label><Button disabled={disabled||busy||!reconciliationConfirmed||!reconciled.trim()||incremental.purpose!=='proposal'&&reconciled===incremental.expected} onClick={async()=>{if(incremental.purpose==='proposal'){if(await saveFocusedProposal({...incremental.output,narrative:reconciled})){if(refined){setSummaryEdited(true);setSummaryBasis(JSON.stringify(answers));}}}else await stageAnswer(reconciled,incremental.expected);}}>{incremental.purpose==='proposal'?'Save reconciled proposal':'Save answer & update implementation draft'}</Button><Button variant="outline" disabled={busy} onClick={()=>setIncremental(null)}>Cancel narrative update</Button></section>}
          {workspacePilot&&record&&!focused&&<><p>{context.summary}</p><div className="guided-actions">{context.actions.map(name=><Button key={name} variant="outline" disabled={busy} onClick={()=>action(name)}>{({start:'Start',resume:'Resume your review',current:'Review current position',findings:context.signals.openFindings>0?'Review findings':'Review linked records',changes:'Review changes',reassess:'Full reassessment',result:'Review recommendation'})[name]}</Button>)}</div>{assessmentDirty&&<p>Unsaved native assessment changes are present. Save or discard them in the assessment before applying a recommendation.</p>}</>}
          {updated&&<section><p>Updated assessment guidance is available. Your saved answers and narrative remain associated with their original question set.</p><Button disabled={disabled||busy} onClick={()=>setRestart(true)}>Begin a new review</Button></section>}

          {!record?focused?<FocusedProgram rows={rows} drafts={draftSummaries} contextComplete={contextComplete} onSelect={row=>{changeMode('minimized');onSelect?.(row);}}/>:workspacePilot?<ProgramPosition overview={overview} rows={rows} onSelect={row=>{close();onSelect?.(row);}} onViewAll={()=>{close();onViewAll?.();}}/>:<><p>Omni helps you see the full picture.</p>{prioritizeGuidedRows(rows.filter(r=>pilotEnabled(clientId,'cis-ig1',configuration,r.definition_id)),draftSummaries).map((r,i)=><section key={r.definition_id}><h3>{i===0?'Recommended next step':'Also needs attention'} · {r.definition_id} · {r.title}</h3><p>{draftSummaries[r.definition_id]?.completed?'Recommendation ready':draftSummaries[r.definition_id]?.revision?'Resume assessment':r.work?.overdue_reviews?'Overdue scheduled review':r.status==='not_assessed'?'Not Assessed':r.status==='addressed'?'Verification required':'Unresolved gap'}</p><Button onClick={()=>{close();onSelect(r);}}>{draftSummaries[r.definition_id]?.revision?'Resume':'Start'} safeguard {r.definition_id}</Button></section>)}<Button variant="outline" onClick={()=>{close();onViewAll?.();}}>View all safeguards</Button></>:refined&&draft&&view==='interview'?<RefinedOmniInterview id={id} answers={answers} version={version} step={question?.id} setStep={questionId=>{setStep(questions.findIndex(q=>q.id===questionId));heading.current?.focus({preventScroll:true});}} put={putRefined} detail={putRefinedDetail} blocked={disabled||busy||!!incremental||compareTarget!==null||restart} busy={busy} onNext={nextRefinedGroup} onSaveClose={saveAndClose} inventoryContext={inventoryContext}/>:refined&&draft&&view==='result'&&result?<>

            <p className="omni-intro-label">Ready for your review</p><h3>Your implementation summary</h3><p>Check the wording, then use it in the existing assessment.</p>

            <div className="omni-summary-status"><span>What your answers indicate</span><span className={'omni-status-badge '+result.status}>{STATUSES[result.status]||'Not recorded'}</span></div>

            {summaryEdited&&summaryBasis!==JSON.stringify(answers)&&<section role="status"><p>Your answers changed after you edited this summary. Your wording is preserved.</p><Button variant="outline" disabled={busy} onClick={async()=>{const output=refinedSummary(id,answers,version);if(await saveFocusedProposal(output)){setSummaryEdited(false);setSummaryBasis(JSON.stringify(answers));}}}>Refresh from answers</Button><Button variant="outline" disabled={busy} onClick={()=>setSummaryBasis(JSON.stringify(answers))}>Keep my wording after review</Button></section>}

            <label>Current implementation<Textarea aria-label="Current implementation summary" rows={14} maxLength={20000} disabled={disabled||busy} value={narrative} onChange={e=>{setNarrative(e.target.value);if(!summaryEdited)setSummaryBasis(JSON.stringify(answers));setSummaryEdited(true);setReplace(false);}}/></label>

            <p className="omni-help">Use summary prepares a draft. Your existing Save assessment button remains the final save.</p>

            {!!form?.implementation&&<label className="guided-replacement"><input type="checkbox" disabled={disabled||busy} checked={replace} onChange={e=>setReplace(e.target.checked)}/> I understand the existing Current implementation narrative will be replaced.</label>}

            <div className="omni-action-bar"><Button variant="outline" disabled={busy} onClick={backFromSummary}>Back</Button><Button disabled={disabled||busy||result.missingRecorded||assessmentDirty||context.lineageStale!==false||context.applicationState==='previous'||!narrative.trim()||summaryEdited&&summaryBasis!==JSON.stringify(answers)||!!form?.implementation&&!replace||result.status==='addressed'&&focusedResult(id,answers,version).status!=='addressed'} onClick={useRefinedSummary}>Use summary</Button><Button variant="outline" disabled={disabled||busy} onClick={saveAndClose}>Save &amp; close</Button></div>

          </>:refined&&view==='changes'?<><Button variant="outline" disabled={busy||!!incremental} onClick={()=>{setResult(null);setStep(nextFocusedQuestion(id,answers,version));setView('interview');}}>Resume</Button><Button variant="ghost" disabled={disabled||busy} onClick={()=>setRestart(true)}>Begin a new review</Button></>:workspacePilot&&view==='position'?<RecordedPosition context={context} current={current} draft={draft} people={people}/>:workspacePilot&&view==='linked'?<LinkedPosition related={related} complete={contextComplete} onOpen={onOpenNative} people={people}/>:workspacePilot&&view==='changes'?<><h3>Review changes · Safeguard {id}</h3><p>{changeQuestions.safeguards[id]?.prompt}</p><p>{changeQuestions.help}</p><fieldset disabled={disabled||busy}><legend>Current change report</legend>{changeQuestions.choices.map(value=><label key={value}><input type="radio" name={panelId+'-changes'} checked={changeAnswer===value} onChange={()=>setChangeAnswer(value)}/> {value}</label>)}</fieldset>{changeAnswer==='No changes reported'&&<p>No changes reported here. The saved assessment, verification, evidence, findings, actions, review schedule and approvals remain unchanged.</p>}{changeAnswer&&changeAnswer!=='No changes reported'&&<><p>{changeQuestions.safeguards[id]?.followup_prompt}</p><p>Use the native assessment or linked record to record a confirmed change, or begin a full reassessment. Previous interview answers remain historical context.</p><Button variant="outline" disabled={busy||!!incremental} onClick={()=>setView('linked')}>Review linked records</Button></>}</>:!draft?<p role="status">{loaded?'Saved interview unavailable. Reopen the assessment to retry.':'Loading saved interview…'}</p>:result&&(!workspacePilot||view==='result')?<>

            <p>{result.missingRecorded?'This completed interview retains its original saved work.':'Review complete. Your recommendation is ready. Review the recommendation and generated implementation summary before applying them to the assessment.'}</p>
            <h3>Review before applying</h3>
            {workspacePilot&&result.missingRecorded&&<><p>The original structured recommendation was not recorded. The saved narrative and answers retain question set {draft.version}; no conclusion has been regenerated.</p><details><summary>Preserved historical answers</summary><pre>{JSON.stringify(draft.answers,null,2)}</pre></details></>}
            <p>Recommended Implementation Status: <strong>{STATUSES[result.status]||'Not recorded'}</strong></p>
            <label>Current Implementation draft<Textarea aria-label="Guided Current Implementation draft" disabled={disabled||busy} rows={8} maxLength={20000} value={narrative} onChange={e=>{setNarrative(e.target.value);setReplace(false);}}/></label>
            {[['Basis for Recommendation',result.basis],['Confirmed Gaps',result.gaps],['Items Still Unknown or Requiring Verification',result.unknowns],['Recommended Next Steps',result.nextSteps],['Suggested Supporting Evidence',result.evidence]].map(([title,items])=><section key={title}><h3>{title}</h3>{items.length?<ul>{items.map((v,i)=><li key={i}>{v}</li>)}</ul>:<p>{result.missingRecorded?'Not recorded in this historical result.':'None reported.'}</p>}</section>)}
            <details><summary>Answers driving the recommendation</summary>{result.answers.map((a,i)=><p key={i}>{a.prompt} — {a.answer}</p>)}</details>
            <p>Apply changes only Current Implementation and Implementation Status in the unsaved assessment draft. Verification, evidence, findings, actions, and Last Assessed remain unchanged until normal Save.</p>
            {!!form?.implementation&&<label className="guided-replacement"><input type="checkbox" disabled={disabled||busy} checked={replace} onChange={e=>setReplace(e.target.checked)}/> I understand the existing Current Implementation narrative will be replaced.</label>}
            <Button disabled={disabled||busy||workspacePilot&&(result.missingRecorded||dirty||assessmentDirty||context.lineageStale!==false||context.applicationState==='previous')||focused&&result.status==='addressed'&&focusedResult(id,answers,version).status!=='addressed'||!narrative.trim()||narrative.length>20000||!!form?.implementation&&!replace} onClick={()=>{onApply({implementation:narrative,status:result.status,guided_assessment_source:Object.fromEntries(['version','revision','generated_at'].map(k=>[k,draft[k]]))});setApplied(true);close();}}>Apply to Assessment</Button>
            {workspacePilot&&<p>Save edited interview text before applying. A recommendation with an unknown or changed assessment base requires a fresh review.</p>}
            <Button variant="outline" disabled={disabled||busy} onClick={()=>{setResult(null);setStep(0);setView('interview');}}>Review answers</Button>
          </>:question?<>
            <p>I’ll help you review every material part of this safeguard, identify anything missing or uncertain, and prepare an implementation summary.</p>
            {characterState==='gap'&&<p>A recorded answer identifies a requirement that is not fully addressed.</p>}
            {characterState==='verification'&&<p>One or more items still need verification before a definitive recommendation can be made.</p>}
            <p aria-live="polite">Question group {Math.min(step+1,questions.length)} of {questions.length} · {draft.revision?'In progress':'Not started'}</p>
            {focused&&id==='1.2'&&inventoryContext&&['inventory_dependency','detection'].includes(question.id)&&<section aria-label="Saved safeguard 1.1 inventory context"><h3>Saved inventory context · Safeguard 1.1</h3><p>Implementation: {STATUSES[inventoryContext.status]||'Not recorded'} · Verification: {inventoryContext.verification?.replaceAll('_',' ')||'Not recorded'} · Saved: {recordedDate(inventoryContext.last_saved)||'Not recorded'}</p><p className="whitespace-pre-wrap">{inventoryContext.implementation||'No inventory narrative recorded.'}</p><p>This is the saved 1.1 position, not proof of inventory completeness. Confirm how the current 1.2 process distinguishes authorized assets. No answers or assessments are changed by this context.</p></section>}
            <fieldset disabled={disabled||busy||updated&&!workspacePilot||focused&&(!!incremental||compareTarget!==null)}><legend>{focused&&question.id==='inventory'&&draft.answers.inventory==='No'?'Has an enterprise asset inventory been established since this was last reported?':question.prompt}</legend><p>{question.help}</p>{focused&&<p>{question.critical?'Requirement criterion: reported implementation, not evidence verification.':'Supporting context: not an additional safeguard requirement.'}</p>}
              {['text','date'].includes(question.type)?question.type==='date'?<input aria-label={question.prompt} type="date" value={answers[question.id]||''} onInput={e=>put(e.target.value)}/>:<Textarea aria-label={question.prompt} maxLength={2000} value={answers[question.id]||''} onChange={e=>put(e.target.value)}/>:question.type==='matrix'?question.rows.map(row=><label key={row}>{row}<select aria-label={row} value={answers[question.id]?.[row]||''} onChange={e=>put({...answers[question.id],[row]:e.target.value})}><option value="">Not recorded</option>{(question.row_choices?.[row]||question.choices).map(v=><option key={v} value={v}>{focused&&v==='Partially'?'Partly':v}</option>)}</select></label>):question.type==='multi'?question.choices.map(v=><label className="guided-choice" key={v}><input type="checkbox" checked={(answers[question.id]||[]).includes(v)} onChange={e=>put(e.target.checked?[...(answers[question.id]||[]),v]:(answers[question.id]||[]).filter(x=>x!==v))}/>{v}</label>):<select aria-label={question.prompt} value={answers[question.id]||''} onChange={e=>put(e.target.value)}><option value="">Not recorded</option>{question.choices.map(v=><option key={v} value={v}>{focused&&v==='Partially'?'Partly':v}</option>)}</select>}
              {(uncertain||focused)&&<label>{focused?'Supporting explanation, scope, or evidence references':'What is missing, or who can verify this?'}<Textarea aria-label="Missing elements or verification owner" maxLength={2000} value={answers[question.id+'_detail']||''} onChange={e=>{setAnswers(p=>({...p,[question.id+'_detail']:e.target.value}));setResult(null);setReplace(false);setIncremental(null);setSaveNotice('');setStagedImplementation(null);}}/></label>}
            </fieldset>
            <div className="guided-actions">{focused&&<Button disabled={disabled||busy||!onUpdateImplementation||answers[question.id]===undefined} onClick={saveFocusedAnswer}>Save answer & update implementation draft</Button>}<Button variant="outline" disabled={busy||step===0||focused&&!!incremental} onClick={()=>{setStep(n=>n-1);heading.current?.focus();}}>Back</Button><Button disabled={disabled||busy||updated&&!workspacePilot||focused&&!!incremental} onClick={proceed}>{step>=questions.length-1?'Generate review':focused?'Save interview answer & continue':'Continue'}</Button></div>
          </>:null}

          {record&&draft&&!refined&&(!workspacePilot||['interview','result'].includes(view))&&<div className="guided-actions"><Button variant="outline" disabled={disabled||busy||updated&&!workspacePilot||focused&&!!incremental} onClick={async()=>{if(!requireFocusedComparison()&&await save(step,!!result))close();}}>Save and exit</Button><Button variant="ghost" disabled={disabled||busy} onClick={()=>setRestart(true)}>{workspacePilot?'Start a new review':'Restart assessment'}</Button></div>}

          {restart&&<section role="group" aria-label="Confirm restart"><p>{workspacePilot?'A new interview begins from the current saved assessment. The previous saved interview is preserved in interview history. Unsaved interview edits will be discarded.':'Restart replaces this saved interview only. The assessment and its history remain unchanged.'}</p>{focused&&version===currentVersion&&Object.keys(answers).length>0&&<label><input type="checkbox" checked={reuseAnswers} onChange={e=>setReuseAnswers(e.target.checked)}/> I confirmed these answers remain current; reuse them in the new review. Prior conclusions will not be carried forward.</label>}<Button disabled={disabled||busy} onClick={confirmRestart}>Confirm restart</Button><Button variant="outline" onClick={()=>{setRestart(false);setReuseAnswers(false);}}>Cancel restart</Button></section>}
          {workspacePilot&&record&&<section><Button variant="outline" disabled={historyBusy} onClick={()=>loadHistory()}>Review interview history</Button>{historyError&&<p role="alert">{historyError}</p>}{history&&<><p>Saved interview snapshots for your account. Earlier records may lack lineage or structured output; no retention policy was changed.</p>{history.records.map(item=><details key={item.revision}><summary>Revision {item.revision} · {item.version} · {item.completed?'Completed interview':'Interview checkpoint'} · {item.updated_at||'Time not recorded'}</summary><p>Recorded by {personLabel([...people,user],item.user_id,'Attribution not recorded')}</p><p>{item.narrative||'No narrative recorded.'}</p><pre>{JSON.stringify(item.answers,null,2)}</pre>{item.result&&<p>Recorded recommendation: {STATUSES[item.result.status]}</p>}</details>)}{!history.records.length&&<p>No available archived interview snapshots. This does not establish that no older interview ever existed.</p>}{history.next_before_revision&&<Button variant="outline" disabled={historyBusy} onClick={()=>loadHistory(true)}>Load earlier interviews</Button>}</>}</section>}

          {!refined&&<p>Question set: {version}. Answers are not evidence verification or a compliance opinion.</p>}

          {workspacePilot&&!focused&&initial.invitationsDisabled&&<Button variant="ghost" onClick={()=>{try{localStorage.setItem(key,JSON.stringify({...readPreference(key),invitationsDisabled:false}));}catch{}setContextPrompt(false);}}>Enable contextual invitations</Button>}

          {refined&&<Dialog open={confirmClose} onOpenChange={setConfirmClose}><DialogContent className="omni-refined-close" onEscapeKeyDown={e=>e.stopPropagation()}><DialogTitle>Save your progress?</DialogTitle><DialogDescription>Your interview edits have not been saved. The native assessment is unchanged by these actions.</DialogDescription><div className="guided-actions"><Button variant="outline" onClick={()=>setConfirmClose(false)}>Keep editing</Button><Button variant="outline" disabled={busy} onClick={discardAndClose}>Discard changes</Button><Button disabled={disabled||busy} onClick={saveAndClose}>Save &amp; close</Button></div></DialogContent></Dialog>}

        </div>
        {!workspacePilot&&<div className="guided-actions"><Button variant="outline" onClick={()=>changeMode('minimized')}>Minimize</Button><Button variant="ghost" onClick={()=>changeMode('dismissed')}>Dismiss assistant</Button></div>}
      </GuideContent>}
    </Dialog>
  </div>;
}

function FocusedProgram({rows,drafts,contextComplete,onSelect}){
  const recommendations=focusedRecommendations(rows,drafts,contextComplete);

  return <><p className="omni-intro-label">A practical way forward</p><h3>Omnibot’s recommended next steps</h3><div className="omni-recommendations">{recommendations.map(row=><article key={row.definition_id} className="omni-recommendation"><p className="omni-safeguard-id">Safeguard {row.definition_id}</p><h4>{row.title}</h4><span className={'omni-status-badge '+row.status}>{STATUSES[row.status]||'Status unavailable'}</span><ul>{recordedOmniReasons(row,contextComplete).map(reason=><li key={reason}>{reason}</li>)}</ul><Button onClick={()=>onSelect(row)}>Open safeguard {row.definition_id}</Button></article>)}</div>{!recommendations.length&&<p>{contextComplete?'No immediate work is established by the saved records. Open a native safeguard to review changes.':'Authorized program context is unavailable. Reopen the program to retry.'}</p>}</>;

}

function ProgramPosition({overview,rows,onSelect,onViewAll}){
  const labels={safeguards:'Safeguards in authorized active scope',notAssessed:'Not Assessed',needsAttention:'Not Implemented',partialOrUnresolved:'Partial implementation or unresolved work',verificationOrReview:'Verification, scheduled review or remaining linked work',openFindings:'Unique open Findings',openActions:'Unique open Action Items'};
  const immediateRows=rows.filter(row=>row.work?.priority_records?.some(item=>item.severity==='critical'||['critical','immediate'].includes(item.priority)));
  return <><h3>Recorded program position</h3><p>Default work order: Not Assessed, Not Implemented, partial implementation or unresolved gaps, then verification and scheduled review. Safeguard numbers break ties. Existing overdue signals are shown separately.</p>{Object.entries(labels).map(([key,label])=><p key={key}>{label}: {overview.counts[key]??'Unavailable'}</p>)}{!overview.contextComplete&&<p>Some authorized context is unavailable. These recommendations describe the records received; unavailable counts are not zero.</p>}{overview.recommendations.map(row=><section key={row.definition_id}><h3>{row.definition_id} · {row.title}</h3><p>{row.reason}</p><Button onClick={()=>onSelect(row)}>Review safeguard {row.definition_id}</Button></section>)}{!overview.recommendations.length&&<p>{overview.contextComplete?'No pending assessment or linked work is recorded in this scope. Review changes when relevant.':'Recommendations are unavailable until the program context can be loaded.'}</p>}{!!overview.resume.length&&<section><h3>Resume your review</h3>{overview.resume.map(row=><p key={row.definition_id}><Button variant="outline" onClick={()=>onSelect(row)}>Resume safeguard {row.definition_id}</Button></p>)}</section>}{!!overview.overdue.length&&<section><h3>Existing overdue signals</h3>{overview.overdue.map(item=><p key={item.definition_id}>{item.definition_id}: {item.reviewCount??'Unknown'} overdue Reviews · {item.actionCount??'Unknown'} overdue Action Items under their existing schedules.</p>)}</section>}{!!immediateRows.length&&<section><h3>Existing Critical / Immediate signals</h3><p>These labels come from the linked records. They do not override the default safeguard work order.</p>{immediateRows.map(row=><p key={row.definition_id}><Button variant="outline" onClick={()=>onSelect(row)}>Review safeguard {row.definition_id}</Button> · Linked Finding severity Critical or Action Item priority Immediate.</p>)}</section>}<Button variant="outline" onClick={onViewAll}>View all safeguards</Button></>;
}

function RecordedPosition({context,current,draft,people}){
  return <section><h3>Current saved position</h3><p>Implementation: {STATUSES[current?.status]||(current?.status==='not_applicable'?'Not Applicable':'Unknown')}</p><p>Accountable owner: {personLabel(people,current?.owner_id,'Not recorded')}</p><p>Verification: {current?.verification?.replaceAll('_',' ')||'Not recorded'}</p><p className="whitespace-pre-wrap">{current?.implementation||'No implementation narrative recorded.'}</p><p>Last Assessed (native record): {context.dates.lastAssessed||'Not recorded'}</p><p>The native assessment save does not establish a completed operational Review. Evidence verification time is not recorded in this interview context.</p>{current?.status==='not_applicable'&&<p>Recorded N/A rationale: {current.na_rationale||'Not recorded'}</p>}<p>Interview saved: {recordedDate(draft?.updated_at)||'Not recorded'} · Interview completed: {recordedDate(draft?.generated_at)||'Not recorded'}</p><p>Next scheduled Review: {context.dates.nextReview||'Not recorded'}</p><p>Open Findings: {context.signals.openFindings??'Unavailable'} · Open Action Items: {context.signals.openActions??'Unavailable'}</p><p>Overdue Reviews: {context.signals.overdueReviews??'Unavailable'} · Overdue Action Items: {context.signals.overdueActions??'Unavailable'} under the existing schedules.</p><p>Evidence uploads are historical artifacts, not verification dates. Review recorded operating activity and evidence through their native records.</p>{!draft?.revision&&context.saved?.hasPosition&&<p>This saved assessment remains valid without an Omni interview. Its original attribution and native history are retained.</p>}</section>;
}

function LinkedPosition({related,complete,onOpen,people}){
  return <section><h3>Linked records</h3>{!complete&&<p>Linked context is unavailable; missing rows are not proof that no work exists.</p>}{['findings','tasks','reviews','evidence'].map(kind=><section key={kind}><h3>{({findings:'Findings',tasks:'Action Items',reviews:'Reviews',evidence:'Evidence'})[kind]}</h3>{(related[kind]||[]).map(item=>{const id=item[({findings:'finding_id',tasks:'task_id',reviews:'review_id',evidence:'evidence_id'})[kind]],last=kind==='reviews'?item.occurrences?.filter(o=>o.completed_at).at(-1):null;return <p key={id}><Button variant="outline" disabled={!onOpen} onClick={()=>onOpen?.(kind,item)}>{kind==='evidence'?'Download ':''}{item.title||item.filename||id}</Button> · Assigned to {personLabel(people,item.assignee_id||item.owner_id||item.reviewer_id,'Not recorded')} · {item.status?.replaceAll('_',' ')||'Status not recorded'}{item.severity&&' · '+item.severity}{item.priority&&' · '+item.priority}{kind!=='evidence'&&` · Due: ${recordedDate(item.due_date)||'Not recorded'}`}{kind==='reviews'&&` · Last completed occurrence: ${recordedDate(last?.completed_at)||'Not recorded'}`}</p>;})}{complete&&!(related[kind]||[]).length&&<p>No linked {kind==='tasks'?'Action Items':kind} recorded.</p>}</section>)}</section>;
}
