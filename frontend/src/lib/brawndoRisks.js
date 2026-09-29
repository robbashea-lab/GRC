import {assessedRisk} from './grcWork';
import {calendarDay,managementDay} from './managementDates';
import {reviewSchedule} from './reviewOccurrences';
import {riskIsClosed} from './riskRegister';

export const riskCategories={cybersecurity:'Technical & Cybersecurity',operational:'Operational',vendor:'Third-Party & Supply Chain',physical:'Physical & Environmental',privacy:'Data & Privacy',legal_regulatory:'Legal, Regulatory & Contractual',continuity:'Business Continuity & Recovery',personnel:'People & Personnel',governance:'Governance & Strategic',other:'Other'};
export const riskTreatments={'':'Not Yet Decided',mitigate:'Mitigate',transfer:'Transfer/Share',avoid:'Avoid',accept:'Accept'};
export const pilotRiskStatus=value=>({identified:'Open',assessed:'Open',open:'Open',in_progress:'In Treatment',treated:'In Treatment',monitoring:'Monitoring',accepted:'Accepted',closed:'Closed',retired:'Closed',escalated:'Escalated (legacy)'})[value]||value;
export const riskViews=[['all_active','All Active'],['high','High'],['critical','Critical'],['review_due','Due for Review'],['accepted','Accepted'],['closed','Closed']].map(([id,label])=>({id,label}));
export function riskMatches(r,view,now=new Date()){
  if(view==='all')return true;
  if(view==='closed')return riskIsClosed(r);
  if(riskIsClosed(r))return false;
  const date=calendarDay(r.next_review),today=managementDay(now);
  if(view==='overdue')return date!==null&&date<today;
  if(view==='upcoming')return date!==null&&date>=today&&date<=today+30;
  if(view==='review_due')return date!==null&&date<=today;
  if(view==='unassigned')return !r.owner_id;
  if(view==='accepted')return r.status==='accepted'&&!!r.accepted_by&&!!r.acceptance_date&&!!r.acceptance_rationale?.trim()&&calendarDay(r.acceptance_expires_at)>today;
  if(['high','critical'].includes(view))return assessedRisk(r).risk_level===view;
  if(view==='significant')return ['high','critical'].includes(assessedRisk(r).risk_level);
  return true;
}
// Use the established calendar-month recurrence calculation, anchored to completion.
export const nextRiskReview=(day,cadence='annual',days)=>reviewSchedule({due_date:day,recurrence:cadence||'annual',custom_recurrence_days:days}).next_review_date?.slice(0,10)||'';
export const newRiskDefaults=(now=new Date())=>({title:'',category:'cybersecurity',description:'',impact_description:'',source_type:'manual',likelihood_score:null,impact_score:null,owner_id:'',treatment:'',review_cadence:'annual',next_review:nextRiskReview(now.toISOString().slice(0,10))});
export function riskColumns(columns){return columns.map(c=>{
  if(c.key==='title')return {...c,label:'Risk Name'};
  if(['last_reviewed','next_review'].includes(c.key))return {...c,label:c.key==='last_reviewed'?'Last Review':'Next Review',sortLabels:['Earliest First','Latest First']};
  if(['category','risk_level','owner_id','status'].includes(c.key))return {...c,sortable:false,filterOnly:true,...(c.key==='owner_id'?{label:'Assigned Owner'}:{}),...(c.key==='category'?{labelValue:v=>riskCategories[v]||`${v} (recorded)`}:{}),...(c.key==='status'?{value:r=>pilotRiskStatus(r.status||'open'),labelValue:v=>v,options:undefined}: {})};
  return c;
});}
