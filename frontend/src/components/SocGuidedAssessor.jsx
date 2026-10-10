import {useCallback,useEffect,useId,useRef,useState} from 'react';
import {useAuth} from '@/context/AuthContext';
import {useOrg} from '@/context/OrgContext';
import api,{formatError} from '@/lib/api';
import {socGuidedCatalog,socGuidedEnabled,socGroups,socGuidedResult,validateSocCompletion} from '@/lib/socGuidedAssessment';
import {operatorStatuses} from '@/lib/frameworkOperator';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './ui/dialog';
import {Button} from './ui/button';
import {Textarea} from './ui/textarea';
import OmniCharacter from './OmniCharacter';
import OmniDock from './OmniDock';
import OmniWindow from './OmniWindow';
import './GuidedAssessor.css';
import './RefinedOmni.css';

const LABELS=operatorStatuses('soc-2'),EMPTY=[];
const preferences=key=>{try{return JSON.parse(localStorage.getItem(key)||'{}');}catch{return {};}};
const source=draft=>Object.fromEntries(['version','revision','generated_at'].map(key=>[key,draft[key]]));
export default function SocGuidedAssessor(props){
  const {user}=useAuth();
  if(props.record?.client_id&&props.record.client_id!==props.clientId||!socGuidedEnabled(props.clientId,user,'soc-2',props.configuration,props.record?.definition_id))return null;
  return <SocPilot key={user.user_id+':'+props.clientId+':'+(props.record?.framework_assessment_id||'program')} {...props} user={user}/>;
}

