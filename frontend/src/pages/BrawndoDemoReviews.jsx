import CisReviewsConcept from '@/components/CisReviewsConcept';
import '@/components/CisReviewsConcept.css';
import {useEffect,useRef,useState} from 'react';
import {reviewSummary,reviewExecutions} from '@/lib/brawndoDemoReviews';
import {reviewSchedule} from '@/lib/reviewOccurrences';
import {reviewDisplayValue} from '@/lib/reviewPresentation';
import {basisSummary} from '@/lib/requirementBasis';
import {personLabel} from '@/lib/people';
import {reviewDaysUntil} from '@/lib/brawndoReviews';
import {displayDay,displayRecordedAt} from '@/lib/managementDates';
import {calendarDay,reviewMatches} from '@/lib/tableFilters';
import {cisReviewStatusLabel,cisReviewUrgency,formatCisReviewDate} from '@/lib/cisReviewsConcept';

export default function BrawndoDemoReviews({clientName='Client',children,rows=[],theme,view,onView,actions,available=true,recordOpen=false,onOpenReview,scopeKey,users=[],...props}){
  const now=new Date(),summary=reviewSummary(rows,now),today=Date.UTC(now.getFullYear(),now.getMonth(),now.getDate());
  const due90=rows.filter(row=>reviewMatches(row,'upcoming',now)).length;
  const overdueDays=rows.filter(row=>reviewMatches(row,'overdue',now)).map(row=>-reviewDaysUntil(row,now));
  const nextDue=rows.filter(row=>reviewMatches(row,'due30',now)).reduce((next,row)=>!next||calendarDay(row.due_date)<calendarDay(next)?row.due_date:next,null);
  // Summary counts stay native. These are display-only facts from the same rows/executions.
  const latestCompletion=reviewExecutions(rows).filter(({execution})=>execution.status==='completed').map(({execution})=>execution.completed_at||execution.completion_date).filter(at=>calendarDay(at)!==null&&calendarDay(at)<=today).reduce((latest,at)=>!latest||calendarDay(at)>calendarDay(latest)?at:latest,null);
  const dueToday=rows.some(row=>reviewMatches(row,'due30',now)&&reviewDaysUntil(row,now)===0);
  const contexts=[`${due90} due in the next 90 days`,summary.overdue?`Oldest ${Math.max(...overdueDays)} day${Math.max(...overdueDays)===1?'':'s'} past due`:'Nothing past due',dueToday?'Includes a review due today':nextDue?`Next due ${formatCisReviewDate(nextDue)}`:'Nothing due in 30 days',summary.completed90&&latestCompletion?`Latest ${formatCisReviewDate(latestCompletion)}`:'None in 90 days'];
  const icons=[<><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 3h6v4H9zm-1 10 2 2 5-5"/></>,<path d="m12 3 10 18H2L12 3Zm0 6v5m0 3v1"/>,<><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M7 3v4m10-4v4M7 14h2m4 0h2m-8 4h2m4 0h2"/></>,<><circle cx="12" cy="12" r="9"/><path d="m7 12 3 3 7-7"/></>];
  return <div {...props} className="crr-root" data-visual-surface="reviews" data-theme={theme}>
    <header className="page-heading"><div><h1>{clientName} Reviews</h1><p>Recurring governance and compliance reviews</p></div><div className="page-actions">{actions}</div></header>
    <section className="kpis" aria-label="Review summary. Select a figure to filter the register.">
      {[['all','Active reviews',summary.active],['overdue','Overdue',summary.overdue],['due30','Due in 30 days',summary.due30],['history','Completed · last 90 days',summary.completed90]].map(([key,label,value],index)=><button key={key} disabled={!available} onClick={()=>onView(key)} className={'kpi bdr-kcell'+(key==='overdue'?' overdue':'')} aria-pressed={view===key}><span className="kpi-icon"><svg className="icon" viewBox="0 0 24 24" aria-hidden="true">{icons[index]}</svg></span><span><span className="label">{label}</span><strong>{available?value:'—'}</strong><small>{available?contexts[index]:'—'}</small></span></button>)}
    </section>
    <CisReviewsConcept key={scopeKey} rows={rows} users={users} scopeKey={scopeKey} available={available} recordOpen={recordOpen} theme={theme} onOpenReview={onOpenReview}/>
    <section className="panel register"><header className="register-heading"><h2>Reviews register</h2><div className="segmented" role="group" aria-label="Records"><button aria-pressed={view!=='history'} onClick={()=>onView('all')}>Active</button><button aria-pressed={view==='history'} onClick={()=>onView('history')}>History</button></div></header>{children}</section>
  </div>;
}

