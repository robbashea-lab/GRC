import {sharedExperienceEligible} from './sharedExperience';
import {occurrenceId,reviewSchedule,scheduledDate} from './reviewOccurrences';
import {calendarDay,reviewMatches} from './tableFilters';

export function brawndoDemoReviewsGate(context) {
  return sharedExperienceEligible(context) && context.pathname === '/reviews' && !context.loading && !context.error;
}

export function reviewExecutions(reviews) {
  return reviews.flatMap(review=>{
    const rows=[...(review.occurrences||[])];
    if(['completed','cancelled'].includes(review.status)&&!rows.some(row=>row.occurrence_id===occurrenceId(review)))rows.push({...review,occurrences:undefined,occurrence_id:occurrenceId(review)});
    const seen=new Set();
    return rows.filter(row=>{if(!row.occurrence_id||seen.has(row.occurrence_id))return false;seen.add(row.occurrence_id);return true;}).map(execution=>({review,execution}));
  });
}

export function reviewSummary(reviews,now=new Date()) {
  const today=Date.UTC(now.getFullYear(),now.getMonth(),now.getDate());
  return {active:reviews.filter(row=>reviewMatches(row,'all',now)).length,overdue:reviews.filter(row=>reviewMatches(row,'overdue',now)).length,
    due30:reviews.filter(row=>reviewMatches(row,'due30',now)).length,
    completed90:reviewExecutions(reviews).filter(({execution})=>execution.status==='completed'&&calendarDay(execution.completed_at||execution.completion_date)!==null&&calendarDay(execution.completed_at||execution.completion_date)>=today-90*86400000&&calendarDay(execution.completed_at||execution.completion_date)<=today).length};
}

// Read-only projection uses the native anchored scheduler; never creates executions or completions.
export function reviewWorkload(reviews,now=new Date()) {
  const start=Date.UTC(now.getFullYear(),now.getMonth(),1),end=Date.UTC(now.getFullYear(),now.getMonth()+12,1),today=Date.UTC(now.getFullYear(),now.getMonth(),now.getDate());
  const months=Array.from({length:12},(_,index)=>({at:Date.UTC(now.getFullYear(),now.getMonth()+index,1),done:0,due:0,late:0,projected:0,projectionUnavailable:0,items:[]}));
  const indexOf=value=>{const date=scheduledDate(value);return date?(date.getUTCFullYear()-now.getFullYear())*12+date.getUTCMonth()-now.getMonth():-1;};
  for(const {review,execution} of reviewExecutions(reviews)){
    const at=execution.completed_at||execution.completion_date,index=indexOf(at);
    if(execution.status==='completed'&&index===0&&calendarDay(at)<=today){months[0].done++;months[0].items.push({title:review.title,at,type:'Completed'});}
  }
  for(const review of reviews){
    if(['completed','cancelled'].includes(review.status)||!scheduledDate(review.due_date)||review.status==='needs_scheduling')continue;
    let cursor={...review},first=true;
    // Daily custom schedules can produce at most 366 future dates in this window.
    for(let step=0;step<1100;step++){
      const at=cursor.due_date,day=calendarDay(at);if(day===null||day>=end)break;
      const index=indexOf(at);
      if(first&&day<today){months[0].late++;months[0].items.push({title:review.title,at,type:'Overdue'});}
      else if(day>=today&&day>=start&&index>=0&&index<12){months[index].due++;if(!first)months[index].projected++;months[index].items.push({title:review.title,at,type:first?'Due':'Projected'});}
      const schedule=reviewSchedule(cursor);if(!schedule.next_review_date||calendarDay(schedule.next_review_date)<=day)break;
      let next=schedule.next_review_date;
      // Skip elapsed custom cycles using the interval returned by the native scheduler.
      if(cursor.recurrence==='custom'&&calendarDay(next)<today){const stride=scheduledDate(next).getTime()-scheduledDate(cursor.recurrence_due_date||cursor.due_date).getTime();if(stride>0){const skip=Math.ceil((today-scheduledDate(next).getTime())/stride);next=new Date(scheduledDate(next).getTime()+skip*stride).toISOString();}}
      cursor={...cursor,...schedule,due_date:next,recurrence_due_date:null};first=false;
      if(step===1099&&calendarDay(next)<end)months[0].projectionUnavailable++;
    }
  }
  return months;
}
