import {REVIEW_VIEWS,pilotReviewMatches,reviewDaysUntil} from '@/lib/brawndoReviews';
import './BrawndoReviews.css';

const shortDate=iso=>new Date(String(iso).slice(0,10)+'T12:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric'});
const byDue=(a,b)=>String(a.due_date||'9999').localeCompare(String(b.due_date||'9999'));
// One line per tile saying where to look first; derived from the same rows as the count.
export function reviewTileContext(id,rows,now=new Date()) {
  const matching=rows.filter(r=>pilotReviewMatches(r,id,now)).sort(byDue);
  if(id==='overdue'){const r=matching[0];if(!r)return 'Nothing overdue';const late=-reviewDaysUntil(r,now);return `${r.title} · ${late} ${late===1?'day':'days'} late${matching.length>1?` · +${matching.length-1} more`:''}`;}
  if(id==='upcoming'){const r=matching.find(x=>reviewDaysUntil(x,now)>=0);return r?`Next: ${r.title}, ${shortDate(r.due_date)}`:'Nothing due in the next 30 days';}
  if(id==='open'){const late=rows.filter(r=>pilotReviewMatches(r,'overdue',now)).length;return matching.length?`${matching.length-late} on schedule`:'No open reviews';}
  return matching.length?`${matching.length} ${matching.length===1?'needs':'need'} a reviewer`:'Every review has an owner';
}
const TONE={overdue:'critical',upcoming:'attention',open:'neutral',unassigned:'attention'};
export default function BrawndoReviewSummary({rows,active,onPick,loading}) {
  return <div className="brev-tiles" aria-label="Review summaries">
    {REVIEW_VIEWS.map(({id,label})=>{
      const count=rows.filter(r=>pilotReviewMatches(r,id)).length;
      return <button key={id} type="button" className={`brev-tile is-${count||id==='open'?TONE[id]:'clear'}`} aria-pressed={active===id} disabled={loading} onClick={()=>onPick(active===id?'':id)}>
        <span className="brev-tile-label">{label}</span><strong className="brev-tile-value">{loading?'—':count}</strong>
        <span className="brev-tile-context">{loading?'Loading…':reviewTileContext(id,rows)}</span>
      </button>;
    })}
  </div>;
}
