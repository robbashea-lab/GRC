// Presentation only. OrgContext resolves this object from the authorized client list.
// Gate-only rollback: set this constant to false; no records or history are changed.
export const BRAWNDO_DEMO_DASHBOARD_ENABLED = true;

export function brawndoDemoDashboard({workspaceMode, user, currentClientId, currentClient, pathname}) {
  return BRAWNDO_DEMO_DASHBOARD_ENABLED && workspaceMode === 'demo'
    && user?.workspace_mode === 'demo' && !!user.user_id
    && currentClientId === 'demo_brawndo' && currentClient?.client_id === currentClientId
    && !currentClient.archived && !currentClient.archived_at
    && (currentClient.status || 'active') === 'active' && pathname === '/dashboard';
}

// Do not infer enrollment, version or group from a label or a default.
export function brawndoDemoProgram(programs, metadata) {
  const program = programs.find(value => value.id === 'demo_brawndo:cis-ig1' && value.key === 'cis-ig1');
  const source = metadata?.['cis-ig1'];
  if (!program || !source?.selected || !source.configured || source.framework?.key !== 'cis-ig1'
    || source.configuration?.implementation_group !== 1 || !source.assessments?.length
    || source.assessments.some(value => value.client_id !== 'demo_brawndo'
      || value.framework_key !== 'cis-ig1' || value.framework_version !== '8.1')) return null;
  const position=program.implementation_position;
  if(position && (position.scope?.framework_key !== 'cis-ig1' || position.scope?.catalog_version !== '8.1'
    || position.scope?.configuration?.implementation_group !== 1))return null;
  return {client_id:'demo_brawndo', program_id:program.id, program_key:'cis-ig1', framework_key:'cis-ig1',
    program_label:'CIS IG1', scope_label:'CIS Controls v8.1 IG1',
    to:'/compliance/cis-ig1?client_id=demo_brawndo', current:program.implementation_position};
}