function SocPilot({clientId,user,configuration,record,current=record,rows=EMPTY,draftSummaries={},contextComplete=false,onSelect,onViewAll,form,assessmentDirty=false,relatedDraft=false,onDraftChange,onSaveAssessment,disabled=false}){
  const org=useOrg(),clientName=org?.clients?.find(client=>client.client_id===clientId)?.name||(org?.currentClient?.client_id===clientId?org.currentClient.name:null)||'The organization';
  // A directory refresh changes display context, not interview identity. Explicit
  // hydration uses the latest name without reloading and discarding dirty work.
  const clientNameRef=useRef(clientName);clientNameRef.current=clientName;
  const key='guided-pilot-ui:'+user.user_id+':'+clientId+':soc-2',initial=preferences(key),panelId=useId(),stateId=useId();
  const [mode,setMode]=useState(record&&new URLSearchParams(window.location.search).get('guided')==='pilot'?'expanded':'collapsed');
  const [prompt,setPrompt]=useState(!initial.invitationsDisabled),[draft,setDraft]=useState(null),[answers,setAnswers]=useState({}),[step,setStep]=useState(0),[view,setView]=useState('position');
  const [narrative,setNarrative]=useState(''),[edited,setEdited]=useState(false),[basis,setBasis]=useState(''),[busy,setBusy]=useState(false),[loaded,setLoaded]=useState(!record),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [confirmClose,setConfirmClose]=useState(false),[confirmReload,setConfirmReload]=useState(false),[confirmUpdate,setConfirmUpdate]=useState(false),[closeAfter,setCloseAfter]=useState(false),[compare,setCompare]=useState(false),[confirmed,setConfirmed]=useState(false),[history,setHistory]=useState(null),[restart,setRestart]=useState(false);
  const launcher=useRef(null),heading=useRef(null),saved=useRef({answers:'{}',narrative:''}),pending=useRef(false),active=useRef(true),native=useRef(null);
  native.current={form,current,assessmentDirty,relatedDraft,onSaveAssessment};
  const id=record?.definition_id,route=record?'/framework_assessments/'+record.framework_assessment_id+'/guided-assessment':null;
  const version=draft?.version||socGuidedCatalog.version,updated=version!==socGuidedCatalog.version;
  let groups=[],result=null,validationError='';
  if(id){try{groups=socGroups(id,answers,version);result=socGuidedResult(id,answers,version,clientName);}catch(e){validationError=formatError(e);}}
  const index=Math.min(step,Math.max(0,groups.length-1)),group=groups[index];
  const dirty=JSON.stringify(answers)!==saved.current.answers||narrative!==saved.current.narrative;
  const ownApplication=!!draft?.completed&&draft.base_scope_fingerprint===draft.current_scope_fingerprint&&current?.guided_assessment_source?.by===user.user_id&&current?.guided_assessment_source?.version===draft.version&&current?.guided_assessment_source?.revision===draft.revision;
  const stale=!!draft?.revision&&draft.lineage_stale!==false&&!ownApplication;
  const blocked=disabled||busy||!loaded||updated||stale||assessmentDirty||!!validationError;
  const character=busy?'thinking':view==='summary'&&result?(result.gaps.length?'gap':result.unknowns.length?'verification':'complete'):mode==='minimized'?'minimized':'helpful';
  useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  useEffect(()=>{onDraftChange?.(dirty||busy);return()=>onDraftChange?.(false);},[dirty,busy,onDraftChange]);
  useEffect(()=>{
    if(!dirty)return;const warn=e=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);
  },[dirty]);
  const adopt=useCallback((data,restoring=false)=>{
    setDraft(data);setAnswers(data.answers||{});setStep(data.step||0);setNarrative(data.narrative||'');saved.current={answers:JSON.stringify(data.answers||{}),narrative:data.narrative||''};
    if(restoring){
      let manual=!!data.narrative;
      try{manual=manual&&data.narrative!==socGuidedResult(id,data.answers||{},data.version,clientNameRef.current).narrative;}catch{ /* Retain unreadable drafts; the validation alert prevents application. */ }
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
      const output=completed?socGuidedResult(id,answers,version,clientName):null;
      const body={version,answers,step:nextStep,completed,narrative,summary_review:basis?{version,answers:JSON.parse(basis)}:null,expected_revision:base.revision,...(base.revision===0?{base_assessment_token:base.current_assessment_token,base_scope_fingerprint:base.current_scope_fingerprint}:{}),result:output?{...output,narrative:override.narrative??narrative}:null,...override};
      const {data}=await api.put(route,body);if(!active.current)return null;adopt(data);return data;
    }catch(e){if(active.current)setError(formatError(e));return null;}finally{pending.current=false;if(active.current)setBusy(false);}
  }
  async function next(){
    try{for(const q of group.questions.filter(q=>q.type!=='text')){if(!answers[q.id])throw new Error('Choose an answer for each question. Not sure is a valid response.');if(q.type==='context'&&answers[q.id]==='Outside the selected system'&&!answers[q.id+'_detail']?.trim())throw new Error('Explain why this context is outside the selected system.');}
      if(index===groups.length-1){validateSocCompletion(id,answers,version);const generated=result.narrative,keep=edited?narrative:generated;
        if(await persist(index,true,{narrative:keep,...(!edited?{summary_review:{version,answers}}:{})})){setNarrative(keep);if(!edited)setBasis(JSON.stringify(answers));setView('summary');}
      }else if(await persist(index+1,false))setStep(index+1);
      heading.current?.focus({preventScroll:true});
    }catch(e){setError(formatError(e));}
  }
  async function saveClose(){
    if(view==='summary'){requestSave(true);return;}
    if(await persist(index,false)){setConfirmClose(false);changeMode('collapsed');}
  }
  function requestSave(close=false){setCloseAfter(close);if(current?.implementation?.trim()||current?.status!=='not_assessed')setConfirmUpdate(true);else commit(close);}
  async function commit(close=false){
    if(blocked||relatedDraft||pending.current||!onSaveAssessment||!narrative.trim()||edited&&basis!==JSON.stringify(answers))return;
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
  async function beginNew(empty=false){
    if(disabled||busy||assessmentDirty)return;setError('');const latest=await load();if(!latest)return;
    if(empty){if(await persist(0,false,{version:socGuidedCatalog.version,answers:{},narrative:'',summary_review:null,result:null,restart:true,expected_revision:latest.revision,base_assessment_token:latest.current_assessment_token,base_scope_fingerprint:latest.current_scope_fingerprint})){setEdited(false);setBasis('');setView('interview');setRestart(false);}}
    else if(await persist(latest.step,false,{version:latest.version,answers:latest.answers,narrative:latest.narrative||'',result:null,rebase:true,expected_revision:latest.revision,base_assessment_token:latest.current_assessment_token,base_scope_fingerprint:latest.current_scope_fingerprint})){setCompare(false);setConfirmed(false);setView('interview');}
  }
  async function historyLoad(more=false){setBusy(true);setError('');try{const {data}=await api.get(route+'/history',{params:more?{before_revision:history.next_before_revision}:{}});if(active.current){setHistory(previous=>({...data,items:more?[...previous.items,...data.items]:data.items}));setView('history');}}catch(e){setError(formatError(e));}finally{if(active.current)setBusy(false);}}
  const start=()=>{setView(draft?.completed?'summary':'interview');heading.current?.focus({preventScroll:true});};
  const saveDisabled=blocked||relatedDraft||!narrative.trim()||edited&&basis!==JSON.stringify(answers);
  return <div className={'guided-pilot guided-lifecycle omni-refined '+(record?'guided-in-assessment':'')} data-testid="soc-guided-assessment">
    <OmniDock preferenceKey={key} freePosition inAssessment={!!record} name="Omnibot" focused>
      {mode==='dismissed'?<Button variant="outline" size="sm" ref={launcher} onClick={()=>changeMode('collapsed')}>Show Omnibot</Button>:<>
        <button type="button" ref={launcher} className={'omni-launch-button '+(mode==='minimized'?'is-minimized':'')} aria-label="Open Omnibot guide" aria-expanded={mode==='expanded'} aria-controls={mode==='expanded'?panelId:undefined} aria-describedby={stateId} onClick={()=>changeMode('expanded')}><OmniCharacter approved state={character}/></button>
        {prompt&&mode==='collapsed'&&<div className="guided-context-prompt" role="complementary" aria-label="Omnibot invitation"><p>{record?(draft?.revision?'Your SOC 2 interview is available to resume.':'Review this SOC 2 criterion with Omnibot.'):'Choose the next criterion in your configured SOC 2 scope.'}</p><button type="button" className="omni-invitation-x" aria-label="Close invitation" onClick={()=>setPrompt(false)}>×</button></div>}
        <details className="omni-position-controls"><summary>Omnibot preferences</summary><div><Button variant="ghost" onClick={()=>changeMode('dismissed')}>Hide Omnibot</Button><Button variant="ghost" onClick={()=>{try{localStorage.setItem(key,JSON.stringify({...preferences(key),invitationsDisabled:true}));}catch{}setPrompt(false);}}>Turn off invitations</Button></div></details>
      </>}<span className="sr-only" id={stateId}>{busy?'Saving review':'Omnibot is available'}</span>
    </OmniDock>
    <Dialog open={mode==='expanded'} modal={false} onOpenChange={open=>{if(!open)close();}}>
      {mode==='expanded'&&<OmniWindow id={panelId} name="Omnibot" refined program={!record} anchor={()=>launcher.current?.getBoundingClientRect()} onMinimize={()=>changeMode('minimized')} onClose={close} onOpenAutoFocus={()=>heading.current?.focus({preventScroll:true})} onCloseAutoFocus={()=>launcher.current?.focus({preventScroll:true})}>
        <div className="omni-panel-header"><OmniCharacter approved state={character}/><div><DialogTitle id={panelId+'-title'} ref={heading} tabIndex={0}>{record?'Omnibot guide · Criterion '+id:'Guided assessment with Omnibot'}</DialogTitle></div></div>
        <DialogDescription id={panelId+'-description'} className="sr-only">Review reported practices and prepare an implementation write-up. Focus the heading and use arrow keys to move the window, or Alt and arrow keys to resize it.</DialogDescription>
        <div className="guided-panel-body">
          {error&&<p role="alert">{error}<Button variant="outline" disabled={busy} onClick={()=>dirty?setConfirmReload(true):load()}>Reload saved interview</Button></p>}
          {validationError&&<p role="alert">{validationError} Saved answers and wording are retained. This interview cannot be generated or applied until its question version and answers are supported.</p>}
          {notice&&<p role="status">{notice}</p>}{dirty&&<p role="status">Interview edits are not saved yet. Question saves do not change the native assessment.</p>}
          {!loaded&&<p role="status">Loading interview…</p>}
          {record&&assessmentDirty&&<p role="alert">Save or discard the native assessment draft before saving this summary.</p>}
          {record&&relatedDraft&&<p role="alert">Finish or discard the related-record draft before saving this summary. Interview progress can still be saved.</p>}
          {record&&stale&&<section><p role="alert">The saved assessment or scope changed after this interview began. Saved answers and history are retained.</p><p className="whitespace-pre-wrap">{current?.implementation||'No saved implementation write-up.'}</p><Button variant="outline" disabled={disabled||busy||assessmentDirty} onClick={()=>setCompare(true)}>Compare &amp; continue</Button></section>}
          {compare&&<section><h3>Continue from the current saved assessment</h3><p className="whitespace-pre-wrap">{current?.implementation||'No saved implementation write-up.'}</p><label><input type="checkbox" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)}/> I compared the saved assessment and confirmed which answers remain relevant.</label><Button disabled={!confirmed||disabled||busy||assessmentDirty} onClick={()=>beginNew()}>Retain answers &amp; continue</Button><Button variant="outline" onClick={()=>setCompare(false)}>Cancel comparison</Button></section>}
          {updated&&<p role="alert">This interview uses retained historical guidance. Begin a new current-version review before updating the assessment.</p>}
          {!record?<SocProgram rows={rows} drafts={draftSummaries} contextComplete={contextComplete} onSelect={row=>{changeMode('minimized');onSelect?.(row);}} onViewAll={()=>{changeMode('collapsed');onViewAll?.();}}/>:draft&&<>
            <div className="guided-actions"><Button variant="outline" disabled={busy} onClick={()=>setView('position')}>Current position</Button><Button variant="outline" disabled={busy||!draft.revision} onClick={()=>historyLoad()}>Interview history</Button></div>
{view==='position'&&<><h3>Current saved position</h3><p>{id} — {record.title}</p><p>Readiness: {LABELS[current?.status]||'Status unavailable'}</p><p className="whitespace-pre-wrap">{current?.implementation||'No implementation write-up is recorded.'}</p><p>Verification: {current?.verification?.replaceAll('_',' ')||'Not verified'}</p><p>Internal readiness only, not an auditor opinion. Reported practice does not establish operation throughout a past examination period.</p><div className="guided-actions"><Button disabled={disabled||busy||updated||!!validationError} onClick={start}>{draft.revision?'Resume your review':'Start'}</Button><Button variant="outline" disabled={disabled||busy||assessmentDirty} onClick={()=>setRestart(true)}>Begin a new review</Button></div></>}
{view==='interview'&&group&&<><div className="omni-group-progress" aria-label={`Question group ${index+1} of ${groups.length}`}><p><strong>Question group {index+1} of {groups.length}</strong><span>{group.title}</span></p><div>{groups.map((g,i)=><span key={g.id} className={i===index?'current':i<index?'done':''}/>)}</div></div><fieldset disabled={blocked} className="omni-question-group"><legend className="sr-only">{group.title}</legend>{group.questions.map((q,i)=><section className="omni-question" key={q.id}>{i===0?<h3>{q.prompt}</h3>:<label htmlFor={'soc-answer-'+q.id}>{q.prompt}</label>}{q.help&&<p className="omni-help">{q.help}</p>}{q.type==='text'?<Textarea id={'soc-answer-'+q.id} aria-label={q.prompt} value={answers[q.id]||''} maxLength={2000} onChange={e=>put(q.id,e.target.value)}/>:<div className="omni-answer-choices" role="group" aria-label={q.prompt}>{q.choices.map(value=><button type="button" key={value} aria-pressed={answers[q.id]===value} onClick={()=>put(q.id,value)}>{value}</button>)}</div>}{q.type!=='text'&&<label className="omni-help" htmlFor={'soc-detail-'+q.id}>How this works / relevant context {q.type==='context'&&answers[q.id]==='Outside the selected system'?'(required for this scope decision)':'(optional)'}<Textarea id={'soc-detail-'+q.id} maxLength={2000} value={answers[q.id+'_detail']||''} onChange={e=>put(q.id+'_detail',e.target.value)}/></label>}</section>)}{index===groups.length-1&&<><p className="omni-help">Use the question choices for substantive gaps or uncertainty. These optional notes add context; they do not decide readiness.</p><label>Gap context (optional)<Textarea maxLength={2000} value={answers.gaps||''} onChange={e=>put('gaps',e.target.value)}/></label><label>Confirmation context (optional)<Textarea maxLength={2000} value={answers.unknowns||''} onChange={e=>put('unknowns',e.target.value)}/></label></>}</fieldset><div className="omni-action-bar"><Button variant="outline" disabled={busy||index===0} onClick={()=>setStep(index-1)}>Back</Button><Button disabled={blocked} onClick={next}>Save &amp; next</Button><Button variant="outline" disabled={blocked} onClick={saveClose}>Save &amp; close</Button></div></>}
            {view==='summary'&&result&&<><h3>Review your assessment summary</h3><p>{id} — {record.title}</p><p>Proposed SOC 2 status: <strong>{LABELS[result.status]}</strong></p>{edited&&basis!==JSON.stringify(answers)&&<section role="status"><p>Your answers changed after you edited the write-up. Your wording is retained; review it before saving.</p><Button variant="outline" disabled={blocked} onClick={()=>{setNarrative(result.narrative);setEdited(false);setBasis(JSON.stringify(answers));}}>Refresh from answers</Button><Button variant="outline" disabled={blocked} onClick={()=>setBasis(JSON.stringify(answers))}>Keep my wording after review</Button></section>}<label>Current Implementation<Textarea aria-label="Omnibot implementation summary" rows={14} maxLength={20000} disabled={disabled||busy} value={narrative} onChange={e=>{setNarrative(e.target.value);if(!edited)setBasis(JSON.stringify(answers));setEdited(true);}}/></label><p>Saving updates only the native implementation and readiness status. Evidence verification and operating-effectiveness records remain separate.</p><div className="guided-actions"><Button variant="outline" disabled={busy} onClick={()=>{setView('interview');setStep(Math.max(0,groups.length-1));}}>Back to questions</Button><Button disabled={saveDisabled} onClick={()=>requestSave()}>{current?.implementation?.trim()||current?.status!=='not_assessed'?'Update assessment':'Save assessment'}</Button><Button variant="outline" disabled={saveDisabled} onClick={()=>requestSave(true)}>Save &amp; close</Button></div></>}
{view==='history'&&<><h3>Retained interview history</h3>{history?.items?.map(item=><section key={item.revision}><p>Revision {item.revision} · {item.version} · {item.updated_at}</p><p className="whitespace-pre-wrap">{item.narrative||'Interview progress only.'}</p></section>)}{history&&!history.items.length&&<p>No earlier saved interview snapshots.</p>}{history?.has_more&&<Button variant="outline" disabled={busy} onClick={()=>historyLoad(true)}>Load earlier snapshots</Button>}<Button variant="outline" onClick={()=>setView('position')}>Return to current position</Button></>}
          </>}
        </div>
      </OmniWindow>}
    </Dialog>
    <Dialog open={confirmReload} onOpenChange={setConfirmReload}><DialogContent className="omni-refined-close"><DialogTitle>Reload saved interview?</DialogTitle><DialogDescription>Your unsaved interview answers and wording will be replaced by the last saved interview. Native assessment records are unchanged.</DialogDescription><div className="guided-actions"><Button variant="outline" onClick={()=>setConfirmReload(false)}>Keep editing</Button><Button disabled={busy} onClick={async()=>{if(await load())setConfirmReload(false);}}>Discard unsaved edits &amp; reload</Button></div></DialogContent></Dialog>
    <Dialog open={confirmUpdate} onOpenChange={open=>{if(!busy)setConfirmUpdate(open);}}><DialogContent className="omni-refined-close"><DialogTitle>Update this assessment?</DialogTitle><DialogDescription>This will replace the saved Current Implementation and SOC 2 readiness status for {clientName} — Criterion {id} with the reviewed summary. Verification, organizational Controls and linked work are unchanged.</DialogDescription><div className="guided-actions"><Button variant="outline" disabled={busy} onClick={()=>setConfirmUpdate(false)}>Cancel</Button><Button disabled={busy||disabled} onClick={()=>commit(closeAfter)}>Yes, update assessment</Button></div></DialogContent></Dialog>
    <Dialog open={confirmClose} onOpenChange={setConfirmClose}><DialogContent className="omni-refined-close"><DialogTitle>Unsaved interview changes</DialogTitle><DialogDescription>Save your work before closing, keep editing, or discard only the unsaved interview edits. Saved native records are not discarded.</DialogDescription><div className="guided-actions"><Button variant="outline" onClick={()=>setConfirmClose(false)}>Keep editing</Button><Button variant="outline" disabled={busy} onClick={()=>{adopt(draft);setConfirmClose(false);changeMode('collapsed');}}>Discard changes</Button><Button disabled={disabled||busy||view==='summary'&&saveDisabled} onClick={saveClose}>Save &amp; close</Button></div></DialogContent></Dialog>
    <Dialog open={restart} onOpenChange={setRestart}><DialogContent className="omni-refined-close"><DialogTitle>Begin a new review?</DialogTitle><DialogDescription>The previous interview is retained in history. The native assessment is unchanged until you review and explicitly save a new summary.</DialogDescription><div className="guided-actions"><Button variant="outline" onClick={()=>setRestart(false)}>Cancel</Button><Button disabled={disabled||busy||assessmentDirty} onClick={()=>beginNew(true)}>Begin a new review</Button></div></DialogContent></Dialog>
  </div>;
}

