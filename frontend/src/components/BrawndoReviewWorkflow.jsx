import {useState} from 'react';
import {ClipboardCheck,MessageSquare,History,UserRound,Check,AlertTriangle} from 'lucide-react';
import {reviewDisplayValue} from '@/lib/reviewPresentation';
import {occurrenceId,reviewSchedule} from '@/lib/reviewOccurrences';
import {pilotReviewStatus,pilotReviewMatches,REVIEW_STATUS} from '@/lib/brawndoReviews';
import {personLabel} from '@/lib/people';

const day = value => value ? new Date(String(value).slice(0,10)+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : 'Not recorded';

export function ReviewWorkflowContext({record,source,clientName}) {
  const required=source?.classification==='required',primary=source?.primary;
  const label=required?`${source.label} ${primary.definition.id}`:source?.classification==='organizational'?`${source.label}${source.supports.some(group=>group.key==='cis-ig1')?' · supports CIS IG1':''}`:source?.label||'Source not recorded';
  const clientLabel=typeof clientName==='string'&&clientName.trim()?clientName:'Client not recorded';
  return <div className="review-workflow-context"><span>{clientLabel}</span><span aria-hidden="true">·</span>
    <span className={`review-workflow-chip is-${required?'success':'info'}`}>{label}</span>
    <span className="review-workflow-chip is-plain">{record.recurrence==='custom'?`Every ${record.custom_recurrence_days} days`:reviewDisplayValue('recurrence',record.recurrence)||'Cadence not recorded'}</span>
    {source?.comparison.state==='below'&&<span className="review-workflow-chip is-warning">Cadence below requirement</span>}
  </div>;
}
export function ReviewWorkflowIcon(){return <span className="review-workflow-icon" aria-hidden="true"><ClipboardCheck size={20}/></span>;}

export function ReviewWorkflowOccurrence({record,history=[],users=[],historical=false,writable,busy,onStart,historyLoading=false,historyError=''}) {
  if(!record)return null;
  const status=record.status==='needs_scheduling'?'needs_scheduling':pilotReviewStatus(record),schedule=reviewSchedule(record);
  const completed=historical?record:[...history].filter(o=>o.completed_at||o.completion_date)
    .sort((a,b)=>String(b.completed_at||b.completion_date).localeCompare(String(a.completed_at||a.completion_date)))[0];
  const started=record.status==='in_progress';
  const overdue=pilotReviewMatches(record,'overdue');
  const unstarted=['upcoming','due_soon','overdue'].includes(status)&&!started;
  const completedDate=completed?.completed_at||completed?.completion_date||(!historical&&(record.last_completed_at||record.last_completed||record.completion_date));
  return <section aria-label="Review occurrence" className="review-workflow-occurrence">
    <div><span className="review-workflow-label">Status</span>
      {(unstarted||started)&&!historical?<div className="review-workflow-status" role="group" aria-label="Review execution status">
        <span className={!started?'is-active':''}><i/>Not started</span>
        <button type="button" aria-pressed={started} disabled={started||busy||!writable} onClick={onStart}><i/>In progress</button>
      </div>:<strong>{REVIEW_STATUS[status]||record.status||'Not recorded'}</strong>}
      {overdue?<small role="note">{started?'Overdue and in progress':'Overdue'}</small>:['needs_scheduling','due_soon'].includes(status)&&<small>{REVIEW_STATUS[status]}</small>}
    </div>
    <div><span className="review-workflow-label">This occurrence</span><strong>{record.period||schedule.period}</strong><small>Due {record.due_date?day(record.due_date):'not scheduled'}</small></div>
    <div><span className="review-workflow-label">{historical?'Completed':'Last completed'}</span><strong>{!historical&&historyError?'History unavailable':!historical&&historyLoading?'Loading…':day(completedDate)}</strong>
      {completed&&(completed.completed_by_name||completed.completed_by)&&<small>{completed.completed_by_name||personLabel(users,completed.completed_by)}</small>}
    </div>
    <div><span className="review-workflow-label">Next review after this</span><strong>{record.next_review_date||schedule.next_review_date?day(record.next_review_date||schedule.next_review_date):'Not scheduled'}</strong>{(record.next_review_date||schedule.next_review_date)&&<small>{reviewSchedule({...record,due_date:record.next_review_date||schedule.next_review_date,recurrence_due_date:null}).period}</small>}</div>
  </section>;
}

export function ReviewWorkflowComments({comments,children,showComposer=false}) {
  return <section className="review-workflow-comments" aria-label="Occurrence comments">
    {!comments.length&&<p className="review-workflow-empty">No comments yet.</p>}
    {comments.map(c=><article key={c.comment_id} className="review-workflow-comment"><span className="review-workflow-avatar" aria-hidden="true"><UserRound size={16}/></span><div><p className="review-workflow-comment-author"><strong>{c.user_name||c.user_email||'Actor not recorded'}</strong> · {c.created_at?new Date(c.created_at).toLocaleString():'Time not recorded'}</p><p className="whitespace-pre-wrap">{c.body}</p></div></article>)}
    {showComposer&&<div className="review-workflow-composer"><span className="review-workflow-avatar" aria-hidden="true">You</span><div className="review-workflow-composer-fields"><label className="review-workflow-label" htmlFor="review-comment">Add a comment</label>{children}</div></div>}
  </section>;
}

const activityTypes=[['all','All'],['complete','Completions'],['change','Changes'],['evidence','Evidence & comments'],['finding','Findings']];
export function reviewActivityCategory(event) {
  const action=String(event.action||'').toLowerCase();
  if(action.includes('finding'))return 'finding';
  if(action.includes('evidence')||action.includes('comment'))return 'evidence';
  if(action.includes('complete'))return 'complete';
  if(/creat|updat|start|schedul|cancel|chang|amend/.test(action))return 'change';
  return 'other';
}
export function ReviewWorkflowActivity({activity,selected,history=[],record}) {
  const [filter,setFilter]=useState('all');
  const visible=activity.filter(a=>filter==='all'||reviewActivityCategory(a)===filter);
  const occurrenceFor=event=>{
    const id=event.occurrence_id||event.meta?.occurrence_id;
    if(!id||!record?.client_id||!record.review_id
      ||event.client_id&&event.client_id!==record.client_id
      ||event.entity_id&&event.entity_id!==record.review_id
      ||event.review_id&&event.review_id!==record.review_id
      ||event.occurrence_id&&event.meta?.occurrence_id&&event.occurrence_id!==event.meta.occurrence_id)return null;
    const historical=history.find(item=>item.client_id===record.client_id&&item.review_id===record.review_id&&item.occurrence_id===id);
    if(historical)return historical;
    // The current Review supplies its period, never a historical completion count.
    return id===occurrenceId(record)&&record.period?{period:record.period}:null;
  };
  const timestamp=value=>{
    const at=value?new Date(value):null;
    return at&&Number.isFinite(at.getTime())?`${at.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})} · ${at.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}`:'Time not recorded';
  };
  const groups=new Map();
  for(const event of visible){
    const id=event.occurrence_id||event.meta?.occurrence_id||null;
    const key=JSON.stringify([id,!!occurrenceFor(event)]);
    if(!groups.has(key))groups.set(key,{id,events:[]});
    groups.get(key).events.push(event);
  }
  return <section className="review-workflow-activity" aria-label="Review activity">
    <div className="review-workflow-filters" role="group" aria-label="Filter loaded activity">{activityTypes.map(([value,label])=><button key={value} type="button" aria-pressed={value===filter} onClick={()=>setFilter(value)}>{label}</button>)}</div>
    {!visible.length&&<p className="review-workflow-empty">{activity.length?'No loaded events match this filter.':'No activity loaded for this occurrence yet.'}</p>}
    {[...groups].map(([key,{id,events}])=>{
      const period=events.map(occurrenceFor).find(item=>item?.period)?.period;
      return <section key={key} className="review-workflow-event-group"><h4>{period||id||'Occurrence not recorded'}</h4>{events.map(event=>{
        const occurrence=occurrenceFor(event),completion=String(event.action||'').toLowerCase()==='review completed';
        const count=completion?occurrence?.finding_count:null,knownCount=Number.isInteger(count)&&count>=0;
        const tone=knownCount?(count===0?'success':'critical'):null;
        return <article className="review-workflow-event" key={event.log_id||event.audit_id}>
          <span className={'review-workflow-event-icon'+(tone?` is-${tone}`:'')} aria-hidden="true">{knownCount?(count===0?<Check size={15}/>:<AlertTriangle size={15}/>):reviewActivityCategory(event)==='evidence'?<MessageSquare size={15}/>:<History size={15}/>}</span>
          <div><p><strong>{event.action}</strong>{completion&&knownCount?` · ${count===0?'no findings':`${count} finding${count===1?'':'s'} recorded`}`:''}{event.meta?.task_id?` · ${event.meta.task_id}`:event.meta?.finding_id?` · ${event.meta.finding_id}`:''}{event.meta?.filename?` · ${event.meta.filename}`:''}{event.meta?.due_date?` · ${day(event.meta.due_date)}`:''}</p><p className="review-workflow-help">{event.meta?.by_name||event.user_name||event.user_email||'Actor not recorded'}{!period&&id?` · ${id}`:''}</p></div>
          <time dateTime={event.at||undefined}>{timestamp(event.at)}</time>
        </article>;
      })}</section>;
    })}
  </section>;
}
