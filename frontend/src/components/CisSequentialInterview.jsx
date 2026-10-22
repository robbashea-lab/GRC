import {useEffect,useRef,useState} from 'react';
import {Button} from './ui/button';
import {Textarea} from './ui/textarea';
import {updateGuidedMultiAnswer} from '@/lib/guidedAssessment';
import {multipleOmniSources,omniGroups} from '@/lib/refinedOmni';
import {nativeCisQuestionTitle} from './RefinedOmniInterview';
import './CisSequentialInterview.css';

// The native question index and original matrix keys remain the persistence contract.
export default function CisSequentialInterview({id,answers,version,step,setStep,put,detail,blocked,busy,onNext,onPause,inventoryContext,visualReference=false,safeguard11=false,boundedGuideCorrections=false}){
  // Native groups can reorder catalog questions (for example exclusion rationale).
  const nativeGroups=omniGroups(id,answers,version),questions=nativeGroups.flatMap(group=>group.questions);
  const index=Math.max(0,questions.findIndex(question=>question.id===step));
  const question=questions[index],heading=useRef(null);
  const [rowIndex,setRowIndex]=useState(0),[review,setReview]=useState(false);
  useEffect(()=>{setRowIndex(0);heading.current?.focus({preventScroll:true});},[step]);
  if(!question)return <p>No questions are available for this saved question set.</p>;
  const nativeGroupIndex=nativeGroups.findIndex(group=>group.ids.includes(question.id)),nativeGroup=nativeGroups[nativeGroupIndex];
  const note=nativeGroup?.note||question.id,title=nativeCisQuestionTitle(id,question);
  const rows=question.rows||[],row=rows[Math.min(rowIndex,Math.max(0,rows.length-1))];
  const move=next=>{setReview(false);setRowIndex(0);setStep(questions[next].id);};
  const groups=nativeGroups;
  const continueQuestion=()=>{
    if(question.type==='matrix'&&rowIndex<rows.length-1){setRowIndex(value=>value+1);heading.current?.focus({preventScroll:true});return;}
    if(index===questions.length-1){setReview(true);return;}
    onNext(nativeGroupIndex,groups,questions[index+1]?.id);
  };
  const answerLabel=value=>Array.isArray(value)?value.join(', '):value&&typeof value==='object'?Object.entries(value).map(([key,answer])=>`${key}: ${answer}`).join('; '):value||'Not recorded';
  return <section className="cis-sequential-interview" aria-label="Guided assessment questions">
    <header><h3 ref={heading} tabIndex={-1}>{review?'Review your answers':`Question ${index+1} of ${questions.length}`}</h3><Button variant="outline" disabled={busy} onClick={onPause}>Pause &amp; return</Button></header>
    <p className="text-xs text-ink-secondary">Moving between questions and rows keeps answers in this draft. Continuing past a native question group saves interview progress; it does not save the assessment.</p>
    {review?<><ol className="cis-answer-review">{questions.map((item,offset)=><li key={item.id}><strong>{nativeCisQuestionTitle(id,item)}</strong><p>{answerLabel(answers[item.id])}</p>{answers[item.id+'_detail']&&<p>{answers[item.id+'_detail']}</p>}{item.help&&<p className="omni-help">{item.help}</p>}<Button variant="outline" disabled={busy} onClick={()=>move(offset)}>Edit answer {offset+1}</Button></li>)}</ol><div className="guided-actions"><Button variant="outline" disabled={busy} onClick={()=>setReview(false)}>Back</Button><Button disabled={blocked} onClick={()=>onNext(nativeGroupIndex,groups)}>Review summary</Button><Button variant="outline" disabled={busy} onClick={onPause}>Keep current implementation</Button></div></>:<>
      {id==='1.2'&&nativeGroupIndex===1&&inventoryContext&&<section aria-label="Saved safeguard 1.1 inventory context" className="omni-context-note"><h3>Saved inventory context · Safeguard 1.1</h3><p>{inventoryContext.implementation||'No inventory narrative recorded.'}</p><p>This saved context is not proof of completeness and does not change either assessment.</p></section>}
      <fieldset disabled={blocked} data-question-id={question.id}><legend>{title}{visualReference&&question.critical&&!['text','date'].includes(question.type)&&<span className="cis-omni-criterion">Required for Implemented</span>}</legend>{question.help&&<p className="omni-help">{question.help}</p>}
        {question.type==='matrix'?<label>{row}<span className="cis-row-progress">Row {rowIndex+1} of {rows.length}</span><select aria-label={row} value={answers[question.id]?.[row]||''} onChange={event=>put(question,{...answers[question.id],[row]:event.target.value})}><option value="">Choose an answer</option>{(question.row_choices?.[row]||question.choices).map(value=><option key={value} value={value}>{safeguard11?(value==='Not applicable'?'N/A':value==='Partially'?'Partly':value):value}</option>)}</select></label>:question.type==='multi'?question.choices.map(value=><label className="guided-choice" key={value}><input type="checkbox" checked={(answers[question.id]||[]).includes(value)} onChange={event=>put(question,boundedGuideCorrections?updateGuidedMultiAnswer(answers[question.id]||[],value,event.target.checked,version):event.target.checked?[...(answers[question.id]||[]),value]:(answers[question.id]||[]).filter(item=>item!==value))}/>{value}</label>):question.type==='select'?<select aria-label={title} value={answers[question.id]||''} onChange={event=>put(question,event.target.value)}><option value="">Choose an answer</option>{question.choices.map(value=><option key={value}>{value}</option>)}</select>:question.type==='date'?<input aria-label={title} type="date" value={answers[question.id]||''} onChange={event=>put(question,event.target.value)}/>:<Textarea aria-label={title} maxLength={2000} value={answers[question.id]||''} onChange={event=>put(question,event.target.value)}/>}
        {question.id==='sources'&&multipleOmniSources(answers)&&<label>Which sources do you combine?<p className="omni-help">List each source and what it covers. Record anything still unknown.</p><Textarea aria-label="Which sources do you combine?" maxLength={2000} value={answers.sources_detail||''} onChange={event=>detail('sources_detail',event.target.value)}/></label>}
        {question.id!==note&&question.id!=='sources'&&answers[question.id+'_detail']&&<p className="omni-retained-detail">Previously reported context: {answers[question.id+'_detail']}</p>}
        <label>Known gaps or uncertainties <small>(optional)</small><p className="omni-help">Record anything missing, anything not yet confirmed, or who can help confirm it.</p><Textarea aria-label="Known gaps or uncertainties" maxLength={2000} value={answers[note+'_detail']||''} onChange={event=>detail(note+'_detail',event.target.value)}/></label>
      </fieldset>
      <div className="guided-actions"><Button variant="outline" disabled={busy||index===0&&rowIndex===0} onClick={()=>rowIndex>0?setRowIndex(value=>value-1):move(index-1)}>Back</Button><Button disabled={blocked} onClick={continueQuestion}>{index===questions.length-1&&(question.type!=='matrix'||rowIndex===rows.length-1)?'Review answers':'Continue'}</Button></div>
    </>}
  </section>;
}
