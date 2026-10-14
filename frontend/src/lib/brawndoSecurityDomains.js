import mapping from '@catalogs/brawndoSecurityDomains.json';
import pilot from '@catalogs/brawndoSecurityDomainsPilot.json';
import {cis} from './frameworks';
import {cisSummary} from './cisVerification';
import {validImplementationPosition, applicableCounts} from './portfolioProgress';

export {mapping as securityDomainMapping};
const statuses = new Set(['addressed', 'in_progress', 'needs_attention', 'not_assessed', 'not_applicable']);
const sameIds = (values, expected) => Array.isArray(values) && values.length === expected.length
  && new Set(values).size === values.length && expected.every(id => values.includes(id));

// Presentation only. The native server remains the authorization and persistence boundary.
export function securityDomainsEnabled(clientId, frameworkKey, data, user, config = pilot) {
  return config.enabled === true && !!user && user.workspace_mode !== 'demo'
    && clientId === config.clientId && frameworkKey === config.frameworkKey
    && data?.selected === true && data?.configured === true
    && data.framework?.key === config.frameworkKey && data.framework?.version === config.frameworkVersion
    && data.configuration?.implementation_group === config.implementationGroup
    && data.implementation_position?.program_id === `${config.clientId}:${config.frameworkKey}`;
}

// Keep the exact native row references for openRecord; never create assessment copies.
export function securityDomainModel(data, rows) {
  const ids = mapping.domains.flatMap(domain => domain.safeguardIds);
  const expected = cis.requirements.filter(definition => definition.implementation_group === 1);
  const definitions = data?.definitions?.filter(definition => ids.includes(definition.id)) || [];
  const records = data?.assessments?.filter(row => ids.includes(row.definition_id)) || [];
  const native = rows.filter(row => ids.includes(row.definition_id));
  const position = data?.implementation_position;
  const summary = cisSummary(native);
  const counts = Object.fromEntries(applicableCounts(position).map(value => [value.key, value.count]));
  const available = sameIds(ids, expected.map(definition => definition.id))
    && sameIds(data?.active_definition_ids, ids)
    && sameIds(definitions.map(definition => definition.id), ids)
    && definitions.every(definition => definition.version === pilot.frameworkVersion && definition.implementation_group === 1)
    && sameIds(records.map(row => row.definition_id), ids)
    && sameIds(native.map(row => row.definition_id), ids)
    && new Set(records.map(row => row.framework_assessment_id)).size === ids.length
    && records.every(row => typeof row.framework_assessment_id === 'string' && row.framework_assessment_id
      && row.client_id === pilot.clientId && row.framework_key === pilot.frameworkKey
      && row.framework_version === pilot.frameworkVersion && statuses.has(row.status)
      && (row.status !== 'not_applicable' || typeof row.na_rationale === 'string' && !!row.na_rationale.trim()))
    && native.every(row => row.client_id === pilot.clientId && row.framework_key === pilot.frameworkKey
      && row.framework_version === pilot.frameworkVersion && records.some(record => record.definition_id === row.definition_id
      && record.framework_assessment_id === row.framework_assessment_id && record.status === row.status))
    && validImplementationPosition(position) && position.total === native.length
    && position.denominator === summary.applicable && position.excluded === summary.na
    && counts.addressed === summary.addressed && counts.in_progress === summary.partial
    && counts.needs_attention === summary.gap && counts.not_assessed === summary.notAssessed;
  return mapping.domains.map(domain => {
    const mappedRows = domain.safeguardIds.map(id => native.find(row => row.definition_id === id)).filter(Boolean);
    return {...domain, ...(available ? cisSummary(mappedRows) : {}), rows: available ? mappedRows : [],
      available: !!available, reason: available ? '' : 'Native implementation source unavailable. Reopen the program to refresh its records.'};
  });
}
