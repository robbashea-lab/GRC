import {cis} from './frameworks';

export const BRAWNDO_CIS_VISUAL_ENABLED = true;
const CLIENT = 'demo_brawndo', FRAMEWORK = 'cis-ig1';
const nativeIds = cis.requirements.filter(row => row.implementation_group === 1).map(row => row.id);

// Appearance only: authorization and every write remain with the native controllers/server.
export function brawndoCisVisualGate({trustedDemo, workspaceMode, user, authLoading, authError,
  currentClientId, currentClient, clients, orgLoading, orgError, selectedClientId, routeClientId,
  pathname, clientId, frameworkKey, data, loadedScope, error}) {
  if (!BRAWNDO_CIS_VISUAL_ENABLED || trustedDemo !== true || workspaceMode !== 'demo'
    || user?.workspace_mode !== 'demo' || !user.user_id || !user.role || authLoading || authError || orgLoading || orgError || error
    || pathname !== '/compliance/cis-ig1' || frameworkKey !== FRAMEWORK || clientId !== CLIENT
    || currentClientId !== CLIENT || selectedClientId !== CLIENT || routeClientId && routeClientId !== CLIENT
    || currentClient?.client_id !== CLIENT || currentClient.status !== 'active'
    || currentClient.archived || currentClient.archived_at || !clients?.some(client => client.client_id === CLIENT)
    || loadedScope?.clientId !== CLIENT || loadedScope.frameworkKey !== FRAMEWORK || loadedScope.userId !== user.user_id
    || loadedScope.role !== user.role || loadedScope.workspaceMode !== workspaceMode
    || loadedScope.userWorkspaceMode !== user.workspace_mode || loadedScope.trustedDemo !== true
    || data?.selected !== true || data.configured !== true || data.framework?.key !== FRAMEWORK
    || data.framework.version !== '8.1' || data.configuration?.implementation_group !== 1
    || data.implementation_position?.program_id !== `${CLIENT}:${FRAMEWORK}`) return false;
  const activeIds = data.active_definition_ids;
  if (!Array.isArray(activeIds) || activeIds.length !== nativeIds.length || new Set(activeIds).size !== nativeIds.length
    || !nativeIds.every(id => activeIds.includes(id)) || !Array.isArray(data.definitions) || !Array.isArray(data.assessments)) return false;
  const activeRecords=data.assessments.filter(row=>nativeIds.includes(row.definition_id));
  if(new Set(activeRecords.map(row=>row.framework_assessment_id)).size!==nativeIds.length)return false;
  return nativeIds.every(id => {
    const definitions = data.definitions.filter(row => row.id === id);
    const records = data.assessments.filter(row => row.definition_id === id);
    return definitions.length === 1 && definitions[0].version === '8.1' && definitions[0].implementation_group === 1
      && records.length === 1 && records[0].client_id === CLIENT && records[0].framework_key === FRAMEWORK
      && records[0].framework_version === '8.1' && typeof records[0].framework_assessment_id==='string' && !!records[0].framework_assessment_id;
  });
}

export function cisVisualRecordMatches(record, context, originKey) {
  return typeof record?.framework_assessment_id==='string' && !!record.framework_assessment_id
    && nativeIds.includes(record.definition_id) && record.client_id === CLIENT && record.framework_key === FRAMEWORK && record.framework_version === '8.1'
    && context?.configuration?.implementation_group === 1 && context.current?.client_id === CLIENT
    && context.current.framework_key === FRAMEWORK && context.current.framework_version === '8.1'
    && context.current.framework_assessment_id === record.framework_assessment_id && context.current.definition_id === record.definition_id
    && typeof originKey==='string' && !!originKey && context.visualOrigin?.key===originKey
    && context.visualOrigin.selected===true && context.visualOrigin.configured===true
    && context.visualOrigin.framework?.key===FRAMEWORK && context.visualOrigin.framework.version==='8.1'
    && context.visualOrigin.programId===`${CLIENT}:${FRAMEWORK}`;
}
