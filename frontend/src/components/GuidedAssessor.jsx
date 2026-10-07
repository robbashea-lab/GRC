import {useEffect,useId,useRef,useState} from 'react';
import {useAuth} from '@/context/AuthContext';
import api,{formatError} from '@/lib/api';
import {guidedCatalog,pilotEnabled,visibleQuestions,generateResult,validateAnswers} from '@/lib/guidedAssessment';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './ui/dialog';
import {Button} from './ui/button';
import {Textarea} from './ui/textarea';
import OmniCharacter from './OmniCharacter';
import './GuidedAssessor.css';

const STATUSES={addressed:'Implemented',in_progress:'Partially Implemented',needs_attention:'Not Implemented',not_assessed:'Not Assessed'};
const EMPTY_ROWS=[];
function readPreference(key){try{return JSON.parse(localStorage.getItem(key)||'{}');}catch{return {};}}
export default function GuidedAssessor(props){
  if(!pilotEnabled(props.clientId,props.framework,props.configuration,props.record?.definition_id))return null;
  return <Pilot key={props.record?.framework_assessment_id||props.clientId} {...props}/>;
}
function Pilot({record,rows=EMPTY_ROWS,onSelect,form,onApply,onDraftChange,disabled=false}){
  const {user}=useAuth(),key='guided-pilot-ui:'+user?.user_id,initial=readPreference(key);
  const [mode,setMode]=useState(record&&new URLSearchParams(window.location.search).get('guided')==='pilot'?'expanded':initial.mode||'collapsed'),[greeting,setGreeting]=useState(false),[draft,setDraft]=useState(null),[answers,setAnswers]=useState({}),[step,setStep]=useState(0),[result,setResult]=useState(null),[narrative,setNarrative]=useState(''),[statuses,setStatuses]=useState({}),[error,setError]=useState(''),[busy,setBusy]=useState(false),[restart,setRestart]=useState(false),[replace,setReplace]=useState(false);
  const launcher=useRef(null),heading=useRef(null),saved=useRef('{}');
  const dirty=JSON.stringify(answers)!==saved.current||!!result&&narrative!==(draft?.narrative||result.narrative);
  const id=record?.definition_id,questions=id?visibleQuestions(id,answers):[],question=questions[Math.min(step,Math.max(0,questions.length-1))];
  const base=record?'/framework_assessments/'+record.framework_assessment_id+'/guided-assessment':null;
  const stateId=useId(),panelId=useId();
  const currentSignal=question&&answers[question.id]!==undefined?generateResult(id,answers).signals.filter(s=>s.questionId===question.id):[];
  const characterState=busy?'thinking':result?result.gaps.length?'gap':result.unknowns.length?'verification':'complete':currentSignal.some(s=>s.kind==='gap')?'gap':currentSignal.length?'verification':mode==='expanded'?'helpful':'idle';
  const stateText={idle:'Omni is available',helpful:'Guided review active',thinking:'Preparing the next step',gap:'Gap identified',verification:'Needs verification',complete:'Assessment complete'}[characterState];
  useEffect(()=>{onDraftChange?.(dirty);return()=>onDraftChange?.(false);},[dirty,onDraftChange]);
  useEffect(()=>{
    if(record)return;
    const sessionKey=key+':greeted';
    try{if(!sessionStorage.getItem(sessionKey)&&!initial.dismissGreeting&&mode!=='dismissed'){setGreeting(true);sessionStorage.setItem(sessionKey,'1');}}catch{/* Greeting preferences do not store assessment answers. */}
  },[]);// eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{
    const controller=new AbortController();
    if(base){api.get(base,{signal:controller.signal}).then(({data})=>{
      if(!data||data.version!==guidedCatalog.version||!Number.isInteger(data.revision)||!Number.isInteger(data.step)||typeof data.completed!=='boolean')throw new Error('Saved interview could not be read. Close and reopen the assessment to retry; the assessment itself is unchanged.');
      validateAnswers(id,data.answers);
      setDraft(data);setAnswers(data.answers);saved.current=JSON.stringify(data.answers);setStep(data.step);
      if(data.completed){const output=generateResult(id,data.answers,data.generated_at?new Date(data.generated_at):new Date());setResult(output);setNarrative(data.narrative||output.narrative);}
    }).catch(e=>{if(!controller.signal.aborted)setError(formatError(e));});}
    else Promise.all(rows.filter(r=>['1.1','1.2'].includes(r.definition_id)).map(async r=>{const {data}=await api.get('/framework_assessments/'+r.framework_assessment_id+'/guided-assessment',{signal:controller.signal});return [r.definition_id,data.completed?'Completed':data.revision?'In progress':'Not started'];})).then(entries=>setStatuses(Object.fromEntries(entries))).catch(e=>{if(!controller.signal.aborted)setError(formatError(e));});
    return()=>controller.abort();
  },[base,id,rows]);
  const changeMode=value=>{setMode(value);setGreeting(false);try{localStorage.setItem(key,JSON.stringify({...readPreference(key),mode:value==='expanded'?'collapsed':value,dismissGreeting:true}));}catch{/* Cosmetic preferences are optional. */}};
  const close=()=>changeMode('collapsed');
  async function save(nextStep=step,completed=false,newAnswers=answers){
    if(!draft||disabled||busy)return false;
    setBusy(true);setError('');
    try{const {data}=await api.put(base,{version:guidedCatalog.version,answers:newAnswers,narrative:completed&&result?narrative:'',step:nextStep,completed,expected_revision:draft.revision});setDraft(data);setAnswers(data.answers);saved.current=JSON.stringify(data.answers);setStep(nextStep);return data;}
    catch(e){setError(formatError(e));return false;}finally{setBusy(false);}
  }
  async function proceed(){
    const final=step>=questions.length-1,data=await save(final?step:step+1,final);
    if(data&&final){const output=generateResult(id,data.answers,data.generated_at?new Date(data.generated_at):new Date());setResult(output);setNarrative(output.narrative);setReplace(false);}
    heading.current?.focus();
  }
  const put=(value)=>{setAnswers(p=>({...p,[question.id]:value}));setResult(null);setReplace(false);};
  const uncertain=question&&(question.id==='unresolved'?['Yes','Partially','Not sure']:['Partially','No','Not sure']).some(v=>Array.isArray(answers[question.id])?answers[question.id].includes(v):typeof answers[question.id]==='object'?Object.values(answers[question.id]||{}).includes(v):answers[question.id]===v);
  return <div className={'guided-pilot '+(record?'guided-in-assessment':'')} data-testid="guided-pilot">
    <div className="guided-launcher">
      {greeting&&<div className="guided-greeting"><p>Hi, I’m Omni. I’m here to help you see the full picture across your CIS IG1 program.</p><p>Open a safeguard and I’ll guide you through each requirement.</p><button onClick={()=>changeMode('collapsed')} aria-label="Dismiss Omni greeting">Dismiss</button></div>}
      {mode==='dismissed'?<Button ref={launcher} size="sm" variant="outline" onClick={()=>changeMode('collapsed')}>Show Omni</Button>:<>
      <button ref={launcher} className={'omni-launch-button '+(mode==='minimized'?'is-minimized':'')} onClick={()=>changeMode('expanded')} aria-label="Open Omni guided assessment" aria-expanded={mode==='expanded'} aria-controls={mode==='expanded'?panelId:undefined} aria-describedby={stateId}><OmniCharacter state={characterState}/></button>
      {record&&mode==='collapsed'&&<span className="guided-context-prompt">Ready to review this safeguard?</span>}
      </>}
      <span id={stateId} className="sr-only">{stateText}</span>
    </div>
    <Dialog open={mode==='expanded'} onOpenChange={open=>{if(!open)close();}}>
      {mode==='expanded'&&<DialogContent id={panelId} className="guided-panel bg-surface-card" onOpenAutoFocus={e=>{e.preventDefault();heading.current?.focus();}} onCloseAutoFocus={e=>{e.preventDefault();launcher.current?.focus();}} onPointerDownOutside={e=>e.preventDefault()}>
        <div className="omni-panel-header"><OmniCharacter state={characterState}/><div><DialogTitle ref={heading} tabIndex={-1}>{record?'Omni Guide · Safeguard '+id:'Guided Assessment with Omni'}</DialogTitle><p className="omni-state-text" role="status">{stateText}</p></div></div>
        <DialogDescription>{record?record.title:'Brawndo · CIS IG1 pilot'} · Deterministic guidance, not an independent assessment or evidence review.</DialogDescription>
        <div className="guided-panel-body">
          {error&&<p role="alert">{error}</p>}
          {!record?<><p>Omni helps you see the full picture. Start or resume either pilot interview. Other safeguards retain their normal assessment workflow.</p>{rows.filter(r=>['1.1','1.2'].includes(r.definition_id)).map(r=><section key={r.definition_id}><h3>{r.definition_id} · {r.title}</h3><p>{statuses[r.definition_id]||'Loading interview…'}</p><Button disabled={!statuses[r.definition_id]} onClick={()=>{close();onSelect(r);}}>{statuses[r.definition_id]==='Not started'?'Start':'Resume'} safeguard {r.definition_id}</Button></section>)}</>:!draft?<p role="status">Loading saved interview…</p>:result?<>
            <p>Review complete. Your recommendation is ready. Review the recommendation and generated implementation summary before applying them to the assessment.</p>
            <h3>Review before applying</h3>
            <p>Recommended Implementation Status: <strong>{STATUSES[result.status]}</strong></p>
            <label>Current Implementation draft<Textarea aria-label="Guided Current Implementation draft" rows={8} maxLength={20000} value={narrative} onChange={e=>{setNarrative(e.target.value);setReplace(false);}}/></label>
            {[['Basis for Recommendation',result.basis],['Confirmed Gaps',result.gaps],['Items Still Unknown or Requiring Verification',result.unknowns],['Recommended Next Steps',result.nextSteps],['Suggested Supporting Evidence',result.evidence]].map(([title,items])=><section key={title}><h3>{title}</h3>{items.length?<ul>{items.map((v,i)=><li key={i}>{v}</li>)}</ul>:<p>None reported.</p>}</section>)}
            <details><summary>Answers driving the recommendation</summary>{result.answers.map((a,i)=><p key={i}>{a.prompt} — {a.answer}</p>)}</details>
            <p>Apply changes only Current Implementation and Implementation Status in the unsaved assessment draft. Verification, evidence, findings, actions, and Last Assessed remain unchanged until normal Save.</p>
            {!!form?.implementation&&<label className="guided-replacement"><input type="checkbox" checked={replace} onChange={e=>setReplace(e.target.checked)}/> I understand the existing Current Implementation narrative will be replaced.</label>}
            <Button disabled={disabled||busy||!narrative.trim()||narrative.length>20000||!!form?.implementation&&!replace} onClick={()=>{onApply({implementation:narrative,status:result.status,guided_assessment_source:Object.fromEntries(['version','revision','generated_at'].map(k=>[k,draft[k]]))});close();}}>Apply to Assessment</Button>
            <Button variant="outline" disabled={disabled||busy} onClick={()=>{setResult(null);setStep(0);}}>Review answers</Button>
          </>:question?<>
            <p>I’ll help you review every material part of this safeguard, identify anything missing or uncertain, and prepare an implementation summary.</p>
            {characterState==='gap'&&<p>A recorded answer identifies a requirement that is not fully addressed.</p>}
            {characterState==='verification'&&<p>One or more items still need verification before a definitive recommendation can be made.</p>}
            <p aria-live="polite">Question group {Math.min(step+1,questions.length)} of {questions.length} · {draft.revision?'In progress':'Not started'}</p>
            <fieldset disabled={disabled||busy}><legend>{question.prompt}</legend><p>{question.help}</p>
              {['text','date'].includes(question.type)?question.type==='date'?<input aria-label={question.prompt} type="date" value={answers[question.id]||''} onInput={e=>put(e.target.value)}/>:<Textarea aria-label={question.prompt} maxLength={2000} value={answers[question.id]||''} onChange={e=>put(e.target.value)}/>:question.type==='matrix'?question.rows.map(row=><label key={row}>{row}<select aria-label={row} value={answers[question.id]?.[row]||''} onChange={e=>put({...answers[question.id],[row]:e.target.value})}><option value="">Not recorded</option>{question.choices.map(v=><option key={v}>{v}</option>)}</select></label>):question.type==='multi'?question.choices.map(v=><label className="guided-choice" key={v}><input type="checkbox" checked={(answers[question.id]||[]).includes(v)} onChange={e=>put(e.target.checked?[...(answers[question.id]||[]),v]:(answers[question.id]||[]).filter(x=>x!==v))}/>{v}</label>):<select aria-label={question.prompt} value={answers[question.id]||''} onChange={e=>put(e.target.value)}><option value="">Not recorded</option>{question.choices.map(v=><option key={v}>{v}</option>)}</select>}
              {uncertain&&<label>What is missing, or who can verify this?<Textarea aria-label="Missing elements or verification owner" maxLength={2000} value={answers[question.id+'_detail']||''} onChange={e=>setAnswers(p=>({...p,[question.id+'_detail']:e.target.value}))}/></label>}
            </fieldset>
            <div className="guided-actions"><Button variant="outline" disabled={busy||step===0} onClick={()=>{setStep(n=>n-1);heading.current?.focus();}}>Back</Button><Button disabled={disabled||busy} onClick={proceed}>{step>=questions.length-1?'Generate review':'Continue'}</Button></div>
          </>:null}
          {record&&draft&&<div className="guided-actions"><Button variant="outline" disabled={disabled||busy} onClick={async()=>{if(await save(step,!!result))close();}}>Save and exit</Button><Button variant="ghost" disabled={disabled||busy} onClick={()=>setRestart(true)}>Restart assessment</Button></div>}
          {restart&&<section role="group" aria-label="Confirm restart"><p>Restart replaces this saved interview only. The assessment and its history remain unchanged.</p><Button disabled={busy} onClick={async()=>{if(await save(0,false,{})){setResult(null);setNarrative('');setRestart(false);}}}>Confirm restart</Button><Button variant="outline" onClick={()=>setRestart(false)}>Cancel restart</Button></section>}
          <p>Question set: {guidedCatalog.version}. Answers are not evidence verification or a compliance opinion.</p>
        </div>
        <div className="guided-actions"><Button variant="outline" onClick={()=>changeMode('minimized')}>Minimize</Button><Button variant="ghost" onClick={()=>changeMode('dismissed')}>Dismiss assistant</Button></div>
      </DialogContent>}
    </Dialog>
  </div>;
}
