import {cisExperienceEligible, cisClientProgram, cisDefinitions, cisWorkspaceMatches, CIS_FRAMEWORK} from './cisExperience';

export const BRAWNDO_CIS_VISUAL_ENABLED = true;

// Appearance only: authorization and every write remain with the native controllers/server.
export function brawndoCisVisualGate(context) {
  const {trustedDemo, workspaceMode, user, currentClientId, pathname, clientId, frameworkKey, data, loadedScope, error} = context;
  if (!BRAWNDO_CIS_VISUAL_ENABLED || !cisExperienceEligible(context) || error
    || pathname !== '/compliance/cis-ig1' || frameworkKey !== CIS_FRAMEWORK || clientId !== currentClientId
    || (workspaceMode === 'demo' ? trustedDemo !== true : trustedDemo !== false)
    || loadedScope?.clientId !== clientId || loadedScope.frameworkKey !== frameworkKey || loadedScope.userId !== user.user_id
    || loadedScope.role !== user.role || loadedScope.workspaceMode !== workspaceMode
    || loadedScope.userWorkspaceMode !== user.workspace_mode || loadedScope.trustedDemo !== trustedDemo
    || data?.configuration?.implementation_group !== cisClientProgram(context.currentClient).implementationGroup) return false;
  return cisWorkspaceMatches(data, clientId);
}

export function cisVisualRecordMatches(record, context, originKey) {
  const clientId = record?.client_id;
  return !!clientId && typeof record.framework_assessment_id === 'string' && !!record.framework_assessment_id
    && cisDefinitions(context?.configuration?.implementation_group).some(definition => definition.id === record.definition_id)
    && record.framework_key === CIS_FRAMEWORK && record.framework_version === '8.1'
    && context.current?.client_id === clientId && context.current.framework_key === CIS_FRAMEWORK && context.current.framework_version === '8.1'
    && context.current.framework_assessment_id === record.framework_assessment_id && context.current.definition_id === record.definition_id
    && typeof originKey === 'string' && !!originKey && context.visualOrigin?.key === originKey
    && context.visualOrigin.selected === true && context.visualOrigin.configured === true
    && context.visualOrigin.framework?.key === CIS_FRAMEWORK && context.visualOrigin.framework.version === '8.1'
    && context.visualOrigin.programId === `${clientId}:${CIS_FRAMEWORK}`;
}
