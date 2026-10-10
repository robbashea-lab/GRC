import {Button} from './ui/button';
import {Textarea} from './ui/textarea';
import {omniGroups,multipleOmniSources} from '@/lib/refinedOmni';

const wording={
  inventory:'Does an enterprise asset inventory exist?',system:'Where do you maintain your inventory?',
  sources:'Do you use one inventory or combine several sources?',owner:'Who keeps it up to date?',
  coverage:'Does the inventory cover all of these assets?',attributes:'Does each asset record have the details you need?',
  maintenance:'Is the inventory updated when assets change?',maintenance_detail:'How are those changes handled?',
  frequency:'How often is the complete inventory reviewed?',last_review:'When was the last complete review?',
  reconciled:'Do you compare the inventory with other device records?'
};
export default function RefinedOmniInterview({id,answers,version,step,setStep,put,detail,blocked,busy,onNext,onSaveClose,inventoryContext}){
  const groups=omniGroups(id,answers,version);
  // Native step is an index into production visibleQuestions, not a new stored group index.
  const index=Math.max(0,groups.findIndex(g=>g.ids.includes(step))),group=groups[index];
  const enabled=groups.map((g,i)=>g.questions.length?i:null).filter(i=>i!==null);
  const moveGroup=groupIndex=>setStep(groups[groupIndex].questions[0].id);
  return <>
    <div className="omni-group-progress" aria-label={`Question group ${index+1} of ${groups.length}`}><p><strong>Question group {index+1} of {groups.length}</strong><span>{group.name}</span></p><div>{groups.map((g,i)=><span key={g.name} className={i===index?'current':i<index?'done':''}/>)}</div></div>
    {id==='1.2'&&index===1&&inventoryContext&&<section aria-label="Saved safeguard 1.1 inventory context" className="omni-context-note"><h3>Saved inventory context · Safeguard 1.1</h3><p>{inventoryContext.implementation||'No inventory narrative recorded.'}</p><p>This saved context is not proof of completeness and does not change either assessment.</p></section>}
    <fieldset disabled={blocked} className="omni-question-group"><legend className="sr-only">{group.name}</legend>
      {group.questions.map((q,i)=>{
        const title=id==='1.1'?(wording[q.id]||q.prompt):q.prompt;
        const choices=q.type==='select'&&q.choices.length<=5&&q.choices.includes('Yes');
        return <section className="omni-question" key={q.id}>
          {i===0?<h3>{title}</h3>:<label htmlFor={'omni-answer-'+q.id}>{title}</label>}
          {q.help&&<p className="omni-help">{q.help}</p>}
          {q.type==='matrix'?<div className="omni-matrix">{q.rows.map(row=><label key={row}>{row}<select aria-label={row} value={answers[q.id]?.[row]||''} onChange={e=>put(q,{...answers[q.id],[row]:e.target.value})}><option value="">Choose an answer</option>{(q.row_choices?.[row]||q.choices).map(v=><option key={v}>{v}</option>)}</select></label>)}</div>:choices?<div className="omni-answer-choices" role="group" aria-label={title}>{q.choices.map(value=><button type="button" key={value} aria-pressed={answers[q.id]===value} onClick={()=>put(q,value)}>{value}</button>)}</div>:q.type==='multi'?<div className="omni-response-choices" role="group" aria-label={title}>{q.choices.map(value=><label key={value}><input type="checkbox" checked={(answers[q.id]||[]).includes(value)} onChange={e=>put(q,e.target.checked?[...(answers[q.id]||[]),value]:(answers[q.id]||[]).filter(v=>v!==value))}/>{value}</label>)}</div>:q.type==='select'?<select id={'omni-answer-'+q.id} aria-label={title} value={answers[q.id]||''} onChange={e=>put(q,e.target.value)}><option value="">Choose an answer</option>{q.choices.map(value=><option key={value}>{value}</option>)}</select>:q.type==='date'?<input id={'omni-answer-'+q.id} aria-label={title} type="date" value={answers[q.id]||''} onInput={e=>put(q,e.target.value)}/>:<Textarea id={'omni-answer-'+q.id} aria-label={title} maxLength={2000} value={answers[q.id]||''} onChange={e=>put(q,e.target.value)}/>}
          {q.id==='sources'&&multipleOmniSources(answers)&&<div className="omni-source-detail"><label htmlFor="omni-source-details">Which sources do you combine?</label><p className="omni-help">List each source and what it covers. Record anything still unknown.</p><Textarea id="omni-source-details" maxLength={2000} value={answers.sources_detail||''} onChange={e=>detail('sources_detail',e.target.value)}/></div>}
          {q.id!==group.note&&q.id!=='sources'&&answers[q.id+'_detail']&&<p className="omni-retained-detail">Previously reported context: {answers[q.id+'_detail']}</p>}
        </section>;
      })}
      <div className="omni-known-gaps"><label htmlFor={'omni-notes-'+group.note}>Known gaps or uncertainties <small>(optional)</small></label><p className="omni-help">Record anything missing, anything not yet confirmed, or who can help confirm it.</p><Textarea id={'omni-notes-'+group.note} aria-label="Known gaps or uncertainties" maxLength={2000} value={answers[group.note+'_detail']||''} onChange={e=>detail(group.note+'_detail',e.target.value)}/></div>
    </fieldset>
    <div className="omni-action-bar"><Button variant="outline" disabled={busy||enabled.indexOf(index)<=0} onClick={()=>moveGroup(enabled[enabled.indexOf(index)-1])}>Back</Button><Button disabled={blocked} onClick={()=>onNext(index,groups)}>Save &amp; next</Button><Button variant="outline" disabled={blocked} onClick={onSaveClose}>Save &amp; close</Button></div>
  </>;
}
