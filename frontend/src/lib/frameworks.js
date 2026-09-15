import definitions from './frameworkDefinitions.json';
import cis from './cisIG1.json';
export {cis};
export const FRAMEWORKS=definitions.frameworks;
export const ASSESSMENT_STATUSES={not_assessed:'Not Assessed',in_progress:'In Progress',addressed:'Addressed',needs_attention:'Needs Attention',not_applicable:'Not Applicable'};
export const REQUIREMENT_TYPES={recurring:'Recurring governance / validation',operational:'Operational cadence',event:'Event-driven',state:'Implementation / state',training:'Training / program'};
export const CADENCES=['monthly','quarterly','semiannual','annual','custom'];
export const cadenceDays=(c,days)=>({monthly:30,quarterly:90,semiannual:180,annual:365}[c]||Number(days)||0);
export const belowSource=(plan,config)=>!!plan.source_minimum&&cadenceDays(config?.recurrence||plan.default_cadence,config?.custom_recurrence_days)>cadenceDays(plan.source_minimum);
export function onboardingDraft(state){
  const untouched=!state.completed&&!Object.values(state.policies||{}).some(Boolean)&&!Object.values(state.requirements||{}).some(Boolean);
  return {...state,version:3,step:untouched?0:state.version>=3?state.step:state.step===0?1:state.step===1?0:state.step,
    requirements:Object.fromEntries(FRAMEWORKS.map(f=>[f.key,state.requirements?.[f.key]||'does_not_apply'])),
    framework_reviews:state.framework_reviews||{},reviews:state.version>=3||state.completed?state.reviews:[]};
}
export const selectedPrograms=state=>FRAMEWORKS.filter(f=>state.requirements?.[f.key]==='applies');
export const reviewConfig=(state,plan)=>({enabled:true,recurrence:plan.default_cadence,custom_recurrence_days:90,due_date:'',...state.framework_reviews?.[plan.key]});
export function frameworkPlans(state){return state.requirements?.['cis-ig1']==='applies'?cis.review_plans:[];}
export function genericReviews(catalog,state){
  const represented=new Set(frameworkPlans(state).filter(p=>reviewConfig(state,p).enabled).map(p=>p.baseline_key));
  return catalog.reviews.filter(r=>state.reviews.includes(r.key)&&!represented.has(r.key));
}
