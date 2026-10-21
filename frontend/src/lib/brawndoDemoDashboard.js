import {cisExperienceEligible} from './cisExperience';
// Presentation only. OrgContext resolves this object from the authorized client list.
// Gate-only rollback: set this constant to false; no records or history are changed.
export const BRAWNDO_DEMO_DASHBOARD_ENABLED = true;

export function brawndoDemoDashboard(context) {
  return BRAWNDO_DEMO_DASHBOARD_ENABLED && cisExperienceEligible(context) && context.pathname === '/dashboard';
}

// Do not infer enrollment, version or group from a label or a default.
export function brawndoDemoProgram(programs, metadata, clientId) {
  const program = programs.find(value => value.id === `${clientId}:cis-ig1` && value.key === 'cis-ig1');
  const source = metadata?.['cis-ig1'], group = source?.configuration?.implementation_group;
  if (!program || !source?.selected || !source.configured || source.framework?.key !== 'cis-ig1'
    || source.framework.version !== '8.1' || ![1, 2, 3].includes(group) || !source.assessments?.length
    || source.assessments.some(value => value.client_id !== clientId
      || value.framework_key !== 'cis-ig1' || value.framework_version !== '8.1')) return null;
  const position = program.implementation_position;
  if (position && (position.scope?.framework_key !== 'cis-ig1' || position.scope?.catalog_version !== '8.1'
    || position.scope?.configuration?.implementation_group !== group)) return null;
  return {client_id: clientId, program_id: program.id, program_key: `cis-ig${group}`, framework_key: 'cis-ig1',
    program_label: `CIS IG${group}`, scope_label: `CIS Controls v8.1 IG${group}`,
    to: `/compliance/cis-ig1?client_id=${encodeURIComponent(clientId)}`, current: program.implementation_position};
}
