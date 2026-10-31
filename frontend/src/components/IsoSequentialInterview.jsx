import {useEffect, useRef, useState} from 'react';
import {Button} from './ui/button';
import {Textarea} from './ui/textarea';
import './CisSequentialInterview.css';

// The cursor is presentation state; saved ISO steps remain native group indexes.
export default function IsoSequentialInterview({groups, extras, answers, step, setStep, put, blocked, busy, onNext, onPause, onSaveClose}) {
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
  if (!question) return <p>No questions are available for this saved question set.</p>;

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

  return <section className="cis-sequential-interview iso-sequential-interview" aria-label="Guided assessment questions">
    <header>
      <h3 ref={heading} tabIndex={-1}>{review ? 'Review your answers' : `Question ${questionIndex + 1} of ${entries.length}`}</h3>
      <Button variant="outline" disabled={busy} onClick={onPause}>Pause &amp; return</Button>
    </header>
    {!review && <p className="text-xs text-ink-secondary">{groups[step].title}</p>}
    <p className="text-xs text-ink-secondary">Moving between questions keeps answers in this draft. Continuing past a native question group or Save &amp; close saves interview progress; it does not save the assessment. Pause retains unsaved work here; unsaved edits do not survive reload.</p>
    {review ? <>
      <ol className="cis-answer-review">
        {entries.map(({question: item}, index) => <li key={item.id}>
          <strong>{item.prompt}</strong><p>{answers[item.id] || 'Not recorded'}</p>
          {answers[item.id + '_detail'] && <p>{answers[item.id + '_detail']}</p>}
          {item.help && <p className="omni-help">{item.help}</p>}
          <Button variant="outline" disabled={busy} onClick={() => move(index)}>Edit answer {index + 1}</Button>
        </li>)}
      </ol>
      <div className="guided-actions">
        <Button variant="outline" disabled={busy} onClick={() => setReview(false)}>Back</Button>
        <Button disabled={blocked} onClick={onNext}>Review summary</Button>
        <Button variant="outline" disabled={blocked} onClick={onSaveClose}>Save &amp; close</Button>
        <Button variant="outline" disabled={busy} onClick={onPause}>Keep current implementation</Button>
      </div>
    </> : <>
      <fieldset disabled={blocked} data-question-id={question.id}>
        <legend>{question.prompt}</legend>
        {question.help && <p className="omni-help">{question.help}</p>}
        {entry.extra && <p className="omni-help">Use the question choices for substantive gaps or uncertainty. These optional notes add context; they do not decide implementation status.</p>}
        {question.type === 'text' ?
          <Textarea id={'iso-answer-' + question.id} aria-label={question.prompt} maxLength={2000} value={answers[question.id] || ''} onChange={event => put(question.id, event.target.value)}/> :
          <select id={'iso-answer-' + question.id} aria-label={question.prompt} value={answers[question.id] || ''} onChange={event => put(question.id, event.target.value)}>
            <option value="">{entry.extra ? 'Select an answer' : 'Choose an answer'}</option>
            {question.choices.map(value => <option key={value} value={value}>{value}</option>)}
          </select>}
        {!entry.extra && question.type !== 'text' && <label htmlFor={'iso-detail-' + question.id}>
          How this works / relevant context {question.type === 'context' && answers[question.id] === 'Not relevant here' ? '(required for this context answer)' : '(optional)'}
          <Textarea id={'iso-detail-' + question.id} maxLength={2000} value={answers[question.id + '_detail'] || ''} onChange={event => put(question.id + '_detail', event.target.value)}/>
        </label>}
      </fieldset>
      <div className="guided-actions">
        <Button variant="outline" disabled={busy || questionIndex === 0} onClick={() => move(questionIndex - 1)}>Back</Button>
        <Button disabled={blocked} onClick={continueQuestion}>{questionIndex === entries.length - 1 ? 'Review answers' : 'Continue'}</Button>
        <Button variant="outline" disabled={blocked} onClick={onSaveClose}>Save &amp; close</Button>
      </div>
    </>}
  </section>;
}
