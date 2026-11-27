import {activeDefinitions,frameworkCatalog} from './frameworks';

// Presentation follows the native enrolled scope; this never grants write access.
export function assessmentRolloutEligible({clientId,record,current,ctx,user}) {
  const framework=record?.framework_key,catalog=frameworkCatalog(framework);
  if(!['cis-ig1','soc-2','iso-27001'].includes(framework)||!catalog||!clientId||!user?.user_id
    ||['disabled','inactive'].includes(user.status)||ctx?.programSelected!==true||ctx?.programConfigured!==true
    ||ctx.framework?.key!==framework||ctx.framework?.version!==catalog.version)return false;
  const identity=record.framework_assessment_id;
  if(typeof identity!=='string'||!identity.trim()||record.client_id!==clientId)return false;
  if(![record,current,ctx.current].every(row=>row?.client_id===clientId
    &&row.framework_assessment_id===identity&&row.framework_key===framework
    &&row.framework_version===catalog.version&&row.definition_id===record.definition_id))return false;
  return activeDefinitions(framework,ctx.configuration).some(definition=>definition.id===record.definition_id);
}
