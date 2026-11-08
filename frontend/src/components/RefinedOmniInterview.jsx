import {useCallback,useLayoutEffect,useRef} from 'react';
import {Button} from './ui/button';
import {Textarea} from './ui/textarea';
import {omniGroups,multipleOmniSources} from '@/lib/refinedOmni';
import {updateGuidedMultiAnswer} from '@/lib/guidedAssessment';

const wording={
  inventory:'Does an enterprise asset inventory exist?',system:'Where do you maintain your inventory?',
  sources:'Do you use one inventory or combine several sources?',owner:'Who keeps it up to date?',
  coverage:'Does the inventory cover all of these assets?',attributes:'Does each asset record have the details you need?',
  maintenance:'Is the inventory updated when assets change?',maintenance_detail:'How are those changes handled?',
  frequency:'How often is the complete inventory reviewed?',last_review:'When was the last complete review?',
  reconciled:'Do you compare the inventory with other device records?'
};

export const nativeCisQuestionTitle=(id,question)=>id==='1.1'?(wording[question.id]||question.prompt):question.prompt;

function SafeguardMatrix({question,value={},onChange}) {
  return <div className="sg11-matrix" data-question-id={question.id}>{question.rows.map(row=><div className="sg11-matrix-row" key={row}>
    <span>{row}</span><div className="sg11-matrix-options" role="group" aria-label={row}>
      {(question.row_choices?.[row]||question.choices).map(answer=><button key={answer} type="button" data-answer={answer} aria-pressed={value[row]===answer}
        onClick={()=>onChange({...value,[row]:value[row]===answer?'':answer})}>{answer==='Not applicable'?'N/A':answer==='Partially'?'Partly':answer}</button>)}
    </div>
  </div>)}</div>;
}

function sameFocusScope(left,right) {
  return typeof right.focusScopeKey==='string'&&!!right.focusScopeKey.trim()
    &&left?.focusScopeKey===right.focusScopeKey&&left.id===right.id&&left.version===right.version;
}

