import {CalendarDays, CircleCheck, Clock3, DiamondMinus, Search, ShieldCheck, Info} from 'lucide-react';
import {policyStatus,policyStatusLabel,AWAITING_APPROVAL} from '@/lib/brawndoPolicies';
import {policyReviewIds} from '@/lib/brawndoAdditionalPolicyVendor';
import {savedDate} from './BrawndoAdditionalPolicyVendorCells';
import './PolicyStatusPanel.css';

const groups=[
  ['approved','Approved',CircleCheck],['awaiting','Awaiting approval',Clock3],['missing','Missing',DiamondMinus],
  ['verify','Needs verification',Search],['other','Other statuses',Info],
];
function policyGroup(row) {
  const status=policyStatus(row);
  if (status==='approved') return 'approved';
  if (AWAITING_APPROVAL.includes(status)) return 'awaiting';
  if (status==='needs_creation') return 'missing';
  return status==='needs_verification'?'verify':'other';
}
export default function PolicyStatusPanel({rows,view,onView,onOpen,mappingLabel,mapped,mappingUnavailable,unavailable,refreshLabel,review,reviews,onOpenReview}) {
  const unscheduled=rows.filter(p=>policyStatus(p)==='approved' && !p.next_review_date).length;
  const next=rows.filter(p=>p.next_review_date && !['retired','not_applicable'].includes(policyStatus(p))).sort((a,b)=>a.next_review_date.localeCompare(b.next_review_date))[0];
  const nextReviews=next ? reviews.filter(r=>r.client_id===next.client_id && policyReviewIds(r).includes(next.policy_id) && r.due_date?.slice(0,10)===next.next_review_date.slice(0,10) && !['completed','cancelled','retired'].includes(r.status)) : [];
  const nextText=next ? <>Next review · {next.title} · {savedDate(next.next_review_date)}</> : 'No policy reviews scheduled';
  const groupsWithRecords=groups.map(([id,label,Icon])=>({id,label,Icon,records:rows.filter(p=>policyGroup(p)===id)}));
  const filter=id=>onView?.(view===id?'':id);
  return <section className="panel npc-panel" aria-labelledby="npc-title">
    <header className="panel-head"><div><h2 className="panel-title" id="npc-title">Policy status</h2><div className="panel-desc">Approval and framework alignment across the policy set.</div></div>
      <div className="npc-meta"><strong>{unavailable?'—':rows.length} {rows.length===1?'policy':'policies'}</strong>{refreshLabel&&<span>As of {refreshLabel}</span>}</div></header>
    <div className="npc-content"><div className="npc-summary" role="group" aria-label="Policy status summary">
      {groupsWithRecords.filter(({id,records})=>!['verify','other'].includes(id)||records.length).map(({id,label,Icon,records})=>{
        const value=<><Icon className="npc-icon" size={16}/><span>{label}</span> <strong className="npc-stat-count">{unavailable?'—':records.length}</strong> · <span className="npc-stat-share">{unavailable?'—':Math.round(records.length*100/(rows.length||1))+'%'}</span></>;
        return id==='other'?<span className="npc-stat" key={id}>{value}</span>:<button type="button" className="npc-stat stat-btn" data-status={id} key={id} aria-pressed={view===id} data-testid={'additional-policy-metric-'+id} disabled={unavailable} onClick={()=>filter(id)}>{value}</button>;
      })}
    </div>{unavailable?<p role="status">Policy status unavailable.</p>:rows.length?<div className="npc-grid" role="group" aria-label="Policy records">
      {groupsWithRecords.map(({id,label,Icon,records})=>records.map(p=><button type="button" className="npc-card" key={p.policy_id} data-status={id} onClick={()=>onOpen(p)}>
        <span className="npc-name">{p.title}</span><span className="npc-state"><Icon size={16}/>{['other','verify'].includes(id)?policyStatusLabel(policyStatus(p)):label}</span>
      </button>))}
    </div>:<div className="empty">No policies in this register.</div>}</div>
    <footer className="npc-footer"><button className="npc-mapping" type="button" data-testid="additional-policy-metric-mapped" aria-pressed={view==='mapped'} disabled={unavailable||mappingUnavailable} onClick={()=>filter('mapped')}><ShieldCheck size={16}/>{mappingLabel} <strong>{unavailable||mappingUnavailable?'—':mapped+' of '+rows.length}</strong></button>
      {mappingUnavailable&&<span role="status">Policy mapping counts unavailable.</span>}
      {nextReviews.length===1?<button className="npc-next" type="button" onClick={()=>onOpenReview?.(nextReviews[0])}><CalendarDays size={16}/>{nextText}</button>:<span className="npc-next"><CalendarDays size={16}/>{nextText}</span>}
      {!!unscheduled&&<span className="npc-note">{unscheduled} approved {unscheduled===1?'policy':'policies'} without a scheduled review</span>}
      {review&&!unavailable&&<button type="button" className="npc-next bapv-link" onClick={()=>onOpenReview?.(review)}>Annual policy review · Open in Reviews</button>}
    </footer></section>;
}
