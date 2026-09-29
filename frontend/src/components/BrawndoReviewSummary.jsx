import {AlertCircle,CalendarDays,ListChecks,UserRound,ArrowRight} from 'lucide-react';
import {REVIEW_VIEWS,pilotReviewMatches} from '@/lib/brawndoReviews';
import './ClientWorkDashboard.css';
import './BrawndoReviews.css';

const icons={overdue:AlertCircle,upcoming:CalendarDays,open:ListChecks,unassigned:UserRound};
export default function BrawndoReviewSummary({rows,active,onPick,loading}) {
  return <div className="client-work-filters mx-[var(--register-gutter)] my-4" aria-label="Review summaries">
    {REVIEW_VIEWS.map(({id,label,tone})=>{
      const Icon=icons[id],count=rows.filter(r=>pilotReviewMatches(r,id)).length;
      return <button key={id} type="button" className={`client-work-filter filter-${tone}`} aria-pressed={active===id} disabled={loading} onClick={()=>onPick(active===id?'':id)}>
        <Icon aria-hidden="true" size={22}/><span>{label}<strong>{loading?'—':count}</strong></span><ArrowRight aria-hidden="true" size={16} className="client-work-filter-arrow"/>
      </button>;
    })}
  </div>;
}
