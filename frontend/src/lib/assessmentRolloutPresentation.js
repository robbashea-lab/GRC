import registry from '@catalogs/assessmentRolloutPresentation.json';

function freezeMetadata(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeMetadata);
    Object.freeze(value);
  }
}
freezeMetadata(registry);

// These are presentation references, never permission or questionnaire selectors.
const recordsByIdentity = new Map();
for (const record of registry.records) {
  const key = record.frameworkKey + ':' + record.id;
  if (!recordsByIdentity.has(key)) recordsByIdentity.set(key, []);
  recordsByIdentity.get(key).push(record);
}

export function assessmentRolloutEntry(frameworkKey, id, {module, packageKey} = {}) {
  if (typeof frameworkKey !== 'string' || typeof id !== 'string') return null;
  const matches = (recordsByIdentity.get(frameworkKey + ':' + id) || [])
    .filter(record => (module === undefined || record.module === module)
      && (packageKey === undefined || record.packageKey === packageKey));
  if (matches.length !== 1) return null;
  const record = matches[0];
  return {
    ...record,
    sources: record.sourceIds.map(sourceId => registry.sources[sourceId]),
  };
}

export function assessmentQuestionPresentation(frameworkKey, id, questionId,
  {row, version, module, packageKey} = {}) {
  if (typeof questionId !== 'string' || (row !== undefined && typeof row !== 'string')) return null;
  const record = assessmentRolloutEntry(frameworkKey, id, {module, packageKey});
  if (!record || (version !== undefined && record.versions.length && !record.versions.includes(version))) return null;
  const matches = record.questions.filter(question => {
    // Workflow display keys stay explicitly separate from any native answer field.
    const identityMatches = question.questionId === questionId
      || (question.questionId === null && (question.presentationId === questionId
        || question.nativeMapping?.native_field === questionId));
    if (!identityMatches || (question.version && question.version !== version)) return false;
    if (row === undefined) return question.row === undefined;
    return question.row === row || question.rows?.some(item => item.row === row);
  });
  if (matches.length !== 1) return null;
  const question = matches[0];
  const matrixRow = row === undefined ? null : question.rows?.find(item => item.row === row);
  const guidance = record.hold ? null : (matrixRow?.guidance || question.guidance);
  return {
    ...question,
    ...(matrixRow || {}),
    reference: record.reference,
    guidance,
    ...(guidance?.sourceReference ? {sourceReference: guidance.sourceReference} : {}),
    tool: question.toolId === undefined ? null : registry.tools[question.toolId],
    hold: record.hold || null,
  };
}
