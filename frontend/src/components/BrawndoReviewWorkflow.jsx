import {useState} from 'react';
import {ClipboardCheck,MessageSquare,History,UserRound} from 'lucide-react';
import {basisSummary} from '@/lib/requirementBasis';
import {reviewDisplayValue} from '@/lib/reviewPresentation';
import {reviewSchedule} from '@/lib/reviewOccurrences';
import {pilotReviewStatus,pilotReviewMatches,REVIEW_STATUS} from '@/lib/brawndoReviews';
import {personLabel} from '@/lib/people';

const day = value => value ? new Date(String(value).slice(0,10)+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : 'Not recorded';

export function ReviewWorkflowContext({record}) {
  return <div className="review-workflow-context"><span>Brawndo</span><span aria-hidden="true">·</span>
    <span className="review-workflow-chip">{basisSummary(record)}</span>
    <span className="review-workflow-chip is-plain">{record.recurrence==='custom'?`Every ${record.custom_recurrence_days} days`:reviewDisplayValue('recurrence',record.recurrence)||'Cadence not recorded'}</span>
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
    <div><span className="review-workflow-label">Next review after this</span><strong>{record.next_review_date||schedule.next_review_date?day(record.next_review_date||schedule.next_review_date):'Not scheduled'}</strong><small>Scheduled cadence · {historical?'occurrence context':'projection'}</small></div>
  </section>;
}

export function ReviewWorkflowComments({comments,children}) {
  return <section className="review-workflow-comments" aria-label="Occurrence comments">
    {!comments.length&&<p className="review-workflow-empty">No comments yet.</p>}
    {comments.map(c=><article key={c.comment_id} className="review-workflow-comment"><span className="review-workflow-avatar" aria-hidden="true"><UserRound size={16}/></span><div><p className="review-workflow-comment-author"><strong>{c.user_name||c.user_email||'Actor not recorded'}</strong> · {c.created_at?new Date(c.created_at).toLocaleString():'Time not recorded'}</p><p className="whitespace-pre-wrap">{c.body}</p></div></article>)}
    <div className="review-workflow-composer">{children}</div>
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
export function ReviewWorkflowActivity({activity,selected}) {
  const [filter,setFilter]=useState('all');
  const visible=activity.filter(a=>filter==='all'||reviewActivityCategory(a)===filter);
  const groups=new Map();
  for(const event of visible){
    const id=event.occurrence_id||event.meta?.occurrence_id||null;
    if(!groups.has(id))groups.set(id,[]);
    groups.get(id).push(event);
  }
  return <section className="review-workflow-activity" aria-label="Review activity">
    <div className="review-workflow-filters" role="group" aria-label="Filter loaded activity">{activityTypes.map(([value,label])=><button key={value} type="button" aria-pressed={value===filter} onClick={()=>setFilter(value)}>{label}</button>)}</div>
    {!selected&&<p className="review-workflow-help">Major events across this Review’s occurrences.</p>}
    {!visible.length&&<p className="review-workflow-empty">{activity.length?'No loaded events match this filter.':'No activity loaded for this occurrence yet.'}</p>}
    {[...groups].map(([id,events])=><section key={id||'unrecorded'} className="review-workflow-event-group"><h4>{events.find(a=>a.meta?.period)?.meta.period||id||'Occurrence not recorded'}</h4>{events.map(a=><article className="review-workflow-event" key={a.log_id||a.audit_id}><span className="review-workflow-event-icon" aria-hidden="true">{reviewActivityCategory(a)==='evidence'?<MessageSquare size={15}/>:<History size={15}/>}</span><div><p>{a.action}{a.meta?.task_id?` · ${a.meta.task_id}`:a.meta?.finding_id?` · ${a.meta.finding_id}`:''}{a.meta?.filename?` · ${a.meta.filename}`:''}{a.meta?.due_date?` · ${day(a.meta.due_date)}`:''}</p><p className="review-workflow-help">{a.meta?.by_name||a.user_name||a.user_email||'Actor not recorded'}{id?` · ${id}`:''}</p></div><time>{a.at?new Date(a.at).toLocaleString():'Time not recorded'}</time></article>)}</section>)}
    <p className="review-workflow-help">Loaded native activity. Historical selection retains the native occurrence filter.</p>
  </section>;
}
