import {useEffect,useId,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,Asterisk,BookOpen} from 'lucide-react';
import {Button} from './ui/button';
import {Textarea} from './ui/textarea';
import {updateGuidedMultiAnswer} from '@/lib/guidedAssessment';
import {multipleOmniSources,omniGroups} from '@/lib/refinedOmni';
import {nativeCisQuestionTitle} from './RefinedOmniInterview';
import BrawndoInventoryToolField from './BrawndoInventoryToolField';
import {brawndoAssessmentQuestionGuidance} from '@/lib/brawndoAssessmentPilot';
import './CisSequentialInterview.css';
import {assessmentQuestionPresentation} from '@/lib/assessmentRolloutPresentation';
import AssessmentQuestionGuidance from './AssessmentQuestionGuidance';
import AssessmentToolField from './AssessmentToolField';

const REQUIREMENT_HIGHLIGHTS={
  inventory:'accurate, detailed and up-to-date inventory',
  sources:'physical, virtual, remote and cloud environments',
  coverage:'all relevant enterprise assets and environments',
  attributes:'static network address where applicable, hardware address, machine name, asset owner, department and approval to connect',
  maintenance:'accurate and up to date',
};

// The native question index and original matrix keys remain the persistence contract.
export default function CisSequentialInterview({id,answers,version,step,setStep,put,detail,blocked,busy,onNext,onPause,onSaveClose,onSaveProgress,inventoryContext,visualReference=false,safeguard11=false,boundedGuideCorrections=false,assessmentConcept=false,assessmentRollout=false,pilotGuideOpen=false}){
  // Native groups can reorder catalog questions (for example exclusion rationale).
  const nativeGroups=omniGroups(id,answers,version),questions=nativeGroups.flatMap(group=>group.questions);
  const index=Math.max(0,questions.findIndex(question=>question.id===step));
  const question=questions[index],heading=useRef(null),fieldId=useId();
  const [rowIndex,setRowIndex]=useState(0),[review,setReview]=useState(false);
  useEffect(()=>{setRowIndex(0);heading.current?.focus({preventScroll:true});},[step]);
  // Opening the retained pilot hands off focus without resetting its question row.
  useEffect(()=>{
    if((assessmentConcept===true&&id==='1.1'||assessmentRollout===true)&&pilotGuideOpen===true)heading.current?.focus({preventScroll:true});
  },[assessmentConcept,assessmentRollout,id,pilotGuideOpen]);
  if(!question)return <p>No questions are available for this saved question set.</p>;
  const nativeGroupIndex=nativeGroups.findIndex(group=>group.ids.includes(question.id)),nativeGroup=nativeGroups[nativeGroupIndex];
  const note=nativeGroup?.note||question.id,title=nativeCisQuestionTitle(id,question);
  const referencePilot=assessmentConcept===true&&id==='1.1';
  const pilot=referencePilot||assessmentRollout===true;
  const rows=question.rows||[],row=rows[Math.min(rowIndex,Math.max(0,rows.length-1))];
  const metadata=assessmentRollout?assessmentQuestionPresentation('cis-ig1',id,question.id,{row:question.type==='matrix'?row:undefined,version,module:'safeguard'}):null;
  const guidance=referencePilot?brawndoAssessmentQuestionGuidance(question.id):metadata?.guidance||null;
  const requirement=guidance?.requirement||'';
  const highlight=guidance?.highlight||REQUIREMENT_HIGHLIGHTS[question.id]||REQUIREMENT_HIGHLIGHTS.inventory;
  const highlightIndex=requirement?.indexOf(highlight)??-1;
  const requirementCopy=guidance?.highlight?<>{requirement}<mark>{highlight}</mark>{guidance.after}</>:highlightIndex>=0?<>{requirement.slice(0,highlightIndex)}<mark>{highlight}</mark>{requirement.slice(highlightIndex+highlight.length)}</>:requirement;
  const critical=(visualReference||assessmentRollout)&&question.critical&&!['text','date'].includes(question.type);
  const answerClass=pilot?'gn-answer':undefined,fieldClass=pilot?'gn-field':undefined;
  const hintId=`${fieldId}-hint`,ruleId=`${fieldId}-rule`;
  const answerDescription=pilot?[question.help&&hintId,guidance&&ruleId].filter(Boolean).join(' ')||undefined:undefined;
  const saveProgress=pilot?onSaveProgress:onSaveClose;
  const saveLabel=pilot?'Save progress':'Save & close';

  // The pilot targets the visible row so two queued activations cannot skip it.
  const moveRow=delta=>setRowIndex(pilot?rowIndex+delta:value=>value+delta);
  const move=next=>{setReview(false);setRowIndex(0);setStep(questions[next].id);};
  const groups=nativeGroups;
  const continueQuestion=()=>{
    if(question.type==='matrix'&&rowIndex<rows.length-1){moveRow(1);heading.current?.focus({preventScroll:true});return;}
    if(index===questions.length-1){setReview(true);return;}
    onNext(nativeGroupIndex,groups,questions[index+1]?.id);
  };
  const answerLabel=value=>Array.isArray(value)?value.join(', '):value&&typeof value==='object'?Object.entries(value).map(([key,answer])=>`${key}: ${answer}`).join('; '):value||'Not recorded';
  return <section className={'cis-sequential-interview'+(pilot?' gn-question-area':'')} aria-label="Guided assessment questions">
    {pilot?<>
      <div className="gn-question-meta"><span>{review?'Guided assessment':`Question ${index+1} of ${questions.length}`}</span>{!review&&critical&&<span className="gn-required"><Asterisk size={16} aria-hidden="true"/>Required for Implemented</span>}</div>
      {review?<h3 ref={heading} tabIndex={-1} className="gn-question">Review responses</h3>:<div className="gn-progress" role="progressbar" aria-label="Question position" aria-valuemin={0} aria-valuemax={questions.length} aria-valuenow={index+1}><span style={{width:`${(index+1)/questions.length*100}%`}}/></div>}
    </>:<>
      <header><h3 ref={heading} tabIndex={-1}>{review?'Review your answers':`Question ${index+1} of ${questions.length}`}</h3><Button variant="outline" disabled={busy} onClick={onPause}>Pause &amp; return</Button></header>
      <p className="text-xs text-ink-secondary">Moving between questions and rows keeps answers in this draft. Continuing past a native question group or {saveLabel} saves interview progress; it does not save the assessment. Pause retains unsaved work here; unsaved edits do not survive reload.</p>
    </>}
    {review?<><ol className={'cis-answer-review'+(pilot?' gn-review-list':'')}>{questions.map((item,offset)=><li key={item.id}><strong>{nativeCisQuestionTitle(id,item)}</strong><p className={pilot?'gn-review-answer':undefined}>{answerLabel(answers[item.id])}</p>{answers[item.id+'_detail']&&<p>{answers[item.id+'_detail']}</p>}{item.help&&<p className="omni-help">{item.help}</p>}<Button className={pilot?'gn-button gn-quiet':undefined} aria-label={pilot?`Edit response ${offset+1}`:undefined} variant="outline" disabled={busy} onClick={()=>move(offset)}>{pilot?'Edit response':`Edit answer ${offset+1}`}</Button></li>)}</ol><div className={'guided-actions'+(pilot?' gn-question-actions':'')}><Button className={pilot?'gn-button':undefined} variant="outline" disabled={busy} onClick={()=>setReview(false)}>{pilot?'Edit responses':'Back'}</Button>{pilot?<><Button className="gn-button" variant="outline" disabled={blocked} onClick={saveProgress}>Save progress</Button><Button className="gn-button gn-primary" disabled={blocked} onClick={()=>onNext(nativeGroupIndex,groups)}>Review implementation</Button></>:<><Button disabled={blocked} onClick={()=>onNext(nativeGroupIndex,groups)}>Review summary</Button><Button variant="outline" disabled={blocked} onClick={onSaveClose}>Save &amp; close</Button><Button variant="outline" disabled={busy} onClick={onPause}>Keep current implementation</Button></>}</div></>:<>
      {id==='1.2'&&nativeGroupIndex===1&&inventoryContext&&<section aria-label="Saved safeguard 1.1 inventory context" className="omni-context-note"><h3>Saved inventory context · Safeguard 1.1</h3><p>{inventoryContext.implementation||'No inventory narrative recorded.'}</p><p>This saved context is not proof of completeness and does not change either assessment.</p></section>}
      <fieldset disabled={blocked} data-question-id={question.id}><legend ref={pilot?heading:undefined} tabIndex={pilot?-1:undefined} className={pilot?'gn-question':undefined}>{title}{!pilot&&critical&&<span className="cis-omni-criterion">Required for Implemented</span>}</legend>{question.help&&<p id={pilot?hintId:undefined} className={'omni-help'+(pilot?' gn-hint':'')}>{question.help}</p>}
        {guidance&&assessmentRollout&&!referencePilot?<AssessmentQuestionGuidance descriptionId={ruleId} guidance={{...guidance,highlight:guidance.highlight||guidance.requirement}} reference={metadata?.reference}/>:guidance&&<aside className="brawndo-pilot-guidance gn-inline-requirement" aria-label={guidance.requirement?'Framework requirement':'Implementation context'}><div className="gn-rule-heading"><BookOpen size={16} aria-hidden="true"/><span>{guidance.requirement?'Framework requirement':'Implementation context'}</span><span className="gn-rule-reference">CIS v8.1 · {id}</span></div><p id={ruleId} className={guidance.requirement?'gn-rule-copy':'gn-rule-context'}>{guidance.requirement?requirementCopy:guidance.context}</p>{guidance.requirement&&guidance.context&&<p className="gn-rule-context"><strong>Implementation context:</strong> {guidance.context}</p>}</aside>}
        {pilot&&question.id!=='system'&&question.type!=='matrix'&&question.type!=='multi'&&<label className="gn-fieldlabel" htmlFor={fieldId}>Your answer</label>}
        {referencePilot&&question.id==='system'?<BrawndoInventoryToolField label={title} descriptionId={answerDescription} value={answers.system||''} disabled={blocked} onChange={value=>put(question,value)}/>:assessmentRollout&&metadata?.tool?<AssessmentToolField label={title} descriptionId={answerDescription} value={answers[question.id]||''} disabled={blocked} options={metadata.tool.options} manualOnly={metadata.tool.manualOnly} onChange={value=>put(question,value)}/>:question.type==='matrix'?<label>{row}<span className="cis-row-progress">Row {rowIndex+1} of {rows.length}</span><select id={pilot?fieldId:undefined} className={answerClass} aria-describedby={answerDescription} aria-label={row} value={answers[question.id]?.[row]||''} onChange={event=>put(question,{...answers[question.id],[row]:event.target.value})}><option value="">Choose an answer</option>{(question.row_choices?.[row]||question.choices).map(value=><option key={value} value={value}>{safeguard11?(value==='Not applicable'?'N/A':value==='Partially'?'Partly':value):value}</option>)}</select></label>:question.type==='multi'?question.choices.map(value=><label className="guided-choice" key={value}><input type="checkbox" checked={(answers[question.id]||[]).includes(value)} onChange={event=>put(question,boundedGuideCorrections?updateGuidedMultiAnswer(answers[question.id]||[],value,event.target.checked,version):event.target.checked?[...(answers[question.id]||[]),value]:(answers[question.id]||[]).filter(item=>item!==value))}/>{value}</label>):question.type==='select'?<select id={pilot?fieldId:undefined} className={answerClass} aria-describedby={answerDescription} aria-label={title} value={answers[question.id]||''} onChange={event=>put(question,event.target.value)}><option value="">Choose an answer</option>{question.choices.map(value=><option key={value}>{value}</option>)}</select>:question.type==='date'?<input id={pilot?fieldId:undefined} className={answerClass} aria-describedby={answerDescription} aria-label={title} type="date" value={answers[question.id]||''} onChange={event=>put(question,event.target.value)}/>:<Textarea id={pilot?fieldId:undefined} className={answerClass} aria-describedby={answerDescription} aria-label={title} maxLength={2000} value={answers[question.id]||''} onChange={event=>put(question,event.target.value)}/>}
        {question.id==='sources'&&multipleOmniSources(answers)&&<label className={pilot?'gn-followup':undefined}>Which sources do you combine?<p className="omni-help">List each source and what it covers. Record anything still unknown.</p><Textarea className={fieldClass} aria-label="Which sources do you combine?" maxLength={2000} value={answers.sources_detail||''} onChange={event=>detail('sources_detail',event.target.value)}/></label>}
        {question.id!==note&&question.id!=='sources'&&answers[question.id+'_detail']&&<p className="omni-retained-detail">Previously reported context: {answers[question.id+'_detail']}</p>}
        <label className={pilot?'gn-gaps':undefined}>Known gaps or uncertainties <small>(optional)</small><p className="omni-help">Record anything missing, anything not yet confirmed, or who can help confirm it.</p><Textarea className={fieldClass} aria-label="Known gaps or uncertainties" maxLength={2000} value={answers[note+'_detail']||''} onChange={event=>detail(note+'_detail',event.target.value)}/></label>
      </fieldset>
      {pilot?<div className="guided-actions gn-question-actions"><Button className="gn-button" variant="outline" disabled={busy||index===0&&rowIndex===0} onClick={()=>rowIndex>0?moveRow(-1):move(index-1)}><ArrowLeft size={16} aria-hidden="true"/>Back</Button><Button className="gn-button" variant="outline" disabled={blocked} onClick={saveProgress}>{saveLabel}</Button><Button className="gn-button gn-primary" disabled={blocked} onClick={continueQuestion}>{index===questions.length-1&&(question.type!=='matrix'||rowIndex===rows.length-1)?'Review responses':'Continue'}<ArrowRight size={16} aria-hidden="true"/></Button></div>:<div className="guided-actions"><Button variant="outline" disabled={busy||index===0&&rowIndex===0} onClick={()=>rowIndex>0?moveRow(-1):move(index-1)}>Back</Button><Button disabled={blocked} onClick={continueQuestion}>{index===questions.length-1&&(question.type!=='matrix'||rowIndex===rows.length-1)?'Review answers':'Continue'}</Button><Button variant="outline" disabled={blocked} onClick={saveProgress}>{saveLabel}</Button></div>}
    </>}
  </section>;
}
