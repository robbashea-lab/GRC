import {cisClientProgram} from '../lib/cisExperience';
import {cisConfiguration,cisAvailableGroups} from '../lib/cisScope';

export function cisProgramProjection(db, client) {
  const settings=client.framework_settings;
  const valid=settings===undefined || settings && typeof settings==='object' && !Array.isArray(settings)
    && (settings['cis-ig1']===undefined || settings['cis-ig1'] && typeof settings['cis-ig1']==='object' && !Array.isArray(settings['cis-ig1']));
  const group=valid ? cisConfiguration(client).implementation_group : null;
  return {client_id:client.client_id,program_id:`${client.client_id}:cis-ig1`,framework_key:'cis-ig1',version:'8.1',
    selected:!!db.requirements?.some(row=>row.client_id===client.client_id && row.baseline_key==='cis-ig1' && row.baseline_response==='applies'),
    implementation_group:cisAvailableGroups().includes(group) ? group : null};
}

// Resolve the saved native enrollment. Request bodies and fictional company names are not capabilities.
export function isCisClient(db, clientId) {
  const client = db.clients?.find(row => row.client_id === clientId);
  if (!client || !['active','onboarding'].includes(client.status) || client.archived || client.archived_at) return false;
  return !!cisClientProgram({...client, cis_program:cisProgramProjection(db,client)});
}
