import {useEffect,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,Asterisk} from 'lucide-react';
import {Button} from './ui/button';
import {Textarea} from './ui/textarea';
import {assessmentQuestionPresentation} from '@/lib/assessmentRolloutPresentation';
import {socUsesReportedWorkStatus} from '@/lib/socGuidedAssessment';
import AssessmentQuestionGuidance from './AssessmentQuestionGuidance';
import AssessmentToolField from './AssessmentToolField';
import './CisSequentialInterview.css';

// Question navigation is local; the controller retains SOC's native group checkpoint.
export default function SocSequentialInterview({groups,extras,answers,step,setStep,put,blocked,busy,onNext,onPause,onSaveClose,onSaveProgress,id,version,assessmentRollout=false,guideOpen=false}){
  const [questionId,setQuestionId]=useState(null),[review,setReview]=useState(false),heading=useRef(null);
  const entries=groups.flatMap((group,groupIndex)=>group.questions.map(question=>({question,groupIndex})));
  entries.push(...extras.map(question=>({question,groupIndex:groups.length-1,extra:true})));
  const index=entries.findIndex(entry=>entry.question.id===questionId&&entry.groupIndex===step);
  const current=index<0?entries.findIndex(entry=>entry.groupIndex===step):index;
  const entry=entries[current],question=entry?.question;
  useEffect(()=>{heading.current?.focus({preventScroll:true});},[question?.id,review]);
  useEffect(()=>{if(assessmentRollout&&guideOpen)heading.current?.focus({preventScroll:true});},[assessmentRollout,guideOpen]);
  if(!question)return <p>No questions are available for this saved question set.</p>;
  const presentation=assessmentRollout?assessmentQuestionPresentation('soc-2',id,question.id,{version,module:'criterion'}):null;
  const buttonClass=assessmentRollout?'gn-button':undefined;
  const saveProgress=assessmentRollout?onSaveProgress:onSaveClose;
  const saveLabel=assessmentRollout?'Save progress':'Save & close';
  const move=offset=>{const next=entries[offset];setReview(false);setQuestionId(next.question.id);setStep(next.groupIndex);};
  const continueQuestion=()=>{
    if(current===entries.length-1){setReview(true);return;}
    if(entries[current+1].groupIndex===step)move(current+1);
    else onNext();
  };
  return <section className={'cis-sequential-interview'+(assessmentRollout?' gn-question-area':'')} aria-label="Guided assessment questions">
    {assessmentRollout?<>
      <div className="gn-question-meta"><span>{review?'Guided assessment':`Question ${current+1} of ${entries.length}`}</span>{!review&&!entry.extra&&question.type!=='text'&&<span className="gn-required"><Asterisk size={16} aria-hidden="true"/>Required answer</span>}</div>
      {review?<h3 ref={heading} tabIndex={-1} className="gn-question">Review responses</h3>:<div className="gn-progress" role="progressbar" aria-label="Question position" aria-valuemin={0} aria-valuemax={entries.length} aria-valuenow={current+1}><span style={{width:`${(current+1)/entries.length*100}%`}}/></div>}
    </>:<>
      <header><h3 ref={heading} tabIndex={-1}>{review?'Review your answers':`Question ${current+1} of ${entries.length}`}</h3><Button variant="outline" disabled={busy} onClick={onPause}>Pause &amp; return</Button></header>
      {!review&&<p className="text-xs text-ink-secondary">{groups[step].title}</p>}
      <p className="text-xs text-ink-secondary">Moving between questions keeps answers in this draft. Continuing past a native question group or Save &amp; close saves interview progress; it does not save the assessment. Pause retains unsaved work here; unsaved edits do not survive reload.</p>
    </>}
    {review?<><ol className={'cis-answer-review'+(assessmentRollout?' gn-review-list':'')}>{entries.map(({question:item},offset)=><li key={item.id}><strong>{item.prompt}</strong><p className={assessmentRollout?'gn-review-answer':undefined}>{answers[item.id]||'Not recorded'}</p>{answers[item.id+'_detail']&&<p>{answers[item.id+'_detail']}</p>}{item.help&&<p className="omni-help">{item.help}</p>}<Button className={assessmentRollout?'gn-button gn-quiet':undefined} aria-label={assessmentRollout?`Edit response ${offset+1}`:undefined} variant="outline" disabled={busy} onClick={()=>move(offset)}>{assessmentRollout?'Edit response':`Edit answer ${offset+1}`}</Button></li>)}</ol><div className={'guided-actions'+(assessmentRollout?' gn-question-actions':'')}><Button className={buttonClass} variant="outline" disabled={busy} onClick={()=>setReview(false)}>{assessmentRollout?'Edit responses':'Back'}</Button>{assessmentRollout?<><Button className="gn-button" variant="outline" disabled={blocked||!saveProgress} onClick={saveProgress}>Save progress</Button><Button className="gn-button gn-primary" disabled={blocked} onClick={onNext}>Review implementation</Button></>:<><Button disabled={blocked} onClick={onNext}>Review summary</Button><Button variant="outline" disabled={blocked} onClick={onSaveClose}>Save &amp; close</Button><Button variant="outline" disabled={busy} onClick={onPause}>Keep current implementation</Button></>}</div></>:<>
      <fieldset disabled={blocked} data-question-id={question.id}>
        <legend ref={assessmentRollout?heading:undefined} tabIndex={assessmentRollout?-1:undefined} className={assessmentRollout?'gn-question':undefined}>{question.prompt}</legend>{question.help&&<p className={'omni-help'+(assessmentRollout?' gn-hint':'')}>{question.help}</p>}
        {assessmentRollout&&<AssessmentQuestionGuidance guidance={presentation?.guidance} reference={presentation?.reference}/>}
        {entry.extra&&!assessmentRollout&&<p className="omni-help">{socUsesReportedWorkStatus(version)?'Affirmative reported gaps or confirmation needs can constrain the proposed readiness. Saved assessment status still requires your explicit decision.':'Use the question choices for substantive gaps or uncertainty. These optional notes add context; they do not decide readiness.'}</p>}
        {assessmentRollout&&presentation?.tool?<AssessmentToolField key={question.id} label="Your answer" value={answers[question.id]||''} disabled={blocked} options={presentation.tool.options} manualOnly={presentation.tool.manualOnly} onChange={value=>put(question.id,value)}/>:<>
          {assessmentRollout&&<label className="gn-fieldlabel" htmlFor={'soc-answer-'+question.id}>Your answer</label>}
          {question.type==='text'?<Textarea className={assessmentRollout?'gn-field':undefined} id={'soc-answer-'+question.id} aria-label={question.prompt} maxLength={2000} value={answers[question.id]||''} onChange={event=>put(question.id,event.target.value)}/>:<select className={assessmentRollout?'gn-answer':undefined} id={'soc-answer-'+question.id} aria-label={question.prompt} value={answers[question.id]||''} onChange={event=>put(question.id,event.target.value)}><option value="">{entry.extra?'Select an answer':'Choose an answer'}</option>{question.choices.map(value=><option key={value} value={value}>{value}</option>)}</select>}
        </>}
        {!entry.extra&&question.type!=='text'&&<label className={assessmentRollout?'gn-gaps':undefined} htmlFor={'soc-detail-'+question.id}>How this works / relevant context {question.type==='context'&&answers[question.id]==='Outside the selected system'?'(required for this scope decision)':'(optional)'}<Textarea className={assessmentRollout?'gn-field':undefined} id={'soc-detail-'+question.id} maxLength={2000} value={answers[question.id+'_detail']||''} onChange={event=>put(question.id+'_detail',event.target.value)}/></label>}
      </fieldset>
      <div className={'guided-actions'+(assessmentRollout?' gn-question-actions':'')}><Button className={buttonClass} variant="outline" disabled={busy||current===0} onClick={()=>move(current-1)}>{assessmentRollout&&<ArrowLeft size={16} aria-hidden="true"/>}Back</Button>{assessmentRollout&&<Button className={buttonClass} variant="outline" disabled={blocked||!saveProgress} onClick={saveProgress}>{saveLabel}</Button>}<Button className={assessmentRollout?'gn-button gn-primary':undefined} disabled={blocked} onClick={continueQuestion}>{current===entries.length-1?(assessmentRollout?'Review responses':'Review answers'):'Continue'}{assessmentRollout&&<ArrowRight size={16} aria-hidden="true"/>}</Button>{!assessmentRollout&&<Button variant="outline" disabled={blocked} onClick={onSaveClose}>Save &amp; close</Button>}</div>
    </>}
  </section>;
}
