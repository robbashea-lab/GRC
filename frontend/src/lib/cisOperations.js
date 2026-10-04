import {cis,reviewDrivers} from './frameworks';
import guidance from '@catalogs/operatorGuidance/cisAssessmentGuidance.json';

export const EMPTY_OPERATION={provider:'',confirmed:false};
export function cisSetupFacts(row){
  return {accountable_person_recorded:!!(row.owner_id||row.process_owner_id),operating_method_recorded:!!row.implementation?.trim(),arrangement_confirmed:!!row.cis_operation?.confirmed};
}
// Confirmation records a responsibility/arrangement, never effectiveness or compliance.
export function operationGaps(row){
  const facts=row.cis_setup||cisSetupFacts(row);
  return [!facts.accountable_person_recorded&&'Accountable person',!facts.operating_method_recorded&&'Operating method or procedure reference',!facts.arrangement_confirmed&&'Arrangement confirmation'].filter(Boolean);
}
export function cisReviewBriefs(record,activeIds){
  return reviewDrivers(record).filter(d=>d.framework_key==='cis-ig1').map(driver=>{
    const plan=cis.review_plans.find(p=>p.key===driver.framework_plan_key);
    return plan&&{...plan,active:driver.framework_driver_active!==false,items:(driver.framework_safeguards||plan.safeguards).filter(id=>activeIds?activeIds.includes(id):cis.requirements.find(d=>d.id===id)?.implementation_group===1).map(id=>({
      ...cis.requirements.find(d=>d.id===id),review:guidance.requirements[id].review[0],outcome:guidance.requirements[id].outcome[0],evidence:guidance.requirements[id].evidence[0]
    }))};
  }).filter(Boolean);
}
