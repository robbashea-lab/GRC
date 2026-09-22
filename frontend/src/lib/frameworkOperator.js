import {ASSESSMENT_STATUSES,FRAMEWORKS} from './frameworks';
import {CSF_STATUSES} from './csfProfile';
import cisGuidance from './operatorGuidance/cis.json';

export const operatorStatuses=key=>key==='nist-csf-2'?CSF_STATUSES:{...ASSESSMENT_STATUSES,in_progress:'Partially Implemented',addressed:'Implemented',needs_attention:'Not Implemented / Needs Validation'};
export const STATUS_HELP={
  not_assessed:'No assessment conclusion has been recorded yet.',
  in_progress:'Some elements exist, but meaningful coverage, documentation, operation or validation gaps remain. Describe those limits in Assessment notes.',
  addressed:'Implementation is established within the assessed scope and supported by the evidence reviewed. This is an assessment conclusion, not certification.',
  needs_attention:'Implementation is absent or evidence is insufficient to validate it. Record which condition applies in Assessment notes; use a Finding when remediation is needed.',
  not_applicable:'Record why this item is outside scope. Framework-specific applicability rules still apply; the assessment remains in history.'
};
export const operatorProgram=key=>FRAMEWORKS.find(f=>f.key===key)?.label||key;
export function operatorGuidance(key,definition){
  const group=key==='cis-ig1'?cisGuidance[String(definition.control)]:null;
  return {meaning:definition.guidance,implementation:group?.implementation||'Describe the scoped practice, accountable responsibility and exceptions. Evidence should demonstrate operation, not only the existence of a document.',evidence:group?.evidence||definition.evidence_guidance||'Policies, configuration records and dated records of the activity may support the assessment.'};
}
export function assessmentProgress(rows){
  const applicable=rows.filter(r=>r.status!=='not_applicable');
  return {total:rows.length,applicable:applicable.length,assessed:applicable.filter(r=>r.status!=='not_assessed').length,excluded:rows.length-applicable.length};
}
