import {ASSESSMENT_STATUSES,FRAMEWORKS} from './frameworks';
import {CSF_STATUSES} from './csfProfile';
import cisGuidance from './operatorGuidance/cis.json';
import nistGuidance from './operatorGuidance/nist.json';
import hipaaGuidance from './operatorGuidance/hipaa.json';
import isoGuidance from './operatorGuidance/iso.json';
import socGuidance from './operatorGuidance/soc.json';

export const operatorStatuses=key=>key==='nist-csf-2'?CSF_STATUSES:key==='soc-2'?{...ASSESSMENT_STATUSES,in_progress:'Partially Addressed',addressed:'Addressed (Readiness)',needs_attention:'Needs Remediation / Validation'}:{...ASSESSMENT_STATUSES,in_progress:'Partially Implemented',addressed:'Implemented',needs_attention:'Not Implemented / Needs Validation'};
export const STATUS_HELP={
  not_assessed:'No assessment conclusion has been recorded yet.',
  in_progress:'Some elements exist, but meaningful coverage, documentation, operation or validation gaps remain. Describe those limits in Assessment notes.',
  addressed:'Implementation is established within the assessed scope and supported by the evidence reviewed. This is an assessment conclusion, not certification.',
  needs_attention:'Implementation is absent or evidence is insufficient to validate it. Record which condition applies in Assessment notes; use a Finding when remediation is needed.',
  not_applicable:'Record why this item is outside scope. Framework-specific applicability rules still apply; the assessment remains in history.'
};
export const operatorProgram=key=>FRAMEWORKS.find(f=>f.key===key)?.label||key;
export function operatorGuidance(key,definition){
  if(key==='soc-2'){const criterion=socGuidance.criteria[definition.id];return {meaning:criterion?.[0],implementation:socGuidance.groups[definition.control]||socGuidance.groups.privacy,evidence:criterion?.[1]};}
  if(key==='iso-27001'){const annex=isoGuidance.annex[definition.id];return {meaning:annex?.[0]||isoGuidance.clauses[definition.id],implementation:isoGuidance.groups[definition.control],evidence:annex?.[1]||definition.evidence_guidance};}
  if(key==='hipaa')return {meaning:hipaaGuidance.meanings[definition.id],...(hipaaGuidance.groups[definition.id.slice(0,7)]||hipaaGuidance.groups.support),evidence:hipaaGuidance.evidence[definition.id]};
  if(key==='nist-csf-2')return {meaning:nistGuidance.meanings[definition.id],implementation:nistGuidance.groups[definition.category],evidence:definition.evidence_guidance};
  const group=key==='cis-ig1'?cisGuidance[String(definition.control)]:null;
  return {meaning:definition.guidance,implementation:group?.implementation||'Describe the scoped practice, accountable responsibility and exceptions. Evidence should demonstrate operation, not only the existence of a document.',evidence:cisGuidance.evidence?.[definition.id]||group?.evidence||definition.evidence_guidance||'Policies, configuration records and dated records of the activity may support the assessment.'};
}
export function assessmentProgress(rows){
  const applicable=rows.filter(r=>r.status!=='not_applicable');
  return {total:rows.length,applicable:applicable.length,assessed:applicable.filter(r=>r.status!=='not_assessed').length,excluded:rows.length-applicable.length};
}
