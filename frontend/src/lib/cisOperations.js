import {cis,reviewDrivers} from './frameworks';
import guidance from '@catalogs/operatorGuidance/cisAssessmentGuidance.json';

export const EMPTY_OPERATION={provider:'',confirmed:false};
export function cisSetupFacts(row){
  return {accountable_person_recorded:!!(row.owner_id||row.process_owner_id),operating_method_recorded:!!row.implementation?.trim(),arrangement_confirmed:!!row.cis_operation?.confirmed};
}
// Retained confirmation flags are historical data, not a current setup requirement.
export function operationGaps(row){
  const facts=row.cis_setup||cisSetupFacts(row);
  return [!facts.accountable_person_recorded&&'Accountable person',!facts.operating_method_recorded&&'Operating method or procedure reference'].filter(Boolean);
}
export function cisReviewBriefs(record,activeIds){
  return reviewDrivers(record).filter(d=>d.framework_key==='cis-ig1').map(driver=>{
    const plan=cis.review_plans.find(p=>p.key===driver.framework_plan_key);
    return plan&&{...plan,active:driver.framework_driver_active!==false,items:(driver.framework_safeguards||plan.safeguards).filter(id=>activeIds?activeIds.includes(id):cis.requirements.find(d=>d.id===id)?.implementation_group===1).map(id=>{
      const definition=cis.requirements.find(d=>d.id===id),checks=guidance.requirements[id];
      // Timing is shown per safeguard; the identical exception/follow-up prompt is shared above the items.
      const reviewQuestions=[...new Set(checks.review)].filter(text=>text!==`${definition.source_cadence} Confirm relevant exceptions and follow-up with the accountable owner.`);
      return {...definition,review:checks.review[0],reviewQuestions,outcome:checks.outcome[0],evidence:checks.evidence[0]};
    })};
  }).filter(Boolean);
}