export default function RefinedOmniInterview({id,answers,version,step,setStep,put,detail,blocked,busy,onNext,onSaveClose,inventoryContext,visualReference=false,boundedGuideCorrections=false,safeguard11=false,focusScopeKey}){
  const groups=omniGroups(id,answers,version);
  // Native step is an index into production visibleQuestions, not a new stored group index.
  const index=Math.max(0,groups.findIndex(g=>g.ids.includes(step))),group=groups[index];
  const enabled=groups.map((g,i)=>g.questions.length?i:null).filter(i=>i!==null);
  const liveFocus=useRef(null),questionFields=useRef(null),appearanceFocus=useRef(null);
  liveFocus.current={focusScopeKey,id,version,safeguard11,blocked,questions:group.questions,answers};
  useLayoutEffect(()=>{if(questionFields.current)questionFields.current.scope={...liveFocus.current};});
  // Both appearances use the same answers; transfer field focus only across an eligible appearance change.
  const retainQuestionFocus=useCallback(node=>{
    const current=liveFocus.current;
    if(!node){
      const previous=questionFields.current,active=document.activeElement;
      questionFields.current=null;appearanceFocus.current=null;
      if(current.blocked||!sameFocusScope(previous?.scope,current)||previous.scope.safeguard11===current.safeguard11)return;
      const toolbar=previous.node.nextElementSibling;
      if(!previous.node.contains(active)&&!(toolbar?.matches('.omni-action-bar')&&toolbar.contains(active)))return;
      const section=active.closest('.omni-question');
      const questionIndex=[...previous.node.querySelectorAll('.omni-question')].indexOf(section);
      const question=previous.scope.questions[questionIndex];
      const row=active.closest('.sg11-matrix-options');
      let target;
      if(question?.type==='matrix'&&(row||active.matches('select'))){
        const label=row?.getAttribute('aria-label')||active.getAttribute('aria-label');
        target={questionId:question.id,row:label,value:previous.scope.answers[question.id]?.[label]||''};
      }else if(active.id)target={fieldId:active.id,value:active.value};
      else if(question&&active.matches('button'))target={questionId:question.id,answer:active.textContent.trim()};
      else if(question&&active.matches('input[type="checkbox"]'))target={questionId:question.id,checkbox:active.closest('label')?.textContent.trim()};
      else if(active.matches('button')&&active.closest('.omni-action-bar'))target={command:active.textContent.trim()};
      if(target)appearanceFocus.current={scope:previous.scope,...target,start:active.selectionStart,end:active.selectionEnd,direction:active.selectionDirection};
      return;
    }
    const receipt=appearanceFocus.current;
    questionFields.current={node,scope:{...current}};appearanceFocus.current=null;
    if(current.blocked||!sameFocusScope(receipt?.scope,current)||receipt.scope.safeguard11===current.safeguard11)return;
    let field;
    if(receipt.fieldId)field=[...node.querySelectorAll('[id]')].find(element=>element.id===receipt.fieldId);
    else if(receipt.command) {
      const toolbar=node.nextElementSibling;
      if(toolbar?.matches('.omni-action-bar'))field=[...toolbar.querySelectorAll('button')].find(element=>element.textContent.trim()===receipt.command);
    }
    else {
      const index=current.questions.findIndex(question=>question.id===receipt.questionId);
      const question=node.querySelectorAll('.omni-question')[index];
      if(question){
        if(receipt.row){
          if((current.answers[receipt.questionId]?.[receipt.row]||'')!==receipt.value)return;
          if(current.safeguard11){
            const row=[...question.querySelectorAll('.sg11-matrix-options')].find(element=>element.getAttribute('aria-label')===receipt.row);
            field=row&&(receipt.value?[...row.querySelectorAll('button')].find(element=>element.dataset.answer===receipt.value):row.querySelector('button'));
          }else field=[...question.querySelectorAll('select')].find(element=>element.getAttribute('aria-label')===receipt.row);
        }
        else if(receipt.answer)field=[...question.querySelectorAll('button')].find(element=>element.textContent.trim()===receipt.answer);
        else if(receipt.checkbox)field=[...question.querySelectorAll('input[type="checkbox"]')].find(element=>element.closest('label')?.textContent.trim()===receipt.checkbox);
      }
    }
    if(!field?.isConnected||field.matches(':disabled'))return;
    if(receipt.fieldId&&field.value!==receipt.value)return;
    field.focus({preventScroll:true});
    if(typeof receipt.start==='number'&&typeof receipt.end==='number')field.setSelectionRange(receipt.start,receipt.end,receipt.direction);
  },[]);
  const moveGroup=groupIndex=>setStep(groups[groupIndex].questions[0].id);
  const questions=<>
    {id==='1.2'&&index===1&&inventoryContext&&<section aria-label="Saved safeguard 1.1 inventory context" className="omni-context-note"><h3>Saved inventory context · Safeguard 1.1</h3><p>{inventoryContext.implementation||'No inventory narrative recorded.'}</p><p>This saved context is not proof of completeness and does not change either assessment.</p></section>}
    <fieldset ref={retainQuestionFocus} disabled={blocked} className="omni-question-group"><legend className="sr-only">{group.name}</legend>
      {group.questions.map((q,i)=>{
        const title=nativeCisQuestionTitle(id,q);
        const choices=q.type==='select'&&q.choices.length<=5&&q.choices.includes('Yes');
        const criterion=visualReference&&q.critical&&!['text','date'].includes(q.type)?<span className="cis-omni-criterion">Required for Implemented</span>:null;
        return <section className="omni-question" key={q.id} data-question-id={safeguard11?q.id:undefined}>
          {i===0?<h3>{title}{criterion}</h3>:<label htmlFor={'omni-answer-'+q.id}>{title}{criterion}</label>}
          {q.help&&<p className="omni-help">{q.help}</p>}
          {q.type==='matrix'?(safeguard11?<SafeguardMatrix question={q} value={answers[q.id]} onChange={value=>put(q,value)}/>:<div className="omni-matrix">{q.rows.map(row=><label key={row}>{row}<select aria-label={row} value={answers[q.id]?.[row]||''} onChange={e=>put(q,{...answers[q.id],[row]:e.target.value})}><option value="">Choose an answer</option>{(q.row_choices?.[row]||q.choices).map(v=><option key={v}>{v}</option>)}</select></label>)}</div>):choices?<div className="omni-answer-choices" role="group" aria-label={title}>{q.choices.map(value=><button type="button" key={value} aria-pressed={answers[q.id]===value} onClick={()=>put(q,value)}>{value}</button>)}</div>:q.type==='multi'?<div className="omni-response-choices" role="group" aria-label={title}>{q.choices.map(value=><label key={value}><input type="checkbox" checked={(answers[q.id]||[]).includes(value)} onChange={e=>put(q,boundedGuideCorrections?updateGuidedMultiAnswer(answers[q.id]||[],value,e.target.checked,version):e.target.checked?[...(answers[q.id]||[]),value]:(answers[q.id]||[]).filter(v=>v!==value))}/>{value}</label>)}</div>:q.type==='select'?<select id={'omni-answer-'+q.id} aria-label={title} value={answers[q.id]||''} onChange={e=>put(q,e.target.value)}><option value="">Choose an answer</option>{q.choices.map(value=><option key={value}>{value}</option>)}</select>:q.type==='date'?<input id={'omni-answer-'+q.id} aria-label={title} type="date" value={answers[q.id]||''} onInput={e=>put(q,e.target.value)}/>:<Textarea id={'omni-answer-'+q.id} aria-label={title} maxLength={2000} value={answers[q.id]||''} onChange={e=>put(q,e.target.value)}/>}
          {q.id==='sources'&&multipleOmniSources(answers)&&<div className="omni-source-detail"><label htmlFor="omni-source-details">Which sources do you combine?</label><p className="omni-help">List each source and what it covers. Record anything still unknown.</p><Textarea id="omni-source-details" maxLength={2000} value={answers.sources_detail||''} onChange={e=>detail('sources_detail',e.target.value)}/></div>}
          {q.id!==group.note&&q.id!=='sources'&&answers[q.id+'_detail']&&<p className="omni-retained-detail">Previously reported context: {answers[q.id+'_detail']}</p>}
        </section>;
      })}
      <div className="omni-known-gaps"><label htmlFor={'omni-notes-'+group.note}>Known gaps or uncertainties <small>(optional)</small></label><p className="omni-help">Record anything missing, anything not yet confirmed, or who can help confirm it.</p><Textarea id={'omni-notes-'+group.note} aria-label="Known gaps or uncertainties" maxLength={2000} value={answers[group.note+'_detail']||''} onChange={e=>detail(group.note+'_detail',e.target.value)}/></div>
    </fieldset>
    <div className="omni-action-bar"><Button variant="outline" disabled={busy||enabled.indexOf(index)<=0} onClick={()=>moveGroup(enabled[enabled.indexOf(index)-1])}>Back</Button><Button disabled={blocked} onClick={()=>onNext(index,groups)}>Save &amp; next</Button><Button variant="outline" disabled={blocked} onClick={onSaveClose}>Save &amp; close</Button></div>
  </>;
  const content=<>
    {safeguard11?<ol className="omni-group-progress sg11-group-strip" aria-label={`Question group ${index+1} of ${groups.length}`}>{groups.map((g,i)=><li key={g.name} className={i<index&&g.questions.length?'sg11-earlier-group':undefined} aria-label={`${g.name}, group ${i+1} of ${groups.length}${i<index&&g.questions.length?', earlier saved group':''}`} aria-current={i===index?'step':undefined}><strong><span className="sg11-group-name">{g.name}</span>{i<index&&g.questions.length>0&&<span className="sg11-group-check" aria-hidden="true">✓</span>}<span className="sg11-group-number">{i+1}</span></strong><small>Group {i+1} of {groups.length}</small></li>)}</ol>:<div className="omni-group-progress" aria-label={`Question group ${index+1} of ${groups.length}`}><p><strong>Question group {index+1} of {groups.length}</strong><span>{group.name}</span></p><div>{groups.map((g,i)=><span key={g.name} className={i===index?'current':i<index?'done':''}/>)}</div></div>}
    {safeguard11?<div className="sg11-question-card">{questions}</div>:questions}
  </>;
  return visualReference?<section className="cis-omni-question-card">{content}</section>:content;
}
