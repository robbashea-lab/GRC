import {isoRecommendedWork} from '@/lib/isoGuidedProgram';
import {operatorStatuses} from '@/lib/frameworkOperator';
import {Button} from './ui/button';

export default function IsoGuidedProgram({rows,reviews,drafts,onSelect,onViewAll}) {
  const recommendations=isoRecommendedWork(rows,reviews||[],drafts).slice(0,5),labels=operatorStatuses('iso-27001');
  return <><p className="omni-intro-label">A practical way forward</p><h3>Omnibot’s recommended next steps</h3>
    <p>Review necessity decisions, mandatory ISMS requirements, applicable controls and scheduled audit work. These are separate judgments, not certification results.</p>
    {reviews===null&&<p role="status">Audit scheduling is unavailable or still loading; missing information is not a zero count.</p>}
    <div className="omni-recommendations">{recommendations.map(item=><article key={item.key} className="omni-recommendation">
      <p className="omni-safeguard-id">{item.view==='soa'?'Statement of Applicability':item.view==='audit'?'Internal Audit':item.view==='isms_clause'?'ISMS requirement':'Annex A control'}</p>
      <h4>{item.row?`${item.row.definition_id} — ${item.row.title}`:item.review.title}</h4>
      {item.row&&item.view!=='soa'?<span className={'omni-status-badge '+item.row.status}>{labels[item.row.status]}</span>:item.timing&&<p>{item.timing.label} · {item.review.due_date?.slice(0,10)||'No deadline'}</p>}
      <p>{item.reason}</p><Button onClick={()=>onSelect(item)}>Open {item.view==='audit'?'audit activity':item.row.definition_id}</Button>
    </article>)}</div>
    {!recommendations.length&&<p>No immediate work is identified from the available records. Reassess after relevant changes and follow your recorded review schedule.</p>}
    <Button variant="outline" onClick={onViewAll}>View ISO Overview</Button>
  </>;
}