function SocProgram({rows,drafts,contextComplete,onSelect,onViewAll}){
  const priority=row=>drafts[row.definition_id]?.revision&&!drafts[row.definition_id].completed?0:row.status==='not_assessed'?1:row.status==='needs_attention'?2:row.status==='in_progress'?3:row.work?.open_findings||row.work?.overdue_reviews?4:5;
  const recommended=[...rows].sort((a,b)=>priority(a)-priority(b)||a.definition_id.localeCompare(b.definition_id,undefined,{numeric:true})).slice(0,3);
  return <><p className="omni-intro-label">A practical way forward</p><h3>Omnibot’s recommended next steps</h3><p>{rows.length} criteria in the configured SOC 2 scope · {rows.filter(row=>row.status==='not_assessed').length} not assessed.</p>{!contextComplete&&<p>Some authorized linked context is unavailable; missing information is not a zero count.</p>}<div className="omni-recommendations">{recommended.map(row=><article key={row.definition_id} className="omni-recommendation"><p className="omni-safeguard-id">Criterion {row.definition_id}</p><h4>{row.title}</h4><span className={'omni-status-badge '+row.status}>{LABELS[row.status]||'Status unavailable'}</span><ul><li>{drafts[row.definition_id]?.revision?drafts[row.definition_id].completed?'A saved interview is available; a proposal is not proof of native assessment saving.':'Resume saved interview progress.':row.status==='not_assessed'?'No readiness conclusion is recorded.':'Review the recorded readiness and any changed practices.'}</li>{row.work?.open_findings>0&&<li>{row.work.open_findings} linked open Findings.</li>}{row.work?.overdue_reviews>0&&<li>{row.work.overdue_reviews} overdue Reviews under existing schedules.</li>}</ul><Button onClick={()=>onSelect(row)}>Open criterion {row.definition_id}</Button></article>)}</div><Button variant="outline" onClick={onViewAll}>View all criteria</Button></>;
}
