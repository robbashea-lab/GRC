import definitions from '@catalogs/frameworkDefinitions.json';
import cis from '@catalogs/cisIG1.json';
import hipaa from '@catalogs/hipaaSecurityRule.json';
import iso from '@catalogs/iso27001.json';
import nist from '@catalogs/nistCSF2.json';
import soc from '@catalogs/soc2.json';
export {cis};
export const CATALOGS={'cis-ig1':cis,hipaa,'iso-27001':iso,'soc-2':soc,'nist-csf-2':nist};
export const frameworkCatalog=key=>CATALOGS[key];
export const frameworkDefinition=(key,id)=>frameworkCatalog(key)?.requirements.find(d=>d.id===id);
export const activeDefinitions=(key,configuration={})=>(frameworkCatalog(key)?.requirements||[]).filter(d=>key==='cis-ig1'?(d.implementation_group||1)<=(configuration.implementation_group||1):key!=='soc-2'||(configuration.categories||['security']).includes(d.category));
export const activePlans=(key,configuration={})=>{const ids=new Set(activeDefinitions(key,configuration).map(d=>d.id));return (frameworkCatalog(key)?.review_plans||[]).map(p=>({...p,title:key==='cis-ig1'&&configuration.implementation_group===3?p.ig3_title||p.title:p.title,safeguards:p.safeguards.filter(id=>ids.has(id))})).filter(p=>p.safeguards.length);};
export const FRAMEWORKS=definitions.frameworks;
// Capabilities select product behavior. Authorization remains with the backend.
export const frameworkCapabilities=key=>FRAMEWORKS.find(f=>f.key===key)?.capabilities||[];
export const supportsFrameworkCapability=(key,capability)=>frameworkCapabilities(key).includes(capability);
export const frameworkWorkspace=key=>FRAMEWORKS.find(f=>f.key===key)?.workspace||'generic';
export const ASSESSMENT_STATUSES={not_assessed:'Not Assessed',in_progress:'In Progress',addressed:'Addressed',needs_attention:'Needs Attention',not_applicable:'Not Applicable'};
export const SPECIFICATION_LABELS={cybersecurity_outcome:'Cybersecurity outcome',standard:'Standard / general duty',required:'Required specification',addressable:'Addressable specification',related_dependency:'Related dependency',isms_clause:'ISMS requirement',annex_control:'Annex A / SoA',common_criterion:'Common Criterion',category_criterion:'Additional category criterion'};
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
export function reviewConfig(state,plan){
  const drivers=plan.drivers||[plan];
  const explicit=drivers.map(p=>p.source_minimum).filter(Boolean).sort((a,b)=>cadenceDays(a)-cadenceDays(b));
  const defaults=drivers.map(p=>p.default_cadence).sort((a,b)=>cadenceDays(a)-cadenceDays(b));
  const configured=drivers.map(p=>state.framework_reviews?.[p.key]).filter(Boolean);
  const proposed=explicit[0]||defaults[0];
  const result={enabled:plan.default_enabled??true,recurrence:proposed,custom_recurrence_days:plan.default_custom_recurrence_days??90,due_date:'',...configured[0]};
  // Historical drafts can disagree. Make the conflict actionable, not first-wins.
  const signature=c=>JSON.stringify([c.enabled??plan.default_enabled??true,c.recurrence||proposed,(c.recurrence||proposed)==='custom'?(c.custom_recurrence_days??plan.default_custom_recurrence_days??90):null,c.due_date||'']);
  return {...result,conflict:configured.some(c=>signature(c)!==signature(result))};
}
export function frameworkPlans(state){return Object.keys(CATALOGS).filter(key=>state.requirements?.[key]==='applies').flatMap(key=>activePlans(key,state.framework_settings?.[key]).map(p=>({...p,framework_key:key})));}
export function sharedFrameworkPlans(state){
  const groups=new Map();
  for(const p of frameworkPlans(state)){
    const key=p.baseline_key||p.key;
    if(!groups.has(key))groups.set(key,{...p,drivers:[]});
    groups.get(key).drivers.push(p);
  }
  return [...groups.values()].map(p=>({...p,source_minimum:p.drivers.map(d=>d.source_minimum).filter(Boolean).sort((a,b)=>cadenceDays(a)-cadenceDays(b))[0]||null}));
}
export function reviewDriver(key,plan,active=true){
  return {framework_key:key,framework_version:CATALOGS[key].version,framework_plan_key:plan.key,framework_driver_active:active,
    framework_safeguards:plan.safeguards,framework_basis:plan.basis,framework_source_cadence:plan.source_cadence,
    framework_default_cadence:plan.default_cadence,framework_source_minimum:plan.source_minimum||null,
    framework_cadence_references:plan.cadence_references||[]};
}
export function reviewDrivers(row){
  if(row.framework_drivers)return row.framework_drivers;
  const plan=CATALOGS[row.framework_key]?.review_plans.find(p=>p.key===row.framework_plan_key);
  return plan?[reviewDriver(row.framework_key,plan,row.framework_driver_active!==false)]:[];
}
export function existingFrameworkReview(rows,plan){
  const equivalent=Object.values(CATALOGS).flatMap(c=>c.review_plans).filter(p=>plan.baseline_key&&p.baseline_key===plan.baseline_key).map(p=>p.key);
  return rows.find(r=>r.framework_plan_key===plan.key)||rows.find(r=>plan.baseline_key&&(r.baseline_key===plan.baseline_key||equivalent.includes(r.framework_plan_key)));
}
export function genericReviews(catalog,state){
  const represented=new Set(frameworkPlans(state).filter(p=>reviewConfig(state,p).enabled).map(p=>p.baseline_key));
  return catalog.reviews.filter(r=>state.reviews.includes(r.key)&&!represented.has(r.key));
}
