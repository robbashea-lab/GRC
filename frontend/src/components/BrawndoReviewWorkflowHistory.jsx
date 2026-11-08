import {Popover,PopoverContent,PopoverTrigger} from './ui/popover';
import RemediationTickets from './RemediationTickets';
import {belongsToOccurrence,occurrenceId,reviewSchedule} from '@/lib/reviewOccurrences';
import {personLabel} from '@/lib/people';
import {reviewDisplayValue} from '@/lib/reviewPresentation';

const day=value=>value?new Date(String(value).slice(0,10)+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'—';

function FindingCount({count,findings,related,record,clientId,users,onOpen,current=false}) {
  const knownCount=Number.isInteger(count)&&count>=0;
  if(!knownCount&&!findings.length)return <span className="review-workflow-chip is-plain">Finding count unavailable</span>;
  if(count===0)return current?null:<span className="review-workflow-chip is-success">No findings</span>;
  const label=knownCount?`${count} finding${count===1?'':'s'}${current?' raised':''}`:'Finding count unavailable';
  if(!findings.length)return <span className="review-workflow-chip is-critical">{label}</span>;
  const tasks=(related.tasks||[]).filter(task=>task.client_id===clientId&&findings.some(finding=>finding.finding_id===task.finding_id));
  const reviews=[record,...(related.reviews||[]).filter(review=>review.client_id===clientId&&review.review_id!==record.review_id)];
  return <Popover><PopoverTrigger asChild><button type="button" className={`review-workflow-chip is-${knownCount?'critical':'plain'}`}>{label}</button></PopoverTrigger><PopoverContent className="review-workflow-related-popover" aria-label="Findings from this occurrence"><RemediationTickets records={{findings,tasks,reviews}} clientId={clientId} users={users} onOpen={onOpen}/></PopoverContent></Popover>;
}

export default function BrawndoReviewWorkflowHistory({record,history,related,users,loading,error,onSelect,onOpen}) {
  const currentId=occurrenceId(record),open=!['completed','cancelled'].includes(record.status);
  const findings=Array.isArray(related.findings)?related.findings.filter(finding=>finding.client_id===record.client_id):null;
  const reviewContext={...record,occurrences:history};
  const forOccurrence=id=>findings?.filter(item=>item.review_id===record.review_id&&belongsToOccurrence(item,record,id))||[];
  const currentFindings=forOccurrence(currentId);
  const completedCount=history.filter(item=>item.status==='completed').length,cancelledCount=history.filter(item=>item.status==='cancelled').length;
  const cadence=record.recurrence?reviewDisplayValue('recurrence',record.recurrence).toLowerCase():null;
  return <section data-testid="review-history" className="review-workflow-history"><h3>Review history <span>{loading?'Loading…':error?'History unavailable':history.length?`${completedCount} completed${cancelledCount?` · ${cancelledCount} cancelled`:''}${cadence?` · ${cadence}`:''}`:'No completed occurrences yet'}</span></h3>
    {error&&<p role="alert">Review history could not be loaded.</p>}
    <div className="overflow-x-auto"><table><thead><tr>{['Occurrence','Due','Completed','Completed by','Outcome'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>
      {open&&<tr className="is-current"><td className="review-workflow-history-period">{record.period||reviewSchedule(record).period}</td><td>{day(record.due_date)}</td><td>—</td><td>—</td><td><span className={`review-workflow-chip is-${record.status==='in_progress'?'info':'plain'}`}>{record.status==='in_progress'?'In progress':record.status==='needs_scheduling'?'Needs Scheduling':'Not started'}</span>{!loading&&!error&&findings&&<FindingCount count={currentFindings.length} findings={currentFindings} related={related} record={reviewContext} clientId={record.client_id} users={users} onOpen={onOpen} current/>}</td></tr>}
      {history.map(item=><tr key={item.occurrence_id}><td className="review-workflow-history-period"><button type="button" onClick={()=>onSelect(item)}>{item.period}</button></td><td>{day(item.due_date)}</td><td>{day(item.completed_at||item.completion_date)}</td><td>{item.completed_by_name||personLabel(users,item.completed_by)}</td><td>{item.status==='cancelled'?<span className="review-workflow-chip is-plain">Cancelled</span>:<FindingCount count={item.finding_count} findings={forOccurrence(item.occurrence_id)} related={related} record={reviewContext} clientId={record.client_id} users={users} onOpen={onOpen}/>}</td></tr>)}
    </tbody></table></div>
  </section>;
}
