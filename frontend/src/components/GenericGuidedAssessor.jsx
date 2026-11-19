import {useEffect,useRef,useState} from 'react';
import api,{formatError} from '@/lib/api';
import {genericGuidedCatalog,genericGuidedResult,genericGuidedVersion,genericQuestions} from '@/lib/genericGuidedAssessment';
import {operatorStatuses} from '@/lib/frameworkOperator';
import {Button} from './ui/button';
import {Textarea} from './ui/textarea';
import OmniDock from './OmniDock';
import OmniWindow from './OmniWindow';
import OmniGuideCharacter from './OmniGuideCharacter';

export default function GenericGuidedAssessor({record,disabled,onApply,onDraftChange}){
  const [draft,setDraft]=useState(null),[answers,setAnswers]=useState({}),[step,setStep]=useState(0);
  const [open,setOpen]=useState(false),[review,setReview]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [intro,setIntro]=useState(true),launcher=useRef(null);
  const panelId='r4-assessment-guide-'+record.framework_assessment_id;
  const start=()=>{setOpen(true);setIntro(false);};
  const base='/framework_assessments/'+record.framework_assessment_id+'/guided-assessment';
  useEffect(()=>{
    let active=true;
    api.get(base).then(({data})=>{if(active){setDraft(data);setAnswers(data.answers);setStep(data.step||0);}}).catch(error=>{if(active)setError(formatError(error));});
    return()=>{active=false;onDraftChange?.(false);};
  },[base,onDraftChange]);
  const questions=genericQuestions(answers),question=questions[Math.min(step,questions.length-1)],version=draft?.version||genericGuidedVersion(record.framework_key);
  const change=value=>{setAnswers({...answers,[question.id]:value});setReview(null);onDraftChange?.(true);};
  async function checkpoint(result=null,restart=false){
    setBusy(true);setError('');
    try{
      const body={version:restart?genericGuidedVersion(record.framework_key):version,answers:restart?{}:answers,step:restart?0:step,
        completed:!!result,narrative:result?.narrative||'',expected_revision:draft.revision,
        base_assessment_token:restart?draft.current_assessment_token:draft.base_assessment_token,
        base_scope_fingerprint:restart?draft.current_scope_fingerprint:draft.base_scope_fingerprint,
        ...(restart?{restart:true}:{}),...(result?{result}:{})};
      const {data}=await api.put(base,body);setDraft(data);onDraftChange?.(false);
      if(restart){setAnswers({});setStep(0);setReview(null);}
      return data;
    }catch(error){setError(formatError(error));return null;}finally{setBusy(false);}
  }
  function next(){
    if(question.required&&!answers[question.id]?.trim()){setError('Record this answer before continuing.');return;}
    setError('');setStep(value=>Math.min(value+1,questions.length-1));
  }
  async function prepare(){
    try{const result=genericGuidedResult(record.definition_id,answers,version);if(await checkpoint(result))setReview(result);}
    catch(error){setError(formatError(error));}
  }
  async function apply(){
    const saved=await checkpoint(review);if(!saved)return;
    onApply({implementation:review.narrative,status:review.status,guided_assessment_source:{version:saved.version,revision:saved.revision,generated_at:saved.generated_at}});
    setReview(null);setOpen(false);
  }
  return <section className="r4-guided-assessment guided-pilot brawndo-cis-visual-omni" aria-label="Guided assessment">
    <div className="r4-guided-heading"><div><h3>Guided assessment</h3><p>{genericGuidedCatalog.qualification}</p></div><Button variant="outline" disabled={disabled||!draft} onClick={()=>open?setOpen(false):start()}>{open?'Minimize guide':draft?.revision?'Resume guide':'Start guided assessment'}</Button></div>
    {error&&<p role="alert">{error}</p>}
    <OmniDock preferenceKey={'r4-assessment-guide:'+record.client_id+':'+record.framework_key} inAssessment freePosition visualReference focused name="Omnibot">
      <button ref={launcher} type="button" className="omni-launch-button" aria-label="Open Omnibot guided assessment" aria-expanded={open} disabled={disabled||!draft} onClick={start}><OmniGuideCharacter/></button>
      {!open&&intro&&<div className="guided-context-prompt" role="complementary" aria-label="Omnibot invitation"><button type="button" className="r4-guide-dismiss" aria-label="Dismiss Omnibot introduction" onClick={()=>setIntro(false)}>×</button><b>Hi, I’m Omnibot.</b><p>I can help you review the actual practice, record anything uncertain and prepare an implementation draft.</p><Button disabled={disabled||!draft} onClick={start}>Start guided assessment</Button><Button variant="outline" onClick={()=>setIntro(false)}>Not now</Button></div>}
    </OmniDock>
    {open&&draft&&<OmniWindow id={panelId} name="Omnibot" refined program anchor={()=>launcher.current?.getBoundingClientRect()} onMinimize={()=>setOpen(false)} onClose={()=>setOpen(false)} onCloseAutoFocus={()=>launcher.current?.focus({preventScroll:true})}>
      <header className="omni-panel-header" tabIndex={0}><OmniGuideCharacter/><div><h2 id={panelId+'-title'}>Omnibot · {record.display_definition_id||record.definition_id}</h2><p id={panelId+'-description'}>One question at a time. Reported answers do not independently verify implementation.</p></div></header>
      <div className="guided-panel-body">
      {draft.lineage_stale&&<div role="alert"><p>The saved assessment or scope changed after this interview began. Your checkpoint remains retained.</p><Button disabled={busy||disabled} onClick={()=>checkpoint(null,true)}>Begin a new review</Button></div>}
      {review?<div><h4>Review implementation draft</h4><p>Suggested status: {operatorStatuses(record.framework_key)[review.status]}. Applicability and verification remain separate native decisions.</p><Textarea aria-label="Review implementation draft" value={review.narrative} maxLength={20000} onChange={event=>{setReview({...review,narrative:event.target.value});onDraftChange?.(true);}}/><div className="r4-guided-actions"><Button variant="outline" onClick={()=>setReview(null)}>Back to answers</Button><Button disabled={disabled||busy||draft.lineage_stale} onClick={apply}>Apply draft</Button></div><p>Apply stages this proposal. Save assessment commits it.</p></div>:<div>
        <p className="r4-guide-step">Question {Math.min(step+1,questions.length)} of {questions.length}</p><fieldset disabled={disabled||busy}><legend>{question.prompt}</legend>
          {question.type==='select'?<div className="r4-guide-options">{question.choices.map(choice=><label key={choice}><input type="radio" name={'r4-guide-'+question.id} checked={answers[question.id]===choice} onChange={()=>change(choice)}/>{choice}</label>)}</div>:<Textarea aria-label={question.prompt} value={answers[question.id]||''} maxLength={2000} onChange={event=>change(event.target.value)}/>}</fieldset>
        <div className="r4-guided-actions"><Button variant="ghost" disabled={busy||step===0} onClick={()=>setStep(value=>value-1)}>Previous</Button><Button variant="outline" disabled={disabled||busy} onClick={()=>checkpoint()}>Save progress</Button>{step<questions.length-1?<Button disabled={disabled||busy} onClick={next}>Next</Button>:<Button disabled={disabled||busy||draft.lineage_stale} onClick={prepare}>Review implementation</Button>}</div>
      </div>}
      </div>
    </OmniWindow>}
  </section>;
}
