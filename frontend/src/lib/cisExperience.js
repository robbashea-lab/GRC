import {cis} from './frameworks';
import {OPERATOR_ROLES} from './permissions';
import {cisConfiguration} from './cisScope';

const ROLES = [...OPERATOR_ROLES, 'client_readonly', 'client_viewer'];
export const CIS_FRAMEWORK = 'cis-ig1';

export function cisImplementationGroup(client) {
  const settings = client?.framework_settings;
  if (settings !== undefined && (!settings || typeof settings !== 'object' || Array.isArray(settings))) return null;
  const saved = settings?.[CIS_FRAMEWORK];
  if (saved !== undefined && (!saved || typeof saved !== 'object' || Array.isArray(saved))) return null;
  // Native CIS scope defaults legacy enrolled programs to IG1; explicit groups are never downgraded.
  const group = cisConfiguration(client).implementation_group;
  return cis.available_implementation_groups.includes(group) ? group : null;
}

// Enrollment is native configuration, never a company name or an editable onboarding draft.
export function cisClientProgram(client) {
  const group = cisImplementationGroup(client);
  if (!client?.client_id || group === null) return null;
  const programId = `${client.client_id}:${CIS_FRAMEWORK}`;
  if (Object.hasOwn(client, 'cis_program')) {
    const program = client.cis_program;
    if (!program || typeof program !== 'object' || Array.isArray(program) || program.selected !== true
      || program.client_id !== client.client_id || program.program_id !== programId
      || program.framework_key !== CIS_FRAMEWORK || program.version !== cis.version
      || program.implementation_group !== group) return null;
  } else {
    // Compatibility for unprojected internal fixtures; authorized client DTOs publish cis_program.
    const baseline = client.onboarding_baseline;
    if (baseline?.completed !== true || baseline.requirements?.[CIS_FRAMEWORK] !== 'applies') return null;
  }
  return {clientId: client.client_id, programId,
    frameworkKey: CIS_FRAMEWORK, version: cis.version, implementationGroup: group};
}

export function cisActorMode(user, workspaceMode) {
  if (!user?.user_id || !ROLES.includes(user.role)) return false;
  return workspaceMode === 'demo' ? user.workspace_mode === 'demo'
    : workspaceMode === 'standard' && (user.workspace_mode == null || user.workspace_mode === 'standard');
}

// Appearance only. The authorized native controllers retain all read/write permissions.
export function cisIdentityEligible(context) {
  const {user, workspaceMode, currentClientId, currentClient, clients, selectedClientId, routeClientId,
    authLoading, authError, orgLoading, orgError} = context;
  return cisActorMode(user, workspaceMode) && !authLoading && !authError && !orgLoading && !orgError
    && !!currentClientId && currentClient?.client_id === currentClientId
    && ['active', 'onboarding'].includes(currentClient.status) && !currentClient.archived && !currentClient.archived_at
    && Array.isArray(clients) && clients.some(client => client.client_id === currentClientId)
    && selectedClientId === currentClientId && (!routeClientId || routeClientId === currentClientId)
    && (!Object.hasOwn(context, 'loadedClientId') || context.loadedClientId === currentClientId);
}

export const cisExperienceEligible = context => cisIdentityEligible(context) && !!cisClientProgram(context.currentClient);

// Record-free chrome can retain the current authorized client during a background
// refresh. Initial reads still fail without a resolved DTO/list; errors fail closed.
export function cisPresentationEligible(context) {
  const identity={...context,orgLoading:false};
  delete identity.loadedClientId;
  return cisExperienceEligible(identity);
}

export const cisDefinitions = group => cis.available_implementation_groups.includes(group)
  ? cis.requirements.filter(definition => definition.implementation_group <= group) : [];

// Validate the actual selected program and its complete active set, retaining inactive rows separately.
export function cisWorkspaceMatches(data, clientId) {
  const definitions = cisDefinitions(data?.configuration?.implementation_group);
  const ids = definitions.map(definition => definition.id);
  if (!clientId || !ids.length || data?.selected !== true || data.configured !== true
    || data.framework?.key !== CIS_FRAMEWORK || data.framework.version !== cis.version
    || data.implementation_position?.program_id !== `${clientId}:${CIS_FRAMEWORK}`
    || !Array.isArray(data.active_definition_ids) || data.active_definition_ids.length !== ids.length
    || new Set(data.active_definition_ids).size !== ids.length || !ids.every(id => data.active_definition_ids.includes(id))
    || !Array.isArray(data.definitions) || !Array.isArray(data.assessments)
    || data.assessments.some(row => row.client_id !== clientId || row.framework_key !== CIS_FRAMEWORK || row.framework_version !== cis.version)) return false;
  const activeRecords = data.assessments.filter(row => ids.includes(row.definition_id));
  if (new Set(activeRecords.map(row => row.framework_assessment_id)).size !== ids.length) return false;
  return definitions.every(definition => {
    const matches = data.definitions.filter(row => row.id === definition.id);
    const records = activeRecords.filter(row => row.definition_id === definition.id);
    return matches.length === 1 && matches[0].version === cis.version
      && matches[0].implementation_group === definition.implementation_group && records.length === 1
      && typeof records[0].framework_assessment_id === 'string' && !!records[0].framework_assessment_id.trim();
  });
}
