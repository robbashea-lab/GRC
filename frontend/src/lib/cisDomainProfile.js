import {cisDefinitions, cisWorkspaceMatches} from './cisExperience';
import {cisSecurityDomainMapping} from './brawndoSecurityDomains';
import {applicableCounts, validImplementationPosition} from './portfolioProgress';

const STATUS_KEYS = ['addressed', 'in_progress', 'needs_attention', 'not_assessed'];
const emptyCounts = () => Object.fromEntries(STATUS_KEYS.map(key => [key, 0]));
const sameIds = (values, expected) => Array.isArray(values) && values.length === expected.length
  && new Set(values).size === values.length && expected.every(id => values.includes(id));
const phrase = (count, singular, plural) => `${count} ${count === 1 ? singular : plural}`;

export const formatCisDomainRate = rate => Number.isFinite(rate) ? `${rate.toFixed(1)}%` : 'N/A';

function domainFocus({applicable, counts}) {
  if (!applicable) return 'No applicable safeguards in this domain.';
  const work = [];
  if (counts.needs_attention) work.push(`Address ${phrase(counts.needs_attention, 'known not-implemented safeguard', 'known not-implemented safeguards')}.`);
  if (counts.in_progress) work.push(`Complete ${phrase(counts.in_progress, 'partially implemented safeguard', 'partially implemented safeguards')}.`);
  if (counts.not_assessed) work.push(`Assess ${phrase(counts.not_assessed, 'safeguard whose implementation is unknown', 'safeguards whose implementation is unknown')}.`);
  return work.join(' ') || 'All applicable safeguards are implemented. This describes implementation status, not certification.';
}

function summarize(ids, records) {
  const counts = emptyCounts(), applicableIds = [], excludedIds = [];
  for (const id of new Set(ids)) {
    const row = records.get(id);
    if (row.status === 'not_applicable') excludedIds.push(id);
    else { counts[row.status]++; applicableIds.push(id); }
  }
  const implemented = counts.addressed, applicable = applicableIds.length;
  return {implemented, applicable, counts, rate: applicable ? implemented / applicable * 100 : null,
    safeguardIds: [...new Set(ids)], applicableIds, excludedIds,
    assessmentIds: [...new Set(ids)].map(id => records.get(id).framework_assessment_id)};
}

// The complete native response retains missing/duplicate evidence that programRows would discard.
export function buildCisDomainProfile(source, {clientId, implementationGroup} = {}) {
  const unavailable = (reason, detail = {}) => ({available: false, reason, domains: [], totals: null, ...detail});
  const group = source?.configuration?.implementation_group;
  if (!Array.isArray(source?.definitions) || !Array.isArray(source?.assessments)
    || [...source.definitions, ...source.assessments].some(row => !row || typeof row !== 'object' || Array.isArray(row))
    || implementationGroup !== undefined && group !== implementationGroup
    || !cisWorkspaceMatches(source, clientId)) {
    return unavailable('The native CIS client, program or safeguard scope is unavailable. Reopen the program to refresh its records.');
  }
  const definitions = cisDefinitions(group), ids = definitions.map(row => row.id), active = new Set(ids);
  const position = source.implementation_position;
  if (!validImplementationPosition(position) || position.invalid_applicability_count > 0) {
    return unavailable(position?.reason || 'Native implementation records or statuses are unavailable or invalid.');
  }
  if (position.scope && (position.scope.framework_key !== 'cis-ig1'
    || position.scope.catalog_version !== source.framework.version
    || position.scope.configuration?.implementation_group !== group
    || !sameIds(position.scope.definition_ids, ids))) {
    return unavailable('The saved implementation position belongs to another CIS scope.');
  }
  const sourceDefinitions = new Map(source.definitions.map(row => [row.id, row]));
  const unmappedIds = definitions.filter(row => {
    const saved = sourceDefinitions.get(row.id);
    return saved.control !== row.control || saved.control_name !== row.control_name;
  }).map(row => row.id);
  if (unmappedIds.length) return unavailable('Native domain mappings are missing or inconsistent for some safeguards.', {unmappedIds});

  const records = new Map(source.assessments.filter(row => active.has(row.definition_id)).map(row => [row.definition_id, row]));
  if ([...records.values()].some(row => row.archived || row.archived_at
    || !STATUS_KEYS.includes(row.status) && (row.status !== 'not_applicable'
      || typeof row.na_rationale !== 'string' || !row.na_rationale.trim()))) {
    return unavailable('Some active safeguards have unavailable statuses or invalid applicability decisions.');
  }
  const totals = summarize(ids, records), canonicalCounts = Object.fromEntries(applicableCounts(position).map(value => [value.key, value.count]));
  if (position.total !== ids.length || position.denominator !== totals.applicable
    || position.implemented !== totals.implemented || position.excluded !== totals.excludedIds.length
    || STATUS_KEYS.some(key => canonicalCounts[key] !== totals.counts[key])) {
    return unavailable('Safeguard records do not reconcile with the native saved implementation position.');
  }

  // Reuse the existing workspace taxonomy; overlapping domain membership never changes global totals.
  const mapping = cisSecurityDomainMapping(group), mappedIds = new Set(mapping.flatMap(domain => domain.safeguardIds));
  const missingMapping = ids.filter(id => !mappedIds.has(id));
  if (missingMapping.length || [...mappedIds].some(id => !active.has(id))
    || new Set(mapping.map(domain => domain.id)).size !== mapping.length
    || mapping.some(domain => !domain.id || !domain.label)) {
    return unavailable('Native domain mapping does not cover the selected safeguard scope.', {unmappedIds: missingMapping});
  }
  const domains = mapping.map(domain => {
    const summary = summarize(domain.safeguardIds, records);
    return {id: domain.id, name: domain.label, notes: domain.notes, controlIds: domain.controlIds,
      ...summary, focus: domainFocus(summary)};
  });
  return {available: true, reason: '', clientId, implementationGroup: group, domains, totals,
    programId: position.program_id, scopeSignature: position.scope_signature, sourceRevision: position.source_revision};
}
