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
import {brawndoWorkspacePilot} from '@/lib/brawndoWorkspacePilot';
import {focusedOmniEnabled,focusedRecommendations,nextFocusedQuestion,correctFocusedAnswer,focusedNarrative,focusedResult} from '@/lib/focusedOmni';
import {describeGuidedContext,prioritizeGuidedLifecycle,recordedDate} from '@/lib/guidedLifecycle';
import changeQuestions from '@catalogs/guidedCisChanges.json';
import {personLabel} from '@/lib/people';
import './GuidedAssessor.css';

const STATUSES={addressed:'Implemented',in_progress:'Partially Implemented',needs_attention:'Not Implemented',not_assessed:'Not Assessed'};
const EMPTY_ROWS=[];
function readPreference(key){try{return JSON.parse(localStorage.getItem(key)||'{}');}catch{return {};}}
export default function GuidedAssessor(props){
  const {user}=useAuth();
  if(props.record?.client_id&&props.record.client_id!==props.clientId||!pilotEnabled(props.clientId,props.framework,props.configuration,props.record?.definition_id))return null;
  return <Pilot key={user?.user_id+':'+props.clientId+':'+props.record?.framework_assessment_id} {...props}/>;
}
function Pilot({clientId,framework,configuration,record,rows=EMPTY_ROWS,draftSummaries={},onSelect,onViewAll,form,onApply,onDraftChange,onUpdateImplementation,disabled=false,current=record,related={},contextComplete=false,assessmentDirty=false,onOpenNative,people=EMPTY_ROWS}){
  const {user}=useAuth(),key='guided-pilot-ui:'+user?.user_id+':'+clientId,initial=readPreference(key);
  const workspacePilot=brawndoWorkspacePilot(clientId,user),GuideContent=workspacePilot?OmniWindow:DialogContent;
  const focused=focusedOmniEnabled(clientId,user,framework,configuration,record?.definition_id);
  const [incremental,setIncremental]=useState(null),[reconciled,setReconciled]=useState(''),[reconciliationConfirmed,setReconciliationConfirmed]=useState(false),[saveNotice,setSaveNotice]=useState('');
  const [reuseAnswers,setReuseAnswers]=useState(false);
  const focusedStarted=useRef(false);
  const nativeUpdate=useRef(onUpdateImplementation);nativeUpdate.current=onUpdateImplementation;
  const [mode,setMode]=useState(record&&new URLSearchParams(window.location.search).get('guided')==='pilot'?'expanded':initial.mode||'collapsed'),[greeting,setGreeting]=useState(false),[draft,setDraft]=useState(null),[answers,setAnswers]=useState({}),[step,setStep]=useState(0),[result,setResult]=useState(null),[narrative,setNarrative]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[restart,setRestart]=useState(false),[replace,setReplace]=useState(false);
  const launcher=useRef(null),heading=useRef(null),saved=useRef('{}');
  const identity=clientId+':'+record?.framework_assessment_id+':'+user?.user_id,activeIdentity=useRef(identity);activeIdentity.current=identity;
  useEffect(()=>()=>{activeIdentity.current=null;},[]);
  const [applied,setApplied]=useState(false),[contextPrompt,setContextPrompt]=useState(false);
  const [view,setView]=useState(workspacePilot?'position':'interview'),[loaded,setLoaded]=useState(!record),[changeAnswer,setChangeAnswer]=useState(''),[history,setHistory]=useState(null),[historyError,setHistoryError]=useState(''),[historyBusy,setHistoryBusy]=useState(false);
  const currentVersion=record?versionForSafeguard(record.definition_id,workspacePilot):catalogForPilot(workspacePilot).version;
  const version=draft?.version||currentVersion,updated=version!==currentVersion;
  const dirty=JSON.stringify(answers)!==saved.current||!!result&&narrative!==(draft?.narrative||result.narrative);
  const id=record?.definition_id,questions=id?visibleQuestions(id,answers,version):[],question=questions[Math.min(step,Math.max(0,questions.length-1))];
  const base=record?'/framework_assessments/'+record.framework_assessment_id+'/guided-assessment':null;
  const stateId=useId(),panelId=useId();
  const currentSignal=question&&answers[question.id]!==undefined&&(!workspacePilot||!result&&view==='interview')?(focused?focusedResult(id,answers,version):generateResult(id,answers,new Date(),version)).signals.filter(s=>s.questionId===question.id):[];
  const characterState=busy?'thinking':applied?'applied':result?result.gaps.length?'gap':result.missingRecorded||result.unknowns.length?'verification':'complete':currentSignal.some(s=>s.kind==='gap')?'gap':currentSignal.length?'verification':mode==='expanded'?'helpful':mode==='minimized'?'minimized':'idle';
  const stateText={idle:'Omni is available',helpful:'Guided review active',thinking:'Preparing the next step',gap:'Gap identified',verification:'Needs verification',complete:workspacePilot?'Interview complete':'Assessment complete',applied:'Recommendation applied',minimized:'Review minimized'}[characterState];
  const promptKey=key+':invite:'+id+':'+(current?.last_saved||current?.last_assessed||'initial')+':'+configuration?.implementation_group;
  const context=workspacePilot&&record?describeGuidedContext({record:current,draft,draftLoaded:loaded&&!!draft,workLoaded:contextComplete,historyComplete:Array.isArray(current?.assessment_history),expectedIdentity:{client_id:clientId,assessment_id:record.framework_assessment_id,user_id:user?.user_id},supportedVersions:draft&&catalogForVersion(draft.version)?[draft.version]:[],readOnly:disabled}):null;
  const overview=workspacePilot&&!record?prioritizeGuidedLifecycle(rows,{drafts:draftSummaries,contextComplete}):null;
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
    if(workspacePilot){try{if(!initial.invitationsDisabled&&!sessionStorage.getItem(key+':quiet')&&!sessionStorage.getItem(promptKey))setContextPrompt(true);}catch{/* Invitations are optional. */}return;}
    if(record){try{if(!sessionStorage.getItem(key+':'+id+':prompt'))setContextPrompt(true);}catch{setContextPrompt(true);}return;}
    const sessionKey=key+':greeted';
    try{if(!sessionStorage.getItem(sessionKey)&&!initial.dismissGreeting&&mode!=='dismissed'){setGreeting(true);sessionStorage.setItem(sessionKey,'1');}}catch{/* Greeting preferences do not store assessment answers. */}
  },[]);// eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{
    const controller=new AbortController();
    if(workspacePilot){focusedStarted.current=false;setDraft(null);setResult(null);setAnswers({});saved.current='{}';setStep(0);setNarrative('');setError('');setBusy(false);setLoaded(!base);setView('position');setHistory(null);setHistoryError('');setHistoryBusy(false);}
    if(base){api.get(base,{signal:controller.signal}).then(({data})=>{
      if(controller.signal.aborted)return;
      if(!data||!catalogForVersion(data.version)||!Number.isInteger(data.revision)||!Number.isInteger(data.step)||typeof data.completed!=='boolean')throw new Error('Saved interview could not be read. Close and reopen the assessment to retry; the assessment itself is unchanged.');
      validateAnswers(id,data.answers,data.version);
      setDraft(data);setAnswers(data.answers);saved.current=JSON.stringify(data.answers);setStep(data.step);
      if(data.completed){const output=workspacePilot?(data.result||{status:null,narrative:data.narrative||'',basis:[],gaps:[],unknowns:[],nextSteps:[],evidence:[],answers:[],missingRecorded:true}):generateResult(id,data.answers,data.generated_at?new Date(data.generated_at):new Date(),data.version);setResult(output);setNarrative(data.narrative||output.narrative);}
      setLoaded(true);
    }).catch(e=>{if(!controller.signal.aborted){setError(formatError(e));setLoaded(true);}});}
    return()=>controller.abort();
  },[base,id,clientId,user?.user_id]);// eslint-disable-line react-hooks/exhaustive-deps
  const changeMode=value=>{setMode(value);setGreeting(false);setContextPrompt(false);try{sessionStorage.setItem(workspacePilot?promptKey:key+':'+id+':prompt','1');localStorage.setItem(key,JSON.stringify({...readPreference(key),mode:value==='expanded'?'collapsed':value,...(!workspacePilot?{dismissGreeting:true}:{})}));}catch{/* Cosmetic preferences are optional. */}};
  const close=()=>changeMode('collapsed');
  async function readNewReviewBase(){
    const {data}=await api.get(base);
    if(data.revision!==draft.revision||data.current_assessment_token!==(current?.last_saved||current?.last_assessed||null)||data.current_scope_fingerprint!==draft.current_scope_fingerprint)throw new Error('The interview, assessment or scope changed. Reopen the assessment before starting a new review.');
    return data;
  }
  async function save(nextStep=step,completed=false,newAnswers=answers,fresh=false,reviewDraft=draft){
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
      const output=completed?(result||(focused?focusedResult(id,newAnswers,version):generateResult(id,newAnswers,new Date(),version))):null,generatedNarrative=completed?(result?narrative:output.narrative):'';
      const payload={version:workspacePilot&&!fresh?reviewDraft.version:currentVersion,answers:newAnswers,narrative:generatedNarrative,step:nextStep,completed,expected_revision:reviewDraft.revision};
      if(workspacePilot)Object.assign(payload,{result:output?.missingRecorded?null:output,...(fresh?{restart:true}:{}),...(fresh||reviewDraft.revision===0?{base_assessment_token:startBase.current_assessment_token,base_scope_fingerprint:startBase.current_scope_fingerprint}:{})});
      const {data}=await api.put(base,payload);if(activeIdentity.current!==savingIdentity)return false;setDraft(data);setAnswers(data.answers);saved.current=JSON.stringify(data.answers);setStep(nextStep);return data;}
    catch(e){if(activeIdentity.current===savingIdentity)setError(formatError(e));return false;}finally{if(activeIdentity.current===savingIdentity)setBusy(false);}
  }
  async function proceed(){
    const final=step>=questions.length-1,data=await save(final?step:step+1,final);
    if(data&&final){const output=workspacePilot&&data.result?data.result:generateResult(id,data.answers,data.generated_at?new Date(data.generated_at):new Date(),data.version);setResult(output);setNarrative(data.narrative||output.narrative);setReplace(false);if(workspacePilot)setView('result');}
    heading.current?.focus();
  }
  async function confirmRestart(){
    const retained=focused&&reuseAnswers&&version===currentVersion?answers:null;
    const fresh=await save(0,false,{},workspacePilot);if(!fresh)return;
    setResult(null);setNarrative('');setRestart(false);setReuseAnswers(false);setView('interview');setIncremental(null);setSaveNotice('');
    if(retained&&Object.keys(retained).length){
      const next=nextFocusedQuestion(id,retained,fresh.version);
      if(!await save(next,false,retained,false,fresh)){
        setAnswers(retained);setStep(next);
        setSaveNotice('The empty new review was saved. Retained reported answers are still unsaved; retry saving them. The prior interview remains in history.');
      }
    }
  }
  const put=(value)=>{setAnswers(p=>focused?correctFocusedAnswer(id,p,question,value,version):({...p,[question.id]:value}));setResult(null);setReplace(false);setIncremental(null);setSaveNotice('');};
  async function stageAnswer(text,expected){
    const data=await save(step,false);
    if(!data)return;
    if(!nativeUpdate.current?.(text,expected)){setError('The answer was saved, but the native implementation draft changed. Reconcile it before updating; no implementation was overwritten.');return;}
    setIncremental(null);setResult(null);setSaveNotice('Answer saved to the interview. Current implementation is an unsaved native draft. Use Save assessment to persist it; implementation and verification statuses are unchanged.');
    setStep(nextFocusedQuestion(id,data.answers,data.version));
  }
  async function saveFocusedAnswer(){
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
  return <div className={'guided-pilot '+(workspacePilot?'guided-lifecycle ':'')+(record?'guided-in-assessment':'')} data-testid="guided-pilot">
    <OmniDock preferenceKey={key} inAssessment={!!record} freePosition={workspacePilot}>
      {greeting&&<div className="guided-greeting omni-entrance"><p>Hi, I’m Omni. How can I help you today?</p><p>I can help you review safeguards, identify missing requirements, and prepare your implementation summary.</p><button onClick={()=>changeMode('collapsed')} aria-label="Dismiss Omni greeting">Dismiss</button></div>}
      {mode==='dismissed'?<Button ref={launcher} size="sm" variant="outline" onClick={()=>changeMode('collapsed')}>Show Omni</Button>:<>
      <button ref={launcher} className={'omni-launch-button '+(greeting?'omni-entrance ':'')+(mode==='minimized'?'is-minimized':'')} onClick={()=>changeMode('expanded')} aria-label="Open Omni guided assessment" aria-expanded={mode==='expanded'} aria-controls={mode==='expanded'?panelId:undefined} aria-describedby={stateId}><OmniCharacter state={characterState} approved={workspacePilot}/></button>
      {contextPrompt&&(mode==='collapsed'||focused&&mode==='minimized')&&(workspacePilot||record)&&<div className="guided-context-prompt"><p>{focused?(record?'Let’s pick up where you left off. Review the next unresolved requirement, or reported changes.':'Hi, I’m Omnibot. I’ve lined up your next steps. Click me when you’re ready.'):workspacePilot?(record?context.summary:'Review the recorded CIS program position and choose the next safeguard.'):(draft?.completed?result?.unknowns.length?`${result.unknowns.length} items still need verification`:'Your recommendation is ready':draft?.revision?'Resume your review':'Ready to review this safeguard?')}</p>{!workspacePilot&&<p>I’ll walk you through each required element, identify anything missing or uncertain, and prepare your implementation summary.</p>}<button onClick={()=>changeMode('expanded')}>Review with Omni</button><button onClick={()=>changeMode('collapsed')}>Not now</button>{workspacePilot&&<><button onClick={()=>{try{sessionStorage.setItem(key+':quiet','1');}catch{}changeMode('collapsed');}}>Quiet for this session</button><button onClick={()=>{try{localStorage.setItem(key,JSON.stringify({...readPreference(key),invitationsDisabled:true}));}catch{}changeMode('collapsed');}}>Turn off invitations</button></>}</div>}
      </>}
      <span id={stateId} className="sr-only">{stateText}</span>
    </OmniDock>
    <Dialog modal={!workspacePilot} open={mode==='expanded'} onOpenChange={open=>{if(!open)close();}}>
      {mode==='expanded'&&<GuideContent id={panelId} className="guided-panel bg-surface-card" onOpenAutoFocus={e=>{e.preventDefault();heading.current?.focus();}} onCloseAutoFocus={e=>{e.preventDefault();launcher.current?.focus();}} onPointerDownOutside={e=>e.preventDefault()} {...(workspacePilot?{onMinimize:()=>changeMode('minimized'),onClose:close,...(focused?{anchor:()=>launcher.current?.getBoundingClientRect()}:{} )}:{})}>
        <div className="omni-panel-header"><OmniCharacter state={characterState} approved={workspacePilot}/><div><DialogTitle {...(workspacePilot?{id:panelId+'-title'}:{})} ref={heading} tabIndex={-1}>{record?'Omni Guide · Safeguard '+id:'Guided Assessment with Omni'}</DialogTitle><p className="omni-state-text" role="status">{stateText}</p></div></div>
        <DialogDescription {...(workspacePilot?{id:panelId+'-description'}:{})}>{record?record.title:`CIS IG${configuration?.implementation_group||1} · CIS Controls v8.1`} · Deterministic guidance, not an independent assessment or evidence review.</DialogDescription>
        <div className="guided-panel-body">
          {error&&<p role="alert">{error}</p>}
          {focused&&saveNotice&&<p role="status">{saveNotice}</p>}
          {focused&&record&&context.lineageStale!==false&&draft?.revision>0&&<p role="alert">The interview base differs from the saved assessment or is unavailable. Compare the native record before starting a new review. Confirm relevance before reusing answers; prior conclusions remain historical.</p>}
          {focused&&record&&draft?.result?.status==='addressed'&&Object.keys(answers).length>0&&focusedResult(id,answers,version).status!=='addressed'&&<p role="alert">The prior completion recommendation is not supported by the current reported answers. Review the unresolved criteria before proposing Implemented.</p>}
          {focused&&record&&draft&&<div className="guided-actions"><Button variant="outline" disabled={busy||!!incremental} onClick={()=>{setResult(null);setStep(nextFocusedQuestion(id,answers,version));setView('interview');}}>Review or correct answers</Button><Button variant="outline" disabled={busy||!!incremental} onClick={()=>setView('changes')}>Review changes</Button><Button variant="outline" disabled={busy||!!incremental} onClick={()=>setView('linked')}>Review linked records</Button></div>}
          {focused&&current?.status==='addressed'&&Object.keys(answers).length>0&&focusedResult(id,answers,version).status!=='addressed'&&<p role="alert">Recorded answers do not support the saved Implemented status. Reassess through the native review and save workflow; no status has been changed.</p>}
          {focused&&current?.status==='addressed'&&current.verification==='gap_identified'&&<p role="alert">Saved verification identifies a gap. Review the linked records and current operation; implementation status is unchanged.</p>}
          {incremental&&<section role="group" aria-label="Reconcile implementation narrative"><h3>Reconcile Current implementation</h3><p>Retain unrelated valid details and replace resolved gaps. This proposed text reports answers; it does not verify evidence.</p><p>{incremental.proposed}</p><label>Reconciled native implementation draft<Textarea aria-label="Reconciled native implementation draft" disabled={disabled||busy} value={reconciled} maxLength={20000} onChange={e=>{setReconciled(e.target.value);setReconciliationConfirmed(false);}}/></label><label><input type="checkbox" disabled={disabled||busy} checked={reconciliationConfirmed} onChange={e=>setReconciliationConfirmed(e.target.checked)}/> I reconciled these reported answers with the existing narrative and retained unrelated valid details.</label><Button disabled={disabled||busy||!reconciliationConfirmed||!reconciled.trim()||reconciled===incremental.expected} onClick={()=>stageAnswer(reconciled,incremental.expected)}>Save answer & update implementation draft</Button><Button variant="outline" disabled={busy} onClick={()=>setIncremental(null)}>Cancel narrative update</Button></section>}
          {workspacePilot&&record&&!focused&&<><p>{context.summary}</p><div className="guided-actions">{context.actions.map(name=><Button key={name} variant="outline" disabled={busy} onClick={()=>action(name)}>{({start:'Start',resume:'Resume your review',current:'Review current position',findings:context.signals.openFindings>0?'Review findings':'Review linked records',changes:'Review changes',reassess:'Full reassessment',result:'Review recommendation'})[name]}</Button>)}</div>{assessmentDirty&&<p>Unsaved native assessment changes are present. Save or discard them in the assessment before applying a recommendation.</p>}</>}
          {updated&&<section><p>Updated assessment guidance is available. Your saved answers and narrative remain associated with their original question set.</p><Button disabled={disabled||busy} onClick={()=>setRestart(true)}>Begin a new review</Button></section>}
          {!record?focused?<FocusedProgram rows={rows} drafts={draftSummaries} contextComplete={contextComplete} onSelect={row=>{changeMode('minimized');onSelect?.(row);}}/>:workspacePilot?<ProgramPosition overview={overview} rows={rows} onSelect={row=>{close();onSelect?.(row);}} onViewAll={()=>{close();onViewAll?.();}}/>:<><p>Omni helps you see the full picture.</p>{prioritizeGuidedRows(rows.filter(r=>pilotEnabled(clientId,'cis-ig1',configuration,r.definition_id)),draftSummaries).map((r,i)=><section key={r.definition_id}><h3>{i===0?'Recommended next step':'Also needs attention'} · {r.definition_id} · {r.title}</h3><p>{draftSummaries[r.definition_id]?.completed?'Recommendation ready':draftSummaries[r.definition_id]?.revision?'Resume assessment':r.work?.overdue_reviews?'Overdue scheduled review':r.status==='not_assessed'?'Not Assessed':r.status==='addressed'?'Verification required':'Unresolved gap'}</p><Button onClick={()=>{close();onSelect(r);}}>{draftSummaries[r.definition_id]?.revision?'Resume':'Start'} safeguard {r.definition_id}</Button></section>)}<Button variant="outline" onClick={()=>{close();onViewAll?.();}}>View all safeguards</Button></>:workspacePilot&&view==='position'?<RecordedPosition context={context} current={current} draft={draft} people={people}/>:workspacePilot&&view==='linked'?<LinkedPosition related={related} complete={contextComplete} onOpen={onOpenNative} people={people}/>:workspacePilot&&view==='changes'?<><h3>Review changes · Safeguard {id}</h3><p>{changeQuestions.safeguards[id]?.prompt}</p><p>{changeQuestions.help}</p><fieldset disabled={disabled||busy}><legend>Current change report</legend>{changeQuestions.choices.map(value=><label key={value}><input type="radio" name={panelId+'-changes'} checked={changeAnswer===value} onChange={()=>setChangeAnswer(value)}/> {value}</label>)}</fieldset>{changeAnswer==='No changes reported'&&<p>No changes reported here. The saved assessment, verification, evidence, findings, actions, review schedule and approvals remain unchanged.</p>}{changeAnswer&&changeAnswer!=='No changes reported'&&<><p>{changeQuestions.safeguards[id]?.followup_prompt}</p><p>Use the native assessment or linked record to record a confirmed change, or begin a full reassessment. Previous interview answers remain historical context.</p><Button variant="outline" disabled={busy||!!incremental} onClick={()=>setView('linked')}>Review linked records</Button></>}</>:!draft?<p role="status">{loaded?'Saved interview unavailable. Reopen the assessment to retry.':'Loading saved interview…'}</p>:result&&(!workspacePilot||view==='result')?<>
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
            <fieldset disabled={disabled||busy||updated&&!workspacePilot||focused&&!!incremental}><legend>{focused&&question.id==='inventory'&&draft.answers.inventory==='No'?'Has an enterprise asset inventory been established since this was last reported?':question.prompt}</legend><p>{question.help}</p>{focused&&<p>{question.critical?'Requirement criterion: reported implementation, not evidence verification.':'Supporting context: not an additional safeguard requirement.'}</p>}
              {['text','date'].includes(question.type)?question.type==='date'?<input aria-label={question.prompt} type="date" value={answers[question.id]||''} onInput={e=>put(e.target.value)}/>:<Textarea aria-label={question.prompt} maxLength={2000} value={answers[question.id]||''} onChange={e=>put(e.target.value)}/>:question.type==='matrix'?question.rows.map(row=><label key={row}>{row}<select aria-label={row} value={answers[question.id]?.[row]||''} onChange={e=>put({...answers[question.id],[row]:e.target.value})}><option value="">Not recorded</option>{(question.row_choices?.[row]||question.choices).map(v=><option key={v} value={v}>{focused&&v==='Partially'?'Partly':v}</option>)}</select></label>):question.type==='multi'?question.choices.map(v=><label className="guided-choice" key={v}><input type="checkbox" checked={(answers[question.id]||[]).includes(v)} onChange={e=>put(e.target.checked?[...(answers[question.id]||[]),v]:(answers[question.id]||[]).filter(x=>x!==v))}/>{v}</label>):<select aria-label={question.prompt} value={answers[question.id]||''} onChange={e=>put(e.target.value)}><option value="">Not recorded</option>{question.choices.map(v=><option key={v} value={v}>{focused&&v==='Partially'?'Partly':v}</option>)}</select>}
              {(uncertain||focused)&&<label>{focused?'Supporting explanation, scope, or evidence references':'What is missing, or who can verify this?'}<Textarea aria-label="Missing elements or verification owner" maxLength={2000} value={answers[question.id+'_detail']||''} onChange={e=>{setAnswers(p=>({...p,[question.id+'_detail']:e.target.value}));setResult(null);setReplace(false);setIncremental(null);setSaveNotice('');}}/></label>}
            </fieldset>
            <div className="guided-actions">{focused&&<Button disabled={disabled||busy||!onUpdateImplementation||answers[question.id]===undefined} onClick={saveFocusedAnswer}>Save answer & update implementation draft</Button>}<Button variant="outline" disabled={busy||step===0||focused&&!!incremental} onClick={()=>{setStep(n=>n-1);heading.current?.focus();}}>Back</Button><Button disabled={disabled||busy||updated&&!workspacePilot||focused&&!!incremental} onClick={proceed}>{step>=questions.length-1?'Generate review':focused?'Save interview answer & continue':'Continue'}</Button></div>
          </>:null}
          {record&&draft&&(!workspacePilot||['interview','result'].includes(view))&&<div className="guided-actions"><Button variant="outline" disabled={disabled||busy||updated&&!workspacePilot||focused&&!!incremental} onClick={async()=>{if(await save(step,!!result))close();}}>Save and exit</Button><Button variant="ghost" disabled={disabled||busy} onClick={()=>setRestart(true)}>{workspacePilot?'Start a new review':'Restart assessment'}</Button></div>}
          {restart&&<section role="group" aria-label="Confirm restart"><p>{workspacePilot?'A new interview begins from the current saved assessment. The previous saved interview is preserved in interview history. Unsaved interview edits will be discarded.':'Restart replaces this saved interview only. The assessment and its history remain unchanged.'}</p>{focused&&version===currentVersion&&Object.keys(answers).length>0&&<label><input type="checkbox" checked={reuseAnswers} onChange={e=>setReuseAnswers(e.target.checked)}/> I confirmed these answers remain current; reuse them in the new review. Prior conclusions will not be carried forward.</label>}<Button disabled={disabled||busy} onClick={confirmRestart}>Confirm restart</Button><Button variant="outline" onClick={()=>{setRestart(false);setReuseAnswers(false);}}>Cancel restart</Button></section>}
          {workspacePilot&&record&&<section><Button variant="outline" disabled={historyBusy} onClick={()=>loadHistory()}>Review interview history</Button>{historyError&&<p role="alert">{historyError}</p>}{history&&<><p>Saved interview snapshots for your account. Earlier records may lack lineage or structured output; no retention policy was changed.</p>{history.records.map(item=><details key={item.revision}><summary>Revision {item.revision} · {item.version} · {item.completed?'Completed interview':'Interview checkpoint'} · {item.updated_at||'Time not recorded'}</summary><p>Recorded by {personLabel([...people,user],item.user_id,'Attribution not recorded')}</p><p>{item.narrative||'No narrative recorded.'}</p><pre>{JSON.stringify(item.answers,null,2)}</pre>{item.result&&<p>Recorded recommendation: {STATUSES[item.result.status]}</p>}</details>)}{!history.records.length&&<p>No available archived interview snapshots. This does not establish that no older interview ever existed.</p>}{history.next_before_revision&&<Button variant="outline" disabled={historyBusy} onClick={()=>loadHistory(true)}>Load earlier interviews</Button>}</>}</section>}
          <p>Question set: {version}. Answers are not evidence verification or a compliance opinion.</p>
          {workspacePilot&&initial.invitationsDisabled&&<Button variant="ghost" onClick={()=>{try{localStorage.setItem(key,JSON.stringify({...readPreference(key),invitationsDisabled:false}));}catch{}setContextPrompt(false);}}>Enable contextual invitations</Button>}
        </div>
        {!workspacePilot&&<div className="guided-actions"><Button variant="outline" onClick={()=>changeMode('minimized')}>Minimize</Button><Button variant="ghost" onClick={()=>changeMode('dismissed')}>Dismiss assistant</Button></div>}
      </GuideContent>}
    </Dialog>
  </div>;
}

function FocusedProgram({rows,drafts,contextComplete,onSelect}){
  const recommendations=focusedRecommendations(rows,drafts,contextComplete);
  return <><p>A practical way forward</p><h3>Omni’s recommended next steps</h3>{recommendations.map(row=><section key={row.definition_id}><h4>{row.definition_id==='1.1'?'Establish or resolve the enterprise inventory position':'Review weekly unauthorized-asset handling'}</h4><p>{row.reason}</p><Button onClick={()=>onSelect(row)}>{drafts[row.definition_id]?.revision?'Resume':'Open'} safeguard {row.definition_id}</Button></section>)}{!recommendations.length&&<p>No immediate work is established by the available records. Open the native safeguard to review changes when relevant.</p>}</>;
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
