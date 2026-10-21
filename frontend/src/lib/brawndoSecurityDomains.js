import mapping from '@catalogs/brawndoSecurityDomains.json';
import pilot from '@catalogs/brawndoSecurityDomainsPilot.json';
import {cisActorMode, cisDefinitions, cisWorkspaceMatches} from './cisExperience';
import {cisSummary} from './cisVerification';
import {validImplementationPosition, applicableCounts} from './portfolioProgress';

export {mapping as securityDomainMapping};
const statuses = new Set(['addressed', 'in_progress', 'needs_attention', 'not_assessed', 'not_applicable']);
const sameIds = (values, expected) => Array.isArray(values) && values.length === expected.length
  && new Set(values).size === values.length && expected.every(id => values.includes(id));
export function cisSecurityDomainMapping(group) {
  const definitions = cisDefinitions(group);
  const controlIds = new Set(definitions.map(definition => definition.control));
  const domains = mapping.domains.map(domain => ({...domain, implementationGroup: group, notes: group === 1 ? domain.notes : undefined,
    safeguardIds: definitions.filter(definition => domain.controlIds.includes(definition.control)).map(definition => definition.id)}));
  const mappedControls = new Set(domains.flatMap(domain => domain.controlIds));
  for (const controlId of controlIds) {
    if (mappedControls.has(controlId)) continue;
    const members = definitions.filter(definition => definition.control === controlId);
    domains.push({id: `cis-control-${controlId}`, label: members[0].control_name, implementationGroup: group,
      controlIds: [controlId], safeguardIds: members.map(definition => definition.id)});
  }
  return domains.filter(domain => domain.safeguardIds.length);
}

// Presentation only. The native server remains the authorization and persistence boundary.
export function securityDomainsEnabled(clientId, frameworkKey, data, user, config = pilot) {
  return config.enabled === true && cisActorMode(user, user?.workspace_mode ?? 'standard')
    && frameworkKey === 'cis-ig1' && cisWorkspaceMatches(data, clientId);
}

// Keep the exact native row references for openRecord; never create assessment copies.
export function securityDomainModel(data, rows, clientId) {
  const domains = cisSecurityDomainMapping(data?.configuration?.implementation_group);
  const ids = domains.flatMap(domain => domain.safeguardIds);
  const expected = cisDefinitions(data?.configuration?.implementation_group);
  const definitions = data?.definitions?.filter(definition => ids.includes(definition.id)) || [];
  const records = data?.assessments?.filter(row => ids.includes(row.definition_id)) || [];
  const native = rows.filter(row => ids.includes(row.definition_id));
  const position = data?.implementation_position;
  const summary = cisSummary(native);
  const counts = Object.fromEntries(applicableCounts(position).map(value => [value.key, value.count]));
  const available = cisWorkspaceMatches(data, clientId)
    && sameIds(ids, expected.map(definition => definition.id))
    && sameIds(data?.active_definition_ids, ids)
    && sameIds(definitions.map(definition => definition.id), ids)
    && definitions.every(definition => definition.version === '8.1' && expected.some(row => row.id === definition.id && row.implementation_group === definition.implementation_group))
    && sameIds(records.map(row => row.definition_id), ids)
    && sameIds(native.map(row => row.definition_id), ids)
    && new Set(records.map(row => row.framework_assessment_id)).size === ids.length
    && records.every(row => typeof row.framework_assessment_id === 'string' && row.framework_assessment_id
      && row.client_id === clientId && row.framework_key === 'cis-ig1'
      && row.framework_version === '8.1' && statuses.has(row.status)
      && (row.status !== 'not_applicable' || typeof row.na_rationale === 'string' && !!row.na_rationale.trim()))
    && native.every(row => row.client_id === clientId && row.framework_key === 'cis-ig1'
      && row.framework_version === '8.1' && records.some(record => record.definition_id === row.definition_id
      && record.framework_assessment_id === row.framework_assessment_id && record.status === row.status))
    && validImplementationPosition(position) && position.total === native.length
    && position.denominator === summary.applicable && position.excluded === summary.na
    && counts.addressed === summary.addressed && counts.in_progress === summary.partial
    && counts.needs_attention === summary.gap && counts.not_assessed === summary.notAssessed;
  return domains.map(domain => {
    const mappedRows = domain.safeguardIds.map(id => native.find(row => row.definition_id === id)).filter(Boolean);
    return {...domain, ...(available ? cisSummary(mappedRows) : {}), rows: available ? mappedRows : [],
      available: !!available, reason: available ? '' : 'Native implementation source unavailable. Reopen the program to refresh its records.'};
  });
}
