// The caller supplies only the selected client's assessment records.
export function findingScopes(assessments) {
  const scopes = new Map();
  for (const row of assessments) {
    for (const link of row.related_links || []) {
      if (link.kind !== 'findings' || !link.id) continue;
      if (!scopes.has(link.id)) scopes.set(link.id, new Set());
      scopes.get(link.id).add(row.framework_assessment_id);
    }
  }
  return scopes;
}

export function findingAppliesTo(assessmentId, finding, reviewIds, scopes) {
  const assigned = finding.framework_assessment_id;
  const linked = scopes.get(finding.finding_id);
  if (assigned || linked?.size) return assigned === assessmentId || !!linked?.has(assessmentId);
  return reviewIds.has(finding.review_id);
}

export function actionAppliesTo(assessmentId, task, reviewIds, findingIds) {
  if (task.framework_assessment_id === assessmentId) return true;
  if (task.finding_id) return findingIds.has(task.finding_id);
  return !task.framework_assessment_id && reviewIds.has(task.review_id);
}
