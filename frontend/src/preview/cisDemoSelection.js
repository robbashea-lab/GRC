import baseline from '@catalogs/onboardingCatalog.json';
import {cis,activeDefinitions,activePlans} from '../lib/frameworks';

export const CIS_DEMO_REVISION='cis81-standard-demo-v1';
export const CIS_DEMO_SCENARIOS=Object.freeze([
  {client_id:'demo_brawndo',name:'Brawndo',implementation_group:1,people:['Joe Bowers','President Camacho','Rita'],service:'Beverage production and distribution'},
  {client_id:'demo_initech',name:'Initech',implementation_group:2,people:['Peter Gibbons','Bill Lumbergh','Samir Nagheenanajar'],service:'Business software and payment services'},
  {client_id:'demo_krusty_krab',name:'The Krusty Krab',implementation_group:3,people:['Eugene Krabs','Squidward Tentacles','SpongeBob SquarePants'],service:'Restaurant operations and ordering platform'},
]);

// A reproducible selection manifest, not a second framework catalog.
export function cisDemoSelection(implementation_group) {
  const scenario=CIS_DEMO_SCENARIOS.find(row=>row.implementation_group===implementation_group);
  if(!scenario)throw new Error('Invalid CIS Demo implementation group');
  const cid=scenario.client_id;
  const ids=activeDefinitions('cis-ig1',{implementation_group}).map(d=>d.id),scope=new Set(ids);
  const policies=baseline.policies.map(policy=>{
    const mappings=cis.policy_mappings.filter(m=>m.policy_key===policy.key).map(m=>({...m,safeguards:m.safeguards.filter(id=>scope.has(id))})).filter(m=>m.safeguards.length);
    return {policy_key:policy.key,title:policy.name,include:!!mappings.length,mappings,
      classification:mappings.some(m=>m.basis==='Required Document')?'framework_document_required_contents':mappings.length?'framework_supporting_document':'optional_organizational',
      rationale:mappings.length?'Document contents support the mapped safeguard; the policy title alone is not implementation proof.':'Not selected: no selected-IG CIS mapping; no missing-document response is generated.'};
  });
  const plans=activePlans('cis-ig1',{implementation_group});
  const followup=(review_id,source_kind,source_id,recurrence,classification,cadence_basis,safeguards=[])=>({review_id,source_kind,source_id,include:true,recurrence,classification,cadence_basis,safeguards});
  const native_followups=implementation_group===1?[
    ...policies.filter(p=>p.include).map(p=>followup(`policy_review_${cid}_${p.policy_key}`,'policies',`${cid}_${p.policy_key}`,'annual','selected_document_maintenance',
      'Native individual-document annual schedule chosen for this fictional program. Mapped process duties remain distinct; this is not a blanket CIS annual approval mandate.',[...new Set(p.mappings.flatMap(m=>m.safeguards))])),
    ...[0,1,2].map(i=>followup(`vendor_review_${cid}_vendor_${i}_vendor`,'vendors',`${cid}_vendor_${i}`,'annual','organization_selected_supplier_governance',
      'Fictional organization-selected Vendor review supporting provider inventory and relationships. IG1 15.1 does not mandate an annual full supplier assessment.',['15.1'])),
    ...[0,1,2].map(i=>followup(`risk_review_${cid}_risk_${i}`,'risks',`${cid}_risk_${i}`,'quarterly','explicit_fictional_risk_exception','Native risk-specific owner review; an organization decision, not a CIS-required generic Review.')),
    followup(`risk_review_${cid}_risk_ai_drafting`,'risks',`${cid}_risk_ai_drafting`,'quarterly','explicit_fictional_ai_risk_exception','Human-scored internal AI exposure; directly necessary native Risk review, not a CIS mandate.'),
  ]:[
    followup(`vendor_review_${cid}_vendor_hosting_vendor`,'vendors',`${cid}_vendor_hosting`,'annual','organization_selected_supplier_governance',
      'Native provider-specific review supports applicable provider work. A scheduled Review alone does not prove a 15.5 assessment or replace its contract-event duty.',['15.1',...(implementation_group>=2?['15.2','15.3','15.4']:[]),...(implementation_group===3?['15.5']:[])]),
    followup(`risk_review_${cid}_risk_recovery`,'risks',`${cid}_risk_recovery`,'quarterly','explicit_fictional_risk_exception','Human-scored service dependency exposure; native owner review is an organization decision, not a CIS-required generic Review.'),
  ];
  native_followups.push(followup(`${cid}_review_ai`,'ai_systems',`${cid}_ai_drafting`,'quarterly','explicit_fictional_ai_exception','Human oversight of internal drafting and directly linked Risk; an explicit fictional scenario exception, not a CIS mandate.'));
  return {revision:CIS_DEMO_REVISION,client_id:cid,framework_key:'cis-ig1',framework_version:'8.1',implementation_group,safeguard_ids:ids,
    policies,selected_policy_keys:policies.filter(p=>p.include).map(p=>p.policy_key),
    framework_reviews:plans.map(plan=>({...plan,include:plan.default_enabled!==false,
      classification:plan.source_minimum?'framework_recurring_governance':plan.cadence_class==='D'?'framework_specific_recommended_validation':'optional_focused_operational_tracking',
      exclusion_reason:plan.default_enabled===false?'Optional separate tracking; preserve the source duty and use actual operational evidence/shared work without duplicate scheduling.':null})),
    selected_framework_plan_keys:plans.filter(p=>p.default_enabled!==false).map(p=>p.key),
    generic_reviews:baseline.reviews.map(review=>({baseline_key:review.key,include:false,classification:'optional_organizational',rationale:'Generic organizational preset is not selected; compatible CIS work is selected through its mapped framework plan.'})),
    native_followups,
    exceptions:[{kind:'risks',classification:'explicit_fictional_scenario_exception',rationale:'Useful company-specific exposures with human likelihood/impact and native owner follow-up; no claim of a CIS mandate.'},{kind:'ai_systems',classification:'explicit_fictional_scenario_exception',rationale:'Internal drafting examples require human verification and a linked human-scored Risk; no automatic Critical rating or generic catalog enablement.'}]};
}
