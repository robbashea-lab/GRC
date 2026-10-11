import {useCallback,useEffect,useId,useRef,useState} from 'react';
import {useAuth} from '@/context/AuthContext';
import {useOrg} from '@/context/OrgContext';
import api,{formatError} from '@/lib/api';
import {isoGuidedCatalog,isoGuidedEnabled,isoGroups,isoGuidedResult,validateIsoCompletion} from '@/lib/isoGuidedAssessment';
import {operatorStatuses} from '@/lib/frameworkOperator';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './ui/dialog';
import {Button} from './ui/button';
import {Textarea} from './ui/textarea';
import OmniCharacter from './OmniCharacter';
import OmniDock from './OmniDock';
import OmniWindow from './OmniWindow';
import './GuidedAssessor.css';
import './RefinedOmni.css';

const LABELS=operatorStatuses('iso-27001');
const preferences=key=>{try{return JSON.parse(localStorage.getItem(key)||'{}');}catch{return {};}};
const source=draft=>Object.fromEntries(['version','revision','generated_at'].map(key=>[key,draft[key]]));
const soaFields=current=>({soa_applicability:current?.soa_applicability||'',soa_justification:current?.soa_justification||''});
export default function IsoGuidedAssessor(props){
  const {user}=useAuth();
  if(props.record&&(props.record.client_id!==props.clientId||props.record.framework_key!=='iso-27001')||!isoGuidedEnabled(props.clientId,user,'iso-27001',props.configuration,props.record?.definition_id))return null;
  if(props.record&&props.current&&(props.current.client_id!==props.clientId||props.current.framework_assessment_id!==props.record.framework_assessment_id))return null;
  return <IsoPilot key={user.user_id+':'+props.clientId+':'+(props.record?.framework_assessment_id||'program')} {...props} user={user}/>;
}

