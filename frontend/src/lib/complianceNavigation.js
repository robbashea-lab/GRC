import catalog from '@/lib/onboardingCatalog.json';

const labels = { hipaa: 'HIPAA', 'cis-ig1': 'CIS IG1', 'nist-csf-2': 'NIST CSF 2.0', 'iso-27001': 'ISO 27001', cmmc: 'CMMC' };
export const COMPLIANCE_SECTIONS = catalog.requirements.map(item => ({
  key: item.key, name: item.name, label: labels[item.key], to: `/compliance/${item.key}`,
}));

// Read finalized records, not the editable onboarding draft. No extra state or
// records are created; the canonical catalog guarantees one item per requirement.
export function complianceNavigation(clientId, baseline, requirements = []) {
  if (!clientId || !baseline?.completed) return [];
  return COMPLIANCE_SECTIONS.filter(section => requirements.some(record =>
    record.client_id === clientId && record.baseline_key === section.key && record.baseline_response === 'applies'
  )).map(section => ({ ...section, id: `${clientId}:${section.key}` }));
}
