import {reviewView,reviewSchedule} from '../lib/reviewOccurrences';
import {assessedRisk} from '../lib/grcWork';
import {recordUuid} from '../lib/recordUuid';

export const riskSnapshot = risk => Object.fromEntries(['likelihood_score','impact_score','risk_score','risk_level','assessment_rationale','likelihood_rationale','impact_rationale','treatment','notes','status','acceptance_rationale','acceptance_expires_at','accepted_by','acceptance_date'].map(k=>[k,risk[k]??null]));
export function ensureRiskReview(db,risk) {
  const cadence=risk.review_cadence||'annual';
  if(!['none','monthly','quarterly','semiannual','annual','custom'].includes(cadence)) throw new Error('Invalid Risk review cadence.');
  if(cadence==='custom'&&(!Number.isInteger(risk.custom_recurrence_days)||risk.custom_recurrence_days<1||risk.custom_recurrence_days>3650)) throw new Error('Custom cadence requires 1–3650 days.');
  if(risk.next_review&&!Number.isFinite(Date.parse(risk.next_review))) throw new Error('Invalid next review date.');
  const relations={review:['reviews','review_id'],finding:['findings','finding_id'],vendor:['vendors','vendor_id'],audit:['assessments','assessment_id']};
  if(risk.source_type&&!['manual','annual_assessment','management',...Object.keys(relations)].includes(risk.source_type)) throw new Error('Invalid Risk source.');
  if(relations[risk.source_type]) {const [kind,key]=relations[risk.source_type]; if(!db[kind]?.some(r=>r[key]===risk.source_id&&r.client_id===risk.client_id)) throw new Error('Select a source record from this client.'); risk[key]=risk.source_id;}
  const reviews = db.reviews.filter(r=>r.client_id===risk.client_id&&r.risk_id===risk.risk_id);
  if(reviews.length>1) throw new Error('Multiple linked Risk Reviews require reconciliation.');
  let review = reviews[0];
  if(['closed','retired'].includes(risk.status)) {
    if(review&&!['completed','cancelled'].includes(review.status)) Object.assign(review,{status:'cancelled',cancelled_at:new Date().toISOString(),cancelled_by:db.user.user_id});
    return null;
  }
  if(!review&&!risk.next_review) return null;
  if(!review) {
    review={review_id:'risk_review_'+risk.risk_id,risk_id:risk.risk_id,client_id:risk.client_id,review_type:'risk_assessment',status:'upcoming',created_at:new Date().toISOString(),created_by:db.user.user_id};
    db.reviews.push(review);
  }
  const dateChanged=review.due_date!==risk.next_review;
  if(['completed','cancelled'].includes(review.status)&&risk.next_review) Object.assign(review,{status:'upcoming',current_occurrence_id:'occ_'+recordUuid(),notes:null,started_at:null,started_by:null,completion_date:null});
  Object.assign(review,{title:`Risk Review — ${risk.display_id} — ${risk.title}`,due_date:risk.next_review,owner_id:risk.owner_id,recurrence:risk.review_cadence||'annual',custom_recurrence_days:risk.custom_recurrence_days});
  Object.assign(review,reviewSchedule(review,dateChanged),reviewView(review));
  risk.linked_review_id=review.review_id;
  return review;
}
export function completeRiskReview(db,review,completed,body) {
  const risk=db.risks.find(r=>r.risk_id===review.risk_id&&r.client_id===review.client_id);
  if(!risk||['closed','retired'].includes(risk.status)) throw new Error('This Risk is no longer active.');
  const changes=body.risk_assessment||{};
  if(Object.keys(changes).some(k=>!['likelihood_score','impact_score','likelihood_rationale','impact_rationale','assessment_rationale','treatment','notes'].includes(k))) throw new Error('Use the Risk governance actions for lifecycle changes.');
  for(const key of ['likelihood_score','impact_score']) if(changes[key]!=null&&(!Number.isInteger(changes[key])||changes[key]<1||changes[key]>5)) throw new Error('Risk ratings must be whole numbers from 1 to 5.');
  if(changes.treatment==='accept'&&risk.treatment!=='accept') throw new Error('Use Accept Risk to record acceptance.');
  completed.risk_review_recommendation=body.risk_outcome||null;
  completed.risk_before=review.risk_baseline||riskSnapshot(risk);
  completed.risk_after=riskSnapshot(assessedRisk({...risk,...changes}));
  if(body.risk_outcome&&!['Reviewed — No Change','Additional Action Required','Closure Recommended'].includes(body.risk_outcome)) throw new Error('Invalid Risk Review outcome.');
  completed.outcome=completed.risk_before.acceptance_date!==completed.risk_after.acceptance_date?'Risk Accepted':['likelihood_score','impact_score','assessment_rationale','likelihood_rationale','impact_rationale'].some(k=>completed.risk_before[k]!==completed.risk_after[k])?'Assessment Updated':completed.risk_before.treatment!==completed.risk_after.treatment?'Treatment Updated':body.risk_outcome||'Reviewed — No Change';
  Object.assign(risk,completed.risk_after,{last_reviewed:completed.completed_at,next_review:reviewView(review).next_review_date,review_sync_occurrence_id:completed.occurrence_id});
}
