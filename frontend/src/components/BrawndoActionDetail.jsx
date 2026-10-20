import {ListChecks,ShieldCheck,Link2} from 'lucide-react';
import {useId} from 'react';
import {DialogTitle,DialogDescription} from './ui/dialog';
import {daysDue} from '@/lib/actionItems';
import {calendarDay,displayRecordedAt} from '@/lib/managementDates';
import {frameworkCatalog,frameworkDefinition} from '@/lib/frameworks';

const stageLabels={open:'Open',in_progress:'In progress',blocked:'Blocked',pending_validation:'Pending validation',completed:'Completed',accepted:'Accepted',cancelled:'Cancelled'};
const priorityLabels={low:'Low',medium:'Medium',high:'High',critical:'Critical'};
const tone=value=>({blocked:'warn',pending_validation:'info',in_progress:'info',completed:'ok',accepted:'ok',medium:'warn',high:'critical',critical:'critical'})[value]||'plain';

function detailDay(value){
  const day=calendarDay(value);
  return day===null?value:new Date(day*86400000).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
}

function sourceHref(source){
  if(typeof source!=='string')return null;
  try{const url=new URL(source);return ['http:','https:'].includes(url.protocol)&&url.hostname?url.href:null;}
  catch{return null;}
}

// A direct Task opener names that exact member, even when its ticket has siblings.
function openedAction(ticket,kind,record){
  return kind==='tasks'?ticket.actions.find(task=>task.task_id===record.task_id&&task.client_id===record.client_id):ticket.primary;
}

function progress(ticket,stage){
  const finding=ticket.finding,actions=ticket.actions;
  const workComplete=actions.some(task=>task.status==='done')&&actions.every(task=>['done','cancelled'].includes(task.status));
  const started=actions.some(task=>task.started_at||task.status==='in_progress');
  const logged=!!finding?.created_at||actions.some(task=>task.created_at);
  const validated=finding?.status==='closed'&&!!(finding.validated_at||finding.decision_history?.some(row=>row.action==='validated'));
  // Completion and acceptance do not prove an earlier In progress transition.
  return [
    {label:'Open',detail:stage==='cancelled'?'Cancelled':'Logged',state:stage==='open'?'current':logged?'done':'future'},
    {label:'In progress',detail:stage==='blocked'?'Blocked':'Work underway',state:stage==='blocked'?'blocked':stage==='in_progress'?'current':started?'done':'future'},
    {label:'Work complete',detail:workComplete?(stage==='pending_validation'?'Awaiting validation':'Completed work'):'Outstanding work',state:workComplete?(stage==='pending_validation'||!finding?'current':'done'):'future'},
    {label:finding?.status==='accepted'?'Accepted':finding?(validated?'Validated':finding.status==='closed'?'Closed':'Validated'):'No validation',detail:finding?.status==='accepted'?'Not verified remediation':!finding?'Not required':finding.status==='closed'?(validated?'Closed':'Validation not recorded'):'Not validated',state:finding?.status==='accepted'?'current':stage==='completed'&&finding?'current':'future'},
  ];
}

