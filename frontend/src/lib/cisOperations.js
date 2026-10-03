import {cis,reviewDrivers} from './frameworks';
import guidance from '@catalogs/operatorGuidance/cisAssessmentGuidance.json';

export const EMPTY_OPERATION={provider:'',confirmed:false};
// Confirmation records a responsibility/arrangement, never effectiveness or compliance.
export function operationGaps(row){
  return [!row.owner_id&&!row.process_owner_id&&'Accountable person',!row.implementation?.trim()&&'Operating method or procedure reference',!row.cis_operation?.confirmed&&'Arrangement confirmation'].filter(Boolean);
}
export function cisReviewBriefs(record){
  return reviewDrivers(record).filter(d=>d.framework_key==='cis-ig1').map(driver=>{
    const plan=cis.review_plans.find(p=>p.key===driver.framework_plan_key);
    return plan&&{...plan,active:driver.framework_driver_active!==false,items:plan.safeguards.map(id=>({
      ...cis.requirements.find(d=>d.id===id),review:guidance.requirements[id].review[0],outcome:guidance.requirements[id].outcome[0],evidence:guidance.requirements[id].evidence[0]
    }))};
  }).filter(Boolean);
}
