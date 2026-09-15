import definitions from './frameworkDefinitions.json';

export const COMPLIANCE_SECTIONS = definitions.frameworks.map(item => ({
  ...item, to: `/compliance/${item.key}`,
}));

// Read finalized records, not the editable onboarding draft. No extra state or
// records are created; the canonical catalog guarantees one item per requirement.
export function complianceNavigation(clientId, baseline, requirements = []) {
  if (!clientId || !baseline?.completed) return [];
  return COMPLIANCE_SECTIONS.filter(section => requirements.some(record =>
    record.client_id === clientId && record.baseline_key === section.key && record.baseline_response === 'applies'
  )).map(section => ({ ...section, id: `${clientId}:${section.key}` }));
}
