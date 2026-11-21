import {CATALOGS} from './frameworks';

// An explicitly saved list (including []) supersedes inherited support; absent lists preserve provenance.
export function policySupportsAssessment(assessment, policy) {
  if (assessment.client_id && policy.client_id && assessment.client_id !== policy.client_id) return false;
  if (Object.hasOwn(assessment, 'policy_link_ids')) return Array.isArray(assessment.policy_link_ids) && assessment.policy_link_ids.includes(policy.policy_id);
  return assessment.related_links?.some(link => link.kind === 'policies' && link.id === policy.policy_id)
    || !!assessment.framework_assessment_id && policy.framework_assessment_id === assessment.framework_assessment_id
    || (CATALOGS[assessment.framework_key]?.policy_mappings || []).some(mapping => mapping.policy_key === policy.baseline_key && mapping.safeguards.includes(assessment.definition_id));
}

export function policySupportIds(policy, framework, assessments = []) {
  const rows = assessments.filter(row => row.framework_key === framework && (!policy.client_id || row.client_id === policy.client_id));
  const ids = new Set((CATALOGS[framework]?.policy_mappings || []).filter(mapping => mapping.policy_key === policy.baseline_key).flatMap(mapping => mapping.safeguards));
  for (const row of rows) {
    if (policySupportsAssessment(row, policy)) ids.add(row.definition_id);
    else ids.delete(row.definition_id);
  }
  return [...ids];
}