export function BrawndoReviewRows({rows,users,checked,toggleOne,toggleAll,allChecked,onOpen,rowMenu,history,nativeParentRows=false,controls,loading,error,widths={},sortBy,sortDir='desc'}){
  const executions=history?reviewExecutions(rows).filter(({execution})=>['completed','cancelled'].includes(execution.status)).map(({review,execution})=>({...review,...execution,review_id:review.review_id,due_date:execution.due_date,completed_by:execution.completed_by,completed_at:execution.completed_at,completion_date:execution.completion_date,_review:review,_execution:execution})):rows;
  // Completion belongs to the saved occurrence, never the recurring parent record.
  const completedTime=row=>{const value=Date.parse(row.completed_at||row.completion_date||'');return Number.isNaN(value)?null:value;};
  const displayRows=history&&sortBy==='completed_at'?[...executions].sort((a,b)=>{
    const left=completedTime(a),right=completedTime(b);
    return left===null?(right===null?0:1):right===null?-1:(left-right)*(sortDir==='asc'?1:-1);
  }):executions;
  const [page,setPage]=useState(1),predicate=useRef('');
  const signature=displayRows.map(row=>row.review_id+':'+(row.occurrence_id||'current')).join('|');
  const lastPage=Math.max(1,Math.ceil(displayRows.length/10)),current=predicate.current===signature?Math.min(page,lastPage):1;
  useEffect(()=>{if(predicate.current!==signature){predicate.current=signature;setPage(1);}},[signature]);
  return <>
    <div className="bdr-summary"><span>{loading?'Loading reviews…':error?'Reviews unavailable':`${displayRows.length} matching review${displayRows.length===1?'':'s'}`}</span>
      <details className="bdr-more"><summary>More controls</summary><div className="bdr-more-panel">{controls}</div></details>
      <nav aria-label="Review register pages"><span>Page {current} of {lastPage}</span><button disabled={current===1} onClick={()=>setPage(current-1)}>Previous</button><button disabled={current===lastPage} onClick={()=>setPage(current+1)}>Next</button></nav>
    </div>
    <div className="table-scroll"><table aria-label="Reviews register" className={'bdr-table'+(history?' bdr-history':'')}>
      <thead><tr className="bdr-thead">
        {!history&&<th className="check-col"><input type="checkbox" className="bdr-cb" aria-label="Select all reviews" checked={allChecked} onChange={toggleAll}/></th>}
        <th style={widths.title?{width:widths.title}:undefined}>Review</th><th style={widths.owner_id?{width:widths.owner_id}:undefined}>{history?'Completed by':'Owner'}</th>
        {!history&&<th style={widths.status?{width:widths.status}:undefined}>Status</th>}
        <th style={widths.due_date?{width:widths.due_date}:undefined}>{history?'Occurrence due':'Due'}</th>
        <th style={widths.recurrence?{width:widths.recurrence}:undefined}>{history?'Completed':'Cadence'}</th><th className="open-col"><span className="sr-only">Open review</span></th>
      </tr></thead>
      <tbody>{loading||error||!displayRows.length?<tr><td colSpan={history?5:7} className="bdr-empty" role={error?'alert':loading?'status':undefined}>{loading?'Loading reviews…':error?'Reviews unavailable':'No reviews match these filters.'}</td></tr>:displayRows.slice((current-1)*10,current*10).map((row,index)=>{
        const owner=history
          ? row._execution.completed_by_name||(row.completed_by?personLabel(users,row.completed_by):'Actor not recorded')
          : personLabel(users,row.owner_id);
        const urgency=cisReviewUrgency(row.due_date),schedule=reviewSchedule(row);
        // Closed native parents can be selected through Status filters on any tab.
        const closedParent=nativeParentRows&&['completed','cancelled','closed'].includes(row.status);
        const status=history?reviewDisplayValue('status',row.status):cisReviewStatusLabel(row.status);
        return <tr key={row.occurrence_id||row.review_id} className={'bdr-trow'+(checked.has(row.review_id)?' bdr-selected':'')+(!history&&!closedParent&&urgency.days!==null&&urgency.days<0?' overdue-row':'')} onClick={()=>onOpen(row)} data-testid={`reviews-row-${index}`}>
          {!history&&<td className="check-col" onClick={event=>event.stopPropagation()}><input type="checkbox" className="bdr-cb" checked={checked.has(row.review_id)} onChange={()=>toggleOne(row.review_id)} aria-label={'Select '+row.title}/></td>}
          <td className="bdr-c-item"><button className="bdr-name" onClick={event=>{event.stopPropagation();onOpen(row);}}>{row.title}</button><div className="bdr-meta"><span>{reviewDisplayValue('review_type',row.review_type)}</span><span className="bdr-fwchip">{basisSummary(row)}</span>{history&&row.status==='cancelled'&&<span>Cancelled</span>}</div></td>
          <td><div className="bdr-owner"><span className="bdr-avatar">{owner.split(/\s+/).slice(0,2).map(part=>part[0]).join('').toUpperCase()}</span><span>{owner}</span></div></td>
          {!history&&<td><span className={'bdr-st'+(row.status==='in_progress'?' bdr-st-prog':'')}>{status}</span></td>}
          <td className="bdr-c-due"><time dateTime={row.due_date||undefined}>{calendarDay(row.due_date)===null?(history?'Due date not recorded':'Not scheduled'):formatCisReviewDate(row.due_date,{year:true})}</time>{!history&&!closedParent&&<small className={'due-badge '+urgency.tone}>{urgency.days===null?'Set a due date':urgency.text}</small>}</td>
          <td className="bdr-c-cad">{history?<span>{row.status==='cancelled'?'Cancelled':displayRecordedAt(row.completed_at||row.completion_date)||'Date not recorded'}</span>:<><span>{reviewDisplayValue('recurrence',row.recurrence)}</span>{!closedParent&&<small>Next cycle {displayDay(schedule.next_review_date)||'—'}</small>}</>}</td>
          <td className="bdr-row-menu" onClick={event=>event.stopPropagation()}>{rowMenu(row,index)}</td>
        </tr>;
      })}</tbody>
    </table></div>
  </>;
}
