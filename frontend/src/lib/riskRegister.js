import { assessedRisk } from './grcWork';

export const RISK_VIEWS = [
  {id:'all_active',label:'All Active'}, {id:'review_due',label:'Due for Review'},
  {id:'critical',label:'Critical'}, {id:'high',label:'High'},
  {id:'accepted',label:'Accepted'}, {id:'closed',label:'Closed'},
];
export const riskStatus = status => ({in_progress:'In Treatment',treated:'In Treatment (legacy)',open:'Open (legacy)',identified:'Identified',assessed:'Assessed',accepted:'Accepted',closed:'Closed',retired:'Closed (legacy)',escalated:'Escalated (legacy)'})[status] || status;
export const riskIsClosed = risk => ['closed','retired'].includes(risk.status);
export function riskReviewDue(risk, now = new Date()) {
  if (riskIsClosed(risk) || !risk.next_review) return false;
  const date = String(risk.next_review).slice(0,10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date))) return false;
  const end = new Date(now);
  end.setDate(end.getDate() + 90);
  const endDay = `${end.getFullYear()}-${String(end.getMonth()+1).padStart(2,'0')}-${String(end.getDate()).padStart(2,'0')}`;
  return date <= endDay;
}
export function riskMatchesView(risk, view, now = new Date()) {
  if (view === 'all') return true; // explicit column lifecycle selection
  if (view === 'closed') return riskIsClosed(risk);
  if (riskIsClosed(risk)) return false;
  if (view === 'review_due') return riskReviewDue(risk, now);
  if (view === 'accepted') return risk.status === 'accepted';
  if (['critical','high'].includes(view)) return assessedRisk(risk).risk_level === view;
  if (view === 'significant') return ['critical','high'].includes(assessedRisk(risk).risk_level);
  return true;
}
export function riskSummary(rows, now = new Date()) {
  return rows.reduce((result, risk) => {
    if (riskIsClosed(risk)) return result;
    result.open++;
    if (['critical','high'].includes(assessedRisk(risk).risk_level)) result.high_crit++;
    if (risk.status === 'accepted') result.accepted++;
    if (riskReviewDue(risk,now)) result.review_due++;
    return result;
  }, {open:0,high_crit:0,accepted:0,review_due:0});
}