function IsoPilot({clientId,user,record,current=record,programContent,programLabel='ISO 27001 programme with Omnibot',form,assessmentDirty=false,relatedDraft=false,onDraftChange,onSaveAssessment,disabled=false}){
  const org=useOrg(),clientName=org?.clients?.find(client=>client.client_id===clientId)?.name||(org?.currentClient?.client_id===clientId?org.currentClient.name:null)||'The organization';
  // A directory refresh changes display context, not interview identity. Explicit
  // hydration uses the latest name without reloading and discarding dirty work.
  const clientNameRef=useRef(clientName);clientNameRef.current=clientName;
  const key='guided-pilot-ui:'+user.user_id+':'+clientId+':iso-27001',initial=preferences(key),panelId=useId(),stateId=useId();
  const [mode,setMode]=useState(record&&new URLSearchParams(window.location.search).get('guided')==='pilot'?'expanded':'collapsed');
  const [prompt,setPrompt]=useState(!initial.invitationsDisabled),[draft,setDraft]=useState(null),[answers,setAnswers]=useState({}),[step,setStep]=useState(0),[view,setView]=useState('position');
  const [narrative,setNarrative]=useState(''),[edited,setEdited]=useState(false),[basis,setBasis]=useState(''),[busy,setBusy]=useState(false),[loaded,setLoaded]=useState(!record),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [confirmClose,setConfirmClose]=useState(false),[confirmReload,setConfirmReload]=useState(false),[confirmUpdate,setConfirmUpdate]=useState(false),[closeAfter,setCloseAfter]=useState(false),[compare,setCompare]=useState(false),[confirmed,setConfirmed]=useState(false),[history,setHistory]=useState(null),[restart,setRestart]=useState(false);
  const [soa,setSoa]=useState(()=>soaFields(current)),[soaBase,setSoaBase]=useState(()=>JSON.stringify(soaFields(current))),[soaEditing,setSoaEditing]=useState(false);
  const launcher=useRef(null),heading=useRef(null),saved=useRef({answers:'{}',narrative:''}),pending=useRef(false),active=useRef(true),native=useRef(null);
  native.current={form,current,assessmentDirty,relatedDraft,onSaveAssessment};
  const id=record?.definition_id,route=record?'/framework_assessments/'+record.framework_assessment_id+'/guided-assessment':null;
  const version=draft?.version||isoGuidedCatalog.version,updated=version!==isoGuidedCatalog.version;
  let groups=[],result=null,validationError='';
  if(id){try{groups=isoGroups(id,answers,version);result=isoGuidedResult(id,answers,version,clientName);}catch(e){validationError=formatError(e);}}
  const index=Math.min(step,Math.max(0,groups.length-1)),group=groups[index];
  const interviewDirty=JSON.stringify(answers)!==saved.current.answers||narrative!==saved.current.narrative;
  const annex=id?.startsWith('A.'),soaDirty=annex&&JSON.stringify(soa)!==soaBase;
  const dirty=interviewDirty||soaDirty,implementationAllowed=!annex||current?.soa_applicability==='included'&&!!current?.soa_justification?.trim();
  const ownApplication=!!draft?.completed&&draft.base_scope_fingerprint===draft.current_scope_fingerprint&&current?.guided_assessment_source?.by===user.user_id&&current?.guided_assessment_source?.version===draft.version&&current?.guided_assessment_source?.revision===draft.revision;
  const stale=!!draft?.revision&&draft.lineage_stale!==false&&!ownApplication;
  const blocked=disabled||busy||!loaded||updated||stale||assessmentDirty||!!validationError;
  const character=busy?'thinking':view==='summary'&&result?(result.gaps.length?'gap':result.unknowns.length?'verification':'complete'):mode==='minimized'?'minimized':'helpful';
  useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  useEffect(()=>{if(!soaDirty){setSoa(soaFields(current));setSoaBase(JSON.stringify(soaFields(current)));}},[current,soaDirty]);
  useEffect(()=>{onDraftChange?.(dirty||busy);return()=>onDraftChange?.(false);},[dirty,busy,onDraftChange]);
  useEffect(()=>{
    if(!dirty)return;const warn=e=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);
  },[dirty]);
  const adopt=useCallback((data,restoring=false)=>{
    setDraft(data);setAnswers(data.answers||{});setStep(data.step||0);setNarrative(data.narrative||'');saved.current={answers:JSON.stringify(data.answers||{}),narrative:data.narrative||''};
    if(restoring){
      let manual=!!data.narrative;
      try{manual=manual&&data.narrative!==isoGuidedResult(id,data.answers||{},data.version,clientNameRef.current).narrative;}catch{ /* Retain unreadable drafts; the validation alert prevents application. */ }
      setEdited(manual||!!data.narrative&&!data.summary_review);
      // Completion alone is not wording approval: retained metadata binds the
      // wording to its reviewed answers, including across failed saves/reloads.
      setBasis(data.summary_review?.version===data.version?JSON.stringify(data.summary_review.answers):'');
    }
  },[id]);
  useEffect(()=>{
    if(!route)return;const controller=new AbortController();
    api.get(route,{signal:controller.signal}).then(({data})=>{if(!controller.signal.aborted){adopt(data,true);setLoaded(true);}}).catch(e=>{if(!controller.signal.aborted){setError(formatError(e));setLoaded(true);}});
    return()=>controller.abort();
  },[route,adopt]);
  function changeMode(value){setMode(value);setPrompt(false);if(value!=='expanded')launcher.current?.focus({preventScroll:true});}
  function close(){if(busy)return;if(dirty)setConfirmClose(true);else changeMode('collapsed');}
  async function load(){setBusy(true);setError('');try{const {data}=await api.get(route);if(active.current){adopt(data,true);setLoaded(true);}return data;}catch(e){if(active.current)setError(formatError(e));return null;}finally{if(active.current)setBusy(false);}}
  function put(key,value){setAnswers(old=>({...old,[key]:value}));setNotice('');}
  async function persist(nextStep,completed,override={}){
    if(disabled||pending.current||!draft)return null;
    pending.current=true;setBusy(true);setError('');
    try{
      let base=draft;
      // After our own native save, explicitly rebase the unchanged saved interview.
      // Other native changes require the operator's comparison below.
      if(ownApplication&&!override.restart&&!override.rebase){
        const latest=(await api.get(route)).data;
        if(latest.base_scope_fingerprint!==latest.current_scope_fingerprint||latest.version!==draft.version||latest.revision!==draft.revision||native.current.current?.guided_assessment_source?.revision!==latest.revision||latest.current_assessment_token!==native.current.current?.last_saved)throw new Error('The saved assessment, interview or scope changed. Compare the current saved position before continuing.');
        if(latest.lineage_stale)base=(await api.put(route,{version:latest.version,answers:latest.answers,step:latest.step,completed:false,narrative:latest.narrative||'',expected_revision:latest.revision,rebase:true,base_assessment_token:latest.current_assessment_token,base_scope_fingerprint:latest.current_scope_fingerprint})).data;
      }
      const output=completed?isoGuidedResult(id,answers,version,clientName):null;
      const body={version,answers,step:nextStep,completed,narrative,summary_review:basis?{version,answers:JSON.parse(basis)}:null,expected_revision:base.revision,...(base.revision===0?{base_assessment_token:base.current_assessment_token,base_scope_fingerprint:base.current_scope_fingerprint}:{}),result:output?{...output,narrative:override.narrative??narrative}:null,...override};
      const {data}=await api.put(route,body);if(!active.current)return null;adopt(data);return data;
    }catch(e){if(active.current)setError(formatError(e));return null;}finally{pending.current=false;if(active.current)setBusy(false);}
  }
  async function next(){
    try{for(const q of group.questions.filter(q=>q.type!=='text')){if(!answers[q.id])throw new Error('Choose an answer for each question. Not sure is a valid response.');if(q.type==='context'&&answers[q.id]==='Not relevant here'&&!answers[q.id+'_detail']?.trim())throw new Error('Explain why this context is not relevant here. This does not decide SoA applicability.');}
      if(index===groups.length-1){validateIsoCompletion(id,answers,version);const generated=result.narrative,keep=edited?narrative:generated;
        if(await persist(index,true,{narrative:keep,...(!edited?{summary_review:{version,answers}}:{})})){setNarrative(keep);if(!edited)setBasis(JSON.stringify(answers));setView('summary');}
      }else if(await persist(index+1,false))setStep(index+1);
      heading.current?.focus({preventScroll:true});
    }catch(e){setError(formatError(e));}
  }
  async function saveClose(){
    if(soaDirty){await saveSoa(true);return;}
    if(view==='summary'){requestSave(true);return;}
    if(await persist(index,false)){setConfirmClose(false);changeMode('collapsed');}
  }
  function requestSave(close=false){setCloseAfter(close);if(current?.implementation?.trim()||current?.status!=='not_assessed')setConfirmUpdate(true);else commit(close);}
  async function commit(close=false){
    if(blocked||relatedDraft||soaDirty||!implementationAllowed||pending.current||!onSaveAssessment||!narrative.trim()||edited&&basis!==JSON.stringify(answers))return;
    setNotice('');
    const expected=JSON.stringify(native.current.form),token=native.current.current?.last_saved;
    const data=await persist(index,true,{narrative});if(!data)return;
    pending.current=true;setBusy(true);setConfirmUpdate(false);
    try{
      const latest=native.current;
      if(latest.assessmentDirty||latest.relatedDraft||JSON.stringify(latest.form)!==expected||latest.current?.last_saved!==token)throw new Error('The native assessment or a related-record draft changed while the interview was saving. Review it before retrying.');
      if(!await latest.onSaveAssessment({implementation:data.narrative,status:data.result.status,guided_assessment_source:source(data)},expected))throw new Error('The assessment save could not be confirmed. Your interview and wording are retained. Review the native error. Reload the saved assessment before retrying.');
      if(active.current){setNotice('Assessment saved. Evidence verification and linked work are unchanged.');setBasis(JSON.stringify(answers));if(close){setConfirmClose(false);changeMode('collapsed');}}
    }catch(e){if(active.current)setError(formatError(e));}finally{pending.current=false;if(active.current)setBusy(false);}
  }
  async function saveSoa(close=false){
    if(!annex||disabled||busy||pending.current||assessmentDirty||relatedDraft||interviewDirty||!onSaveAssessment)return;
    if(!['included','excluded'].includes(soa.soa_applicability)||!soa.soa_justification.trim()){setError('Choose inclusion or exclusion and justify the decision using risk, scope and relevant obligations.');return;}
    pending.current=true;setBusy(true);setError('');setNotice('');
    const expected=JSON.stringify(native.current.form),decision={...soa};let committed=false;
    try{
      if(!await native.current.onSaveAssessment(decision,expected))throw new Error('The applicability save could not be confirmed. Your decision and justification are retained. Review the native error. Reload the saved assessment before retrying.');
      if(!active.current)return;
      committed=true;setSoaBase(JSON.stringify(decision));setSoaEditing(false);
      const refreshed=await api.get(route);
      if(!active.current)return;
      adopt(refreshed.data,true);setLoaded(true);setNotice('Applicability decision saved. Compare any retained interview with the current saved position before continuing.');
      if(close){setConfirmClose(false);changeMode('collapsed');}
    }catch(e){if(active.current)setError(committed?'Applicability decision saved, but interview refresh failed. Reload the saved interview before continuing. '+formatError(e):formatError(e));}finally{pending.current=false;if(active.current)setBusy(false);}
  }
  async function beginNew(empty=false,discard=false){
    if(disabled||busy||assessmentDirty||soaDirty)return;
    if(interviewDirty&&!discard){setRestart(false);setConfirmReload(empty?'restart':'rebase');return;}
    setError('');const latest=await load();if(!latest)return;
    if(empty){if(await persist(0,false,{version:isoGuidedCatalog.version,answers:{},narrative:'',summary_review:null,result:null,restart:true,expected_revision:latest.revision,base_assessment_token:latest.current_assessment_token,base_scope_fingerprint:latest.current_scope_fingerprint})){setEdited(false);setBasis('');setView('interview');setRestart(false);}}
    else if(await persist(latest.step,false,{version:latest.version,answers:latest.answers,narrative:latest.narrative||'',result:null,rebase:true,expected_revision:latest.revision,base_assessment_token:latest.current_assessment_token,base_scope_fingerprint:latest.current_scope_fingerprint})){setCompare(false);setConfirmed(false);setView('interview');}
  }
  async function discardReload(){
    if(confirmReload==='restart'||confirmReload==='rebase'){
      const empty=confirmReload==='restart';setConfirmReload(false);await beginNew(empty,true);
    }else if(await load()){
      setSoa(soaFields(native.current.current));setSoaBase(JSON.stringify(soaFields(native.current.current)));setSoaEditing(false);setConfirmReload(false);
    }
  }
  async function historyLoad(more=false){setBusy(true);setError('');try{const {data}=await api.get(route+'/history',{params:more?{before_revision:history.next_before_revision}:{}});if(active.current){setHistory(previous=>({...data,items:more?[...previous.items,...data.items]:data.items}));setView('history');}}catch(e){setError(formatError(e));}finally{if(active.current)setBusy(false);}}
  const start=()=>{setView(draft?.completed?'summary':'interview');heading.current?.focus({preventScroll:true});};
  const saveDisabled=blocked||relatedDraft||soaDirty||!implementationAllowed||!narrative.trim()||edited&&basis!==JSON.stringify(answers);
  const soaBlocked=disabled||busy||assessmentDirty||relatedDraft||interviewDirty;
  return <div className={'guided-pilot guided-lifecycle omni-refined '+(record?'guided-in-assessment':'')} data-testid="iso-guided-assessment">
    <OmniDock preferenceKey={key} freePosition inAssessment={!!record} name="Omnibot" focused>
      {mode==='dismissed'?<Button variant="outline" size="sm" ref={launcher} onClick={()=>changeMode('collapsed')}>Show Omnibot</Button>:<>
        <button type="button" ref={launcher} className={'omni-launch-button '+(mode==='minimized'?'is-minimized':'')} aria-label="Open Omnibot guide" aria-expanded={mode==='expanded'} aria-controls={mode==='expanded'?panelId:undefined} aria-describedby={stateId} onClick={()=>changeMode('expanded')}><OmniCharacter approved state={character}/></button>
        {prompt&&mode==='collapsed'&&<div className="guided-context-prompt" role="complementary" aria-label="Omnibot invitation"><p>{record?(draft?.revision?'Your ISO 27001 interview is available to resume.':'Review this ISO 27001 requirement with Omnibot.'):'Review '+programLabel+'.'}</p><button type="button" className="omni-invitation-x" aria-label="Close invitation" onClick={()=>setPrompt(false)}>×</button></div>}
        <details className="omni-position-controls"><summary>Omnibot preferences</summary><div><Button variant="ghost" onClick={()=>changeMode('dismissed')}>Hide Omnibot</Button><Button variant="ghost" onClick={()=>{try{localStorage.setItem(key,JSON.stringify({...preferences(key),invitationsDisabled:true}));}catch{/* Optional invitation preference. */}setPrompt(false);}}>Turn off invitations</Button></div></details>
      </>}<span className="sr-only" id={stateId}>{busy?'Saving review':'Omnibot is available'}</span>
    </OmniDock>
    <Dialog open={mode==='expanded'} modal={false} onOpenChange={open=>{if(!open)close();}}>
      {mode==='expanded'&&<OmniWindow id={panelId} name="Omnibot" refined program={!record} anchor={()=>launcher.current?.getBoundingClientRect()} onMinimize={()=>changeMode('minimized')} onClose={close} onOpenAutoFocus={()=>heading.current?.focus({preventScroll:true})} onCloseAutoFocus={()=>launcher.current?.focus({preventScroll:true})}>
        <div className="omni-panel-header"><OmniCharacter approved state={character}/><div><DialogTitle id={panelId+'-title'} ref={heading} tabIndex={0}>{record?'Omnibot guide · Requirement '+id:programLabel}</DialogTitle></div></div>
        <DialogDescription id={panelId+'-description'} className="sr-only">{record?'Review reported practices and prepare an implementation write-up.':'Review the ISO programme guidance and open the existing native workflow.'} Focus the heading and use arrow keys to move the window, or Alt and arrow keys to resize it.</DialogDescription>
        <div className="guided-panel-body">
          {error&&<p role="alert">{error}<Button variant="outline" disabled={busy} onClick={()=>dirty?setConfirmReload(true):load()}>Reload saved interview</Button></p>}
          {validationError&&<p role="alert">{validationError} Saved answers and wording are retained. This interview cannot be generated or applied until its question version and answers are supported.</p>}
          {notice&&<p role="status">{notice}</p>}{interviewDirty&&<p role="status">Interview edits are not saved yet. Question saves do not change the native assessment.</p>}{soaDirty&&<p role="status">Applicability edits are not saved yet. Save the decision explicitly or cancel it.</p>}
          {record&&annex&&!implementationAllowed&&<p role="alert">Save an included SoA decision and its justification before saving an implementation summary. Interview progress and history remain separate.</p>}
          {!loaded&&<p role="status">Loading interview…</p>}
          {record&&assessmentDirty&&<p role="alert">Save or discard the native assessment draft before saving this summary.</p>}
          {record&&relatedDraft&&<p role="alert">Finish or discard the related-record draft before saving this summary. Interview progress can still be saved.</p>}
          {record&&stale&&<section><p role="alert">The saved assessment or scope changed after this interview began. Saved answers and history are retained.</p><p className="whitespace-pre-wrap">{current?.implementation||'No saved implementation write-up.'}</p><Button variant="outline" disabled={disabled||busy||assessmentDirty} onClick={()=>setCompare(true)}>Compare &amp; continue</Button></section>}
          {compare&&<section><h3>Continue from the current saved assessment</h3><p className="whitespace-pre-wrap">{current?.implementation||'No saved implementation write-up.'}</p><label><input type="checkbox" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)}/> I compared the saved assessment and confirmed which answers remain relevant.</label><Button disabled={!confirmed||disabled||busy||assessmentDirty} onClick={()=>beginNew()}>Retain answers &amp; continue</Button><Button variant="outline" onClick={()=>setCompare(false)}>Cancel comparison</Button></section>}
          {updated&&<p role="alert">This interview uses retained historical guidance. Begin a new current-version review before updating the assessment.</p>}
          {!record?(typeof programContent==='function'?programContent({close:()=>changeMode('collapsed')}):programContent):draft&&<>
            <div className="guided-actions"><Button variant="outline" disabled={busy} onClick={()=>setView('position')}>Current position</Button><Button variant="outline" disabled={busy||!draft.revision} onClick={()=>historyLoad()}>Interview history</Button></div>
{view==='position'&&<>
  <h3>Current saved position</h3><p>{id} — {record.title}</p>
  <p>Implementation: {LABELS[current?.status]||'Status unavailable'}</p>
  <p className="whitespace-pre-wrap">{current?.implementation||'No implementation write-up is recorded.'}</p>
  <p>Verification: {current?.verification?.replaceAll('_',' ')||'Not verified'}</p>
  <p>Reported implementation is not independent verification, an audit opinion or certification.</p>
  {annex&&<section className="omni-question-group" aria-label="Statement of Applicability decision">
    <h3>Decide applicability separately</h3>
    <p>Consider the risks being treated, the ISMS scope, and relevant legal, contractual and business obligations. Explain why this control is necessary or why its exclusion is justified. Annex A is a reference set; other necessary controls may also be needed.</p>
    <p>Outsourcing does not automatically justify exclusion. Consider retained responsibilities, supplier requirements and oversight.</p>
    <p>Saved decision: {current?.soa_applicability==='included'?'Included':current?.soa_applicability==='excluded'?'Excluded':'Undetermined'}</p>
    <p className="whitespace-pre-wrap">{current?.soa_justification||'No applicability justification is recorded.'}</p>
    {current?.soa_applicability==='excluded'&&<p>Implementation and interview history are retained. Reassess applicability deliberately before applying a new implementation summary.</p>}
    {(soaEditing||!current?.soa_applicability||!current?.soa_justification?.trim())?<fieldset disabled={soaBlocked}>
      <label>Applicability<select aria-label="Omnibot SoA applicability" required value={soa.soa_applicability} onChange={e=>{setSoa(old=>({...old,soa_applicability:e.target.value}));setNotice('');}}>
        <option value="">Choose a decision</option><option value="included">Include in the SoA</option><option value="excluded">Exclude with justification</option>
      </select></label>
      <label>Risk, scope and obligations justification (required)<Textarea aria-label="Omnibot SoA justification" required maxLength={4000} value={soa.soa_justification} onChange={e=>{setSoa(old=>({...old,soa_justification:e.target.value}));setNotice('');}}/></label>
      <p>This explicit native save updates only applicability and justification. It preserves the recorded implementation, status and history.</p>
      <div className="guided-actions"><Button disabled={soaBlocked||!soaDirty||!soa.soa_applicability||!soa.soa_justification.trim()} onClick={()=>saveSoa()}>Save applicability decision</Button>
        <Button variant="outline" disabled={busy} onClick={()=>{setSoa(soaFields(current));setSoaBase(JSON.stringify(soaFields(current)));setSoaEditing(false);}}>Cancel decision</Button></div>
    </fieldset>:<Button variant="outline" disabled={soaBlocked} onClick={()=>setSoaEditing(true)}>Reassess applicability</Button>}
  </section>}
  <div className="guided-actions"><Button disabled={disabled||busy||soaDirty||updated||!!validationError} onClick={start}>{draft.revision?'Resume your review':'Start'}</Button><Button variant="outline" disabled={disabled||busy||assessmentDirty||soaDirty} onClick={()=>interviewDirty?setConfirmReload('restart'):setRestart(true)}>Begin a new review</Button></div>
</>}
{view==='interview'&&group&&<><div className="omni-group-progress" aria-label={`Question group ${index+1} of ${groups.length}`}><p><strong>Question group {index+1} of {groups.length}</strong><span>{group.title}</span></p><div>{groups.map((g,i)=><span key={g.id} className={i===index?'current':i<index?'done':''}/>)}</div></div><fieldset disabled={blocked} className="omni-question-group"><legend className="sr-only">{group.title}</legend>{group.questions.map((q,i)=><section className="omni-question" key={q.id}>{i===0?<h3>{q.prompt}</h3>:<label htmlFor={'iso-answer-'+q.id}>{q.prompt}</label>}{q.help&&<p className="omni-help">{q.help}</p>}{q.type==='text'?<Textarea id={'iso-answer-'+q.id} aria-label={q.prompt} value={answers[q.id]||''} maxLength={2000} onChange={e=>put(q.id,e.target.value)}/>:<div className="omni-answer-choices" role="group" aria-label={q.prompt}>{q.choices.map(value=><button type="button" key={value} aria-pressed={answers[q.id]===value} onClick={()=>put(q.id,value)}>{value}</button>)}</div>}{q.type!=='text'&&<label className="omni-help" htmlFor={'iso-detail-'+q.id}>How this works / relevant context {q.type==='context'&&answers[q.id]==='Not relevant here'?'(required for this context answer)':'(optional)'}<Textarea id={'iso-detail-'+q.id} maxLength={2000} value={answers[q.id+'_detail']||''} onChange={e=>put(q.id+'_detail',e.target.value)}/></label>}</section>)}{index===groups.length-1&&<><p className="omni-help">Use the question choices for substantive gaps or uncertainty. These optional notes add context; they do not decide readiness.</p><label>Gap context (optional)<Textarea maxLength={2000} value={answers.gaps||''} onChange={e=>put('gaps',e.target.value)}/></label><label>Confirmation context (optional)<Textarea maxLength={2000} value={answers.unknowns||''} onChange={e=>put('unknowns',e.target.value)}/></label></>}</fieldset><div className="omni-action-bar"><Button variant="outline" disabled={busy||index===0} onClick={()=>setStep(index-1)}>Back</Button><Button disabled={blocked} onClick={next}>Save &amp; next</Button><Button variant="outline" disabled={blocked} onClick={saveClose}>Save &amp; close</Button></div></>}
            {view==='summary'&&result&&<><h3>Review your assessment summary</h3><p>{id} — {record.title}</p><p>Proposed implementation status: <strong>{LABELS[result.status]}</strong></p>{edited&&basis!==JSON.stringify(answers)&&<section role="status"><p>Your answers changed after you edited the write-up. Your wording is retained; review it before saving.</p><Button variant="outline" disabled={blocked} onClick={()=>{setNarrative(result.narrative);setEdited(false);setBasis(JSON.stringify(answers));}}>Refresh from answers</Button><Button variant="outline" disabled={blocked} onClick={()=>setBasis(JSON.stringify(answers))}>Keep my wording after review</Button></section>}<label>Current Implementation<Textarea aria-label="Omnibot implementation summary" rows={14} maxLength={20000} disabled={disabled||busy} value={narrative} onChange={e=>{setNarrative(e.target.value);if(!edited)setBasis(JSON.stringify(answers));setEdited(true);}}/></label><p>Saving updates the native implementation and implementation status. Applicability, evidence verification and linked work remain separate.</p><div className="guided-actions"><Button variant="outline" disabled={busy} onClick={()=>{setView('interview');setStep(Math.max(0,groups.length-1));}}>Back to questions</Button><Button disabled={saveDisabled} onClick={()=>requestSave()}>{current?.implementation?.trim()||current?.status!=='not_assessed'?'Update assessment':'Save assessment'}</Button><Button variant="outline" disabled={saveDisabled} onClick={()=>requestSave(true)}>Save &amp; close</Button></div></>}
{view==='history'&&<><h3>Retained interview history</h3>{history?.items?.map(item=><section key={item.revision}><p>Revision {item.revision} · {item.version} · {item.updated_at}</p><p className="whitespace-pre-wrap">{item.narrative||'Interview progress only.'}</p></section>)}{history&&!history.items.length&&<p>No earlier saved interview snapshots.</p>}{history?.has_more&&<Button variant="outline" disabled={busy} onClick={()=>historyLoad(true)}>Load earlier snapshots</Button>}<Button variant="outline" onClick={()=>setView('position')}>Return to current position</Button></>}
          </>}
        </div>
      </OmniWindow>}
    </Dialog>
    <Dialog open={!!confirmReload} onOpenChange={setConfirmReload}><DialogContent className="omni-refined-close">
      <DialogTitle>{confirmReload==='restart'?'Discard edits and begin a new review?':confirmReload==='rebase'?'Discard edits and continue from the saved interview?':'Reload saved interview?'}</DialogTitle>
      <DialogDescription>{confirmReload==='restart'?'Your unsaved answers and wording will be discarded. The previously saved interview remains in history; the new interview begins empty.':confirmReload==='rebase'?'Your unsaved answers and wording will be discarded. Only the last saved answers and wording will be retained for continuation.':'Your unsaved answers, wording and applicability edits will be replaced by their saved values.'} Native records are unchanged.</DialogDescription>
      <div className="guided-actions"><Button variant="outline" onClick={()=>setConfirmReload(false)}>Keep editing</Button><Button disabled={busy||confirmReload!==true&&(disabled||assessmentDirty||soaDirty)} onClick={discardReload}>{confirmReload==='restart'?'Discard unsaved edits & begin new review':confirmReload==='rebase'?'Discard unsaved edits & continue':'Discard unsaved edits & reload'}</Button></div>
    </DialogContent></Dialog>
    <Dialog open={confirmUpdate} onOpenChange={open=>{if(!busy)setConfirmUpdate(open);}}><DialogContent className="omni-refined-close"><DialogTitle>Update this assessment?</DialogTitle><DialogDescription>This will replace the saved Current Implementation and ISO 27001 implementation status for {clientName} — Requirement {id} with the reviewed summary. Verification, organizational Controls and linked work are unchanged.</DialogDescription><div className="guided-actions"><Button variant="outline" disabled={busy} onClick={()=>setConfirmUpdate(false)}>Cancel</Button><Button disabled={busy||disabled} onClick={()=>commit(closeAfter)}>Yes, update assessment</Button></div></DialogContent></Dialog>
    <Dialog open={confirmClose} onOpenChange={setConfirmClose}><DialogContent className="omni-refined-close"><DialogTitle>Unsaved guide changes</DialogTitle><DialogDescription>Save your work before closing, keep editing, or discard the unsaved guide edits. Saved native records are not discarded.</DialogDescription><div className="guided-actions"><Button variant="outline" onClick={()=>setConfirmClose(false)}>Keep editing</Button><Button variant="outline" disabled={busy} onClick={()=>{adopt(draft);setSoa(soaFields(current));setSoaBase(JSON.stringify(soaFields(current)));setSoaEditing(false);setConfirmClose(false);changeMode('collapsed');}}>Discard changes</Button><Button disabled={disabled||busy||soaDirty&&(soaBlocked||!soa.soa_applicability||!soa.soa_justification.trim())||!soaDirty&&view==='summary'&&saveDisabled} onClick={saveClose}>Save &amp; close</Button></div></DialogContent></Dialog>
    <Dialog open={restart} onOpenChange={setRestart}><DialogContent className="omni-refined-close"><DialogTitle>Begin a new review?</DialogTitle><DialogDescription>The previous interview is retained in history. The native assessment is unchanged until you review and explicitly save a new summary.</DialogDescription><div className="guided-actions"><Button variant="outline" onClick={()=>setRestart(false)}>Cancel</Button><Button disabled={disabled||busy||assessmentDirty} onClick={()=>beginNew(true)}>Begin a new review</Button></div></DialogContent></Dialog>
  </div>;
}