export function ActionDetailHeader({ticket,kind,record,stage,origin,tab,onTab,idPrefix,evidenceCount}){
  const generatedPrefix=useId(),prefix=idPrefix||generatedPrefix;
  const task=openedAction(ticket,kind,record),due=task&&daysDue(task);
  const priority=task?.priority;
  return <>
    <div className="bad-title-row"><div className="bad-icon"><ListChecks aria-hidden="true" size={20}/></div><div>
      <DialogTitle>{task?.title||ticket.title}</DialogTitle>
      <DialogDescription className="bad-sub"><span className="sr-only">{ticket.ticketId}</span><span className="bad-chip" data-tone={tone(stage)}>{stageLabels[stage]||stage}</span>
        <span className="bad-chip" data-tone="plain" data-priority={priority||'unclassified'}>{priorityLabels[priority]||priority||'Classification needed'}{priority?' priority':''}</span>
        {task?.due_date&&task.status!=='cancelled'&&(task.status!=='done'||stage==='pending_validation')&&!['completed','accepted','cancelled'].includes(stage)&&<span className="bad-chip" data-tone={due!==null&&due<0?'critical':due!==null&&due<=14?'warn':'plain'}>{due!==null&&due<0?`${Math.abs(due)} days overdue`:due!==null&&due<=14?`Due in ${due} days`:`Due ${detailDay(task.due_date)}`}</span>}
        {origin?.label&&<span className="bad-chip" data-tone="plain">{origin.kind==='framework_assessments'&&origin.target?.framework_key==='cis-ig1'?'CIS '+origin.target.definition_id:origin.label}</span>}
      </DialogDescription>
    </div></div>
    <div className="bad-progress" aria-label="Ticket progress">{progress(ticket,stage).map(step=><div className="bad-step" key={step.label} data-state={step.state}><div className="bad-bar"/><div className="bad-step-label">{step.state==='done'&&<span aria-hidden="true">✓ </span>}{step.label}{['current','blocked'].includes(step.state)&&<small> · {step.detail}</small>}</div></div>)}</div>
    <div className="bad-tabs" role="tablist" aria-label="Action Item detail" onKeyDown={event=>{
      const buttons=Array.from(event.currentTarget.querySelectorAll('[role="tab"]')),index=buttons.indexOf(event.target);
      if(index<0||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      event.preventDefault();
      const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;
      buttons[next].focus();buttons[next].click();
    }}>{['overview','evidence','activity'].map(value=><button key={value} type="button" role="tab" id={prefix+'-tab-'+value} aria-controls={prefix+'-panel-'+value} aria-selected={tab===value} tabIndex={tab===value?0:-1} onClick={()=>onTab(value)}>{value[0].toUpperCase()+value.slice(1)}{value==='evidence'&&Number.isInteger(evidenceCount)&&<span>{evidenceCount}</span>}</button>)}</div>
  </>;
}

export function ActionDetailWhy({ticket,origin,onOpen,disabled}){
  const finding=ticket.finding,target=origin?.target,catalog=frameworkCatalog('cis-ig1');
  const exactCis=origin?.kind==='framework_assessments'&&target?.framework_key==='cis-ig1'&&target.client_id===ticket.raw.client_id
    &&target.framework_assessment_id===origin.id&&target.framework_version===catalog.version;
  const definition=exactCis?frameworkDefinition('cis-ig1',target.definition_id):null;
  const officialText=typeof definition?.official_text==='string'?definition.official_text:null;
  const guidance=typeof definition?.guidance==='string'?definition.guidance:null;
  const source=sourceHref(definition?.source);
  const unqualifiedCis=origin?.kind==='framework_assessments'&&target?.framework_key==='cis-ig1'&&!definition;
  const originLabel=unqualifiedCis?`CIS assessment${target.definition_id?' → Safeguard '+target.definition_id:''}${target.framework_version?' · '+target.framework_version:''}`:origin?.label;
  return <section className="bad-why" data-severity={finding?.severity||'none'}>
    <div className="bad-why-head"><div className="bad-kicker">Why this action exists {finding?.severity&&<span className="bad-chip" data-tone={tone(finding.severity)}>{finding.severity} finding</span>}{finding?.created_at&&<span>Raised {detailDay(finding.created_at)}</span>}</div>
      <h3 className="bad-why-title">{finding?.title||ticket.title}</h3>
    </div>
      <p className="bad-why-description">{finding?(finding.description||'Issue description not recorded'):ticket.raw.description||'No linked Finding is recorded.'}</p>
    <div className="bad-origin"><span className="bad-origin-icon" aria-hidden="true">{definition?<ShieldCheck size={15}/>:<Link2 size={15}/>}</span>{origin?.id?<p>Originated from: {definition&&<><strong>CIS Controls v{catalog.version} assessment</strong> → </>}{origin.target?<button type="button" disabled={disabled} onClick={onOpen}>{definition?'Safeguard '+definition.id+' · '+definition.title:originLabel}{origin.detail?' · '+origin.detail:''}</button>:<span>{origin.label} · {origin.id} · unavailable</span>}</p>:<p>{origin?.label||'Origin not documented'}</p>}
      {definition&&(officialText||guidance)&&<details><summary><span className="bad-quote-show">Show safeguard text</span><span className="bad-quote-hide">Hide safeguard text</span></summary><p>CIS Controls v{catalog.version} · Safeguard {definition.id} · {definition.title}{!officialText?' · Catalog guidance':''}</p><blockquote>{officialText||guidance}</blockquote>{source&&<a href={source} target="_blank" rel="noreferrer">Source reference</a>}</details>}
    </div>
  </section>;
}

function actor(id,users){return users.find(user=>user.user_id===id)?.name||id||'Historical actor unavailable';}

export function ActionDetailState({ticket,stage,users=[],children,detail=false,evidenceCount}){
  const finding=ticket.finding,accepted=finding?.status==='accepted';
  const relevant=['pending_validation','completed','accepted'].includes(stage)||accepted;
  const decisionAction=accepted?'accepted':'validated';
  const decision=(accepted||finding?.status==='closed')?finding.decision_history?.slice().reverse().find(row=>row.action===decisionAction||(accepted&&row.action==='accept')):null;
  const validated=finding?.status==='closed'&&!!(finding.validated_at||decision?.action==='validated');
  return <section className={'bad-state-slot'+(detail&&relevant?' bad-state-card':'')} data-tone={stage==='pending_validation'?'info':'ok'}>
    {detail&&relevant&&<>
      <h3>{accepted?'Issue accepted':stage==='pending_validation'?'Waiting for validation':finding?(validated?'Validated and closed':'Closed'):'Work completed'}</h3>
      {accepted&&<p className="bad-state-note">Acceptance is not verified remediation. Outstanding Actions remain active until completed or cancelled.</p>}
      {decision&&<p>{accepted?'Accepted':'Validated'} by {actor(decision.by,users)} · {displayRecordedAt(decision.at)||decision.at}</p>}
      {!accepted&&finding?.status==='closed'&&!decision&&finding.validated_at&&<p>Validated by {actor(finding.validated_by,users)} · {displayRecordedAt(finding.validated_at)||finding.validated_at}</p>}
      {decision?.rationale&&<div className="bad-state-note"><small>{accepted?'Acceptance rationale':'Validation note'}</small>{decision.rationale}</div>}
      {ticket.actions.map(task=><div key={task.task_id} className="bad-state-note"><strong>{task.title}</strong>{task.completed_at&&<p>Work completed by {actor(task.completed_by,users)} · {displayRecordedAt(task.completed_at)||task.completed_at}</p>}{task.resolution&&<p><small>What was done</small>{task.resolution}</p>}</div>)}
      {stage==='pending_validation'&&Number.isInteger(evidenceCount)&&<div className="bad-state-note"><small>Evidence</small>{evidenceCount} files</div>}
    </>}
    {children}
  </section>;
}

export function ActionDetailSegments({label,value,options,disabled,onChange}){
  return <div className="bad-segments" role="group" aria-label={label}>{options.map(option=><button key={option.value} type="button" disabled={disabled} aria-pressed={value===option.value} data-value={option.value} data-priority={label==='Priority'&&priorityLabels[option.value]?option.value:undefined} onClick={()=>onChange(option.value)}>{option.label}</button>)}</div>;
}
