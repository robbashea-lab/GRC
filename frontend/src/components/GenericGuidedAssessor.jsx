import {useCallback,useEffect,useRef,useState} from 'react';
import {formatError} from '@/lib/api';
import {useAssessmentApi} from '@/lib/assessmentCommandScope';
import {useAuth} from '@/context/AuthContext';
import {genericGuidedCatalog,genericGuidedResult,genericGuidedVersion,genericQuestions,validateGenericCompletion} from '@/lib/genericGuidedAssessment';
import {operatorStatuses} from '@/lib/frameworkOperator';
import {Button} from './ui/button';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './ui/dialog';
import {Textarea} from './ui/textarea';
import OmniDock from './OmniDock';
import OmniWindow from './OmniWindow';
import OmniGuideCharacter from './OmniGuideCharacter';
import AssessmentQuestionGuidance from './AssessmentQuestionGuidance';

export default function GenericGuidedAssessor({record,form=record,assessmentDirty=false,disabled,onUpdateImplementation,onDraftChange,inline=false,onInlineOpenChange,historyScope,interviewHistoryOpen=false,onInterviewHistoryOpenChange,onInterviewHistoryCloseAutoFocus,pilotPortalContainer}){
  const api=useAssessmentApi();
  const {user,workspaceMode}=useAuth();
  const native=useRef(null),reviewedImplementation=useRef(null),mounted=useRef(true);
  native.current={form,assessmentDirty,disabled};
  const [draft,setDraft]=useState(null),[answers,setAnswers]=useState({}),[step,setStep]=useState(0);
  const [open,setOpen]=useState(false),[review,setReview]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [intro,setIntro]=useState(true),launcher=useRef(null),questionHeading=useRef(null);
  const [responses,setResponses]=useState(false),previouslyOpen=useRef(false);
  const view=review?'implementation':responses?'responses':'question';
  const historyIdentity=JSON.stringify([workspaceMode,user?.workspace_mode,user?.user_id,user?.role,user?.status,user?.updated_at,
    user?.client_ids,user?.all_clients,record.client_id,record.framework_key,record.framework_assessment_id]);
  const historyOwner=useRef(null),historyRequest=useRef(0),historyReading=useRef(null),historyHeading=useRef(null);
  if(historyOwner.current?.identity!==historyIdentity||historyOwner.current?.parent!==historyScope)
    historyOwner.current={identity:historyIdentity,parent:historyScope,actorId:user?.user_id,clientId:record.client_id,assessmentId:record.framework_assessment_id};
  const historyContext=historyOwner.current,historyVisible=useRef(false);
  const historyIdentityValid=[historyContext.actorId,historyContext.clientId,historyContext.assessmentId].every(value=>typeof value==='string'&&!!value.trim());
  historyVisible.current=interviewHistoryOpen===true&&historyIdentityValid;
  const [history,setHistory]=useState(null),historySnapshot=useRef(null);historySnapshot.current=history;
  useEffect(()=>{if(inline)onInlineOpenChange?.(open);},[inline,open,onInlineOpenChange]);
  useEffect(()=>()=>{if(inline)onInlineOpenChange?.(false);},[inline,onInlineOpenChange]);
  useEffect(()=>{if(inline&&open)questionHeading.current?.focus({preventScroll:true});},[inline,open,step,view]);
  useEffect(()=>{
    if(inline&&previouslyOpen.current&&!open)launcher.current?.focus({preventScroll:true});
    previouslyOpen.current=open;
  },[inline,open]);
  const panelId='r4-assessment-guide-'+record.framework_assessment_id;
  const start=()=>{setOpen(true);setIntro(false);};
  const base='/framework_assessments/'+record.framework_assessment_id+'/guided-assessment';
  const initialRead=useRef(null);
  useEffect(()=>{
    const owner={initialized:false};initialRead.current=owner;mounted.current=true;
    return()=>{if(initialRead.current===owner)initialRead.current=null;mounted.current=false;onDraftChange?.(false);};
  },[base,onDraftChange]);
  useEffect(()=>{
    const owner=initialRead.current;if(!owner||owner.initialized)return;
    const controller=new AbortController();
    api.get(base,{signal:controller.signal}).then(({data})=>{
      if(controller.signal.aborted||initialRead.current!==owner||owner.initialized)return;
      setDraft(data);setAnswers(data.answers);setStep(data.step||0);setResponses(data.completed===true);owner.initialized=true;setError('');
    }).catch(error=>{if(!controller.signal.aborted&&initialRead.current===owner&&!owner.initialized)setError(formatError(error));});
    return()=>controller.abort();
  },[api,base,onDraftChange]);
  const cancelHistoryRead=useCallback(scope=>{
    const reading=historyReading.current;
    if(reading?.scope!==scope)return;
    historyRequest.current++;reading.controller.abort();historyReading.current=null;
  },[]);
  useEffect(()=>{
    historyOwner.current=historyContext;
    return()=>{cancelHistoryRead(historyContext);if(historyOwner.current===historyContext)historyOwner.current=null;};
  },[historyContext,cancelHistoryRead]);
  const loadHistory=useCallback(async(append=false)=>{
    const scope=historyContext,previous=historySnapshot.current?.scope===scope?historySnapshot.current:null;
    if(historyOwner.current!==scope||!historyVisible.current||historyReading.current?.scope===scope
      ||append&&(!previous?.loaded||!previous.has_more||!previous.next_before_revision))return;
    const request=++historyRequest.current,controller=new AbortController();
    historyReading.current?.controller.abort();historyReading.current={scope,controller};
    const retained=append?previous:null;
    const loading={scope,records:retained?.records||[],loaded:!!retained?.loaded,has_more:!!retained?.has_more,
      next_before_revision:retained?.next_before_revision??null,busy:true,error:'',append};
    historySnapshot.current=loading;setHistory(loading);
    const current=()=>historyOwner.current===scope&&historyRequest.current===request&&historyVisible.current;
    try{
      const {data}=await api.get(base+'/history',{signal:controller.signal,params:{limit:25,...(append?{before_revision:previous.next_before_revision}:{})}});
      if(!current())return;
      if(!Array.isArray(data?.items)||typeof data.has_more!=='boolean'
        ||data.items.some(item=>item?.client_id!==scope.clientId||item?.assessment_id!==scope.assessmentId||item?.user_id!==scope.actorId)
        ||data.has_more&&(!Number.isInteger(data.next_before_revision)||data.next_before_revision<1))
        throw new Error('Interview history could not be verified for this account and assessment.');
      const next={...loading,records:[...(retained?.records||[]),...data.items],loaded:true,has_more:data.has_more,
        next_before_revision:data.next_before_revision??null,busy:false};
      historySnapshot.current=next;setHistory(next);
    }catch(error){
      if(current()){const next={...loading,busy:false,error:formatError(error)};historySnapshot.current=next;setHistory(next);}
    }finally{if(current())historyReading.current=null;}
  },[api,base,historyContext]);
  useEffect(()=>{
    if(!interviewHistoryOpen||!historyIdentityValid)return;
    loadHistory();return()=>cancelHistoryRead(historyContext);
  },[interviewHistoryOpen,historyIdentityValid,historyContext,loadHistory,cancelHistoryRead]);
  const questions=genericQuestions(answers),question=questions[Math.min(step,questions.length-1)],version=draft?.version||genericGuidedVersion(record.framework_key);
  const change=value=>{setAnswers({...answers,[question.id]:value});setReview(null);setResponses(false);onDraftChange?.(true);};
  async function checkpoint(result=null,restart=false){
    setBusy(true);setError('');
    try{
      const body={version:restart?genericGuidedVersion(record.framework_key):version,answers:restart?{}:answers,step:restart?0:step,
        completed:!!result,narrative:result?.narrative||'',expected_revision:draft.revision,
        base_assessment_token:restart?draft.current_assessment_token:draft.base_assessment_token,
        base_scope_fingerprint:restart?draft.current_scope_fingerprint:draft.base_scope_fingerprint,
        ...(restart?{restart:true}:{}),...(result?{result}:{})};
      const {data}=await api.put(base,body);if(!mounted.current)return null;setDraft(data);onDraftChange?.(false);
      if(restart){setAnswers({});setStep(0);setReview(null);setResponses(false);}
      return data;
    }catch(error){if(mounted.current)setError(formatError(error));return null;}finally{if(mounted.current)setBusy(false);}
  }
  function next(){
    if(question.required&&!answers[question.id]?.trim()){setError('Record this answer before continuing.');return;}
    setError('');setStep(value=>Math.min(value+1,questions.length-1));
  }
  function reviewResponses(){
    try{validateGenericCompletion(record.definition_id,answers,version);setError('');setResponses(true);}
    catch(error){setError(formatError(error));}
  }
  function editResponse(index){setStep(index);setResponses(false);setReview(null);}
  async function prepare(){
    try{const result=genericGuidedResult(record.definition_id,answers,version);if(await checkpoint(result)){reviewedImplementation.current={text:form.implementation||'',form:JSON.stringify(form)};setReview(result);}}
    catch(error){setError(formatError(error));}
  }
  async function apply(){
    if(disabled||busy||assessmentDirty||!reviewedImplementation.current||!onUpdateImplementation)return;
    const expected=reviewedImplementation.current,update=onUpdateImplementation;
    const saved=await checkpoint(review);if(!saved)return;
    if(native.current.disabled||native.current.assessmentDirty||JSON.stringify(native.current.form)!==expected.form
      ||!update(saved.narrative,expected.text,{...saved,client_id:record.client_id,
        assessment_id:record.framework_assessment_id,actor_id:user.user_id})){
      setError('The native assessment changed. Your interview is retained; review it before applying.');return;
    }
    setReview(null);setResponses(false);setOpen(false);
  }
  const visibleHistory=history?.scope===historyContext?history:null,historyStatusLabels=operatorStatuses(record.framework_key);
  const historyDialog=<Dialog open={interviewHistoryOpen===true&&historyIdentityValid} onOpenChange={onInterviewHistoryOpenChange}>
    <DialogContent aria-modal="true" portalContainer={pilotPortalContainer||undefined} overlayClassName="brawndo-assessment-pilot brawndo-pilot-child-overlay gn-dialog-layer" showCloseButton={false}
      className="brawndo-assessment-pilot brawndo-pilot-child-dialog brawndo-pilot-history gn-dialog-box gn-wording-box"
      onOpenAutoFocus={event=>{event.preventDefault();historyHeading.current?.focus({preventScroll:true});}}
      onCloseAutoFocus={event=>{if(historyOwner.current!==historyContext){event.preventDefault();return;}onInterviewHistoryCloseAutoFocus?.(event);if(!event.defaultPrevented){event.preventDefault();(open?questionHeading.current:launcher.current)?.focus({preventScroll:true});}}}
      onEscapeKeyDown={event=>event.stopPropagation()} onPointerDownOutside={event=>event.preventDefault()}>
      <DialogTitle ref={historyHeading} tabIndex={-1} className="gn-dialog-title">Interview history</DialogTitle>
      <DialogDescription className="sr-only">Saved personal interview history for this assessment.</DialogDescription>
      {(!visibleHistory||visibleHistory.busy)&&<p role="status">Loading interview history…</p>}
      {visibleHistory?.error&&<><p role="alert">{visibleHistory.error}</p><Button className="gn-button gn-quiet" variant="outline" disabled={visibleHistory.busy} onClick={()=>loadHistory(visibleHistory.append)}>Retry</Button></>}
      {visibleHistory?.loaded&&<>
        <p>Saved interview snapshots for your account. Earlier records may lack lineage or structured output; no retention policy was changed.</p>
        {visibleHistory.records.map(item=><details key={item.revision}><summary>Revision {item.revision} · {item.version} · {item.completed?'Completed interview':'Interview checkpoint'} · {item.updated_at||'Time not recorded'}</summary>
          <p className="whitespace-pre-wrap">{item.narrative||'No narrative recorded.'}</p><pre>{JSON.stringify(item.answers,null,2)}</pre>{typeof item.result?.status==='string'&&<p>Recorded recommendation: {Object.hasOwn(historyStatusLabels,item.result.status)?historyStatusLabels[item.result.status]:item.result.status}</p>}
        </details>)}
        {!visibleHistory.records.length&&<p>No available archived interview snapshots. This does not establish that no older interview ever existed.</p>}
        {visibleHistory.has_more&&<Button className="gn-button gn-quiet" variant="outline" disabled={visibleHistory.busy} onClick={()=>loadHistory(true)}>Load earlier interviews</Button>}
      </>}
      <div className="gn-dialog-actions"><Button className="gn-button" variant="outline" onClick={()=>onInterviewHistoryOpenChange?.(false)}>Close</Button></div>
    </DialogContent>
  </Dialog>;
  const buttonClass=inline?'gn-button':undefined;
  const content=<>
    {draft?.lineage_stale&&<div role="alert"><p>The saved assessment or scope changed after this interview began. Your checkpoint remains retained.</p><Button disabled={busy||disabled} onClick={()=>checkpoint(null,true)}>Begin a new review</Button></div>}
    {review?<div>
      <h3 ref={questionHeading} tabIndex={-1} className={inline?'gn-question':undefined}>Review implementation draft</h3>
      <p>Suggested status: {operatorStatuses(record.framework_key)[review.status]}. Applicability and verification remain separate native decisions.</p>
      <Textarea aria-label="Review implementation draft" value={review.narrative} maxLength={20000} onChange={event=>{setReview({...review,narrative:event.target.value});onDraftChange?.(true);}}/>
      <div className={inline?'guided-actions gn-question-actions':'r4-guided-actions'}>
        <Button className={buttonClass} variant="outline" disabled={busy} onClick={()=>{setReview(null);setResponses(true);}}>Edit responses</Button>
        <Button className={inline?'gn-button gn-primary':undefined} disabled={disabled||busy||draft?.lineage_stale} onClick={apply}>Apply draft</Button>
      </div>
      <p>Apply stages Current implementation and proposed Items. Save assessment commits them; status and verification remain unchanged.</p>
    </div>:responses?<section aria-label="Review responses">
      <h3 ref={questionHeading} tabIndex={-1} className={inline?'gn-question':undefined}>Review responses</h3>
      <ol className={inline?'cis-answer-review gn-review-list':'cis-answer-review'}>
        {questions.map((item,index)=><li key={item.id}><strong>{item.prompt}</strong><p className={inline?'gn-review-answer':undefined}>{answers[item.id]||'Not recorded'}</p><Button className={inline?'gn-button gn-quiet':undefined} variant="outline" aria-label={`Edit response ${index+1}`} disabled={disabled||busy} onClick={()=>editResponse(index)}>Edit response</Button></li>)}
      </ol>
      <div className={inline?'guided-actions gn-question-actions':'r4-guided-actions'}>
        <Button className={buttonClass} variant="outline" disabled={busy} onClick={()=>editResponse(0)}>Edit responses</Button>
        <Button className={buttonClass} variant="outline" disabled={disabled||busy} onClick={()=>checkpoint()}>Save progress</Button>
        <Button className={inline?'gn-button gn-primary':undefined} disabled={disabled||busy||draft?.lineage_stale} onClick={prepare}>Review implementation</Button>
      </div>
    </section>:<section className={inline?'cis-sequential-interview gn-question-area':undefined} aria-label="Guided assessment questions">
      <p className={inline?'gn-question-meta':'r4-guide-step'}>Question {Math.min(step+1,questions.length)} of {questions.length}</p>
      <fieldset disabled={disabled||busy}><legend ref={questionHeading} tabIndex={-1} className={inline?'gn-question':undefined}>{question.prompt}</legend><AssessmentQuestionGuidance/>
        {question.type==='select'?<div className={inline?'gn-choices':'r4-guide-options'}>{question.choices.map(choice=><label key={choice}><input type="radio" name={'r4-guide-'+question.id} checked={answers[question.id]===choice} onChange={()=>change(choice)}/>{choice}</label>)}</div>:<Textarea aria-label={question.prompt} value={answers[question.id]||''} maxLength={2000} onChange={event=>change(event.target.value)}/>}</fieldset>
      <div className={inline?'guided-actions gn-question-actions':'r4-guided-actions'}>
        <Button className={buttonClass} variant={inline?'outline':'ghost'} disabled={busy||step===0} onClick={()=>setStep(value=>value-1)}>{inline?'Back':'Previous'}</Button>
        <Button className={buttonClass} variant="outline" disabled={disabled||busy} onClick={()=>checkpoint()}>Save progress</Button>
        {step<questions.length-1?<Button className={inline?'gn-button gn-primary':undefined} disabled={disabled||busy} onClick={next}>{inline?'Continue':'Next'}</Button>:<Button className={inline?'gn-button gn-primary':undefined} disabled={disabled||busy||draft?.lineage_stale} onClick={reviewResponses}>Review responses</Button>}
      </div>
    </section>}
  </>;
  if(inline)return <div className="guided-pilot guided-lifecycle omni-refined assessment-interview" data-testid="generic-guided-assessment">
    <div className="gn-guide">
      <header className="gn-guide-head"><h3>Guided assessment</h3>{open&&<Button className="gn-button gn-quiet" variant="outline" disabled={busy} onClick={()=>setOpen(false)}>Pause &amp; return</Button>}</header>
      {error&&<p role="alert">{error}</p>}
      <div className="cis-guided-launch gn-start" hidden={open}>
        <p>{genericGuidedCatalog.qualification}</p>
        <Button ref={launcher} className="gn-button gn-primary" disabled={disabled||busy||!draft} aria-expanded={open} aria-controls={panelId} onClick={start}>{draft?.revision?'Resume guided assessment':'Begin guided assessment'}</Button>
      </div>
      <section id={panelId} className="assessment-inline-interview" hidden={!open} aria-label="Framework assessment interview">{draft&&content}</section>
      <p className="gn-guide-note">Answers stay in this draft as you move between questions. Save progress keeps the interview; it does not save the assessment. Unsaved edits do not survive reload.</p>
    </div>
    {historyDialog}
  </div>;
  return <section className="r4-guided-assessment guided-pilot brawndo-cis-visual-omni" aria-label="Guided assessment">
    <div className="r4-guided-heading"><div><h3>Guided assessment</h3><p>{genericGuidedCatalog.qualification}</p></div><Button variant="outline" disabled={disabled||!draft} onClick={()=>open?setOpen(false):start()}>{open?'Minimize guide':draft?.revision?'Resume guide':'Start guided assessment'}</Button></div>
    {error&&<p role="alert">{error}</p>}
    <OmniDock preferenceKey={'r4-assessment-guide:'+record.client_id+':'+record.framework_key} inAssessment freePosition visualReference focused name="Omnibot">
      <button ref={launcher} type="button" className="omni-launch-button" aria-label="Open Omnibot guided assessment" aria-expanded={open} disabled={disabled||!draft} onClick={start}><OmniGuideCharacter/></button>
      {!open&&intro&&<div className="guided-context-prompt" role="complementary" aria-label="Omnibot invitation"><button type="button" className="r4-guide-dismiss" aria-label="Dismiss Omnibot introduction" onClick={()=>setIntro(false)}>×</button><b>Hi, I’m Omnibot.</b><p>I can help you review the actual practice, record anything uncertain and prepare an implementation draft.</p><Button disabled={disabled||!draft} onClick={start}>Start guided assessment</Button><Button variant="outline" onClick={()=>setIntro(false)}>Not now</Button></div>}
    </OmniDock>
    {open&&draft&&<OmniWindow id={panelId} name="Omnibot" refined program anchor={()=>launcher.current?.getBoundingClientRect()} onMinimize={()=>setOpen(false)} onClose={()=>setOpen(false)} onCloseAutoFocus={()=>launcher.current?.focus({preventScroll:true})}>
      <header className="omni-panel-header" tabIndex={0}><OmniGuideCharacter/><div><h2 id={panelId+'-title'}>Omnibot · {record.display_definition_id||record.definition_id}</h2><p id={panelId+'-description'}>One question at a time. Reported answers do not independently verify implementation.</p></div></header>
      <div className="guided-panel-body">{content}</div>
    </OmniWindow>}
    {historyDialog}
  </section>;
}
