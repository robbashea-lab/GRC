import {CATALOGS, FRAMEWORKS, SPECIFICATION_LABELS} from './frameworks';

export const BUSINESS_BASIS={organizational:'Organizational requirement',management:'Management decision',contractual:'Contractual requirement',customer:'Customer requirement',risk:'Risk-driven',recommended:'Best practice / recommendation',enhancement:'Recommended enhancement'};
export const CADENCE_BASIS={organization_defined:'Organization-defined',risk_based:'Risk-based',contractual:'Contractual',recommended:'Recommendation recorded by organization'};
export function referenceUrl(value) {
  try {const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;} catch {return null;}
}
export function validateGovernanceContext(value) {
  if(value==null)return;
  const limits={rationale:4000,cadence_rationale:4000,citation:1000,reference_url:2000};
  if(typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['category','cadence_source',...Object.keys(limits)].includes(k)))throw new Error('Invalid governance context');
  for(const [k,max] of Object.entries(limits))if(k in value&&(typeof value[k]!=='string'||value[k].length>max))throw new Error('Invalid governance context '+k);
  if(value.category&&!BUSINESS_BASIS[value.category]||value.cadence_source&&!CADENCE_BASIS[value.cadence_source])throw new Error('Invalid governance classification');
  if(value.reference_url&&!referenceUrl(value.reference_url))throw new Error('Reference must be an HTTPS URL without credentials');
}
export function nativeClassification(key,d) {
  if(d.unavailable)return 'Classification not recorded';
  if(key==='cis-ig1')return `IG${d.implementation_group||1} Safeguard`;
  return SPECIFICATION_LABELS[d.specification]||d.classification?.replaceAll('_',' ')||'Classification not recorded';
}
// Catalog definitions explain requirements; operational records support them. A
// supporting relationship is never upgraded into a mandatory implementation.
export function requirementBasis(kind,row={},related={}) {
  const groups=new Map();
  const add=(key,id,assessment)=>{
    if(!key||!id)return;
    const catalog=CATALOGS[key],definition=catalog?.requirements.find(d=>d.id===id)||{id,title:'Reference retained; definition unavailable',unavailable:true};
    if(!groups.has(key))groups.set(key,{key,label:FRAMEWORKS.find(f=>f.key===key)?.label||key,version:catalog?.version||row.framework_version||'Version not recorded',requirements:[],plans:[],policyMappings:[]});
    const group=groups.get(key),old=group.requirements.find(r=>r.definition.id===id);
    if(old){if(assessment)old.assessment=assessment;return;}
    group.requirements.push({definition,assessment,classification:nativeClassification(key,definition)});
  };
  for(const id of row.framework_safeguards||[])add(row.framework_key,id);
  for(const a of related.framework_assessments||[])if(a.client_id===row.client_id)add(a.framework_key,a.definition_id,a);
  for(const group of groups.values()) {
    const catalog=CATALOGS[group.key]||{review_plans:[],policy_mappings:[]},ids=new Set(group.requirements.map(r=>r.definition.id));
    const baseline=row.baseline_key||CATALOGS[row.framework_key]?.review_plans.find(p=>p.key===row.framework_plan_key)?.baseline_key;
    if(kind==='reviews')group.plans=catalog.review_plans.filter(p=>p.key===row.framework_plan_key||baseline&&p.baseline_key===baseline&&p.safeguards.some(id=>ids.has(id)));
    if(kind==='policies')group.policyMappings=catalog.policy_mappings.filter(m=>m.policy_key===row.baseline_key&&m.safeguards.some(id=>ids.has(id)));
  }
  return [...groups.values()];
}
export function basisSummary(row) {
  const keys=[...new Set([row.framework_key,...(row.basis_framework_keys||[])].filter(Boolean))];
  if(keys.length>2)return `${keys.length} frameworks`;
  if(keys.length)return keys.map(k=>FRAMEWORKS.find(f=>f.key===k)?.label||k).join(' + ');
  return BUSINESS_BASIS[row.governance_context?.category]|| (row.risk_id?'Risk-driven':row.vendor_id?'Vendor governance':row.policy_id?'Policy governance':'Basis not recorded');
}
export function cadenceBasis(row,groups=[]) {
  const context=row.governance_context||{};
  return {current:row.recurrence==='custom'?`Every ${row.custom_recurrence_days} days`:row.recurrence||'Not recorded',
    classification:CADENCE_BASIS[context.cadence_source]||'Client configuration · rationale not recorded',rationale:context.cadence_rationale,
    sources:groups.flatMap(g=>g.plans.map(p=>({framework:g.label,key:p.key,basis:p.basis,source:p.source_cadence,minimum:p.source_minimum,recommended:p.default_cadence,reason:p.reason,refs:p.cadence_references||[]})))};
}
