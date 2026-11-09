import {useEffect, useRef, useState} from 'react';
import {ArrowLeft,ArrowRight,Asterisk} from 'lucide-react';
import {Button} from './ui/button';
import {Textarea} from './ui/textarea';
import AssessmentQuestionGuidance from './AssessmentQuestionGuidance';
import AssessmentToolField from './AssessmentToolField';
import {assessmentQuestionPresentation} from '@/lib/assessmentRolloutPresentation';
import {isoUsesConcernStatus} from '@/lib/isoGuidedAssessment';
import './CisSequentialInterview.css';

// The cursor is presentation state; saved ISO steps remain native group indexes.
export default function IsoSequentialInterview({id,version,groups,extras,answers,step,setStep,put,blocked,busy,onNext,onPause,onSaveClose,onSaveProgress,assessmentRollout=false,pilotGuideOpen=false}) {
  const [questionId, setQuestionId] = useState(null);
  const [review, setReview] = useState(false);
  const heading = useRef(null);
  const entries = groups.flatMap((group, groupIndex) => group.questions.map(question => ({question, groupIndex})));
  entries.push(...extras.map(question => ({question, groupIndex: groups.length - 1, extra: true})));
  const selectedIndex = entries.findIndex(entry => entry.question.id === questionId && entry.groupIndex === step);
  const questionIndex = selectedIndex < 0 ? entries.findIndex(entry => entry.groupIndex === step) : selectedIndex;
  const entry = entries[questionIndex];
  const question = entry?.question;

  useEffect(() => { heading.current?.focus({preventScroll: true}); }, [question?.id, review]);
  useEffect(()=>{if(assessmentRollout&&pilotGuideOpen)heading.current?.focus({preventScroll:true});},[assessmentRollout,pilotGuideOpen]);
  if (!question) return <p>No questions are available for this saved question set.</p>;
  const presentation=assessmentRollout?assessmentQuestionPresentation('iso-27001',id,question.id,{version,module:id?.startsWith('A.')?'annex_a':'isms'}):null;
  const saveProgress=assessmentRollout?onSaveProgress:onSaveClose;
  const saveLabel=assessmentRollout?'Save progress':'Save & close';
  const required=assessmentRollout&&!entry.extra&&question.type==='select'&&!question.optional;

  function move(index) {
    const next = entries[index];
    setReview(false);
    setQuestionId(next.question.id);
    setStep(next.groupIndex);
  }
  function continueQuestion() {
    if (questionIndex === entries.length - 1) { setReview(true); return; }
    if (entries[questionIndex + 1].groupIndex === step) move(questionIndex + 1);
    else onNext();
  }

  return <section className={'cis-sequential-interview iso-sequential-interview'+(assessmentRollout?' gn-question-area':'')} aria-label="Guided assessment questions">
    {assessmentRollout?<>
      <div className="gn-question-meta"><span>{review?'Guided assessment':`Question ${questionIndex+1} of ${entries.length}`}</span>{!review&&required&&<span className="gn-required"><Asterisk size={16} aria-hidden="true"/>Required for Implemented</span>}</div>
      {review?<h3 ref={heading} tabIndex={-1} className="gn-question" data-question-focus>Review responses</h3>:<div className="gn-progress" role="progressbar" aria-label="Question position" aria-valuemin={0} aria-valuemax={entries.length} aria-valuenow={questionIndex+1}><span style={{width:`${(questionIndex+1)/entries.length*100}%`}}/></div>}
    </>:<><header>
      <h3 ref={heading} tabIndex={-1}>{review ? 'Review your answers' : `Question ${questionIndex + 1} of ${entries.length}`}</h3>
      <Button variant="outline" disabled={busy} onClick={onPause}>Pause &amp; return</Button>
    </header>
    {!review && <p className="text-xs text-ink-secondary">{groups[step].title}</p>}
    <p className="text-xs text-ink-secondary">Moving between questions keeps answers in this draft. Continuing past a native question group or Save &amp; close saves interview progress; it does not save the assessment. Pause retains unsaved work here; unsaved edits do not survive reload.</p></>}
    {review ? <>
      <ol className={'cis-answer-review'+(assessmentRollout?' gn-review-list':'')}>
        {entries.map(({question: item}, index) => <li key={item.id}>
          <strong>{item.prompt}</strong><p className={assessmentRollout?'gn-review-answer':undefined}>{answers[item.id] || 'Not recorded'}</p>
          {answers[item.id + '_detail'] && <p>{answers[item.id + '_detail']}</p>}
          {item.help && <p className="omni-help">{item.help}</p>}
          <Button className={assessmentRollout?'gn-button gn-quiet':undefined} aria-label={assessmentRollout?`Edit response ${index+1}`:undefined} variant="outline" disabled={busy} onClick={() => move(index)}>{assessmentRollout?'Edit response':`Edit answer ${index+1}`}</Button>
        </li>)}
      </ol>
      <div className={'guided-actions'+(assessmentRollout?' gn-question-actions':'')}>
        <Button className={assessmentRollout?'gn-button':undefined} variant="outline" disabled={busy} onClick={() => setReview(false)}>{assessmentRollout?'Edit responses':'Back'}</Button>
        <Button className={assessmentRollout?'gn-button gn-primary':undefined} disabled={blocked} onClick={onNext}>{assessmentRollout?'Review implementation':'Review summary'}</Button>
        <Button className={assessmentRollout?'gn-button':undefined} variant="outline" disabled={blocked} onClick={saveProgress}>{saveLabel}</Button>
        {!assessmentRollout&&<Button variant="outline" disabled={busy} onClick={onPause}>Keep current implementation</Button>}
      </div>
    </> : <>
      <fieldset disabled={blocked} data-question-id={question.id}>
        <legend ref={assessmentRollout?heading:undefined} data-question-focus={assessmentRollout?true:undefined} tabIndex={assessmentRollout?-1:undefined} className={assessmentRollout?'gn-question':undefined}>{question.prompt}</legend>
        {question.help && <p className="omni-help">{question.help}</p>}
        {entry.extra && <p className="omni-help">{isoUsesConcernStatus(version)?'Affirmed, described gaps or uncertainty constrain the proposed implementation status. The saved assessment status remains your decision.':'Use the question choices for substantive gaps or uncertainty. These optional notes add context; they do not decide implementation status.'}</p>}
        {assessmentRollout&&<AssessmentQuestionGuidance guidance={presentation?.guidance} reference={`ISO/IEC 27001:2022 · ${id}`}/>}
        {assessmentRollout&&presentation?.tool&&question.type==='text'?<AssessmentToolField key={question.id} label={question.prompt} value={answers[question.id]||''} disabled={blocked} onChange={value=>put(question.id,value)} options={presentation.tool.options} manualOnly={presentation.tool.manualOnly}/>:<>
        {assessmentRollout&&<label className="gn-fieldlabel" htmlFor={'iso-answer-'+question.id}>Your answer</label>}
        {question.type === 'text' ?
          <Textarea id={'iso-answer-' + question.id} className={assessmentRollout?'gn-answer':undefined} aria-label={question.prompt} maxLength={2000} value={answers[question.id] || ''} onChange={event => put(question.id, event.target.value)}/> :
          <select id={'iso-answer-' + question.id} className={assessmentRollout?'gn-answer':undefined} aria-label={question.prompt} value={answers[question.id] || ''} onChange={event => put(question.id, event.target.value)}>
            <option value="">{entry.extra ? 'Select an answer' : 'Choose an answer'}</option>
            {question.choices.map(value => <option key={value} value={value}>{value}</option>)}
          </select>}</>}
        {!entry.extra && question.type !== 'text' && <label className={assessmentRollout?'gn-gaps':undefined} htmlFor={'iso-detail-' + question.id}>
          How this works / relevant context {question.type === 'context' && answers[question.id] === 'Not relevant here' ? '(required for this context answer)' : '(optional)'}
          <Textarea id={'iso-detail-' + question.id} className={assessmentRollout?'gn-field':undefined} maxLength={2000} value={answers[question.id + '_detail'] || ''} onChange={event => put(question.id + '_detail', event.target.value)}/>
        </label>}
      </fieldset>
      <div className={'guided-actions'+(assessmentRollout?' gn-question-actions':'')}>
        <Button className={assessmentRollout?'gn-button':undefined} variant="outline" disabled={busy || questionIndex === 0} onClick={() => move(questionIndex - 1)}>{assessmentRollout&&<ArrowLeft size={16} aria-hidden="true"/>}Back</Button>
        {assessmentRollout&&<Button className="gn-button" variant="outline" disabled={blocked} onClick={saveProgress}>{saveLabel}</Button>}
        <Button className={assessmentRollout?'gn-button gn-primary':undefined} disabled={blocked} onClick={continueQuestion}>{questionIndex === entries.length - 1 ? assessmentRollout?'Review responses':'Review answers' : 'Continue'}{assessmentRollout&&<ArrowRight size={16} aria-hidden="true"/>}</Button>
        {!assessmentRollout&&<Button variant="outline" disabled={blocked} onClick={saveProgress}>{saveLabel}</Button>}
      </div>
    </>}
  </section>;
}
